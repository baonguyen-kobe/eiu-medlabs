# Safe Review — Fifth Follow-up Result: Personnel Authority

Ngày hoàn tất local: 06/08/2026  
Branch: `review/hardening-20260805`  
Starting HEAD: `7bcf97f62538cbef39506b6e1b2ae6d5265e75d1`  
Code commit: `5800708` (`Harden personnel authority and atomic imports`)  
Final HEAD: commit chứa báo cáo này; hash chính xác được ghi trong PR #1 và bàn giao cuối để tránh tự tham chiếu làm thay đổi hash.  
Trạng thái PR đề xuất: tiếp tục **Draft / Request changes** cho đến khi CI của final HEAD xanh và reviewer xác nhận vòng tiếp theo.

## 1. Phạm vi và giới hạn

Vòng này chỉ thay đổi branch review. Không merge `main`, không deploy Vercel production, không chạy migration production và không redeploy Apps Script production.

## 2. Phân loại lại finding

| Finding                                     | Phân loại tái hiện | Kết quả                            | Bằng chứng chính                                                                                                                         |
| ------------------------------------------- | ------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH-01 — nullable RPC bypass               | `CONFIRMED`        | `FIXED`                            | `admin_update_personnel` bắt buộc version và ba boolean khác `NULL`; direct negative tests cho Root, Bảo, Admin thường.                  |
| HIGH-02 — Admin có thể loại bỏ lẫn nhau     | `CONFIRMED`        | `FIXED` bằng mô hình authority mới | Singleton UUID xác định Root/Bảo; Root bất biến; chỉ Root sửa Admin hiện hữu; optimistic concurrency vẫn bắt stale writer.               |
| HIGH-03 — import nhân sự không atomic       | `CONFIRMED`        | `FIXED`                            | `admin_apply_personnel_import` xử lý profile/role/scope/mode `all` trong một transaction; failure-injection chứng minh rollback toàn bộ. |
| MEDIUM-01 — thiếu `conflict`/`system_error` | `CONFIRMED`        | `FIXED`                            | `record_import_validation_row` nhận đủ bốn trạng thái và test đọc lại hai trạng thái mới.                                                |
| MEDIUM-02 — hash RPC không giới hạn         | `CONFIRMED`        | `FIXED`                            | Từ chối `NULL` và 501 phần tử, chấp nhận mảng rỗng và đúng 500 phần tử, vẫn kiểm tra capability/scope.                                   |

Không còn High finding mở trong đúng phạm vi Fifth Follow-up.

Trong khi tái hiện, phát hiện thêm một bypass RLS: policy mutation ban đầu cho phép Bảo ghi trực tiếp `profiles`, `user_roles` và `profile_room_types` ngoài RPC. Đã sửa thành policy chỉ đọc; mọi mutation Personnel của application bắt buộc đi qua RPC atomic. Test direct-table negative đã được bổ sung.

## 3. Database và migration

Các file mới:

- `supabase/migrations/20260806131136_fifth_followup_personnel_authority.sql`
- `supabase/schemas/05_personnel_authority.sql`
- `supabase/tests/personnel_authority.sql`

Migration và declarative schema có cùng SHA-256 tại thời điểm kiểm tra local.

Các phần chính:

- Bảng singleton `system_security_principals` lưu `root_admin_id` và `personnel_manager_id` bằng UUID.
- `anon`/`authenticated` không đọc hoặc sửa trực tiếp singleton; service role chỉ có `SELECT`, `INSERT`, `UPDATE`.
- Helpers `is_root_administrator`, `is_secondary_personnel_manager`, `can_manage_personnel`, `is_protected_security_principal`, `is_current_admin`.
- Trigger chặn khóa/xóa profile Root và chặn gỡ/đổi role Admin của Root, kể cả thao tác của database owner.
- `get_personnel_authority_context` là nguồn quyền duy nhất cho route/menu/actions.
- `admin_list_personnel` chỉ cho Root/Bảo, trả metadata authority/read-only.
- `admin_update_personnel` khóa target, kiểm tra version, tham số nullable, self-edit, Root và Admin hiện hữu; cập nhật profile/role/scope/audit trong một transaction.
- `admin_apply_personnel_import` áp dụng bulk import trong một transaction, tăng `access_version`, bỏ qua Root/Bảo/Admin hiện hữu và chỉ khóa non-admin bị thiếu ở mode `all`.
- Khi singleton chưa cấu hình, RPC Personnel trả `PERSONNEL_SECURITY_NOT_CONFIGURED` (deny by default).

## 4. Bootstrap và local seed

Script mới: `scripts/bootstrap-personnel-security.mjs`.

Script:

- Dùng `SUPABASE_SECRET_KEY`.
- Đọc `ROOT_ADMIN_EMAIL` và `PERSONNEL_MANAGER_EMAIL`.
- Chuẩn hóa lowercase, yêu cầu đúng một profile cho mỗi email, hai UUID khác nhau, active và có role Admin.
- Có `--dry-run`, không in token/secret.
- Upsert đúng một singleton và ghi audit khi chạy thật.

Tài liệu vận hành: `docs/PERSONNEL_SECURITY_BOOTSTRAP.md`.

Seed local đã thêm ba persona:

| Persona            | Email local                | UUID của lần reset cuối                       |
| ------------------ | -------------------------- | --------------------------------------------- |
| Root Administrator | `admin@campus.local`       | `52cf8d4e-2f8b-44fe-8d25-6f545208f1a1`        |
| Personnel Manager  | `bao.nguyen@eiu.edu.vn`    | `ff8b4761-0132-42c4-b696-2e374b798876`        |
| Admin thông thường | `admin.other@campus.local` | UUID local động, không dùng cho authorization |

