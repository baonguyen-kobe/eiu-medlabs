# Safe Review — After Fifth Follow-up: Personnel Authority và luồng Y cơ sở

**Ngày review:** 06/08/2026  
**Repository:** `baonguyen-kobe/eiu-medlabs`  
**PR:** `#1` — `Hardening authorization, imports, email, and equipment workflows`  
**Branch:** `review/hardening-20260805`  
**Reviewed HEAD:** `664ebc93b64ef9bd326d2a6f1eabc0d4e2d70242`  
**GitHub Actions:** CI run `31108484552` — `success`; job `verify` — `success`  
**Trạng thái đề xuất:** **REQUEST CHANGES / tiếp tục giữ PR Draft**

---

## 1. Phạm vi review

Vòng review này gồm hai phần:

1. Review lại **Fifth Follow-up — Personnel Authority**:
   - Root Administrator.
   - Tài khoản quản lý nhân sự `bao.nguyen@eiu.edu.vn`.
   - Admin thông thường.
   - RPC cập nhật/import nhân sự.
   - RLS, route, menu, drawer và optimistic concurrency.
   - Đồng bộ Supabase Auth với bảng `profiles`.

2. Review bổ sung hai luồng:
   - **Danh sách thiết bị Y cơ sở**.
   - **Phiếu Y cơ sở**, gồm tạo/sửa/sao chép/xóa phiếu, xác nhận buổi học, chữ ký và cập nhật tình trạng thiết bị.

Không merge `main`, không deploy production, không chạy migration production và không redeploy Apps Script trong quá trình thực hiện follow-up này.

---

# PHẦN A — REVIEW FIFTH FOLLOW-UP: PERSONNEL AUTHORITY

## 2. Kết quả tổng quan

Các yêu cầu chính đã được triển khai đúng:

- Có singleton `system_security_principals` lưu Root và Personnel Manager bằng UUID.
- Chỉ Root và Personnel Manager thấy menu và truy cập `/admin/personnel`.
- Admin thông thường bị redirect và direct RPC bị từ chối.
- Root không thể bị khóa hoặc mất role Admin.
- Bảo không thể sửa Admin hiện hữu.
- Root có thể sửa các Admin còn lại.
- Bảo có thể nâng non-admin thành Admin; sau khi nâng, tài khoản đó trở thành read-only đối với Bảo.
- Mutation trực tiếp vào `profiles`, `user_roles`, `profile_room_types` của module Personnel đã bị chặn; ứng dụng dùng RPC.
- `admin_update_personnel` có version check và chạy thay đổi profile/role/scope trong một transaction Postgres.
- `admin_apply_personnel_import` đã atomic ở phần Postgres.
- Importer không còn là role nghiệp vụ trong UI Personnel.
- CI và verify job của HEAD hiện tại đều xanh.

Tuy nhiên, **không thể đóng hoàn toàn Fifth Follow-up** do finding High dưới đây.

---

## 3. Finding Personnel

## P-HIGH-01 — Race condition đổi email có thể làm Supabase Auth và `profiles.email` lệch nhau

### Vị trí

- `app/admin/actions.ts`
- Hàm `savePersonnelChanges`

### Hiện trạng

Luồng hiện tại:

1. Đọc email hiện tại từ `profiles`.
2. Nếu email thay đổi, gọi:
   - `adminClient.auth.admin.updateUserById(...)`
3. Sau đó mới gọi:
   - `admin_update_personnel`
4. Nếu RPC thất bại, đổi email Auth về email đã đọc ở bước 1.

Cơ chế optimistic concurrency chỉ nằm trong RPC Postgres. Supabase Auth bị thay đổi **trước khi** biết request nào thắng version check.

### Kịch bản tái hiện

Giả sử profile đang có:

```text
profiles.email = old@eiu.edu.vn
access_version = 10
Auth email = old@eiu.edu.vn
```

Root và Bảo cùng mở drawer ở version 10:

- Root đổi email thành `root-change@eiu.edu.vn`.
- Bảo đổi email thành `bao-change@eiu.edu.vn`.

