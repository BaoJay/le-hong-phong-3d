# THPT Lê Hồng Phong 3D Viewer

Web app viewer một trang cho mô hình 3D của trường, xây theo pipeline `SketchUp -> GLB -> Three.js`.

## Stack

- Node.js + npm
- Vite + TypeScript
- Three.js
- `GLTFLoader` + `DRACOLoader`
- `OrbitControls`

## Chạy local

```bash
npm install
npm run dev
```

Build production:

```bash
npm run build
npm run preview
```

## Cấu trúc chính

- `src/config/viewer-config.ts`: cấu hình metadata, model, Draco, ánh sáng và text UI.
- `src/viewer/createViewer.ts`: khởi tạo scene, camera, controls, loader và lifecycle của viewer.
- `src/onboarding/createOnboarding.ts`: màn intro chạy khi mới vào trang, trong lúc tải model 3D.
- `public/onboarding/`: ảnh cho màn intro (logo, mái ngói, gallery, cánh hoa điệp).
- `public/models/LHP100_20260607_pk.glb`: model thật đang được viewer tải.
- `public/models/le-hong-phong-campus-placeholder.glb`: model placeholder được generate tự động sau `npm install`.
- `docs/sketchup-to-glb.md`: checklist để thay model SketchUp thật vào app.

## Màn onboarding

Khi mới vào trang, `src/onboarding/` phủ toàn màn hình và chạy flow giới thiệu
trong lúc file GLB ~18.5 MB đang tải:

1. Bộ đếm năm `1927 → 2027` — **chạy theo tiến trình tải thật**, và chỉ chạm
   2027 khi model đã render xong phía sau. `MIN_RUN_MS` giữ nhịp tối thiểu để
   lần tải từ cache vẫn kịp nhìn thấy.
2. Logo, rồi mở khoá cuộn.
3. Gallery ảnh + headline sáng dần theo từng chữ, mái ngói trôi lên 1:1 với cuộn.
4. Câu hỏi "để lại lời nhắn?" — cả hai nút hiện đều dẫn thẳng vào trang chính
   (chưa có luồng nhắn tin).

Bộ đếm năm chính là thanh tiến trình, nên trong lúc tải bình thường intro
không hiện thêm dòng trạng thái nào. Chỉ khi tải model lỗi thì bộ đếm mới mờ đi,
nhường chỗ cho thông báo lỗi và nút **Thử lại**.

Người dùng luôn có nút **Bỏ qua giới thiệu** (hoặc phím `Esc`). Với
`prefers-reduced-motion: reduce`, intro bỏ phần cuộn và chỉ còn bộ đếm năm tĩnh
cùng nút vào trang.

## Thay model thật

1. Xuất model từ SketchUp ra `GLB`.
2. Tối ưu và nén Draco theo hướng dẫn trong [docs/sketchup-to-glb.md](docs/sketchup-to-glb.md).
3. Đặt file vào `public/models/`.
4. Cập nhật `src` trong [viewer-config.ts](src/config/viewer-config.ts).
5. Nếu cần chỉnh hướng model, sửa `initialRotation` hoặc `initialScale` trong cùng config.
