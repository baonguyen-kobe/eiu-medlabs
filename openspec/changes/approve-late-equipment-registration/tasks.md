## 1. Schema và phân quyền

- [x] 1.1 Bổ sung trạng thái duyệt trễ, lý do và metadata xét duyệt vào declarative schema Supabase
- [x] 1.2 Bổ sung RPC duyệt/từ chối có kiểm tra admin/staff và chặn trạng thái kho khi chưa được duyệt
- [x] 1.3 Bảo toàn ngoại lệ import lịch sử và sinh migration tương ứng

## 2. Server và dữ liệu ứng dụng

- [x] 2.1 Bổ sung helper tính/định dạng thời gian chuẩn bị và type/query phiếu thiết bị
- [x] 2.2 Cập nhật actions tạo/điều chỉnh để kiểm tra 24 giờ, bắt lý do và tính lại trạng thái duyệt
- [x] 2.3 Bổ sung action duyệt/từ chối, audit và email thông báo theo chế độ gửi hiện có

## 3. Giao diện

- [x] 3.1 Hiển thị cảnh báo trực tiếp, trường lý do bắt buộc và nhãn nút gửi đăng ký trễ trên biểu mẫu
- [x] 3.2 Hiển thị trạng thái duyệt riêng trên danh sách phiếu của tôi và danh sách quản lý
- [x] 3.3 Bổ sung nút duyệt/từ chối cho admin/staff và cập nhật đúng hàng tại chỗ

## 4. Kiểm thử và bàn giao

- [x] 4.1 Thêm kiểm thử tập trung cho các mốc dưới 0, dưới 24, đúng 24 giờ và điều chỉnh thời gian
- [x] 4.2 Chạy migration local, typecheck, lint, test/build liên quan và OpenSpec validate
- [x] 4.3 Kiểm tra thủ công theo role admin/staff/giảng viên và cập nhật Graphify