Các UUID trên chỉ là dữ liệu local và thay đổi sau mỗi reset; runtime production không hard-code email hoặc UUID này.

Seed cũ từng gửi hai SQL statements trong một lệnh `supabase db query`, làm CLI không ghi singleton nhưng script vẫn in thành công. Đã tách thành hai lệnh, kiểm tra `$LASTEXITCODE` và fail-fast. Reset cuối xác nhận singleton count bằng 1.

## 5. Route, menu, action và UI

| Actor                    | Menu Nhân sự | Route `/admin/personnel` | List RPC |            Sửa non-admin |                              Sửa Admin hiện hữu |
| ------------------------ | -----------: | -----------------------: | -------: | -----------------------: | ----------------------------------------------: |
| Root                     |           Có |                       Có |       Có |                       Có |                 Có, trừ security của chính Root |
| Bảo                      |           Có |                       Có |       Có | Có, kể cả nâng lên Admin | Không; sau khi nâng, target trở thành read-only |
| Admin thường             |        Không |                 Redirect |  Từ chối |                  Từ chối |                                         Từ chối |
| Staff/Lecturer/TA/Viewer |        Không |                 Redirect |  Từ chối |                  Từ chối |                                         Từ chối |

`canManagePersonnel` được lấy từ RPC authority và truyền vào `WorkspaceShell` trên toàn bộ page. Không còn suy quyền menu từ role `admin`.

Drawer hiển thị badge `Root Administrator` và `Quản lý nhân sự`; tài khoản được bảo vệ dùng nút `Xem`, field disabled và có giải thích. Bảo được cảnh báo rõ rằng sau khi nâng non-admin lên Admin, chỉ Root mới sửa tiếp được.

Các server action Personnel legacy đã bị vô hiệu hóa và không còn ghi nhiều bảng trực tiếp.

## 6. Atomic import và concurrency

Đã kiểm tra:

- Một row hợp lệ đứng trước row role sai vẫn rollback toàn bộ transaction.
- Profile, role, scope, capability, active status và version không thay đổi sau lỗi.
- Import thành công tăng `access_version`.
- Drawer dùng version cũ sau import nhận `PERSONNEL_CHANGED_RELOAD_REQUIRED`.
- Root và Bảo cùng sửa một non-admin: đúng một request thành công, request còn lại stale.
- Hai session Root cùng sửa một Admin: đúng một request thành công, request còn lại stale.
- Bảo nâng non-admin thành Admin thành công; lần sửa tiếp theo của Bảo bị `ROOT_ADMIN_REQUIRED_FOR_ADMIN_ACCOUNT`; Root sửa được.
- Payload có Root/Bảo được bỏ qua và ghi audit, không thay đổi dữ liệu.

Việc tạo Auth user mới diễn ra trước transaction Postgres vì Supabase Auth không cùng transaction với database. Nếu RPC lỗi, server xóa các Auth user vừa tạo. Đây là compensating cleanup, không phải distributed transaction; chưa được phân loại là High trong phạm vi reviewer hiện tại.

## 7. Test matrix thực tế tại code commit

| Lệnh                                           | Kết quả local                                |
| ---------------------------------------------- | -------------------------------------------- |
| `npm run check`                                | PASS — lint, typecheck, **56/56** Node tests |
| `npm run test:db`                              | PASS — **23/23** pgTAP assertions, 2 files   |
| `npm run build`                                | PASS — Next.js production build              |
| `npm run test:e2e:critical`                    | PASS — **21/21** Chromium E2E                |
| `npm run format:check`                         | PASS                                         |
| `git diff --check`                             | PASS                                         |
| Clean `supabase db reset --local` + local seed | PASS; singleton count = 1                    |

Direct/negative tests gồm: Admin thường/Staff gọi list-update RPC, bốn nullable inputs, direct table mutation, Root self-edit, Bảo self-edit, Bảo sửa Admin, Root trigger invariant, import protected accounts, status/hash capability và deny-by-default khi singleton thiếu.

E2E mới xác nhận Bảo thấy Personnel và các Admin ở chế độ `Xem`, trong khi Admin thường không thấy menu và bị redirect khi nhập URL trực tiếp.

## 8. Audit

Các action chính:

- `personnel.security_bootstrapped`
- `personnel.created`
- `personnel.updated`
- `personnel.locked`
- `personnel.unlocked`
- `personnel.role_granted`
- `personnel.role_revoked`
- `personnel.capability_changed`
- `personnel.scope_changed`
- `personnel.import_applied`
- `personnel.import_skipped_protected_account`

Metadata ghi actor authority, old/new version và thay đổi liên quan nhưng không ghi password, token hoặc service key. Reconciliation log chỉ Root đọc được.

## 9. CI và PR

CI final HEAD: cập nhật sau khi push commit báo cáo; link run và verify job được ghi trong PR #1 và bàn giao cuối. PR body phải được thay toàn bộ, không append lịch sử cũ.

## 10. Finding còn mở và production blockers

Không còn High finding mở thuộc Fifth Follow-up. Các blocker production đã được giữ nguyên:

1. Hoàn tất data lifecycle/soft-delete và guard cho destructive/reset operation.
2. Chuyển chữ ký sang private Supabase Storage, backfill và signed URL.
3. Reconcile declarative schema với toàn bộ migration history.
4. Rehearsal Apps Script và redeploy production có phê duyệt riêng.
5. Xác định email Root production, chạy bootstrap dry-run rồi bootstrap thật trước khi mở traffic.
6. Review compensating cleanup giữa Supabase Auth và Postgres cho các lỗi hạ tầng hiếm.

Do còn production blockers ngoài phạm vi vòng này, PR tiếp tục để **Draft** dù các High finding của Fifth Follow-up đã đóng.
