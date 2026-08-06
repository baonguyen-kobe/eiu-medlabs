# Safe Review — Second Follow-up

Ngày review: 06/08/2026
Repository: `baonguyen-kobe/eiu-medlabs`
Pull Request: `#1`
Branch: `review/hardening-20260805`
HEAD được review: `8cc57a926023de7feba49c11d5203784a802547d`
GitHub Actions run: `31069936547`
GitHub Actions job: `92515562568`

> Lưu ý: trước khi thực hiện, AI phải xác minh lại HEAD chính xác trên GitHub. HEAD được người dùng cung cấp là `8cc57a926023de7feba49c11d5203784a802547d`; nếu chuỗi này không phải SHA hợp lệ hoặc khác HEAD thực tế thì phải dùng HEAD thực tế của branch và ghi rõ trong báo cáo.

## 1. Phạm vi review

Review lần này đối chiếu:

- Source code tại HEAD cuối của PR #1.
- `docs/SAFE_REVIEW_CLASSIFICATION_2026-08-05.md`.
- `docs/SAFE_REVIEW_FINAL_REPORT_2026-08-05.md`.
- `docs/SAFE_REVIEW_FOLLOWUP_RESULT_2026-08-06.md`.
- GitHub Actions run cuối.
- Các quyết định nghiệp vụ đã được chủ hệ thống chốt.

Các thay đổi đã được kiểm tra trọng tâm gồm:

- Authorization và room-type scope.
- Quyền Importer.
- Import duplicate/concurrency.
- Email Test/Live, HMAC, nonce và ACK.
- Phiếu đăng ký thiết bị.
- Giao thiết bị sớm.
- Quy tắc đăng ký dưới 24 giờ.
- Lịch trực cố định.
- Hard-delete và soft-delete.
- Test coverage và CI.

---

# 2. Kết luận reviewer

GitHub Actions tại HEAD cuối đã xanh toàn bộ, gồm:

- `npm ci`.
- Format check.
- Dependency audit.
- Supabase start/reset.
- Seed fixtures.
- Database lint.
- ESLint.
- TypeScript.
- Unit và database tests.
- pgTAP.
- Critical E2E.
- Production build.

Tuy nhiên, kết luận reviewer hiện tại vẫn là:

> **REQUEST CHANGES — TIẾP TỤC GIỮ PR Ở TRẠNG THÁI DRAFT**

Chưa nên merge PR #1 vì vẫn còn các vấn đề authorization và data-history cần xử lý.

Không merge vào `main`.

Không deploy production.

Không redeploy Apps Script production trong PR này.

---

# 3. HIGH-01 — Quyền Importer chưa được áp dụng nhất quán

## Trạng thái

`CONFIRMED`

`update_class_schedule_details` đã kiểm tra đúng quyền sở hữu của Importer:

- Lịch do Importer tạo.
- Hoặc lịch thuộc batch import do Importer đó tạo.
- Đồng thời phải nằm trong loại phòng được gán.

Tuy nhiên, các luồng khác vẫn có thể coi Importer như một manager của toàn bộ lịch trong cùng loại phòng.

Các luồng cần kiểm tra và sửa:

- `reschedule_class`.
- `assign_class_lecturers`.
- Policy xóa `class_schedules`.
- `deleteClassSchedule`.
- Các RPC hoặc policy đang dùng `private.can_manage_class_room`.
- Các thao tác cập nhật khác cho phép role `importer`.

## Quyết định nghiệp vụ chính thức

Importer:

- Có quyền tạo lịch giống người dùng được phép tạo lịch.
- Có thêm quyền import file.
- Chỉ được sửa lịch do chính mình tạo.
- Chỉ được sửa lịch thuộc batch import do chính mình thực hiện.
- Không được sửa lịch của Importer khác.
- Không được sửa lịch của Lecturer, Teaching Assistant hoặc Staff khác.
- Không được xóa lịch của người khác.
- Chỉ được thao tác trong loại phòng được gán.
- Không có quyền quản lý toàn bộ dữ liệu trong scope giống Staff.

