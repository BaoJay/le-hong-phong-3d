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
    center: [47, 0, -45],
    labelId: "label-khu-a",
    labelPos: [47, 0, -45],
  },
  {
    id: "khu-b",
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
    center: [110, 5, -25],
    labelId: "label-khu-b",
    labelPos: [110, 5, -25],
  },
  {
    id: "khu-c",
    label: "Khu C",
    title: "Dãy nhà C",
    description:
      "Khu vực thực hành và thí nghiệm hiện đại, được đầu tư trang thiết bị tiên tiến phục vụ các môn khoa học tự nhiên và chuyên sâu của trường chuyên.",
    meta: [
      { label: "Xây dựng", value: "1998" },
      { label: "Diện tích", value: "~1.200 m²" },
      { label: "Phòng lab", value: "8 phòng" },
      { label: "Số tầng", value: "4 tầng" },
    ],
    center: [0, 5, -150],
    labelId: "label-khu-c",
    labelPos: [0, 5, -150],
  },
  {
    id: "khu-d",
    label: "Khu D",
    title: "Dãy nhà D",
    description:
      "Khu vực sảnh chính và sân trong nối liền các dãy nhà, là không gian sinh hoạt cộng đồng quan trọng của học sinh và giáo viên.",
    meta: [
      { label: "Diện tích", value: "~3.600 m²" },
      { label: "Chức năng", value: "Sân sinh hoạt" },
      { label: "Cây xanh", value: "Hơn 40 cây" },
      { label: "Năm tu sửa", value: "2010" },
    ],
    center: [47, 0, -120],
    labelId: "label-khu-d",
    labelPos: [47, 0, -120],
  },
];
