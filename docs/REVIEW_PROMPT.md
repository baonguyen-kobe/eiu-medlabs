# Prompt gửi AI reviewer

Hãy review toàn diện dự án MedLabs Calendar trong archive này.

Đọc theo thứ tự:

1. `docs/AI_REVIEW_BRIEF.md`
2. `docs/UI_LAYOUT_SPEC.md`
3. `AGENTS.md` và `openspec/config.yaml`
4. Toàn bộ `supabase/schemas/*.sql` liên quan đến finding; không coi riêng `01_app.sql` là schema hiện hành.
5. `components/dashboard.tsx`
6. `app/schedule-entry/import/actions.ts`
7. Các OpenSpec, route, migration và test liên quan theo phạm vi finding.

Phạm vi review:

- Nghiệp vụ và phân quyền đa vai trò.
- Supabase RLS, RPC, grants, trigger và race condition.
- Import CSV/XLSX, validation, duplicate handling và transaction consistency.
- Vòng đời published/cancelled/completed và các enum legacy còn giữ cho tương thích.
- React/Next.js Server Action, hydration và performance.
- Giao diện tháng/tuần/danh sách.
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
