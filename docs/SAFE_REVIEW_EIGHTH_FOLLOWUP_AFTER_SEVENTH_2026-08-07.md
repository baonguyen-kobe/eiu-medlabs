# Safe Review — Eighth Follow-up after Seventh

**Ngày review:** 07/08/2026  
**Repository:** `baonguyen-kobe/eiu-medlabs`  
**PR:** `#1`  
**Branch:** `review/hardening-20260805`  
**Reviewed HEAD:** `ea81572077232be0e4caa36e53b49dc2e50b180a`  
**Implementation commit:** `b95b8453498be2933049335787398c17cb705a2c`  
**Follow-up commits:** `f17b46a`, `39cc899`, `ea81572`  
**GitHub Actions:** run `31144021504` — `completed / success`  
**Verify job:** `92759686000` — `completed / success`  
**Verdict:** **REQUEST CHANGES — giữ PR Draft**

---

## 1. Tổng quan

Seventh Follow-up đã sửa đúng phần lớn finding trước:

- Root quản lý được Personnel Manager; Root self-security vẫn bất biến.
- Viewer và teaching lecturer xem lại được Phiếu Y cơ sở.
- Direct DML trên `basic_medical_registrations` và `basic_medical_registration_sessions` đã bị revoke.
- Phiếu Y cơ sở chuyển sang soft-cancel.
- Equipment search/filter/export/import đã được harden đáng kể.
- CI final HEAD xanh.

Tuy nhiên review này phát hiện **2 High còn mở**, cùng một số Medium/Low.

---

# A. PERSONNEL

## P-HIGH-01 — Crash sau Auth update nhưng trước `mark_personnel_auth_updated` vẫn chưa được reconcile

### Hiện trạng

`savePersonnelChanges()` chạy:

```text
1. begin_personnel_update()
2. Auth updateUserById()
3. mark_personnel_auth_updated()
4. commit_personnel_update()
```

Nếu process chết tại:

```text
Auth updateUserById() SUCCESS
→ process crash
→ mark_personnel_auth_updated() chưa chạy
```

thì:

```text
Auth email = email mới
profiles.email = email cũ
operation.status = reserved
```

`reconcileExpiredPersonnelUpdates()` hiện chỉ scan:

```text
auth_updated
rollback_required
reconciliation_required
```

không scan `reserved`.

Ngoài ra `begin_personnel_update()` hiện có thể chuyển expired `reserved` thành `expired` mà chưa đối chiếu Auth/Profile. Như vậy mismatch có thể bị “đóng hồ sơ” sai.

### Test hiện tại chưa tái hiện đúng

Test “durable personnel operation survives Auth/DB crash window” vẫn gọi:

```text
mark_personnel_auth_updated()
```

trước khi mô phỏng chưa commit.

Nó chỉ test:

```text
crash sau mark / trước commit
```

chưa test:

```text
crash sau Auth / trước mark
```

### Yêu cầu sửa

Reconciler phải xử lý expired `reserved`.

Với expired `reserved`, đọc:

```text
profiles.email
auth.users.email
previous_email
requested_email
```

Phân loại:

```text
profile=previous, auth=previous
=> rolled_back/expired

profile=previous, auth=requested
=> rollback Auth về previous
=> rolled_back

profile=requested, auth=requested
=> đối chiếu version/audit rồi committed

các trạng thái khác
=> lock profile
=> reconciliation_required
=> ghi log
```

Không được auto:

```text
reserved -> expired
```

khi chưa xác minh Auth.

### Test bắt buộc

```text
begin
Auth update requested
KHÔNG mark
ép expires_at về quá khứ
run reconciler
```

Expect:

```text
Auth cuối = previous
Profile cuối = previous
operation = rolled_back
```

Thêm failure injection cho Auth rollback:

```text
profile inactive
operation = reconciliation_required
reconciliation log tồn tại
```

---

## P-MEDIUM-01 — Reconciler endpoint chưa thấy scheduler production

Có endpoint:

```text
POST /api/internal/personnel-reconciliation
Authorization: Bearer CRON_SECRET
```

