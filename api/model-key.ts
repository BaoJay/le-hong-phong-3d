/**
 * Vercel Function: GET /api/model-key
 * Trả khoá giải mã model cho đúng site viewer. Xem `api/_model-key.ts`.
 * Cần biến môi trường MODEL_KEY trên Vercel (Project → Settings → Environment Variables).
 */
import { handleModelKeyRequest } from "./_model-key.js";

const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

export function GET(request: Request): Response {
  return handleModelKeyRequest(request, {
    MODEL_KEY: env.MODEL_KEY,
    MODEL_ALLOWED_HOSTS: env.MODEL_ALLOWED_HOSTS,
  });
}
