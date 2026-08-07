# Safe Review — Seventh Follow-up after Sixth: Personnel Saga và Basic Medical Workflow

**Ngày review:** 07/08/2026  
**Repository:** `baonguyen-kobe/eiu-medlabs`  
**PR:** `#1` — `Hardening authorization, imports, email, and equipment workflows`  
**Branch:** `review/hardening-20260805`  
**Reviewed HEAD:** `2e412981f6b2d2a993dea81acc91bcc391bb9c7f`  
**Starting HEAD của Sixth:** `664ebc93b64ef9bd326d2a6f1eabc0d4e2d70242`  
**Implementation commit:** `dc0eda4c46cb3dbf31bd32eaee0f0b3889bf904e`  
**GitHub Actions run:** `31122627764`  
**Verify job:** `92686263091`  
**Reviewer verdict:** **REQUEST CHANGES — tiếp tục giữ PR Draft**

---

# 1. Trạng thái CI được xác minh lại

Thông tin bàn giao nói CI còn `queued`. Tại thời điểm review, trạng thái thật trên GitHub đã thay đổi:

```text
Run 31122627764
status     = completed
conclusion = failure

Verify job 92686263091
status     = completed
conclusion = cancelled
steps      = không có
logs       = không tải được / BlobNotFound
```

Không có bằng chứng một bước lint, test hoặc build nào đã thất bại. Job bị hủy trước khi có step/log nên đây **chưa được phân loại là lỗi code**.

Tuy nhiên, đây cũng **không phải CI xanh**. Final HEAD hiện chưa đáp ứng điều kiện:

```text
GitHub Actions completed / success
```

Executor phải rerun CI trên final HEAD sau khi xử lý review này. Chỉ dùng run có job `verify` hoàn tất đầy đủ và `conclusion = success`.

---

# 2. Kết quả tổng quan Sixth Follow-up

Sixth Follow-up đã xử lý đúng nhiều finding quan trọng:

## Personnel

- Thêm reservation cho cập nhật nhân sự.
- Hai writer đồng thời không còn cùng chạm Supabase Auth.
- `admin_update_personnel` không cho đổi email ngoài operation flow.
- Bulk import kiểm tra reservation của các target được gửi vào file.
- Cleanup Auth user mới có retry tuần tự.
- Danh sách Personnel remount theo page/filter/dataset version.
- UI tự tắt quyền Y cơ sở khi role/scope không hợp lệ.

## Y cơ sở

- Runtime function đã đổi `importer` sang `teaching_assistant`.
- Có helper `private.can_manage_basic_medical()`.
- Staff không có scope Y cơ sở bị chặn ở các route/RPC chính.
- Direct DML vào tồn kho bị thu hồi.
- `signature_data` không còn được cấp quyền SELECT cho authenticated.
- Instructor list dùng role Lecturer thay vì `profiles.title`.
- Lịch `cancelled` không được reuse.
- `getViewer()` trả scope được gán cho non-admin.
- Modal kiểm tra thiết bị mở trước bước ký.
- Sau xác nhận có `router.refresh()`.
- Trang thiết bị đã chuyển phần lớn sang query theo tab và server pagination.
- Có `registration_code` unique.

Các thay đổi trên nên được giữ lại.

Tuy nhiên, review trực tiếp phát hiện các regression và khoảng trống dưới đây. Báo cáo Sixth hiện ghi “không còn High finding mở” là chưa chính xác.

---

# PHẦN A — PERSONNEL

# 3. P-HIGH-01 — Root không còn chỉnh sửa được tài khoản Personnel Manager Bảo

## Trạng thái

```text
CONFIRMED
```

## Vị trí

```text
supabase/migrations/20260806164513_sixth_followup_personnel_and_basic_medical.sql
public.begin_personnel_update(...)
```

## Hiện trạng

`begin_personnel_update` đang kiểm tra:

```sql
if (select private.is_protected_security_principal(target_profile_id)) then
  raise exception 'ROOT_ADMIN_SECURITY_IMMUTABLE';
end if;
```

`private.is_protected_security_principal()` trả `true` cho cả:

- Root Administrator.
- Personnel Manager `bao.nguyen@eiu.edu.vn`.

Vì mọi thay đổi drawer hiện đều đi qua `begin_personnel_update`, Root cũng bị từ chối khi target là Bảo.

Trong khi nghiệp vụ đã chốt:

