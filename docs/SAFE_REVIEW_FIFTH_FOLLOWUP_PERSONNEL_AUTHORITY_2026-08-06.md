# Safe Review — Fifth Follow-up: Personnel Authority and Root Administrator

Ngày review: 06/08/2026
Repository: `baonguyen-kobe/eiu-medlabs`
Pull Request: `#1`
Branch: `review/hardening-20260805`
HEAD bắt đầu review: `7bcf97f62538cbef39506b6e1b2ae6d5265e75d1`

---

# 1. Mục tiêu

Vòng follow-up này sửa mô hình quản trị nhân sự và xử lý các finding còn lại sau Fourth Follow-up.

Các mục chính:

1. Chỉ hai tài khoản đặc biệt được truy cập mục Nhân sự.
2. Chỉ Root Administrator được khóa hoặc thay đổi quyền của các Admin hiện hữu.
3. Các Admin thông thường không được xem hoặc gọi chức năng quản trị nhân sự.
4. Bịt các bypass nullable trong RPC.
5. Làm cho import nhân sự atomic và có optimistic concurrency.
6. Sửa ghi nhận trạng thái lỗi import.
7. Giới hạn đầu vào RPC kiểm tra hash.
8. Cập nhật tài liệu và PR body.

PR phải tiếp tục giữ Draft trong quá trình thực hiện.

Không merge `main`.

Không deploy production.

Không redeploy Apps Script production.

---

# 2. Quyết định nghiệp vụ đã chốt

## 2.1. Root Administrator

Hệ thống có duy nhất một tài khoản:

```text
Root Administrator
```

Đây là tài khoản Quản trị viên được tạo ban đầu khi thiết lập hệ thống.

Root Administrator:

- Luôn có role `admin`.
- Luôn ở trạng thái hoạt động.
- Không thể bị khóa.
- Không thể bị gỡ role Admin.
- Không thể bị thay thế bởi một Admin thông thường.
- Là tài khoản duy nhất được khóa hoặc mở khóa các tài khoản đang có role Admin.
- Là tài khoản duy nhất được gỡ role Admin khỏi một tài khoản Admin hiện hữu.
- Có quyền quản lý toàn bộ nhân sự.
- Có quyền quản lý tài khoản đặc biệt `bao.nguyen@eiu.edu.vn`.
- Có quyền xem và xử lý reconciliation log.

Không xác định Root Administrator bằng:

- Thời gian `created_at` sớm nhất.
- Thứ tự dòng trong database.
- Role Admin đầu tiên được truy vấn.
- Email hard-code trong từng server action.

Root Administrator phải được lưu bằng UUID trong cấu hình bảo mật của database.

## 2.2. Personnel Manager thứ hai

Tài khoản:

```text
bao.nguyen@eiu.edu.vn
```

là tài khoản đặc biệt thứ hai được quyền truy cập mục Nhân sự.

Tài khoản này:

- Phải có role `admin`.
- Được xem danh sách nhân sự.
- Được tạo tài khoản nhân sự mới.
- Được sửa nhân sự không phải Admin.
- Được cấp role, capability và scope cho nhân sự không phải Admin.
- Được nâng một tài khoản không phải Admin thành Admin.
- Được khóa hoặc mở khóa tài khoản không phải Admin.
- Được import danh sách nhân sự.
- Không được khóa bất kỳ tài khoản đang có role Admin nào.
- Không được gỡ role Admin của một Admin hiện hữu.
- Không được chỉnh sửa Root Administrator.
- Không được chỉnh sửa trạng thái hoặc quyền bảo mật của chính mình.
- Không được thay đổi cấu hình xác định Root Administrator hoặc Personnel Manager.

Sau khi tài khoản này nâng một người dùng thành Admin, chỉ Root Administrator mới được thay đổi role Admin hoặc trạng thái hoạt động của tài khoản đó.

## 2.3. Các Admin khác

Các tài khoản có role `admin` nhưng không phải:

- Root Administrator.
- `bao.nguyen@eiu.edu.vn`.

không được:

- Thấy menu Nhân sự.
- Truy cập `/admin/personnel`.
- Gọi RPC liệt kê nhân sự.
- Gọi RPC cập nhật nhân sự.
- Tạo tài khoản nhân sự.
- Import nhân sự.
- Thay đổi role hoặc capability.
- Thay đổi room-type scope.
- Khóa hoặc mở khóa tài khoản.
- Đọc reconciliation log.

Role `admin` vẫn giữ các quyền quản trị nghiệp vụ khác đã được thiết kế, nhưng không tự động cấp quyền quản lý nhân sự.

---

# 3. Mô hình dữ liệu đề xuất

## 3.1. Không dùng role mới cho hai tài khoản đặc biệt

Không thêm các role như:

```text
root_admin
personnel_admin
super_admin
```

vào `user_roles`.

Role nghiệp vụ vẫn là:

```text
admin
staff
lecturer
teaching_assistant
viewer
```

Quyền quản lý nhân sự là quyền bảo mật cấp hệ thống, tách khỏi role nghiệp vụ.

## 3.2. Tạo bảng singleton bảo mật

Tạo bảng:

```sql
public.system_security_principals
```

Cấu trúc đề xuất:

```sql
create table public.system_security_principals (
  singleton boolean primary key default true
    check (singleton),

  root_admin_id uuid not null unique
    references public.profiles(id) on delete restrict,

  personnel_manager_id uuid not null unique
    references public.profiles(id) on delete restrict,

  configured_at timestamptz not null default now(),
  configured_by uuid references public.profiles(id) on delete set null,

  constraint security_principals_distinct_accounts
    check (root_admin_id <> personnel_manager_id)
);
```

Bảng phải:

- Có đúng một dòng cấu hình.
- Không cho `anon` hoặc `authenticated` đọc trực tiếp.
- Không cho application user insert, update hoặc delete.
- Chỉ được cấu hình bằng service role trong bước bootstrap được kiểm soát.
- Không được sửa thông qua trang Nhân sự.

Thiết lập quyền:

```sql
revoke all on public.system_security_principals
from public, anon, authenticated;

grant select, insert, update
on public.system_security_principals
to service_role;
```

## 3.3. Không hard-code email trong runtime authorization

Email:

```text
bao.nguyen@eiu.edu.vn
```

chỉ được dùng trong bước bootstrap để resolve UUID.

Sau khi cấu hình, authorization phải so sánh bằng:

```text
auth.uid()
```

với UUID đã lưu trong `system_security_principals`.

Điều này bảo đảm:

- Đổi email không làm mất quyền.
- Không phụ thuộc chữ hoa hoặc chữ thường.
- Không phụ thuộc dữ liệu JWT email cũ.
- Không lặp lại email hard-code trong nhiều file.

---

# 4. Bootstrap tài khoản đặc biệt

## 4.1. Biến cấu hình

Tạo các biến dùng trong script bootstrap:

```text
ROOT_ADMIN_EMAIL
PERSONNEL_MANAGER_EMAIL=bao.nguyen@eiu.edu.vn
```

Không commit email hoặc secret của Root Administrator vào repository nếu chưa có quyết định cụ thể.

## 4.2. Script bootstrap

Tạo script:

```text
scripts/bootstrap-personnel-security.mjs
```

Script phải:

1. Dùng Supabase service role.
2. Đọc `ROOT_ADMIN_EMAIL`.
3. Đọc `PERSONNEL_MANAGER_EMAIL`.
4. Chuẩn hóa email lowercase.
5. Tìm đúng hai profile.
6. Kiểm tra hai tài khoản khác nhau.
7. Kiểm tra cả hai đang active.
8. Kiểm tra cả hai có role `admin`.
9. Upsert duy nhất một dòng vào `system_security_principals`.
10. Không in access token hoặc service key.
11. Có chế độ dry-run.
12. Có thông báo lỗi rõ nếu không tìm thấy hoặc tìm thấy nhiều profile.

Không được tự động chọn Root Administrator theo:

```sql
order by created_at limit 1
```

## 4.3. Safe default

Nếu bảng `system_security_principals` chưa được cấu hình:

- Không tài khoản nào được truy cập trang Nhân sự.
- Các RPC quản lý nhân sự phải trả lỗi:

```text
PERSONNEL_SECURITY_NOT_CONFIGURED
```

Không fallback sang:

```text
has_role('admin')
```

## 4.4. Local seed

Local test environment phải cấu hình:

- `admin@campus.local` làm Root Administrator.
- `bao.nguyen@eiu.edu.vn` làm Personnel Manager thứ hai.

Tài khoản local Bao phải có:

```text
role = admin
is_active = true
```

---

# 5. Database authorization helpers

Tạo các helper sau.

## 5.1. Root Administrator

```sql
private.is_root_administrator()
```

Logic:

```text
auth.uid() tồn tại
AND profile active
AND có role admin
AND auth.uid() = system_security_principals.root_admin_id
```

## 5.2. Personnel Manager

```sql
private.can_manage_personnel()
```

Logic:

```text
auth.uid() tồn tại
AND profile active
AND có role admin
AND auth.uid() thuộc một trong:
  root_admin_id
  personnel_manager_id
```

## 5.3. Secondary Personnel Manager

```sql
private.is_secondary_personnel_manager()
```

Logic:

```text
auth.uid() = personnel_manager_id
AND active
AND có role admin
```

## 5.4. Target là tài khoản đặc biệt

```sql
private.is_protected_security_principal(target_profile_id uuid)
```

Trả về `true` nếu target là:

- Root Administrator.
- Personnel Manager thứ hai.

## 5.5. Target hiện đang là Admin

```sql
private.is_current_admin(target_profile_id uuid)
```

