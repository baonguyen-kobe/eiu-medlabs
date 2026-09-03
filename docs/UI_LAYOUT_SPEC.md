# MedLabs Calendar — UI & Layout Review Spec

> **Status: SUPPLEMENTAL LEGACY LAYOUT REFERENCE**
>
> - `docs/UI_DESIGN_SYSTEM_V2_MASTER.md` là thẩm quyền thiết kế giao diện MedLabs chuẩn (_canonical visual authority_).
> - `docs/ui-modernization/` (`DECISIONS.md`, `CURRENT.md`, `TRACKER.md`) sở hữu trạng thái và quyết định hiện đại hóa UI đang hoạt động.
> - Tài liệu này phục vụ tham khảo bố cục lịch sử; các yêu cầu nghiệp vụ, bảo mật và source code hiện hành luôn có thứ tự ưu tiên cao hơn tài liệu này.

---

## 1. Định hướng thị giác

- **Ngôn ngữ:** tiếng Việt.
- **Font:** Be Vietnam Pro trên toàn bộ hệ thống theo Global Font Contract.
- **Phong cách:** ứng dụng quản trị nội bộ sáng, gọn, ít trang trí.
- **Bảng màu và design tokens:** Tuân thủ `docs/UI_DESIGN_SYSTEM_V2_MASTER.md` (màu nhận diện EIU: xanh navy/blue `var(--eiu-blue)`, vàng kim/gold `var(--eiu-gold)`, kem/cream `var(--eiu-cream)`, ghi/ink `var(--ink-*)`). Các biến thể màu cũ (teal/indigo) đã được chuẩn hóa theo Master tokens.
- **Implementation tokens:** Nằm tại đầu `app/globals.css`.

---

## 2. Dashboard desktop

Bố cục tổng quan desktop:

```text
┌──────────── Sidebar ────────────┬──────────── Topbar ───────────────┐
│ Logo, navigation, account       │ Tiêu đề, trạng thái, actions     │
├─────────────────────────────────┼───────────────────────────────────┤
│                                 │ Hero và quick actions             │
│                                 ├───────────────────────────────────┤
│                                 │ Search, period, status filter     │
│                                 ├───────────────────────────────────┤
│                                 │ 5 KPI cards                       │
│                                 ├───────────────────────────────────┤
│                                 │ Calendar                          │
│                                 ├────────────────────┬──────────────┤
│                                 │ Open classes       │ Staff shifts │
└─────────────────────────────────┴────────────────────┴──────────────┘
```

Khu vực account hiển thị nhãn vai trò chính được suy ra từ các vai trò đã lưu. `WorkspaceShell` không có control chuyển đổi hoặc thay đổi vai trò tài khoản.

---

## 3. Calendar

Calendar có ba chế độ: Tháng, Tuần và Danh sách. Trạng thái chế độ và ngày neo nằm trên URL (`view`, `date`).

Mỗi ngày luôn có đúng bốn vùng, không trộn hai loại lịch:

```text
┌──────────────────────────────────┐
│ Thứ / ngày                       │
├──────────────┬───────────────────┤
│ Học · Sáng   │ Lịch học buổi sáng│
├──────────────┼───────────────────┤
│ Học · Chiều  │ Lịch học buổi chiều
╞══════════════╪═══════════════════╡
│ Trực · Sáng  │ Ca trực buổi sáng │
├──────────────┼───────────────────┤
│ Trực · Chiều │ Ca trực buổi chiều│
└──────────────┴───────────────────┘
```

Quy tắc phân buổi:

- `start_time < 12:00`: sáng.
- Còn lại: chiều.

### Chế độ Tháng

- Grid cố định 7 cột × 6 tuần, luôn dựng 42 ngày để bao phủ tháng và các ngày đệm.
- Hiện toàn bộ event khớp trong đúng vùng học/trực và sáng/chiều. `SlotEvents` không cắt số lượng; nội dung mở rộng/overflow theo CSS hiện tại và cell không có cuộn dọc riêng.
- Ngày ngoài tháng giảm opacity.

### Chế độ Tuần

- 7 cột.
- Hiện các event trong bảy ngày của tuần đang chọn.

### Chế độ Danh sách

- Danh sách ngày nhưng vẫn giữ bốn vùng tách biệt.

Click event mở drawer chi tiết. Toggle “Lịch học” và “Lịch trực” vừa ẩn/hiện dữ liệu, vừa loại hai hàng Sáng/Chiều của loại lịch tương ứng; dữ liệu nguồn không bị thay đổi.

---

## 4. Responsive (Tham khảo lịch sử)

_Lưu ý: Các chiến lược responsive từng bảng/màn hình hiện tại được quản trị theo `docs/ui-modernization/` (Strategies A–F). Kiểm tra `TRACKER.md` và source code trước khi xem các gạch đầu dòng dưới đây là tiêu chuẩn duy nhất._

- Dưới 920 px: sidebar thành drawer (`WorkspaceShell`).
- KPI và filter có thể cuộn ngang hoặc dàn linh hoạt theo chiến lược từng màn.
- Calendar tháng/tuần giữ cấu trúc và cuộn ngang vùng lịch thay vì ép cột quá hẹp.
- Form/import chuyển về một cột trên mobile.
- Drawer/modal phải giữ trong viewport, sử dụng `useOverlayFocus` và có `overscroll-behavior: contain`.

---

## 5. Import UI

Stepper năm bước:

1. Chọn file.
2. Xem trước.
3. Kiểm tra.
4. Xác nhận.
5. Kết quả.

Yêu cầu review:

- Header thiếu phải chặn xác nhận.
- Dòng thiếu trường bắt buộc phải đánh dấu.
- Error/cảnh báo cần dễ phân biệt.
- Bảng preview phải cuộn ngang ở màn nhỏ.

---

## 6. Accessibility (Tham khảo lịch sử)

_Lưu ý: Trạng thái accessibility hiện hành và các contract modal/dialog/focus trap được theo dõi tại `docs/ui-modernization/TRACKER.md` (A11Y-01 đến A11Y-04, A11Y-02.1 đến A11Y-02.5)._

Đã có:

- Skip link.
- Focus-visible toàn cục.
- Label cho form control.
- `aria-label` cho icon-only button.
- `aria-live` cho action toast.
- `prefers-reduced-motion`.
- Confirm trước thao tác hủy/rút có tính phá hủy.

Reviewer nên tiếp tục kiểm tra:

- Keyboard traversal trong calendar và drawer.
- Color contrast ở text cỡ nhỏ.
- Screen reader semantics của month grid.
- Focus restoration sau khi đóng drawer/modal (`useOverlayFocus`).

---

## 7. Source UI quan trọng

- `components/dashboard.tsx`: dashboard và calendar.
- `app/globals.css`: design tokens và toàn bộ responsive layout.
- `components/import-wizard.tsx`: import stepper/preview/result.
- `components/schedule-form.tsx`: tạo lịch thủ công.
- `components/admin-shell.tsx`: layout màn quản trị.
- `app/layout.tsx`: font, metadata và skip link.
