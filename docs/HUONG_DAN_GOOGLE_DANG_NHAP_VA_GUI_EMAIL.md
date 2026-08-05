# Hướng dẫn kết nối Google đăng nhập và gửi email

Tài liệu này dùng cho hệ thống **MedLabs Calendar** đang chạy tại:

- Website production: `https://medlabs-calendar.vercel.app`
- Supabase project ref: `bwhiivfhezoozrzvchmm`
- Email được phép đăng nhập Google: `@eiu.edu.vn`

> Không ghi Client Secret, API key hoặc mật khẩu thật vào Git, file hướng dẫn hay biến có tiền tố `NEXT_PUBLIC_`.

## 1. Cách hệ thống đang kiểm soát đăng nhập

Google chỉ xác minh danh tính. Hệ thống vẫn kiểm tra quyền nội bộ theo hai điều kiện:

1. Email phải kết thúc bằng `@eiu.edu.vn`.
2. Email đó phải được Admin tạo trước trong trang **Nhân sự**, đang hoạt động và có ít nhất một vai trò.

Supabase Before User Created Hook sẽ chặn tài khoản không có trong Nhân sự trước khi tạo Auth user. Vì vậy, hãy tạo nhân sự bằng đúng email EIU trước khi cho người đó đăng nhập lần đầu.

## 2. Tạo Google OAuth Client

