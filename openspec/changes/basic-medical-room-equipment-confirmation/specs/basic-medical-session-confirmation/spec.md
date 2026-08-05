## Purpose

Chuẩn hóa việc theo dõi tiến độ Phiếu Y cơ sở và xác nhận điện tử từng buổi học bởi đúng Giảng viên giảng dạy/hướng dẫn.

## ADDED Requirements

### Requirement: Danh sách Phiếu Y cơ sở thu gọn

Hệ thống SHALL hiển thị Phiếu Y cơ sở dưới dạng danh sách thu gọn và chỉ hiển thị chi tiết các buổi sau khi người dùng mở một phiếu.

#### Scenario: Mở chi tiết phiếu

- **WHEN** người dùng bấm vào một phiếu đang thu gọn
- **THEN** hệ thống hiển thị thông tin phiếu và toàn bộ các buổi học của phiếu đó

### Requirement: Tìm kiếm, lọc và phân trang phiếu

Hệ thống SHALL cung cấp tìm kiếm, lọc theo khoảng ngày, lọc trạng thái Hoàn thành/Chưa hoàn thành và phân trang tối đa 50 phiếu mỗi trang.

#### Scenario: Trạng thái mặc định

- **WHEN** người dùng mở trang Phiếu Y cơ sở mà không có bộ lọc trạng thái
- **THEN** hệ thống chỉ hiển thị các phiếu Chưa hoàn thành

#### Scenario: Lọc phiếu hoàn thành

- **WHEN** người dùng chọn trạng thái Hoàn thành và một khoảng ngày
- **THEN** hệ thống chỉ hiển thị các phiếu có tất cả buổi đã xác nhận và thuộc khoảng ngày đã chọn

### Requirement: Trạng thái hoàn thành được suy ra từ các buổi

Hệ thống SHALL hiển thị mỗi buổi là Chưa xác nhận hoặc Xác nhận và SHALL chỉ hiển thị cả phiếu là Hoàn thành khi tất cả các buổi hiện có đều đã xác nhận.

#### Scenario: Phiếu còn một buổi chưa xác nhận

- **WHEN** một phiếu có ít nhất một buổi Chưa xác nhận
- **THEN** trạng thái của phiếu là Chưa hoàn thành

#### Scenario: Tất cả buổi đã xác nhận

- **WHEN** buổi cuối cùng của phiếu được xác nhận
- **THEN** trạng thái của phiếu chuyển thành Hoàn thành

### Requirement: Chỉ đúng giảng viên được xác nhận

Hệ thống MUST chỉ cho phép `Giảng viên giảng dạy/hướng dẫn` được gán cho buổi học ký xác nhận buổi đó; admin, staff, người đăng ký và giảng viên phụ trách không được ký thay nếu không phải giảng viên của buổi.

#### Scenario: Giảng viên đúng buổi ký

- **WHEN** người đang đăng nhập là Giảng viên giảng dạy/hướng dẫn của buổi
- **THEN** hệ thống cho phép mở luồng xác nhận

#### Scenario: Người khác cố ký

- **WHEN** người không phải Giảng viên giảng dạy/hướng dẫn gửi yêu cầu xác nhận
- **THEN** hệ thống từ chối yêu cầu và không lưu chữ ký hoặc tình trạng thiết bị

### Requirement: Giới hạn thời điểm xác nhận

Hệ thống MUST chỉ cho phép xác nhận từ thời điểm một giờ trước giờ kết thúc dự kiến của buổi và không áp dụng thời hạn ký muộn.

#### Scenario: Ký quá sớm

- **WHEN** giảng viên gửi xác nhận trước thời điểm `giờ kết thúc - 1 giờ`
- **THEN** hệ thống từ chối và thông báo thời điểm sớm nhất có thể ký

#### Scenario: Ký sau khi buổi học kết thúc

- **WHEN** giảng viên gửi xác nhận sau giờ kết thúc dự kiến
- **THEN** hệ thống vẫn cho phép xác nhận nếu các điều kiện khác hợp lệ

### Requirement: Chữ ký và kiểm tra thiết bị là một giao dịch

Hệ thống MUST lưu chữ ký, thời gian ký và ảnh chụp tình trạng toàn bộ thiết bị của phòng trong cùng một thao tác xác nhận không thể lưu dở dang.

#### Scenario: Lưu xác nhận thành công

- **WHEN** giảng viên cung cấp chữ ký hợp lệ và tình trạng thiết bị hợp lệ
- **THEN** hệ thống lưu đủ chữ ký, timestamp, người ký và các dòng kiểm tra, sau đó hiển thị buổi là Xác nhận

#### Scenario: Dữ liệu tình trạng không hợp lệ

- **WHEN** số lượng hư mới vượt quá số lượng Tốt hiện có hoặc giao dịch cập nhật tồn kho thất bại
- **THEN** hệ thống không lưu bất kỳ phần nào của xác nhận

### Requirement: Thay đổi thông tin buổi làm mất hiệu lực xác nhận

Hệ thống MUST hủy xác nhận cũ của riêng buổi bị thay đổi khi phòng, ngày, thời gian hoặc Giảng viên giảng dạy/hướng dẫn thay đổi.

#### Scenario: Chỉnh sửa một buổi đã ký

- **WHEN** một buổi đã xác nhận bị thay đổi phòng, ngày, thời gian hoặc giảng viên
- **THEN** buổi đó trở lại Chưa xác nhận còn các buổi không thay đổi giữ nguyên xác nhận
