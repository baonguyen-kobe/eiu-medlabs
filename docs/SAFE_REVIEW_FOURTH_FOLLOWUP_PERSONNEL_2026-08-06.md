# Safe Review — Fourth Follow-up: Personnel, Roles and Import Permission

Ngày review: 06/08/2026
Repository: `baonguyen-kobe/eiu-medlabs`
Pull Request: `#1`
Branch: `review/hardening-20260805`
HEAD được review: `51586a733c710fb1675fe457983049dd4bd98ac5`
Third Follow-up code commit: `f12c73151f991052d2c679b766367fc09f9f6f21`
GitHub Actions run: `31090172455`
GitHub Actions job: `92579014468`

---

# 1. Phạm vi review

Review lần này gồm hai phần:

1. Review lại kết quả Third Follow-up.
2. Bổ sung yêu cầu nghiệp vụ và kỹ thuật cho:

   - Role Trợ giảng.
   - Quyền nhập lịch.
   - Giao diện quản lý nhân sự.
   - Tối ưu tốc độ lưu nhân sự.
   - Tính nguyên tử khi cập nhật hồ sơ, role và phạm vi phòng.

Các source chính đã đối chiếu:

```text
supabase/migrations/20260806091334_third_followup_hardening.sql
supabase/schemas/01_app.sql
supabase/schemas/02_room_type_scopes.sql
app/schedule-entry/import/actions.ts
components/import-wizard.tsx
lib/import-preview-conflicts.ts
supabase/tests/shift_refresh_history.sql
tests/local-supabase.test.mjs
tests/import-preview-conflicts.test.mjs
tests/e2e/skills-import-export-tkb.spec.ts

app/admin/personnel/page.tsx
app/admin/actions.ts
lib/admin-catalog-template.ts
lib/viewer.ts
lib/workspace-access.ts
components/workspace-shell.tsx
```

---

# 2. Kết quả review Third Follow-up

## 2.1. HEAD và CI

Đã xác minh:

```text
Final HEAD:
51586a733c710fb1675fe457983049dd4bd98ac5

GitHub Actions run:
31090172455

Verify job:
92579014468

Workflow result:
completed / success
```

Các bước CI đều thành công:

- `npm ci`.
- Format check.
- Dependency audit.
- Supabase start.
- Reset schema từ migrations.
- Seed test fixtures.
- Database lint.
- ESLint.
- TypeScript.
- Unit và direct database tests.
- pgTAP history tests.
- Critical Playwright E2E.
- Production build.

PR vẫn:

- Open.
- Mergeable.
- Draft.
- Chưa merge.
- Chưa deploy production.
- Chưa redeploy Apps Script production.

## 2.2. Tái phân loại các finding Third Follow-up

| ID                                           | Kết quả review mới |
| -------------------------------------------- | ------------------ |
| Importer làm mất quyền Lecturer              | `ALREADY_FIXED`    |
| Ca cùng ngày đã bắt đầu bị xóa hoặc tạo lại  | `ALREADY_FIXED`    |
| UI conflict hiển thị Hợp lệ                  | `ALREADY_FIXED`    |
| Preview không thấy conflict trong cùng file  | `ALREADY_FIXED`    |
| Lịch import cancelled vẫn giữ hash duplicate | `ALREADY_FIXED`    |

## 2.3. Chi tiết xác nhận

### Multi-role additive authorization

`private.can_modify_class_schedule` đã tính riêng:

```text
can_admin
can_staff
can_importer
can_lecturer
```

và trả về hợp quyền bằng phép `OR`.

Việc có thêm quyền Importer không còn làm mất quyền Lecturer.

### Shift history

Trigger đã chuyển từ kiểm tra chỉ theo ngày sang:

```sql
shift_date + start_time
```

Occurrence đã bắt đầu không còn bị xóa khi thay hoặc hủy pattern.

Materializer cũng không tạo lại occurrence đã bắt đầu.

### Import conflict

Đã xử lý:

- Duplicate trong cùng file.
- Conflict phòng trong cùng file.
- Conflict giảng viên trong cùng file.
- Adjacent intervals không conflict.
- Kết quả theo thứ tự dòng, deterministic.
- Dòng invalid không chặn dòng hợp lệ phía sau.

### Cancelled import hash

`find_existing_import_hashes` đã join `class_schedules` và bỏ qua lịch có:

```text
schedule_status = cancelled
```

### Conflict UI

Status `conflict` đã:

- Hiển thị `Xung đột`.
- Có style riêng.
- Có `row-error`.
- Không được đưa vào danh sách tạo lịch.
- Có Playwright test.

## Kết luận đối với Third Follow-up

> **PASS trong phạm vi năm finding của Third Follow-up.**

Không cần sửa lại năm finding này, trừ khi các thay đổi role và nhân sự mới gây regression.

---

# 3. Quyết định nghiệp vụ mới đã được chốt

## 3.1. Trợ giảng là role riêng

Trợ giảng không phải Importer.

Phải có role kỹ thuật riêng:

```text
teaching_assistant
```

Tên hiển thị:

```text
Trợ giảng
```

## 3.2. Nghiệp vụ của Trợ giảng

Trợ giảng:

- Là một role chính.
- Được gán một hoặc nhiều loại phòng.
- Được tạo và publish lịch trong loại phòng được gán.
- Được chọn giảng viên phụ trách từ toàn bộ giảng viên active thuộc loại phòng liên quan.
- Được tạo lịch cho các giảng viên khác trong cùng loại phòng.
- Được sửa, đổi ngày, đổi giờ, đổi phòng, đổi giảng viên hoặc hủy các lịch do chính Trợ giảng đó tạo, trong phạm vi được phân công.
- Được đăng ký thiết bị theo nghiệp vụ người tạo lịch.
- Không có quyền quản lý toàn bộ lịch trong loại phòng giống Staff.
- Không được sửa lịch do Trợ giảng, Lecturer hoặc Staff khác tạo, trừ khi đồng thời có role Staff hoặc Admin.
- Không tự động có quyền import lịch.