Không chỉ kiểm tra role mới trong request.

Phải kiểm tra role hiện tại trong database.

---

# 6. Ma trận quyền quản lý nhân sự

| Actor        | Target                          |              Xem |            Sửa hồ sơ | Cấp role |           Gỡ Admin |       Khóa/mở khóa |
| ------------ | ------------------------------- | ---------------: | -------------------: | -------: | -----------------: | -----------------: |
| Root         | Root                            |               Có | Chỉ thông tin cơ bản |    Không |              Không |              Không |
| Root         | Bao                             |               Có |                   Có |       Có |                 Có |                 Có |
| Root         | Admin khác                      |               Có |                   Có |       Có |                 Có |                 Có |
| Root         | Non-admin                       |               Có |                   Có |       Có |      Không áp dụng |                 Có |
| Bao          | Root                            |    Có, read-only |                Không |    Không |              Không |              Không |
| Bao          | Bao                             |    Có, read-only |  Không qua Personnel |    Không |              Không |              Không |
| Bao          | Admin khác                      |    Có, read-only |                Không |    Không |              Không |              Không |
| Bao          | Non-admin                       |               Có |                   Có |       Có |      Không áp dụng |                 Có |
| Bao          | Non-admin được nâng thành Admin | Có trước khi lưu |     Có thể cấp Admin |       Có | Sau khi lưu: không | Sau khi lưu: không |
| Admin thường | Mọi tài khoản                   |            Không |                Không |    Không |              Không |              Không |

## Quy tắc quan trọng

Personnel Manager Bao được phép nâng một non-admin thành Admin.

Nhưng nếu target đang có role Admin trước thời điểm transaction bắt đầu:

- Bao không được thay đổi target.
- Bao không được khóa target.
- Bao không được gỡ role Admin.
- Bao không được đổi scope, capability hoặc role khác của target trong cùng request.

Chỉ Root Administrator được quản lý Admin hiện hữu.

---

# 7. Thay đổi RPC `admin_update_personnel`

## 7.1. Đổi kiểm tra actor

Không dùng:

```sql
private.has_role('admin')
```

Phải dùng:

```sql
private.can_manage_personnel()
```

Nếu không đủ quyền:

```text
PERSONNEL_MANAGER_REQUIRED
```

## 7.2. Khóa cấu hình bảo mật

Đầu transaction:

```sql
select *
from public.system_security_principals
where singleton = true
for share;
```

Nếu chưa cấu hình:

```text
PERSONNEL_SECURITY_NOT_CONFIGURED
```

## 7.3. Bắt buộc tham số không NULL

Thêm validation:

```sql
if target_expected_version is null
  or target_expected_version < 1
then
  raise exception 'INVALID_PERSONNEL_VERSION'
    using errcode = '22023';
end if;

if target_is_active is null
  or target_can_import_schedules is null
  or target_allow_basic_medical_access is null
then
  raise exception 'PERSONNEL_BOOLEAN_REQUIRED'
    using errcode = '22023';
end if;
```

Không dùng `coalesce(..., false)` để biến input `NULL` thành một thay đổi quyền hợp lệ.

## 7.4. Bảo vệ Root Administrator

Nếu target là Root Administrator:

- Không được đổi `is_active`.
- Không được bỏ role Admin.
- Không được đổi role bảo mật.
- Không được đổi capability hoặc scope qua RPC này.
- Không được đổi email đăng nhập qua Personnel module.

Khuyến nghị RPC trả:

```text
ROOT_ADMIN_SECURITY_IMMUTABLE
```

Root có thể chỉnh thông tin cá nhân thông qua trang hồ sơ riêng nếu cần.

## 7.5. Bảo vệ chính actor

Nếu:

```text
target_profile_id = auth.uid()
```

không cho thay đổi qua Personnel module.

Trả:

```text
CANNOT_MANAGE_OWN_SECURITY
```

Điều này áp dụng cho cả Root và Bao.

## 7.6. Bảo vệ Admin hiện hữu

Xác định:

```text
target_was_admin
```

từ dữ liệu đã khóa trong database.

Nếu:

```text
target_was_admin = true
AND actor không phải Root Administrator
```

từ chối toàn bộ security update:

```text
ROOT_ADMIN_REQUIRED_FOR_ADMIN_ACCOUNT
```

Không chỉ kiểm tra thao tác khóa.

Điều này ngăn Personnel Manager thứ hai:

- Gỡ role Admin rồi khóa trong cùng transaction.
- Đổi scope hoặc capability của Admin.
- Thay đổi Admin thành Viewer.
- Thay đổi Admin bằng payload role mới không chứa Admin.

## 7.7. Nâng non-admin thành Admin

Nếu target trước transaction không phải Admin và target role mới có Admin:

- Root được phép.
- Bao được phép.
- Transaction thành công.
- Sau commit, target trở thành Admin hiện hữu.
- Những lần sửa security tiếp theo chỉ Root được phép.