Staff:

- Được quản lý lịch của người khác trong các loại phòng được phân công.
- Có nhiều giao diện và quyền vận hành hơn Importer.

## Yêu cầu sửa

Tạo một helper authorization dùng chung, ví dụ:

```sql
private.can_modify_class_schedule(
  target_schedule_id uuid,
  target_action text
)
```

Quy tắc:

### Admin

- Được quản lý mọi lịch.

### Staff

- Được quản lý lịch nếu có scope của phòng nguồn.
- Khi đổi phòng phải có cả scope phòng nguồn và phòng đích.

### Importer

Phải thỏa toàn bộ:

```text
Có role Importer
AND có scope phòng nguồn
AND có scope phòng đích nếu đổi phòng
AND (
  class_schedules.created_by = auth.uid()
  OR import_batches.created_by = auth.uid()
)
```

### Lecturer hoặc Teaching Assistant

- Chỉ được sửa lịch do mình tạo hoặc lịch mình được phân công theo giới hạn nghiệp vụ.
- Không được sửa phòng, giờ, số sinh viên hoặc danh sách giảng viên nếu nghiệp vụ không cho phép.
- Không được sửa lịch người khác chỉ vì cùng room type.

## Test bắt buộc

- Importer đổi ngày lịch do Importer khác tạo: từ chối.
- Importer đổi giảng viên lịch của người khác: từ chối.
- Importer xóa lịch của người khác: từ chối.
- Importer sửa lịch manual do chính mình tạo: thành công.
- Importer sửa lịch thuộc batch import của mình: thành công.
- Importer không sửa được lịch trong batch của người khác.
- Staff trong đúng scope sửa được lịch của người khác.
- Staff ngoài scope bị từ chối.
- Admin thực hiện được thao tác hợp lệ.
- Viewer gọi direct RPC bị từ chối.

---

# 4. HIGH-02 — Staff quản lý phiếu thiết bị chưa kiểm tra room-type scope

## Trạng thái

`CONFIRMED`

Một số RPC quản lý thiết bị hiện chỉ kiểm tra:

- Tài khoản active.
- Có role Admin hoặc Staff.

Nếu RPC là `SECURITY DEFINER` nhưng không kiểm tra room type của lớp liên quan, Staff có thể gọi trực tiếp RPC bằng UUID của phiếu ngoài scope.

## Các luồng phải kiểm tra

- `manager_confirm_equipment_status`.
- `manager_review_late_equipment_request`.
- Bổ sung thiết bị vào phiếu.
- Xóa thiết bị khỏi phiếu.
- Sửa số lượng thiết bị.
- Xóa phiếu thiết bị.
- Xuất hoặc xem dữ liệu quản lý phiếu.
- Các RPC xác nhận giao, trả hoặc hoàn tất.
- Các API route sử dụng Admin client hoặc service role.

## Quyết định nghiệp vụ chính thức

Admin:

- Quản lý toàn bộ phiếu.

Staff:

- Chỉ quản lý phiếu thuộc loại phòng được phân công.
- Không được quản lý phiếu ngoài scope dù biết UUID.

Importer, Lecturer và Teaching Assistant:

- Không có quyền quản lý kho giống Staff.
- Chỉ được thực hiện hành động thuộc vai trò người đăng ký hoặc người phụ trách.

## Yêu cầu sửa

Mọi RPC quản lý phải xác định scope theo chuỗi:

```text
equipment_requests
→ class_schedules
→ rooms
→ room_type_id
```

Sau đó áp dụng:

```text
Admin
OR (
  Staff
  AND private.has_room_type(room_type_id)
)
```

Không chỉ dựa trên role.

Không chỉ dựa trên việc UI đã ẩn phiếu.

Không tin RLS nếu RPC chạy `SECURITY DEFINER`.

## Test bắt buộc