## 3.3. Nghiệp vụ của Lecturer

Lecturer:

- Được tạo và publish lịch trong loại phòng được gán.
- Khi Lecturer tự tạo lịch, Lecturer đó phải là một trong các giảng viên được phân công trên lịch.
- Không có quyền tạo lịch thay cho một giảng viên hoàn toàn không liên quan như Trợ giảng.
- Được sửa, đổi ngày hoặc hủy lịch do mình tạo hoặc lịch mình đang được phân công, theo giới hạn nghiệp vụ hiện có.
- Không được thay đổi danh sách giảng viên của lịch người khác chỉ vì cùng loại phòng.
- Không tự động có quyền import lịch.

## 3.4. Importer là quyền bổ sung

Importer không phải role chính.

Không hiển thị Importer trong danh sách role.

Tên hiển thị của quyền:

```text
Cho phép nhập lịch
```

Tên kỹ thuật đề xuất:

```text
can_import_schedules
```

Quyền nhập lịch:

- Là quyền bổ sung cho một tài khoản đã có role chính.
- Có thể cấp cho:

  - Staff.
  - Lecturer.
  - Teaching Assistant.

- Admin mặc định có toàn quyền, không bắt buộc phải lưu thêm permission.
- Không được cấp cho Viewer.
- Không được dùng thay thế cho role chính.
- Không tự động cho phép tạo lịch manual.
- Không tự động cấp quyền Staff.
- Không tự động cho phép quản lý lịch người khác.
- Không tự động cho phép quản lý thiết bị.
- Chỉ cho phép mở giao diện import và thực hiện import trong các loại phòng được gán.
- Người có quyền import chỉ được quản lý:

  - Batch import do mình tạo.
  - Lịch được tạo từ batch import của mình.

- Không được sửa batch hoặc lịch import của người khác, trừ khi đồng thời có role Staff hoặc Admin.

---

# 4. HIGH-01 — Hệ thống vẫn đồng nhất Importer với Trợ giảng

## Trạng thái

`CONFIRMED`

## Hiện trạng

Database enum hiện có:

```sql
admin
lecturer
staff
importer
viewer
```

Chưa có:

```text
teaching_assistant
```

Giao diện hiện hiển thị:

```text
importer → Trợ giảng
```

Personnel import parser cũng ánh xạ:

```text
Trợ giảng → importer
```

Workspace navigation và access helpers đang dùng `importer` như một role chính.

Một số policy hiện cũng dùng `importer` để:

- Cho phép truy cập workspace.
- Cho phép tạo lịch manual.
- Cho phép tạo lịch Y cơ sở.
- Cho phép quản lý lịch thuộc ownership.
- Cho phép import.

Điều này không còn đúng với nghiệp vụ đã chốt.

## Ảnh hưởng

Hiện tại hệ thống không thể phân biệt:

### Trợ giảng không có quyền import

```text
role = teaching_assistant
can_import_schedules = false
```

### Giảng viên có quyền import

```text
role = lecturer
can_import_schedules = true
```

### Chuyên viên có quyền import

```text
role = staff
can_import_schedules = true
```

### Trợ giảng có quyền import

```text
role = teaching_assistant
can_import_schedules = true
```

## Yêu cầu sửa

### Bổ sung role mới

Migration:

```sql
alter type public.app_role
add value if not exists 'teaching_assistant';
```

Cập nhật TypeScript:

```ts
export type AppRole =
  "admin" | "staff" | "lecturer" | "teaching_assistant" | "viewer";
```

Không tiếp tục dùng `importer` như một role nghiệp vụ.

### Tạo permission nhập lịch

Phương án ưu tiên, đơn giản và phù hợp cấu trúc hiện tại:

```sql
alter table public.profiles
add column can_import_schedules boolean not null default false;
```

Tạo helper:

```sql
private.can_import_schedules(
  target_room_type_id uuid
)
```

Quy tắc:

```text
User active
AND có scope của target room type
AND (
  Admin
  OR (
    can_import_schedules = true
    AND có một trong các role:
      Staff
      Lecturer
      Teaching Assistant
  )
)
```

Viewer dù dữ liệu bị cấu hình sai cũng không được import.

## Migration dữ liệu cũ

Các dòng legacy:

```text
user_roles.role = importer
```

phải được chuyển đổi an toàn.

### Bước 1

Mọi tài khoản có legacy role Importer:

```sql
profiles.can_import_schedules = true
```

### Bước 2

Nếu tài khoản chỉ có role Importer và không có role vận hành nào khác:

```text
admin
staff
lecturer
teaching_assistant
```

thì thêm:

```text
teaching_assistant
```

Điều này bảo toàn quyền của các tài khoản trước đây được nhập dưới tên “Trợ giảng”.

### Bước 3

Xóa các dòng legacy:

```text
user_roles.role = importer
```

### Bước 4

Vì giá trị enum PostgreSQL khó xóa an toàn trong migration nhỏ:

- Có thể giữ giá trị `importer` trong enum ở trạng thái deprecated.
- Không hiển thị trong UI.
- Không cho API hoặc RPC mới ghi role này.
- Thêm validation hoặc trigger từ chối việc thêm role Importer mới.
- Xóa hoàn toàn enum value trong một PR schema-reconciliation sau.

