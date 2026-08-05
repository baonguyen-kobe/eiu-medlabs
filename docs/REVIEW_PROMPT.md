# Prompt gửi AI reviewer

Hãy review toàn diện dự án MedLabs Calendar trong archive này.

Đọc theo thứ tự:

1. `docs/AI_REVIEW_BRIEF.md`
2. `docs/UI_LAYOUT_SPEC.md`
3. `project-brief/AI Prompt 2 - Revised.txt`
4. `supabase/schemas/01_app.sql`
5. `components/dashboard.tsx`
6. `app/schedule-entry/import/actions.ts`
7. Các file còn lại theo phạm vi finding.

Phạm vi review:

- Nghiệp vụ và phân quyền đa vai trò.
- Supabase RLS, RPC, grants, trigger và race condition.
- Import CSV/XLSX, validation, duplicate handling và transaction consistency.
- Vòng đời draft/published/cancelled/completed.
- React/Next.js Server Action, hydration và performance.
- Giao diện tháng/tuần/ngày/danh sách.
- Bố cục bốn vùng học/trực sáng/chiều trong từng ngày.
- Responsive, accessibility, focus, keyboard và color contrast.
- Test coverage và các trường hợp còn thiếu.

Không chỉ đưa nhận xét chung. Với mỗi finding, cung cấp:

- Severity: Critical / High / Medium / Low.
- `file:line`.
- Mô tả lỗi và cách tái hiện.
- Tác động.
- Đề xuất sửa cụ thể.

Cuối báo cáo, bổ sung:

- Những phần đang làm tốt.
- Năm rủi ro cần xử lý trước khi deploy production.
- Danh sách test nên bổ sung.
- Đề xuất cải thiện UI/bố cục, tách riêng khỏi lỗi chức năng.
