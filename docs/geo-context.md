# Bản đồ nền, LOD1 và zoom theo mức web map

Viewer quy đổi khoảng cách camera ra mức zoom kiểu web map (tile 512 px, cùng
định nghĩa với MapLibre/Mapbox) và đổi lớp hiển thị theo mức đó:

| Zoom | Hiển thị |
|---|---|
| z13 – z15.5 | basemap + khối LOD1 (cả khối của trường), GLB ẩn hẳn |
| z15.5 – z16 | khối LOD1 của trường mờ dần, GLB hiện dần (alpha hash) |
| z16 – z17 | GLB rõ; khối LOD1 xung quanh mờ dần về 30% |
| z17 – z20.5 | GLB + LOD1 xung quanh dạng ghost |

Các mốc nằm trong `zoom` của [viewer-config.ts](../src/config/viewer-config.ts).
Ô nhỏ dưới nút zoom hiện mức zoom hiện tại để kiểm tra.

## CRS của dữ liệu

- **Tile Allmaps** (`https://allmaps.xyz/{z}/{x}/{y}.png?url=…`) là tile XYZ chuẩn
  Web Mercator **EPSG:3857**, 256 px, đánh số kiểu Google/OSM. Allmaps warp ảnh
  scan theo annotation ngay khi phục vụ tile.
- **Annotation** (`maparchive.vn/api/maps/<id>/annotation`) là IIIF Georeference
  Annotation: các điểm khống chế (GCP) nối pixel trên ảnh scan với toạ độ
  **WGS84 / EPSG:4326** (lon, lat).
- **Trong app**, mọi lớp được đưa về mặt phẳng tiếp tuyến cục bộ (ENU, mét) đặt
  gốc tại trường, theo bán kính cong ellipsoid WGS84. Không dùng thẳng mét
  EPSG:3857: ở vĩ độ 10,76° mét Mercator lớn hơn mét thật khoảng 1,8%.

## 1. Gắn model vào toạ độ thật (bắt buộc làm trước)

File SketchUp không bật Geo-location, nên vị trí, hướng bắc và tỉ lệ của model
đang là **ước lượng** (`geo.estimate` trong config):

- `metersPerUnit: 0.1` giả định file export theo mm trong khi node scale 0.01
  coi đó là cm. Với giả định này mái ngói cao ~5–12 m, cây ~19 m và khuôn viên
  ~190 × 250 m; vẫn phải kiểm chứng lại.
- Toạ độ trường lệch có thể tới ±200 m, hướng bắc chưa kiểm chứng.

Cách hiệu chỉnh bằng điểm khống chế (giống QGIS Georeferencer):

1. `npm run dev`, mở `http://localhost:5173/?calibrate`.
2. Zoom gần (≥ z17), click vào một điểm dễ nhận ra trên model, ví dụ góc
   tường rào hay góc một dãy nhà. Bảng góc trái dưới (và console) in ra
   `{ model: [x, z], lngLat: [LON, LAT] }`.
3. Tìm đúng điểm đó trên Google Maps (chuột phải → toạ độ) hoặc QGIS, rồi thay
   `LON, LAT` bằng toạ độ thật. Lưu ý Google Maps hiện `lat, lon`.
4. Lặp lại cho **3–4 điểm** cách xa nhau, trải ra các góc khuôn viên, rồi thêm
   vào `geo.controlPoints`.
5. Tải lại trang. Console in dòng `[geo] controlPoints: … m/đơn vị, xoay …°,
   sai số GCP …`. Sai số dưới ~1–2 m là tốt; điểm nào lệch hẳn thì kiểm tra lại
   điểm đó.

Từ 2 điểm trở lên, viewer giải phép biến đổi đồng dạng (tịnh tiến, xoay, tỉ lệ)
bằng bình phương tối thiểu và bỏ qua `estimate`. Có ≥ 3 điểm thì mới tính được
sai số dư để kiểm tra.

Sau khi hiệu chỉnh xong:

- Cập nhật `center` trong `data/context/context.json` bằng toạ độ tâm trường
  vừa có, rồi chạy lại hai script ở bước 2.
- Chỉnh `zoom.initial` nếu khung nhìn mở đầu đổi quá nhiều. Giá trị 18 hiện tại
  khớp với khung nhìn cũ khi `metersPerUnit = 0.1`.
- Kiểm tra nhãn `CAMPUS_LABEL` trong `src/data/buildings.ts` vẫn nằm giữa khuôn viên.

## 2. Tải dữ liệu nền (chạy ở máy có mạng)

```bash
npm run fetch:basemaps                 # 5 basemap trong data/context/context.json
npm run fetch:basemaps -- --only now   # chỉ bản đồ hiện tại
npm run fetch:buildings                # building OSM bán kính 500 m
```

- `fetch:basemaps` tải tile trong vùng ±1 km quanh `center`, ghép và cắt đúng
  bbox, rồi ghi `public/context/basemap-<id>.webp` (~3400 px, ~0,59 m/px) và
  `public/context/basemaps.json` (bounds WGS84 tính lại theo mép pixel). Thứ
  tự 4 bản đồ lịch sử được gán theo danh sách 1923 → 1942 → 1959 → 1968; nếu
  sai tấm nào thì sửa `id/label/year` trong `context.json`.
- Bản đồ hiện tại lấy từ CARTO Positron (dữ liệu OSM). Script chỉ tải một lần
  khoảng 64 tile; attribution hiện ở góc phải dưới màn hình.
- `fetch:buildings` gọi Overpass, ước chiều cao (`height` → `building:levels`
  × 3,2 m → để trống) và đánh dấu `is_school` cho khối nằm trong polygon
  `amenity=school` có tên chứa `schoolName`.
- Xem thử basemap khác: `?basemap=1923`, `?basemap=1968`…

Thiếu file nào thì viewer bỏ qua lớp đó và vẫn chạy như cũ.

## 3. Sửa khối LOD1 trong QGIS

Mở `public/context/blocks.geojson` (EPSG:4326) trong QGIS, sửa xong thì lưu
lại dạng GeoJSON, giữ WGS84. Các trường mà viewer đọc:

| Trường | Ý nghĩa |
|---|---|
| `height` | chiều cao đỉnh khối (m). Trống thì dùng `context.defaultBlockHeight` (9 m) |
| `min_height` | cao độ đáy khối (m), mặc định 0 |
| `is_school` | `true` cho khối thuộc trường: ẩn khi GLB hiện |
| `height_source` | `osm:height`, `osm:levels`, `default`, `estimated`, `survey`… (chỉ để theo dõi) |
| `first_seen`, `last_seen` | năm tấm bản đồ đầu/cuối còn thấy khối, dành cho timeline ở phase 2 |

Nên chạy *Vector → Geometry Tools → Check Validity* trước khi lưu. Polygon tự
cắt sẽ bị tam giác hoá sai.

## Mặt phẳng nền tạm trong GLB

Mesh `Mesh80` chứa phần lớn công trình (gltf-transform đã gộp các vật liệu màu
trơn thành một palette), nên không bỏ cả mesh được. Viewer chỉ xoá 278 tam giác
dùng màu palette của mặt phẳng tạm (`model.removeFaces`). Khi xoá mặt phẳng
trong SketchUp và export lại, hãy **bỏ entry `removeFaces`**: ở lần export sau,
màu palette đó có thể được gán cho vật thể khác.
