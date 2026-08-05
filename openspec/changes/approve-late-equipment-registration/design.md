## Context

Xem `proposal.md` phần Why. Phiếu thiết bị hiện có trạng thái vận hành riêng và được thay đổi qua Server Actions/RPC Supabase. Chức năng import dữ liệu lịch sử cũng ghi vào cùng bảng nên quy tắc mới phải phân biệt phiếu trực tuyến với dữ liệu import.

## Goals / Non-Goals

**Goals:**

- Máy chủ và database là nguồn quyết định duy nhất cho ngưỡng 24 giờ và quyền duyệt.
- UI phản hồi ngay khi chọn ngày/giờ nhận, nhưng không dựa vào đồng hồ trình duyệt để chấp nhận dữ liệu.
- Lưu đủ lý do, người duyệt, thời gian duyệt, ghi chú và audit.
- Không trộn trạng thái duyệt trễ với trạng thái vận hành kho.

**Non-Goals:**

- Không thay đổi chuỗi trạng thái Mới → Đã soạn → Đã giao → Đã trả → Hoàn thành.
- Không thay đổi mẫu import lịch sử hoặc bắt dữ liệu import cũ phải được duyệt hồi tố.
- Không cho các role ngoài admin/staff quyền duyệt.

## Decisions

### 1. Lưu trạng thái duyệt riêng trên phiếu

Bổ sung trạng thái `not_required`, `pending`, `approved`, `rejected` cùng lý do và metadata xét duyệt vào bản ghi phiếu. Cách này cho phép một phiếu vừa hiển thị trạng thái vận hành vừa hiển thị kết quả duyệt trễ mà không phải mở rộng chuỗi trạng thái kho.

Phương án thay thế là thêm các trạng thái “chờ duyệt/đã duyệt” vào cột trạng thái hiện có, nhưng sẽ phá vỡ logic ký nhận, chuyển trạng thái và bộ lọc hiện tại.

### 2. Database kiểm tra ngưỡng và quyền

Server Action xác thực đầu vào để trả thông báo dễ hiểu; trigger/RPC Supabase kiểm tra lại bằng `clock_timestamp()` để ngăn request giả hoặc client sai giờ. RPC duyệt chỉ thành công khi người gọi có role admin/staff đang hoạt động và phiếu đang ở trạng thái `pending`.

### 3. Điều chỉnh thời gian nhận đặt lại quyết định

Nếu thời gian nhận thay đổi, trạng thái duyệt được tính lại. Đủ 24 giờ sẽ thành `not_required`; dưới 24 giờ sẽ thành `pending` và xóa metadata duyệt cũ. Điều này tránh dùng một quyết định duyệt cho mốc nhận khác.

### 4. Import lịch sử được miễn quy tắc 24 giờ

RPC import hiện có tiếp tục ghi trạng thái `not_required`. Cơ chế kiểm tra online chỉ kích hoạt qua các RPC tạo/điều chỉnh phiếu trực tuyến hoặc khi không có cờ ngữ cảnh import an toàn phía database.

### 5. Cập nhật danh sách tại chỗ

Thao tác duyệt/từ chối trả về bản ghi trạng thái tối thiểu. Client cập nhật phiếu tương ứng trong state thay vì refresh toàn trang; các trang khác vẫn được revalidate để lần truy cập sau có dữ liệu mới.

### 6. Thông báo dùng hạ tầng email hiện có

Yêu cầu duyệt gửi đến nhóm admin/staff; kết quả duyệt gửi đến người đăng ký và giảng viên phụ trách nếu khác người đăng ký. Chế độ kiểm thử email hiện tại vẫn được tôn trọng.

## Risks / Trade-offs

- [Đồng hồ client lệch làm cảnh báo sớm/muộn] → Client chỉ gợi ý; server/database tính lại và trả kết quả có thẩm quyền.
- [Phiếu đang chỉnh vượt qua mốc 0 giờ] → Kiểm tra lại ngay trong transaction khi ghi dữ liệu.
- [Migration ảnh hưởng phiếu cũ] → Cột mới mặc định `not_required`, không tính hồi tố.
- [Race condition giữa duyệt và điều chỉnh] → RPC điều chỉnh xóa quyết định cũ khi mốc nhận thay đổi; RPC duyệt chỉ nhận bản ghi đang `pending`.
- [Email lỗi làm chặn nghiệp vụ] → Ghi hàng đợi/thất bại theo cơ chế email hiện có, không rollback phiếu đã lưu.

## Migration Plan

1. Bổ sung cột/check constraint/index và RPC duyệt vào declarative schema Supabase.
2. Sinh migration từ schema và kiểm tra trên database local.
3. Cập nhật type, Server Actions, email và UI.
4. Chạy typecheck/lint/test liên quan và kiểm thử các mốc 24 giờ, 0 giờ, quyền admin/staff, chỉnh sửa và import.
5. Khi rollback, gỡ UI/actions trước; chỉ xóa cột/RPC sau khi xác nhận không cần giữ lịch sử duyệt.
