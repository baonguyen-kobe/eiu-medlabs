# Bảng rà soát luồng email thông báo

Ngày lập: 04/08/2026  
Cập nhật gần nhất: 05/08/2026  
Phạm vi: bản local hiện tại của MedLabs Calendar.  
Mục đích: ghi nhận luồng email đã chốt, ánh xạ theo từng page và xác định các phần mã nguồn cần đồng bộ trước khi đưa lên production. Tài liệu chỉ nằm trong thư mục `docs`, ứng dụng không đọc hoặc hiển thị nội dung này.

## Quy ước

- **Đã có:** mã nguồn đã có đúng luồng chính; vẫn cần kiểm thử hồi quy trước khi triển khai.
- **Cần sửa:** mã nguồn đã có nhưng người nhận, tiêu đề hoặc điều kiện chưa khớp nội dung đã chốt.
- **Cần bổ sung:** mã nguồn chưa có luồng email này.
- **Cần gỡ:** mã nguồn vẫn phát sinh email nhưng đã chốt không gửi.
- `{Người đăng ký}`: họ tên người tạo phiếu hoặc lớp.
- `{Tên giảng viên}`: tên giảng viên liên quan đến lớp.
- `{Ngày học}`: định dạng `dd/mm/yyyy`.
- `{Mã môn}`: mã môn học.
- `{Mã phiếu}`: mã `YYMMDDHHMMSS`. Đối với Skills Lab, mã được sinh từ thời điểm tạo lớp.
- `{Số lịch}`: số lịch tạo thành công trong một lần import.
- `{Khoảng ngày}`: ngày bắt đầu - ngày kết thúc của phiếu Y cơ sở.
- `{Thông tin phiếu}`: `{Người đăng ký} - {Ngày học} - {Mã môn} - {Mã phiếu}`.

## 1. Lịch Skills Lab

### 1.1. Ánh xạ theo page

| Page                       | Route                    | Thao tác liên quan                                         | Email                                                     |
| -------------------------- | ------------------------ | ---------------------------------------------------------- | --------------------------------------------------------- |
| **Tạo lịch Skills lab**    | `/schedule-entry/new`    | Tạo một lớp Skills Lab thủ công                            | SL-01                                                     |
| **Import lịch Skills lab** | `/schedule-entry/import` | Import thành công một batch lịch                           | SL-02                                                     |
| **Lịch Skills lab**        | `/class-schedules`       | Giảng viên đổi ngày học; hủy nhận lớp; xóa lớp do mình tạo | SL-03; SL-04 đã bỏ; SL-05                                 |
| **Lớp của tôi**            | `/classes/mine`          | Giảng viên hủy nhận/rút khỏi lớp                           | SL-04 đã bỏ, không gửi email                              |
| **Lớp đang mở**            | `/classes/open`          | Admin/Staff chỉnh lớp, gán giảng viên hoặc xóa lớp         | Không có email riêng; Admin/Staff xóa lớp không gửi email |

### 1.2. Ma trận email đã chốt