## Không được làm

Không được chỉ đổi label:

```text
Importer → Quyền nhập lịch
```

nhưng vẫn lưu trong `user_roles`.

Đây phải là thay đổi thật ở:

- Data model.
- Authorization helper.
- RLS.
- RPC.
- UI.
- Personnel import.
- Navigation.
- Tests.

---

# 5. HIGH-02 — Quyền tạo lịch của Trợ giảng và Lecturer chưa được phân biệt

## Trạng thái

`CONFIRMED`

## Hiện trạng

Policy tạo lịch hiện cho phép `importer` đi qua nhánh quản lý phòng.

Nhánh Lecturer chủ yếu kiểm tra:

- Có role Lecturer.
- Có room-type scope.
- Giảng viên được chọn hợp lệ trong room type.

Điều này có thể khiến Lecturer cũng chọn một giảng viên khác hoàn toàn và tạo lịch thay cho người đó.

Trong nghiệp vụ mới:

- Trợ giảng được tạo lịch cho toàn bộ Lecturer thuộc room type.
- Lecturer không được tự động có quyền tạo lịch thay cho Lecturer không liên quan.
- Import permission không được cấp quyền tạo lịch manual.

## Yêu cầu sửa

Tạo helper rõ ràng, ví dụ:

```sql
private.can_create_manual_schedule_for(
  target_room_id uuid,
  target_lecturer_ids uuid[]
)
```

### Admin

- Tạo lịch cho mọi giảng viên hợp lệ.

### Staff

- Tạo lịch cho mọi giảng viên thuộc room type Staff được phân công.

### Teaching Assistant

- Tạo lịch cho mọi giảng viên active có role Lecturer và thuộc cùng room type.
- Creator không cần nằm trong danh sách lecturer của lịch.
- Phải có scope của phòng.

### Lecturer

- Phải có scope của phòng.
- Creator phải là một trong:

  - `lecturer_id`.
  - `lecturer_2_id`.

- Lecturer thứ hai, nếu có, phải active, có role Lecturer và cùng room type.

### Import permission

- Không tham gia helper tạo lịch manual.
- Chỉ được sử dụng cho import RPC.

## Update quyền sửa lịch

`private.can_modify_class_schedule` cần có các nhánh:

```text
can_admin
can_staff
can_teaching_assistant_owner
can_lecturer_related
can_import_batch_owner
```

Trong đó:

### Teaching Assistant owner

Được thao tác nếu:

```text
Có role teaching_assistant
AND có room-type scope
AND schedule.created_by = auth.uid()
```

### Import batch owner

Được thao tác nếu:

```text
private.can_import_schedules(room_type_id)
AND import_batches.created_by = auth.uid()
```

Không kiểm tra role `importer`.

## Test bắt buộc

- Teaching Assistant tạo lịch cho Lecturer A trong scope: thành công.
- Teaching Assistant tạo lịch cho Lecturer B trong cùng scope: thành công.
- Teaching Assistant tạo lịch cho Lecturer ngoài scope: từ chối.
- Teaching Assistant sửa lịch do mình tạo: thành công.
- Teaching Assistant sửa lịch do TA khác tạo: từ chối.
- Teaching Assistant không có import permission: không thấy và không gọi được import.
- Teaching Assistant có import permission: import được.
- Lecturer tạo lịch có chính mình trong danh sách: thành công.
- Lecturer tạo lịch chỉ có Lecturer khác: từ chối.
- Lecturer có import permission: vẫn giữ quyền Lecturer và có thêm import.
- Import permission đơn lẻ, không có role chính: từ chối.
- Viewer có dữ liệu permission sai: vẫn từ chối.
- Staff không có import permission: không import, trừ khi quyết định riêng trong tương lai.
- Staff có import permission: import được.
- Admin: thành công.

---

# 6. HIGH-03 — Cập nhật role và scope nhân sự chưa có transaction

## Trạng thái

`CONFIRMED`

## Hiện trạng cập nhật role

Mỗi role là một form riêng.

Khi bật Viewer:

1. Xóa các role khác.
2. Sau đó mới upsert Viewer.

Khi bật role khác:

1. Xóa Viewer.
2. Sau đó mới upsert role mới.

Nếu bước sau thất bại:

- Người dùng có thể bị mất role cũ.
- Người dùng có thể trở thành tài khoản không có role.
- UI có thể hiển thị lỗi nhưng dữ liệu đã bị thay đổi một phần.

## Hiện trạng cập nhật scope

`updatePersonnelScope` thực hiện tuần tự:

1. Validate room types.
2. Xóa toàn bộ scope cũ.
3. Insert toàn bộ scope mới.
4. Update quyền Y cơ sở.

Nếu insert hoặc profile update thất bại sau bước xóa:

- Scope cũ đã mất.
- Nhân sự có thể mất quyền truy cập phòng.
- Không có rollback transaction.

## Yêu cầu sửa

Tạo một RPC duy nhất:

```sql
public.admin_update_personnel
```

RPC phải cập nhật trong một database transaction:

- Profile fields.
- Main roles.
- Import permission.
- Room-type scopes.
- Email scopes.
- Basic Medical permission.
- Active status.

RPC nhận dữ liệu dạng:

```text
target_profile_id
target_full_name
target_phone
target_title
target_roles[]
target_can_import_schedules
target_room_type_ids[]
target_email_room_type_ids[]
target_allow_basic_medical_access
target_is_active
target_expected_version
```

## Validation trong RPC

