# Safe Review — Third Follow-up

Ngày review: 06/08/2026
Repository: `baonguyen-kobe/eiu-medlabs`
Pull Request: `#1`
Branch: `review/hardening-20260805`
HEAD được review: `feac6116523d2c95d45daaa82db7c419cac5a939`
Code remediation commit trước review: `5a65c0d5d20ffa3bbd7ffc63ae60ed418c14df58`
GitHub Actions run: `31079056383`
GitHub Actions job: `92543436832`

---

# 1. Phạm vi review

Review lần này đối chiếu:

- Source code tại HEAD `feac6116523d2c95d45daaa82db7c419cac5a939`.
- `docs/SAFE_REVIEW_CLASSIFICATION_2026-08-05.md`.
- `docs/SAFE_REVIEW_FINAL_REPORT_2026-08-05.md`.
- `docs/SAFE_REVIEW_FOLLOWUP_RESULT_2026-08-06.md`.
- `docs/SAFE_REVIEW_SECOND_FOLLOWUP_2026-08-06.md`.
- `docs/SAFE_REVIEW_SECOND_FOLLOWUP_RESULT_2026-08-06.md`.
- GitHub Actions run cuối.
- Các quyết định nghiệp vụ đã được chủ hệ thống chốt.

Các nội dung được kiểm tra trọng tâm:

- Quyền kết hợp nhiều role.
- Quyền Lecturer và Importer.
- Quyền Staff theo room-type scope.
- Bảo toàn lịch sử ca trực.
- Email Processing/Off.
- Apps Script unauthorized logging.
- Preview import duplicate và conflict.
- UI hiển thị trạng thái import.
- Test coverage và CI.

---

# 2. Kết luận reviewer

GitHub Actions tại HEAD cuối đã xanh toàn bộ, bao gồm:

- `npm ci`.
- Format check.
- Dependency audit.
- Supabase start/reset.
- Seed fixtures.
- Database lint.
- ESLint.
- TypeScript.
- Unit và direct database tests.
- pgTAP.
- Critical Playwright E2E.
- Production build.

Các remediation về Staff equipment scope, email Processing/Off và Apps Script log spam đã được triển khai hợp lý.

Tuy nhiên, kết luận reviewer hiện tại là:

> **REQUEST CHANGES — TIẾP TỤC GIỮ PR Ở TRẠNG THÁI DRAFT**

Chưa chuyển PR sang Ready for review.

Không merge vào `main`.

Không deploy production.

Không redeploy Apps Script production.

Không có thêm quyết định nghiệp vụ nào cần chủ hệ thống chốt. Các finding còn lại đều là vấn đề kỹ thuật.

---

# 3. HIGH-01 — Role Importer có thể làm mất quyền Lecturer

## Trạng thái

`CONFIRMED`

## Mô tả

Chủ hệ thống đã chốt rằng quyền Importer là quyền bổ sung:

- Lecturer và Teaching Assistant vẫn có quyền tạo lịch theo scope.
- Một số người được cấp thêm role Importer để có thể import file.
- Việc cấp thêm Importer không được làm mất các quyền Lecturer hợp lệ.

Helper hiện tại kiểm tra role theo thứ tự:

1. Admin.
2. Staff.
3. Importer.
4. Lecturer.

Nhánh Importer thực hiện `return` ngay.

Vì vậy, khi một người đồng thời có:

```text
lecturer
importer
```

hệ thống có thể chỉ áp dụng nhánh Importer và không tiếp tục xét quyền Lecturer.

## Ví dụ lỗi

Một người dùng:

- Có role Lecturer.
- Có thêm role Importer.
- Được phân công vào một lớp do Staff tạo.
- Không phải người tạo lớp.
- Lớp không thuộc batch import của họ.

Theo quyền Lecturer, người đó có thể được phép thực hiện một số hành động hợp lệ đối với lớp được phân công.

Tuy nhiên, nhánh Importer có thể trả về `false` vì:

- Lịch không do họ tạo.
- Lịch không thuộc batch import của họ.

Sau đó nhánh Lecturer không được xét.

Kết quả:

> Việc cấp thêm quyền Importer lại làm giảm quyền Lecturer.

Điều này trái với ma trận quyền đã được chốt.

## Quyết định nghiệp vụ cần giữ nguyên

Các role phải có tính cộng gộp.

