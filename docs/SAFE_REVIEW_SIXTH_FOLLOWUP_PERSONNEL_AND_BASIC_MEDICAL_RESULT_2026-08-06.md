# Safe Review — Sixth Follow-up Result: Personnel và Y cơ sở

Ngày hoàn tất local: 06/08/2026  
Branch: `review/hardening-20260805`  
Starting HEAD: `664ebc93b64ef9bd326d2a6f1eabc0d4e2d70242`  
Implementation commit: `dc0eda4c46cb3dbf31bd32eaee0f0b3889bf904e`  
Final HEAD: commit chứa báo cáo này; hash chính xác được ghi trong PR #1 và bàn giao cuối.  
Trạng thái đề xuất: giữ PR ở **Draft** cho đến khi CI của final HEAD xanh.

## 1. Giới hạn thực hiện

Chỉ thay đổi branch review. Không merge `main`, không deploy Vercel production, không chạy migration production và không redeploy Apps Script production.

## 2. Phân loại và kết quả Personnel

| Finding                                  | Tái hiện    | Kết quả                                   | Bằng chứng                                                                                                                                                                 |
| ---------------------------------------- | ----------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-HIGH-01 — race đổi email               | `CONFIRMED` | `FIXED`                                   | Thêm reservation `begin/commit/cancel`; stale writer không chạm Auth; integration test hai email đồng thời xác nhận chỉ một winner và `auth.users.email = profiles.email`. |
| P-MEDIUM-01 — bỏ qua lỗi cleanup Auth    | `CONFIRMED` | `FIXED`, còn cần chaos test provider thực | Cleanup tuần tự, retry hai lần, khóa profile còn sót, ghi reconciliation và trả `AUTH_PROFILE_RECONCILIATION_REQUIRED`.                                                    |
| P-MEDIUM-02 — danh sách giữ state cũ     | `CONFIRMED` | `FIXED`                                   | Component được remount theo page/filter/dataset version; drawer cũ không tồn tại sau dataset server thay đổi.                                                              |
| P-LOW-01 — đếm protected rows            | `CONFIRMED` | `FIXED`                                   | Kết quả hiển thị cộng cả protected rows đã lọc trước RPC.                                                                                                                  |
| P-LOW-02 — UI quyền Y cơ sở không hợp lệ | `CONFIRMED` | `FIXED`                                   | Cả drawer và form tạo mới tự clear/disable nếu thiếu role Lecturer/TA hoặc scope Y cơ sở; DB vẫn là nguồn xác thực cuối.                                                   |

Bulk import cũng bị chặn khi target đang có reservation cập nhật nhân sự, tránh đường ghi cạnh tranh với luồng đổi email.

## 3. Phân loại và kết quả Y cơ sở

| Finding                                         | Tái hiện    | Kết quả           | Bằng chứng                                                                                                                                                                      |
| ----------------------------------------------- | ----------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BM-HIGH-01 — migration runtime còn Importer     | `CONFIRMED` | `FIXED`           | Migration mới thay bằng Teaching Assistant; pgTAP kiểm tra function runtime không còn `importer`.                                                                               |
| BM-HIGH-02 — Staff sai scope vẫn quản lý        | `CONFIRMED` | `FIXED`           | `private.can_manage_basic_medical()` dùng thống nhất ở route, menu, action, RPC và RLS; negative integration/E2E đều xanh.                                                      |
| BM-HIGH-03 — direct inventory write bỏ log      | `CONFIRMED` | `FIXED`           | Thu hồi INSERT/UPDATE/DELETE trực tiếp; mutation chỉ qua RPC scoped; pgTAP kiểm tra privilege.                                                                                  |
| BM-HIGH-04 — base64 chữ ký đọc rộng             | `CONFIRMED` | `FIXED trước mắt` | Thu hồi table SELECT và chỉ grant các cột metadata, không grant `signature_data`; RLS chỉ cho signer/người liên quan/scoped manager. Private Storage vẫn là blocker production. |
| BM-HIGH-05 — xác định Lecturer bằng title       | `CONFIRMED` | `FIXED`           | Instructor list và save RPC xác minh `user_roles.role = lecturer`; title spoof test bị loại.                                                                                    |
| BM-MEDIUM-01 — reuse schedule cancelled         | `CONFIRMED` | `FIXED`           | Chỉ reuse schedule có `schedule_status = published`.                                                                                                                            |
| BM-MEDIUM-02 — viewer nhận toàn bộ room type    | `CONFIRMED` | `FIXED`           | Admin nhận master scope; non-admin chỉ nhận `profile_room_types`.                                                                                                               |
| BM-MEDIUM-03 — ký trước khi xem thiết bị        | `CONFIRMED` | `FIXED`           | Modal bắt đầu tại bước tình trạng thiết bị, sau đó mới sang chữ ký.                                                                                                             |
| BM-MEDIUM-04 — inventory client cũ sau xác nhận | `CONFIRMED` | `FIXED`           | Sau xác nhận thành công gọi `router.refresh()`.                                                                                                                                 |
| BM-MEDIUM-05 — tải 5.000 dòng mọi tab           | `CONFIRMED` | `FIXED`           | Chỉ query tab đang mở; filter/page ở server; tối đa 50 dòng và `count: exact`.                                                                                                  |
| BM-MEDIUM-06 — mã timestamp trùng               | `CONFIRMED` | `FIXED`           | `registration_code` DB unique dạng `YC-YYMMDD-######`; lookup/copy/email dùng code lưu trong DB.                                                                                |
| BM-LOW-01 — cho phép room/catalog inactive      | `CONFIRMED` | `FIXED`           | RPC tạo phân bổ mới bắt buộc room và catalog active; dữ liệu lịch sử vẫn đọc được.                                                                                              |

