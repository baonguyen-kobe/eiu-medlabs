# Safe Review — Ninth Follow-up after Eighth

**Ngày review:** 07/08/2026  
**Repository:** `baonguyen-kobe/eiu-medlabs`  
**PR:** `#1` — `Hardening authorization, imports, email, and equipment workflows`  
**Branch:** `review/hardening-20260805`  
**Final HEAD reviewed:** `e3f752b021d24a9c161761ab22e6353e60986082`  
**Eighth implementation commit:** `032418cac26808260475c8b373ced62874f85e93`  
**Final metadata commit:** `e3f752b021d24a9c161761ab22e6353e60986082`  
**CI final HEAD:** run `31149697329`  
**Verify job:** `92776617537` — `completed / success`  
**PR state:** Open / Draft / not merged / not deployed  
**Verdict:** **EIGHTH CORE FIXES ACCEPTED, nhưng tiếp tục giữ PR Draft để xử lý Ninth + Remaining Workflows**

---

# 1. Xác minh delivery

GitHub hiện xác nhận:

```text
PR #1: open
Draft: true
Merged: false
Final HEAD:
e3f752b021d24a9c161761ab22e6353e60986082
```

Diff:

```text
032418c -> e3f752b
```

chỉ thay đổi:

```text
docs/SAFE_REVIEW_EIGHTH_FOLLOWUP_AFTER_SEVENTH_RESULT_2026-08-07.md
```

Do đó code implementation Eighth thực tế là:

```text
032418cac26808260475c8b373ced62874f85e93
```

Commit:

```text
e3f752b...
```

là commit hoàn thiện delivery metadata/report.

---

# 2. CI final HEAD

Final CI:

```text
Run: 31149697329
Verify job: 92776617537
Conclusion: success
```

CI đã chạy thành công:

```text
format check
npm audit
Supabase start/reset
DB lint
application lint
typecheck
Node/integration tests
pgTAP
critical E2E
production build
```

Số test từ CI log:

```text
Node/integration: 64/64 PASS
Database pgTAP: 55/55 PASS
Critical E2E: 21/21 PASS
Production build: PASS
```

Điều này xác nhận con số `55/55` DB mà executor bàn giao.

---

# 3. Eighth findings — trạng thái sau review

## Personnel crash window

### Code

```text
FIXED
```

`reconcileExpiredPersonnelUpdates()` hiện scan:

```text
reserved
auth_updated
rollback_required
reconciliation_required
```

Expired `reserved` không còn bị `begin_personnel_update()` tự chuyển thành `expired` trước khi đối soát.

Reconciler xử lý đúng các case chính:

```text
Profile=requested + Auth=requested + version advanced
=> committed

Profile=previous + Auth=requested
=> rollback Auth về previous
=> rolled_back

Profile=previous + Auth=previous
=> rolled_back

Trạng thái bất thường / provider failure
=> khóa profile
=> reconciliation_required
=> ghi reconciliation log
```

### Scheduler

```text
FIXED / CONFIGURED
```

`vercel.json`:

```text
0 * * * *
/api/internal/personnel-reconciliation
```

Route support cả:

```text
GET
POST
```

và yêu cầu:

```text
Authorization: Bearer CRON_SECRET
```

nên tương thích Vercel Cron.

Production vẫn phải cấu hình `CRON_SECRET`.

---

# 4. N-HIGH-01 — Basic Medical linked schedule guard còn hở INSERT và ordinary→linked UPDATE

## Trạng thái

```text
OPEN — HIGH
```

Đây cũng là finding `CF-HIGH-01` trong:

```text
SAFE_REVIEW_REMAINING_WORKFLOWS_CROSS_FLOW_2026-08-07.md
```

## Eighth hiện tại

Trigger:

```text
guard_basic_medical_linked_schedule_mutation
```

được cài:

```sql
BEFORE UPDATE OR DELETE
ON class_schedules
```

