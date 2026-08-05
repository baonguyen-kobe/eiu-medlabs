## Context

Một bản ghi `basic_medical_registrations` liên kết với nhiều `class_schedules` qua `basic_medical_registration_sessions`. Luồng tạo hiện ghi tuần tự từ ứng dụng, vì vậy không thích hợp để thay toàn bộ danh sách buổi khi điều chỉnh và có thể kích hoạt email lịch con ngoài email tổng hợp của phiếu.

## Goals / Non-Goals

**Goals:**

- Giao diện Điều chỉnh/Sao chép nhất quán với Phiếu thiết bị.
- Điều chỉnh giữ nguyên ID phiếu và thực hiện nguyên tử.
- Sao chép không thay đổi nguồn và tạo ID mới.
- Quyền và dữ liệu được kiểm tra lại ở server/database.
- Không gửi trùng email cấp phiếu và cấp lịch con.

**Non-Goals:**

- Không gộp trang quản lý từng lịch Y cơ sở vào trang quản lý phiếu.
- Không thay đổi luồng import lịch Y cơ sở độc lập.
- Không thay đổi cấu trúc dữ liệu hiện hữu của phiếu hoặc lịch.

## Decisions

### 1. Dùng cùng một RPC cho tạo và điều chỉnh

RPC nhận ID phiếu tùy chọn và toàn bộ danh sách buổi dạng JSON. ID rỗng tạo phiếu mới; ID có giá trị cập nhật phiếu hợp lệ. Toàn bộ update/xóa lịch cũ/tạo lịch mới nằm trong một transaction PostgreSQL nên lỗi ở một buổi sẽ rollback toàn bộ.

### 2. Phân quyền được kiểm tra trong RPC

Người dùng phải đang hoạt động, có quyền tạo lịch Y cơ sở và có phạm vi loại phòng tương ứng. Điều chỉnh chỉ cho người tạo phiếu hoặc admin/staff. Sao chép là thao tác tạo mới dưới danh tính người đang đăng nhập.

### 3. Mã hiển thị dùng timestamp 12 chữ số

Mã phiếu hiển thị theo `YYMMDDHHMMSS`, giống Phiếu thiết bị. Tra cứu sao chép chuyển mã thành khoảng timestamp một giây và vẫn chịu RLS khi đọc phiếu nguồn.

### 4. Sao chép bắt người dùng chọn lại ngày

Sao chép giữ môn, phòng, học kỳ, năm học, giảng viên, số sinh viên, giờ và tên bài; xóa khoảng ngày cùng ngày của từng buổi để tránh gửi nhầm một bản sao trùng lịch nguồn.

### 5. Email phiếu và email lịch có phạm vi riêng

RPC đặt cờ transaction-local khi sinh lịch con. Trigger email lịch thủ công bỏ qua các insert này; Server Action chỉ xếp một nhóm email tổng hợp cấp phiếu. Lịch được tạo/import trực tiếp vẫn theo ma trận email lịch Y cơ sở.

## Risks / Trade-offs

- [Admin điều chỉnh phiếu của người khác] → RPC bảo toàn người đăng ký/người tạo gốc nhưng ghi người thao tác vào email điều chỉnh.
- [Trùng lịch khi thay nhiều buổi] → Xóa và tạo lại lịch trong cùng transaction; exclusion constraint quyết định xung đột và rollback toàn bộ.
- [Mã timestamp trùng trong cùng một giây] → Tra cứu dùng `maybeSingle`; trường hợp hiếm có nhiều phiếu cùng giây sẽ được báo không tìm thấy duy nhất thay vì chọn nhầm.
- [Trigger email bị bỏ qua ngoài ý muốn] → Cờ chỉ tồn tại trong transaction RPC và chỉ được trigger đọc khi tạo lịch con.

## Migration Plan

1. Bổ sung RPC và điều kiện bỏ qua email lịch con vào declarative schema.
2. Tạo migration tiến tới tương ứng và áp dụng trên database local.
3. Chuyển action tạo sang RPC, thêm action điều chỉnh và UI hai chế độ.
4. Kiểm thử tạo mới, điều chỉnh, sao chép, quyền, xung đột và hàng đợi email.