- Root không được sửa security của chính Root.
- Bảo không được sửa chính mình.
- **Root được quản lý tài khoản Bảo**, gồm role, trạng thái, scope và khóa/mở khóa.

UI vẫn có thể hiển thị Bảo là editable với Root, nhưng submit sẽ lỗi tại RPC.

## Ảnh hưởng

Root không thể:

- Khóa/mở khóa Bảo.
- Sửa role của Bảo.
- Sửa scope/capability của Bảo.
- Đổi email hoặc thông tin hồ sơ của Bảo qua Personnel module.

Đây là regression trực tiếp so với mô hình authority đã chốt.

## Yêu cầu sửa

Không dùng `is_protected_security_principal()` để cấm cả hai tài khoản.

Thay bằng logic riêng:

```text
Nếu target là Root:
  luôn từ chối security update.

Nếu target là Personnel Manager:
  chỉ Root được phép.
  Personnel Manager tự sửa chính mình qua Personnel: từ chối.
  Admin khác: không thể vào module từ đầu.
```

Ví dụ:

```sql
if target_profile_id = actor_id then
  raise exception 'CANNOT_MANAGE_OWN_SECURITY';
end if;

if exists (
  select 1
  from public.system_security_principals p
  where p.singleton
    and p.root_admin_id = target_profile_id
) then
  raise exception 'ROOT_ADMIN_SECURITY_IMMUTABLE';
end if;

if exists (
  select 1
  from public.system_security_principals p
  where p.singleton
    and p.personnel_manager_id = target_profile_id
)
and not (select private.is_root_administrator()) then
  raise exception 'ROOT_ADMIN_REQUIRED_FOR_PERSONNEL_MANAGER';
end if;
```

Áp dụng cùng quy tắc trong:

- `begin_personnel_update`.
- `admin_update_personnel`.
- Import protection.
- UI metadata `can_edit_security`.
- Direct RPC tests.

## Test bắt buộc

- Root sửa tên/scope của Bảo: thành công.
- Root khóa Bảo: thành công.
- Root mở lại Bảo: thành công.
- Root gỡ role Admin của Bảo: theo nghiệp vụ Root được phép.
- Bảo tự sửa security: từ chối.
- Bảo tự khóa: từ chối.
- Admin thường: không truy cập module/RPC.
- Root không thể sửa security của chính Root.

---

# 4. P-HIGH-02 — Process crash giữa Auth update và DB commit vẫn làm lệch danh tính

## Trạng thái

```text
CONFIRMED
```

## Vị trí

```text
app/admin/actions.ts
savePersonnelChanges(...)

public.begin_personnel_update(...)
public.commit_personnel_update(...)
personnel_update_operations
```

## Phần đã sửa đúng

Reservation đã xử lý race hai request đồng thời:

1. Chỉ một request tạo được operation.
2. Request thua không chạm Auth.
3. Request thắng đổi Auth rồi commit DB.

Điều này đóng lỗi concurrency ban đầu.

## Khoảng trống còn lại

Luồng vẫn có cửa sổ:

```text
begin_personnel_update thành công
→ Auth email update thành công
→ process Node/Vercel bị kill hoặc network bị ngắt
→ commit_personnel_update chưa được gọi
```

Khi đó:

```text
auth.users.email = email mới
profiles.email   = email cũ
operation row    = còn đến khi hết hạn
```

Sau 10 phút, `begin_personnel_update` của request mới xóa operation hết hạn:

```sql
delete from personnel_update_operations
where profile_id = target_profile_id
  and expires_at <= clock_timestamp();
```

Operation bị xóa mà không:

- Đối chiếu Auth với profile.
- Ghi reconciliation.
- Rollback Auth.
- Commit DB.
- Lưu trạng thái xử lý.

Bảng operation hiện cũng không lưu `previous_email` và không có state machine.

## Ảnh hưởng

Một lỗi hạ tầng đúng thời điểm có thể tạo tài khoản:

- Đăng nhập bằng email mới.
- Trang Personnel vẫn hiển thị email cũ.
- Email notification/profile lookup dùng giá trị không đồng nhất.
- Không có reconciliation log để Root biết cần xử lý.

## Mức độ

```text
High
```

Đây là saga đa hệ thống chưa durable, không phải lỗi hiển thị.

## Yêu cầu sửa

Chuyển operation thành state machine bền vững.

### Cột đề xuất

```text
previous_email
requested_email
status:
  reserved
  auth_updated
  committed
  rollback_required
  rolled_back
  reconciliation_required
  expired
auth_updated_at
committed_at
resolved_at
last_error
```

