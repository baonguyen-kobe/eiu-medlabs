# Giả định triển khai Version 1

- Múi giờ nghiệp vụ duy nhất là `Asia/Ho_Chi_Minh`; Version 1 không hỗ trợ ca
  hoặc lịch qua nửa đêm.
- Lịch hợp lệ do Admin, Staff hoặc Người tạo phiếu tạo/import được sử dụng và
  hiển thị ngay; không còn luồng Bản nháp → Công bố → Hoàn thành.
- Admin, Staff và Trợ giảng có thể gán giảng viên trong room-type scope;
  tài khoản chỉ có vai trò Giảng viên phải tự gán chính mình. Import chỉ gán
  giảng viên khi actor có capability/scope phù hợp và không tự tạo nhân sự.
- Môn học chưa có trong danh mục vẫn có thể được giữ bằng snapshot với
  `course_id = null` và cảnh báo để admin xác nhận sau.
- Không tự tạo nhân sự từ file import.
- Lịch học và lịch trực là hai lớp dữ liệu độc lập; không tạo cảnh báo vì
  thiếu quan hệ giữa chúng.
- Dashboard chỉ hiển thị KPI và dữ liệu 30 ngày gần nhất. Calendar tải theo
  khoảng tháng/tuần trên URL ở `/class-schedules`; danh sách mặc định theo tuần.
- Dữ liệu mẫu có ngày cuối tháng 7 và đầu tháng 8 năm 2026, phù hợp thời điểm
  xây dựng bản local.
- Luồng đăng ký/rút lớp và đăng ký/hủy ca dùng PostgreSQL RPC. RLS và exclusion
  constraint vẫn là lớp bảo vệ cuối cùng khi có nhiều thao tác đồng thời.
- Import local giới hạn 5 MB và 500 dòng mỗi lần. Dòng lỗi không tạo lịch; dòng
  hợp lệ tạo lịch dùng ngay và được liên kết ngược với phiên import. File vượt 500 dòng
  bị từ chối rõ ràng, không cắt dữ liệu. Mỗi lịch và bản ghi kiểm tra dòng được
  tạo trong cùng một PostgreSQL RPC.
- Lịch học phải nằm trọn trong 07:30–11:30 hoặc 12:30–16:30.
- Người dùng không phải Admin chỉ đọc hồ sơ của chính mình. Danh bạ chung chỉ
  công khai `id`, `full_name` và `title`; email/số điện thoại không lộ qua RLS.
- `class_code` là trường dự phòng trong schema, luôn để `null` và không hiển thị
  trong Version 1.
- Calendar tháng/tuần/danh sách chia mỗi ngày thành bốn vùng: lịch học sáng,
  lịch học chiều, lịch trực sáng và lịch trực chiều. Khi tắt một loại lịch, hai
  hàng tương ứng cũng được loại bỏ và luôn phải còn ít nhất một loại được bật.
