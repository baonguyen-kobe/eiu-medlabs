## Why

Phiếu đăng ký thiết bị hiện chưa bảo đảm cho admin/staff có tối thiểu 24 giờ chuẩn bị. Cần cho phép đăng ký trễ có kiểm soát thay vì chặn hoàn toàn, đồng thời lưu rõ lý do, người duyệt và kết quả duyệt để các bên theo dõi.

## What Changes

- Tính thời gian chuẩn bị từ thời điểm gửi/điều chỉnh phiếu đến thời gian nhận thiết bị bằng thời gian máy chủ.
- Từ đủ 24 giờ trở lên: gửi phiếu theo luồng hiện tại.
- Trên 0 nhưng dưới 24 giờ: hiện cảnh báo, bắt buộc nhập “Lý do đăng ký trễ”, đổi nút gửi thành “Gửi yêu cầu duyệt đăng ký trễ” và đặt phiếu ở trạng thái phê duyệt riêng “Chờ duyệt đăng ký trễ”.
- Từ 0 giờ trở xuống: không cho gửi vì thời gian nhận đã đến hoặc đã qua.
- Admin/staff được “Duyệt đăng ký trễ” hoặc từ chối; mọi thao tác được kiểm tra quyền ở máy chủ và lưu dấu vết người thực hiện, thời gian, ghi chú.
- Phiếu chờ duyệt hoặc bị từ chối không được chuyển tiếp sang các bước soạn/giao; sau khi được duyệt sẽ hiển thị “Đã duyệt đăng ký trễ” và tiếp tục luồng trạng thái thiết bị bình thường.
- Khi điều chỉnh thời gian nhận, hệ thống tính lại điều kiện 24 giờ và đặt lại kết quả duyệt khi cần.
- Gửi thông báo email kiểm thử/thật theo cấu hình hiện có cho yêu cầu duyệt và kết quả duyệt.
- Import dữ liệu lịch sử không đi vào luồng duyệt đăng ký trễ.

## Capabilities

### New Capabilities

- `late-equipment-registration-approval`: Quy định thời gian chuẩn bị tối thiểu, lý do đăng ký trễ, quyền duyệt và ảnh hưởng của kết quả duyệt đến luồng phiếu thiết bị.

### Modified Capabilities

Không có.

## Impact

- Giao diện đăng ký/điều chỉnh phiếu thiết bị và danh sách “Phiếu thiết bị”, “Phiếu thiết bị của tôi”.
- Server Actions, truy vấn/type dữ liệu phiếu, nội dung email và nhật ký thao tác.
- Schema Supabase, RPC/trigger/RLS liên quan đến phiếu thiết bị; cần migration bổ sung cột và hàm duyệt an toàn.
- Không thay đổi định dạng import lịch sử và không phá vỡ dữ liệu phiếu hiện hữu; các phiếu cũ mặc định không yêu cầu duyệt trễ.
- Có thể rollback phần giao diện và actions; migration rollback cần xóa RPC/cột mới sau khi bảo toàn dữ liệu audit nếu cần.
