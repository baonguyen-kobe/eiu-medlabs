import type { EquipmentRequestStatus } from "@/lib/equipment-requests";

export type ScheduleEvent = {
  id: string;
  type: "class" | "shift";
  date: string;
  start: string;
  end: string;
  title: string;
  subtitle: string;
  room?: string;
  roomId?: string;
  person?: string;
  personId?: string;
  personIds?: string[];
  status: "published" | "draft" | "cancelled" | "completed" | "scheduled";
  assigned?: boolean;
  source?: "manual" | "import";
  note?: string;
  owned?: boolean;
  studentCount?: number;
  roomTypeId?: string;
  basicMedicalRegistrationId?: string;
  equipmentRequest?: { id: string; status: EquipmentRequestStatus };
};

export const demoEvents: ScheduleEvent[] = [
  {
    id: "cls-1",
    type: "class",
    date: "2026-07-27",
    start: "07:30",
    end: "11:30",
    title: "NUR 101",
    subtitle: "Thăm khám thể chất",
    room: "105.B5",
    person: "Nguyễn Ngọc Diễm",
    status: "published",
    assigned: true,
    source: "import",
  },
  {
    id: "shift-1",
    type: "shift",
    date: "2026-07-27",
    start: "08:30",
    end: "11:30",
    title: "Ca trực kho",
    subtitle: "Ca sáng",
    person: "Nguyễn Bảo",
    status: "scheduled",
  },
  {
    id: "cls-2",
    type: "class",
    date: "2026-07-28",
    start: "13:30",
    end: "16:30",
    title: "NUR 205",
    subtitle: "Điều dưỡng nội khoa",
    room: "201.A2",
    status: "published",
    assigned: false,
    source: "manual",
  },
  {
    id: "cls-3",
    type: "class",
    date: "2026-07-29",
    start: "08:00",
    end: "10:00",
    title: "PHA 110",
    subtitle: "Dược lý cơ bản",
    room: "LAB-3.C1",
    person: "Trần Minh Anh",
    status: "draft",
    assigned: true,
    source: "manual",
  },
  {
    id: "shift-2",
    type: "shift",
    date: "2026-07-30",
    start: "13:30",
    end: "16:30",
    title: "Ca trực kho",
    subtitle: "Ca chiều",
    person: "Lê Thu Hà",
    status: "scheduled",
  },
  {
    id: "cls-4",
    type: "class",
    date: "2026-07-31",
    start: "07:30",
    end: "09:30",
    title: "NUR 101",
    subtitle: "Thăm khám thể chất",
    room: "105.B5",
    status: "published",
    assigned: false,
    source: "import",
    note: "Ưu tiên giảng viên có kinh nghiệm phòng mô phỏng.",
  },
  {
    id: "cls-5",
    type: "class",
    date: "2026-08-01",
    start: "09:30",
    end: "11:30",
    title: "NUR 205",
    subtitle: "Điều dưỡng nội khoa",
    room: "201.A2",
    person: "Phạm Hải Yến",
    status: "published",
    assigned: true,
    source: "manual",
  },
];

export const weekDays = [
  { date: "2026-07-27", weekday: "Thứ Hai", day: "27" },
  { date: "2026-07-28", weekday: "Thứ Ba", day: "28" },
  { date: "2026-07-29", weekday: "Thứ Tư", day: "29" },
  { date: "2026-07-30", weekday: "Thứ Năm", day: "30" },
  { date: "2026-07-31", weekday: "Thứ Sáu", day: "31", today: true },
  { date: "2026-08-01", weekday: "Thứ Bảy", day: "01" },
  { date: "2026-08-02", weekday: "Chủ nhật", day: "02", sunday: true },
];
