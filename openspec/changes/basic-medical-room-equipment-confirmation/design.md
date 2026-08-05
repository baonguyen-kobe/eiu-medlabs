## Context

Trang Phiếu Y cơ sở hiện tại render toàn bộ chi tiết từ Server Component và chỉ có thao tác xóa. Mỗi `basic_medical_registration_session` liên kết một `class_schedule` và một `teaching_lecturer_id`; thao tác điều chỉnh phiếu hiện xóa/tạo lại toàn bộ lịch. Danh mục thiết bị hiện có phục vụ Skills Lab và không chứa phân bổ theo phòng.

See `proposal.md` for motivation and the two capability specs for observable behavior.

## Goals / Non-Goals

**Goals:**

- Duy trì một nguồn dữ liệu nhất quán cho trạng thái phiếu, chữ ký, tồn kho Tốt/Hư và lịch sử thay đổi.
- Áp dụng phân quyền tại server action/RPC và RLS, không dựa vào việc ẩn nút ở client.
- Tái sử dụng bố cục, combobox, bộ lọc, phân trang và chữ ký hiện có mà không kéo dữ liệu Skills Lab sang Y cơ sở.
- Giữ các thao tác xác nhận/tồn kho nguyên tử và chống gửi email trùng.

**Non-Goals:**

- Không thay đổi luồng giao/nhận hoặc danh mục thiết bị Skills Lab.
- Không cho phép admin/staff ký thay giảng viên của buổi.
- Không tự động chuyển thiết bị Hư về Tốt; việc đó luôn do admin/staff ghi nhận.

## Decisions

### 1. Tách danh mục và phân bổ phòng

Tạo `basic_medical_equipment_catalog` là danh mục gốc và `basic_medical_room_inventory` là bảng phân bổ mỗi thiết bị cho từng phòng. Bảng phân bổ lưu `total_quantity`, `good_quantity`, `damaged_quantity` và có check constraint bảo đảm tổng.

Lý do: cùng một mẫu thiết bị có thể xuất hiện ở nhiều phòng nhưng tình trạng phải độc lập. Phương án sao chép toàn bộ thông tin danh mục vào mỗi phòng bị loại vì gây trùng dữ liệu và khó sửa đồng bộ.

### 2. Lưu mỗi lần xác nhận và ảnh chụp thiết bị

Tạo `basic_medical_session_confirmations` cho người ký, chữ ký, timestamp và trạng thái mất hiệu lực; tạo `basic_medical_session_equipment_checks` để lưu before/after và số hư mới cho từng phân bổ phòng. Chỉ một xác nhận chưa mất hiệu lực được phép trên mỗi buổi bằng partial unique index.

Lý do: giữ được bằng chứng lịch sử ngay cả khi tồn kho được sửa sau này. Phương án chỉ lưu số hư hiện tại bị loại vì không thể tái hiện thời điểm giảng viên đã ký.

### 3. RPC nguyên tử cho xác nhận và thay đổi số lượng

Một RPC xác nhận sẽ khóa session, schedule và các inventory row liên quan; kiểm tra `auth.uid()`, giảng viên buổi học, thời gian sớm nhất, chữ ký và số lượng; sau đó lưu confirmation, snapshot, cập nhật Tốt/Hư và ghi log trong một transaction. Hai RPC quản lý riêng xử lý thay đổi tổng tồn kho và chuyển đổi Tốt/Hư.

RPC có thể dùng `security definer` chỉ khi cần giao dị nhiều bảng; nếu dùng, nó phải đặt `search_path = ''`, tự kiểm tra người dùng, revoke khỏi `public/anon` và chỉ grant cho `authenticated`. Các bảng public được bật RLS và không có policy ghi trực tiếp cho giảng viên.

Lý do: nhiều lần `.from().update()` từ client/server action không bảo đảm rollback toàn bộ. Phương án trigger tự suy luận từ nhiều update rời rạc khó hiển thị lỗi theo ngữ cảnh cho người dùng.