Trình tự có thể xảy ra:

1. Request Root đổi Auth thành `root-change@eiu.edu.vn`.
2. Request Bảo đổi Auth thành `bao-change@eiu.edu.vn`.
3. RPC của Root thắng và cập nhật:
   - `profiles.email = root-change@eiu.edu.vn`
   - `access_version = 11`
4. RPC của Bảo nhận `PERSONNEL_CHANGED_RELOAD_REQUIRED`.
5. Request Bảo rollback Auth về email cũ đã đọc trước đó:
   - `old@eiu.edu.vn`

Kết quả cuối:

```text
profiles.email = root-change@eiu.edu.vn
Auth email     = old@eiu.edu.vn
```

Rollback API vẫn có thể trả thành công, nên hệ thống **không ghi reconciliation log**. Người dùng có thể không đăng nhập bằng email đang hiển thị trong trang Nhân sự.

Test concurrency hiện tại chỉ thay đổi field như `title`; chưa kiểm tra hai writer cùng thay đổi email.

### Mức độ

**High**

Đây là lỗi nhất quán danh tính đăng nhập, không chỉ là lỗi hiển thị.

### Yêu cầu sửa

Không để request thua version check chạm vào Supabase Auth.

Ưu tiên một trong hai thiết kế:

#### Phương án A — DB-first kèm rollback có điều kiện

1. Gọi RPC Postgres trước.
2. Chỉ request thắng `access_version` mới được gọi Auth Admin API.
3. Nếu Auth update thất bại:
   - Gọi RPC compensation riêng.
   - RPC compensation chỉ rollback email khi:
     - `profile_id` đúng.
     - `access_version` vẫn đúng version vừa commit.
     - `profiles.email` vẫn bằng email mới của operation.
   - Nếu dữ liệu đã bị writer khác thay đổi, không rollback mù; ghi reconciliation.

Lưu ý: cần quyết định rõ các field role/scope đã commit có được giữ lại khi Auth email thất bại hay phải rollback toàn bộ bằng operation snapshot.

#### Phương án B — Operation/reservation token

Tạo cơ chế hai bước:

```text
begin_personnel_update
commit_personnel_update
cancel_personnel_update
```

- `begin` khóa logic bằng version và tạo `operation_id`.
- Chỉ operation thắng mới gọi Auth.
- `commit` áp dụng payload nếu token còn hiệu lực.
- `cancel` hoặc reconciliation xử lý lỗi Auth.

Phương án này phức tạp hơn nhưng đảm bảo tốt hơn cho thay đổi đa hệ thống.

### Test bắt buộc

Thêm integration test với **hai request đổi sang hai email khác nhau**:

- Cả hai cùng dùng một `access_version`.
- Chỉ một request thành công.
- Request còn lại stale.
- Email cuối trong `auth.users` phải bằng `profiles.email`.
- Email cuối phải là email của request thắng.
- Không được rollback về email ban đầu.
- Không được tồn tại reconciliation log giả khi trạng thái cuối đã nhất quán.

---

## P-MEDIUM-01 — Cleanup Auth user mới tạo đang bỏ qua lỗi xóa

### Vị trí

- `app/admin/actions.ts`
- `createPersonnel`
- `importPersonnel`

### Hiện trạng

Khi RPC Postgres thất bại, code gọi:

```ts
await adminClient.auth.admin.deleteUser(targetId);
```

hoặc:

```ts
await Promise.all(
  createdUserIds.map((id) => adminClient.auth.admin.deleteUser(id)),
);
```

Supabase Admin API thường trả `{ data, error }`; không nhất thiết throw exception. Code hiện không kiểm tra `error` của từng lần xóa.

Trong hệ thống hiện tại, `handle_new_user()` tạo profile mới với `is_active = true`. Tài khoản được tạo bằng:

```text
email_confirm = true
app_metadata.preapproved = true
```

Nếu cleanup thất bại nhưng bị bỏ qua, có thể còn Auth user/profile ngoài ý muốn.

### Yêu cầu sửa

Tạo helper dùng chung, ví dụ:

```text
cleanupCreatedAuthUsersOrRecordReconciliation(...)
```

Helper phải:

- Kiểm tra kết quả xóa từng user.
- Không dùng `Promise.all` theo cách làm mất chi tiết lỗi.
- Thu thập `user_id`, email và lỗi theo từng tài khoản.
- Retry hợp lý hoặc ít nhất thử tuần tự.
- Nếu vẫn thất bại:
  - Ghi reconciliation log.
  - Dùng service role khóa `profiles.is_active = false` nếu profile còn tồn tại.
  - Trả lỗi rõ `AUTH_PROFILE_RECONCILIATION_REQUIRED`.
- Không hiển thị thông báo “đã rollback” khi chưa xác minh.

### Test bắt buộc

- Failure injection cho Auth cleanup.
- Xác minh cleanup error được ghi log.
- Profile còn sót phải inactive.
- Tài khoản không được có quyền đăng nhập và sử dụng app như nhân sự hợp lệ.

---

## P-MEDIUM-02 — Bảng Nhân sự có thể giữ state cũ sau lọc hoặc chuyển trang

### Vị trí

- `app/admin/personnel/page.tsx`
- `components/personnel-management-list.tsx`

### Hiện trạng

Component khởi tạo:

```ts
const [items, setItems] = useState(initialItems);
```

nhưng không đồng bộ lại `items` khi `initialItems` thay đổi.

Khi search params thay đổi do:

- Lọc role.
- Lọc trạng thái.
- Lọc quyền nhập lịch.
- Chuyển trang.

Next.js có thể giữ nguyên instance Client Component và chỉ truyền props mới. `useState(initialItems)` không chạy lại, nên bảng có thể tiếp tục hiển thị dữ liệu của bộ lọc/trang cũ.

### Yêu cầu sửa

Chọn một phương án:

- Truyền `key` ổn định dựa trên query/page và dataset version để remount component; hoặc
- `useEffect` đồng bộ `items` khi dataset server thực sự thay đổi; đồng thời đóng drawer hoặc cảnh báo nếu drawer đang dirty; hoặc
- Bỏ duplicate local state và dùng state optimistic có key theo `id:access_version`.

Không reset dữ liệu local vô điều kiện trong lúc người dùng đang chỉnh sửa mà không cảnh báo.

### Test bắt buộc

E2E:

1. Mở trang 1.
2. Chuyển trang 2.
3. Bảng phải chứa đúng ID của trang 2.
4. Lọc `teaching_assistant`.
5. Không còn dòng role khác.
6. Xóa bộ lọc.
7. Danh sách phải trở về đúng dữ liệu server.

---

## P-LOW-01 — Số tài khoản bảo vệ bị bỏ qua trong thông báo import có thể không chính xác

### Hiện trạng

Server action lọc các Admin hiện hữu khỏi `selectedRows` trước khi gọi `admin_apply_personnel_import`.

RPC chỉ tăng `skipped_protected` cho các dòng thật sự được gửi vào RPC và bị phát hiện protected/current-admin tại thời điểm chạy.

Do đó, file có Root/Bảo/Admin hiện hữu có thể được giữ nguyên đúng nhưng thông báo:

```text
0 tài khoản được bảo vệ đã bỏ qua
```

### Yêu cầu sửa

- Hoặc gửi cả protected rows vào RPC để RPC tự skip và đếm.
- Hoặc cộng `preservedAdministratorRows.length` vào kết quả hiển thị.
- Tách rõ:
  - Root.
  - Personnel Manager.
  - Admin hiện hữu.
  - Account trở thành Admin do race.

---

## P-LOW-02 — UI chưa chủ động ngăn cấu hình “Quyền Y cơ sở” không hợp lệ

Database đã kiểm tra đúng:

- Chỉ Lecturer hoặc Teaching Assistant.
- Phải có scope Y cơ sở.

Nhưng drawer và form tạo mới vẫn cho tick quyền này với role/scope không phù hợp rồi mới báo lỗi khi lưu.

### Yêu cầu sửa UX