| STT   | Trường hợp phát sinh                      | Điều kiện gửi đã chốt                                                           | Người nhận đã chốt                                                                                                                                                 | Tiêu đề email đã chốt                                                                                    | Nội dung thông báo chính                                                                       | Trạng thái code |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------- |
| SL-01 | Tạo lịch Skills Lab thủ công              | Một lịch nguồn `manual` được tạo trong loại phòng Kỹ năng Điều dưỡng            | Admin; Staff thuộc Kỹ năng Điều dưỡng; Người đăng ký; Giảng viên liên quan nếu khác Người đăng ký; Người xem thuộc Kỹ năng Điều dưỡng và được bật nhận email       | `[MedLabs Calendar] Lịch phòng Skills Lab mới của {Tên giảng viên} - {Ngày học} - {Mã môn} - {Mã phiếu}` | Người tạo; ngày và giờ học; mã/tên môn; phòng; giảng viên; số sinh viên                        | **Đã đồng bộ**  |
| SL-02 | Import lịch Skills Lab thành công         | Batch import chuyển sang Hoàn thành và có ít nhất một lịch được tạo             | Admin; Staff thuộc Kỹ năng Điều dưỡng; Người thực hiện import; toàn bộ Giảng viên liên quan trong batch; Người xem thuộc Kỹ năng Điều dưỡng và được bật nhận email | `[MedLabs Calendar] Cập nhật Lịch sử dụng phòng Skills Lab mới · {Số lịch} lịch mới`                     | Toàn bộ batch import trong cùng email; bảng hiển thị tối đa 50 lịch, phần còn lại xem trên web | **Đã đồng bộ**  |
| SL-03 | Đổi riêng ngày học                        | Ngày học thực sự thay đổi bằng chức năng đổi ngày; các nội dung khác giữ nguyên | Giảng viên 1 và 2; Admin; Staff thuộc Kỹ năng Điều dưỡng; Người đăng ký nếu khác các giảng viên; Người xem thuộc Kỹ năng Điều dưỡng và được bật nhận email         | `[MedLabs Calendar] Đổi ngày học của {Tên giảng viên} - {Mã môn} - {Ngày học} - {Mã phiếu}`              | Người thực hiện; ngày cũ và ngày mới; giờ học; môn; phòng; giảng viên; số sinh viên            | **Đã đồng bộ**  |
| SL-04 | Giảng viên hủy nhận/rút khỏi lớp          | Đã chốt không gửi email                                                         | Không có                                                                                                                                                           | Không có                                                                                                 | Người dùng xem trạng thái lớp trực tiếp trên web                                               | **Đã gỡ email** |
| SL-05 | Giảng viên xóa lớp Skills Lab do mình tạo | Lớp thuộc Kỹ năng Điều dưỡng và người xóa không phải Admin/Staff                | Admin; Staff thuộc Kỹ năng Điều dưỡng; các Giảng viên liên quan; người thực hiện                                                                                   | `[MedLabs Calendar] Giảng viên {Tên giảng viên} xóa lớp Skills Lab - {Mã môn} - {Ngày học} - {Mã phiếu}` | Người xóa; ngày/giờ; môn; phòng; giảng viên; số sinh viên của lớp trước khi xóa                | **Đã đồng bộ**  |

## 2. Phiếu thiết bị

### 2.1. Ánh xạ theo page

| Page                       | Route                 | Thao tác liên quan                                            | Email                                                    |
| -------------------------- | --------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| **Đăng ký thiết bị**       | `/equipment/register` | Tạo phiếu đúng hạn; điều chỉnh; gửi yêu cầu duyệt đăng ký trễ | TB-01; TB-02; TB-03                                      |
| **Phiếu thiết bị**         | `/equipment/requests` | Admin/Staff duyệt hoặc từ chối đăng ký trễ; xóa phiếu         | TB-04; TB-05; TB-06                                      |
| **Phiếu thiết bị của tôi** | `/equipment/mine`     | Xem phiếu và trạng thái; ký xác nhận giao/trả                 | Không gửi email khi xem, đổi trạng thái hoặc ký xác nhận |
| **Import Phiếu thiết bị**  | `/equipment/import`   | Import dữ liệu phiếu cũ                                       | Không gửi email                                          |

### 2.2. Ma trận email đã chốt