Một người có nhiều role được hưởng hợp quyền của các role đó, nhưng mỗi hành động vẫn phải tuân theo scope và ownership tương ứng.

Không được áp dụng nguyên tắc:

```text
Gặp role đầu tiên thì dừng
```

Phải áp dụng:

```text
can_admin
OR can_staff
OR can_importer
OR can_lecturer
```

## Yêu cầu sửa

Refactor helper authorization để tính riêng từng capability.

Ví dụ:

```sql
can_admin :=
  private.has_role('admin');

can_staff :=
  private.has_role('staff')
  and private.has_room_type(source_room_type_id);

can_importer :=
  private.has_role('importer')
  and private.has_room_type(source_room_type_id)
  and (
    schedule.created_by = auth.uid()
    or import_batch.created_by = auth.uid()
  );

can_lecturer :=
  private.has_role('lecturer')
  and private.has_room_type(source_room_type_id)
  and (
    schedule.created_by = auth.uid()
    or auth.uid() in (
      schedule.lecturer_id,
      schedule.lecturer_2_id
    )
  );
```

Kết quả cuối phải là hợp quyền:

```sql
return can_admin
  or can_staff
  or can_importer
  or can_lecturer;
```

Không dùng chuỗi `if ... return false` khiến role sau không được xét.

## Giới hạn theo hành động

### `assign_lecturers`

Được phép cho:

- Admin.
- Staff đúng scope.
- Importer chỉ đối với lịch của mình hoặc batch của mình, nếu nghiệp vụ cho phép.

Lecturer thông thường không tự động được đổi danh sách giảng viên.

### `reschedule`

Được phép cho:

- Admin.
- Staff đúng scope.
- Importer đối với lịch thuộc ownership Importer.
- Lecturer theo quyền lớp được tạo hoặc phân công, trong giới hạn nghiệp vụ.

### `details`

Không được hiểu là Lecturer có thể sửa tất cả trường.

Cần phân biệt:

- Ngày.
- Giờ.
- Phòng.
- Số sinh viên.
- Giảng viên phụ trách.
- Nội dung khác.

Nếu cần, tách RPC cho Lecturer khỏi RPC quản lý đầy đủ.

### `delete`

- Admin: theo quy tắc lifecycle.
- Staff: trong scope.
- Importer: chỉ lịch của mình hoặc batch của mình.
- Lecturer: chỉ lịch được phép theo nghiệp vụ đã chốt.
- Không hard-delete khi đã có dữ liệu liên kết.

## Test bắt buộc

Tạo một user có đồng thời:

```text
lecturer
importer
```

Kiểm tra:

1. Người đó được reschedule lớp được phân công theo quyền Lecturer.
2. Người đó được sửa lịch manual do mình tạo.
3. Người đó được sửa lịch thuộc batch import của mình.
4. Người đó không được sửa lịch import của người khác.
5. Người đó không được xóa lịch người khác.
6. Người đó không được assign lecturer cho lịch ngoài ownership nếu Lecturer không có capability này.
7. Việc thêm role Importer không làm mất quyền Lecturer hợp lệ.
8. Khi gỡ role Importer, quyền Lecturer vẫn không thay đổi.
9. Khi chỉ có role Importer, người dùng chỉ có quyền Importer.
10. Viewer vẫn bị từ chối direct RPC.

---

# 4. HIGH-02 — Ca trực đã xảy ra trong ngày vẫn có thể bị xóa hoặc tạo lại

## Trạng thái

`CONFIRMED`

## Mô tả

Trigger bảo vệ lịch sử ca trực hiện kiểm tra ngày:

```sql
old.shift_date < current_business_date
```

Điều kiện này chưa bảo vệ ca đã bắt đầu hoặc đã kết thúc trong chính ngày hiện tại.

Materializer cũng có thể bắt đầu tạo occurrence từ ngày hiện tại thay vì thời điểm hiện tại.

## Ví dụ lỗi

Tại thời điểm:

```text
06/08/2026 15:00
```

Có một ca generated:

```text
06/08/2026 08:30–11:30
status = scheduled
```

Ca đã xảy ra nhưng trạng thái chưa được cập nhật thành `completed`.

Nếu người dùng:

- Hủy pattern.
- Thay pattern.
- Refresh pattern.

Hệ thống có thể:

- Xóa ca sáng hôm nay.
- Hoặc tạo lại ca sáng hôm nay.
- Hoặc làm mất metadata của occurrence đã thực sự xảy ra.

Nguyên nhân là ngày của ca vẫn bằng ngày hiện tại nên không thỏa:

```sql
shift_date < current_date
```

## Quyết định nghiệp vụ

Một occurrence được xem là đã bắt đầu khi:

```text
shift_date + start_time <= thời điểm hiện tại
```

Khi occurrence đã bắt đầu:

- Không được hard-delete.
- Không được tạo lại từ pattern.
- Không được thay đổi như một occurrence tương lai chưa sử dụng.
- Phải được bảo toàn để cập nhật completed/cancelled sau đó.

## Yêu cầu sửa trigger

Thay kiểm tra chỉ theo ngày bằng kiểm tra timestamp nghiệp vụ.

Ví dụ:

```sql
old.shift_date + old.start_time
  <= now() at time zone 'Asia/Ho_Chi_Minh'
```

Trigger phải giữ row nếu thỏa một trong các điều kiện:

```text
registration_source không phải generated
OR status là completed
OR status là cancelled
OR thời gian bắt đầu đã đến hoặc đã qua
```

Chỉ cho phép xóa khi toàn bộ điều kiện sau đúng:

```text
registration_source = generated
AND status = scheduled
AND thời gian bắt đầu vẫn ở tương lai
```

## Yêu cầu sửa materializer

Materializer không được insert hoặc update occurrence khi:

```sql
occurrence_date + pattern.start_time
  <= now() at time zone 'Asia/Ho_Chi_Minh'
```

Cần kiểm tra theo timestamp, không chỉ theo ngày.

## Trường hợp hôm nay nhưng chưa đến giờ

Ví dụ lúc 08:00:

```text
Ca chiều 13:30–16:30
```

Ca này vẫn là occurrence tương lai và có thể được xử lý khi thay hoặc hủy pattern.

## Test bắt buộc

Cần dùng business time có thể kiểm soát trong test hoặc tạo dữ liệu tương đối với thời gian chạy test.

Các trường hợp:

1. Generated shift hôm nay có start time đã qua, status scheduled:

   - Thay pattern: row vẫn còn.
   - Hủy pattern: row vẫn còn.
   - Refresh: row không bị tạo lại hoặc thay đổi.

2. Generated shift hôm nay có start time trong tương lai:

   - Có thể bị loại khi hủy pattern.
   - Hoặc chuyển cancelled theo chính sách.

3. Shift hôm qua:

   - Luôn được giữ.

4. Shift completed:

   - Luôn được giữ.

5. Shift cancelled:

   - Luôn được giữ.
   - `cancelled_by` và `cancelled_at` không thay đổi.

6. Manual shift:

   - Luôn được giữ.

7. Chạy refresh nhiều lần:

   - Idempotent.
   - Không tạo trùng occurrence.

---

# 5. MEDIUM-01 — UI hiển thị dòng conflict là “Hợp lệ”

## Trạng thái

`CONFIRMED`

## Mô tả

Backend đã có status:

```text
conflict
```

Nhưng UI chỉ có label riêng cho:

- `duplicate`.
- `error`.
- `warning`.

Các status còn lại được hiển thị mặc định là:

```text
Hợp lệ
```

Do đó một dòng conflict có thể:

- Bị loại khỏi danh sách tạo lịch.
- Được đếm trong tổng số conflict.
- Có message lỗi.
- Nhưng badge trên từng dòng lại hiển thị “Hợp lệ”.

Ngoài ra, row class lỗi chưa bao gồm status `conflict`.

## Yêu cầu sửa

Bổ sung label:

```ts
if (status === "conflict") return "Xung đột";
```

Bổ sung style:

```ts
preview - status - conflict;
```

Bổ sung vào điều kiện row lỗi:

```ts
const rowInvalid =
  review?.status === "error" ||
  review?.status === "duplicate" ||
  review?.status === "conflict";
```

## Nội dung hướng dẫn cần sửa

Thay:

```text
Các dòng lỗi và trùng sẽ bị loại ở bước xác nhận.
```

Thành:

```text
Các dòng lỗi, trùng và xung đột sẽ bị loại ở bước xác nhận.
```

## Test bắt buộc

