# MedLabs Calendar — hướng dẫn review giao diện

> **Status: SUPPLEMENTAL REVIEW CHECKLIST**
>
> - Tài liệu này là checklist hỗ trợ review giao diện thủ công, **không phải**:
>   - Thẩm quyền thiết kế (_canonical visual authority_ thuộc `docs/UI_DESIGN_SYSTEM_V2_MASTER.md`).
>   - Registry trạng thái tác vụ (trạng thái thuộc `docs/ui-modernization/TRACKER.md` và `CURRENT.md`).
>   - Thẩm quyền phân quyền nghiệp vụ (quyền thực thi thuộc server code và database RLS/RPC).

---

## Mục tiêu hệ thống

MedLabs Calendar là hệ thống nội bộ quản lý lịch học và lịch trực. Giao diện dùng tiếng Việt, font Be Vietnam Pro và bảng màu nhận diện chuẩn EIU theo `docs/UI_DESIGN_SYSTEM_V2_MASTER.md`.

---

## Vai trò và sidebar

- **Giảng viên (`lecturer`):** Tổng quan, Lịch tổng hợp, Lớp đang mở, Lớp của tôi (kèm phân hệ Y cơ sở nếu có room-type scope).
- **Trợ giảng (`teaching_assistant`):** Nhận lớp / hỗ trợ lớp theo quyền và scope được phân công.
- **Staff (`staff`):** Tổng quan, Lịch tổng hợp, Lớp đang mở, Lịch trực, nhóm Tạo phiếu.
- **Admin (`admin`):** Toàn bộ chức năng quản lý lớp, lịch trực, tạo phiếu và quản trị hệ thống.
- **Viewer (`viewer`):** Chế độ xem theo phạm vi được cấp quyền.
- **Import capability:** `profiles.can_import_schedules` là capability cộng thêm cho tài khoản có role và room-type scope phù hợp; capability này mở Import lịch và Lịch sử import.

_Reviewer phải đối chiếu vai trò, capability và room-type scope từ source code hiện hành, server authorization và database RLS/RPC._

---

## Màn hình cần review

1. `app/dashboard/page.tsx`: Tổng quan theo vai trò (Strategy F hàng lịch gọn trên mobile).
2. `app/class-schedules/page.tsx` và `components/dashboard.tsx`: Lịch tổng hợp theo tháng, tuần và danh sách.
3. `app/classes/open/page.tsx` và `components/class-registration-list.tsx`: Lớp đang mở, bộ lọc và thao tác theo quyền (Strategy B).
4. `app/classes/mine/page.tsx`: Lớp của tôi.
5. `app/staff-shifts/page.tsx` và `components/staff-shift-roster.tsx`: Lịch trực và ca trực.
6. `app/schedule-entry/new/page.tsx` và `components/schedule-form.tsx`: Tạo lịch thủ công.
7. `app/schedule-entry/import/page.tsx` và `components/import-wizard.tsx`: Import lịch.
8. `app/imports/page.tsx` và `components/import-history-table.tsx`: Lịch sử import (Strategy D).
9. `app/email-notifications/page.tsx` và `components/email-notification-table.tsx`: Email thông báo (Strategy D).
10. `app/admin/*`: Nhân sự (Strategy E) và các danh mục quản trị (Strategy C).
11. `components/workspace-shell.tsx`: Bố cục tổng thể và sidebar theo vai trò.
12. `app/globals.css`: Toàn bộ design tokens và responsive CSS hiện tại.

---

## Cấu trúc Lịch tổng hợp

- Cột đầu tiên duy nhất chứa nhãn loại lịch và buổi.
- Khi bật cả hai loại, mỗi tuần có bốn hàng: Lịch học Sáng/Chiều và Lịch trực Sáng/Chiều.
- Khi tắt một loại, hai hàng của loại đó bị loại hoàn toàn.
- Luôn phải bật ít nhất một loại lịch.
- Có chế độ Tháng, Tuần và Danh sách; không có chế độ Ngày.
- Chi tiết sự kiện mở bằng drawer bên phải, với thao tác thay đổi theo vai trò.

---

## Phạm vi review mong muốn

Hãy đánh giá và đối chiếu cụ thể về:

- Hệ thống phân cấp thông tin và độ dễ hiểu của sidebar theo `WorkspaceShell`.
- Mật độ thông tin trong lịch tháng và lịch tuần.
- Khả năng phân biệt Lịch học với Lịch trực bằng màu sắc, nhãn và khoảng trắng.
- Vị trí tìm kiếm, bộ lọc, KPI và các thao tác chính.
- Khả năng đọc bảng danh sách lớp và lịch trực.
- Drawer chi tiết, trạng thái nút nguy hiểm và xác nhận thao tác.
- Tính nhất quán về typography, spacing, border, màu sắc và button hierarchy theo UI Master.
- Accessibility: contrast, focus state, keyboard, label và kích thước vùng bấm theo `useOverlayFocus`.
- Responsive ở tablet/mobile theo các Strategy A–F trong `docs/ui-modernization/`.

---

## Nội dung gói và tài nguyên

- `app/`: Route và CSS giao diện.
- `components/`: Component giao diện dùng chung.
- `lib/`: Tiện ích, kiểu dữ liệu và helpers hiển thị.
- `public/`: Tài nguyên tĩnh.
- `openspec/`: Yêu cầu/spec đã lưu cùng mã nguồn.
- `tests/`: Toàn bộ các bộ automated contract, component và regression tests hiện hành.
