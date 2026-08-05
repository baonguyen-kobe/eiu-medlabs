## Why

Phiếu Y cơ sở hiện chưa cho biết từng buổi học đã được giảng viên xác nhận hay chưa, đồng thời chưa có dữ liệu thiết bị theo phòng để ghi nhận và theo dõi hư hỏng. Cần bổ sung một luồng xác nhận có chữ ký, tồn kho Tốt/Hư và nhật ký kiểm tra để giảng viên và bộ phận quản lý cùng nắm đúng tình trạng phòng.

## What Changes

- Trình bày Phiếu Y cơ sở dưới dạng danh sách thu gọn, có tìm kiếm, lọc ngày, lọc trạng thái Hoàn thành/Chưa hoàn thành và phân trang; mặc định hiển thị phiếu Chưa hoàn thành.
- Thêm xác nhận cho từng buổi học. Chỉ Giảng viên giảng dạy/hướng dẫn của buổi được ký, kể từ một giờ trước giờ kết thúc dự kiến; phiếu chỉ Hoàn thành khi mọi buổi đã xác nhận.
- Cho giảng viên kiểm tra danh sách thiết bị của phòng khi xác nhận, báo số lượng hư mới phát hiện và lưu ảnh chụp tình trạng toàn bộ thiết bị tại thời điểm ký.
- Thêm trang Danh sách thiết bị Y cơ sở với ba tab: Thiết bị, Thiết bị hư và Log thay đổi. Danh mục này độc lập với Danh mục thiết bị Skills Lab.
- Duy trì bất biến `Tổng = Tốt + Hư`; admin/staff có thể cập nhật trực tiếp số lượng Tốt/Hư, trong khi thay đổi tổng tồn kho thực hiện tại tab Thiết bị.
- Gửi một email tổng hợp đến admin và staff thuộc Y cơ sở sau khi xác nhận buổi học có thiết bị hư mới, với tiêu đề `[MedLabs Calendar] Thiết bị phòng {Số phòng} {Tên phòng} được báo Hư`.
- Khi thay đổi phòng, thời gian hoặc Giảng viên giảng dạy/hướng dẫn của buổi đã ký, hệ thống hủy xác nhận cũ và yêu cầu xác nhận lại.
- Không dùng chung dữ liệu với thiết bị Skills Lab, không cho admin/staff ký thay giảng viên, và không tự động gửi email khi chỉ lưu tạm/chỉnh sửa tồn kho.

## Capabilities

### New Capabilities

- `basic-medical-session-confirmation`: Danh sách Phiếu Y cơ sở thu gọn, trạng thái hoàn thành và xác nhận điện tử theo từng buổi học.
- `basic-medical-room-equipment`: Danh mục thiết bị Y cơ sở riêng, phân bổ theo phòng, theo dõi Tốt/Hư, nhật ký và email báo hư.

### Modified Capabilities

## Impact

- Thêm migration Supabase cho danh mục, tồn kho phòng, xác nhận buổi học, chi tiết kiểm tra và log tình trạng; bật RLS và chỉ cấp quyền cần thiết.
- Thay đổi trang Phiếu Y cơ sở, thêm trang quản lý thiết bị Y cơ sở, server actions, sidebar và component popup/chữ ký.
- Bổ sung loại email notification và cập nhật ma trận thông báo. Không thay đổi import/export thiết bị Skills Lab; trang mới sẽ có import/export/template riêng theo cùng kiểu giao diện.
- Quyền xem tình trạng hiện tại theo phạm vi Y cơ sở; chỉ admin/staff có quyền thay đổi tồn kho và xem log chi tiết/người báo hư.
- Dữ liệu mới không ảnh hưởng phiếu Y cơ sở cũ; có thể rollback giao diện/email bằng cách gỡ các route/action mới, nhưng migration production phải rollback theo hướng bảo toàn dữ liệu thay vì xóa bảng.