- Disable và tự clear `allow_basic_medical_access` khi không có role Lecturer/Teaching Assistant.
- Disable và tự clear khi chưa chọn scope Y cơ sở.
- Hiển thị ghi chú ngắn ngay cạnh checkbox.

---

## 4. Kết luận Fifth Follow-up

### Đã đóng

- Authority Root/Bảo/Admin thường.
- Root invariant.
- Bảo không sửa Admin hiện hữu.
- Direct table mutation của Personnel.
- Atomic Postgres update/import.
- Nullable RPC bypass.
- Version conflict trong Postgres.
- Hash limit và import validation statuses.

### Chưa đóng

- **P-HIGH-01: đồng bộ email Auth/Postgres khi có concurrent writers.**
- Cleanup Auth user thất bại chưa được kiểm soát đầy đủ.
- State danh sách khi lọc/phân trang cần sửa.

Vì vậy không nên ghi “Không còn High finding mở trong Fifth Follow-up” cho đến khi P-HIGH-01 được sửa và có test tái hiện.

---

# PHẦN B — DANH SÁCH THIẾT BỊ Y CƠ SỞ VÀ PHIẾU Y CƠ SỞ

## 5. Kết quả tổng quan

Nền tảng transaction của xác nhận buổi học tương đối tốt:

- Chỉ đúng `teaching_lecturer_id` được ký.
- Có giới hạn thời điểm ký.
- RPC khóa session/schedule/inventory.
- Snapshot và cập nhật Tốt/Hư nằm cùng transaction.
- Có log thay đổi.
- Confirmation cũ được invalidated khi thông tin lịch quan trọng thay đổi.

Tuy nhiên, luồng hiện tại vẫn còn các lỗi quyền và schema/migration quan trọng.

---

## 6. Finding Y cơ sở

## BM-HIGH-01 — Runtime migration vẫn kiểm tra role `importer`, làm Trợ giảng không tạo được Phiếu Y cơ sở

### Vị trí

- `supabase/migrations/20260805143000_scope_workspace_navigation_and_basic_medical_creation.sql`
- `supabase/migrations/20260805160000_basic_medical_room_equipment_confirmation.sql`
- `supabase/schemas/03_registration_workflows.sql`
- `lib/workspace-access.ts`
- `app/basic-medical/new/actions.ts`

### Hiện trạng

Declarative schema hiện dùng:

```sql
has_role('lecturer')
or has_role('teaching_assistant')
```

Nhưng migration chạy sau cùng để tạo/replace `save_basic_medical_registration` vẫn dùng:

```sql
has_role('lecturer')
or has_role('importer')
```

Trong khi:

- `importer` đã bị deprecate.
- UI/AppRole không còn `importer`.
- Trợ giảng là role riêng.
- `canCreateBasicMedicalSchedules()` cho phép `teaching_assistant`.
- Server action sơ bộ cũng cho `teaching_assistant`.

Kết quả thực tế trên database dựng từ migration:

1. Trợ giảng có scope Y cơ sở.
2. Có `allow_basic_medical_access = true`.
3. Mở được form.
4. Submit qua validation application.
5. RPC trả `Bạn không có quyền lưu phiếu Y cơ sở`.

Đây là drift giữa migration history và declarative schema.

### Yêu cầu sửa

Không sửa ngược migration cũ đã có lịch sử. Tạo migration mới, ví dụ:

```text
20260806xxxxxx_fix_basic_medical_teaching_assistant_authority.sql
```

Migration phải replace:

- `save_basic_medical_registration`.
- Policy `basic_medical_registrations_manage`, nếu policy hiện hành còn dùng importer.
- Bất kỳ RPC/policy Y cơ sở nào còn kiểm tra `importer`.

Quyền đúng:

```text
Admin
OR Staff đúng phạm vi quản lý
OR (
  role Lecturer hoặc Teaching Assistant
  AND có scope Y cơ sở
  AND allow_basic_medical_access = true
)
```

Sau đó đồng bộ declarative schema.

### Test bắt buộc

