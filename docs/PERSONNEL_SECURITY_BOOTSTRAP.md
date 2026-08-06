# Bootstrap bảo mật quản lý nhân sự

Quy trình này cấu hình đúng một Root Administrator và một Personnel Manager bằng UUID. Không chạy trong PR review và không tự suy đoán Root theo ngày tạo.

## Chuẩn bị

1. Xác định chính xác email Root Administrator ban đầu.
2. Xác minh profile `bao.nguyen@eiu.edu.vn` tồn tại.
3. Xác minh cả hai profile đang hoạt động và đều có role hiển thị `Quản trị viên`.
4. Cấu hình biến môi trường trong phiên terminal an toàn:

```text
ROOT_ADMIN_EMAIL=<email-root-da-xac-minh>
PERSONNEL_MANAGER_EMAIL=bao.nguyen@eiu.edu.vn
NEXT_PUBLIC_SUPABASE_URL=<project-url>
SUPABASE_SECRET_KEY=<secret-key>
```

Không commit các giá trị production hoặc secret vào repository.

## Dry-run

```bash
npm run personnel:bootstrap -- --dry-run
```

Dry-run chỉ xác minh: mỗi email khớp đúng một profile, hai tài khoản khác nhau, đang active và có role Admin. Script không in UUID, access token hoặc service key.

## Bootstrap thật

Sau khi dry-run thành công và có phê duyệt production riêng:

```bash
npm run personnel:bootstrap
```

Script dùng service role để upsert singleton `system_security_principals` và ghi audit `personnel.security_bootstrapped`.

## Kiểm tra sau bootstrap

1. Dùng truy vấn service-role xác nhận bảng singleton có đúng một dòng.
2. Đăng nhập Root và xác nhận menu/trang Nhân sự truy cập được.
3. Đăng nhập Bao và xác nhận menu/trang Nhân sự truy cập được.
4. Đăng nhập một Admin khác và xác nhận không thấy menu, URL trực tiếp bị redirect.
5. Xác nhận Root có badge `Root Administrator`, Bao có badge `Quản lý nhân sự`.
6. Xác nhận Bao chỉ xem được các Admin hiện hữu nhưng quản lý được non-admin.

## Rollback

Rollback chỉ thực hiện bằng service role trong cửa sổ bảo trì:

1. Dừng traffic quản trị Personnel.
2. Ghi lại cấu hình hiện tại bằng kênh vận hành bảo mật.
3. Sửa singleton bằng service role theo change request đã phê duyệt. Nếu cần xóa singleton, DBA phải dùng database-owner trong cửa sổ bảo trì; service role không có quyền `DELETE`.
4. Nếu xóa singleton, hệ thống deny-by-default: không ai truy cập Personnel và RPC trả `PERSONNEL_SECURITY_NOT_CONFIGURED`.
5. Chạy lại dry-run/bootstrap với hai email đã xác minh.
6. Smoke test lại Root, Bao và Admin thường.

Không xóa role Admin hoặc khóa Root trước khi xóa cấu hình singleton; trigger database chủ động chặn thao tác này.

## Giới hạn của PR

Tài liệu và script này không thay đổi production. PR không merge `main`, không deploy web và không redeploy Apps Script production.