### Luồng đề xuất

1. `begin_personnel_update`
   - Validate đầy đủ payload.
   - Ghi `previous_email`.
   - Status `reserved`.

2. Sau Auth update thành công
   - Server gọi RPC `mark_personnel_auth_updated(operation_id)`.
   - Status `auth_updated`.

3. `commit_personnel_update`
   - Chỉ cho operation `auth_updated`.
   - Commit profile/role/scope.
   - Status `committed` hoặc chuyển sang audit table.
   - Không xóa dấu vết trước khi kết quả được ghi bền vững.

4. Khi Auth update lỗi
   - Cancel operation ở status `reserved`.

5. Reconciler service-role
   - Chạy theo lịch.
   - Kiểm tra operation hết hạn ở `auth_updated`.
   - So sánh Auth email và profile email.
   - Commit an toàn hoặc rollback Auth.
   - Nếu không xử lý được: khóa profile và ghi reconciliation.

6. Không được chỉ xóa operation hết hạn.

## Test bắt buộc

Failure injection tại chính khoảng:

```text
Auth update thành công
process chết trước commit RPC
```

Sau khi chạy reconciler:

- `auth.users.email = profiles.email`.
- Operation có trạng thái resolved.
- Không mất dấu vết.
- Không rollback nhầm thay đổi của writer mới.
- Nếu provider rollback thất bại, profile bị khóa và reconciliation log tồn tại.

---

# 5. P-MEDIUM-01 — Import “all” vẫn có thể khóa profile đang có reservation nếu profile bị bỏ khỏi file

## Vị trí

```text
public.admin_apply_personnel_import(...)
```

## Hiện trạng

Sixth patch thêm check reservation trong vòng lặp các dòng target:

```text
for each target row
→ lock profile
→ nếu có personnel_update_operations thì từ chối
```

Nhưng mode `all` còn vòng lặp khác:

```sql
select p.*
from profiles p
where p.id not in applied_ids
  and not protected
  and not current_admin
for update
```

Các profile không có trong file sẽ bị khóa/inactivate. Vòng này chưa kiểm tra active reservation.

## Kịch bản

1. Root mở drawer của Lecturer A và tạo reservation.
2. Bảo chạy Import tất cả với file không có Lecturer A.
3. Mode `all` khóa Lecturer A và tăng `access_version`.
4. Luồng đổi email đang chờ commit sẽ stale hoặc phải rollback Auth.

Không gây silent overwrite nhờ version, nhưng tạo race không cần thiết và trái tuyên bố “bulk import bị chặn khi target có reservation”.

## Yêu cầu sửa

Trong vòng mode `all`:

```sql
and not exists (
  select 1
  from personnel_update_operations op
  where op.profile_id = p.id
    and op.status in ('reserved','auth_updated')
    and op.expires_at > clock_timestamp()
)
```

Chọn một hành vi rõ:

- Từ chối toàn bộ import với `PERSONNEL_UPDATE_IN_PROGRESS`; hoặc
- Skip profile đang được chỉnh sửa và trả count/warning.

Phương án an toàn hơn cho `Import tất cả`: từ chối toàn bộ transaction.

## Test

- Profile có reservation nhưng không xuất hiện trong file `all`.
- Import phải rollback hoặc skip đúng thiết kế.
- Không thay `is_active`, capability hoặc `access_version` của target.

---

# 6. P-MEDIUM-02 — Cleanup fallback không kiểm tra lỗi khóa profile và ghi reconciliation

## Vị trí

```text
cleanupCreatedAuthUsersOrRecordReconciliation(...)
app/admin/actions.ts
```

## Hiện trạng

Khi `deleteUser` thất bại sau retry, helper gọi:

```text
service-role update profiles.is_active = false
insert personnel_auth_reconciliation_logs
```

nhưng không kiểm tra `.error` của hai thao tác này.

Helper vẫn trả failure, còn caller có thể hiển thị rằng hệ thống đã khóa và ghi nhận đối soát dù cả hai DB operation cũng thất bại.

## Yêu cầu sửa

- Kiểm tra lỗi từng thao tác.
- Thu thập:
  - Auth delete error.
  - Profile lock error.
  - Reconciliation insert error.
- Nếu profile lock thất bại, nâng mức cảnh báo đặc biệt.
- Không dùng thông điệp “đã ghi nhận” khi insert log chưa thành công.
- Ghi log hệ thống có correlation/operation ID.

## Test

