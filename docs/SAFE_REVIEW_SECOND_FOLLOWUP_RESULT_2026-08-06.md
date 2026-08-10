# Safe Review Second Follow-up Result — 2026-08-06

## Phạm vi và trạng thái Git

- Repository: `baonguyen-kobe/eiu-medlabs`
- Pull Request: `#1`
- Branch: `review/hardening-20260805`
- HEAD đã xác minh trước khi sửa: `8cc57a926023de7feba49c11d5203784a802547d`
- Commit code second follow-up: `5a65c0d5d20ffa3bbd7ffc63ae60ed418c14df58`
- Không merge `main`.
- Không deploy production.
- Không redeploy Apps Script production.

Mọi finding được tái hiện bằng source, migration từ database rỗng, direct RPC/RLS, concurrency test hoặc critical E2E. Không phân loại chỉ dựa trên việc source có vẻ đã sửa.

## Kết quả tái phân loại

| ID                                                              | Trước                              | Sau                                            | Thay đổi chính                                                                                                                                                                                                                                            | Bằng chứng                                                                                                                                         | Chặn merge | Chặn production |
| --------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------- |
| HIGH-01 — Ownership Importer không nhất quán                    | `CONFIRMED`                        | `ALREADY_FIXED`                                | Helper chung `private.can_modify_class_schedule` được áp dụng cho `reschedule_class`, `assign_class_lecturers`, `update_class_schedule_details` và delete policy. Importer chỉ thao tác lịch do mình tạo hoặc thuộc batch của mình, trong scope được gán. | Direct RPC test: lịch manual của mình PASS; batch của mình PASS; reschedule/assign/delete lịch người khác bị từ chối; batch người khác bị từ chối. | Không      | Không           |
| HIGH-02 — Staff quản lý phiếu thiết bị ngoài room-type scope    | `CONFIRMED`                        | `ALREADY_FIXED`                                | Helper `can_manage_equipment_schedule/request`, wrapper cho hai manager RPC, RLS scoped cho request/item và mutation trigger DB. API PDF và page dùng client theo phiên nên cùng chịu RLS.                                                                | Staff ngoài scope bị từ chối direct status RPC, late-review RPC, delete request và insert item; Staff đúng scope PASS.                             | Không      | Không           |
| HIGH-03 — Thay/hủy pattern xóa lịch sử ca trực                  | `CONFIRMED`                        | `ALREADY_FIXED`                                | DB chỉ cho xóa occurrence `generated`, tương lai và chưa `completed/cancelled`; ca manual, past, completed, cancelled được bảo toàn.                                                                                                                      | pgTAP 9/9: refresh idempotent, thay pattern và hủy pattern đều giữ completed/cancelled và metadata.                                                | Không      | Không           |
| MEDIUM-01 — Race khi chuyển email sang Off                      | `CONFIRMED`                        | `ALREADY_FIXED`                                | RPC `set_email_delivery_mode` cập nhật mode và chỉ suppress `pending` trong cùng transaction. Row `processing` thuộc worker; provider success nhưng ACK không khớp được ghi `sent_unconfirmed`, không retry.                                              | Direct concurrency/state test xác nhận row đã claim vẫn `processing` khi Off; unit test ACK failure không thành retryable failure.                 | Không      | Không           |
| MEDIUM-02 — Unauthorized request spam Google Sheet              | `CONFIRMED`                        | `ALREADY_FIXED`                                | Request sai HMAC không append Sheet; chỉ ghi hash rút gọn vào execution log. Request authenticated nhưng invalid vẫn có log an toàn, chống formula injection.                                                                                             | 25 request unauthorized liên tiếp: 0 Sheet row, 0 email; replay/timestamp/formula tests PASS.                                                      | Không      | Không           |
| MEDIUM-03 — Preview import không thấy manual duplicate/conflict | `CONFIRMED`                        | `ALREADY_FIXED`                                | Preview so business key với tất cả lịch manual/import cùng khoảng ngày, tải song song lịch cùng phòng và cùng giảng viên; phân biệt `duplicate` và `conflict`. Execution vẫn là authority cuối và giữ partial success.                                    | Unit test manual duplicate, overlap phòng và overlap giảng viên khác phòng PASS; import hash/concurrency direct tests hiện hữu PASS.               | Không      | Không           |
| Direct RPC, negative, concurrency và critical E2E coverage      | `PARTIALLY_FIXED`                  | `ALREADY_FIXED` trong phạm vi second follow-up | Bổ sung ma trận ownership/scope, email Off race, Apps Script abuse, preview conflict và pgTAP history; giữ critical UI suite.                                                                                                                             | Unit/direct 48/48; pgTAP 9/9; Playwright critical 18/18; GitHub Actions xanh.                                                                      | Không      | Không           |
| `npm ci`/lockfile                                               | `ALREADY_FIXED` từ follow-up trước | `ALREADY_FIXED`                                | Không cần sửa thêm. Workflow pin npm 11.17.0 và cài bằng `npm ci`.                                                                                                                                                                                        | GitHub Actions step `Install dependencies` PASS; audit 0 vulnerability.                                                                            | Không      | Không           |