View danh sách phiếu được bổ sung `registration_code` và đưa code vào `search_text`. Migration mới và declarative schema là hai bản giống nhau.

## 4. Kiểm tra thực tế tại implementation commit

| Kiểm tra                                       | Kết quả                                                  |
| ---------------------------------------------- | -------------------------------------------------------- |
| Clean `supabase db reset --local`              | PASS — toàn bộ migration history và seed SQL             |
| Local personnel/demo seed                      | PASS                                                     |
| `npm run format:check`                         | PASS                                                     |
| `npm run check`                                | PASS — lint, typecheck, **59/59 Node/integration tests** |
| `npm run test:db`                              | PASS — **34/34 pgTAP assertions**, 2 files               |
| `npm run test:e2e:critical`                    | PASS — **21/21 Chromium E2E**                            |
| `npm run build`                                | PASS — Next.js production build                          |
| `git diff --check`                             | PASS                                                     |
| `supabase db lint --local`                     | PASS — không có schema error                             |
| `supabase db advisors --local --type security` | PASS — không có security advisor finding                 |

Performance advisor còn cảnh báo `multiple_permissive_policies` ở một số bảng cũ và ba bảng Y cơ sở. Đây là cảnh báo tối ưu policy evaluation, không mở rộng quyền; được giữ lại để refactor riêng thay vì gộp mù trong security follow-up.

## 5. Test mới

- Concurrent personnel email reservation với hai email khác nhau.
- Đối chiếu email cuối giữa Supabase Auth và `profiles`.
- Staff chỉ Nursing Skills bị chặn direct table và inventory RPC Y cơ sở.
- Title `Giảng viên` nhưng role Viewer không xuất hiện trong instructor list.
- pgTAP kiểm tra Importer drift, manager scope, cancelled schedule, role Lecturer, direct-write grants, signature column privacy và unique registration code.
- E2E xác nhận Staff ngoài scope không thấy menu và bị redirect khi mở URL trực tiếp.
- Test lịch trực được đổi khỏi giả định thời gian dễ lỗi quanh nửa đêm, vẫn kiểm tra đúng việc không tái tạo lịch quá khứ.

## 6. Finding còn mở / production blockers

Không còn High finding mở trong phạm vi Sixth Follow-up ở code local.

Các việc cố ý chưa thực hiện vì là bước production hoặc ngoài phạm vi:

1. Chuyển chữ ký base64 hiện hữu sang private Supabase Storage, backfill, hash/MIME/size và signed URL trước production.
2. Chaos/failure-injection ở cấp provider thật cho Auth cleanup; code đã có retry, khóa tài khoản và reconciliation nhưng test tự động hiện chỉ kiểm tra đường concurrency chính.
3. Refactor các permissive SELECT policies để giảm cảnh báo performance advisor.
4. Chạy bootstrap/migration/rehearsal trên production chỉ sau phê duyệt riêng.

## 7. Graphify và local

Đã chạy `graphify update .`. Graph được cập nhật; công cụ cảnh báo các file SQL chưa được AST parse vì máy local chưa cài optional dependency `tree_sitter_sql`, nên quan hệ TypeScript/TSX đã cập nhật còn SQL vẫn được kiểm tra bằng reset, pgTAP, lint và direct inspection.

Local Supabase đã reset + seed lại và `http://127.0.0.1:3000/login` vẫn được giữ hoạt động để kiểm thử.

## 8. CI và PR

Sau khi push commit báo cáo, PR #1 phải giữ Draft. Chỉ đề xuất Ready for review khi GitHub Actions của final HEAD xanh; link run/job và final HEAD được cập nhật trong PR comment và bàn giao cuối.
