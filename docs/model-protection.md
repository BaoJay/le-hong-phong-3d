# Bảo vệ model 3D

Trình duyệt bắt buộc phải nhận geometry để render, nên **không có cách chặn tuyệt đối**.
Mục tiêu: không còn file `.glb` nào tải được bằng F12, khoá không nằm trong source,
và model bị lấy cắp vẫn truy được nguồn gốc.

## Các lớp

| Lớp | Làm gì | Ở đâu |
|---|---|---|
| 4. Làm sạch metadata | Xoá tên node/mesh/material/texture + extras, nhúng `asset.copyright` và fingerprint. Chunk BIN (Draco, texture) **giữ nguyên từng byte** – không nén lại để tránh mất tam giác. | `scripts/protect-model.mjs` |
| 1. Mã hoá | AES-256-GCM → `public/m/<hash>.bin`. Không còn header `glTF`, Blender/viewer GLB không mở được. | `scripts/protect-model.mjs` |
| 2. Cấp khoá có kiểm soát | `GET /api/model-key` chỉ trả khoá khi request cùng origin, có header `X-LHP-Client`, chưa vượt 20 lần/phút/IP. `Cache-Control: no-store`. | `api/model-key.ts`, `api/_model-key.ts` |
| Client | Tải `.bin` + khoá song song, giải mã bằng WebCrypto (khoá `extractable: false`), đưa ArrayBuffer vào `GLTFLoader.parseAsync`. | `src/viewer/protected-model.ts` |

## Cập nhật model mới

```bash
# 1. Đặt file GLB gốc vào models-src/ (thư mục bị .gitignore, KHÔNG commit)
# 2. Lần đầu trên máy mới: copy MODEL_KEY của team vào .env.local
#    (hoặc tạo khoá mới: npm run protect:model -- --gen-key → phải cập nhật lại Vercel)
npm run protect:model -- models-src/<ten-file>.glb
# 3. Commit public/m/<hash>.bin + src/config/model-asset.ts
```

Script tự xoá file `.bin` cũ và in ra fingerprint của bản build. Lưu fingerprint lại
để làm bằng chứng nếu model bị dùng lại trái phép.

## Cấu hình Vercel (bắt buộc)

Project → Settings → Environment Variables:

- `MODEL_KEY` – đúng giá trị trong `.env.local` (Production + Preview).
- `MODEL_ALLOWED_HOSTS` *(tuỳ chọn)* – thêm host được phép, cách nhau bởi dấu phẩy.
  Mặc định chỉ chấp nhận chính host đang phục vụ request.

Thiếu `MODEL_KEY` thì API trả 500 và viewer hiện thông báo lỗi xác thực.

## Giới hạn cần biết

- Người rành kỹ thuật vẫn lấy được dữ liệu, ví dụ đặt breakpoint sau bước giải mã
  hoặc chụp WebGL buffer. Các lớp trên chặn việc tải file thông thường, không chặn
  được người quyết tâm.
- `curl` giả header `Origin` vẫn lấy được khoá. Muốn chặt hơn có thể thêm Vercel
  Firewall/BotID cho route `/api/model-key`, hoặc chuyển sang streaming 3D Tiles.
- Rate limit lưu trong bộ nhớ của từng instance function, chỉ có tác dụng giảm
  spam, không phải giới hạn toàn cục.
- Lịch sử git vẫn còn các file `.glb` cũ trong `public/models/`. Nếu repo public,
  cần chuyển sang private hoặc xoá khỏi lịch sử bằng `git filter-repo`
  (rewrite + force-push mọi branch).
