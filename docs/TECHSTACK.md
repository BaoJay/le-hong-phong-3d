# Tech Stack — 100LHP 3D Viewer

Static web app hiển thị model 3D trường THPT Lê Hồng Phong. **Vanilla TypeScript + Three.js, build bằng Vite, deploy Vercel. Không backend, không UI framework.**

## Stack

| Lớp | Công nghệ | Phiên bản |
|---|---|---|
| Runtime | Node.js + npm | ≥ 20 |
| Ngôn ngữ | TypeScript (`strict`, `noUnusedLocals/Parameters`) | ^5.9 |
| Build | Vite | ^7.1 |
| 3D | Three.js: `GLTFLoader`, `DRACOLoader`, `OrbitControls`, `BufferGeometryUtils` | ^0.179 |
| UI / CSS | Vanilla DOM + CSS thuần, mỗi module một file `.css` | — |
| Va chạm (walk mode) | `three-mesh-bvh` (tải lười khi bấm nút đi bộ) | ^0.10 |
| Analytics | `@vercel/analytics` | ^2.0 |
| Nén model | `@gltf-transform/cli` (dev) | ^4.5 |

## Pipeline model

```
SketchUp → GLB → gltf-transform optimize --compress draco → public/models/LHP100_20261005-draco.glb (7.4 MB)
```

- Decoder Draco (WASM) được copy từ `three` vào `public/draco/` bằng `npm run sync:draco`, tự chạy ở `postinstall`.
- Đường dẫn model, ánh sáng, camera, xoay/scale: `src/config/viewer-config.ts`.
- Checklist export: `docs/sketchup-to-glb.md`.

## Cấu trúc

```
src/main.ts           entry
src/viewer/           scene, renderer, loader (createViewer.ts)
src/onboarding/       intro chạy theo tiến trình tải model
src/walk/             chế độ đi bộ góc nhìn thứ nhất (docs/walk-mode.md)
src/config/ data/ ui/ utils/
src/coming-soon/      trang tạm
public/models/ draco/ onboarding/
scripts/              sync-draco.mjs, generate-placeholder-model.mjs
```

## Lệnh

| Lệnh | Tác dụng |
|---|---|
| `npm install` | Cài + sync Draco + sinh model placeholder |
| `npm run dev` | Dev server (`host: true`, test được trên điện thoại cùng LAN) |
| `npm run build` / `preview` | Build ra `dist/` / chạy thử bản build |

## Deploy

| Branch | Nội dung |
|---|---|
| `master` | Bản đầy đủ |
| `preview` | `VITE_SITE_MODE=coming-soon` (trong `.env`): Vite plugin thay `index.html` bằng `coming-soon.html`, không bundle viewer |

Quy trình: `feat/*` → PR → `master`.

## Kỹ thuật render đáng chú ý

- Shadow: `PCFSoftShadowMap`, `autoUpdate = false` (chỉ cập nhật khi cần), frustum ôm sát bounds model để tránh shadow acne.
- Giới hạn `pixelRatio` cho mobile; `SRGBColorSpace`.
- Intro tôn trọng `prefers-reduced-motion`, có nút Bỏ qua / phím `Esc`.

## Chưa có

Test tự động, ESLint/Prettier, LOD cho model, backend (nút "để lại lời nhắn" chưa nối đi đâu). Kiểm tra trước merge: `npm run build` + test tay desktop/mobile.
