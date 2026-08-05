## Why

Trang Tạo lịch Y cơ sở hiện chỉ tạo phiếu mới, trong khi người dùng cần điều chỉnh phiếu đã gửi hoặc sao chép một phiếu cũ để tái sử dụng nội dung. Đồng thời, một phiếu Y cơ sở tạo nhiều lịch con nên email cấp phiếu và email cấp lịch đang có nguy cơ thông báo trùng cho cùng một thao tác.

## What Changes

- Bổ sung hai chế độ “Điều chỉnh phiếu” và “Sao chép phiếu” trên trang Tạo lịch Y cơ sở, cùng bố cục và nguyên tắc với trang Đăng ký thiết bị.
- Điều chỉnh giữ nguyên ID/mã phiếu và người đăng ký; người tạo phiếu hoặc admin/staff được phép thực hiện.
- Sao chép nhận mã phiếu 12 chữ số, giữ phiếu nguồn nguyên vẹn, nạp lại nội dung và tạo một phiếu có ID/mã mới khi gửi.
- Ghi phiếu cùng toàn bộ lịch con trong một transaction database; nếu một buổi lỗi hoặc trùng lịch thì không thay đổi dở dang dữ liệu.
- Chỉ gửi email tổng hợp cấp phiếu cho thao tác tạo/điều chỉnh/sao chép phiếu Y cơ sở. Email cấp lịch Y cơ sở chỉ áp dụng cho lịch được tạo, import hoặc điều chỉnh độc lập ngoài luồng phiếu.

## Capabilities

### New Capabilities

- `basic-medical-registration-edit-copy`: Điều chỉnh và sao chép phiếu Y cơ sở nhiều buổi, có phân quyền và lưu dữ liệu nguyên tử.

### Modified Capabilities

Không có.

## Impact

- Trang và biểu mẫu `basic-medical/new`, Server Actions và helper mã phiếu.
- Declarative schema Supabase và migration cho RPC lưu phiếu nhiều buổi.
- Trigger xếp email lịch thủ công được bỏ qua có chủ đích khi lịch được sinh trong transaction của phiếu Y cơ sở.
- Nội dung ma trận rà soát email được làm rõ phạm vi giữa mục Phiếu Y cơ sở và Lịch Y cơ sở.