Failure injection cho:

- Auth delete thất bại.
- Profile lock thất bại.
- Reconciliation insert thất bại.
- Cả ba thất bại.

---

# 7. P-MEDIUM-03 — Nhánh “commit đã thành công nhưng response lỗi” trả thiếu personnel snapshot

## Vị trí

```text
app/admin/actions.ts
components/personnel-management-list.tsx
```

## Hiện trạng

Nếu `commit_personnel_update` trả error do gián đoạn nhưng service client đối chiếu thấy DB đã commit, action trả:

```ts
{
  ok: true,
  message: "Đã cập nhật nhân sự..."
}
```

không có `personnel`.

Client hiện chỉ cập nhật local state khi:

```ts
response.ok && response.personnel
```

Kết quả:

- Drawer vẫn giữ `access_version` cũ.
- Dirty state có thể vẫn còn.
- Người dùng tưởng đã lưu nhưng lần lưu sau nhận stale.
- Row danh sách không cập nhật ngay.

## Yêu cầu sửa

Khi xác định commit thực tế đã thành công:

- Gọi RPC/list query lấy snapshot đầy đủ mới.
- Trả `personnel` giống nhánh success bình thường.

Hoặc:

- Trả code riêng.
- Client đóng drawer và `router.refresh()`.

Không trả success không kèm cách đồng bộ UI.

---

# PHẦN B — PHIẾU Y CƠ SỞ

# 8. BM-HIGH-01 — Policy SELECT mới làm mất quyền của giảng viên từng buổi và Viewer

## Trạng thái

```text
CONFIRMED REGRESSION
```

## Vị trí

```text
supabase/migrations/20260806164513_sixth_followup_personnel_and_basic_medical.sql
basic_medical_registrations_select
```

## Policy trước Sixth

Policy trước đó cho người có scope Y cơ sở xem khi:

- Là creator.
- Là registrant.
- Là responsible lecturer.
- Có role Viewer.
- Hoặc là `teaching_lecturer_id` của ít nhất một session.

## Policy sau Sixth

Policy mới chỉ còn:

```text
scoped manager
OR
Y-scope AND (
  created_by = current user
  OR registrant_id = current user
  OR responsible_lecturer_id = current user
)
```

Đã bỏ:

- Viewer.
- Giảng viên giảng dạy/hướng dẫn của từng buổi.

## Kịch bản lỗi

Phiếu:

```text
Người tạo: Trợ giảng
Giảng viên phụ trách: Lecturer A
Buổi 1 teaching lecturer: Lecturer B
```

Lecturer B:

- Có scope Y cơ sở.
- Là đúng người duy nhất được RPC cho ký buổi 1.
- Nhưng không đọc được `basic_medical_registrations`.
- Trang `/basic-medical/registrations` không hiển thị phiếu.
- Không có nút để ký.

Viewer Y cơ sở:

- Menu/route cho phép vào Phiếu Y cơ sở.
- RLS trả danh sách rỗng.

UI helper hiện vẫn tuyên bố Lecturer/TA/Viewer có scope được xem, nên UI và DB không thống nhất.

## Ảnh hưởng tới completion

`basic_medical_registration_list` và `basic_medical_registration_completion` dùng `security_invoker`.

Confirmation metadata RLS cũng chỉ mở cho:

- Signer.
- Manager.
- Registrant/responsible.

Viewer hoặc người được quyền xem registration nhưng không nằm trong các nhóm trên có thể thấy trạng thái completion không đầy đủ.

## Yêu cầu sửa

Tạo helper duy nhất:

```sql
private.can_view_basic_medical_registration(target_registration_id uuid)
```

Logic đề xuất:

```text
active user
AND (
  can_manage_basic_medical()
  OR (
    has Y-scope
    AND (
      has role Viewer
      OR created_by = auth.uid()
      OR registrant_id = auth.uid()
      OR responsible_lecturer_id = auth.uid()
      OR exists session.teaching_lecturer_id = auth.uid()
    )
  )
)
```

Dùng helper cho:

- `basic_medical_registrations` SELECT.
- `basic_medical_registration_sessions` SELECT.
- Confirmation metadata SELECT.
- Equipment-check snapshot SELECT.
- View completion/list.

Vẫn tuyệt đối không grant `signature_data`.

## Test bắt buộc