Function guard chỉ kiểm tra:

```sql
old.basic_medical_registration_id is not null
```

Điều này đóng đúng:

```text
direct UPDATE linked schedule
direct DELETE linked schedule
```

nhưng còn hai cửa sổ.

---

## Case A — Direct INSERT linked schedule

Client đủ quyền tạo lịch có thể thử:

```text
INSERT class_schedule
basic_medical_registration_id = existing registration
```

Nếu policy INSERT thỏa, row schedule có thể được tạo mà không có:

```text
basic_medical_registration_sessions
```

Kết quả aggregate:

```text
Registration
├─ Sessions: N
└─ Linked class_schedules: N+1
```

không còn đồng nhất.

---

## Case B — UPDATE ordinary schedule thành linked schedule

Trigger chạy UPDATE nhưng function chỉ nhìn:

```text
OLD.basic_medical_registration_id
```

Nếu:

```text
OLD.basic_medical_registration_id = NULL
NEW.basic_medical_registration_id = registration-id
```

guard hiện không chặn dựa trên OLD.

---

## Yêu cầu sửa

Trigger:

```sql
BEFORE INSERT OR UPDATE OR DELETE
ON public.class_schedules
```

Guard logic:

```text
INSERT:
  NEW.basic_medical_registration_id != null
  => chỉ cho app.basic_medical_registration_mutation=true

UPDATE:
  OLD.basic_medical_registration_id != null
  OR NEW.basic_medical_registration_id != null
  => chỉ RPC chính thức

DELETE:
  OLD.basic_medical_registration_id != null
  => chỉ RPC chính thức
```

## Test bắt buộc

```text
Admin direct INSERT linked schedule => denied
Staff direct INSERT linked schedule => denied
Creator direct INSERT linked schedule => denied

ordinary schedule
UPDATE basic_medical_registration_id = target
=> denied

save_basic_medical_registration()
=> pass

cancel_basic_medical_registration()
=> pass
```

---

# 5. N-MEDIUM-01 — Crash-window integration test chưa chạy actual reconciler

## Trạng thái

```text
TEST COVERAGE GAP
```

Code reconciler hiện nhìn hợp lý.

Tuy nhiên test:

```text
expired reserved personnel operation preserves the Auth/Profile crash window for reconciliation
```

đang làm:

```text
begin
Auth update
expire operation
assert operation vẫn reserved
```

sau đó test tự:

```text
Auth rollback bằng service client
resolve_personnel_update_operation(...)
```

Nó **không gọi**:

```text
reconcileExpiredPersonnelUpdates()
```

Test kế tiếp chỉ đọc source code và assert có string:

```text
.in("status", ["reserved", ...])
```

Như vậy CI chưa thực sự chứng minh:

```text
actual reconciler
+
actual Auth state
+
actual Profile state
+
actual resolver
```

chạy end-to-end.

---

## Yêu cầu test mới

Khuyến nghị test qua endpoint Cron thật:

```text
1. Tạo target user.
2. begin_personnel_update.
3. Auth update requested email.
4. KHÔNG mark.
5. Expire operation.
6. Gọi:
   GET /api/internal/personnel-reconciliation
   Authorization: Bearer test CRON_SECRET
7. Assert:
   Auth email = previous
   Profile email = previous
   operation.status = rolled_back
```

Thêm failure injection/provider abstraction nếu khả thi:

```text
Auth rollback failure
=> profile inactive
=> reconciliation_required
=> reconciliation log exists
```

Nếu khó inject Supabase Auth failure trong integration test, ít nhất phải có một test chạy actual reconciler cho happy rollback path.

---

# 6. N-MEDIUM-02 — Reconciler chưa có claim/lease chống hai worker xử lý cùng operation

## Trạng thái

```text
HARDENING RECOMMENDED
```

Reconciler hiện:

```text
SELECT expired operations
LIMIT 100
```