| STT   | Trường hợp phát sinh          | Điều kiện gửi đã chốt                                                                                   | Người nhận đã chốt                                                                                                                   | Tiêu đề email đã chốt                                                                                                                                                                                                                                                                                                                  | Nội dung thông báo chính                                                                                                           | Trạng thái code |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| TB-01 | Tạo phiếu thiết bị đúng hạn   | Thời gian nhận còn từ 24 giờ trở lên                                                                    | Người đăng ký; Giảng viên phụ trách nếu là người khác và email khác; toàn bộ Admin; Staff đang hoạt động và thuộc Kỹ năng Điều dưỡng | Người đăng ký: `[MedLabs Calendar][New] Xác nhận đăng ký trang thiết bị của {Thông tin phiếu}`<br>Giảng viên phụ trách: `[MedLabs Calendar][New] Phiếu thiết bị bạn phụ trách - {Thông tin phiếu}`<br>Admin/Staff: `[Admin MedLabs Calendar][New] Có đăng ký trang thiết bị mới - {Thông tin phiếu}`                                   | Xác nhận tạo phiếu; mã phiếu; lớp, học kỳ; người đăng ký; giảng viên phụ trách; thời gian nhận/trả; thiết bị theo kỹ năng; ghi chú | **Đã đồng bộ**  |
| TB-02 | Điều chỉnh phiếu              | Người đăng ký hoặc người có quyền lưu điều chỉnh; bao gồm Admin/Staff bổ sung thiết bị                  | Người đăng ký; Giảng viên phụ trách nếu khác; toàn bộ Admin; Staff đang hoạt động và thuộc Kỹ năng Điều dưỡng                        | Người đăng ký: `[MedLabs Calendar][Adjusted] Điều chỉnh phiếu đăng ký thiết bị của {Thông tin phiếu}`<br>Giảng viên phụ trách: `[MedLabs Calendar][Adjusted] Điều chỉnh phiếu thiết bị bạn phụ trách - {Thông tin phiếu}`<br>Admin/Staff: `[Admin MedLabs Calendar][Adjusted] Điều chỉnh phiếu đăng ký thiết bị của {Thông tin phiếu}` | Người thực hiện; toàn bộ nội dung phiếu và danh sách thiết bị sau điều chỉnh                                                       | **Đã đồng bộ**  |
| TB-03 | Gửi yêu cầu duyệt đăng ký trễ | Thời gian nhận trên 0 nhưng dưới 24 giờ khi tạo mới hoặc khi điều chỉnh làm phát sinh yêu cầu duyệt mới | Người đăng ký; Giảng viên phụ trách nếu khác; toàn bộ Admin; Staff đang hoạt động và thuộc Kỹ năng Điều dưỡng                        | Người đăng ký: `[MedLabs Calendar][Late] Gửi phiếu đăng ký thiết bị trễ - {Thông tin phiếu}`<br>Giảng viên phụ trách: `[MedLabs Calendar][Late] Phiếu thiết bị bạn phụ trách đăng ký trễ - {Thông tin phiếu}`<br>Admin/Staff: `[Admin MedLabs Calendar][Late] Có phiếu chờ duyệt đăng ký trễ - {Thông tin phiếu}`                      | Phiếu đang chờ duyệt; lý do đăng ký trễ; lớp; thời gian nhận/trả; người đăng ký; giảng viên phụ trách; thiết bị                    | **Đã đồng bộ**  |
| TB-04 | Duyệt đăng ký trễ             | Admin/Staff bấm duyệt yêu cầu đang chờ                                                                  | Người đăng ký; Giảng viên phụ trách nếu khác; không gửi lại nhóm Admin/Staff                                                         | Người đăng ký: `[MedLabs Calendar][Late] Đã duyệt đăng ký trễ - {Thông tin phiếu}`<br>Giảng viên phụ trách: `[MedLabs Calendar][Late] Đã duyệt phiếu đăng ký trễ bạn phụ trách - {Thông tin phiếu}`                                                                                                                                    | Người duyệt; thông báo đã duyệt; lý do đăng ký trễ; ghi chú xét duyệt nếu có; toàn bộ nội dung phiếu                               | **Đã đồng bộ**  |
| TB-05 | Từ chối đăng ký trễ           | Admin/Staff bấm từ chối yêu cầu đang chờ                                                                | Người đăng ký; Giảng viên phụ trách nếu khác; không gửi lại nhóm Admin/Staff                                                         | Người đăng ký: `[MedLabs Calendar][Late] Từ chối đăng ký trễ - {Thông tin phiếu}`<br>Giảng viên phụ trách: `[MedLabs Calendar][Late] Đã từ chối phiếu đăng ký trễ bạn phụ trách - {Thông tin phiếu}`                                                                                                                                   | Người từ chối; yêu cầu mở hệ thống để điều chỉnh/gửi lại; lý do đăng ký trễ; ghi chú xét duyệt                                     | **Đã đồng bộ**  |
| TB-06 | Xóa phiếu thiết bị            | Admin/Staff xóa phiếu thành công tại page **Phiếu thiết bị**                                            | Người đăng ký; Giảng viên phụ trách nếu khác; không gửi lại nhóm Admin/Staff                                                         | Người đăng ký: `[MedLabs Calendar][Deleted] Phiếu đăng ký thiết bị đã bị xóa - {Thông tin phiếu}`<br>Giảng viên phụ trách: `[MedLabs Calendar][Deleted] Phiếu thiết bị bạn phụ trách đã bị xóa - {Thông tin phiếu}`                                                                                                                    | Người xóa; mã phiếu; thông tin lớp; nhận/trả; danh sách thiết bị và ghi chú của phiếu trước khi xóa                                | **Đã bổ sung**  |