- Lecturer A responsible: thấy phiếu.
- Lecturer B chỉ dạy một session: thấy phiếu và ký được đúng session.
- Lecturer C cùng scope nhưng không liên quan: theo nghiệp vụ chỉ thấy nếu role Viewer; nếu Lecturer thường thì không.
- Viewer Y-scope: thấy các phiếu theo chính sách Viewer đã chốt.
- User ngoài scope: không thấy.
- Completion count giống nhau cho các actor có quyền xem metadata.

---

# 9. BM-HIGH-02 — Header và sessions vẫn cho direct INSERT/UPDATE/DELETE ngoài RPC

## Trạng thái

```text
CONFIRMED
```

## Vị trí

```text
basic_medical_registrations
basic_medical_registration_sessions
```

## Hiện trạng

Schema vẫn cấp:

```sql
grant select, insert, update, delete
on basic_medical_registrations,
   basic_medical_registration_sessions
to authenticated;
```

Sixth migration còn tạo policy:

```text
basic_medical_registrations_manage FOR ALL
basic_medical_sessions_manage FOR ALL
```

cho manager hoặc người tạo phiếu.

Trong khi thiết kế chính thức yêu cầu:

- Tạo/điều chỉnh qua một RPC atomic.
- Header, sessions và schedules luôn đồng bộ.
- Email cấp phiếu được gửi đúng.
- Không gửi email lịch con trùng.

## Các bypass thực tế

Người tạo phiếu có thể dùng Supabase client trực tiếp:

### Direct INSERT header

Tạo `basic_medical_registrations` nhưng không có:

- Session.
- Class schedule.
- Email tổng hợp.
- Kiểm tra đầy đủ của RPC.

### Direct UPDATE header

Đổi:

- Course.
- Room.
- Date range.
- Responsible lecturer.

nhưng không cập nhật schedules/sessions tương ứng.

### Direct DELETE

Xóa phiếu qua table API:

- Không đi qua server action.
- Không load email snapshot.
- Không enqueue email deleted.
- Cascade xóa lịch liên kết.

### Direct session mutation

Sửa/xóa session mà không đảm bảo class schedule và confirmation lifecycle đúng.

## Mức độ

```text
High
```

Đây là lỗ hổng tính toàn vẹn workflow.

## Yêu cầu sửa

### Quyền bảng

```sql
revoke insert, update, delete
on basic_medical_registrations,
   basic_medical_registration_sessions
from authenticated;
```

Xóa mutation policies `FOR ALL`.

Giữ SELECT policies đúng scope.

### RPC

- Create/update chỉ qua `save_basic_medical_registration`.
- Tạo RPC riêng:
  - `delete_basic_medical_registration(target_id)`.
- RPC delete phải:
  - Xác thực scoped manager theo nghiệp vụ.
  - Khóa target.
  - Ghi audit.
  - Ghi/outbox event deleted trong transaction nếu có thể.
  - Bảo toàn hoặc soft-delete theo lifecycle đã chốt.

Server action không gọi `.from(...).delete()` trực tiếp nữa.

## Test bắt buộc

Với creator, Lecturer/TA và scoped manager:

- Direct insert header: bị chặn.
- Direct update header: bị chặn.
- Direct delete: bị chặn.
- Direct insert/update/delete session: bị chặn.
- Save RPC: thành công đúng quyền.
- Delete RPC: thành công đúng quyền.
- Email/audit không bị bypass.

---

# 10. BM-HIGH-03 — Hard delete Phiếu Y cơ sở vẫn trái với data lifecycle đã tuyên bố

## Hiện trạng

Server action hiện hard-delete:

```text
basic_medical_registrations.delete()
```

Foreign key cascade làm mất:

- Registration sessions.
- Class schedules liên kết.

Test E2E còn xác nhận các row phải biến mất.

Trong PR lại ghi:

```text
Dữ liệu đã liên kết không hard-delete.
```

Hai điều này mâu thuẫn.

Confirmation row có snapshot và `session_id` có thể được set null trước delete, nhưng lịch nghiệp vụ và quan hệ phiếu/buổi vẫn bị xóa khỏi hệ thống chính.

## Yêu cầu trước production

Chốt lifecycle thống nhất:

- `cancelled_at`, `cancelled_by`, `cancel_reason`; hoặc
- `archived_at`; hoặc
- `deleted_at` soft-delete.

Khi hủy phiếu:

- Không xóa header.
- Không xóa session history.
- Chuyển linked schedules sang `cancelled`.
- Invalidate confirmation nếu cần nhưng giữ snapshot.
- Ghi audit và email.
- Mặc định ẩn phiếu cancelled khỏi danh sách, có bộ lọc lịch sử.

