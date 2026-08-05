# Báo cáo hardening local theo AI Góp ý 2

Ngày: 05/08/2026

Nhánh: `review/hardening-20260805`

Phạm vi: local only, chưa push GitHub, chưa deploy production.

## Kết quả chính

### Phân quyền và RLS

- Chặn Viewer/người không liên quan đổi ngày hoặc chi tiết lớp chưa có giảng viên.
- Đồng bộ ma trận quyền của `reschedule_class` và `update_class_schedule_details`.
- Thu hẹp policy đọc `profiles` về bản thân hoặc Admin; danh bạ công khai vẫn qua RPC an toàn.
- Xóa overload import cũ không còn dùng; declarative schema đã có lại RPC update details.
- Bổ sung negative regression test cho Viewer và direct RPC.

### Import và tính toàn vẹn dữ liệu

- Khóa advisory theo normalized hash ngay trong transaction của `create_import_schedule_row`.
- Hai batch cùng import một hash chỉ có đúng một batch thành công; batch còn lại nhận `23505`.
- Thay N lần gọi duplicate RPC bằng một RPC set-based `find_existing_import_hashes` cho mỗi nhóm.
- Materialize lịch trực không còn xóa ca thủ công bị chồng; cron và materialize có advisory lock.
- Test DB được cô lập và tự dọn fixture, có thể chạy lại nhiều lần.

### Email và Apps Script

- Thay secret trong body bằng chữ ký HMAC-SHA256 có timestamp và nonce.
- Apps Script từ chối request quá 5 phút, sai chữ ký hoặc replay; endpoint GET không còn lộ quota.
- Server kiểm tra lại delivery mode ngay trước khi gọi provider; chuyển sang Off sẽ chặn item đang chờ.
- Lỗi ghi nhận trạng thái sau khi provider trả thành công không còn bị bỏ qua.
- Production bắt buộc có `EMAIL_TEST_RECIPIENT`, không fallback cứng sang email cá nhân.
- Script và hướng dẫn local đã cập nhật; Apps Script đang chạy chưa thay đổi cho tới khi chủ hệ thống duyệt và redeploy.

### Phiếu thiết bị

- Tạo phiếu và toàn bộ items trong một RPC transaction; lỗi một item rollback toàn bộ phiếu.
- Validation trong DB giới hạn số item, số lượng, độ dài kỹ năng/ghi chú, scope lớp/phòng và nhân sự phụ trách.
- Bỏ đặc quyền theo email khỏi RPC; thay bằng capability `allow_early_equipment_handover` do Admin quản lý.
- Regression test bao phủ luồng kho/người nhận và quyền lùi trạng thái.

### UI, accessibility và CI

- Giữ capability matrix tập trung trong `lib/workspace-access.ts`; test role/page hiện có vẫn pass.
- Thêm axe WCAG smoke test cho trang login và dashboard, kèm regression cho skip link/bàn phím.
- Không tách đại trà component lớn trong lần hardening này vì không có lỗi hành vi cụ thể; tách theo feature khi chạm tới từng luồng.
- Thêm GitHub Actions CI: format, dependency audit, Supabase reset, seed, DB lint, ESLint, TypeScript, 33 unit/DB tests, axe smoke và production build.
- Script seed local chạy được trên Windows và Ubuntu.

## Bằng đối chiếu finding

| Nhóm         | Đã xử lý/kiểm chứng                                                      | Còn lại có chủ đích                                                                                                                 |
| ------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| SEC/RLS/AUTH | RLS-01, AUTH-01, AUTH-03, AUTH-04 (gate quan trọng), AUTH-05, AUTH-06    | SEC-01 full declarative snapshot; AUTH-02 hard-delete/ownership cần policy retention chốt trước                                     |
| IMPORT       | IMPORT-01, IMPORT-05; regression concurrency                             | IMPORT-02 batch atomic hay partial là quyết định sản phẩm; IMPORT-03 refactor preview/execute; IMPORT-04/06 chuẩn hóa rule business |
| CLASS/SHIFT  | CLASS-02/04, SHIFT-01/02/03                                              | CLASS-01 đổi tên API/docs; CLASS-03 retention/soft-delete                                                                           |
| EMAIL        | EMAIL-02/03/04/05/06; EMAIL-01 được giảm thiểu bằng HMAC + replay window | EMAIL-01 kho dedupe bền vững; EMAIL-07 quota/backoff/observability nâng cao                                                         |
| EQUIP        | EQUIP-01/02/03/06/07                                                     | EQUIP-04 chuyển chữ ký sang Storage; EQUIP-05 retention/soft-delete                                                                 |
| UI/TEST/DOC  | UI-02/03/04; TEST-01/02/03; docs Apps Script; clean migration reset      | UI-01/05 refactor theo feature; TEST-04 full declarative-schema parity                                                              |

## Các việc chưa tự động làm

1. Không deploy production, không push GitHub vì chưa được duyệt local.
2. Không chuyển chữ ký base64 cũ sang Storage: cần chốt bucket private, retention, signed URL và backfill.
3. Không đổi hard-delete thà soft-delete: ảnh hưởng báo cáo, email, FK và quy trình xóa mà người dùng đã chốt.
4. Chưa coi `supabase/schemas/*.sql` là snapshot hoàn chỉnh. Clean reset bằng migrations và DB lint đều pass, nhưng `supabase db diff --local --schema public,private` vẫn báo drift lớn do declarative files cũ không bao phủ toàn bộ migrations. Không áp diff có `DROP` vì có thể phá dữ liệu; cần một task snapshot riêng.
5. Branch protection và required CI checks chỉ bật được sau khi push workflow lên GitHub.

## Bằng chứng kiểm thử

- `npm run format:check`: pass.
- `npm audit`: 0 vulnerabilities (production và development).
- `npm run check`: pass, 33/33 tests.
- `npx playwright test tests/e2e/accessibility-smoke.spec.ts`: pass, 2/2.
- `npx supabase db lint --local --level error`: pass, 0 error.
- `npm run build`: pass, 34 route/page entries generated.
- `npx supabase db reset` + seed local: pass.