- TA + scope Y cơ sở + allow flag: tạo được phiếu.
- TA thiếu allow flag: bị từ chối.
- TA thiếu scope: bị từ chối.
- Lecturer tương tự.
- Không cần và không thể cấp role importer.
- `supabase db reset` từ toàn bộ migration history phải cho kết quả giống declarative schema.

---

## BM-HIGH-02 — Staff ngoài scope Y cơ sở vẫn có quyền quản lý toàn bộ Y cơ sở

### Vị trí

- `app/basic-medical/equipment/page.tsx`
- `app/basic-medical/equipment/actions.ts`
- `app/basic-medical/registrations/page.tsx`
- `app/basic-medical/registrations/actions.ts`
- `save_basic_medical_registration`
- RLS của:
  - `basic_medical_equipment_catalog`
  - `basic_medical_room_inventory`
  - `basic_medical_equipment_condition_logs`
  - `basic_medical_registrations`

### Hiện trạng

Nhiều chỗ chỉ kiểm tra:

```text
role = admin hoặc staff
```

không kiểm tra Staff có `profile_room_types` Y cơ sở.

Một Staff chỉ phụ trách Nursing Skills có thể:

- Mở Danh sách thiết bị Y cơ sở.
- Sửa danh mục.
- Sửa tồn kho.
- Xem log.
- Xem/xóa phiếu Y cơ sở.
- Tạo hoặc điều chỉnh phiếu Y cơ sở.

### Yêu cầu sửa

Tạo helper database thống nhất:

```sql
private.can_manage_basic_medical()
```

Logic:

```text
Admin
OR (
  Staff
  AND active
  AND có profile_room_types = BASIC_MEDICAL_ROOM_TYPE_ID
)
```

Áp dụng cho:

- Route/menu.
- Server actions.
- RPC.
- RLS.
- Xóa phiếu.
- Danh mục/tồn kho/log.
- Email recipients của nghiệp vụ quản lý nếu có.

Không lặp lại logic khác nhau ở từng file.

### Test bắt buộc

- Admin: được phép.
- Staff chỉ Nursing Skills: bị từ chối route và direct RPC/table.
- Staff có Y cơ sở: được phép.
- Staff bị gỡ scope sau khi đang mở trang: request tiếp theo bị từ chối tại DB.

---

## BM-HIGH-03 — Có thể update tồn kho trực tiếp và bỏ qua condition log

### Hiện trạng

Authenticated Admin/Staff hiện có thể ghi trực tiếp bảng:

```text
basic_medical_room_inventory
```

Policy `for all` và grant ghi làm cho client có thể update:

```text
total_quantity
good_quantity
damaged_quantity
```

mà không đi qua:

- `set_basic_medical_room_inventory`
- `adjust_basic_medical_inventory_condition`

Khi đó có thể không tạo:

```text
basic_medical_equipment_condition_logs
```

### Yêu cầu sửa

- Revoke `insert`, `update`, `delete` trực tiếp khỏi `authenticated`.
- Xóa policy mutation trực tiếp.
- Chỉ cho ghi qua RPC security-definer đã tự kiểm tra quyền/scope.
- Các bảng confirmation/check/log cũng không cho client ghi trực tiếp.

### Test bắt buộc

- Direct insert/update/delete tồn kho từ Admin và Staff đều bị chặn.
- RPC đúng quyền vẫn chạy.
- Mỗi thay đổi số lượng phải tạo đúng một log.
- Transaction lỗi không để tồn kho và log lệch nhau.

---

## BM-HIGH-04 — Chữ ký base64 có thể bị đọc bởi người không liên quan

### Hiện trạng

`basic_medical_session_confirmations.signature_data` chứa trực tiếp ảnh PNG base64.

RLS select hiện mở khá rộng cho:

- Admin.
- Staff.
- Người có scope Y cơ sở.

Người dùng có thể query trực tiếp cột chữ ký dù UI không hiển thị.

### Yêu cầu sửa trước mắt

- Không cho client select trực tiếp bảng confirmation đầy đủ.
- Tạo safe view/RPC chỉ trả metadata:
  - confirmation ID.
  - signer.
  - signed time.
  - invalidated state.