- Actor phải là active Admin.
- Target profile phải tồn tại.
- Không được tự gỡ Admin của tài khoản đang đăng nhập.
- Không được tự khóa tài khoản đang đăng nhập.
- Phải có ít nhất một main role.
- Viewer không được kết hợp với role khác.
- Viewer không được có import permission.
- Import permission chỉ hợp lệ với Staff, Lecturer hoặc Teaching Assistant.
- Email room type phải là tập con của assigned room types.
- Mọi room type phải active.
- Không được ghi role deprecated `importer`.
- Không được để hệ thống không còn Admin active.
- Mọi thay đổi phải rollback nếu bất kỳ bước nào thất bại.

## Optimistic concurrency

Nên thêm:

```text
access_version integer
```

hoặc dùng `updated_at`.

RPC nhận version hiện tại của bản ghi.

Nếu hai Admin cùng sửa một nhân sự:

- Lần lưu sau không được âm thầm ghi đè thay đổi của người trước.
- Trả lỗi `PERSONNEL_CHANGED_RELOAD_REQUIRED`.

---

# 7. MEDIUM-01 — Đổi email có thể lệch Supabase Auth và profiles

## Trạng thái

`CONFIRMED`

## Hiện trạng

Khi đổi email:

1. Cập nhật email trong Supabase Auth.
2. Sau đó update bảng `profiles`.

Nếu bước 2 thất bại:

- Email đăng nhập đã đổi.
- Email trong `profiles` vẫn là email cũ.
- Hệ thống có hai nguồn dữ liệu không đồng nhất.

## Yêu cầu sửa

Có hai phương án.

### Phương án ưu tiên

Tách đổi email thành hành động riêng:

```text
Thay đổi email đăng nhập
```

Trong drawer, trường email có cảnh báo:

```text
Thay đổi email sẽ thay đổi tên đăng nhập của người dùng.
```

Khi lưu:

1. Kiểm tra email không trùng.
2. Gọi Auth Admin API.
3. Gọi RPC cập nhật profile.
4. Nếu RPC thất bại:

   - Thử rollback Auth về email cũ.

5. Nếu rollback cũng thất bại:

   - Ghi reconciliation log.
   - Hiển thị lỗi rõ ràng cho Admin.
   - Không báo “Đã lưu thành công”.

### Phương án thay thế

Không cho sửa email trong form tổng hợp.

Tạo flow riêng có xác nhận và reconciliation.

---

# 8. MEDIUM-02 — Trang Nhân sự tải toàn bộ dữ liệu rồi mới phân trang

## Trạng thái

`CONFIRMED`

## Hiện trạng

Mỗi lần mở hoặc reload trang, server tải:

- Toàn bộ `profiles`.
- Toàn bộ `user_roles`.
- Toàn bộ `room_types`.
- Toàn bộ `profile_room_types`.

Sau đó:

- Group bằng JavaScript.
- Filter bằng JavaScript.
- Phân trang bằng `slice`.

Khi lưu một role hoặc scope, trang bị revalidate và quá trình trên chạy lại.

Điều này khiến thời gian lưu tăng theo số lượng nhân sự.

## Yêu cầu sửa

### Phương án ưu tiên

Tạo RPC:

```sql
public.admin_list_personnel(
  target_query text,
  target_role app_role,
  target_status text,
  target_page integer,
  target_page_size integer
)
```

RPC trả:

```text
profile
roles[]
can_import_schedules
room_types[]
email_room_types[]
total_count
```

Chỉ trả dữ liệu của trang hiện tại.

### Phương án thay thế

1. Query `profiles` bằng:

   - Filter.
   - Count.
   - `range()`.

2. Lấy danh sách profile ID của trang.
3. Chỉ query roles và scopes bằng:

   - `.in("user_id", pageProfileIds)`.
   - `.in("profile_id", pageProfileIds)`.

Không tải role và scope của toàn bộ hệ thống.

## Kết quả mong đợi

Sau khi lưu một nhân sự:

- Không đọc lại toàn bộ dữ liệu.
- Chỉ cập nhật row/card vừa sửa.
- Có thể `router.refresh()` đúng một lần nếu cần.
- Không refresh sau từng role.

---

# 9. MEDIUM-03 — Bố cục và nút Nhân sự chưa phù hợp

## Trạng thái

`CONFIRMED`

## Vấn đề hiện tại

Mỗi card nhân sự chứa:

- Form sửa thông tin.
- Năm role dạng nút tự lưu.
- Form lưu scope.
- Quyền Y cơ sở.
- Nút khóa tài khoản.

Một lần chỉnh đầy đủ có thể cần:

- Lưu thông tin.
- Bấm từng role.
- Lưu phạm vi.
- Khóa hoặc kích hoạt riêng.

Mỗi thao tác gửi request và có thể reload trang.

Các role chip nhìn giống nút chọn nhưng thực tế bấm là lưu ngay.

Không có:

- Dirty state.
- Pending state rõ ràng.
- Một nút lưu chung.
- Cảnh báo thay đổi chưa lưu.
- Xác nhận khi khóa tài khoản.

## Bố cục mới bắt buộc

### Danh sách chính

Desktop dùng bảng hoặc list gọn:

```text
┌────────────────────────────────────────────────────────────────────┐
│ Nhân sự & phân quyền                                                │
│ [Tìm kiếm...] [Vai trò ▼] [Quyền nhập lịch ▼] [Trạng thái ▼]      │
│                                      [Import ▼] [+ Thêm nhân sự]    │
├────────────────────────────────────────────────────────────────────┤
│ NHÂN SỰ       VAI TRÒ       QUYỀN BỔ SUNG    PHẠM VI    TRẠNG THÁI │
├────────────────────────────────────────────────────────────────────┤
│ Nguyễn A      Giảng viên    Nhập lịch        Skills Lab Hoạt động  │
│ a@eiu.edu.vn                                  Y cơ sở    [Sửa] [⋯] │
├────────────────────────────────────────────────────────────────────┤
│ Trần B        Trợ giảng     —                 Skills Lab Hoạt động  │
│ b@eiu.edu.vn                                              [Sửa] [⋯] │
└────────────────────────────────────────────────────────────────────┘
```

