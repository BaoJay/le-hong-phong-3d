# Chế độ đi bộ (góc nhìn thứ nhất) — prototype tuần 1

Nút **người đi bộ** (nút đen, trên cùng cụm nút bên phải ở chế độ khám phá) đưa
camera bay từ góc nhìn toàn cảnh xuống tầm mắt 1.62 m, rồi cho người xem đi bộ
trong khuôn viên. Chế độ quỹ đạo cũ giữ nguyên; đi bộ chỉ là một lớp bật thêm.

## Điều khiển

| | Desktop | Điện thoại / tablet |
|---|---|---|
| Di chuyển | `W A S D` hoặc phím mũi tên | Kéo nửa trái màn hình (joystick ảo) |
| Nhìn | Chuột (khoá con trỏ sau khi bấm **Bắt đầu**) | Kéo nửa phải màn hình |
| Đi nhanh | Giữ `Shift` | — |
| Về điểm xuất phát | `R` | — |
| Tạm dừng / rời khỏi | `Esc` (lần 1 tạm dừng, lần 2 rời khỏi) | Nút **Rời khỏi** |

Nếu trình duyệt không cho khoá con trỏ (ví dụ trang bị nhúng trong iframe), chuột
tự chuyển sang kiểu giữ-và-kéo để nhìn.

## Chỉnh điểm xuất phát và cảm giác di chuyển

Toàn bộ tham số nằm ở `walk` trong `src/config/viewer-config.ts`:

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `spawn` | `[50, 0, -80]` | Điểm xuất phát (m). Chân được đặt xuống sàn gần nhất bên dưới `y + 2 m`. |
| `spawnLookAt` | `[47, 1.6, -45]` | Điểm nhìn về lúc xuất phát. |
| `height` / `radius` / `eyeHeight` | 1.75 / 0.3 / 1.62 | Kích thước capsule người chơi. Bậc thấp hơn ~0.3 m tự bước lên được. |
| `walkSpeed` / `runSpeed` | 2.4 / 5 m/s | Tốc độ đi / đi nhanh. |
| `gravity` | -20 | Trọng lực (đặt mạnh hơn thực tế để bớt cảm giác "lơ lửng"). |
| `stepDown` | 0.45 | Hụt chân tối đa vẫn bám xuống bậc khi xuống cầu thang. |
| `near` / `far` | 0.05 / 1500 | Camera ở tầm mắt; `near` nhỏ để không xén tường khi đứng sát. |
| `fog` | 40 → 320 m | Sương mù ở tầm mắt. |
| `transitionSeconds` | 1.6 | Thời gian bay camera (bằng 0 khi bật `prefers-reduced-motion`). |

**Lấy toạ độ ngay trong model:** mở trang với `?walkdebug` (ví dụ
`http://localhost:5173/?walkdebug`). Góc trái dưới hiện toạ độ chân và hướng
nhìn. Nhấn `C` để chép một dòng `spawn: [...], spawnLookAt: [...]` dán thẳng vào
config. Cách này cũng dùng để đánh dấu vị trí đặt vật phẩm và câu đố ở tuần sau.

## Sân thử (sandbox)

`npm run dev` rồi mở `/walk-test.html`: một level dựng bằng code gồm cầu thang
12 bậc (cao 0.17, sâu 0.3), bậc thềm 0.15 m, bục 0.5 m, dốc 12° và dốc 50°,
hành lang và hàng cột. Trang này dùng để chỉnh cảm giác di chuyển mà không cần
model thật hay `MODEL_KEY`, và không nằm trong bản build production.

Kết quả kiểm tra tự động trên sandbox:

| Tình huống | Kết quả |
|---|---|
| Lên / xuống cầu thang 12 bậc | Lên tới sàn 2.04 m; xuống mượt, không nhảy cóc |
| Bậc 0.15 m / bục 0.5 m | Bước lên được / bị chặn lại |
| Dốc 12° / dốc 50° | Đi lên được / trượt xuống, không leo được |
| Tường, biên khuôn viên | Chặn đúng, không xuyên |

## Kiến trúc

```
src/walk/
  collider.ts         gộp mesh của model thành 1 geometry world-space + mặt đất, dựng BVH
  walk-controller.ts  vật lý capsule: trọng lực, đẩy ra khỏi tam giác, bước bậc, giới hạn dốc
  walk-input.ts       bàn phím, pointer lock, joystick ảo, kéo-để-nhìn → WalkInputSource
  walk-hud.ts/.css    HUD: thẻ hướng dẫn / tạm dừng, tâm ngắm, nút rời khỏi, debug
  walk-session.ts     vòng đời: dựng va chạm (lần đầu), bay camera vào/ra, đổi near/far/fog
  sandbox.ts          level thử cho walk-test.html
```

- `createViewer` chỉ giữ một `WalkSession` và nhường camera cho nó khi đang đi bộ.
  `OrbitControls` bị tắt, nhãn toà nhà và click chọn toà nhà tạm ngưng.
- **Tải lười:** `walk-hud` và `walk-session` (kèm `three-mesh-bvh`) chỉ được tải khi
  bấm nút lần đầu, nên lần tải trang ban đầu chỉ tăng khoảng 2 KB gzip. Module đi
  bộ nặng khoảng 21 KB gzip.
- Va chạm dùng **bản sao** geometry (chỉ `position`) nên không đụng tới mesh hiển
  thị. BVH dựng một lần, giữ lại cho các lần vào sau, và bỏ đi khi model tải lại.
- Vật lý chia mỗi frame thành 5 bước con và chấp nhận frame dài tới 0.1 s, để máy
  yếu (~20 fps) không bị đi chậm lại mà vẫn không xuyên tường.

## Cần kiểm tra với model thật

Môi trường phát triển prototype không có `MODEL_KEY`, nên mới kiểm tra trên
sandbox và model placeholder. Khi chạy với model thật, cần xem:

1. **Điểm xuất phát:** `[50, 0, -80]` có đúng là giữa sân khu A không. Dùng `?walkdebug` để chỉnh.
2. **Thời gian dựng BVH** lần đầu vào chế độ đi bộ (HUD hiện "Đang chuẩn bị lối
   đi…"), nhất là trên điện thoại. Nếu quá 1–2 giây thì chuyển sang dựng trong Web
   Worker, hoặc dựng sẵn lúc build rồi serialize (`MeshBVH.serialize`).
3. **Cầu thang trong model SketchUp:** nếu bậc cao hơn ~0.3 m hoặc là khối đặc
   không có mặt bậc, người chơi sẽ bị chặn. Cách xử lý: thêm một mặt dốc vô hình
   cho va chạm.
4. **Vật thể chắn đường:** cây, kính, lan can, cửa đang đóng đều chặn người chơi
   vì mọi mesh hiển thị đều tham gia va chạm. Tuần 2 sẽ thêm quy ước đặt tên
   (`NOCOL_` để bỏ va chạm, `COL_` cho mesh va chạm vô hình) trong SketchUp/Blender.

## Bước tiếp theo (tuần 2)

- Hệ thống tương tác: tia từ tâm ngắm, gợi ý "Nhấn E để xem", nhặt vật phẩm.
- Túi đồ, trạng thái câu đố, lưu tiến độ (`localStorage`).
- Quy ước đặt tên mesh cho va chạm (`COL_` / `NOCOL_`) và trigger vùng (`TRG_`).
