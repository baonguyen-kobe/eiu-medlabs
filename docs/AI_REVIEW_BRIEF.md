# MedLabs Calendar — AI Review Brief

Tài liệu này giúp reviewer hiểu nhanh hệ thống mà không cần lịch sử trao đổi.

## 1. Mục tiêu

MedLabs Calendar là web app nội bộ quản lý bốn nhóm quy trình:

1. Lịch học và giảng viên tự nhận lớp.
2. Lịch trực kho và staff tự đăng ký ca của chính mình.
3. Phiếu mượn thiết bị, bàn giao và hoàn trả.
4. Đăng ký phòng Basic Medical, phân bổ/kiểm tra thiết bị và bằng chứng xác nhận.

Lịch học và lịch trực được xem chung theo ngày nhưng không có
quan hệ bắt buộc. Các luồng thiết bị có authorization và history riêng.

## 2. Stack

- Next.js 16 App Router, React 19, TypeScript.
- Supabase Auth, PostgreSQL, RLS và RPC.
- PostgreSQL exclusion constraint chống trùng/race condition.
- CSV/XLSX import bằng `papaparse` và `@e965/xlsx`.
- Font toàn hệ thống: Be Vietnam Pro qua `@fontsource/be-vietnam-pro`.
- Chạy local bằng Docker Desktop và Supabase CLI.

## 3. Vai trò

Một tài khoản có thể có nhiều vai trò.

| Vai trò              | Quyền chính                                                        |
| -------------------- | ------------------------------------------------------------------ |
| `admin`              | Quản trị danh mục, nhân sự, lịch, vai trò, import và audit         |
| `staff`              | Thao tác theo room-type scope, tạo phiếu và tự đăng ký/hủy ca      |
| `teaching_assistant` | Tạo phiếu/làm việc trong room-type scope được gán                  |
| `lecturer`           | Xem lịch, nhận/rút lớp và dùng các luồng được cấp scope/capability |
| `viewer`             | Quyền xem theo scope, không có quyền mutation mặc định             |

Import là capability `profiles.can_import_schedules`, không phải primary role trong
runtime UI. Quyền Basic Medical còn phụ thuộc cờ truy cập, room-type scope và
authority context phía server.

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

- Admin/staff/teaching assistant/lecturer truy cập theo room-type scope; lecturer-only chỉ tạo phiếu gắn với chính mình.
- Lịch hợp lệ được tạo/import ở trạng thái `published`; enum `draft` được giữ cho tương thích schema.
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

Nguồn database:

- Declarative schema: tất cả `supabase/schemas/*.sql`, nạp theo `supabase/config.toml`.
- Lịch sử versioned: toàn bộ `supabase/migrations/*.sql`.
- pgTAP: `supabase/tests/*.sql`; Node contracts: `tests/*.test.mjs`.

Điểm review quan trọng:

- RLS có thực sự khớp role matrix.
- RPC dùng `security definer` có `search_path = ''`.
- Quyền execute/grant không mở rộng quá mức.
- Exclusion constraint dùng khoảng `[)` để hai lịch tiếp giáp không bị coi là
  chồng lấn.
- Giá trị enum `importer` chỉ còn để tương thích dữ liệu cũ; quyền import runtime phải
  dựa trên `profiles.can_import_schedules`, vai trò được hỗ trợ và room-type scope.
- RPC import tạo lịch ở trạng thái `published`. Người dùng có capability import chỉ
  được ghi/finalize batch `importing` do chính mình tạo; RLS đọc batch vẫn cho phép
  admin và staff có room-type scope tương ứng xem batch theo
  `import_batches_scoped_select`.
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
- `/equipment/register`, `/equipment/mine`, `/equipment/requests`
- `/basic-medical/new`, `/basic-medical/registrations`, `/basic-medical/equipment`

## 7. Tài khoản local

| Email                          | Password                   | Vai trò/capability                        |
| ------------------------------ | -------------------------- | ----------------------------------------- |
| `admin@campus.local`           | `LocalAdmin123!`           | admin, staff, lecturer, import capability |
| `giangvien@campus.local`       | `LocalLecturer123!`        | lecturer                                  |
| `staff@campus.local`           | `LocalStaff123!`           | staff                                     |
| `importer@campus.local`        | `LocalImporter123!`        | lecturer, import capability               |
| `trogiang@campus.local`        | `LocalAssistant123!`       | teaching_assistant                        |
| `trogiang.import@campus.local` | `LocalAssistantImport123!` | teaching_assistant, import capability     |

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
npm.cmd run test:db
npm.cmd run test:e2e:critical
npm.cmd run build
npm.cmd audit --omit=dev
```

Test tích hợp hiện kiểm tra:

- Chỉ một giảng viên thắng khi nhận lớp đồng thời.
- RPC import tạo lịch `published`; người dùng import không phải admin chỉ ghi vào
  batch `importing` do chính mình tạo và phải có capability/scope phù hợp.
- Staff không thể đăng ký ca chồng lấn.
- Audit được ghi.
- RLS cho phép admin và staff có room-type scope tương ứng đọc import batch; quyền
  ghi qua RPC vẫn bị giới hạn vào batch đang `importing` của chính người gọi.

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
