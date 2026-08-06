# Safe Review Third Follow-up Result — 2026-08-06

## Phạm vi và trạng thái Git

- Repository: `baonguyen-kobe/eiu-medlabs`
- Pull Request: `#1`
- Branch: `review/hardening-20260805`
- HEAD đã xác minh trước khi sửa: `feac6116523d2c95d45daaa82db7c419cac5a939`
- Commit code third follow-up: `f12c73151f991052d2c679b766367fc09f9f6f21`
- Final HEAD third follow-up: `51586a733c710fb1675fe457983049dd4bd98ac5`
- GitHub Actions run: `31090172455`
- Verify job: `92579014468`
- Kết quả CI: `completed / success`
- Không merge `main`.
- Không deploy production.
- Không redeploy Apps Script production.

Từng finding trong `SAFE_REVIEW_THIRD_FOLLOWUP_2026-08-06.md` được tái hiện bằng direct RPC/RLS, migration từ database rỗng, pgTAP, unit test hoặc critical Playwright E2E trước khi phân loại lại.

## Kết quả tái phân loại

| ID                                                      | Trước       | Sau             | Thay đổi và bằng chứng                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------- | ----------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HIGH-01 — Importer làm mất quyền Lecturer               | `CONFIRMED` | `ALREADY_FIXED` | `private.can_modify_class_schedule` tính bốn nhánh quyền độc lập rồi OR kết quả theo action. Direct test xác nhận Lecturer+Importer được reschedule/details lớp được phân công, không assign/delete ngoài ownership; Importer-only chỉ quản lý lịch của mình/batch mình; gỡ role Importer không làm thay đổi quyền Lecturer. Kết quả nullable được `coalesce(false)` để không bypass wrapper. |
| HIGH-02 — Ca cùng ngày đã bắt đầu bị xóa/tạo lại        | `CONFIRMED` | `ALREADY_FIXED` | Trigger bảo vệ theo `shift_date + start_time`; materializer chỉ insert/update occurrence có timestamp tương lai. pgTAP 16/16 bao phủ started/future cùng ngày, completed, cancelled, metadata, manual, replace, cancel, refresh và idempotency.                                                                                                                                               |
| MEDIUM-01 — UI conflict hiển thị Hợp lệ                 | `CONFIRMED` | `ALREADY_FIXED` | `conflict` hiển thị `Xung đột`, có style riêng, row-error và nội dung hướng dẫn đúng. Playwright xác nhận label, class lỗi và loại dòng conflict.                                                                                                                                                                                                                                             |
| MEDIUM-02 — Preview không thấy conflict trong cùng file | `CONFIRMED` | `ALREADY_FIXED` | Phân loại tuần tự, deterministic; dòng hợp lệ đầu tiên có ưu tiên. Unit test bao phủ exact duplicate, overlap phòng, overlap giảng viên, adjacent time, khác ngày và dòng invalid không chặn dòng sau.                                                                                                                                                                                        |
| MEDIUM-03 — Lịch import cancelled vẫn giữ hash          | `CONFIRMED` | `ALREADY_FIXED` | `find_existing_import_hashes` join `class_schedules` và loại `schedule_status = cancelled`. Direct DB test xác nhận hash active có kết quả, sau cancel không còn kết quả. Execution RPC vẫn dùng DB-derived canonical hash và chỉ chặn lịch chưa cancelled.                                                                                                                                   |

## File thay đổi chính

- Database authorization/history/hash:
  - `supabase/migrations/20260806091334_third_followup_hardening.sql`
  - `supabase/schemas/01_app.sql`
  - `supabase/schemas/02_room_type_scopes.sql`
- Import preview/UI:
  - `app/schedule-entry/import/actions.ts`
  - `components/import-wizard.tsx`
  - `lib/import-preview-conflicts.ts`
  - `app/globals.css`
- Tests:
  - `tests/local-supabase.test.mjs`
  - `tests/import-preview-conflicts.test.mjs`
  - `tests/e2e/skills-import-export-tkb.spec.ts`
  - `supabase/tests/shift_refresh_history.sql`
- Tài liệu:
  - `docs/SAFE_REVIEW_SECOND_FOLLOWUP_2026-08-06.md` — sửa SHA malformed.
  - `docs/SAFE_REVIEW_THIRD_FOLLOWUP_2026-08-06.md` — đưa finding reviewer vào branch.

## Kết quả local

| Lệnh                                         | Kết quả                                     |
| -------------------------------------------- | ------------------------------------------- |
| `npm ci`                                     | PASS — 721 packages                         |
| `npm run format:check`                       | PASS                                        |
| `npm audit`                                  | PASS — 0 vulnerabilities                    |
| `npx supabase db reset --local`              | PASS — migration từ database rỗng           |
| Seed isolated fixtures                       | PASS                                        |
| `npx supabase db lint --local --level error` | PASS — 0 schema errors                      |
| `npm run lint`                               | PASS                                        |
| `npm run typecheck`                          | PASS                                        |
| `npm test`                                   | PASS — 51/51                                |
| `npm run test:db`                            | PASS — pgTAP 16/16                          |
| `npm run test:e2e:critical`                  | PASS — Playwright 19/19                     |
| `npm run build`                              | PASS — Next.js production bundle, 34 routes |
| `python -m graphify update .`                | PASS — 1.758 nodes, 3.164 edges             |

Lần chạy `npm ci` đầu tiên trên Windows bị `EPERM` do ba worker Next.js cũ giữ file native `lightningcss`. Các process đúng workspace đã được dừng; `npm ci` sau đó PASS. Kết quả PASS ở bảng là lần chạy sạch sau khi loại nhiễu môi trường.

## GitHub Actions

CI third follow-up đã hoàn tất xanh trên HEAD `51586a733c710fb1675fe457983049dd4bd98ac5`: run `31090172455`, job `92579014468`, kết quả `completed / success`.

## Finding còn mở

### Trong phạm vi third follow-up

- Không còn High finding mở sau khi direct DB, pgTAP và E2E đều xanh.
- Không còn Medium finding mở trong năm finding được giao.

### Blocker trước production không thuộc remediation lần này

1. Dữ liệu đã có liên kết không được hard-delete; cần hoàn tất data-lifecycle/soft-delete và script reset có environment guard.
2. Chữ ký phải chuyển sang private Supabase Storage, có RLS, signed URL, hash/metadata và backfill trước production.
3. Apps Script production chưa redeploy/rehearsal theo đúng giới hạn task.
4. `supabase db diff --local --schema public,private` vẫn cho thấy schema declarative cũ có drift rộng ngoài các function third follow-up; không áp dụng các DROP do diff đề xuất. Migration reset và DB lint của migration chain thực tế đều PASS. Cần một PR schema-reconciliation riêng để tránh trộn hardening với thay đổi schema rộng.

## Kết luận PR

- Năm finding third follow-up đã được xử lý và có test tự động.
- Không còn High finding mở trong phạm vi review này.
- Chỉ đề xuất chuyển PR #1 sang **Ready for review** nếu workflow GitHub Actions `verify` trên final HEAD hoàn tất `success`.
- Vẫn không merge và không production cho đến khi các production blocker được xử lý.