## 7.8. Root luôn còn là Admin active

Database phải bảo đảm:

```text
Root profile is_active = true
AND root có role admin
```

Không còn cần dựa chủ yếu vào phép đếm “Admin cuối cùng”.

Có thể giữ kiểm tra `LAST_ACTIVE_ADMIN_REQUIRED` như defense-in-depth, nhưng invariant chính là Root không thể bị khóa hoặc gỡ Admin.

---

# 8. RPC liệt kê nhân sự

RPC:

```sql
public.admin_list_personnel
```

đổi kiểm tra:

```sql
private.has_role('admin')
```

thành:

```sql
private.can_manage_personnel()
```

Các Admin thông thường gọi trực tiếp phải nhận:

```text
PERSONNEL_MANAGER_REQUIRED
```

RPC có thể trả thêm metadata cho UI:

```text
is_root_administrator
is_security_principal
is_current_admin
can_edit_security
```

Hoặc server có thể tính dựa trên actor và target.

Không trả UUID cấu hình bảo mật cho client nếu không cần.

---

# 9. Server route và menu

## 9.1. Tạo context mới

Tạo:

```ts
requirePersonnelManager();
```

Không dùng `requireAdmin()` cho trang Nhân sự.

Function phải:

1. Xác thực session.
2. Gọi RPC/helper kiểm tra `can_manage_personnel`.
3. Redirect hoặc trả 403 nếu không đủ quyền.

## 9.2. Route `/admin/personnel`

Trang:

```text
/admin/personnel
```

chỉ dùng:

```ts
requirePersonnelManager();
```

Admin thông thường truy cập URL trực tiếp phải:

- Không nhìn thấy dữ liệu.
- Không render trang rồi mới ẩn nội dung.
- Nhận redirect hoặc trang 403 phù hợp.

## 9.3. Menu

Trong:

```text
components/admin-shell.tsx
```

menu Nhân sự chỉ hiển thị khi:

```text
canManagePersonnel = true
```

Không dùng:

```ts
roles.includes("admin");
```

để hiển thị menu Nhân sự.

## 9.4. Server actions

Các action sau phải dùng Personnel Manager context:

```text
savePersonnelChanges
createPersonnel
importPersonnel
```

Các action cũ còn tồn tại phải:

- Xóa hoàn toàn; hoặc
- Chuyển sang gọi RPC mới; hoặc
- Bị từ chối nếu không phải Personnel Manager.

Không để action legacy tiếp tục kiểm tra chỉ `adminContext()`.

---

# 10. Giao diện trang Nhân sự

## 10.1. Root Administrator đăng nhập

Root thấy:

- Toàn bộ nhân sự.
- Nút sửa mọi tài khoản trừ security của chính Root.
- Có thể khóa/mở khóa Admin khác.
- Có thể gỡ hoặc cấp role Admin.
- Có thể quản lý Bao.

Dòng Root Administrator hiển thị badge:

```text
Root Administrator
```

Security controls của chính Root bị disable.

Hiển thị giải thích:

```text
Tài khoản quản trị hệ thống ban đầu không thể bị khóa hoặc gỡ quyền Admin.
```

## 10.2. Bao đăng nhập

Bao thấy toàn bộ danh sách để biết trạng thái hệ thống.

Đối với:

- Root.
- Chính Bao.
- Admin hiện hữu.

nút sửa security phải:

- Ẩn; hoặc
- Chuyển thành `Xem`.
- Các field bảo mật ở trạng thái read-only.

Hiển thị giải thích:

```text
Chỉ Root Administrator được thay đổi tài khoản đang có quyền Admin.
```

Đối với non-admin:

- Cho sửa đầy đủ.
- Cho cấp role Admin.
- Cho khóa/mở khóa.
- Cho thay role, capability và scope.

## 10.3. Admin thông thường

Không thấy menu Nhân sự.

Không thấy route.

Không thể gọi action hoặc RPC.

## 10.4. Badge

Các badge đề xuất:

```text
Root Administrator
Quản lý nhân sự
Quản trị viên
```

Root có:

```text
Root Administrator
Quản trị viên
```

Bao có:

```text
Quản lý nhân sự
Quản trị viên
```

Admin khác chỉ có:

```text
Quản trị viên
```

Không lưu các badge này trong `user_roles`.

---

# 11. Tạo nhân sự

`createPersonnel` chỉ cho:

- Root.
- Bao.

Validation database vẫn phải được áp dụng.

Nếu tạo tài khoản với role Admin:

- Root được phép.
- Bao được phép.
- Tài khoản mới trở thành Admin hiện hữu.
- Sau khi tạo, Bao không còn được thay đổi security của tài khoản đó.
- Root vẫn quản lý được.

Không cho tạo thêm:

- Root Administrator.
- Personnel Manager cấp hệ thống.