1. Mở [Google Auth Platform](https://console.cloud.google.com/auth/overview) và chọn/tạo Google Cloud project do EIU quản lý.
2. Trong **Branding**, khai báo tên ứng dụng `MedLabs Calendar`, email hỗ trợ và logo nếu cần.
3. Trong **Audience**:
   - Nếu Google Workspace EIU cho phép, chọn **Internal** để chỉ người dùng trong tổ chức truy cập.
   - Nếu không thấy lựa chọn Internal, chọn External/Test và thêm tài khoản thử; sau đó nhờ quản trị Google Workspace EIU phê duyệt.
4. Trong **Data Access**, giữ các scope tối thiểu: `openid`, email và profile.
5. Vào **Clients** → **Create client** → chọn **Web application**.
6. Thêm **Authorized JavaScript origins**:
   - `https://medlabs-calendar.vercel.app`
   - `http://localhost:3000` (chỉ phục vụ phát triển local)
7. Thêm **Authorized redirect URIs**:
   - Production: `https://bwhiivfhezoozrzvchmm.supabase.co/auth/v1/callback`
   - Local: `http://127.0.0.1:54321/auth/v1/callback`
8. Lưu lại **Client ID** và **Client Secret**. Không gửi hai giá trị này qua chat công khai.

Lưu ý: URI khai báo với Google là callback của **Supabase** (`/auth/v1/callback`), không phải callback của website (`/auth/callback`).

## 3. Bật Google Provider trong Supabase

1. Mở Supabase Dashboard → project `bwhiivfhezoozrzvchmm`.
2. Vào **Authentication** → **Sign In / Providers** → **Google**.
3. Bật Google provider.
4. Dán Client ID và Client Secret từ Google Cloud, sau đó lưu.
5. Vào **Authentication** → **URL Configuration**:
   - Site URL: `https://medlabs-calendar.vercel.app`
   - Redirect URLs:
     - `https://medlabs-calendar.vercel.app/auth/callback`
     - `http://localhost:3000/auth/callback`
     - `http://127.0.0.1:3000/auth/callback`

Chỉ thêm wildcard Vercel preview nếu thực sự cần thử OAuth trên preview deployment. Production nên dùng URL chính xác.

### Cấu hình Google OAuth trên local

Tạo file `.env` trong thư mục gốc dự án local và điền:

```env
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=your-google-web-client-id
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=your-google-client-secret
```

Sau đó đổi `enabled = true` tại `[auth.external.google]` trong `supabase/config.toml`, rồi khởi động lại Supabase local.

## 4. Kiểm thử Google đăng nhập

1. Đăng nhập bằng Admin nội bộ.
2. Vào **Nhân sự**, tạo một nhân sự thử với email thật `...@eiu.edu.vn`, bật hoạt động và cấp vai trò.
3. Mở cửa sổ ẩn danh, truy cập website production và chọn **Đăng nhập bằng Google**.
4. Xác nhận chuyển về `/dashboard` và sidebar đúng vai trò.
5. Kiểm thử thêm một email EIU chưa có trong Nhân sự: hệ thống phải từ chối.

## 5. Cấu hình email thông báo nghiệp vụ

MedLabs Calendar dùng Google Apps Script cho email nghiệp vụ. Ứng dụng ghi `pending`, Vercel gọi Apps Script ngay, sau đó cập nhật `sent` hoặc `failed`. Admin/Chuyên viên gửi lại email lỗi tại trang **Email thông báo**. Luồng này tách biệt với email xác thực của Supabase.

### 5.1. Triển khai Apps Script

1. Tạo Apps Script bằng tài khoản Google sẽ dùng để gửi email.
2. Dán nội dung `scripts/apps-script-email-webhook.gs`.
3. Tạo Script Property `WEBHOOK_SECRET`, chạy `setupMedLabsEmailWebhook()` một lần và cấp quyền.
4. Deploy dạng Web app, chạy với quyền của chủ sở hữu, rồi sao chép URL `/exec`.

### 5.2. Thêm biến môi trường trên Vercel

Vào Vercel → project `medlabs-calendar` → **Settings** → **Environment Variables**, thêm cho môi trường **Production**:

```env
EMAIL_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
EMAIL_APPS_SCRIPT_SECRET=chuoi-bi-mat-giong-script-properties
NEXT_PUBLIC_APP_URL=https://medlabs-calendar.vercel.app
```

Hai giá trị bí mật phải khớp chính xác. Nếu thiếu cấu hình, email được đánh dấu `failed` để Admin/Chuyên viên có thể gửi lại sau khi cấu hình xong.

### 5.3. Kiểm thử email thông báo

1. Trong **Nhân sự**, bảo đảm có Staff/Admin đang hoạt động và email nhận là email thật.
2. Tạo một lịch lớp thủ công. Kiểm tra người nhận có email thông báo.
3. Import nhiều lịch hợp lệ. Mỗi người nhận phải nhận **một email tổng hợp**, không phải mỗi lịch một email.
4. Nếu không nhận được, kiểm tra theo thứ tự:
   - Vercel deployment có đủ ba biến trên hay chưa.
   - Apps Script đang dùng đúng deployment `/exec` và đúng secret hay chưa.
   - Email Staff/Admin có đang hoạt động hay không.
   - Trang **Email thông báo** ghi `failed` và `last_error` gì; sau khi sửa cấu hình, bấm **Gửi lại**.

## 6. Cấu hình email Auth của Supabase (quên mật khẩu, mời tài khoản)

Phần này không bắt buộc cho Google OAuth, nhưng cần khi bật luồng quên mật khẩu, magic link hoặc email mời. SMTP mặc định của Supabase chỉ phù hợp thử nghiệm và bị giới hạn người nhận/tần suất.

Có thể dùng SMTP do đơn vị quản trị email EIU cung cấp:

1. Supabase Dashboard → **Authentication** → **Email/Notifications** → **SMTP Settings**.
2. Bật Custom SMTP và điền:
   - Host/Port/Username/Password: theo thông tin SMTP được cấp
   - Sender name: `MedLabs Calendar`
   - Sender email: một email được phép gửi
3. Lưu, gửi email test và kiểm tra cả Inbox lẫn Spam.
4. Thiết lập rate limit hợp lý và SPF/DKIM/DMARC theo chính sách EIU.

Khuyến nghị dùng sender/subdomain Auth riêng với email thông báo nghiệp vụ để giảm tác động chéo nếu uy tín gửi của một luồng bị giảm.

## 7. Checklist nghiệm thu

- [ ] Google OAuth Client là loại Web application.
- [ ] Google redirect URI trỏ tới Supabase `/auth/v1/callback`.
- [ ] Google provider đã bật trong Supabase.
- [ ] Supabase Site URL và Redirect URLs đúng production/local.
- [ ] Email EIU thử đã được tạo trước trong Nhân sự và có vai trò.
- [ ] Email EIU chưa được tạo bị từ chối.
- [ ] Apps Script Web App đã deploy và có `WEBHOOK_SECRET`.
- [ ] Vercel Production có `EMAIL_APPS_SCRIPT_URL`, `EMAIL_APPS_SCRIPT_SECRET`, `NEXT_PUBLIC_APP_URL`.
- [ ] Tạo lịch thủ công gửi email cho Staff/Admin.
- [ ] Import nhiều lịch gửi một email tổng hợp cho mỗi người nhận.

## 8. Tài liệu chính thức

- [Supabase: Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase: Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase: Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook)
- [Supabase: Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Google Apps Script: Web Apps](https://developers.google.com/apps-script/guides/web)
- [Google Apps Script: MailApp](https://developers.google.com/apps-script/reference/mail/mail-app)