**Không gửi email** khi chỉ chuyển các trạng thái Mới, Đã soạn, Đã giao, Đã trả, Hoàn thành, khi lùi trạng thái hoặc khi Người đăng ký/Giảng viên phụ trách ký xác nhận giao/trả.

## 3. Tạo lịch Y cơ sở và Phiếu Y cơ sở

### 3.1. Ánh xạ theo page

| Page                           | Route                          | Thao tác liên quan                                                 | Email                                                               |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **Tạo lịch Y cơ sở**           | `/basic-medical/new`           | Tạo mới; sao chép thành phiếu mới; điều chỉnh phiếu hiện có        | YC-P01; YC-P02                                                      |
| **Phiếu Y cơ sở**              | `/basic-medical/registrations` | Xem danh sách phiếu; Admin/Staff xóa phiếu                         | YC-P03 khi xóa; xem danh sách không gửi email                       |
| **Phiếu Y cơ sở**              | `/basic-medical/registrations` | Giảng viên giảng dạy/hướng dẫn ký xác nhận buổi và báo thiết bị Hư | YC-E01 khi có số lượng Hư mới; xác nhận toàn bộ Tốt không gửi email |
| **Danh sách thiết bị Y cơ sở** | `/basic-medical/equipment`     | Xem Thiết bị, Thiết bị hư, Log; Admin/Staff điều chỉnh Tốt/Hư      | Không gửi email khi chỉ xem hoặc khi Admin/Staff điều chỉnh         |

### 3.2. Ma trận email đã chốt

| STT    | Trường hợp phát sinh                      | Điều kiện gửi đã chốt                                                                                        | Người nhận đã chốt                                                      | Tiêu đề email đã chốt                                                                                              | Nội dung thông báo chính                                                                                                                         | Trạng thái code |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| YC-P01 | Tạo hoặc sao chép thành phiếu Y cơ sở mới | Phiếu và toàn bộ buổi học được tạo thành công. Sao chép tạo ID/mã phiếu mới và dùng cùng luồng tạo mới       | Người đăng ký; Giảng viên phụ trách; toàn bộ Admin; Staff thuộc Y cơ sở | `[MedLabs Calendar] Có đăng ký phòng TNTH mới · {Người đăng ký} - {Mã môn} - {Khoảng ngày} - {Mã phiếu}`           | Người thực hiện; mã phiếu; năm học/học kỳ; khoảng ngày; môn; phòng; số sinh viên; người đăng ký; giảng viên phụ trách; ghi chú; toàn bộ buổi học | **Đã có**       |
| YC-P02 | Điều chỉnh phiếu Y cơ sở                  | Người tạo phiếu hoặc Admin/Staff lưu điều chỉnh thành công; giữ nguyên ID/mã phiếu                           | Người đăng ký; Giảng viên phụ trách; toàn bộ Admin; Staff thuộc Y cơ sở | `[MedLabs Calendar] Điều chỉnh phiếu đăng ký phòng TNTH · {Người đăng ký} - {Mã môn} - {Khoảng ngày} - {Mã phiếu}` | Người thực hiện; toàn bộ thông tin phiếu và danh sách buổi sau điều chỉnh                                                                        | **Đã có**       |
| YC-P03 | Xóa phiếu Y cơ sở                         | Admin/Staff xóa phiếu thành công tại page **Phiếu Y cơ sở**                                                  | Người đăng ký; Giảng viên phụ trách; toàn bộ Admin; Staff thuộc Y cơ sở | `[MedLabs Calendar] Xóa phiếu đăng ký phòng TNTH · {Người đăng ký} - {Mã môn} - {Khoảng ngày} - {Mã phiếu}`        | Người thực hiện; toàn bộ thông tin phiếu và danh sách buổi trước khi bị xóa                                                                      | **Đã có**       |
| YC-E01 | Thiết bị phòng được báo Hư                | Giảng viên giảng dạy/hướng dẫn ký xác nhận buổi học và có ít nhất một thiết bị với số lượng Hư mới lớn hơn 0 | Toàn bộ Admin; Staff đang hoạt động và thuộc Y cơ sở                    | `[MedLabs Calendar] Thiết bị phòng {Số phòng} {Tên phòng} được báo Hư`                                             | Phòng; ngày/giờ học; môn học; người báo hư; thời điểm xác nhận; danh sách thiết bị, số lượng Hư mới và số lượng Tốt/Hư còn lại                   | **Đã bổ sung**  |