Danh sách chỉ hiển thị:

- Avatar hoặc initials.
- Họ tên.
- Email.
- Chức danh.
- Main role badges.
- Additional permission badges.
- Room-type badges.
- Trạng thái.
- Nút Sửa.
- Menu `⋯`.

Không hiển thị toàn bộ checkbox trên từng card.

### Drawer chỉnh sửa

Bấm `Sửa` mở drawer bên phải:

```text
┌──────────────────────────────────────────────┐
│ Chỉnh sửa nhân sự                        [×] │
├──────────────────────────────────────────────┤
│ THÔNG TIN CƠ BẢN                             │
│ Họ và tên        [_______________________]   │
│ Email đăng nhập  [_______________________]   │
│ Số điện thoại    [_______________________]   │
│ Chức danh        [_______________________]   │
│                                              │
│ VAI TRÒ CHÍNH                                │
│ [ ] Quản trị viên                            │
│ [ ] Chuyên viên                              │
│ [✓] Giảng viên                               │
│ [ ] Trợ giảng                                │
│ [ ] Người xem                                │
│                                              │
│ QUYỀN BỔ SUNG                                │
│ [✓] Cho phép nhập lịch                       │
│ [ ] Cho phép tạo lịch Y cơ sở                │
│                                              │
│ PHẠM VI PHỤ TRÁCH                            │
│ [✓] Kỹ năng Điều dưỡng                       │
│     [ ] Nhận email lịch                      │
│ [✓] Y cơ sở                                  │
│     [ ] Nhận email lịch                      │
│                                              │
│ TRẠNG THÁI                                   │
│ [●] Đang hoạt động                           │
├──────────────────────────────────────────────┤
│ Có thay đổi chưa lưu                         │
│                     [Hủy] [Lưu thay đổi]     │
└──────────────────────────────────────────────┘
```

## Quy tắc giao diện

### Role chính

Hiển thị:

- Quản trị viên.
- Chuyên viên.
- Giảng viên.
- Trợ giảng.
- Người xem.

Không hiển thị Importer trong nhóm role.

### Quyền bổ sung

Hiển thị:

- Cho phép nhập lịch.
- Cho phép tạo lịch Y cơ sở.

### Viewer

Khi chọn Viewer:

- Tự bỏ các role khác trong state của form.
- Tắt quyền nhập lịch.
- Hiển thị giải thích:

```text
Người xem chỉ có quyền đọc và không thể kết hợp với vai trò khác.
```

### Import permission

Nếu chưa chọn Staff, Lecturer hoặc Teaching Assistant:

- Disable `Cho phép nhập lịch`.
- Hiển thị:

```text
Quyền nhập lịch chỉ áp dụng cho Chuyên viên, Giảng viên hoặc Trợ giảng.
```

### Nhận email theo loại phòng

Đổi nhãn:

```text
Nhận email lịch của loại phòng này
```

Không dùng:

```text
Nhận email thông báo (Người xem)
```

Nếu email subscription chỉ dành cho Viewer:

- Chỉ hiển thị hoặc chỉ enable khi Viewer được chọn.
- Backend vẫn phải validate.

### Khóa tài khoản

Đưa vào menu `⋯` hoặc khu vực nguy hiểm trong drawer.

Không đặt cạnh nút lưu thông thường.

Phải có xác nhận:

```text
Khóa tài khoản Nguyễn Văn A?

Người dùng sẽ không thể đăng nhập, nhưng dữ liệu và lịch sử hoạt động vẫn được giữ lại.

[Hủy] [Khóa tài khoản]
```

### Thay đổi chưa lưu

Khi form bị thay đổi:

- Hiển thị `Có thay đổi chưa lưu`.
- Enable nút `Lưu thay đổi`.
- Khi đóng drawer, hỏi xác nhận nếu chưa lưu.

### Pending state

Khi đang lưu:

- Nút đổi thành `Đang lưu…`.
- Disable toàn bộ input.
- Không cho submit hai lần.
- Không đóng drawer trước khi nhận kết quả.

### Save result

Thành công:

```text
Đã cập nhật nhân sự.
```

Thất bại:

- Giữ drawer mở.
- Giữ dữ liệu người dùng đã nhập.
- Hiển thị lỗi tại đúng section.
- Không reload toàn trang về state cũ.

---

# 10. MEDIUM-04 — Import nhân sự cần tách Role và quyền nhập lịch

## Trạng thái

`CONFIRMED`

## Template mới

Cột hiện tại:

```text
Vai trò
```

vẫn được giữ nhưng chỉ nhận main roles:

```text
Quản trị viên
Chuyên viên
Giảng viên
Trợ giảng
Người xem
```

Bổ sung cột:

```text
Quyền nhập lịch
```

Giá trị:

```text
Có
Không
```

## Mapping

### Role

```text
admin → admin
quản trị viên → admin

staff → staff
chuyên viên → staff
nhân viên → staff

lecturer → lecturer
giảng viên → lecturer

teaching_assistant → teaching_assistant
trợ giảng → teaching_assistant

viewer → viewer
người xem → viewer
```

### Import permission

```text
importer
người nhập lịch
người tạo phiếu
quyền nhập lịch
```

