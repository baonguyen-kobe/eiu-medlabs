# Safe Review Fourth Follow-up Personnel Result — 2026-08-06

## Phạm vi và trạng thái Git

- Repository: `baonguyen-kobe/eiu-medlabs`
- Pull Request: `#1`
- Branch: `review/hardening-20260805`
- HEAD xác minh trước khi sửa: `51586a733c710fb1675fe457983049dd4bd98ac5`
- Không merge `main`.
- Không deploy production.
- Không redeploy Apps Script production.

## Tái phân loại finding

| ID                                                               | Trước       | Sau             | Kết quả và bằng chứng                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ----------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH-01 — Importer vẫn bị đồng nhất với Trợ giảng                | `CONFIRMED` | `ALREADY_FIXED` | Bổ sung role `teaching_assistant`; `profiles.can_import_schedules` là capability độc lập. Enum `importer` chỉ còn để migration tương thích, trigger chặn mọi write mới. Backfill chuyển Importer cũ thành capability và chỉ dùng Trợ giảng khi tài khoản cũ không có role chính khác. UI, navigation và template không ghi role Importer mới. |
| HIGH-02 — Quyền tạo/sửa lịch của Trợ giảng và Lecturer chưa tách | `CONFIRMED` | `ALREADY_FIXED` | DB helper/policy tách Admin, Staff, Teaching Assistant owner, Lecturer phải nằm trong lịch, và import-batch owner có capability. Import capability không cấp quyền Staff/manual. Direct tests bao phủ TA có/không capability, lecturer tự phân công, batch owner và negative ownership.                                                       |
| HIGH-03 — Cập nhật role/scope nhân sự không có transaction       | `CONFIRMED` | `ALREADY_FIXED` | RPC `admin_update_personnel` khóa row, kiểm tra `access_version`, validation self/last-admin/viewer/capability/scope/email, rồi cập nhật profile + roles + scopes trong một transaction. Test xác nhận stale write và validation lỗi không tạo partial state.                                                                                 |
| MEDIUM-01 — Email Auth/profile có thể lệch                       | `CONFIRMED` | `ALREADY_FIXED` | Server action cập nhật Auth trước, gọi RPC DB, rollback Auth nếu DB thất bại; nếu rollback cũng thất bại thì ghi `personnel_auth_reconciliation_logs` để quản trị viên xử lý. UI chỉ cập nhật row sau khi cả hai bước thành công.                                                                                                             |
| MEDIUM-02 — Trang Nhân sự tải toàn bộ rồi phân trang             | `CONFIRMED` | `ALREADY_FIXED` | RPC `admin_list_personnel` lọc/tìm kiếm/phân trang trong DB, giới hạn 50 dòng, trả `total_count`; page chỉ hydrate đúng trang hiện tại.                                                                                                                                                                                                       |
| MEDIUM-03 — Bố cục/nút Nhân sự chưa phù hợp                      | `CONFIRMED` | `ALREADY_FIXED` | Danh sách compact table + badge + drawer chỉnh sửa; một nút Lưu chung; có dirty/pending/error state, cảnh báo đóng khi chưa lưu và confirm khóa tài khoản.                                                                                                                                                                                    |
| MEDIUM-04 — Import nhân sự chưa tách role/capability             | `CONFIRMED` | `ALREADY_FIXED` | Template thêm cột `Quyền nhập lịch`, hỗ trợ role hiển thị `Trợ giảng`, mapping boolean rõ ràng và backward compatibility cho file có `Importer`. Import mới không phát sinh role kỹ thuật deprecated.                                                                                                                                         |

Không còn High finding mở trong phạm vi fourth follow-up.

## Database và authorization

- Declarative schema:
  - `supabase/schemas/01_app.sql`
  - `supabase/schemas/02_room_type_scopes.sql`
  - `supabase/schemas/03_registration_workflows.sql`
  - `supabase/schemas/04_personnel_permissions.sql`
- Migration:
  - `20260806101257_fourth_followup_personnel_foundation.sql`
  - `20260806101259_fourth_followup_personnel_authorization.sql`
  - `20260806103321_fourth_followup_import_rpc_scope.sql`
- Mọi RPC import đang dùng capability + room-type scope. Signature cũ của `find_existing_import_hashes(text[])` bị xóa; caller phải truyền room type.
- `record_import_validation_row` và direct `import_rows` insert kiểm tra batch owner, trạng thái batch và capability.
- Role `importer` trong dữ liệu active sau reset/backfill: 0.

## UI, import và reconciliation

- Trang Nhân sự dùng server-side filter/pagination và drawer.
- Role chính có `Trợ giảng`; quyền `Cho phép nhập lịch` hiển thị riêng.
- Workspace và menu import dùng capability, không suy từ role.
- Template/Import nhân sự dùng tên hiển thị, cột `Quyền nhập lịch`, ví dụ và hướng dẫn tương thích file cũ.
- Đổi email Auth/profile có rollback và hàng đợi reconciliation khi rollback thất bại.

## Test local

| Lệnh                                         | Kết quả                          |
| -------------------------------------------- | -------------------------------- |
| `npm ci`                                     | PASS                             |
| `npm run format:check`                       | PASS                             |
| `npm audit`                                  | PASS — 0 vulnerabilities         |
| `npx supabase db reset --local`              | PASS                             |
| Seed isolated fixtures                       | PASS                             |
| `npx supabase db lint --local --level error` | PASS                             |
| `npm run lint`                               | PASS                             |
| `npm run typecheck`                          | PASS                             |
| `npm test`                                   | PASS — 53/53                     |
| `npm run test:db`                            | PASS — pgTAP 16/16               |
| `npm run test:e2e:critical`                  | PASS — Playwright 20/20          |
| `npm run build`                              | PASS — Next.js bundle, 34 routes |
| `python -m graphify update .`                | PASS                             |

## GitHub Actions

Final HEAD, run và job được ghi trong PR #1 và bàn giao cuối sau khi workflow trên chính HEAD cuối hoàn tất. Không dùng CI của HEAD cũ để kết luận.

## Finding và blocker còn mở

Không còn High/Medium finding mở trong phạm vi personnel/role/import permission của fourth follow-up.

Các blocker production đã có từ vòng trước vẫn giữ nguyên:

1. Hoàn tất data lifecycle/soft-delete và environment guard cho thao tác reset/destructive.
2. Chuyển chữ ký sang private Supabase Storage với RLS, signed URL, hash/metadata và backfill.
3. Reconcile declarative schema với migration history trước production; `supabase db diff` hiện vẫn phản ánh drift lịch sử rộng, nên không áp dụng diff phá hủy tự động.
4. Redeploy Apps Script production và smoke test chỉ thực hiện ở một đợt production được phê duyệt riêng.

## Kết luận

Fourth follow-up đủ điều kiện đề xuất chuyển PR sang **Ready for review** khi GitHub Actions trên final HEAD xanh. Báo cáo này không tự merge PR và không thực hiện bất kỳ deployment production nào.