Mỗi thao tác YC-P01/YC-P02/YC-P03 chỉ gửi một email tổng hợp theo phiếu. Không gửi thêm email tạo riêng cho từng lịch con.

## 4. Lịch Y cơ sở và Import lịch Y cơ sở

### 4.1. Ánh xạ theo page

| Page                    | Route                      | Thao tác liên quan                                                               | Email                                              |
| ----------------------- | -------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Lịch Y cơ sở**        | `/basic-medical/schedules` | Giảng viên đổi riêng ngày học; Admin/Staff sửa toàn bộ thông tin; Admin hủy lịch | YC-L03; YC-L04; YC-L05                             |
| **Import lịch Y cơ sở** | `/basic-medical/import`    | Import lịch từ file                                                              | Không gửi email; page chỉ hiển thị cho Admin/Staff |

### 4.2. Ma trận email đã chốt

| STT    | Trường hợp phát sinh                          | Điều kiện gửi đã chốt                                                   | Người nhận đã chốt                                                                                    | Tiêu đề email đã chốt                                   | Nội dung thông báo chính                                            | Trạng thái code |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- | --------------- |
| YC-L03 | Giảng viên đổi riêng ngày học                 | Giảng viên chủ lớp lưu ngày học mới; các nội dung khác giữ nguyên       | Giảng viên 1 và 2; toàn bộ Admin; Staff thuộc Y cơ sở; Người xem thuộc Y cơ sở và được bật nhận email | `[MedLabs Calendar] Đổi ngày học Y cơ sở · {Mã môn}`    | Người thực hiện; ngày cũ và ngày mới; giờ; môn; phòng; số sinh viên | **Đã đồng bộ**  |
| YC-L04 | Admin/Staff điều chỉnh toàn bộ thông tin lịch | Admin/Staff lưu thay đổi ngày, giờ, phòng, số sinh viên hoặc giảng viên | Giảng viên 1 và 2; toàn bộ Admin; Staff thuộc Y cơ sở; Người xem thuộc Y cơ sở và được bật nhận email | `[MedLabs Calendar] Điều chỉnh lịch Y cơ sở · {Mã môn}` | Người thực hiện; toàn bộ thông tin lịch sau điều chỉnh              | **Đã có**       |
| YC-L05 | Hủy lịch Y cơ sở                              | Admin hủy lịch thành công                                               | Giảng viên 1 và 2; toàn bộ Admin; Staff thuộc Y cơ sở; Người xem thuộc Y cơ sở và được bật nhận email | `[MedLabs Calendar] Hủy lịch Y cơ sở · {Mã môn}`        | Người hủy; toàn bộ thông tin lịch bị hủy                            | **Đã có**       |