- Staff đúng scope chuyển `new → preparing`: thành công.
- Staff đúng scope xác nhận giao sớm: thành công.
- Staff ngoài scope gọi direct RPC: từ chối.
- Staff ngoài scope duyệt phiếu dưới 24 giờ: từ chối.
- Staff ngoài scope sửa danh sách thiết bị: từ chối.
- Viewer gọi RPC: từ chối.
- Lecturer gọi RPC quản lý kho: từ chối.
- Admin thực hiện được thao tác hợp lệ.

---

# 5. HIGH-03 — Hủy hoặc thay lịch trực cố định có thể xóa lịch sử

## Trạng thái

`PARTIALLY_FIXED`

`private.materialize_shift_pattern` đã được cải thiện:

- Không còn xóa ca thủ công khi refresh.
- Không ghi đè ca completed hoặc cancelled.
- Conflict một occurrence không làm toàn bộ refresh thất bại.
- Có advisory lock và upsert.

Tuy nhiên, các luồng thay hoặc hủy pattern vẫn cần kiểm tra các lệnh dạng:

```sql
delete from public.staff_shifts
where shift_pattern_id = target_pattern_id;
```

Nếu còn tồn tại, lệnh này có thể xóa:

- Ca đã hoàn thành.
- Ca đã hủy.
- Metadata hủy.
- Audit history.
- Ca trong quá khứ.

## Quyết định nghiệp vụ

Không được xóa lịch sử ca trực đã sử dụng.

### Phải giữ

- Ca `completed`.
- Ca `cancelled`.
- Ca trong quá khứ.
- Ca manual.
- Ca admin-assigned.
- Người tạo.
- Người hủy.
- Thời gian hủy.
- Ghi chú và audit log.

### Có thể xử lý

Với ca generated, scheduled và nằm trong tương lai:

- Có thể xóa nếu chưa được sử dụng; hoặc
- Chuyển thành cancelled.

Ưu tiên chuyển thành cancelled nếu cần giữ lịch sử thay đổi pattern.

## Yêu cầu sửa

Khi thay pattern:

- Vô hiệu hóa pattern cũ.
- Không xóa toàn bộ các shift con.
- Chỉ xử lý ca generated, scheduled và trong tương lai.
- Giữ nguyên completed/cancelled/past.

Khi hủy pattern:

- Đặt `is_active = false`.
- Chỉ hủy các ca generated, scheduled trong tương lai.
- Không xóa các ca đã có lịch sử.

## Test bắt buộc

Tạo một pattern có:

- Một ca completed.
- Một ca cancelled.
- Một ca scheduled trong tương lai.
- Một ca manual chồng hoặc liên quan.

Sau đó thực hiện:

1. Refresh pattern.
2. Thay pattern.
3. Hủy pattern.
4. Chạy cron lại.

Kết quả:

- Completed vẫn còn completed.
- Cancelled vẫn còn cancelled.
- Metadata không mất.
- Manual shift không bị xóa.
- Pattern khác vẫn refresh bình thường.
- Chạy nhiều lần phải idempotent.

---

# 6. MEDIUM-01 — Race khi chuyển email sang Off

## Trạng thái

`PARTIALLY_FIXED`

Email đã snapshot Test hoặc Live tại thời điểm enqueue, điều này đúng.

Tuy nhiên, cần xử lý race:

1. Worker claim email.
2. Worker đọc setting là Live.
3. Admin chuyển hệ thống sang Off.
4. Một hàm bulk-suppress đổi notification `processing` thành `suppressed`.
5. Provider vẫn gửi email.
6. Worker update `sent` nhưng row không còn ở `processing`.
7. Database có thể ghi suppressed trong khi email đã thực sự gửi.

## Yêu cầu sửa

Ưu tiên:

- Khi chuyển Off, chỉ suppress `pending`.
- Không đổi notification đang `processing` thành suppressed một cách mù.
- Worker sau provider success phải xác nhận update DB thực sự cập nhật một row.
- Dùng `.select("id").maybeSingle()` hoặc cơ chế tương đương.
- Nếu provider đã gửi nhưng không ACK được DB:

  - Chuyển `sent_unconfirmed`.
  - Không retry tự động.
  - Đưa vào reconciliation.