- Safe view không trả `signature_data`.
- Chỉ signer, người liên quan tới phiếu và scoped manager được đọc metadata.

### Yêu cầu production

- Chuyển chữ ký sang private Supabase Storage.
- Database chỉ lưu:
  - object path.
  - hash.
  - MIME.
  - size.
  - signer/timestamp.
- Signed URL chỉ được tạo sau authorization.
- Có kế hoạch backfill và xóa base64 cũ sau khi xác minh.

---

## BM-HIGH-05 — “Giảng viên” đang được xác định bằng `profiles.title` thay vì role Lecturer

### Vị trí

- `list_basic_medical_instructors`
- `save_basic_medical_registration`
- Policy insert `class_schedules` cho Y cơ sở
- Các validation liên quan responsible/teaching lecturer

### Hiện trạng

Nhiều chỗ dùng:

```sql
lower(trim(profiles.title)) = 'giảng viên'
```

thay vì:

```text
user_roles.role = lecturer
```

Hậu quả:

- Một account không có role Lecturer nhưng title là `Giảng viên` có thể được chọn.
- Một Lecturer có title `Giảng viên cơ hữu`, `Thạc sĩ`, hoặc title trống có thể không xuất hiện.
- `title` là dữ liệu mô tả tự do, không phải nguồn authorization.

### Yêu cầu sửa

Giảng viên hợp lệ phải thỏa:

```text
profiles.is_active
AND có role Lecturer
AND có scope Y cơ sở
```

`title` chỉ dùng để hiển thị.

Không cho Viewer/Staff/TA trở thành teaching lecturer chỉ nhờ title.

### Test bắt buộc

- Role Lecturer + scope đúng + title bất kỳ: xuất hiện.
- Title “Giảng viên” nhưng role không phải Lecturer: không xuất hiện và RPC từ chối.
- Lecturer inactive: không xuất hiện.
- Lecturer sai scope: không xuất hiện.

---

## BM-MEDIUM-01 — Sửa phiếu có schedule đã `cancelled` nhưng dữ liệu giống cũ không tạo lại buổi

### Hiện trạng

Khi edit phiếu, RPC giữ session cũ nếu phòng/ngày/giờ/lecturer giống payload.

Điều kiện so sánh không kiểm tra:

```text
schedule_status = published
```

Nếu schedule đã bị hủy nhưng người dùng lưu lại dữ liệu giống cũ:

- Session được coi là không đổi.
- Schedule vẫn `cancelled`.
- UI báo lưu thành công.
- Giảng viên không thể xác nhận.
- Phiếu có thể không bao giờ hoàn thành.

### Yêu cầu sửa

Chỉ reuse session khi schedule còn `published`.

Nếu `cancelled`:

- Tạo schedule/session mới; hoặc
- Trả lỗi rõ để người dùng phục hồi/tạo lại buổi.

Thêm test cho confirmation cũ và lịch sử invalidation.

---

## BM-MEDIUM-02 — `getViewer()` trả toàn bộ room types active thay vì scope của người dùng

### Vị trí

- `lib/viewer.ts`
- `lib/workspace-access.ts`

### Hiện trạng

`getViewer()` query toàn bộ `room_types` active rồi truyền thành `roomTypeCodes`.

Do đó Lecturer/TA/Viewer có thể được UI hiểu là có cả Nursing Skills và Y cơ sở dù không có assignment trong `profile_room_types`.

RLS có thể chặn dữ liệu ở bước sau, nhưng menu/route/UI không thống nhất với DB.

### Yêu cầu sửa

- Admin: có thể nhận toàn bộ room types.
- Non-admin: chỉ trả room types được gán trong `profile_room_types`.
- Không dùng danh sách master room types làm scope người dùng.

### Test bắt buộc

- Lecturer chỉ Nursing Skills không thấy Y cơ sở.
- Lecturer chỉ Y cơ sở không thấy workspace Nursing Skills.
- Viewer/TA tương tự.
- Gỡ scope làm menu biến mất sau refresh/session revalidation.