không còn được ánh xạ thành role.

Các giá trị này chỉ được chấp nhận ở cột:

```text
Quyền nhập lịch
```

## Backward compatibility

Trong một giai đoạn chuyển đổi, có thể hỗ trợ file cũ:

- Nếu cột `Vai trò` có `Importer`:

  - Không tạo role Importer.
  - Chuyển thành `can_import_schedules = true`.

- File vẫn phải có ít nhất một main role hợp lệ.
- Nếu chỉ có `Importer` và không có main role:

  - Có thể map thành Teaching Assistant trong migration/import compatibility để bảo toàn dữ liệu cũ.
  - Phải ghi warning rõ trong kết quả import.

## Template sample

Thêm ví dụ:

```text
Họ và tên: Phạm Ngọc D
Chức danh: Trợ giảng
Vai trò: Trợ giảng
Quyền nhập lịch: Có
Loại phòng: Kỹ năng Điều dưỡng
```

Và:

```text
Họ và tên: Nguyễn Văn A
Chức danh: Giảng viên
Vai trò: Giảng viên
Quyền nhập lịch: Có
Loại phòng: Kỹ năng Điều dưỡng
```

---

# 11. Server action mới

Tạo một action chính:

```ts
savePersonnelChanges;
```

Luồng đề xuất:

1. Xác thực session.
2. Parse và validate payload cơ bản.
3. Nếu email thay đổi:

   - Thực hiện flow Auth có rollback.

4. Gọi một RPC:

   - `admin_update_personnel`.

5. RPC cập nhật toàn bộ DB trong một transaction.
6. Trả updated personnel snapshot.
7. Client cập nhật row hiện tại.
8. Chỉ refresh một lần nếu thật sự cần.

Không tiếp tục dùng các action độc lập cho giao diện mới:

```text
updateUserRole
updatePersonnelScope
updatePersonnel
toggleProfile
```

Có thể giữ tạm để backward compatibility nhưng:

- UI mới không được gọi.
- Sau khi migration hoàn tất thì xóa hoặc deprecate.

---

# 12. Navigation và workspace access

Phải rà soát toàn repository:

```bash
rg -n "importer|Trợ giảng|trogiang|nguoitaophieu" .
```

Các nơi phải cập nhật ít nhất:

```text
lib/viewer.ts
lib/workspace-access.ts
components/workspace-shell.tsx
app/admin/personnel/page.tsx
app/admin/actions.ts
lib/admin-catalog-template.ts
app/schedule-entry/import/actions.ts
supabase/schemas/01_app.sql
supabase/schemas/02_room_type_scopes.sql
các migration/RPC/RLS liên quan
seed files
unit tests
database tests
E2E tests
```

## Workspace

`teaching_assistant` được phép truy cập workspace của loại phòng được gán.

`can_import_schedules` chỉ điều khiển:

- Hiển thị menu Import.
- Truy cập route Import.
- Gọi validation/import RPC.

Không dùng permission này để xác định primary role label.

## Primary role label

Thứ tự đề xuất:

```text
Admin
Staff
Teaching Assistant
Lecturer
Viewer
```

Khi tài khoản có nhiều role, badge hiển thị đầy đủ trong trang Nhân sự; sidebar chỉ hiển thị primary role.

## Import menu

Menu Import chỉ hiển thị khi:

```text
Admin
OR can_import_schedules trong room type hiện tại
```

Không dùng:

```text
roles.includes("importer")
```

---

# 13. Database enforcement bắt buộc

Không chỉ ẩn UI.

Cần sửa trực tiếp:

- RLS.
- SECURITY DEFINER RPC.
- Route protection.
- Server actions.
- Import validation.
- Import execution.
- Ownership helper.

## Helper đề xuất

```text
private.has_main_operational_role()
private.is_teaching_assistant()
private.can_import_schedules(room_type_id)
private.can_create_manual_schedule_for(room_id, lecturer_ids)
private.can_modify_class_schedule(schedule_id, action)
```

## Direct RPC tests

Phải kiểm tra bằng client session thật:

- Không dựa vào việc UI có hiện menu hay không.
- Người dùng biết UUID vẫn không bypass được.
- Viewer có permission dữ liệu sai vẫn không gọi được.
- Teaching Assistant ngoài room type bị từ chối.
- Import permission ngoài room type bị từ chối.
- Legacy importer role không còn tạo quyền sau migration.

---

# 14. Test coverage bắt buộc

## 14.1. Role matrix

- Admin.
- Staff.
- Lecturer.
- Teaching Assistant.
- Viewer.
- Staff + Lecturer.
- Teaching Assistant + Lecturer.
- Lecturer + import permission.
- Teaching Assistant + import permission.
- Staff + import permission.
- Viewer + import permission bị từ chối.
- Không role + import permission bị từ chối.

## 14.2. Teaching Assistant schedule tests

- Tạo lịch cho Lecturer A cùng room type.
- Tạo lịch cho Lecturer B cùng room type.
- Chọn Lecturer ngoài room type.
- Chọn inactive Lecturer.
- Sửa lịch do chính TA tạo.
- Sửa lịch do TA khác tạo.
- Reschedule lịch của chính TA.
- Assign Lecturer cho lịch của chính TA.
- Delete/cancel theo lifecycle.
- Direct RPC bypass.

## 14.3. Lecturer tests

- Tạo lịch có chính mình.
- Tạo lịch có chính mình và Lecturer thứ hai.
- Tạo lịch chỉ có Lecturer khác.
- Sửa lịch được phân công.
- Assign Lecturer ngoài quyền.
- Import không permission.
- Import có permission.