- Status conflict hiển thị “Xung đột”.
- Row conflict có class lỗi.
- Conflict không được đưa vào danh sách tạo.
- Duplicate vẫn hiển thị “Trùng”.
- Error vẫn hiển thị “Cần sửa”.
- Warning vẫn hiển thị “Hợp lệ, có lưu ý”.
- Valid vẫn hiển thị “Hợp lệ”.

Nên bổ sung component test hoặc Playwright test cho bước preview import.

---

# 6. MEDIUM-02 — Preview chưa kiểm tra conflict giữa các dòng trong cùng file

## Trạng thái

`CONFIRMED`

## Mô tả

Preview đã kiểm tra:

- Duplicate với lịch manual trong database.
- Duplicate với lịch import trong database.
- Conflict phòng với lịch đã tồn tại.
- Conflict giảng viên với lịch đã tồn tại.

Tuy nhiên, các dòng trong chính file import chưa được so overlap với nhau.

Hiện tại chỉ có duplicate hash hoàn toàn trong cùng file.

## Ví dụ

File có:

### Dòng 2

```text
Phòng A
07:30–09:30
```

### Dòng 3

```text
Phòng A
08:30–10:30
```

Nếu database chưa có lịch liên quan:

- Preview có thể báo cả hai dòng hợp lệ.
- Khi execute, database chỉ tạo được một dòng.
- Dòng còn lại bị conflict.
- Dòng nào được tạo trước có thể phụ thuộc thứ tự xử lý concurrent.

Điều này làm preview và execute không nhất quán.

## Yêu cầu sửa

Trong bước preview, so các prepared rows với nhau.

Cần kiểm tra:

### Duplicate trong file

Hai dòng trùng toàn bộ business key:

- Course.
- Room.
- Date.
- Start time.
- End time.

Phân loại:

```text
duplicate
```

### Room conflict trong file

Hai dòng:

- Cùng ngày.
- Cùng phòng.
- Có khoảng thời gian overlap.
- Không phải duplicate hoàn toàn.

Phân loại:

```text
conflict
```

### Lecturer conflict trong file

Hai dòng:

- Cùng ngày.
- Cùng giảng viên.
- Thời gian overlap.
- Có thể khác phòng.

Phân loại:

```text
conflict
```

## Thứ tự xử lý

Cần xử lý theo `rowNumber` tăng dần.

Đề xuất:

- Dòng xuất hiện trước được xem là candidate ưu tiên.
- Dòng sau trùng hoặc conflict với dòng trước bị đánh dấu.
- Kết quả phải deterministic.

Không được phụ thuộc vào thứ tự Promise hoặc concurrency.

## Lưu ý

Preview chỉ hỗ trợ người dùng.

Execution RPC vẫn phải:

- Kiểm tra lại duplicate.
- Kiểm tra lại conflict.
- Dùng transaction và database constraint.
- Chống race giữa nhiều request.

## Test bắt buộc

1. Hai dòng cùng file trùng business key:

   - Dòng đầu valid.
   - Dòng sau duplicate.

2. Hai dòng cùng phòng overlap:

   - Dòng đầu valid.
   - Dòng sau conflict.

3. Hai dòng cùng giảng viên overlap nhưng khác phòng:

   - Dòng sau conflict.

4. Hai dòng tiếp giáp:

```text
07:30–09:30
09:30–11:30
```

- Không conflict.

5. Hai dòng khác ngày:

   - Không conflict.

6. Hai dòng khác phòng và khác giảng viên:

   - Không conflict.

7. Kết quả ổn định qua nhiều lần chạy.

8. Execution vẫn xử lý đúng nếu dữ liệu thay đổi sau preview.

---

# 7. MEDIUM-03 — Lịch import đã cancelled vẫn bị preview xem là duplicate

## Trạng thái

`CONFIRMED`

## Mô tả

RPC `find_existing_import_hashes` hiện kiểm tra `import_rows` dựa trên:

- `normalized_row_hash`.
- Có `class_schedule_id`.
- `validation_status` là imported hoặc warning.

RPC chưa join `class_schedules` để kiểm tra trạng thái của lịch hiện tại.

## Kịch bản lỗi

1. Người dùng import lịch A.
2. Lịch A được tạo thành công.
3. Sau đó lịch A được cancel.
4. Người dùng cần import lại cùng lịch A.
5. `import_rows` cũ vẫn còn hash.
6. Preview báo duplicate dù lịch thực tế đã cancelled.

