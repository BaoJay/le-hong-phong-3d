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
- `public/models/le-hong-phong-campus-placeholder.glb`: model mẫu được generate tự động sau `npm install`.
- `docs/sketchup-to-glb.md`: checklist để thay model SketchUp thật vào app.

## Thay model thật

1. Xuất model từ SketchUp ra `GLB`.
2. Tối ưu và nén Draco theo hướng dẫn trong [docs/sketchup-to-glb.md](/home/baojay/le-hong-phong-3d/docs/sketchup-to-glb.md).
3. Đặt file vào `public/models/`.
4. Cập nhật `src` trong [viewer-config.ts](/home/baojay/le-hong-phong-3d/src/config/viewer-config.ts).
5. Nếu cần chỉnh hướng model, sửa `initialRotation` hoặc `initialScale` trong cùng config.

