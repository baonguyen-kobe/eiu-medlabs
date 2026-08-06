# Gửi email bằng Google Apps Script

Luồng gửi email của MedLabs Calendar:

1. Ứng dụng ghi một dòng `email_notifications` với trạng thái `pending`.
2. Server gọi Web App Apps Script ngay sau khi nghiệp vụ lưu thành công.
3. Apps Script gửi bằng tài khoản Google đã triển khai Web App.
4. Server cập nhật `sent`; nếu Apps Script báo lỗi trước khi gửi thì cập nhật `failed`.
5. Nếu Apps Script đã gửi nhưng database không xác nhận được, email chuyển sang `sent_unconfirmed`; trạng thái này không được gửi lại tự động và phải đối soát bằng `notification.id`/`dedupeKey`.
6. Admin/Chuyên viên chỉ dùng nút **Gửi lại** cho email `failed`.

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

Version mã nguồn hiện tại: `2026.08.06-hmac-v3`.

Vercel ký từng request bằng HMAC-SHA256 từ `EMAIL_APPS_SCRIPT_SECRET`; canonical payload là JSON array có thứ tự cố định nên không nhập nhằng khi subject/HTML chứa newline hoặc Unicode. Apps Script chỉ nhận request có timestamp tối đa 5 phút, nonce chưa từng dùng và chữ ký hợp lệ. Nonce đã dùng được lưu bằng Script Properties trong vùng `ScriptLock` và dọn sau 10 phút; gửi lại cùng nonce bị từ chối với `NONCE_REPLAY`. Secret không được gửi trong body. Apps Script đồng thời lưu tối đa 1.000 `dedupeKey` gần nhất để một request provider đã xử lý không gửi email lần hai. Log không lưu payload của request unauthorized và mọi ô được chặn spreadsheet formula injection.

## Chế độ kiểm thử

Trang **Email thông báo** có ba chế độ dành riêng cho Admin:

- **Tắt gửi**: thông báo vẫn được ghi vào nhật ký nhưng được đánh dấu **Đã tắt gửi** và không gọi Apps Script. Những email này không được gửi dồn khi bật lại.
- **Kiểm thử**: thông báo vẫn được tạo theo người nhận gốc nhưng email thực tế chỉ được gửi đến `EMAIL_TEST_RECIPIENT`. Tiêu đề có tiền tố **[KIỂM THỬ]** và nội dung ghi rõ người nhận gốc. Sau khi gửi thành công, nhật ký chuyển sang trạng thái `simulated` với nhãn **Đã gửi kiểm thử**.
- **Gửi thật**: thông báo được chuyển qua Apps Script như luồng bình thường.

Mỗi notification lưu snapshot `delivery_mode_at_enqueue`. Vì vậy email tạo trong **Kiểm thử** luôn chỉ tới địa chỉ test kể cả Admin đổi setting sang **Gửi thật**; email tạo trong **Gửi thật** không tự đổi thành email test. Chuyển sang **Tắt gửi** là emergency stop và suppress các email chưa gửi. Nếu không đọc được cấu hình, ứng dụng dùng `off`. Production bắt buộc khai báo `EMAIL_TEST_RECIPIENT`; thiếu biến này làm email Test thất bại có kiểm soát thay vì giữ vô hạn ở `processing`.

## Trình tự triển khai bằng maintenance window

Không triển khai Apps Script và application theo kiểu rolling không kiểm soát. Thực hiện đúng thứ tự:

1. Chuyển delivery mode sang `off`; chờ các dòng `processing` kết thúc hoặc đối soát.
2. Ghi lại deployment ID/version Apps Script hiện tại để rollback.
3. Deploy Apps Script `2026.08.06-hmac-v3`, chạy `setupMedLabsEmailWebhook()` và kiểm tra `doGet()` trả đúng version.
4. Áp dụng database migration, sau đó deploy application dùng cùng canonical HMAC.
5. Kiểm tra đủ ba biến môi trường, đặc biệt `EMAIL_TEST_RECIPIENT`.
6. Chuyển sang `test`; gửi một email và xác minh recipient, HMAC, nonce, dedupe và hai log DB/Sheet.
7. Chỉ chuyển `live` sau khi bước kiểm thử đạt.

Rollback: chuyển email về `off` trước, rollback application/database theo kế hoạch migration và redeploy đúng Apps Script deployment ID đã ghi. Không tự bật lại legacy body secret. Notification phát sinh trong maintenance window được suppress, không gửi dồn sau đó.
