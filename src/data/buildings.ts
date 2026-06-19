export interface Building {
  id: string;
  label: string;
  title: string;
  description: string;
  meta: { label: string; value: string }[];
  center: [number, number, number];
  labelId: string;
  labelPos: [number, number, number];
}

export const BUILDINGS: readonly Building[] = [
  {
    id: "khu-a",
    label: "Khu A",
    title: "Dãy nhà A",
    description:
      "Dãy nhà chính của khu vực phía tây, là nơi diễn ra nhiều hoạt động học tập và sinh hoạt trọng yếu của nhà trường qua suốt 100 năm lịch sử.",
    meta: [
      { label: "Xây dựng", value: "1927" },
      { label: "Diện tích", value: "~2.400 m²" },
      { label: "Số tầng", value: "3 tầng" },
      { label: "Phòng học", value: "18 phòng" },
    ],
    center: [-8.2, 3.4, -1.2],
    labelId: "label-khu-a",
    labelPos: [-8.2, 5.8, -1.2],
  },
  {
    id: "khu-b-top",
    label: "Khu B",
    title: "Dãy nhà B",
    description:
      "Khu vực trung tâm của khuôn viên, bao gồm hội trường lớn và các phòng chức năng phục vụ hoạt động văn hóa, ngoại khóa và hội họp của nhà trường.",
    meta: [
      { label: "Xây dựng", value: "1935" },
      { label: "Diện tích", value: "~1.800 m²" },
      { label: "Sức chứa", value: "800 người" },
      { label: "Chức năng", value: "Hội trường" },
    ],
    center: [0, 4.9, 0.35],
    labelId: "label-khu-b-top",
    labelPos: [0, 6.4, 0.35],
  },
  {
    id: "khu-e",
    label: "Khu E",
    title: "Dãy nhà E",
    description:
      "Khu vực thực hành và thí nghiệm hiện đại, được đầu tư trang thiết bị tiên tiến phục vụ các môn khoa học tự nhiên và chuyên sâu của trường chuyên.",
    meta: [
      { label: "Xây dựng", value: "1998" },
      { label: "Diện tích", value: "~1.200 m²" },
      { label: "Phòng lab", value: "8 phòng" },
      { label: "Số tầng", value: "4 tầng" },
    ],
    center: [8.2, 3.4, -1.2],
    labelId: "label-khu-e",
    labelPos: [8.2, 5.8, -1.2],
  },
  {
    id: "khu-b-bottom",
    label: "Khu B",
    title: "Sảnh & Sân trong",
    description:
      "Khu vực sảnh chính và sân trong nối liền các dãy nhà, là không gian sinh hoạt cộng đồng quan trọng của học sinh và giáo viên.",
    meta: [
      { label: "Diện tích", value: "~3.600 m²" },
      { label: "Chức năng", value: "Sân sinh hoạt" },
      { label: "Cây xanh", value: "Hơn 40 cây" },
      { label: "Năm tu sửa", value: "2010" },
    ],
    center: [0, 1.7, 4.0],
    labelId: "label-khu-b-bottom",
    labelPos: [0, 3.4, 4.0],
  },
];
