# Báo cáo audit công cụ — 03/08/2026

## Phạm vi

- React Doctor 0.9.3, quét toàn bộ 70 file nguồn React/TypeScript.
- Chế độ advisory, không gửi điểm số/telemetry và không tự sửa mã nguồn.
- Bỏ qua artifact sinh tự động: `.next`, `.gitnexus`, `graphify-out`, `build`, `backups`, `node_modules` và các skill sinh bởi công cụ.
- `adminContext` được khai báo là guard xác thực tùy chỉnh vì hàm này kiểm tra phiên đăng nhập và vai trò Admin trước khi mutation.

## Kết quả React Doctor

| Mức độ            | Số lượng |
| ----------------- | -------: |
| Error             |        3 |
| Warning           |       98 |
| File bị ảnh hưởng |       28 |

Ba error đều thuộc quy tắc `server-auth-actions`:

- `createScheduleDraft` — `app/schedule-entry/new/actions.ts`
- `importScheduleRows` — `app/schedule-entry/import/actions.ts`
- `deleteClassSchedule` — `app/dashboard/actions.ts`

Kiểm tra thủ công cho thấy cả ba action hiện đều gọi `supabase.auth.getClaims()`, từ chối khi không có `sub`, rồi kiểm tra vai trò/phạm vi trước mutation. Vì guard đang viết trực tiếp trong từng action nên React Doctor chưa suy luận được đầy đủ. Đây chưa phải bằng chứng về lỗ hổng đang khai thác được, nhưng là tín hiệu nên gom logic xác thực/phân quyền thành helper có kiểu rõ ràng và kiểm thử tập trung trong một thay đổi bảo mật riêng.

Các nhóm warning lớn:

| Quy tắc                    | Số lượng | Hướng xử lý                                                                              |
| -------------------------- | -------: | ---------------------------------------------------------------------------------------- |
| Button thiếu `type`        |       46 | Bổ sung `type="button"` hoặc `type="submit"` theo ngữ cảnh; ưu tiên form tạo/xóa/import. |
| Tạo lại `Intl` formatter   |        7 | Đưa formatter bất biến lên module scope.                                                 |
| Lặp mảng nhiều lượt        |        7 | Chỉ tối ưu khi luồng có dữ liệu lớn hoặc đang chậm.                                      |
| Export không dùng          |        7 | Xác nhận không phải API dự kiến rồi mới xóa.                                             |
| Await độc lập chạy tuần tự |        6 | Đánh giá phụ thuộc dữ liệu trước khi dùng `Promise.all`.                                 |
| Component trên 300 dòng    |        3 | Chỉ tách khi sửa đúng khu vực: Dashboard, ClassRegistrationList, ImportWizard.           |
| Modal tùy chỉnh            |        3 | Đánh giá chuyển sang `<dialog>` trong một lượt accessibility riêng.                      |

Hai cảnh báo bảo mật cần xem trong đợt hardening tiếp theo nằm ở `app/auth/callback/route.ts`: dữ liệu URL tham gia luồng đặc quyền và rủi ro redirect/frame boundary. Cần kiểm tra allowlist redirect và đảm bảo mọi tham số URL không thể nâng quyền.

## Prettier

Prettier 3.9.6 và các lệnh `format`, `format:check` đã được thêm. Kiểm tra toàn kho hiện báo 66 file cũ chưa theo chuẩn Prettier. Không chạy format hàng loạt trong lượt này vì worktree đang chứa nhiều thay đổi chưa commit của người dùng; các file công cụ mới đã được format. Quy tắc tạm thời là kiểm tra file vừa sửa bằng:

```powershell
npx.cmd prettier --check <touched-files>
```

## npm audit

`npm audit` báo 9 cảnh báo mức high trong chuỗi công cụ ESLint (`minimatch`/`brace-expansion`). Không có critical và các package mới OpenSpec/React Doctor/Prettier không phải direct source của cảnh báo. Bản sửa tự động hiện yêu cầu nâng ESLint lên major 10 hoặc hạ `eslint-config-next`, có nguy cơ không tương thích Next.js 16.2; vì vậy không chạy `npm audit fix --force`.

## Thứ tự xử lý đề xuất

1. Hardening callback URL và chuẩn hóa helper xác thực/phân quyền cho server actions.
2. Bổ sung `type` cho button trong các form có mutation, kèm E2E CRUD hiện có.
3. Xử lý accessibility của modal.
4. Tách component lớn khi có yêu cầu sửa đúng khu vực, không refactor hàng loạt.
5. Chọn một thời điểm riêng để format toàn kho và tạo baseline Prettier sạch.