## Test bắt buộc

- Email processing, setting chuyển Off trước provider call: không gửi.
- Provider đã bắt đầu gửi, setting chuyển Off: không ghi sai suppressed.
- Provider success nhưng row status đã đổi: `sent_unconfirmed`.
- Không gửi provider lần hai.

---

# 7. MEDIUM-02 — Unauthorized request vẫn có thể spam Apps Script log

## Trạng thái

`PARTIALLY_FIXED`

Đã xử lý đúng:

- Không log nguyên payload unauthorized.
- Sanitize formula injection.
- Giới hạn độ dài ô Sheet.

Tuy nhiên, Web App được public `Anyone` và mỗi request sai chữ ký vẫn có thể append một dòng vào Google Sheet.

Điều này có thể gây:

- Spam log.
- Tốn quota Apps Script.
- Tăng thao tác Sheet.
- Sheet đạt giới hạn hoặc hoạt động chậm.

## Yêu cầu sửa

Chọn một trong các phương án:

### Phương án ưu tiên

Không ghi request unauthorized vào Google Sheet.

Chỉ dùng:

```js
console.warn("UNAUTHORIZED");
```

### Hoặc

- Sampling tối đa một bản ghi mỗi phút.
- Ghi counter tổng hợp.
- Không append mỗi request.
- Có giới hạn theo time window.

Request đã xác thực nhưng payload lỗi vẫn có thể ghi log sau khi sanitize.

## Test bắt buộc

- Gửi nhiều request sai chữ ký.
- Không phát sinh một dòng Sheet cho từng request.
- Request hợp lệ vẫn ghi log bình thường.
- Formula injection vẫn bị neutralize.

---

# 8. MEDIUM-03 — Preview import chưa kiểm tra lịch tạo thủ công

## Trạng thái

`PARTIALLY_FIXED`

Execution RPC đã kiểm tra trực tiếp `class_schedules`, vì vậy dữ liệu không bị tạo trùng.

Tuy nhiên, preview hiện có thể chỉ tìm hash trong `import_rows`.

Kết quả có thể xảy ra:

- Preview báo dòng hợp lệ.
- Khi execute mới báo duplicate với lịch tạo thủ công.

Đây không phải lỗi integrity nhưng làm UX thiếu nhất quán.

## Yêu cầu sửa

Preview phải kiểm tra:

- Lịch đã import.
- Lịch tạo thủ công.
- Lịch được tạo từ nguồn khác.
- Duplicate business key.
- Conflict phòng.
- Conflict giảng viên nếu có.

Kết quả preview phải phân loại:

```text
valid
warning
duplicate
conflict
error
```

Không cần bảo đảm preview thay thế kiểm tra transaction-time. Execution RPC vẫn phải kiểm tra lại để chống race.

## Test bắt buộc

- Có lịch manual trùng hoàn toàn: preview trả duplicate.
- Có lịch import trùng: preview trả duplicate.
- Có lịch overlap nhưng khác giờ: preview trả conflict.
- Preview và execute không mâu thuẫn trong trường hợp không có race.
- Hai request concurrent vẫn chỉ tạo một lịch.

---

# 9. Finding đã xử lý đúng

Các finding sau được đánh giá là đã xử lý hợp lý và nên giữ lại.

## 9.1. CI và lockfile

- Pin npm version.
- `npm ci` chạy thành công.
- Audit không có vulnerability được báo cáo.
- Supabase reset từ migration sạch.
- Database lint.
- Unit tests.
- pgTAP.
- Critical E2E.
- Production build.

Trạng thái:

```text
ALREADY_FIXED
```

## 9.2. Cross-room update_class_schedule_details

- Kiểm tra source scope.
- Kiểm tra target scope.
- Kiểm tra ownership của Importer.
- Kiểm tra giảng viên active.
- Kiểm tra role Lecturer.
- Kiểm tra room-type scope của giảng viên.