nhưng repository review chưa thấy scheduler/cron gọi định kỳ.

Trước production cần chốt:

- Vercel Cron / external scheduler / pg_cron.
- Log inspected/resolved/failed.
- Alert khi `reconciliation_required > 0`.
- Runbook Root xử lý manual.
- Secret production riêng.

---

# B. PHIẾU Y CƠ SỞ

## BM-HIGH-01 — `class_schedules` liên kết vẫn direct mutate được ngoài RPC

### Hiện trạng

Seventh đã revoke direct DML ở:

```text
basic_medical_registrations
basic_medical_registration_sessions
```

nhưng chưa khóa aggregate thứ ba:

```text
class_schedules
```

Quan hệ hiện tại:

```text
basic_medical_registration_sessions.class_schedule_id
REFERENCES class_schedules(id)
ON DELETE CASCADE
```

Policy chung `class_schedules` cho Admin / scoped Staff được delete theo `private.can_modify_class_schedule(id, 'delete')`.

Vì vậy scoped Staff/Admin vẫn có thể:

```ts
supabase.from("class_schedules").delete().eq("id", linkedScheduleId);
```

Khi schedule bị xóa:

```text
class_schedule bị xóa
→ ON DELETE CASCADE
→ basic_medical_registration_session bị xóa
```

nhưng registration header vẫn tồn tại.

Đây là bypass trực tiếp của:

```text
save_basic_medical_registration
cancel_basic_medical_registration
```

### Ảnh hưởng

- Session count thay đổi ngoài RPC.
- Completion có thể sai.
- Confirmation có thể bị invalidate/cascade ngoài ý muốn.
- Không có audit/email cấp Phiếu Y cơ sở đúng nghĩa.
- Generic schedule management có thể vô tình phá phiếu.

### Yêu cầu sửa

Tạo trigger guard cho `class_schedules` khi:

```text
basic_medical_registration_id IS NOT NULL
```

Ví dụ:

```text
private.guard_basic_medical_linked_schedule_mutation()
```

Chỉ cho phép khi transaction-local flag do RPC chính thức đặt:

```sql
set_config('app.basic_medical_registration_mutation', 'true', true)
```

RPC được phép:

```text
save_basic_medical_registration
cancel_basic_medical_registration
```

Direct client UPDATE/DELETE linked schedule phải trả:

```text
BASIC_MEDICAL_SCHEDULE_RPC_REQUIRED
```

### Test bắt buộc

Với Admin và Staff Y-scope:

```text
direct DELETE linked class_schedule => FAIL
direct UPDATE room/date/time/lecturer/status => FAIL
```

Sau đó:

```text
save RPC edit => PASS
cancel RPC => PASS
```

---

## BM-MEDIUM-01 — UI vẫn ghi “Xóa phiếu” dù backend đã soft-cancel

Backend đã giữ header/session/history, nhưng UI vẫn hiển thị:

```text
Xóa phiếu
Các buổi và lịch liên kết trong phiếu cũng sẽ bị xóa.
```

Thông tin này hiện sai.

Server action vẫn tên:

```text
deleteBasicMedicalRegistration
```

và email event vẫn là:

```text
deleted
```

### Yêu cầu

Đổi toàn bộ terminology:

```text
Hủy phiếu
```

Dialog nên nói rõ:

```text
Các lịch tương lai sẽ chuyển sang Đã hủy.
Dữ liệu và lịch sử đã có được giữ lại.
```

Nếu cần, thêm input lý do hủy để truyền `target_reason`.

Email event nên là `cancelled`.

---

## BM-MEDIUM-02 — Phiếu đã hủy không có UI lịch sử

`basic_medical_registration_list` đang:

```sql
WHERE cancelled_at IS NULL
```

Sau khi hủy, record còn trong DB nhưng biến mất hoàn toàn khỏi UI.

Nên thêm:

```text
Chưa hoàn thành
Hoàn thành
Đã hủy
Tất cả
```

hoặc view/RPC history riêng.

Manager cần xem được:

```text
cancelled_at
cancelled_by
cancel_reason
sessions
confirmation history
```

---

## BM-MEDIUM-03 — Hủy phiếu invalidate mọi confirmation, kể cả buổi quá khứ

`cancel_basic_medical_registration()` chỉ cancel schedules tương lai nhưng lại invalidate tất cả active confirmation của registration.

Ví dụ:

```text
Buổi 1 hôm qua: đã học + đã ký
Buổi 2 ngày mai
```

Hủy hôm nay:

```text
Buổi 2 cancelled
Confirmation buổi 1 cũng invalidated
```

Khuyến nghị: giữ confirmation của buổi đã diễn ra hợp lệ; chỉ invalidate session thực sự bị hủy/thay đổi.

Nếu nghiệp vụ muốn hủy toàn bộ confirmation, cần ghi rõ trong OpenSpec/UI/test.

---

# C. DANH SÁCH THIẾT BỊ Y CƠ SỞ

## BM-MEDIUM-04 — Server pagination mới vẫn chồng với client pagination cũ

`page.tsx` đã dùng:

```text
search_basic_medical_equipment(...)
target_page
target_page_size <= 50
PaginationLinks
```

nhưng `BasicMedicalEquipmentManager` vẫn có:

```text
local query
local filter
local page
PaginationControls
```

ở Inventory/Rooms/Damaged.

Kết quả:

```text
server trả tối đa 50 dòng
client lại filter và paginate chính 50 dòng đó
```

Nếu thiết bị cần tìm nằm ở server page khác, ô search local có thể báo không thấy.

Hiện UI có hai hệ:

```text
server filter + local filter
server pagination + local pagination
```

### Yêu cầu

Giữ server-side hoàn toàn.

Component chỉ render rows.

Xóa local:

```text
query
room/status filter
page
PaginationControls
```

hoặc chuyển toàn bộ sort/filter lên URL/RPC.

---

# D. DOCUMENTATION / DELIVERY

## DOC-MEDIUM-01 — Seventh result report vẫn để metadata `PENDING`

File:

```text
docs/SAFE_REVIEW_SEVENTH_FOLLOWUP_AFTER_SIXTH_RESULT_2026-08-07.md
```

vẫn ghi:

```text
Implementation commit: PENDING
Final HEAD: PENDING
GitHub Actions run: PENDING
Verify job: PENDING
```

Cần cập nhật:

```text
Implementation commit:
b95b8453498be2933049335787398c17cb705a2c

Final HEAD:
ea81572077232be0e4caa36e53b49dc2e50b180a

CI:
31144021504

Verify:
92759686000
completed / success
```

Finding matrix cũng cần đổi:

```text
P-HIGH-02 = PARTIAL / REOPENED
BM-HIGH-02 = PARTIAL / REOPENED
```

---

## DOC-LOW-01 — PR body vẫn mô tả Fifth và test count cũ

PR body hiện vẫn ghi:

```text
56/56 Node
23/23 pgTAP
```

Trong khi final hiện:

```text
63/63 Node
49/49 pgTAP
Seventh pgTAP 15/15
CI final success
```

Nên rewrite PR body theo current state thay vì append lịch sử.

---

## LOW — Export audit error bị bỏ qua

Export gọi:

```text
audit_basic_medical_equipment_export
```

nhưng không kiểm tra lỗi trả về.

Nếu audit là mandatory:

```text
audit fail => export fail
```

Nếu best-effort:

```text
log/telemetry rõ
```

---

# E. CÁC PHẦN SEVENTH ĐÃ SỬA ĐÚNG

Không làm lại nếu không gây regression:

```text
P-HIGH-01 Root quản lý Personnel Manager
P-MEDIUM-01 import-all active reservation guard
P-MEDIUM-02 cleanup diagnostics
P-MEDIUM-03 lost-response sync snapshot

BM-HIGH-01 Viewer / teaching lecturer visibility
BM-MEDIUM-01 read-only equipment access
BM-MEDIUM-03 catalog candidate >500
BM-MEDIUM-04 scoped full export
BM-MEDIUM-05 historical code date
BM-MEDIUM-06 atomic catalog import
```