sau đó xử lý từng row bằng external Auth calls.

Không có trạng thái:

```text
reconciling
```

hoặc atomic claim/lease trước khi gọi provider.

Nếu hai cron invocation overlap:

```text
Worker A đọc Operation X
Worker B cũng đọc Operation X
```

cả hai có thể cùng:

```text
rollback Auth
lock profile
insert reconciliation log
resolve operation
```

Trong case bình thường phần lớn là idempotent, nhưng ở provider/network partial failure có thể tạo:

```text
duplicate logs
counter sai
profile bị khóa không cần thiết
```

hoặc hai worker đưa ra quyết định khác nhau dựa trên state thay đổi giữa chừng.

---

## Khuyến nghị

Thêm claim state:

```text
reconciling
```

với:

```text
reconcile_started_at
reconcile_lease_expires_at
```

Atomic RPC:

```text
claim_personnel_reconciliation_batch(limit)
```

chỉ một worker claim được operation.

Nếu worker chết:

```text
lease hết hạn
=> operation có thể reclaim
```

Không giữ PostgreSQL transaction mở xuyên qua external Auth request.

Mức này không phải blocker riêng nếu deployment hiện chỉ có một cron worker, nhưng nên sửa cùng Personnel hardening trước production.

---

# 7. Basic Medical cancellation/history

## Trạng thái

```text
FIXED
```

Eighth đã sửa đúng:

```text
Hủy phiếu thay vì Xóa phiếu
```

Registration được giữ lại.

Future schedules:

```text
cancelled
```

Past historical data:

```text
preserved
```

Confirmation chỉ invalidated khi schedule thực sự bị chuyển:

```text
schedule_status = cancelled
```

nên confirmation của buổi quá khứ không bị invalidated hàng loạt.

UI có filter:

```text
Chưa hoàn thành
Hoàn thành
Đã hủy
Tất cả
```

và cancelled rows không lẫn vào completed/incomplete active list.

Không mở lại finding này.

---

# 8. Basic Medical equipment filtering/pagination

## Trạng thái

```text
FIXED
```

Component-local:

```text
query/filter/page
PaginationControls
```

đã được bỏ.

Server URL + RPC là owner duy nhất của:

```text
filter
search
pagination
```

Không mở lại finding này.

---

# 9. Export audit handling

## Trạng thái

```text
FIXED
```

Export hiện fail rõ nếu mandatory audit logging thất bại.

Không mở lại finding này.

---

# 10. Result report

Report hiện đã ghi đúng:

```text
Implementation commit:
032418cac...

Implementation CI:
31147729879 / success
```

Final metadata commit:

```text
e3f752b...
```

sau đó tự tạo CI mới:

```text
31149697329 / success
```

Không yêu cầu commit thêm chỉ để thay report bằng CI mới nhất, vì sẽ tạo vòng lặp:

```text
update report
=> new commit
=> new CI
=> report lại stale
```

Reviewer chấp nhận:

```text
report ghi implementation CI
+
handoff ghi final HEAD CI
```

miễn cả hai đều xanh.

---

# 11. PR body

PR body tại thời điểm review vẫn còn:

```text
Node integration tests: pending final CI
```

trong khi final CI đã xanh.

Đây là:

```text
LOW / DELIVERY CLEANUP
```

Không cần tạo commit code riêng.

Khi executor hoàn tất broad remaining-workflows follow-up, hãy rewrite PR body một lần ở cuối với final counts/CI.

---

# 12. Eighth closure verdict

Các finding Eighth gốc có thể xem là:

```text
Personnel crash handling: FIXED in code
Basic Medical UPDATE/DELETE side door: FIXED
Basic Medical cancellation semantics: FIXED
Basic Medical history/filter: FIXED
Equipment server pagination: FIXED
Export audit: FIXED
Cron scheduler: CONFIGURED
```

Nhưng không Ready for merge vì:

```text
N-HIGH-01 linked schedule INSERT/update-link bypass
N-MEDIUM-01 exact reconciler integration test
N-MEDIUM-02 reconciliation worker claiming
```

và toàn bộ findings trong:

```text
SAFE_REVIEW_REMAINING_WORKFLOWS_CROSS_FLOW_2026-08-07.md
```

vẫn cần xử lý theo business decisions mới đã chốt.

---

# 13. Hai file cần executor thực hiện tiếp

Executor phải coi **cả hai file** là input bắt buộc:

```text
1. docs/SAFE_REVIEW_REMAINING_WORKFLOWS_CROSS_FLOW_2026-08-07.md
2. docs/SAFE_REVIEW_NINTH_FOLLOWUP_AFTER_EIGHTH_2026-08-07.md
```

Nếu nội dung overlap:

```text
Ninth file làm rõ/cập nhật Eighth residual.
Remaining Workflows file chứa business rules và broad architecture đã chốt.
```

Không tự quay về recommendation cũ mâu thuẫn với Hard Delete/email/equipment decisions.

---

# 14. Thứ tự thực hiện đề xuất

## Phase 1 — Close Eighth residual

```text
1. Guard linked Basic Medical INSERT/UPDATE/DELETE.
2. Add actual reconciler integration test.
3. Add reconciliation claim/lease hoặc giải pháp tương đương.
```

## Phase 2 — Hard Delete architecture

Theo Remaining Workflows:

```text
4. Central can_hard_delete().
5. Root + designated Bảo only.
6. Dependency-safe hard delete.
7. Shared/master RESTRICT.
8. Exclusive child aggregate CASCADE only when explicit/safe.
```

## Phase 3 — Equipment Request

```text
9. Edit RPC-only.
10. Admin/Staff quick-add equipment RPC.
11. Status rule new/preparing only.
12. After handed_over lock edit.
13. Rollback by Admin/Staff can clear old signatures.
14. Signature private handling.
15. TB-02/TB-06 exactly per Email Matrix.
```

## Phase 4 — Schedule / Import

```text
16. Class schedule safe hard-delete/dependency handling.
17. Manual schedule canonical RPC.
18. Import conflict/system_error persistence.
19. Import state RPC-only/finalize computed counts.
20. CSV formula injection.
```

## Phase 5 — Remaining hardening

```text
21. Shift pattern delete/deactivate rule.
22. Email pending/suppressed/failed/simulated cleanup for Root/Bảo.
23. OFF never back-sends.
24. Transactional outbox where business email is mandatory.
25. Final docs + PR body + CI.
```

---

# 15. Required regression matrix

Executor phải giữ:

```text
Root manages Bảo
Bảo cannot manage own security
ordinary Admin cannot access Personnel
Staff scope remains room-type scoped
Import remains capability, not role
Viewer permissions unchanged
Raw Y signature remains protected
Basic Medical history remains preserved
Equipment rollback clears old signatures per business decision
No email on equipment status rollback/signing
Email Matrix remains source of truth
OFF never queues future back-send
```

---

# 16. Verification

```bash
npm run format:check
npm run check
npm run test:db
npm run test:e2e:critical
npm run build
git diff --check
npx supabase db reset --local
npx supabase db lint --local --level error
```

Expected next handoff should include:

```text
Implementation commit
Final HEAD
Migration list
Node/integration pass count
pgTAP pass count
Critical E2E pass count
GitHub Actions run
Verify job
Finding matrix
Result report .md
```

---

# 17. Final verdict

```text
EIGHTH CORE FIXES ACCEPTED
REQUEST CHANGES FOR NINTH + REMAINING WORKFLOWS
KEEP PR DRAFT
```

Không merge hoặc deploy production cho đến khi:

```text
- N-HIGH-01 đóng.
- Remaining Workflows High findings đóng.
- Final CI của follow-up mới completed / success.
- Production blockers riêng được xử lý/rehearsed.
```