Nếu vẫn cho hard-delete, chỉ cho draft chưa publish/chưa có confirmation và phải được mô tả rõ. Hiện phiếu được publish ngay nên gần như không nên hard-delete.

---

# PHẦN C — DANH SÁCH THIẾT BỊ Y CƠ SỞ

# 11. BM-MEDIUM-01 — Trang thiết bị chưa thực hiện quyền xem read-only theo OpenSpec

## Đặc tả hiện có

OpenSpec ghi:

```text
Người dùng có loại phòng Y cơ sở được xem tình trạng hiện tại.
Chỉ Admin/Staff được thay đổi danh mục/tồn kho và xem log chi tiết.
```

## Code hiện tại

Route `/basic-medical/equipment` yêu cầu:

```text
canManageBasicMedical = true
AND canManageBasicMedicalWorkspace(...)
```

Tức chỉ:

- Admin.
- Staff có scope Y cơ sở.

Lecturer/Teaching Assistant/Viewer có scope Y cơ sở bị redirect.

Menu thiết bị cũng chỉ nằm trong nhóm Quản trị.

## Yêu cầu

Nếu giữ đúng OpenSpec:

### Read-only actor

Lecturer/TA/Viewer có Y-scope được xem:

- Thiết bị theo phòng.
- Tốt/Hư hiện tại.
- Không thấy người báo hư.
- Không thấy log chi tiết.
- Không thấy nút thêm/sửa/import/export/điều chỉnh.

### Manager actor

Admin và Staff đúng scope được:

- Quản lý catalog.
- Quản lý inventory.
- Xem detailed logs.
- Export.

Nếu chủ hệ thống không muốn read-only access, phải cập nhật OpenSpec và test để loại bỏ yêu cầu đó. Không để code và specification trái nhau.

---

# 12. BM-MEDIUM-02 — Bộ lọc và placeholder không khớp dữ liệu thực tế

## Hiện trạng

Placeholder ghi:

```text
Tìm thiết bị, phòng, người thay đổi, ghi chú…
```

Nhưng:

- Tab Thiết bị: tìm catalog fields.
- Tab Thiết bị theo phòng: `q` không áp dụng vào inventory query.
- Tab Thiết bị hư: `q` không áp dụng.
- Tab Log: chỉ `ilike(note)`.
- Chưa lọc log theo:
  - Phòng.
  - Thiết bị.
  - Người thực hiện.
  - Khoảng ngày.

OpenSpec yêu cầu đầy đủ các filter này.

## Yêu cầu sửa

Tạo RPC/view server-side nhận:

```text
tab
query
room_id
catalog_item_id
event_type
actor_id
from_date
to_date
page
page_size
```

Search text phải bao gồm dữ liệu join cần thiết.

Không filter join data bằng cách tải hết về client.

## Test

- Search room code.
- Search item name trên rooms/damaged.
- Filter actor.
- Filter date range.
- Kết hợp room + event + date.
- Count và pagination đúng.

---

# 13. BM-MEDIUM-03 — Tab phân bổ phòng chỉ tải 500 thiết bị làm candidate

## Hiện trạng

Khi mở tab `rooms`, page tải:

```text
basic_medical_equipment_catalog
.eq(is_active, true)
.limit(500)
```

Nếu catalog có hơn 500 item, thiết bị sau giới hạn không thể được chọn để phân bổ, nhưng UI không báo rằng danh sách bị cắt.

## Yêu cầu sửa

- Dùng searchable server-side combobox.
- Query theo keyword, 20–50 kết quả.
- Cho tìm mọi active catalog item.
- Không tải một danh sách candidate khổng lồ.
- Không đặt hard cap âm thầm.

---

# 14. BM-MEDIUM-04 — Export route vẫn kiểm tra Staff toàn cục thay vì scope Y cơ sở

## Vị trí

```text
app/api/basic-medical-equipment-export/route.ts
```

## Hiện trạng

Route chỉ kiểm tra role:

```text
admin hoặc staff
```

Staff ngoài scope Y cơ sở vượt qua authorization route. Sau đó RLS có thể trả workbook rỗng, thay vì trả 403.

Ngoài ra route dùng `.limit(10000)` và gọi “Export tất cả”, nên dữ liệu vượt 10.000 dòng bị cắt âm thầm.

## Yêu cầu sửa