## File thay đổi

- Authorization/migration:
  - `supabase/migrations/20260806090000_second_followup_authorization.sql`
  - `supabase/schemas/01_app.sql`
  - `supabase/schemas/02_room_type_scopes.sql`
  - `supabase/schemas/03_registration_workflows.sql`
- Email và Apps Script source:
  - `app/email-notifications/actions.ts`
  - `lib/email-notifications.ts`
  - `scripts/apps-script-email-webhook.gs`
- Import preview:
  - `app/schedule-entry/import/actions.ts`
  - `components/import-wizard.tsx`
  - `lib/import-preview-conflicts.ts`
- Tests:
  - `tests/local-supabase.test.mjs`
  - `tests/email-webhook-security.test.mjs`
  - `tests/import-preview-conflicts.test.mjs`
  - `supabase/tests/shift_refresh_history.sql`
- Tài liệu reviewer được đưa vào branch:
  - `docs/SAFE_REVIEW_SECOND_FOLLOWUP_2026-08-06.md`

## Test đã thêm hoặc mở rộng

1. Importer own manual/own batch/other owner/other batch cho reschedule, assign và delete.
2. Staff đúng/ngoài room-type scope cho status, late approval, request delete và item insert.
3. Email Off trong khi notification đã `processing`.
4. 25 unauthorized Apps Script request không tạo Sheet row.
5. Provider success + DB ACK fail chuyển sang trạng thái không retry.
6. Preview manual duplicate, room conflict và lecturer conflict.
7. Pattern refresh/replace/cancel bảo toàn completed, cancelled, past và metadata.

## Kết quả local trên commit code

| Lệnh                                         | Kết quả                                     |
| -------------------------------------------- | ------------------------------------------- |
| `npm run format:check`                       | PASS                                        |
| `npm audit`                                  | PASS — 0 vulnerabilities                    |
| `npx supabase db reset`                      | PASS — migration từ database rỗng           |
| `npx supabase db lint --local --level error` | PASS — 0 schema error                       |
| `npm run lint`                               | PASS                                        |
| `npm run typecheck`                          | PASS                                        |
| `npm test`                                   | PASS — 48/48                                |
| `npm run test:db`                            | PASS — pgTAP 9/9                            |
| `npm run test:e2e:critical`                  | PASS — Playwright 18/18                     |
| `npm run build`                              | PASS — Next.js production bundle, 34 routes |

## GitHub Actions thật

- Commit code được kiểm chứng: `5a65c0d5d20ffa3bbd7ffc63ae60ed418c14df58`
- Workflow run: [CI run 31078393031](https://github.com/baonguyen-kobe/eiu-medlabs/actions/runs/31078393031)
- Job: [verify 92541363093](https://github.com/baonguyen-kobe/eiu-medlabs/actions/runs/31078393031/job/92541363093)
- Kết quả: `completed/success`

| Bước CI                                                  | Kết quả |
| -------------------------------------------------------- | ------- |
| Checkout, Node setup, pin npm 11.17.0                    | PASS    |
| `npm ci`                                                 | PASS    |
| Format check                                             | PASS    |
| Dependency audit                                         | PASS    |
| Start Supabase, reset migration, tạo env và seed fixture | PASS    |
| DB lint                                                  | PASS    |
| ESLint                                                   | PASS    |
| TypeScript                                               | PASS    |
| Unit/direct database tests                               | PASS    |
| pgTAP history tests                                      | PASS    |
| Restore E2E fixture                                      | PASS    |
| Chromium install                                         | PASS    |
| Critical E2E                                             | PASS    |
| Production build                                         | PASS    |

## Finding còn mở

### Không còn High finding mở trong second follow-up

Ba finding `HIGH-01`, `HIGH-02`, `HIGH-03` đều đã có enforcement ở DB và negative test xanh. Vì vậy chúng không còn chặn việc chuyển PR sang Ready for review.

### Blocker trước production

1. Hard-delete/soft-delete đầy đủ cho dữ liệu đã có liên kết vẫn `CONFIRMED — CHƯA XỬ LÝ`; cần PR data-lifecycle riêng.
2. Chữ ký base64 phải chuyển sang Supabase private Storage, signed URL, RLS, hash/metadata và backfill trước production.
3. Apps Script HMAC source đã harden nhưng production chưa redeploy/rehearsal, đúng giới hạn của task. Phải thực hiện maintenance window trong `docs/APPS_SCRIPT_EMAIL_SETUP.md` trước khi bật Live.

## Kết luận PR

- Không có High finding mở trong phạm vi second follow-up.
- Commit code đã có CI thật xanh toàn bộ.
- Đề xuất chuyển PR #1 sang **Ready for review** sau khi commit báo cáo này cũng có CI xanh.
- Không merge và không production cho đến khi các production blocker ở trên được xử lý.