## 14.4. Import permission tests

- Permission true và đúng room scope.
- Permission true nhưng sai room scope.
- Permission false.
- Admin.
- Ownership batch.
- Batch người khác.
- Manual schedule không được cấp quyền chỉ vì có import permission.
- Concurrent import.
- Cancelled schedule re-import.

## 14.5. Personnel atomicity tests

Cố ý làm bước insert role hoặc scope thất bại.

Xác minh:

- Profile không đổi.
- Roles không đổi.
- Scopes không đổi.
- Permissions không đổi.
- Active status không đổi.

Không được có partial update.

## 14.6. Personnel UI tests

- Mở drawer.
- Thay đổi nhiều role nhưng chưa lưu thì database chưa đổi.
- Một lần bấm Lưu gửi một request.
- Pending state.
- Viewer tự loại các role khác trong form.
- Import permission disabled khi không có role phù hợp.
- Đóng drawer có unsaved changes warning.
- Save error giữ nguyên dữ liệu form.
- Save success cập nhật đúng row.
- Khóa tài khoản có confirmation.
- Tự gỡ Admin bị chặn.
- Tự khóa tài khoản bị chặn.

## 14.7. Personnel pagination

- Database chỉ trả page hiện tại.
- Search theo tên.
- Search theo email.
- Filter role.
- Filter Teaching Assistant.
- Filter import permission.
- Filter active/inactive.
- Tổng số bản ghi chính xác.
- Chuyển trang không tải toàn bộ roles/scopes.

---

# 15. Theo dõi hiệu năng

Bổ sung timing có cấu trúc cho development và preview:

```text
personnel.list.total_ms
personnel.save.auth_ms
personnel.save.rpc_ms
personnel.save.total_ms
```

Không log:

- Mật khẩu.
- Access token.
- Secret key.
- Toàn bộ payload nhạy cảm.

Mục tiêu kiến trúc:

- Một lần lưu nhân sự chỉ có một mutation RPC cho database.
- Không reload sau từng role.
- Không xóa rồi insert ngoài transaction.
- Không tải toàn bộ nhân sự để hiển thị một trang.

Không đặt test CI theo ngưỡng millisecond quá chặt vì dễ flaky.

---

# 16. Tài liệu cần cập nhật

## Third Follow-up result

File:

```text
docs/SAFE_REVIEW_THIRD_FOLLOWUP_RESULT_2026-08-06.md
```

hiện chưa ghi trực tiếp:

```text
Final HEAD
GitHub Actions run
Verify job
```

Các thông tin này mới nằm trong PR body/comment.

Cần cập nhật file báo cáo với:

```text
Final HEAD:
51586a733c710fb1675fe457983049dd4bd98ac5

Run:
31090172455

Job:
92579014468

Result:
completed / success
```

## PR body

Không chỉ append thông tin mới ở cuối.

Phải viết lại body để loại bỏ thông tin cũ:

- `33/33 tests`.
- Accessibility `2/2`.
- Capability giao thiết bị sớm.
- Hard-delete còn chờ quyết định.
- Partial success còn chờ quyết định.
- Importer được gọi là Trợ giảng.

Body mới phải phản ánh:

- Third Follow-up final.
- Role Teaching Assistant.
- Import permission riêng.
- Các production blocker còn lại.
- Fourth Follow-up đang thực hiện.

## Báo cáo Fourth Follow-up

Sau khi hoàn tất, tạo:

```text
docs/SAFE_REVIEW_FOURTH_FOLLOWUP_PERSONNEL_RESULT_2026-08-06.md
```

Báo cáo phải có:

- HEAD trước sửa.
- Commit code.
- Final HEAD.
- Migration files.
- Data backfill result.
- Số legacy Importer đã chuyển.
- Số tài khoản được gán Teaching Assistant.
- Số tài khoản được cấp import permission.
- Các file thay đổi.
- Test count.
- Workflow run.
- Job ID.
- Kết quả từng finding.
- Finding còn mở.
- PR có thể chuyển Ready hay chưa.

---

# 17. Definition of Done

Chỉ chuyển PR sang Ready for review khi:

1. Third Follow-up vẫn xanh, không regression.
2. Có role `teaching_assistant`.
3. Importer không còn là role nghiệp vụ.
4. Có permission `can_import_schedules`.
5. Legacy Importer được migrate an toàn.
6. Teaching Assistant tạo lịch cho Lecturer trong scope.
7. Lecturer không có quyền delegated creation của Teaching Assistant.
8. Import permission không cấp quyền tạo lịch manual.
9. Import permission không cấp quyền Staff.
10. Viewer không thể có import permission.
11. Personnel import tách role và import permission.
12. Navigation không còn kiểm tra role Importer.
13. Một lần chỉnh nhân sự chỉ cần một nút Lưu.
14. Role, scope, permission và status được cập nhật trong một transaction.
15. Email change có rollback hoặc reconciliation.
16. Personnel list phân trang tại database.
17. Không tải toàn bộ profiles/roles/scopes.
18. Có loading, dirty và error state.
19. Khóa tài khoản có confirmation.
20. Direct RPC, negative, migration, unit và E2E tests xanh.
21. GitHub Actions xanh trên final HEAD.
22. Fourth Follow-up result report đã được commit.
23. PR body đã được viết lại.
24. Không còn High finding mở.

---

# 18. Production blocker vẫn còn

Các mục sau vẫn là blocker trước production:

1. Hard-delete/soft-delete và data lifecycle.
2. Private Storage cho chữ ký.
3. Apps Script production deployment và rehearsal.
4. Declarative schema reconciliation.
5. Role/permission migration trong tài liệu này.
6. Personnel atomic update nếu chưa hoàn tất.