Điều này không nhất quán với quy tắc:

```text
Lịch cancelled không chặn việc tạo lịch active mới có cùng business key.
```

## Yêu cầu sửa

RPC cần join `class_schedules`.

Ví dụ:

```sql
select distinct rows.normalized_row_hash
from public.import_rows rows
join public.class_schedules schedules
  on schedules.id = rows.class_schedule_id
where rows.normalized_row_hash = any(target_hashes)
  and rows.validation_status in ('imported', 'warning')
  and schedules.schedule_status <> 'cancelled';
```

Không chỉ kiểm tra `class_schedule_id is not null`.

## Test bắt buộc

1. Active imported schedule:

   - Preview trả duplicate.

2. Cancelled imported schedule:

   - Preview không trả duplicate từ hash cũ.

3. Active manual schedule trùng business key:

   - Preview trả duplicate qua kiểm tra `class_schedules`.

4. Cancelled manual schedule:

   - Preview không trả duplicate.

5. Hai lịch, một active và một cancelled cùng hash:

   - Vẫn trả duplicate vì còn active schedule.

6. Import row không còn schedule:

   - Không chặn import mới.

7. Execution RPC vẫn kiểm tra lại transaction-time.

---

# 8. Finding đã xử lý đúng

## 8.1. Staff room-type scope cho phiếu thiết bị

Trạng thái:

```text
ALREADY_FIXED
```

Đã có:

- Helper kiểm tra scope theo class schedule và room type.
- Wrapper cho manager status RPC.
- Wrapper cho late approval RPC.
- Scoped RLS cho request.
- Scoped RLS cho items.
- Trigger enforcement cho direct mutation.
- Negative test Staff ngoài scope.

Không cần sửa thêm trong third follow-up, trừ khi phát hiện regression.

## 8.2. Email Processing/Off race

Trạng thái:

```text
ALREADY_FIXED
```

Đã có:

- Chuyển Off chỉ suppress notification pending.
- Processing row vẫn thuộc worker.
- Worker kiểm tra Off trước provider call.
- Provider success nhưng DB ACK không thành công chuyển sang `sent_unconfirmed`.
- Không retry provider-success như một lỗi gửi thông thường.

Không cần sửa thêm trong third follow-up, trừ khi test regression thất bại.

## 8.3. Apps Script unauthorized log spam

Trạng thái:

```text
ALREADY_FIXED
```

Đã có:

- Request sai HMAC không append Google Sheet.
- Chỉ ghi execution log với hash rút gọn.
- Không ghi payload attacker.
- Authenticated invalid payload vẫn được sanitize trước khi ghi Sheet.

Không cần sửa thêm trong third follow-up.

## 8.4. Preview so với lịch đã tồn tại

Trạng thái:

```text
PARTIALLY_FIXED
```

Đã có:

- Duplicate manual schedule.
- Duplicate imported schedule.
- Room conflict.
- Lecturer conflict.
- Phân loại conflict.

Còn thiếu:

- Conflict giữa các dòng cùng file.
- Bỏ qua imported schedule đã cancelled.
- UI label cho conflict.

---

# 9. Tài liệu cần cập nhật

## 9.1. PR body

PR body hiện còn thông tin cũ.

Cần cập nhật:

- Test count mới.
- pgTAP count mới.
- Playwright count mới.
- Final HEAD mới.
- CI run mới.
- Hai báo cáo follow-up.
- Không còn dùng capability giao thiết bị sớm.
- Partial success đã được chủ hệ thống chốt.
- Hard-delete/soft-delete đã có quyết định nghiệp vụ nhưng chưa triển khai.
- Không còn ghi “chờ quyết định sản phẩm” cho các mục đã được chốt.

## 9.2. SHA sai trong tài liệu second follow-up

File:

```text
docs/SAFE_REVIEW_SECOND_FOLLOWUP_2026-08-06.md
```

đang có chuỗi SHA bị sai dạng:

```text
8cc57a926023de7feba49c11d5203784a802547d
```

Phải sửa thành:

```text
8cc57a926023de7feba49c11d5203784a802547d
```

## 9.3. Báo cáo third follow-up

Sau khi sửa code, tạo:

```text
docs/SAFE_REVIEW_THIRD_FOLLOWUP_RESULT_2026-08-06.md
```

Báo cáo phải ghi:

- HEAD trước sửa.
- Code remediation commit.
- HEAD cuối.
- Workflow run ID.
- Workflow job ID.
- Kết quả từng bước CI.
- Test count.
- File thay đổi.
- Finding trước và sau.
- Finding còn mở.
- PR có thể chuyển Ready hay chưa.
- Production blocker còn lại.

---

# 10. Test coverage bắt buộc

Third follow-up phải bổ sung ít nhất các test sau.

## Role composition

- Lecturer only.
- Importer only.
- Lecturer + Importer.
- Staff + Importer.
- Admin + bất kỳ role nào.
- Viewer bị từ chối.

## Schedule actions

- Reschedule.
- Update details.
- Assign lecturers.
- Delete.
- Own manual schedule.
- Own import batch.
- Other owner.
- Other batch.
- Source room scope.
- Target room scope.

## Shift time boundary

- Shift hôm nay đã bắt đầu.
- Shift hôm nay chưa bắt đầu.
- Shift hôm qua.
- Completed.
- Cancelled.
- Manual.
- Generated.
- Pattern replacement.
- Pattern cancellation.
- Cron refresh.
- Idempotency.

## Import preview

- Duplicate với database.
- Conflict với database.
- Duplicate trong cùng file.
- Conflict phòng trong cùng file.
- Conflict giảng viên trong cùng file.
- Adjacent time không conflict.
- Cancelled imported schedule không duplicate.
- Cancelled manual schedule không duplicate.
- UI hiển thị conflict.

---

# 11. Definition of Done

PR chỉ được chuyển sang Ready for review khi:

1. Role Importer không làm mất quyền Lecturer.
2. Multi-role authorization được tính cộng gộp.
3. Ca trực đã bắt đầu trong ngày không thể bị xóa hoặc tạo lại.
4. Materializer không xử lý occurrence đã bắt đầu.
5. UI hiển thị conflict đúng.
6. Conflict row có style lỗi.
7. Preview phát hiện duplicate trong cùng file.
8. Preview phát hiện room conflict trong cùng file.
9. Preview phát hiện lecturer conflict trong cùng file.
10. Cancelled imported schedule không còn chặn preview.
11. Các negative/direct/database/UI tests mới đều xanh.
12. Toàn bộ GitHub Actions xanh ở HEAD cuối.
13. Third follow-up result report đã được commit.
14. PR body đã được cập nhật.
15. Không còn High finding mở.

---

# 12. Blocker trước production

Ngay cả khi PR #1 được chuyển Ready và merge sau review, các mục sau vẫn là blocker trước production.

## 12.1. Hard-delete và soft-delete

Phải triển khai lifecycle chính thức:

- Chưa có dữ liệu liên kết: có thể hard-delete.
- Đã có dữ liệu liên kết: chỉ cancel/archive.
- Lưu actor, timestamp và reason.
- Reset dữ liệu test bằng script riêng có environment guard.

## 12.2. Chữ ký private Storage

Phải chuyển:

```text
base64 trong database
```

sang:

```text
Supabase private Storage
```

Bao gồm:

- Private bucket.
- Object path.
- Hash.
- Metadata.
- Signed URL.
- RLS.
- Backfill.
- Audit.

## 12.3. Apps Script production rehearsal

Phải thực hiện maintenance window:

1. Email Off.
2. Deploy Apps Script HMAC.
3. Deploy migration và application.
4. Chuyển Test.
5. Gửi thử.
6. Kiểm tra recipient, logs và DB.
7. Sau đó mới chuyển Live.

---

# 13. Prompt giao cho AI executor

Đọc toàn bộ repository tại:

```text
Repository: baonguyen-kobe/eiu-medlabs
Branch: review/hardening-20260805
PR: #1
Current reviewed HEAD: feac6116523d2c95d45daaa82db7c419cac5a939
```

Đọc các tài liệu:

```text
docs/SAFE_REVIEW_CLASSIFICATION_2026-08-05.md
docs/SAFE_REVIEW_FINAL_REPORT_2026-08-05.md
docs/SAFE_REVIEW_FOLLOWUP_RESULT_2026-08-06.md
docs/SAFE_REVIEW_SECOND_FOLLOWUP_2026-08-06.md
docs/SAFE_REVIEW_SECOND_FOLLOWUP_RESULT_2026-08-06.md
docs/SAFE_REVIEW_THIRD_FOLLOWUP_2026-08-06.md
docs/APPS_SCRIPT_EMAIL_SETUP.md
```