Trạng thái:

```text
ALREADY_FIXED
```

Lưu ý: các RPC khác vẫn phải đồng bộ cùng quy tắc.

## 9.3. Email Test/Live snapshot

- Notification giữ mode tại thời điểm enqueue.
- Test không tự đổi thành Live.
- Live không tự đổi thành Test.
- Email tạo ở Off được suppressed.
- Off vẫn là emergency stop.

Trạng thái:

```text
ALREADY_FIXED
```

Ngoại trừ race Processing/Off tại Finding MEDIUM-01.

## 9.4. HMAC và nonce

- Canonical JSON array có thứ tự.
- Test Unicode, newline và chuỗi rỗng.
- Nonce được lưu dưới ScriptLock.
- Nonce lặp bị từ chối.
- Có timestamp expiry.
- Secret không nằm trong body.

Trạng thái:

```text
ALREADY_FIXED
```

## 9.5. Provider success nhưng DB ACK fail

- Có `sent_unconfirmed`.
- Không chuyển provider-success thành retryable failed.
- Có provider timestamp/message ID.
- Apps Script có dedupe key.

Trạng thái:

```text
ALREADY_FIXED
```

Ngoại trừ race status tại MEDIUM-01.

## 9.6. Import hash và concurrency

- Database tự tính canonical hash.
- Hash caller được xác minh.
- Có advisory lock.
- Direct RPC dùng hash giả bị từ chối.
- Concurrent duplicate chỉ tạo một lịch.
- Duplicate và conflict được phân loại riêng.
- Partial success đã được giữ theo quyết định nghiệp vụ.
- Có `completed_with_errors`.

Trạng thái:

```text
ALREADY_FIXED
```

Ngoại trừ preview manual duplicate tại MEDIUM-03.

## 9.7. Phiếu thiết bị

- Tạo request và items trong transaction.
- Kiểm tra responsible lecturer.
- Không cho Staff/Importer tự đặt mình làm lecturer nếu không hợp lệ.
- Validation ngày, giờ và độ dài nằm ở database.
- Phiếu dưới 24 giờ cần lý do và phê duyệt.
- Giao thiết bị sớm không cần capability riêng.
- Không hard-code email để cho phép giao sớm.

Trạng thái:

```text
ALREADY_FIXED
```

Ngoại trừ Staff room-type scope tại HIGH-02.

---

# 10. Quyết định nghiệp vụ về giao thiết bị sớm

Giữ nguyên quyết định sau:

- Được giao thiết bị sớm hơn thời gian nhận dự kiến.
- Không cần capability riêng.
- Không cần cấp quyền cá nhân.
- Không cần Admin phê duyệt riêng cho việc giao sớm.
- Không cần nhập lý do giao sớm.
- Người thực hiện chỉ cần có quyền giao nhận hợp lệ và đúng room-type scope.
- Vẫn phải lưu thời gian giao thực tế.
- Không thay đổi `receive_at` chỉ để khớp thời gian giao thật.

Quy tắc 24 giờ chỉ áp dụng cho:

```text
Thời điểm gửi phiếu
→ Thời gian nhận dự kiến
```

Không áp dụng cho:

```text
Thời gian giao thực tế
→ Thời gian nhận dự kiến
```

Phiếu dưới 24 giờ:

- Phải có lý do.
- Phải chờ phê duyệt.
- Sau khi được duyệt vẫn có thể giao sớm bình thường.

Việc bắt buộc chuyển trạng thái sang `preparing` trước khi xác nhận `handed_over` là bước quy trình “Đã soạn”, không phải đặc quyền giao sớm.

---

# 11. Hard-delete và soft-delete

## Trạng thái

`CONFIRMED — CHƯA XỬ LÝ`

Quyết định nghiệp vụ đã được chốt, vì vậy không còn lý do “chờ quyết định sản phẩm”.

## Quy tắc chính thức

### Được hard-delete