---

## BM-MEDIUM-03 — Modal mặc định cho ký trước khi người dùng xem tình trạng thiết bị

### Hiện trạng

Modal bắt đầu ở stage:

```text
signature
```

Nếu người dùng không mở phần tình trạng, client gửi toàn bộ thiết bị với:

```text
newlyDamagedQuantity = 0
```

RPC vẫn lưu snapshot đúng, nhưng UX không chứng minh người ký đã xem danh sách.

### Yêu cầu sửa

Bắt đầu ở stage `condition`.

Người dùng phải:

- Chọn “Tất cả thiết bị bình thường”; hoặc
- Nhập thiết bị hư.

Sau đó mới sang bước ký.

---

## BM-MEDIUM-04 — Sau khi báo hư, tồn kho hiển thị trên client bị cũ

### Hiện trạng

Sau xác nhận thành công:

- DB đã cập nhật good/damaged.
- Client chỉ thêm confirmation vào `confirmationBySession`.
- Không cập nhật inventory state.
- Không refresh route.

Nếu tiếp tục xác nhận buổi khác trong cùng phòng, UI có thể hiển thị số lượng và `max` cũ; RPC sau đó từ chối dữ liệu.

### Yêu cầu sửa

Ưu tiên RPC/action trả inventory rows mới để cập nhật state.

Phương án đơn giản hơn:

```text
router.refresh()
```

sau khi xác nhận thành công.

Thêm test hai buổi liên tiếp cùng phòng, buổi đầu báo hư.

---

## BM-MEDIUM-05 — Trang thiết bị tải tối đa 5.000 dòng cho mọi tab

### Hiện trạng

Dù chỉ mở một tab, page vẫn tải:

- Catalog.
- Room inventory.
- Rooms.
- Logs.

Sau đó lọc và phân trang ở client.

### Yêu cầu sửa

- Query theo tab đang mở.
- Search/filter/pagination ở database.
- Mỗi trang tối đa 50 dòng.
- Không tải log khi tab hiện tại không phải log.
- Trả `count: exact` hoặc count RPC phù hợp.
- Không serialize 5.000 rows xuống client.

---

## BM-MEDIUM-06 — Mã phiếu theo timestamp giây có thể trùng

### Hiện trạng

Mã phiếu hiển thị dạng:

```text
YYMMDDHHMMSS
```

Hai phiếu tạo trong cùng một giây có cùng mã.

Luồng sao chép tìm theo khoảng một giây và dùng `maybeSingle()`. Nếu có nhiều phiếu, thao tác có thể lỗi hoặc không xác định đúng nguồn.

### Yêu cầu sửa

Tạo `registration_code` unique ở database, ví dụ:

```text
YC-260806-000123
```

Không suy mã duy nhất chỉ từ `created_at`.

Thêm unique constraint và test concurrent inserts.

---

## BM-LOW-01 — RPC phân bổ tồn kho chưa bắt buộc room/catalog active

### Hiện trạng

`set_basic_medical_room_inventory` kiểm tra:

- Room thuộc loại Y cơ sở.
- Catalog item tồn tại.

Nhưng không luôn bắt buộc:

```text
rooms.is_active = true
catalog.is_active = true
```

UI chỉ hiện active nhưng direct RPC vẫn có thể dùng ID inactive.

### Yêu cầu sửa

Khi tạo phân bổ mới:

- Room phải active.
- Catalog item phải active.

Khi sửa inventory lịch sử, cho phép đọc nhưng không cho chuyển sang room/catalog inactive.

---

# PHẦN C — YÊU CẦU THỰC HIỆN CHO EXECUTOR

## 7. Thứ tự ưu tiên

### Blocker 1 — Personnel email consistency

Sửa P-HIGH-01 trước mọi việc khác.

### Blocker 2 — Y cơ sở migration authority

Tạo migration mới sửa `importer` → `teaching_assistant` và đồng bộ schema.

### Blocker 3 — Scope và direct-write

- Staff phải đúng scope Y cơ sở.
- Chặn direct write tồn kho.

