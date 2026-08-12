# MedLabs Calendar — hướng dẫn review giao diện

## Mục tiêu hệ thống

MedLabs Calendar là hệ thống nội bộ quản lý lịch học và lịch trực. Giao diện dùng tiếng Việt, font Be Vietnam Pro và ưu tiên desktop nhưng vẫn có responsive cho thiết bị nhỏ.

## Vai trò và sidebar

- Giảng viên: Tổng quan, Lịch tổng hợp, Lớp đang mở, Lớp của tôi.
- Staff: Tổng quan, Lịch tổng hợp, Lớp đang mở, Lịch trực, nhóm Tạo phiếu.
- Admin: toàn bộ chức năng quản lý lớp, lịch trực, tạo phiếu và quản trị.
- `can_import_schedules` là capability cộng thêm cho tài khoản có role và room-type scope phù hợp; capability này mở Import lịch và Lịch sử import.

Không còn module hoặc mục sidebar riêng mang tên **Lịch phòng**. Dữ liệu lớp học xuất hiện dưới tên **Lịch học** trong Lịch tổng hợp và trong danh sách lớp.

## Màn hình cần review

1. `app/dashboard/page.tsx`: Tổng quan theo vai trò.
2. `app/class-schedules/page.tsx` và `components/dashboard.tsx`: Lịch tổng hợp theo tháng, tuần và danh sách.
3. `app/classes/open/page.tsx` và `components/class-registration-list.tsx`: Lớp đang mở, bộ lọc và thao tác theo quyền.
4. `app/classes/mine/page.tsx`: Lớp của tôi.
5. `app/staff-shifts/page.tsx` và `components/staff-shift-roster.tsx`: Lịch trực.
6. `app/schedule-entry/new/page.tsx` và `components/schedule-form.tsx`: Tạo lịch thủ công.
7. `app/schedule-entry/import/page.tsx` và `components/import-wizard.tsx`: Import lịch.
8. `app/admin/*`: Nhân sự và các danh mục quản trị.
9. `components/workspace-shell.tsx`: bố cục tổng thể và sidebar theo vai trò.
10. `app/globals.css`: toàn bộ hệ thống thiết kế hiện tại.

## Cấu trúc Lịch tổng hợp

- Cột đầu tiên duy nhất chứa nhãn loại lịch và buổi.
- Khi bật cả hai loại, mỗi tuần có bốn hàng: Lịch học Sáng/Chiều và Lịch trực Sáng/Chiều.
- Khi tắt một loại, hai hàng của loại đó bị loại hoàn toàn.
- Luôn phải bật ít nhất một loại lịch.
- Có chế độ Tháng, Tuần và Danh sách; không có chế độ Ngày.
- Chi tiết sự kiện mở bằng drawer bên phải, với thao tác thay đổi theo vai trò.

## Phạm vi review mong muốn

Hãy đánh giá và đề xuất cụ thể về:

- Hệ thống phân cấp thông tin và độ dễ hiểu của sidebar.
- Mật độ thông tin trong lịch tháng và lịch tuần.
- Khả năng phân biệt Lịch học với Lịch trực bằng màu sắc, nhãn và khoảng trắng.
- Vị trí tìm kiếm, bộ lọc, KPI và các thao tác chính.
- Khả năng đọc bảng danh sách lớp và lịch trực.
- Drawer chi tiết, trạng thái nút nguy hiểm và xác nhận thao tác.
- Tính nhất quán về typography, spacing, border, màu sắc và button hierarchy.
- Accessibility: contrast, focus state, keyboard, label và kích thước vùng bấm.
- Responsive ở tablet/mobile.

Ưu tiên đề xuất có thể triển khai trực tiếp trên cấu trúc React/CSS hiện tại. Nếu đề xuất thay đổi lớn, vui lòng nêu rõ vấn đề, tác động và wireframe/bố cục thay thế.

## Nội dung gói

- `app/`: route và CSS giao diện.
- `components/`: component giao diện dùng chung.
- `lib/`: dữ liệu mẫu và tiện ích liên quan đến hiển thị.
- `public/`: tài nguyên tĩnh.
- `openspec/`: yêu cầu/spec đã lưu cùng mã nguồn.
- `tests/e2e/feedback-workflow.spec.ts`: các kỳ vọng giao diện và phân quyền đã được kiểm thử.

Gói này cố ý không chứa `.env`, khóa Supabase, `node_modules`, build cache hoặc dữ liệu Docker.
