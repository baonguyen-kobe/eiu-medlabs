## 1. Schema và phân quyền

- [x] 1.1 Tạo migration versioned cho danh mục thiết bị Y cơ sở, phân bổ phòng, xác nhận buổi, snapshot kiểm tra và log Tốt/Hư
- [x] 1.2 Bổ sung index, check constraint, grants và RLS theo vai trò/phạm vi Y cơ sở
- [x] 1.3 Tạo RPC nguyên tử cho xác nhận, cập nhật tồn kho và trigger làm mất hiệu lực xác nhận khi lịch thay đổi
- [x] 1.4 Điều chỉnh RPC lưu Phiếu Y cơ sở để giữ xác nhận của các buổi không thay đổi

## 2. Server và email

- [x] 2.1 Bổ sung types, truy vấn lọc/phân trang và server actions cho Phiếu Y cơ sở và xác nhận từng buổi
- [x] 2.2 Bổ sung server actions cho danh mục, phân bổ phòng, thay đổi Tốt/Hư, import/export/template và log
- [x] 2.3 Bổ sung notification `Thiết bị phòng được báo Hư`, recipient theo phạm vi Y cơ sở, dedupe và template email V2/Verdana
- [x] 2.4 Cập nhật ma trận Email notification với sự kiện, tiêu đề, người nhận và nội dung mới

## 3. Giao diện Phiếu Y cơ sở

- [x] 3.1 Chuyển Phiếu Y cơ sở sang danh sách thu gọn với header cột, tìm kiếm, lọc ngày/trạng thái và phân trang 50 dòng
- [x] 3.2 Xây chi tiết phiếu và bảng buổi học có trạng thái Xác nhận/Chưa xác nhận
- [x] 3.3 Xây popup danh sách thiết bị theo phòng, chọn Tốt/Hư, nhập số lượng hư mới và popup chữ ký điện tử
- [x] 3.4 Cập nhật trạng thái tại chỗ sau khi ký, hiển thông báo lỗi quyền/thời gian/số lượng và kiểm tra responsive

## 4. Giao diện thiết bị Y cơ sở

- [x] 4.1 Thêm route/sidebar Danh sách thiết bị Y cơ sở và ba tab Thiết bị, Thiết bị hư, Log thay đổi
- [x] 4.2 Xây tab Thiết bị với quản lý danh mục/phân bổ phòng, tìm kiếm, lọc, sắp xếp, phân trang và import/export/template riêng
- [x] 4.3 Xây tab Thiết bị hư với các cột đã duyệt và chỉnh trực tiếp Tốt/Hư cho admin/staff
- [x] 4.4 Xây tab Log thay đổi, bộ tìm kiếm/lọc và chế độ chỉ xem theo quyền

## 5. Kiểm thử và hoàn tất

- [x] 5.1 Thêm test schema/RPC cho phân quyền, mốc ký `end_time - 1h`, giao dịch rollback, bất biến số lượng và invalidation
- [x] 5.2 Thêm test component/logic cho trạng thái phiếu, bộ lọc, validation popup và email dedupe/subject
- [x] 5.3 Chạy migration local, truy vấn kiểm tra, Prettier, project check và React Doctor
- [x] 5.4 Kiểm thử thủ công các đường dùng Admin, Staff Y cơ sở, Giảng viên đúng buổi, Giảng viên khác và Người xem trên desktop/mobile
- [x] 5.5 Cập nhật Graphify và ghi lại kết quả kiểm thử/giới hạn còn lại
