# MedLabs Calendar — AI Review Brief

Tài liệu này giúp reviewer hiểu nhanh hệ thống mà không cần lịch sử trao đổi.

## 1. Mục tiêu

MedLabs Calendar là web app nội bộ quản lý hai quy trình độc lập:

1. Lịch học và giảng viên tự nhận lớp.
2. Lịch trực kho và staff tự đăng ký ca của chính mình.

Hai loại lịch được xem chung theo ngày nhưng không có quan hệ bắt buộc.

## 2. Stack

- Next.js 16 App Router, React 19, TypeScript.
- Supabase Auth, PostgreSQL, RLS và RPC.
- PostgreSQL exclusion constraint chống trùng/race condition.
- CSV/XLSX import bằng `papaparse` và `@e965/xlsx`.
- Font toàn hệ thống: Be Vietnam Pro qua `next/font/google`.
- Chạy local bằng Docker Desktop và Supabase CLI.

## 3. Vai trò

Một tài khoản có thể có nhiều vai trò.

| Vai trò    | Quyền chính                                                |
| ---------- | ---------------------------------------------------------- |
| `admin`    | Quản trị danh mục, nhân sự, lịch, vai trò, import và audit |
| `lecturer` | Xem lịch published, nhận/rút lớp của mình                  |
| `staff`    | Xem lịch, tạo/import draft, tự đăng ký/hủy ca              |
| `importer` | “Người tạo phiếu”; tạo thủ công/import draft               |

Admin và staff mặc định có quyền tạo phiếu. Lecturer chỉ có quyền này khi đồng
thời mang role `importer`.

## 4. Luồng quan trọng cần review

### Nhận/rút lớp

- Client gọi Server Action.
- Server Action gọi PostgreSQL RPC `claim_class` hoặc `withdraw_class`.
- RPC kiểm tra auth, active user, role, trạng thái, thời điểm và xung đột.
- GiST exclusion constraint là lớp chống race-condition cuối cùng.

### Staff tự đăng ký/hủy ca

- Client không gửi `staff_id`.
- RPC luôn lấy `auth.uid()`.
- Database chặn hai ca chồng lấn của cùng staff.

### Tạo lịch thủ công

- Admin/staff/importer có quyền truy cập.
- Lịch mới luôn là draft.
- `class_code` được giữ nullable trong schema để tương thích nhưng Version 1
  luôn ghi `null` và không hiển thị.

### Import

Template hiện có đúng 10 cột:

1. `schedule_date`
2. `start_time`
3. `end_time`
4. `course_code`
5. `course_name`
6. `room_code`
7. `building_code`
8. `lecturer_email`
9. `lecturer_name`
10. `note`

Client gửi rows tới Server Action dưới dạng chuỗi JSON. Đây là chủ ý để tránh
lỗi Next.js khi object do thư viện XLSX tạo ra có prototype không thuần.

`source_row_id`, `class_code` và `lecturer_employee_code` không còn trong
template hoặc UI.

### Audit

Trigger database ghi audit cho thay đổi lịch học, ca trực, import, vai trò và
trạng thái tài khoản. Chỉ admin được đọc `audit_logs`.

## 5. Database và bảo mật

Nguồn schema:

- `supabase/schemas/01_app.sql`
- `supabase/migrations/20260731054717_initial_schema.sql`

Điểm review quan trọng:

- RLS có thực sự khớp role matrix.
- RPC dùng `security definer` có `search_path = ''`.
- Quyền execute/grant không mở rộng quá mức.
- Exclusion constraint dùng khoảng `[)` để hai lịch tiếp giáp không bị coi là
  chồng lấn.
- Staff/importer không thể publish hoặc sửa dữ liệu của người khác.
- Không có service-role key trong frontend.

## 6. Routes chính

- `/login`
- `/dashboard`
- `/schedule-entry/new`
- `/schedule-entry/import`
- `/admin/class-schedules`
- `/admin/courses`
- `/admin/rooms`
- `/admin/personnel`
- `/admin/shift-templates`
- `/admin/audit`

## 7. Tài khoản local

| Email                    | Password            | Vai trò                          |
| ------------------------ | ------------------- | -------------------------------- |
| `admin@campus.local`     | `LocalAdmin123!`    | admin, staff, lecturer, importer |
| `giangvien@campus.local` | `LocalLecturer123!` | lecturer                         |
| `staff@campus.local`     | `LocalStaff123!`    | staff                            |
| `importer@campus.local`  | `LocalImporter123!` | lecturer, importer               |

Chỉ dùng trong local development.

## 8. Cách chạy

```powershell
npm.cmd ci
npx.cmd supabase start
npx.cmd supabase db reset --local
powershell.exe -ExecutionPolicy Bypass -File scripts/seed-local-users.ps1
npm.cmd run dev
```

Ứng dụng: `http://localhost:3000`

Supabase Studio: `http://127.0.0.1:54323`

## 9. Kiểm thử

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd audit --omit=dev
```

Test tích hợp hiện kiểm tra:

- Chỉ một giảng viên thắng khi nhận lớp đồng thời.
- Importer chỉ tạo draft của chính mình.
- Staff không thể đăng ký ca chồng lấn.
- Audit được ghi.
- Import batch của importer không lộ cho staff khác.

## 10. Phạm vi review đề xuất

Reviewer nên báo cáo theo mức độ:

1. Critical: lỗi auth/RLS, mất dữ liệu, race condition, secret exposure.
2. High: sai nghiệp vụ, import không nhất quán, trạng thái không an toàn.
3. Medium: accessibility, responsive, UX, performance.
4. Low: code style, copywriting và cải tiến kiến trúc.

Mỗi finding nên có:

- File và dòng.
- Cách tái hiện.
- Tác động.
- Đề xuất sửa cụ thể.

Xem thêm `UI_LAYOUT_SPEC.md` để review giao diện và bố cục.