- Dùng `get_basic_medical_authority_context`.
- Staff sai scope nhận 403.
- Export tất cả phải:
  - Paginate toàn bộ; hoặc
  - Stream/chunk; hoặc
  - Ghi rõ giới hạn và từ chối khi vượt giới hạn.
- Thêm audit export nếu dữ liệu có tính quản trị.

---

# 15. BM-MEDIUM-05 — Backfill mã phiếu dùng ngày migration, không dùng ngày tạo phiếu

## Hiện trạng

Migration backfill:

```sql
update basic_medical_registrations
set registration_code = next_basic_medical_registration_code()
where registration_code is null;
```

`next_basic_medical_registration_code()` dùng `clock_timestamp()`.

Tất cả phiếu lịch sử nhận prefix ngày chạy migration, không phải ngày `created_at`.

Ví dụ phiếu tạo năm trước có thể nhận mã:

```text
YC-260806-xxxxxx
```

## Yêu cầu sửa

Backfill theo:

```text
created_at at time zone Asia/Ho_Chi_Minh
```

Sequence suffix vẫn có thể global.

Phải chạy trước production hoặc migration sửa mã phải xử lý uniqueness và các reference/email đã sinh.

---

# 16. BM-MEDIUM-06 — Import danh mục thiết bị Y cơ sở chưa atomic

## Vị trí

```text
app/basic-medical/equipment/actions.ts
importBasicMedicalEquipment
```

## Hiện trạng

Luồng thực hiện:

1. Update các row hiện có.
2. Insert các row mới.

Đây là hai request/database transaction riêng.

Nếu update thành công nhưng insert bị unique/validation lỗi:

- Một phần catalog đã thay đổi.
- Action trả lỗi.
- Người dùng tưởng import thất bại toàn bộ.

`Import tất cả` cũng chưa có semantic rõ cho các item vắng mặt trong file.

## Yêu cầu sửa

Tạo RPC atomic:

```text
apply_basic_medical_catalog_import(mode, rows)
```

RPC phải:

- Validate toàn bộ trước khi mutation.
- Upsert trong một transaction.
- Quy định rõ `new` và `all`.
- Nếu `all` nghĩa replace, item vắng mặt nên inactive, không hard-delete.
- Rollback toàn bộ khi một row lỗi.
- Trả counts và warnings.

---

# PHẦN D — TEST VÀ TÀI LIỆU

# 17. Test coverage còn thiếu

Local count cao hơn nhưng test Sixth mới chỉ kiểm tra một phần.

Bổ sung ít nhất:

## Personnel

- Root chỉnh sửa Personnel Manager.
- Root khóa/mở Personnel Manager.
- Crash sau Auth update trước DB commit.
- Reconciler operation hết hạn.
- Import-all với omitted profile đang reserved.
- Fallback profile lock/reconciliation insert failure.
- Lost-response branch trả personnel snapshot.

## Phiếu Y cơ sở

- Teaching Lecturer khác Responsible Lecturer vẫn thấy và ký.
- Viewer thấy danh sách theo policy.
- Unrelated Lecturer không thấy.
- Direct DML header/session bị chặn.
- Delete RPC tạo audit/email đúng.
- Soft-delete/cancel lifecycle.

## Thiết bị Y cơ sở

- Read-only Y-scope actor nếu giữ OpenSpec.
- Filter room/item/actor/date.
- Candidate item ngoài row 500 vẫn tìm được.
- Export Staff sai scope trả 403.
- Catalog import failure rollback.

---

# 18. PR body và báo cáo cần cập nhật

## PR body hiện tại

PR body vẫn đang mô tả Fifth Follow-up và số test cũ:

```text
56/56 Node
23/23 pgTAP
21/21 E2E
```

Chưa có:

- Sixth Follow-up.
- Test count 59/59 và 34/34.
- CI run hiện tại bị cancelled.
- Finding mới của review này.

Không nên tiếp tục append lịch sử. Viết lại body ngắn gọn theo trạng thái hiện tại.

## Sixth result report

Báo cáo đang ghi:

```text
Không còn High finding mở trong phạm vi Sixth Follow-up.
```

Cần đổi vì review phát hiện:

- Root không sửa được Personnel Manager.
- Crash window Auth/DB.
- Teaching lecturer/Viewer mất quyền xem.
- Direct DML registration/session vẫn mở.

Báo cáo cũng nên ghi trực tiếp:

```text
Final HEAD: 2e412981f6b2d2a993dea81acc91bcc391bb9c7f
CI run: 31122627764
Verify job: 92686263091
CI result: failure / verify cancelled
```