---

# 19. Kết luận reviewer

## Third Follow-up

```text
PASS
```

Năm finding được giao đã được xử lý và CI xanh.

## Toàn bộ PR sau quyết định nghiệp vụ mới

```text
REQUEST CHANGES
```

Lý do:

- Chưa có role Teaching Assistant.
- Importer vẫn đang được lưu như role.
- Importer vẫn đang hiển thị là Trợ giảng.
- Quyền tạo lịch của Lecturer và Teaching Assistant chưa tách.
- Personnel updates chưa atomic.
- Personnel UI vẫn lưu bằng nhiều request và reload.
- Personnel list vẫn tải toàn bộ dữ liệu trước khi phân trang.

## Trạng thái PR

```text
Giữ Draft.
Không merge main.
Không deploy production.
Không redeploy Apps Script production.
```

Không còn nội dung nghiệp vụ nào cần chủ hệ thống chốt thêm cho vòng này.

---

# 20. Prompt giao cho AI executor

Đọc repository:

```text
Repository: baonguyen-kobe/eiu-medlabs
Branch: review/hardening-20260805
PR: #1
Reviewed HEAD: 51586a733c710fb1675fe457983049dd4bd98ac5
```

Đọc các tài liệu:

```text
docs/SAFE_REVIEW_CLASSIFICATION_2026-08-05.md
docs/SAFE_REVIEW_FINAL_REPORT_2026-08-05.md
docs/SAFE_REVIEW_FOLLOWUP_RESULT_2026-08-06.md
docs/SAFE_REVIEW_SECOND_FOLLOWUP_2026-08-06.md
docs/SAFE_REVIEW_SECOND_FOLLOWUP_RESULT_2026-08-06.md
docs/SAFE_REVIEW_THIRD_FOLLOWUP_2026-08-06.md
docs/SAFE_REVIEW_THIRD_FOLLOWUP_RESULT_2026-08-06.md
docs/SAFE_REVIEW_FOURTH_FOLLOWUP_PERSONNEL_2026-08-06.md
docs/APPS_SCRIPT_EMAIL_SETUP.md
```

Trước khi sửa:

1. Xác minh HEAD.
2. Xác minh PR vẫn Draft.
3. Không merge.
4. Không deploy production.
5. Không redeploy Apps Script production.
6. Chạy tìm kiếm toàn repo:

```bash
rg -n "importer|Trợ giảng|trogiang|nguoitaophieu" .
```

Thực hiện:

## Task 1 — Role Teaching Assistant

- Thêm `teaching_assistant`.
- Cập nhật TypeScript role union.
- Cập nhật labels, filters, templates, navigation và tests.
- Teaching Assistant được tạo lịch cho toàn bộ Lecturer active trong room type được phân công.
- Teaching Assistant chỉ quản lý lịch do chính mình tạo, trừ khi có Staff/Admin.

## Task 2 — Import permission

- Thêm `profiles.can_import_schedules`.
- Tạo helper DB.
- Import permission không phải role.
- Admin mặc định có quyền.
- Staff/Lecturer/TA cần permission.
- Viewer và tài khoản không có main role bị từ chối.
- Không cấp manual schedule management.

## Task 3 — Legacy migration

- Backfill permission từ legacy Importer.
- Legacy Importer-only được thêm Teaching Assistant.
- Xóa role rows Importer.
- Không cho tạo role Importer mới.
- Có migration tests và báo cáo số lượng.

## Task 4 — Authorization

- Tách quyền tạo lịch của Lecturer và Teaching Assistant.
- Refactor RLS/RPC.
- Import batch ownership dùng permission, không dùng role.
- Kiểm tra source và target room scope.
- Direct RPC negative tests.

## Task 5 — Personnel UI

- Chuyển danh sách sang table/list gọn.
- Dùng drawer chỉnh sửa.
- Một form.
- Một nút Lưu.
- Role chính và quyền bổ sung tách riêng.
- Dirty/pending/error state.
- Confirmation khóa tài khoản.
- Viewer exclusivity ở UI và DB.

## Task 6 — Atomic save

- Tạo `admin_update_personnel`.
- Cập nhật profile, roles, permissions, scopes và status trong một transaction.
- Không delete/insert ngoài transaction.
- Có concurrency/version check.

## Task 7 — Email change

- Tách flow hoặc thêm rollback.
- Không để Auth và profiles lệch nhau.
- Có reconciliation log khi rollback thất bại.

## Task 8 — Server-side pagination

- Không tải toàn bộ nhân sự.
- Filter và paginate trong database.
- Chỉ tải roles/scopes của page hiện tại hoặc dùng một RPC tổng hợp.

## Task 9 — Personnel import

- Vai trò có Teaching Assistant.
- Cột riêng `Quyền nhập lịch`.
- Backward compatibility file cũ.
- Template, instructions và tests.

## Task 10 — Documentation

- Cập nhật Third result với final HEAD/run/job.
- Viết lại PR body.
- Tạo Fourth result report.

## Task 11 — CI

Chạy:

```bash
npm ci
npm run format:check
npm audit
npx supabase db reset --local
npx supabase db lint --local --level error
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:e2e:critical
npm run build
```

Sau khi hoàn tất:

1. Commit vào `review/hardening-20260805`.
2. Push branch.
3. Không merge.
4. Chờ GitHub Actions final HEAD xanh.
5. Commit báo cáo final.
6. Chạy CI lại nếu HEAD thay đổi.
7. Cập nhật PR comment.
8. Chỉ đề xuất Ready khi không còn High finding mở.
