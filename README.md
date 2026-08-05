# MedLabs Calendar — Lịch học và lịch trực

Ứng dụng nội bộ quản lý lịch học, giảng viên nhận lớp và staff tự đăng ký ca trực.

## Yêu cầu

- Node.js 22.13 trở lên
- npm
- Docker Desktop đang chạy

## Khởi động local

```powershell
npm.cmd install
npx.cmd supabase start
powershell.exe -ExecutionPolicy Bypass -File scripts/seed-local-users.ps1
npm.cmd run dev
```

Mở:

- Ứng dụng: http://localhost:3000
- Supabase Studio: http://127.0.0.1:54323
- Mailpit: http://127.0.0.1:54324

## Tài khoản mẫu

| Vai trò                      | Email                  | Mật khẩu             |
| ---------------------------- | ---------------------- | -------------------- |
| Admin + mọi vai trò          | admin@campus.local     | LocalAdmin123!       |
| Giảng viên                   | giangvien@campus.local | LocalLecturer123!    |
| Staff                        | staff@campus.local     | LocalStaff123!       |
| Giảng viên + Người tạo phiếu | importer@campus.local  | LocalImporter123!    |
| Nhân viên + Người tạo phiếu  | dieuphoi@eiu.edu.vn    | LocalCoordinator123! |

Các mật khẩu trên chỉ dùng cho local development.

## Database

Nguồn schema:

```text
supabase/schemas/01_app.sql
```

Migration có thể tái tạo:

```text
supabase/migrations/20260731054717_initial_schema.sql
```

Kiểm tra toàn bộ migration và seed từ đầu:

```powershell
npx.cmd supabase db reset --local
powershell.exe -ExecutionPolicy Bypass -File scripts/seed-local-users.ps1
```

## Kiểm tra chất lượng

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd audit --omit=dev
```

`npm.cmd test` chạy kiểm thử tích hợp trên Supabase local, gồm nhận lớp đồng
thời, RLS hồ sơ/người tạo phiếu, giờ hoạt động, import nguyên tử, xung đột ca
trực và audit log. `npm.cmd run test:e2e` kiểm tra giao diện và quyền điều hướng
cho Admin, Giảng viên và Staff.

## Biến môi trường

Sao chép `.env.example` thành `.env.local`, điền publishable key và
`SUPABASE_SECRET_KEY` do `supabase status` cung cấp. Secret key chỉ được đọc ở
server để Admin tạo tài khoản hoặc đổi email đăng nhập.

Không đưa secret key hoặc service role key vào biến `NEXT_PUBLIC_*`.

### Email thông báo nghiệp vụ

Thông báo được ghi vào bảng hàng đợi sau khi nghiệp vụ lưu thành công, rồi
Vercel gọi Google Apps Script ngay. Thành công được ghi `sent`, lỗi được ghi
`failed`; Admin/Chuyên viên có thể mở **Email thông báo** để bấm **Gửi lại**.
Khi triển khai, cấu hình:

```text
NEXT_PUBLIC_APP_URL=https://ten-mien-noi-bo.example
EMAIL_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
EMAIL_APPS_SCRIPT_SECRET=...
```

Xem hướng dẫn triển khai script tại `docs/APPS_SCRIPT_EMAIL_SETUP.md`.

### Đăng nhập Google cho email EIU

Luồng OAuth và kiểm tra tên miền `@eiu.edu.vn` đã có sẵn. Để bật Google ở local:

1. Tạo OAuth Web Client trong Google Cloud, thêm callback
   `http://127.0.0.1:54321/auth/v1/callback`.
2. Tạo file `.env` ở thư mục dự án với
   `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` và
   `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`.
3. Đổi `enabled = true` tại `[auth.external.google]` trong
   `supabase/config.toml`, rồi chạy lại `npx.cmd supabase stop` và
   `npx.cmd supabase start`.

Tham số Google `hd=eiu.edu.vn` chỉ hỗ trợ chọn đúng tài khoản. Ứng dụng vẫn
kiểm tra email tại callback và database tự vô hiệu hóa hồ sơ Google ngoài tên
miền để bảo vệ dữ liệu ngay cả khi callback bị bỏ qua.

## Template import

Sau khi đăng nhập bằng admin, staff hoặc importer:

- `/schedule-entry/import`
- Template CSV: `/api/import-template/csv`
- Template XLSX: `/api/import-template/xlsx`

Template gồm đầy đủ mã phòng và mã tòa nhà để đối chiếu `room_id`.
Template hiện dùng 10 cột: `schedule_date`, `start_time`, `end_time`,
`course_code`, `course_name`, `room_code`, `building_code`,
`lecturer_email`, `lecturer_name`, `note`.

`source_row_id`, `class_code` và `lecturer_employee_code` không xuất hiện trong
template. `class_code` được giữ nullable trong database để tương thích nhưng
Version 1 luôn ghi `null` và không hiển thị.

## Các màn hình chính

- `/dashboard`: tổng quan gọn, KPI và các việc sắp tới theo vai trò.
- `/class-schedules`: lịch tháng/tuần/danh sách, dùng một cột “Buổi” cố
  định bên trái cho bốn hàng học sáng, học chiều, trực sáng và trực chiều.
- `/classes/open`: xem toàn bộ lớp theo khoảng tối đa 6 tháng; nhận, trả hoặc
  xóa theo vai trò.
- `/classes/mine`: Giảng viên xem hoặc rút lớp của chính mình.
- `/staff-shifts`: lịch trực theo tuần/tháng/danh sách (mặc định tuần), ca của tôi và
  lịch cố định. Staff chỉ tự đăng ký/hủy ca của chính mình.
- `/schedule-entry/new`: tạo lịch thủ công và sử dụng ngay.
- `/schedule-entry/import`: import CSV/XLSX tối đa 500 dòng, preview, kiểm tra
  trùng và tải file lỗi.
- `/imports`: lịch sử các phiên import.
- `/admin/catalogs`: đầu mối truy cập các danh mục quản trị.
- `/admin/courses`: danh mục môn học.
- `/admin/rooms`: danh mục phòng.
- `/admin/personnel`: trạng thái tài khoản và nhiều vai trò.
- `/admin/shift-templates`: mẫu ca trực.
- `/admin/audit`: nhật ký thay đổi nghiệp vụ.

## Graphify

Knowledge graph của mã nguồn nằm trong `graphify-out/`. Graphify được cài tách
biệt ở workspace để không làm tăng dependency production của ứng dụng.

Các giả định và giới hạn Version 1 được ghi tại `docs/ASSUMPTIONS.md`.

## Ghi chú chạy preview trên Windows

Nếu `next dev` gặp lỗi HMR/hydration khi workspace nằm trong đường dẫn có dấu,
dùng production preview:

```powershell
npm.cmd run build
npm.cmd run start -- -p 3000
```

Đây cũng là chế độ đang được dùng cho bản local đã kiểm thử cuối cùng.
