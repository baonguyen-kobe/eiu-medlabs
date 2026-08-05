## Purpose

Kiểm soát các phiếu thiết bị có thời gian chuẩn bị dưới 24 giờ bằng một luồng phê duyệt riêng, có lý do và dấu vết rõ ràng nhưng không làm thay đổi luồng vận hành kho hiện hữu.

## ADDED Requirements

### Requirement: Phân loại thời gian chuẩn bị

Hệ thống SHALL dùng thời gian máy chủ để tính khoảng cách từ lúc gửi hoặc điều chỉnh phiếu đến thời gian nhận thiết bị.

#### Scenario: Đủ thời gian chuẩn bị

- **WHEN** thời gian nhận còn ít nhất 24 giờ
- **THEN** hệ thống gửi phiếu theo luồng bình thường và không yêu cầu duyệt đăng ký trễ

#### Scenario: Đăng ký trễ hợp lệ

- **WHEN** thời gian nhận còn trên 0 nhưng dưới 24 giờ
- **THEN** hệ thống yêu cầu lý do đăng ký trễ và đặt yêu cầu ở trạng thái “Chờ duyệt đăng ký trễ”

#### Scenario: Thời gian nhận không còn hợp lệ

- **WHEN** thời gian nhận đã đến hoặc đã qua
- **THEN** hệ thống từ chối tạo hoặc điều chỉnh phiếu

### Requirement: Cảnh báo và lý do đăng ký trễ

Hệ thống SHALL hiển thị thời gian chuẩn bị còn lại theo giờ và phút, thông báo thấp hơn quy định 24 giờ, bắt buộc nhập “Lý do đăng ký trễ” và dùng nhãn nút “Gửi yêu cầu duyệt đăng ký trễ”.

#### Scenario: Thiếu lý do đăng ký trễ

- **WHEN** người dùng gửi phiếu còn dưới 24 giờ mà chưa nhập lý do
- **THEN** hệ thống không gửi phiếu và chỉ rõ trường bắt buộc

#### Scenario: Hiển thị cảnh báo chính xác

- **WHEN** thời gian nhận còn 18 giờ 30 phút
- **THEN** hệ thống hiển thị “Thời gian chuẩn bị còn 18 giờ 30 phút, thấp hơn quy định tối thiểu 24 giờ. Phiếu này cần được phê duyệt.”

### Requirement: Duyệt đăng ký trễ có kiểm soát

Chỉ admin hoặc staff SHALL được duyệt hay từ chối yêu cầu đăng ký trễ; hệ thống MUST lưu người thực hiện, thời điểm và ghi chú kết quả.

#### Scenario: Admin hoặc staff duyệt

- **WHEN** admin hoặc staff bấm “Duyệt đăng ký trễ” trên phiếu đang chờ duyệt
- **THEN** hệ thống đổi trạng thái phê duyệt thành “Đã duyệt đăng ký trễ” và cho phép phiếu tiếp tục luồng kho

#### Scenario: Người không có quyền duyệt

- **WHEN** một tài khoản không phải admin/staff gọi thao tác duyệt hoặc từ chối
- **THEN** hệ thống từ chối thao tác mà không thay đổi dữ liệu

#### Scenario: Từ chối đăng ký trễ

- **WHEN** admin hoặc staff từ chối một yêu cầu đang chờ duyệt
- **THEN** hệ thống lưu kết quả từ chối và không cho phiếu tiếp tục luồng kho cho đến khi được điều chỉnh và gửi lại hợp lệ

### Requirement: Phê duyệt tách biệt trạng thái vận hành

Trạng thái duyệt đăng ký trễ SHALL được lưu và hiển thị độc lập với trạng thái Mới, Đã soạn, Đã giao, Đã trả và Hoàn thành.

#### Scenario: Chờ duyệt không được soạn

- **WHEN** một phiếu đang chờ duyệt hoặc bị từ chối
- **THEN** hệ thống không cho chuyển phiếu sang Đã soạn hoặc các bước tiếp theo

#### Scenario: Đã duyệt tiếp tục luồng kho

- **WHEN** một phiếu đăng ký trễ đã được duyệt
- **THEN** admin/staff có thể thao tác các trạng thái kho theo quy tắc hiện hành

### Requirement: Điều chỉnh thời gian nhận tính lại phê duyệt

Hệ thống SHALL tính lại yêu cầu phê duyệt mỗi khi thời gian nhận của phiếu được điều chỉnh trước khi giao.

#### Scenario: Điều chỉnh thành đủ 24 giờ

- **WHEN** phiếu chờ duyệt hoặc bị từ chối được điều chỉnh để thời gian nhận còn ít nhất 24 giờ
- **THEN** hệ thống bỏ yêu cầu duyệt đăng ký trễ và cho phiếu tiếp tục luồng bình thường

#### Scenario: Điều chỉnh thành dưới 24 giờ

- **WHEN** một phiếu chưa giao được điều chỉnh để thời gian nhận còn trên 0 nhưng dưới 24 giờ
- **THEN** hệ thống yêu cầu lý do mới và đặt lại trạng thái “Chờ duyệt đăng ký trễ”

### Requirement: Dữ liệu lịch sử không bị chặn

Các phiếu được nhập bằng chức năng import dữ liệu lịch sử SHALL không bị đưa vào luồng duyệt đăng ký trễ.

#### Scenario: Import phiếu lịch sử

- **WHEN** admin/staff import một phiếu cũ theo quy trình import được cấp quyền
- **THEN** hệ thống giữ trạng thái phê duyệt là không yêu cầu và không áp dụng kiểm tra 24 giờ của biểu mẫu đăng ký trực tuyến
