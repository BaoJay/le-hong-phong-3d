/**
 * Logic cấp khoá giải mã model (lớp 2). Dùng chung cho Vercel Function
 * (`api/model-key.ts`) và middleware dev server trong `vite.config.ts`.
 * File bắt đầu bằng `_` nên Vercel không biến nó thành một route.
 *
 * Khoá chỉ được trả khi request:
 *   - là GET, đến từ chính site (Origin/Referer cùng host, Sec-Fetch-Site same-origin),
 *   - có header `X-LHP-Client` (buộc trình duyệt ở site khác phải qua CORS preflight – bị từ chối),
 *   - chưa vượt giới hạn tần suất theo IP.
 * Response luôn `no-store` để không bị cache ở CDN hay trình duyệt.
 */

export const CLIENT_HEADER = "x-lhp-client";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const hits = new Map<string, { count: number; resetAt: number }>();

export interface ModelKeyEnv {
  MODEL_KEY?: string;
  /** Danh sách host được phép thêm, cách nhau bởi dấu phẩy (vd. domain riêng). */
  MODEL_ALLOWED_HOSTS?: string;
}

export function handleModelKeyRequest(request: Request, env: ModelKeyEnv): Response {
  if (request.method !== "GET") {
    return deny(405, "method_not_allowed");
  }

  const key = env.MODEL_KEY?.trim();
  if (!key) {
    return deny(500, "not_configured");
  }

  if (!request.headers.get(CLIENT_HEADER)) {
    return deny(403, "forbidden");
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    return deny(403, "forbidden");
  }

  const requestHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  const allowedHosts = new Set(
    [requestHost, ...(env.MODEL_ALLOWED_HOSTS ?? "").split(",")]
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
  const callerHost = hostOf(request.headers.get("origin")) ?? hostOf(request.headers.get("referer"));
  if (!callerHost || !allowedHosts.has(callerHost)) {
    return deny(403, "forbidden");
  }

  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown";
  if (isRateLimited(ip)) {
    return deny(429, "too_many_requests", { "retry-after": "60" });
  }

  return new Response(JSON.stringify({ k: key }), {
    status: 200,
    headers: {
      ...securityHeaders(),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function securityHeaders(): Record<string, string> {
  return {
    "cache-control": "no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "x-robots-tag": "noindex",
    vary: "origin, referer",
  };
}

function deny(status: number, code: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...securityHeaders(), ...extra, "content-type": "application/json; charset=utf-8" },
  });
}
