import type { LoadingProgress } from "./types";

/** Phải khớp với scripts/protect-model.mjs: MAGIC(4) | IV(12) | ciphertext + tag. */
const MAGIC = new TextEncoder().encode("LHP1");
const IV_BYTES = 12;
const CLIENT_HEADER = "X-LHP-Client";

export interface ProtectedModelSource {
  /** URL tới file .bin đã mã hoá. */
  src: string;
  /** Endpoint cấp khoá giải mã. */
  keyEndpoint: string;
  /** Kích thước dự kiến, dùng khi server không trả Content-Length. */
  expectedBytes?: number;
}

export class ModelKeyError extends Error {}

/**
 * Tải model đã mã hoá + khoá song song, giải mã trong bộ nhớ và trả về
 * ArrayBuffer GLB cho `GLTFLoader.parse`. Không có URL nào trỏ tới file GLB thô.
 */
export async function loadProtectedModel(
  source: ProtectedModelSource,
  onProgress?: (progress: LoadingProgress) => void,
): Promise<ArrayBuffer> {
  const [cryptoKey, payload] = await Promise.all([
    fetchKey(source.keyEndpoint),
    fetchWithProgress(source.src, source.expectedBytes, onProgress),
  ]);

  for (let i = 0; i < MAGIC.length; i++) {
    if (payload[i] !== MAGIC[i]) {
      throw new Error("Model file is not in the expected protected format.");
    }
  }

  const iv = payload.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const ciphertext = payload.subarray(MAGIC.length + IV_BYTES);

  try {
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: MAGIC },
      cryptoKey,
      ciphertext,
    );
  } catch {
    throw new ModelKeyError("Model decryption failed (key mismatch or corrupted file).");
  }
}

async function fetchKey(endpoint: string): Promise<CryptoKey> {
  const response = await fetch(endpoint, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { [CLIENT_HEADER]: "1" },
  });
  if (!response.ok) {
    throw new ModelKeyError(`Model key request failed (HTTP ${response.status}).`);
  }

  const { k } = (await response.json()) as { k?: string };
  if (!k) {
    throw new ModelKeyError("Model key response was empty.");
  }

  const raw = Uint8Array.from(atob(k), (c) => c.charCodeAt(0));
  try {
    // extractable = false: khoá không thể export lại từ CryptoKey.
    return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  } finally {
    raw.fill(0);
  }
}

async function fetchWithProgress(
  url: string,
  expectedBytes: number | undefined,
  onProgress?: (progress: LoadingProgress) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`Model request failed (HTTP ${response.status}).`);
  }

  const headerTotal = Number(response.headers.get("content-length") ?? 0);
  const total = headerTotal > 0 ? headerTotal : (expectedBytes ?? 0);

  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    onProgress?.({ loaded: buffer.length, total: buffer.length, progress: 1 });
    return buffer;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.({
      loaded,
      total,
      progress: total > 0 ? Math.min(loaded / total, 1) : null,
    });
  }

  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
