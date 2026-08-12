## Purpose

Cho phép người dùng điều chỉnh hoặc sao chép phiếu đăng ký Y cơ sở nhiều buổi một cách an toàn, nhất quán với Phiếu thiết bị và không phát sinh email trùng.

## ADDED Requirements

### Requirement: Điều chỉnh phiếu giữ nguyên định danh

Hệ thống SHALL cho người tạo phiếu hoặc admin/staff nạp và điều chỉnh toàn bộ nội dung phiếu Y cơ sở; thao tác thành công MUST giữ nguyên ID/mã phiếu và người đăng ký.

#### Scenario: Người tạo điều chỉnh phiếu

- **WHEN** người tạo chọn một phiếu được phép quản lý, sửa nội dung hợp lệ và lưu
- **THEN** hệ thống thay nội dung cùng danh sách lịch con trong một transaction và giữ nguyên mã phiếu

#### Scenario: Người không có quyền điều chỉnh

- **WHEN** người dùng không phải người tạo, admin hoặc staff gửi yêu cầu điều chỉnh
- **THEN** hệ thống từ chối mà không thay đổi phiếu hoặc lịch con

#### Scenario: Tìm phiếu cũ ngoài danh sách gần đây

- **WHEN** phiếu được phép điều chỉnh không còn nằm trong danh sách 200 phiếu gần nhất và người dùng nhập mã phiếu chính xác
- **THEN** hệ thống nạp đúng phiếu đó trong chế độ điều chỉnh mà không mở rộng danh sách không giới hạn

#### Scenario: Lookup không tiết lộ sự tồn tại

- **WHEN** người dùng nhập mã phiếu không tồn tại hoặc mã phiếu tồn tại nhưng không thuộc quyền điều chỉnh
- **THEN** hệ thống trả cùng một kết quả không tìm thấy hoặc không có quyền và không nạp dữ liệu phiếu

### Requirement: Sao chép tạo phiếu độc lập

Hệ thống SHALL cho phép nhập mã phiếu 12 chữ số để nạp dữ liệu nguồn và MUST tạo một phiếu mới khi gửi.

#### Scenario: Sao chép phiếu hợp lệ

- **WHEN** người dùng nạp một phiếu nguồn có quyền xem, chọn lại ngày và gửi
- **THEN** phiếu nguồn được giữ nguyên và hệ thống tạo phiếu có ID/mã mới dưới người đăng nhập

#### Scenario: Mã phiếu không hợp lệ

- **WHEN** mã nguồn không đủ 12 chữ số hoặc không tìm thấy duy nhất
- **THEN** hệ thống báo lỗi rõ ràng và không nạp nhầm phiếu

### Requirement: Ghi danh sách buổi nguyên tử

Tạo hoặc điều chỉnh phiếu SHALL ghi bản ghi phiếu, lịch con và chi tiết buổi trong cùng một transaction.

#### Scenario: Một buổi bị trùng lịch

- **WHEN** bất kỳ buổi nào vi phạm ràng buộc trùng phòng hoặc giảng viên
- **THEN** toàn bộ thao tác thất bại và dữ liệu trước thao tác được giữ nguyên

### Requirement: Không gửi trùng email lịch con

Lịch con sinh từ phiếu Y cơ sở SHALL không xếp email tạo lịch riêng; thao tác SHALL chỉ xếp email tổng hợp cấp phiếu.

#### Scenario: Tạo phiếu nhiều buổi

- **WHEN** một phiếu Y cơ sở gồm nhiều buổi được tạo thành công
- **THEN** người nhận chỉ nhận thông báo tạo phiếu tổng hợp, không nhận thêm email tạo cho từng lịch con

#### Scenario: Tạo lịch Y cơ sở độc lập

- **WHEN** một lịch Y cơ sở được tạo hoặc import ngoài luồng phiếu
- **THEN** hệ thống vẫn áp dụng email cấp lịch theo ma trận Lịch Y cơ sở
