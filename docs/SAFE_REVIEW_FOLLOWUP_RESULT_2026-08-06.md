# Safe Review Follow-up Result — 2026-08-06

## Phạm vi và nguyên tắc

- Branch: `review/hardening-20260805`
- PR: `#1`
- PR head trước remediation: `bfb1a10984493da2b908c25b24d49ed16c1eb1bc`
- Đã đối chiếu source tại PR head, knowledge graph và các tài liệu review được chỉ định.
- Không merge `main`, không deploy production và không redeploy Apps Script production.
- Mọi kết luận dưới đây dựa trên tái hiện local sạch, direct RPC/RLS test, concurrency test hoặc E2E; không chỉ dựa trên việc thấy source đã thay đổi.

## Kết quả phân loại lại

| Finding                                                | Trước remediation        | Kết quả 2026-08-06       | Bằng chứng / quyết định                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blocker 01 — `npm ci`                                  | `CONFIRMED` trong review | `ALREADY_FIXED`          | Tái tạo `package-lock.json` trong Linux Node 24.19.0/npm 11.17.0, bổ sung `packageManager: npm@11.17.0` và pin cùng phiên bản npm trong workflow. Một lần `npm ci` Linux sạch cài 585 package, audit 0 vulnerability và đã có đủ dependency `@emnapi` lồng mà runner cần.                                                    |
| Blocker 02 — cross-room-type direct RPC                | `PARTIALLY_FIXED`        | `ALREADY_FIXED`          | `update_class_schedule_details` kiểm tra cả room type nguồn và đích, quyền sở hữu của Importer, đồng thời xác minh giảng viên active/role/scope. Negative test Staff chuyển chéo scope và Importer sửa lịch người khác đều bị từ chối; Admin hợp lệ vẫn thành công. Xem migration mới, phần `update_class_schedule_details`. |
| Blocker 03 — email Test bị chuyển sang Live            | `PARTIALLY_FIXED`        | `ALREADY_FIXED`          | Hàng đợi snapshot `delivery_mode_at_enqueue` khi insert; worker không retarget sau khi setting đổi. Test bao phủ Test→Live, Live→Test và Off→suppressed. Xem `supabase/migrations/20260806005732_safe_review_followup_hardening.sql:14` và `lib/email-notifications.ts:706`.                                                 |
| Blocker 04 — rolling app/Apps Script không tương thích | `CONFIRMED`              | `PARTIALLY_FIXED`        | Chốt maintenance window, protocol HMAC v3 và rollback trong `docs/APPS_SCRIPT_EMAIL_SETUP.md`. Chưa rehearsal/redeploy Apps Script vì phạm vi yêu cầu cấm redeploy production.                                                                                                                                               |
| Nonce replay protection                                | `PARTIALLY_FIXED`        | `ALREADY_FIXED`          | Apps Script giữ nonce theo TTL trong Script Properties dưới ScriptLock; nonce lặp trả `NONCE_REPLAY` trước provider. Unit test chứng minh cùng request chỉ gọi provider một lần. Xem `scripts/apps-script-email-webhook.gs:218`.                                                                                             |
| Canonical HMAC payload                                 | `CONFIRMED`              | `ALREADY_FIXED`          | Node và Apps Script cùng ký canonical JSON array có thứ tự, không còn nối chuỗi mơ hồ. Test bao phủ newline, Unicode và chuỗi rỗng. Xem `lib/email-webhook-signature.ts:17`.                                                                                                                                                 |
| Provider success nhưng DB ACK fail                     | `PARTIALLY_FIXED`        | `ALREADY_FIXED`          | Ghi mốc provider success; ACK lỗi chuyển `sent_unconfirmed`, không đưa về `failed` để gửi lại. Apps Script tiếp tục dùng dedupe key. Test state transition đã có. Xem `lib/email-notifications.ts:795`.                                                                                                                      |
| Test recipient có thể thoát `try/catch`                | `CONFIRMED`              | `ALREADY_FIXED`          | Đọc test recipient và toàn bộ delivery path đã nằm trong `try`; lỗi được ACK theo trạng thái an toàn.                                                                                                                                                                                                                        |
| Apps Script log spam/formula injection                 | `CONFIRMED`              | `ALREADY_FIXED`          | Unauthorized request chỉ log request hash rút gọn; mọi ô Sheet đi qua `safeCell_`. Test bao phủ chuỗi bắt đầu bằng công thức. Xem `scripts/apps-script-email-webhook.gs:64`.                                                                                                                                                 |
| Refresh shift pattern làm mất lịch sử                  | `PARTIALLY_FIXED`        | `ALREADY_FIXED`          | Materialization chỉ tác động occurrence tương lai/generated; giữ `completed`, `cancelled`, ca thủ công và metadata, đồng thời idempotent dưới advisory lock. pgTAP 5 assertions tại `supabase/tests/shift_refresh_history.sql`.                                                                                              |
| Validation phiếu thiết bị chỉ ở app                    | `PARTIALLY_FIXED`        | `ALREADY_FIXED`          | Trigger DB kiểm tra semester, độ dài ghi chú/lý do trễ và responsible lecturer; timing/state constraints hiện hữu vẫn được giữ. Direct insert/RPC negative tests bao phủ timing, self-assignment không hợp lệ và nội dung quá dài. Xem migration mới, `validate_equipment_request_content`.                                  |
| Bypass responsible lecturer khi actor tự chọn          | `CONFIRMED`              | `ALREADY_FIXED`          | Không còn nhánh bỏ qua khi `responsible_lecturer_id = actor`; luôn bắt buộc profile active, role Lecturer và đúng scope Kỹ năng Điều dưỡng.                                                                                                                                                                                  |
| Capability giao sớm gắn email                          | `PARTIALLY_FIXED`        | `ALREADY_FIXED`          | Xóa tác dụng capability cá nhân và reset giá trị cũ; mọi tài khoản phải qua `Đã soạn`. Giao sớm theo giờ hẹn vẫn được phép sau bước này, đúng quyết định nghiệp vụ.                                                                                                                                                          |
| Import tin hash caller                                 | `PARTIALLY_FIXED`        | `ALREADY_FIXED`          | DB tự tạo business key/hash canonical, so sánh hash caller, advisory-lock canonical hash và tự kiểm tra duplicate hiện hữu. Hash giả bị direct RPC từ chối. Xem migration mới, `private.import_schedule_hash` và `INVALID_IMPORT_HASH`.                                                                                      |
| Import batch partial success                           | `CONFIRMED`              | `ALREADY_FIXED`          | Giữ mô hình partial success đã chốt; bổ sung `completed_with_errors`, phân biệt `duplicate`, `conflict`, `system_error`, counters và file lỗi/UI tương ứng.                                                                                                                                                                  |
| Hard-delete và retention                               | `CONFIRMED`              | `CONFIRMED` — chưa xử lý | Quyết định retention/audit dài hạn cần migration riêng và kế hoạch chuyển dữ liệu. Không nằm trong 10 ưu tiên đã chốt cho lượt này; không thay đổi hành vi xóa để tránh tác động sản phẩm ngoài phạm vi.                                                                                                                     |
| Chữ ký base64 trong database                           | `CONFIRMED`              | `CONFIRMED` — chưa xử lý | Chuyển object storage cần bucket, RLS, migration/backfill và cập nhật PDF. Được tài liệu nghiệp vụ hoãn đến trước khi vận hành thật; không triển khai trong PR follow-up này.                                                                                                                                                |
| Negative/concurrency/critical E2E coverage             | `PARTIALLY_FIXED`        | `PARTIALLY_FIXED`        | Đã bổ sung direct negative tests, email replay/ACK tests, import concurrency, pgTAP history và suite E2E trọng yếu 18 test. Vẫn chưa thể gọi `ALREADY_FIXED` cho đến khi GitHub Actions của commit mới xanh và ma trận vai trò đầy đủ được mở rộng trong các PR tiếp theo.                                                   |