Không dùng câu tự tham chiếu “hash ghi trong PR”.

---

# 19. Thứ tự xử lý đề xuất

## Priority 0 — Không rerun mù trước khi sửa

Giữ PR Draft.

## Priority 1 — Personnel authority regression

1. Cho Root chỉnh Bảo.
2. Test matrix Root/Bảo.

## Priority 2 — Durable email saga

1. Operation state machine.
2. Reconciler.
3. Crash injection.

## Priority 3 — Phiếu Y cơ sở integrity

1. Khôi phục teaching lecturer/Viewer SELECT policy.
2. Revoke direct DML registration/session.
3. RPC delete và lifecycle.

## Priority 4 — Equipment access/performance

1. OpenSpec read-only decision.
2. Filter đầy đủ.
3. Candidate search.
4. Export scope.
5. Atomic import.
6. Historical code backfill.

## Priority 5 — Documentation và CI

1. Update result report.
2. Rewrite PR body.
3. Push final report.
4. Rerun CI trên final HEAD.
5. Chỉ đề xuất Ready khi run hoàn tất success.

---

# 20. Definition of Done

Chỉ đóng Seventh Follow-up khi:

1. Root sửa/khóa/mở Bảo đúng nghiệp vụ.
2. Root vẫn không sửa chính Root.
3. Auth/profile email không lệch kể cả process crash.
4. Operation hết hạn được reconcile, không bị xóa mù.
5. Import all tôn trọng mọi active reservation.
6. Cleanup fallback kiểm tra mọi error.
7. Teaching lecturer thấy và ký được session của mình.
8. Viewer Y-scope có quyền xem đúng thiết kế.
9. Unrelated actor không xem được dữ liệu.
10. Authenticated không direct mutate registration/session.
11. Create/update/delete đi qua RPC và có audit/email.
12. Data lifecycle không hard-delete dữ liệu đã publish/confirmed.
13. Equipment page khớp OpenSpec hoặc OpenSpec được cập nhật có chủ đích.
14. Filter/search hoạt động đúng mọi tab.
15. Catalog candidate không bị giới hạn 500 âm thầm.
16. Export kiểm tra scope và không cắt dữ liệu âm thầm.
17. Catalog import atomic.
18. Historical registration code backfill dùng ngày tạo.
19. Local suites xanh.
20. GitHub Actions final HEAD hoàn tất `success`.
21. PR body và report phản ánh đúng final status.
22. Không còn High finding mở.

---

# 21. Prompt giao AI executor

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
2e412981f6b2d2a993dea81acc91bcc391bb9c7f
```

Đọc:

```text
docs/SAFE_REVIEW_SIXTH_FOLLOWUP_PERSONNEL_AND_BASIC_MEDICAL_2026-08-06.md
docs/SAFE_REVIEW_SIXTH_FOLLOWUP_PERSONNEL_AND_BASIC_MEDICAL_RESULT_2026-08-06.md
docs/SAFE_REVIEW_SEVENTH_FOLLOWUP_AFTER_SIXTH_2026-08-07.md
```

Thực hiện theo đúng priority trong tài liệu.

Các yêu cầu không được thay đổi:

- Chỉ Root và Bảo truy cập Personnel.
- Chỉ Root quản lý Admin hiện hữu.
- Root được quản lý tài khoản Bảo.
- Root không thể bị khóa hoặc mất role Admin.
- Trợ giảng là role riêng.
- Import là capability, không phải role.
- Staff quản lý Y cơ sở phải có scope Y cơ sở.
- Lecturer hợp lệ phải dựa vào role, không dựa title.
- Không expose `signature_data`.
- Không merge main.
- Không deploy production.
- Không redeploy Apps Script.

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

Bàn giao:

- Implementation commit.
- Final HEAD.
- Migration files.
- Test counts.
- CI run ID.
- Verify job ID.
- Report result mới.
- Danh sách finding FIXED/PARTIAL/OPEN.

---

# 22. Reviewer verdict

```text
REQUEST CHANGES
```

Sixth Follow-up đóng được nhiều finding kỹ thuật quan trọng, nhưng chưa đủ để chuyển PR Ready.

PR tiếp tục:

```text
Draft
Not merged
Not deployed
```

CI run `31122627764` hiện là `failure` do verify job bị `cancelled`, không phải một run xanh. Sau khi xử lý finding, cần tạo/rerun workflow mới trên final HEAD và chờ kết quả `success`.
