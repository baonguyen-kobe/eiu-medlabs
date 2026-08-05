## Purpose

Quản lý danh mục và số lượng thiết bị Y cơ sở theo từng phòng, ghi nhận Tốt/Hư có lịch sử và thông báo kịp thời khi phát sinh hư hỏng.

## ADDED Requirements

### Requirement: Danh mục thiết bị Y cơ sở độc lập

Hệ thống SHALL duy trì một danh mục thiết bị Y cơ sở riêng, không dùng chung bản ghi với Danh mục thiết bị Skills Lab, và cho phép một thiết bị được phân bổ cho nhiều phòng Y cơ sở.

#### Scenario: Cùng thiết bị ở hai phòng

- **WHEN** admin/staff phân bổ cùng một mục thiết bị cho hai phòng Y cơ sở
- **THEN** mỗi phòng có số lượng Tổng, Tốt và Hư độc lập

### Requirement: Quản lý danh mục có cùng tiêu chuẩn giao diện

Tab Thiết bị SHALL cung cấp thêm thủ công, sửa trực tiếp, ngừng sử dụng, xóa hợp lệ, tìm kiếm, lọc, sắp xếp, phân trang, tải template, import mới, import tất cả và export theo kiểu Danh mục thiết bị hiện có nhưng thao tác trên dữ liệu Y cơ sở riêng.

#### Scenario: Import danh mục Y cơ sở

- **WHEN** admin/staff import một file hợp lệ từ tab Thiết bị
- **THEN** hệ thống chỉ tạo hoặc cập nhật danh mục và phân bổ phòng Y cơ sở mà không thay đổi danh mục Skills Lab

### Requirement: Bất biến số lượng thiết bị

Hệ thống MUST duy trì `Số lượng tổng = Số lượng Tốt + Số lượng Hư` và không cho phép bất kỳ số lượng nào âm.

#### Scenario: Báo hư mới

- **WHEN** thiết bị đang có 8 Tốt và 2 Hư và giảng viên báo thêm 1 thiết bị hư mới
- **THEN** hệ thống cập nhật thành 7 Tốt và 3 Hư trong cùng giao dịch

#### Scenario: Báo hư vượt số lượng Tốt

- **WHEN** số lượng hư mới được nhập lớn hơn số lượng Tốt hiện có
- **THEN** hệ thống từ chối thay đổi và giữ nguyên số lượng

### Requirement: Kiểm tra tình trạng theo phòng

Popup tình trạng SHALL hiển thị toàn bộ thiết bị đang hoạt động của phòng, mặc đị là Tốt, cho phép chọn Hư và bắt buộc nhập số lượng hư mới khi chọn Hư.

#### Scenario: Chọn Hư nhưng không nhập số lượng

- **WHEN** giảng viên đánh dấu một thiết bị là Hư nhưng không nhập số lượng hư mới dương
- **THEN** hệ thống không cho phép hoàn tất xác nhận

#### Scenario: Không có thiết bị hư

- **WHEN** giảng viên giữ tất cả thiết bị ở trạng thái Tốt và ký xác nhận
- **THEN** hệ thống lưu ảnh chụp hiện trạng nhưng không thay đổi số lượng tồn kho và không gửi email báo hư

### Requirement: Tab Thiết bị hư

Tab Thiết bị hư SHALL liệt kê các phân bổ phòng có số lượng Hư lớn hơn 0, bao gồm tên thiết bị, phòng, số lượng Tốt, số lượng Hư, người báo hư và ngày báo hư gần nhất.

#### Scenario: Admin chuyển thiết bị đã sửa sang Tốt

- **WHEN** admin/staff giảm số lượng Hư và tăng số lượng Tốt cùng một lượng
- **THEN** hệ thống lưu số lượng mới, giữ nguyên Tổng và ghi log người thực hiện

### Requirement: Log thay đổi bất biến

Hệ thống MUST ghi một log không thể sửa cho mỗi thay đổi Tốt/Hư, bao gồm phòng, thiết bị, giá trị trước/sau, loại thay đổi, người thực hiện, thời gian và buổi học liên quan nếu có.

#### Scenario: Xem log thay đổi

- **WHEN** admin/staff mở tab Log thay đổi và lọc theo phòng, thiết bị, loại thao tác, người thực hiện hoặc ngày
- **THEN** hệ thống hiển thị các log phù hợp theo thứ tự mới nhất trước

### Requirement: Phạm vi quyền thiết bị Y cơ sở

Hệ thống MUST cho người dùng có loại phòng Y cơ sở xem tình trạng hiện tại, nhưng chỉ admin/staff được thay đổi danh mục/tồn kho và xem log chi tiết có danh tính người báo hư.

#### Scenario: Giảng viên Y cơ sở xem tồn kho

- **WHEN** giảng viên thuộc loại phòng Y cơ sở mở trang thiết bị
- **THEN** hệ thống cho xem tình trạng hiện tại nhưng không hiển thị thao tác quản lý hoặc log có danh tính

#### Scenario: Người không thuộc Y cơ sở truy cập

- **WHEN** người dùng không phải admin/staff và không thuộc loại phòng Y cơ sở truy cập trang hoặc API
- **THEN** hệ thống từ chối truy cập

### Requirement: Email báo thiết bị hư

Hệ thống SHALL xếp một email tổng hợp sau khi xác nhận buổi học có ít nhất một thiết bị hư mới, gửi đến admin và staff thuộc loại phòng Y cơ sở.

#### Scenario: Gửi email tổng hợp một lần

- **WHEN** giảng viên xác nhận một buổi có nhiều thiết bị hư mới
- **THEN** hệ thống xếp một email cho mỗi người nhận với tiêu đề `[MedLabs Calendar] Thiết bị phòng {Số phòng} {Tên phòng} được báo Hư` và danh sách tất cả thiết bị hư mới của lần xác nhận

#### Scenario: Không gửi trùng email

- **WHEN** người dùng mở lại chi tiết, xem lại xác nhận hoặc admin/staff chỉnh tồn kho sau đó
- **THEN** hệ thống không xếp lại email báo hư cho lần xác nhận cũ