Chỉ khi bản ghi:

- Chưa có dữ liệu liên kết.
- Chưa có lịch sử vận hành.
- Chưa có giảng viên nhận.
- Chưa có phiếu thiết bị.
- Chưa có email notification.
- Chưa có chữ ký.
- Chưa có giao nhận.
- Chưa có audit hoặc dữ liệu phụ thuộc cần giữ.

Database phải xác minh điều kiện này.

### Phải soft-delete/cancel

Khi đã có bất kỳ dữ liệu liên kết nào:

- Không được hard-delete.
- Chuyển `cancelled` hoặc `archived`.
- Lưu người hủy.
- Lưu thời gian.
- Lưu lý do.
- Giữ lịch sử liên quan.

### Dữ liệu test

Xóa trắng dữ liệu test phải dùng:

- Local reset.
- Staging reset.
- Maintenance script có environment guard.

Không dùng nút hard-delete production để xóa dữ liệu test đã có liên kết.

## Phân loại phạm vi

Có thể tách thành PR riêng nếu thay đổi quá lớn.

Tuy nhiên:

> Phải hoàn thành trước production.

---

# 12. Chữ ký private Storage

## Trạng thái

`CONFIRMED — CHƯA XỬ LÝ`

Chuyển chữ ký base64 sang Supabase private Storage.

Yêu cầu:

- Bucket private.
- Database lưu object path, hash và metadata.
- Signed URL thời hạn ngắn.
- RLS theo phiếu và vai trò.
- Có backfill.
- Có audit.
- Không thu chữ ký thật quy mô lớn trước khi hoàn tất.

Có thể tách thành PR riêng.

Phải hoàn thành trước production.

---

# 13. Apps Script deployment

## Trạng thái

`PARTIALLY_FIXED`

Tài liệu maintenance window đã có.

Không cần hỗ trợ legacy protocol lâu dài.

Chưa rehearsal production là đúng phạm vi vì PR này không được deploy.

Trước production phải:

1. Chuyển email Off.
2. Xác nhận queue an toàn.
3. Deploy Apps Script HMAC.
4. Deploy migration và application.
5. Chuyển Test.
6. Gửi thử.
7. Kiểm tra recipient, Apps Script log và DB.
8. Sau đó mới chuyển Live.

---

# 14. Cập nhật báo cáo

Sau khi sửa các finding trong tài liệu này, tạo:

```text
docs/SAFE_REVIEW_SECOND_FOLLOWUP_RESULT_2026-08-06.md
```

Báo cáo phải ghi:

- HEAD trước sửa.
- HEAD sau sửa.
- Commit SHA.
- Workflow run ID.
- Job ID.
- Kết quả từng bước CI.
- File đã thay đổi.
- Test đã thêm.
- Finding trước và sau.
- Finding chưa xử lý.
- Có chặn merge không.
- Có chặn production không.

Bảng đề xuất:

| ID  | Trạng thái trước | Trạng thái sau | File | Test | Kết quả | Chặn merge | Chặn production |
| --- | ---------------- | -------------- | ---- | ---- | ------- | ---------- | --------------- |

Không được chỉ ghi “CI xanh”.

---

# 15. Definition of Done để chuyển PR sang Ready for review

PR chỉ được chuyển khỏi Draft khi:

- Importer không thể đổi ngày lịch người khác.
- Importer không thể đổi giảng viên lịch người khác.
- Importer không thể xóa lịch người khác.
- Staff ngoài scope không thể quản lý phiếu thiết bị.
- Hủy hoặc thay pattern không xóa completed/cancelled/past shifts.
- Race email Processing/Off được xử lý.
- Toàn bộ CI xanh ở HEAD cuối.
- Báo cáo second follow-up được cập nhật.
- Không còn High finding `CONFIRMED`.

Các mục sau có thể còn mở nhưng phải ghi rõ là blocker trước production:

- Hard-delete/soft-delete đầy đủ.
- Chữ ký private Storage.
- Apps Script rehearsal.

---