Hai định danh này chỉ được cấu hình bằng bootstrap service-role.

---

# 12. Import nhân sự

## 12.1. Quyền gọi

Chỉ:

- Root.
- Bao.

được import nhân sự.

Admin thông thường gọi action hoặc RPC trực tiếp phải bị từ chối.

## 12.2. Import phải atomic

Luồng hiện tại thực hiện nhiều thao tác:

- Update profiles.
- Xóa roles.
- Xóa scopes.
- Insert roles.
- Insert scopes.
- Khóa profile cũ.

Phải chuyển thành một RPC transaction, ví dụ:

```text
public.admin_apply_personnel_import
```

RPC phải:

- Xử lý toàn bộ profile hiện hữu trong một transaction.
- Không để profile, role và scope thay đổi một phần.
- Tăng `access_version` cho mọi profile bị thay đổi.
- Rollback toàn bộ nếu một dòng thất bại.
- Trả kết quả chi tiết.

## 12.3. Bảo vệ tài khoản đặc biệt

Bulk import không được thay đổi:

- Root Administrator.
- Personnel Manager `bao.nguyen@eiu.edu.vn`.

Nếu file có hai tài khoản này:

- Bỏ qua với warning; hoặc
- Từ chối file với lỗi rõ ràng.

Phương án ưu tiên:

```text
Bỏ qua và báo warning, không thay đổi dữ liệu.
```

## 12.4. Bảo vệ Admin hiện hữu

Import không được:

- Khóa Admin hiện hữu.
- Gỡ role Admin của Admin hiện hữu.
- Thay role hoặc capability của Admin hiện hữu.
- Thay scope của Admin hiện hữu.

Điều này áp dụng ngay cả khi người import là Root.

Việc quản lý Admin hiện hữu phải được thực hiện có chủ đích trong drawer, không qua file hàng loạt.

## 12.5. Nâng non-admin thành Admin

File import do Root hoặc Bao thực hiện có thể nâng:

```text
non-admin → admin
```

Sau khi transaction hoàn tất, tài khoản đó được bảo vệ như một Admin hiện hữu.

## 12.6. Mode “thay toàn bộ”

Mode `all` không được khóa:

- Root.
- Bao.
- Bất kỳ Admin hiện hữu nào.

Chỉ những non-admin không có trong file mới có thể bị khóa.

## 12.7. Optimistic concurrency

Import thành công phải tăng:

```text
profiles.access_version
```

cho mọi profile được cập nhật.

Kết quả:

- Drawer mở trước import sẽ nhận stale-version error.
- Không ghi đè âm thầm thay đổi vừa được import.

---

# 13. HIGH-01 — Nullable RPC bypass

## Trạng thái

```text
CONFIRMED
```

## Cần sửa

Bắt buộc non-null cho:

```text
target_expected_version
target_is_active
target_can_import_schedules
target_allow_basic_medical_access
```

Không cho direct RPC truyền `NULL` để:

- Bypass stale version.
- Tự khóa actor.
- Khóa tài khoản khác.
- Biến capability thành false ngoài validation.

## Test

- Null version.
- Null active.
- Null import capability.
- Null Basic Medical capability.
- Direct RPC từ Root.
- Direct RPC từ Bao.
- Direct RPC từ Admin thường.

---

# 14. HIGH-02 — Mô hình Admin mới thay thế finding khóa lẫn nhau

Finding trước:

```text
Hai Admin có thể đồng thời loại bỏ lẫn nhau.
```

được thay bằng mô hình mạnh hơn:

- Root Administrator không thể bị khóa hoặc gỡ Admin.
- Chỉ Root được thay đổi Admin hiện hữu.
- Bao chỉ quản lý non-admin và được phép nâng non-admin thành Admin.
- Admin thông thường không truy cập Personnel.

Sau khi triển khai đúng, hệ thống luôn còn Root Administrator active.

## Test concurrency

Dù quyền đã bị thu hẹp, vẫn thêm concurrency tests:

### Bao và Root cùng sửa một non-admin

- Một transaction thành công.
- Transaction dùng version cũ nhận stale error.

### Hai session Root cùng sửa một Admin

- Optimistic concurrency hoạt động.
- Không có partial state.

### Bao cố sửa Admin trong lúc Root sửa Admin đó

- Request của Bao bị từ chối ngay bằng:
  `ROOT_ADMIN_REQUIRED_FOR_ADMIN_ACCOUNT`.

### Admin thông thường gọi direct RPC

- Từ chối bằng:
  `PERSONNEL_MANAGER_REQUIRED`.

---

# 15. HIGH-03 — Import nhân sự chưa atomic

## Trạng thái

```text
CONFIRMED
```

## Cần sửa

Tạo một database transaction cho bulk import.

Không tiếp tục:

```text
upsert profile
delete roles
delete scopes
insert roles
insert scopes
deactivate profiles
```