Riêng:

```text
P-HIGH-02
BM-HIGH-02
```

chỉ là `PARTIAL`.

---

# F. TEST MATRIX EIGHTH

## Personnel

1. Auth update xong nhưng không mark, operation expired.
2. Reconciler rollback đúng.
3. Rollback provider failure => lock + reconciliation.
4. Expired reserved chưa reconcile => writer mới bị chặn.
5. Reconcile xong => writer mới hoạt động.

## Basic Medical

1. Admin direct delete linked class schedule => denied.
2. Staff Y-scope direct delete linked class schedule => denied.
3. Admin direct update linked class schedule => denied.
4. Save RPC edit => pass.
5. Cancel RPC => pass.
6. Session count không đổi ngoài RPC.
7. Past confirmation behavior khi cancel được test theo rule đã chốt.
8. UI wording dùng Hủy, không dùng Xóa.
9. Manager xem được cancelled history.

## Equipment

1. > 100 rows.
2. Tìm item ở server page 3 từ page 1.
3. Chỉ một pagination system.
4. Filter room/item/event/actor/date hoạt động toàn dataset.

---

# G. VERIFICATION

Sau khi sửa:

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

Bắt buộc test Eighth phải chạy trong CI.

---

# H. PRODUCTION BLOCKERS GIỮ NGUYÊN

1. Chữ ký sang private Supabase Storage.
2. Backfill signature metadata/hash/MIME/size + signed URL.
3. Root production bootstrap/rehearsal.
4. Apps Script production rehearsal/redeploy.
5. Destructive/reset/data-lifecycle review ở workflow khác.
6. Scheduler/monitoring Personnel reconciliation.

---

# I. DEFINITION OF DONE

Chỉ đóng Eighth khi:

- [ ] Expired `reserved` được reconcile an toàn.
- [ ] Crash sau Auth / trước mark có test xanh.
- [ ] Linked Basic Medical `class_schedules` không direct mutate được.
- [ ] Save/cancel RPC vẫn chạy.
- [ ] UI soft-cancel đúng wording.
- [ ] Có history phiếu đã hủy.
- [ ] Confirmation past-session rule được chốt/test.
- [ ] Equipment chỉ còn server filter/pagination.
- [ ] Seventh report có metadata thật.
- [ ] PR body cập nhật current state.
- [ ] Final CI Eighth `completed / success`.
- [ ] Không còn High finding mở.

---

# J. PROMPT GIAO EXECUTOR

Repository:

```text
baonguyen-kobe/eiu-medlabs
```

Branch:

```text
review/hardening-20260805
```

PR:

```text
#1
```

Starting HEAD:

```text
ea81572077232be0e4caa36e53b49dc2e50b180a
```

Đọc:

```text
docs/SAFE_REVIEW_SEVENTH_FOLLOWUP_AFTER_SIXTH_2026-08-07.md
docs/SAFE_REVIEW_SEVENTH_FOLLOWUP_AFTER_SIXTH_RESULT_2026-08-07.md
docs/SAFE_REVIEW_EIGHTH_FOLLOWUP_AFTER_SEVENTH_2026-08-07.md
```

Thứ tự:

```text
1. Personnel crash before mark
2. Guard linked class_schedules
3. Soft-cancel UX/history
4. Equipment double pagination/filter
5. Update report + PR body
6. Full local validation
7. Push
8. Verify final GitHub Actions
```

Không:

```text
merge main
deploy production
run production migration
redeploy Apps Script production
```

Bàn giao:

```text
Implementation commit
Final HEAD
CI run
Verify job
Node count
pgTAP count
E2E count
Result report
Finding matrix FIXED/PARTIAL/OPEN
```

---

# Reviewer verdict

```text
REQUEST CHANGES
```

CI `31144021504` xanh, nhưng hai bypass còn lại chưa được test/fix.

PR tiếp tục:

```text
Draft
Not merged
Not deployed
```