Trước khi sửa:

1. Xác minh HEAD thực tế của branch.
2. Xác minh PR vẫn là Draft.
3. Không merge `main`.
4. Không deploy production.
5. Không redeploy Apps Script production.

Thực hiện các remediation sau.

## Task 1 — Multi-role additive authorization

Refactor authorization để các role được cộng gộp.

Không cho nhánh Importer `return false` trước khi xét Lecturer.

Đảm bảo user có đồng thời Lecturer + Importer:

- Giữ toàn bộ quyền Lecturer hợp lệ.
- Có thêm quyền import.
- Chỉ có quyền Importer ownership đối với lịch của mình/batch của mình.
- Không có quyền Staff.

Áp dụng đồng nhất cho:

```text
reschedule_class
update_class_schedule_details
assign_class_lecturers
delete class schedule
các helper authorization liên quan
```

## Task 2 — Same-day shift history

Sửa trigger và materializer để bảo vệ ca đã bắt đầu trong ngày.

Dùng business timestamp:

```sql
shift_date + start_time
```

Không chỉ dùng `shift_date`.

Không xóa, recreate hoặc update occurrence đã bắt đầu.

## Task 3 — Conflict UI

Bổ sung:

```text
conflict → Xung đột
```

Bao gồm:

- Label.
- CSS class.
- Row invalid state.
- Help text.
- Component/E2E test.

## Task 4 — Intra-file preview conflicts

So các prepared rows trong cùng file theo `rowNumber`.

Phân loại:

```text
duplicate
conflict
valid
warning
error
```

Kiểm tra:

- Duplicate business key.
- Room overlap.
- Lecturer overlap.
- Adjacent intervals.

Kết quả phải deterministic.

## Task 5 — Ignore cancelled imported schedules

Sửa `find_existing_import_hashes` để chỉ trả hash của schedule còn active, không cancelled.

Thêm direct database test.

## Task 6 — Documentation

- Sửa SHA sai có chuỗi `aux`.
- Cập nhật PR body.
- Tạo:

```text
docs/SAFE_REVIEW_THIRD_FOLLOWUP_RESULT_2026-08-06.md
```

## Task 7 — CI

Chạy toàn bộ:

```bash
npm ci
npm run format:check
npm audit
npx supabase db reset
npx supabase db lint --local --level error
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:e2e:critical
npm run build
```

Sau khi hoàn tất:

1. Commit code vào `review/hardening-20260805`.
2. Push branch.
3. Không merge.
4. Chạy GitHub Actions.
5. Chờ CI ở final HEAD xanh.
6. Commit báo cáo nếu cần.
7. Chạy CI lại ở final HEAD có báo cáo.
8. Cập nhật PR #1 bằng final HEAD, run ID và job ID.
9. Chỉ đề xuất chuyển Ready nếu không còn High finding mở.

---

# 14. Kết luận reviewer hiện tại

| Nội dung                                 | Kết quả       |
| ---------------------------------------- | ------------- |
| Final HEAD đã xác minh                   | PASS          |
| GitHub Actions                           | PASS          |
| Staff equipment scope                    | PASS          |
| Email Processing/Off                     | PASS          |
| Apps Script unauthorized spam            | PASS          |
| Importer ownership đơn role              | PASS          |
| Lecturer + Importer additive permissions | FAIL          |
| Shift history ngày trước                 | PASS          |
| Shift đã bắt đầu trong hôm nay           | FAIL          |
| Existing schedule preview                | PASS một phần |
| Conflict UI                              | FAIL          |
| Intra-file conflict preview              | Chưa xử lý    |
| Cancelled import hash                    | Chưa xử lý    |
| PR state                                 | Giữ Draft     |

Kết luận:

> **REQUEST CHANGES — chưa chuyển PR #1 sang Ready for review.**

Không cần thêm quyết định nghiệp vụ từ chủ hệ thống.

AI executor cần sửa các finding kỹ thuật trong tài liệu này, bổ sung test, chạy toàn bộ CI và cập nhật báo cáo theo final HEAD.