bằng nhiều request riêng.

Import thành công phải tăng `access_version`.

Import thất bại phải giữ nguyên toàn bộ dữ liệu trước import.

## Failure-injection test

- Role insert thất bại.
- Scope insert thất bại.
- Duplicate phone.
- Invalid Viewer combination.
- Invalid capability.
- Invalid room type.
- Lỗi giữa chừng mode `all`.

Sau lỗi:

- Profiles không đổi.
- Roles không đổi.
- Scope không đổi.
- Capability không đổi.
- Active status không đổi.
- Version không đổi.
- Root, Bao và Admin hiện hữu không bị ảnh hưởng.

---

# 16. MEDIUM-01 — Import status conflict và system_error

RPC:

```text
record_import_validation_row
```

phải chấp nhận:

```text
error
duplicate
conflict
system_error
```

Hiện execution có thể gửi `conflict` hoặc `system_error`.

Không được làm phiên import fatal chỉ vì RPC không chấp nhận status.

## Test

- Execution-time room conflict.
- Execution-time lecturer conflict.
- Simulated system error.
- Row status được ghi đúng.
- Batch kết thúc `completed_with_errors`.
- Dòng hợp lệ khác vẫn được tạo.

---

# 17. MEDIUM-02 — Giới hạn hash RPC

RPC:

```text
find_existing_import_hashes
```

phải validate:

```sql
target_hashes is not null
cardinality(target_hashes) <= 500
```

Có thể chấp nhận mảng rỗng và trả kết quả rỗng.

Không cho direct RPC gửi hàng chục nghìn hash.

## Test

- Null array.
- Empty array.
- 500 hash.
- 501 hash.
- Sai room scope.
- Không có import capability.

---

# 18. Test matrix bắt buộc

## 18.1. Menu và route

| Actor      | Menu Nhân sự | `/admin/personnel` |
| ---------- | -----------: | -----------------: |
| Root       |           Có |           Cho phép |
| Bao        |           Có |           Cho phép |
| Admin khác |        Không |       403/redirect |
| Staff      |        Không |       403/redirect |
| Lecturer   |        Không |       403/redirect |
| TA         |        Không |       403/redirect |
| Viewer     |        Không |       403/redirect |

## 18.2. RPC list và update

- Root gọi list: thành công.
- Bao gọi list: thành công.
- Admin khác gọi list: từ chối.
- Admin khác gọi update: từ chối.
- Staff gọi update: từ chối.
- Service role không bị ảnh hưởng khi thực hiện bootstrap/migration.

## 18.3. Root protections

- Root tự khóa: từ chối.
- Root tự gỡ Admin: từ chối.
- Bao sửa Root: từ chối.
- Admin thường sửa Root: từ chối.
- Import thay Root: bỏ qua hoặc từ chối có warning.
- Import `all` không khóa Root.

## 18.4. Bao protections

- Bao tự thay role: từ chối.
- Bao tự khóa: từ chối.
- Admin thường sửa Bao: từ chối.
- Import không thay đổi Bao.
- Root sửa Bao: thành công.
- Root khóa/mở Bao: thành công.

## 18.5. Existing Admin

- Root khóa Admin khác: thành công.
- Root mở khóa Admin khác: thành công.
- Root gỡ Admin khác: thành công.
- Bao khóa Admin khác: từ chối.
- Bao gỡ Admin khác: từ chối.
- Bao đổi scope Admin khác: từ chối.
- Admin khác không có quyền truy cập module.
- Bulk import không thay Admin hiện hữu.

## 18.6. Promote non-admin

- Bao nâng Staff thành Admin: thành công.
- Sau đó Bao sửa tài khoản đó lần nữa: từ chối.
- Root sửa tài khoản vừa được nâng: thành công.
- Root nâng non-admin thành Admin: thành công.

## 18.7. Atomicity và concurrency

- Hai drawer dùng cùng version.
- Drawer mở trước bulk import.
- Import failure giữa role và scope.
- Mode `all` failure.
- Root và Bao sửa cùng target.
- Null parameter direct RPC.

---

# 19. UI text đề xuất

## Admin thông thường truy cập URL trực tiếp

```text
Bạn không có quyền quản lý nhân sự.

Chức năng này chỉ dành cho Root Administrator và tài khoản quản lý nhân sự được chỉ định.
```

## Bao mở tài khoản Admin

```text
Chỉ Root Administrator được thay đổi tài khoản đang có quyền Admin.
```

## Root account

```text
Đây là tài khoản Root Administrator của hệ thống. Tài khoản này không thể bị khóa hoặc gỡ quyền Admin.
```

## Promote lên Admin

```text
Sau khi cấp quyền Quản trị viên, chỉ Root Administrator mới có thể thay đổi quyền hoặc khóa tài khoản này.
```

Nên hiển thị confirmation trước khi Bao nâng một non-admin thành Admin:

```text
Cấp quyền Quản trị viên cho [Tên nhân sự]?

Sau khi lưu, bạn sẽ không thể tiếp tục thay đổi quyền hoặc khóa tài khoản này. Chỉ Root Administrator được quản lý các Admin hiện hữu.

[Hủy] [Cấp quyền Admin]
```

---

# 20. Audit log

Bổ sung audit rõ cho:

```text
personnel.created
personnel.updated
personnel.locked
personnel.unlocked
personnel.promoted_to_admin
personnel.admin_role_removed
personnel.import_applied
personnel.import_skipped_protected_account
personnel.security_bootstrapped
```

Metadata nên có:

- Actor ID.
- Target ID.
- Actor authority:

  - `root_administrator`
  - `personnel_manager`

- Old roles.
- New roles.
- Old active state.
- New active state.
- Old version.
- New version.
- Import batch/file identifier nếu có.

Không log:

- Password.
- Access token.
- Service role key.
- Full Auth payload.

---

# 21. Files cần rà soát

Ít nhất:

```text
app/admin/personnel/page.tsx
app/admin/actions.ts
components/admin-shell.tsx
components/personnel-management-list.tsx
lib/admin.ts
lib/viewer.ts
lib/workspace-access.ts
lib/admin-catalog-template.ts
scripts/seed-local-users.ps1
scripts/import-production-directory.mjs

supabase/schemas/01_app.sql
supabase/schemas/02_room_type_scopes.sql
supabase/schemas/04_personnel_permissions.sql

supabase/migrations/20260806101257_fourth_followup_personnel_foundation.sql
supabase/migrations/20260806101259_fourth_followup_personnel_authorization.sql
supabase/migrations/20260806103321_fourth_followup_import_rpc_scope.sql

tests/local-supabase.test.mjs
tests/e2e/personnel-management.spec.ts
tests/e2e/crud-actions.spec.ts
```

Thêm:

```text
scripts/bootstrap-personnel-security.mjs
docs/PERSONNEL_SECURITY_BOOTSTRAP.md
```

---

# 22. Tài liệu triển khai

Tạo:

```text
docs/PERSONNEL_SECURITY_BOOTSTRAP.md
```

Nội dung phải gồm:

1. Chuẩn bị Root Admin email.
2. Xác minh Bao profile.
3. Xác minh cả hai có role Admin.
4. Chạy dry-run.
5. Chạy bootstrap thật.
6. Kiểm tra singleton row.
7. Kiểm tra Root truy cập được.
8. Kiểm tra Bao truy cập được.
9. Kiểm tra Admin khác bị chặn.
10. Rollback procedure.
11. Không thay đổi production trong PR này.

---

# 23. PR body và báo cáo

## PR body

Viết lại toàn bộ PR body.

Không tiếp tục append vào body cũ.

Loại bỏ thông tin lỗi thời:

- `33/33 tests`.
- Accessibility `2/2`.
- Importer là role.
- Mọi Admin quản lý nhân sự.
- Last-admin logic cũ là protection chính.

PR body mới phải ghi:

- Root Administrator model.
- Bao là Personnel Manager thứ hai.
- Admin thông thường không truy cập Personnel.
- Teaching Assistant và import capability.
- Atomic Personnel update/import.
- Current final test counts.
- Production blockers còn lại.

## Báo cáo kết quả Fifth Follow-up

Sau khi hoàn tất, tạo:

```text
docs/SAFE_REVIEW_FIFTH_FOLLOWUP_PERSONNEL_AUTHORITY_RESULT_2026-08-06.md
```

Báo cáo phải có:

- Starting HEAD.
- Code commit.
- Final HEAD.
- Migration files.
- Root bootstrap design.
- Local Root UUID/email.
- Local Personnel Manager UUID/email.
- Quyền route/menu/RPC.
- Test matrix.
- Failure-injection tests.
- Concurrency tests.
- CI run.
- Verify job.
- Finding classification.
- Finding còn mở.
- Production blockers.
- Đề xuất Draft hoặc Ready.

Không ghi secret hoặc production UUID nhạy cảm vào report nếu không cần.

---

# 24. Definition of Done

Chỉ đề xuất chuyển PR sang Ready khi:

1. Có bảng singleton xác định Root và Personnel Manager.
2. Runtime authorization dùng UUID, không dùng email hard-code.
3. Root luôn active và luôn có role Admin.
4. Root không thể tự khóa hoặc tự gỡ Admin.
5. Chỉ Root khóa/mở hoặc gỡ quyền Admin hiện hữu.
6. Bao truy cập được Personnel.
7. Bao quản lý được non-admin.
8. Bao nâng non-admin thành Admin được.
9. Bao không sửa được Admin hiện hữu sau khi nâng.
10. Admin khác không thấy menu Personnel.
11. Admin khác không truy cập được route.
12. Admin khác không gọi được list/update/import RPC.
13. Direct RPC không bypass bằng `NULL`.
14. Bulk Personnel import atomic.
15. Bulk import tăng `access_version`.
16. Bulk import bảo vệ Root, Bao và Admin hiện hữu.
17. Drawer mở trước import nhận stale-version error.
18. `conflict` và `system_error` được ghi nhận.
19. Hash RPC giới hạn tối đa 500.
20. Có direct, negative, failure-injection và concurrency tests.
21. Local seed cấu hình đúng Root và Bao.
22. Bootstrap documentation hoàn chỉnh.
23. GitHub Actions xanh trên final HEAD.
24. Báo cáo final được commit.
25. PR body được viết lại.
26. Không còn High finding mở.

---

# 25. Production blockers vẫn giữ nguyên

Ngoài follow-up này, các blocker production vẫn gồm:

1. Data lifecycle và soft-delete.
2. Environment guard cho destructive/reset operation.
3. Private Supabase Storage cho chữ ký.
4. Backfill chữ ký và signed URL.
5. Reconcile declarative schema với migration history.
6. Apps Script production redeploy và rehearsal.
7. Bootstrap chính xác Root và Bao trước khi mở production traffic.

---

# 26. Kết luận reviewer

Fourth Follow-up đã triển khai đúng phần lớn kiến trúc role, capability và giao diện nhân sự.

Tuy nhiên, với quyết định nghiệp vụ mới:

```text
REQUEST CHANGES
```

PR tiếp tục:

```text
Draft
```

Không merge.

Không deploy production.

Không redeploy Apps Script production.

Không còn quyết định nghiệp vụ nào cần chủ hệ thống chốt thêm cho Fifth Follow-up.

---

# 27. Prompt giao AI executor

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
7bcf97f62538cbef39506b6e1b2ae6d5265e75d1
```

Đọc:

```text
docs/SAFE_REVIEW_FOURTH_FOLLOWUP_PERSONNEL_2026-08-06.md
docs/SAFE_REVIEW_FOURTH_FOLLOWUP_PERSONNEL_RESULT_2026-08-06.md
docs/SAFE_REVIEW_FIFTH_FOLLOWUP_PERSONNEL_AUTHORITY_2026-08-06.md
```

Trước khi sửa:

1. Xác minh HEAD.
2. Xác minh PR vẫn Draft.
3. Không merge.
4. Không deploy production.
5. Không redeploy Apps Script.
6. Không suy đoán Root Administrator theo `created_at`.
7. Không hard-code email trong runtime authorization.

Thực hiện:

## Task 1 — Security principals

- Tạo singleton table.
- Tạo helper Root và Personnel Manager.
- Deny-by-default nếu chưa bootstrap.
- Revoke direct access.

## Task 2 — Bootstrap

- Tạo service-role script.
- Dùng `ROOT_ADMIN_EMAIL`.
- Dùng `PERSONNEL_MANAGER_EMAIL=bao.nguyen@eiu.edu.vn`.
- Local seed cấu hình Root và Bao.
- Tạo hướng dẫn bootstrap.

## Task 3 — Route/menu

- `requirePersonnelManager`.
- Ẩn menu với Admin thường.
- Chặn direct URL.
- Chặn server actions.

## Task 4 — RPC update/list

- Dùng `can_manage_personnel`.
- Validate non-null parameters.
- Root immutable.
- Không self-manage security.
- Chỉ Root quản lý Admin hiện hữu.
- Bao được nâng non-admin thành Admin.

## Task 5 — UI authority

- Badge Root/Personnel Manager.
- Read-only Admin rows khi Bao đăng nhập.
- Confirm khi promote Admin.
- Root controls cho Admin khác.
- Không dựa riêng vào client UI.

## Task 6 — Atomic import

- Một RPC transaction.
- Tăng `access_version`.
- Bảo vệ Root, Bao, existing Admin.
- Mode all không khóa Admin.
- Failure rollback hoàn toàn.

## Task 7 — Import status/hash

- Chấp nhận conflict/system_error.
- Limit hash array 500.
- Direct negative tests.

## Task 8 — Tests

- Route/menu matrix.
- Direct RPC matrix.
- Root/Bao/Admin thường.
- Promote then protected.
- Nullable bypass.
- Failure injection.
- Concurrency.
- Stale drawer after import.

## Task 9 — Documentation

- Viết lại PR body.
- Tạo Fifth result report.
- Ghi final HEAD/run/job.

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

1. Commit vào branch review.
2. Push.
3. Không merge.
4. Chờ CI final HEAD xanh.
5. Commit result report.
6. Nếu report làm đổi HEAD, chạy lại CI.
7. Cập nhật PR body và comment bàn giao.
8. Gửi reviewer:

   - Final HEAD.
   - Code commit.
   - CI run.
   - Verify job.
   - Test counts.
   - Result report.