### 4. Mất hiệu lực thay vì xóa lịch sử xác nhận

Trigger trên `class_schedules` sẽ đánh dấu confirmation hiện hành là `invalidated_at` khi room, schedule_date, start_time, end_time hoặc lecturer_id thay đổi. RPC lưu Phiếu Y cơ sở được điều chỉnh để giữ nguyên schedule/session row không thay đổi và chỉ tạo lại buổi bị thay đổi.

Lý do: cascade delete sẽ làm mất bằng chứng và làm tất cả buổi phải ký lại. Phương án giữ nguyên xác nhận sau thay đổi bị loại vì chữ ký không còn khớp lịch được xác nhận.

### 5. Trạng thái phiếu là dữ liệu suy ra

Không thêm cột trạng thái có thể lệch trên registration. Truy vấn tính Hoàn thành khi số session bằng số confirmation hiện hành; tạo index theo session/confirmation để bộ lọc không quét toàn bộ bảng.

Lý do: trạng thái phiếu luôn phản ánh các buổi hiện tại và không cần trigger đồng bộ thêm.

### 6. Email được xếp sau khi RPC thành công

Server action chỉ enqueue notification nếu RPC trả về danh sách hư mới không rỗng. Mỗi confirmation/người nhận có dedupe key riêng. Người nhận là tất cả admin và staff đang hoạt động có phân công Y cơ sở; email dùng template V2/Verdana và Apps Script dispatcher hiện tại.

Lý do: lỗi gửi mail không được rollback xác nhận nghiệp vụ và outbox hiện có đã hỗ trợ retry.

### 7. Ranh giới Server Component và Client Component

Server page tải dữ liệu đã lọc/phân trang và quyền truy cập. Client components quản lý mở/thu gọn, popup, canvas chữ ký, combobox và optimistic/local updates sau server action; component nặng chỉ được tải tại các route cần thiết.

Lý do: giảm dữ liệu serialize xuống client và tránh tải lại toàn trang cho mỗi thao tác trong popup.

## Risks / Trade-offs

- [Hai giảng viên cùng thao tác hoặc tồn kho thay đổi trong lúc ký] → Khóa row trong RPC, kiểm tra lại số Tốt và unique active confirmation trước commit.
- [Chữ ký base64 làm tăng dung lượng database] → Giới hạn MIME/chiều dài tương tự chữ ký phiếu thiết bị; có thể chuyển sang Storage sau mà không đổi hành vi người dùng.
- [Bộ lọc trạng thái suy ra có thể tốn chi phí] → Dùng `exists/not exists` với index và phân trang phía server; kiểm tra query plan trên local.
- [Migration có nhiều bảng và policy] → Chỉ thêm cấu trúc mới, không thay/xóa dữ liệu hiện có; chạy reset local và advisors trước khi đưa production.
- [Email báo hư bị chặn bởi chế độ kiểm thử/tắt] → Vẫn xếp theo cơ chế delivery mode hiện có và hiển thị rõ recipient thực tế trong Email thông báo.

## Migration Plan

1. Tạo migration versioned cho các bảng, index, RLS, RPC và trigger. Dự án hiện dùng chuỗi migration nối tiếp cho các tính năng sau baseline; không chạy `db diff` từ `supabase/schemas/01_app.sql` đang thiếu nhiều bảng hiện hành vì có thể sinh thay đổi phá hủy ngoài phạm vi.
2. Chạy local migration/reset, test constraint, policy và RPC bằng tài khoản giảng viên/admin/staff.
3. Triển khai code đọc có khả năng xử lý danh mục trống; sau đó import dữ liệu Y cơ sở do người dùng cung cấp.
4. Khi triển khai production, backup schema/data, push migration trước deployment Next.js, sau đó smoke-test quyền và email ở chế độ kiểm thử.
5. Rollback ứng dụng bằng deployment trước. Không drop bảng khi rollback; vô hiệu route/RPC mới hoặc thêm migration tiếp theo nếu cần sửa schema để bảo toàn log và chữ ký.
