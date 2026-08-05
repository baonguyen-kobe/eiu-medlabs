# Rà soát email thông báo — 04/08/2026

Luồng chung: nghiệp vụ tạo dòng `email_notifications` ở trạng thái `pending`; Vercel gọi Google Apps Script ngay; kết quả chuyển thành `sent` hoặc `failed`; Admin/Chuyên viên có thể dùng nút **Gửi lại** cho email lỗi. Apps Script chống gửi trùng bằng `dedupeKey`.

## Các thông báo hiện có

| Nhóm            | Sự kiện                           | Người nhận                                                                                                         |
| --------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Lịch Skills Lab | Tạo lịch thủ công                 | Admin; Chuyên viên đúng Loại phòng; Người xem đã bật nhận email đúng Loại phòng                                    |
| Lịch Skills Lab | Import lịch thành công            | Admin; Chuyên viên đúng Loại phòng; Người xem đã bật nhận email đúng Loại phòng. Mỗi người nhận một email tổng hợp |
| Lịch Skills Lab | Giảng viên hủy nhận lớp           | Admin; Chuyên viên đúng Loại phòng; các giảng viên liên quan                                                       |
| Lịch Skills Lab | Giảng viên xóa lớp do mình tạo    | Admin; Chuyên viên đúng Loại phòng; các giảng viên liên quan. Admin/Chuyên viên xóa thì không gửi                  |
| Phiếu thiết bị  | Tạo phiếu                         | Người đăng ký; Giảng viên phụ trách nếu khác người đăng ký; Admin                                                  |
| Phiếu thiết bị  | Điều chỉnh phiếu ở trạng thái Mới | Người đăng ký; Giảng viên phụ trách nếu khác người đăng ký; Admin                                                  |
| Phiếu Y cơ sở   | Tạo, điều chỉnh, xóa phiếu        | Người đăng ký; Giảng viên phụ trách; Admin; Chuyên viên Y cơ sở                                                    |
| Lịch Y cơ sở    | Tạo thủ công                      | Admin; Chuyên viên Y cơ sở; Người xem Y cơ sở đã bật nhận email                                                    |
| Lịch Y cơ sở    | Import lịch thành công            | Admin; Chuyên viên Y cơ sở; Người xem Y cơ sở đã bật nhận email. Mỗi người nhận một email tổng hợp                 |
| Lịch Y cơ sở    | Điều chỉnh, hủy hoặc xóa lịch     | Giảng viên liên quan; Admin; Chuyên viên Y cơ sở; Người xem Y cơ sở đã bật nhận email                              |

## Nội dung đã đối chiếu với hai form ngoài

- Phiếu thiết bị giữ cách đặt tiêu đề và toàn bộ các nhóm thông tin của form ngoài: môn học, người đăng ký, giảng viên phụ trách, nhận/trả, thiết bị nhóm theo kỹ năng và ghi chú.
- Câu mở đầu thay đổi theo tạo mới/điều chỉnh và theo người nhận: người đăng ký, giảng viên phụ trách hoặc Admin.
- Phiếu Y cơ sở có đủ mã phiếu, năm học, học kỳ, khoảng ngày, môn học, phòng, số sinh viên, người đăng ký, giảng viên phụ trách, ghi chú và bảng từng buổi học.
- Mọi loại thông báo đều có cả HTML và nội dung văn bản thuần; ngày hiển thị theo `dd/mm/yyyy`, giờ theo `HH:mm`.
- Email thay đổi/hủy/xóa lịch luôn nêu người thực hiện và thông tin lớp để người nhận đối chiếu.

## Chủ ý không gửi email

- Các lần chuyển trạng thái phiếu thiết bị và ký xác nhận giao/trả không tự gửi email; người đăng ký xem cùng trạng thái trực tiếp tại **Phiếu thiết bị của tôi**.
- Admin/Chuyên viên xóa hoặc hủy lớp Skills Lab không gửi email theo yêu cầu nghiệp vụ.
- Người xem chỉ nhận email lịch của Loại phòng được Admin bật tùy chọn nhận email; quyền xem không tự động đồng nghĩa với nhận email.
