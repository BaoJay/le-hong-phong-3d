# SketchUp -> GLB -> Three.js

Checklist này dành cho lúc thay model placeholder bằng mô hình thật của THPT Lê Hồng Phong.

## 1. Dọn file SketchUp trước khi export

- Xóa geometry thừa, mặt trong công trình không cần thiết, cây cối hoặc chi tiết lặp quá dày.
- Gom component hợp lý để số draw call thấp hơn khi sang web.
- Chuẩn hóa đơn vị đo trong SketchUp để scale không bị lệch khi xuất.
- Kiểm tra lại hướng mặt tiền và cao độ nền để sau export không phải xoay quá nhiều trong app.

## 2. Xuất sang GLB

- Ưu tiên export thẳng sang `GLB` nếu plugin/workflow hiện tại của bạn hỗ trợ ổn định.
- Nếu exporter ra `GLTF + texture`, hãy gom asset đầy đủ rồi convert sang `GLB` ở bước kế tiếp.
- Sau export, mở thử file trong một viewer glTF bất kỳ để xác nhận:
  - model không bị thiếu texture,
  - hướng camera hợp lý,
  - scale không bị quá lớn hoặc quá nhỏ.

## 3. Nén Draco

Ví dụ với glTF Transform CLI:

```bash
npm install -D @gltf-transform/cli
npx gltf-transform optimize school.glb school-draco.glb --compress draco
```

Nếu model quá nặng, nên giảm polygon hoặc bỏ bớt chi tiết ngay từ file nguồn trước khi nén.

## 4. Đưa vào app

- Copy file tối ưu cuối cùng vào `public/models/`.
- Sửa `src` trong [viewer-config.ts](/home/baojay/le-hong-phong-3d/src/config/viewer-config.ts) để trỏ đúng file mới.
- Nếu model bị xoay hoặc lật, chỉnh `initialRotation`.
- Nếu model lệch kích thước mong muốn, chỉnh `initialScale`.

## 5. Kiểm tra trước khi deploy

- Chạy `npm run dev` để xem loading progress, lỗi asset, và trải nghiệm orbit trên desktop/mobile.
- Chạy `npm run build` để xác nhận static build thành công.
- Kiểm tra thư mục `public/draco/` đã có decoder files trước khi deploy model nén Draco.
