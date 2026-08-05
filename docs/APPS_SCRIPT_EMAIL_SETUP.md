# Gửi email bằng Google Apps Script

Luồng gửi email của MedLabs Calendar:

1. Ứng dụng ghi một dòng `email_notifications` với trạng thái `pending`.
2. Server gọi Web App Apps Script ngay sau khi nghiệp vụ lưu thành công.
3. Apps Script gửi bằng tài khoản Google đã triển khai Web App.
4. Server cập nhật `sent`; nếu Apps Script báo lỗi hoặc hết thời gian chờ thì cập nhật `failed`.
5. Admin/Chuyên viên có thể dùng nút **Gửi lại** cho từng email `failed`.

## Cài đặt Apps Script

1. Tạo một Apps Script gắn với Google Sheet và dán nội dung từ `scripts/apps-script-email-webhook.gs`.
2. Trong **Project Settings > Script Properties**, tạo `WEBHOOK_SECRET` với một chuỗi bí mật dài, ngẫu nhiên.
3. Chạy hàm `setupMedLabsEmailWebhook()` một lần và cấp quyền. Script sẽ tạo sheet `Email logs` để theo dõi lần gửi thành công, thất bại hoặc bị chặn do trùng.
4. Chọn **Deploy > New deployment > Web app**.
5. Chọn **Execute as: Me** và quyền truy cập phù hợp để Vercel gọi được Web App.
6. Sao chép URL kết thúc bằng `/exec`.

## Biến môi trường của local/Vercel

```env
EMAIL_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
EMAIL_APPS_SCRIPT_SECRET=chuoi-bi-mat-giong-script-properties
EMAIL_TEST_RECIPIENT=bao.nguyen@eiu.edu.vn
```

Không dùng `RESEND_API_KEY` nữa. Người gửi hiển thị là tên cấu hình trong payload, còn địa chỉ gửi thực tế là tài khoản Google đã triển khai Apps Script.

Vercel ký từng request bằng HMAC-SHA256 từ `EMAIL_APPS_SCRIPT_SECRET`; Apps Script chỉ nhận request có timestamp tối đa 5 phút, nonce và chữ ký hợp lệ. Secret không còn được gửi trong body. Apps Script đồng thời lưu tối đa 1.000 `dedupeKey` gần nhất trong Script Properties để lần gọi lại trong cửa sổ hợp lệ không gửi trùng. Có thể tạo thêm Script Property `TEST_EMAIL`, rồi chạy `sendMedLabsTestEmail()` để kiểm tra quyền gửi. Hạn mức gửi email vẫn phụ thuộc loại tài khoản Google triển khai script.

## Chế độ kiểm thử

Trang **Email thông báo** có ba chế độ dành riêng cho Admin:

- **Tắt gửi**: thông báo vẫn được ghi vào nhật ký nhưng được đánh dấu **Đã tắt gửi** và không gọi Apps Script. Những email này không được gửi dồn khi bật lại.
- **Kiểm thử**: thông báo vẫn được tạo theo người nhận gốc nhưng email thực tế chỉ được gửi đến `EMAIL_TEST_RECIPIENT`. Tiêu đề có tiền tố **[KIỂM THỬ]** và nội dung ghi rõ người nhận gốc. Sau khi gửi thành công, nhật ký chuyển sang trạng thái `simulated` với nhãn **Đã gửi kiểm thử**.
- **Gửi thật**: thông báo được chuyển qua Apps Script như luồng bình thường.

Trong chế độ kiểm thử, chỉ Admin được mở trang nhật ký và gửi lại email lỗi; Chuyên viên tạm thời không truy cập trang này. Các thông báo đã phát sinh trong chế độ kiểm thử không được tự động gửi cho người nhận gốc khi bật lại **Gửi thật**. Nếu không đọc được cấu hình, ứng dụng mặc định dùng chế độ kiểm thử để tránh gửi ngoài ý muốn. Production bắt buộc khai báo `EMAIL_TEST_RECIPIENT`; thiếu biến này sẽ dừng gửi thay vì tự chọn một địa chỉ cứng. Local development vẫn dùng địa chỉ test mặc định để thuận tiện kiểm thử.