### Blocker 4 — Signature privacy và Lecturer role

- Không expose base64.
- Không dùng title cho authorization.

### Sau đó

- Canceled schedule.
- `getViewer` scope.
- Inventory refresh.
- Query pagination.
- Registration code.
- Personnel UI state và cleanup.

---

## 8. Quy tắc triển khai

1. Không sửa ngược migration đã nằm trong lịch sử nếu có thể ảnh hưởng môi trường đã apply.
2. Tạo migration versioned mới cho follow-up.
3. Đồng bộ migration mới với declarative schema.
4. Mọi authorization phải tồn tại ở DB/RPC/RLS; không chỉ ẩn nút.
5. Không dùng email hard-code trong runtime Personnel authority.
6. Không đưa role `importer` trở lại.
7. `can_import_schedules` tiếp tục là capability bổ sung.
8. Không làm mất audit log, confirmation snapshot hoặc condition log.
9. Không hard-delete dữ liệu nghiệp vụ đã có lịch sử.
10. Không deploy production trong vòng sửa này.

---

## 9. Test matrix bắt buộc

### Personnel

- Root/Bảo/Admin thường/Staff route-menu-direct RPC.
- Root invariant.
- Bảo không sửa Admin.
- Root sửa/khóa/demote Admin khác.
- Bảo promote non-admin thành Admin.
- Concurrent non-email update.
- **Concurrent email update với hai email khác nhau.**
- Auth email cuối bằng `profiles.email`.
- Auth cleanup failure injection.
- Reconciliation log.
- Import rollback atomic.
- Import all protected accounts.
- Filter/pagination không giữ state cũ.

### Y cơ sở authorization

- Admin.
- Staff đúng/sai scope.
- Lecturer đúng/sai scope.
- Teaching Assistant đúng/sai scope/allow flag.
- Viewer.
- Không có role importer.
- Title spoof không được coi là Lecturer.

### Y cơ sở equipment

- Direct write bị chặn.
- RPC tạo/sửa tồn kho tạo log.
- Concurrent confirmation.
- Hai buổi cùng phòng sau khi buổi đầu báo hư.
- Catalog/room inactive.
- Signature metadata authorization.

### Phiếu Y cơ sở

- Create/edit/copy/delete.
- Edit schedule cancelled.
- Preserve confirmation cho session không đổi.
- Invalidate confirmation đúng session bị đổi.
- Unique registration code trong concurrent insert.
- Server-side pagination/filter.

### CI

Bắt buộc chạy và ghi kết quả thật:

```bash
npm run format:check
npm run check
npm run test:db
npm run test:e2e:critical
npm run build
git diff --check
```

Kèm:

- Clean `supabase db reset --local`.
- Seed.
- Test schema từ migration history.
- So sánh function/policy quan trọng với declarative schema.

---

## 10. Tiêu chí đóng review

Chỉ đề xuất đóng follow-up khi:

- Không còn race Auth/Profile email.
- Cleanup Auth được kiểm tra và có reconciliation.
- TA Y cơ sở tạo phiếu thành công trên database dựng từ migration history.
- Staff sai scope bị chặn ở route, RPC và RLS.
- Direct write tồn kho bị chặn.
- Chữ ký không còn query rộng từ client.
- Lecturer được xác định bằng role.
- Các test negative/direct/concurrent đều xanh.
- CI final HEAD xanh.
- Báo cáo kết quả ghi đúng final HEAD và không tuyên bố đóng finding chưa có test.

---

# 11. Verdict

**REQUEST CHANGES**

Fifth Follow-up đã cải thiện đáng kể và phần mô hình Root/Bảo có thể giữ lại. Tuy nhiên:

- Personnel còn một High finding về concurrent email update.
- Luồng Y cơ sở còn nhiều High finding, đặc biệt migration runtime vẫn dùng role `importer`, Staff không bị scope đúng và tồn kho có thể bị ghi trực tiếp ngoài RPC.

Giữ PR ở trạng thái **Draft**, chưa merge và chưa deploy production.