Các luồng cũ sau đây đã chốt **bỏ hoàn toàn**:

- **YC-L01:** email tạo riêng từng lịch con khi tạo phiếu Y cơ sở.
- **YC-L02:** email tổng hợp sau Import lịch Y cơ sở.
- **YC-L06:** email xóa một lịch Y cơ sở từ danh sách lớp dùng chung ngoài bốn page Y cơ sở.

Mã nguồn đã gỡ trigger/action tạo YC-L01, YC-L02 và YC-L06.

## 5. Các thao tác đã chốt không gửi email

| STT  | Thao tác                                                                    | Trạng thái code/Ghi chú                                 |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| K-01 | Chuyển hoặc lùi trạng thái phiếu thiết bị                                   | Đúng: người liên quan xem trạng thái trực tiếp trên web |
| K-02 | Người đăng ký/Giảng viên phụ trách ký xác nhận Đã giao hoặc Đã trả          | Đúng: không gửi email                                   |
| K-03 | Admin/Staff xóa hoặc hủy lớp Skills Lab                                     | Đúng theo điều kiện hiện tại: không gửi email           |
| K-04 | Gán hoặc đổi giảng viên của lớp Skills Lab mà không đổi ngày                | Không gửi email                                         |
| K-05 | Giảng viên hủy nhận/rút khỏi lớp Skills Lab                                 | **Đã gỡ SL-04** trong code                              |
| K-06 | Đăng ký, hủy hoặc điều chỉnh lịch trực/ca trực                              | Không gửi email                                         |
| K-07 | Thay đổi Nhân sự, vai trò, danh mục môn học, phòng, thiết bị và mẫu ca trực | Không gửi email                                         |
| K-08 | Import phiếu thiết bị cũ                                                    | Không gửi email                                         |
| K-09 | Import lịch Y cơ sở                                                         | **Đã gỡ YC-L02**; page chỉ dành cho Admin/Staff         |
| K-10 | Tạo từng lịch con Y cơ sở từ phiếu tổng hợp                                 | **Đã gỡ YC-L01**; chỉ gửi email tổng hợp YC-P01/YC-P02  |
| K-11 | Xóa một lịch Y cơ sở từ danh sách lớp dùng chung                            | **Đã gỡ YC-L06**                                        |

## 6. Quy tắc người nhận và chế độ gửi dùng chung

| Hạng mục            | Quy tắc đã chốt                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tài khoản hoạt động | Chỉ tạo email cho hồ sơ `is_active = true`                                                                                                                                       |
| Trùng nhiều vai trò | Một địa chỉ chỉ nhận một email cho cùng sự kiện; nếu người nhận đồng thời là Admin và Người đăng ký/Giảng viên phụ trách thì ưu tiên nội dung dành cho người liên quan trực tiếp |
| Admin               | Nhận các email có nhóm Admin, không phụ thuộc phân loại phòng                                                                                                                    |
| Staff               | Chỉ nhận email thuộc loại phòng được phân công; email thiết bị chỉ gửi Staff thuộc Kỹ năng Điều dưỡng                                                                            |
| Người xem           | Chỉ nhận email lịch Skills Lab hoặc Lịch Y cơ sở đúng loại phòng khi Admin bật **Nhận email**; không nhận email Phiếu thiết bị hoặc Phiếu Y cơ sở                                |
| Role Importer       | Loại hoàn toàn khỏi mọi danh sách nhận email                                                                                                                                     |
| Chế độ `off`        | Email mới được đánh dấu `suppressed`, không gọi Apps Script                                                                                                                      |
| Chế độ `test`       | Chuyển email tới `bao.nguyen@eiu.edu.vn` hoặc `EMAIL_TEST_RECIPIENT`; thêm `[KIỂM THỬ]`; không gửi người nhận gốc                                                                |
| Chế độ `live`       | Gửi đúng người nhận qua Google Apps Script                                                                                                                                       |
| Gửi lỗi             | Chuyển trạng thái `failed`; Admin/Staff có thể bấm **Gửi lại**                                                                                                                   |
| Chống gửi trùng     | Mỗi thông báo có `dedupe_key`; database và Apps Script cùng dùng khóa này để hạn chế gửi lặp                                                                                     |