## Thay đổi chính

1. Migration mới `supabase/migrations/20260806005732_safe_review_followup_hardening.sql`:
   - snapshot mode email và trạng thái `sent_unconfirmed`;
   - harden RPC cập nhật lớp, import và phiếu thiết bị;
   - bảo toàn lịch sử ca trực;
   - canonical import hash/duplicate lock;
   - explicit revoke/grant cho function mới và function thay thế.
2. Email worker và Apps Script HMAC v3:
   - canonical payload dùng chung;
   - nonce replay store;
   - log an toàn;
   - provider success/DB ACK fail không tự retry.
3. Import partial-success:
   - trạng thái batch/row chi tiết;
   - UI và file lỗi phân biệt duplicate, conflict, system error.
4. CI:
   - pin npm 11;
   - chạy pgTAP và critical E2E;
   - seed lại fixture sau `supabase test db` vì lệnh này reset database.

## Kiểm thử local trên source cuối

| Lệnh                                         | Kết quả                                   |
| -------------------------------------------- | ----------------------------------------- |
| `npm ci` trên Linux Node 24.19.0/npm 11.17.0 | PASS — 585 packages, 0 vulnerabilities    |
| `npm run format:check`                       | PASS                                      |
| `npm audit`                                  | PASS — 0 vulnerabilities                  |
| `npx supabase db reset`                      | PASS — toàn bộ migration từ database rỗng |
| `npx supabase db lint --local --level error` | PASS — không có schema error              |
| `npm test`                                   | PASS — 42/42                              |
| `npm run test:db`                            | PASS — pgTAP 5/5                          |
| `npm run test:e2e:critical`                  | PASS — Playwright 18/18                   |
| `npm run lint`                               | PASS                                      |
| `npm run typecheck`                          | PASS                                      |
| `npm run build`                              | PASS — 34 routes generated/built          |

## Migration và rollback

- Migration follow-up chỉ được tạo mới; không sửa migration lịch sử.
- Migration thêm enum value nên rollback tự động toàn phần không an toàn. Nếu cần rollback trước production:
  1. dừng worker email;
  2. rollback application về commit trước;
  3. giữ cột/enum mới tương thích ngược;
  4. thay thế function bằng định nghĩa trước đó trong một forward migration có kiểm soát.
- Apps Script v3 **chưa được redeploy**. Khi triển khai thật phải theo maintenance window trong `docs/APPS_SCRIPT_EMAIL_SETUP.md`.

## Finding còn mở

1. Hard-delete/retention: cần một PR dữ liệu riêng, quyết định thời hạn và backfill audit.
2. Chữ ký base64: cần thiết kế Supabase Storage, RLS bucket, backfill và kiểm tra PDF.
3. Blocker triển khai rolling: tài liệu đã chốt nhưng chưa rehearsal do không được phép deploy/redeploy trong lượt này.
4. Coverage: local critical suite xanh, nhưng GitHub Actions của commit mới phải xanh trước khi đổi PR sang Ready for review.

## Trạng thái PR

- Commit follow-up sẽ được push trực tiếp vào `review/hardening-20260805`, vì vậy PR #1 tự cập nhật.
- Không đề xuất chuyển PR sang **Ready for review** tại thời điểm viết tài liệu này. Chỉ thực hiện sau khi toàn bộ GitHub Actions của commit đã push hiển thị xanh.