## 7. Danh sách thay đổi mã nguồn đã thực hiện

1. Đã đồng bộ SL-01/SL-02/SL-03/SL-05 theo người nhận và tiêu đề đã chốt; mã Skills Lab dùng `YYMMDDHHMMSS` từ thời điểm tạo lớp.
2. Đã gỡ hoàn toàn email SL-04 khi giảng viên hủy nhận/rút khỏi lớp.
3. Đã lọc Staff nhận email thiết bị theo loại phòng Kỹ năng Điều dưỡng.
4. Đã bổ sung Người đăng ký và Giảng viên phụ trách vào TB-03.
5. Đã chuẩn hóa toàn bộ tiền tố `[New]`, `[Adjusted]`, `[Late]` của TB-01 đến TB-05.
6. Đã bổ sung TB-06: chụp dữ liệu phiếu trước khi xóa, xóa phiếu, sau đó tạo email cho Người đăng ký/Giảng viên phụ trách.
7. Không tạo email khi đổi trạng thái hoặc ký xác nhận giao/trả phiếu thiết bị.
8. Đã gỡ YC-L01, YC-L02 và YC-L06.
9. Đã tách tiêu đề YC-L03 thành **Đổi ngày học Y cơ sở**; YC-L04 giữ **Điều chỉnh lịch Y cơ sở**.
10. Page **Import lịch Y cơ sở** đã giới hạn cho Admin/Staff và không tạo email sau import.
11. Đã loại Role Importer khỏi toàn bộ truy vấn người nhận email.
12. Đã kiểm thử nút **Gửi lại** ở chế độ `test`: 16/16 loại email được Apps Script xác nhận gửi đến `bao.nguyen@eiu.edu.vn` ngày 05/08/2026. Chế độ `off` tiếp tục được kiểm thử hồi quy; không bật `live` trong quá trình rà soát để tránh gửi người nhận thật.
13. Đã bổ sung YC-E01 cho thao tác báo Hư khi xác nhận buổi Y cơ sở; xác nhận toàn bộ Tốt và điều chỉnh tồn kho của Admin/Staff không phát sinh email.

## 8. Nguồn mã đã đối chiếu

- `components/workspace-shell.tsx`: tên page, route và quyền hiển thị sidebar.
- `components/dashboard.tsx`, `components/class-registration-list.tsx`, `components/equipment-request-list.tsx`: thao tác phát sinh từ từng page.
- `app/schedule-entry/new/actions.ts`, `app/schedule-entry/import/actions.ts`: tạo/import Skills Lab.
- `app/dashboard/actions.ts`: đổi ngày, điều chỉnh, hủy/xóa lịch và hủy nhận lớp.
- `app/equipment/actions.ts`: tạo, điều chỉnh, duyệt/từ chối, đổi trạng thái, ký và xóa phiếu thiết bị.
- `app/basic-medical/new/actions.ts`, `app/basic-medical/registrations/actions.ts`: tạo/điều chỉnh/xóa phiếu Y cơ sở.
- `lib/equipment-request-emails.ts`: người nhận và tiêu đề Phiếu thiết bị.
- `lib/basic-medical-emails.ts`: người nhận và tiêu đề Phiếu Y cơ sở.
- `lib/basic-medical-equipment-emails.ts`: người nhận, chống gửi trùng và tiêu đề báo Hư thiết bị phòng Y cơ sở.
- `lib/schedule-event-emails.ts`: hủy/xóa Skills Lab và điều chỉnh/hủy/xóa Lịch Y cơ sở.
- `lib/email-notifications.ts`: nội dung HTML/text, chế độ off/test/live và Google Apps Script.
- `supabase/schemas/02_room_type_scopes.sql`: trigger email tạo lịch thủ công, import và đổi ngày.
