import { spawnSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

function localSql(sql: string) {
  const listed = spawnSync(
    "docker",
    [
      "ps",
      "--filter",
      "label=com.supabase.cli.project=lich-truc-app",
      "--format",
      "{{.Names}}",
    ],
    { encoding: "utf8" },
  );
  const databases = listed.stdout
    .split(/\r?\n/)
    .filter((name) => name.startsWith("supabase_db_"));
  if (listed.status !== 0 || databases.length !== 1) {
    throw new Error("REFUSING_AMBIGUOUS_LOCAL_SUPABASE_DATABASE");
  }
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      databases[0],
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: sql, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "LOCAL_SQL_FAILED");
  }
  return result.stdout.trim();
}

async function loginAsAdmin(page: Page) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const testSuffix = "CANC_TEST";
const courseCode = "MED-CANC-99";
const cancelReasonText = "Điều chỉnh chương trình đào tạo học kỳ mới";

const ids = {
  course: "11111111-c000-4000-a000-000000000001",
  room: "22222222-b000-4000-a000-000000000002",
  registration1: "33333333-b000-4000-a000-000000000003",
  schedule1: "44444444-e000-4000-a000-000000000004",
  schedule2: "44444444-e000-4000-a000-000000000005",
  session1: "55555555-e000-4000-a000-000000000006",
  session2: "55555555-e000-4000-a000-000000000007",
  confirmation2: "66666666-f000-4000-a000-000000000008",
  registration2: "33333333-b000-4000-a000-000000000009",
  schedule3: "44444444-e000-4000-a000-000000000010",
  session3: "55555555-e000-4000-a000-000000000011",
};

test.describe("Cancellation Dialog & UI Hardening E2E", () => {
  test.beforeAll(async () => {
    const adminId = localSql(
      "select id from public.profiles where email = 'admin@campus.local' limit 1;",
    );
    const lecturerId = localSql(
      "select id from public.profiles where email = 'giangvien@campus.local' limit 1;",
    );

    localSql(`
      begin;
      select set_config('app.basic_medical_registration_mutation', 'true', true);

      delete from public.basic_medical_session_confirmations where id = '${ids.confirmation2}';
      delete from public.basic_medical_registration_sessions where id in ('${ids.session1}', '${ids.session2}', '${ids.session3}');
      delete from public.class_schedules where id in ('${ids.schedule1}', '${ids.schedule2}', '${ids.schedule3}');
      delete from public.basic_medical_registrations where id in ('${ids.registration1}', '${ids.registration2}');
      delete from public.rooms where id = '${ids.room}';
      delete from public.courses where id = '${ids.course}';

      insert into public.courses (id, course_code, course_name, room_type_id, is_active)
      select '${ids.course}', '${courseCode}', 'BM Typing & Geometry Test', id, true
      from public.room_types where code = 'basic_medical';

      insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity, is_active)
      select '${ids.room}', 'R-TYP', 'E2E', 'Typing Room ${testSuffix}', id, 20, true
      from public.room_types where code = 'basic_medical';

      -- Registration 1: Active with 2 sessions (session 1 unconfirmed, session 2 confirmed)
      insert into public.basic_medical_registrations
        (id, academic_year, semester, start_date, end_date, course_id, room_id, student_count,
         registrant_id, responsible_lecturer_id, created_by)
      values ('${ids.registration1}', '2048-2049', 'HK1', '2048-11-10', '2048-11-12', '${ids.course}',
        '${ids.room}', 20, '${adminId}', '${lecturerId}', '${adminId}');

      insert into public.class_schedules
        (id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date,
         start_time, end_time, source, schedule_status, student_count, basic_medical_registration_id,
         created_by, published_by, published_at)
      values
        ('${ids.schedule1}', '${ids.course}', '${courseCode}', 'Typing Session 1', '${ids.room}', '${lecturerId}', '2048-11-10', '07:30', '11:30', 'manual', 'published', 20, '${ids.registration1}', '${adminId}', '${adminId}', clock_timestamp()),
        ('${ids.schedule2}', '${ids.course}', '${courseCode}', 'Typing Session 2', '${ids.room}', '${lecturerId}', '2048-11-12', '13:30', '16:30', 'manual', 'published', 20, '${ids.registration1}', '${adminId}', '${adminId}', clock_timestamp());

      insert into public.basic_medical_registration_sessions
        (id, registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
      values
        ('${ids.session1}', '${ids.registration1}', '${ids.schedule1}', 'Lesson 1 Unconfirmed', '${lecturerId}', 1),
        ('${ids.session2}', '${ids.registration1}', '${ids.schedule2}', 'Lesson 2 Confirmed', '${lecturerId}', 2);

      -- Confirmation for Session 2
      insert into public.basic_medical_session_confirmations
        (id, session_id, registration_id_snapshot, class_schedule_id_snapshot, signer_id,
         signature_data, schedule_date_snapshot, start_time_snapshot, end_time_snapshot,
         room_id_snapshot, teaching_lecturer_id_snapshot, signed_at)
      values
        ('${ids.confirmation2}', '${ids.session2}', '${ids.registration1}', '${ids.schedule2}', '${adminId}',
         'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' || repeat('A', 80),
         '2048-11-12', '13:30', '16:30', '${ids.room}', '${lecturerId}', clock_timestamp());

      -- Registration 2: Cancelled registration with cancellation reason
      insert into public.basic_medical_registrations
        (id, academic_year, semester, start_date, end_date, course_id, room_id, student_count,
         registrant_id, responsible_lecturer_id, created_by, cancelled_at, cancel_reason)
      values ('${ids.registration2}', '2048-2049', 'HK1', '2048-11-20', '2048-11-20', '${ids.course}',
        '${ids.room}', 18, '${adminId}', '${lecturerId}', '${adminId}', '2048-11-05 08:30:00+07', '${cancelReasonText}');

      insert into public.class_schedules
        (id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date,
         start_time, end_time, source, schedule_status, student_count, basic_medical_registration_id,
         created_by, published_by, published_at, cancelled_at, cancelled_by)
      values
        ('${ids.schedule3}', '${ids.course}', '${courseCode}', 'Cancelled Session', '${ids.room}', '${lecturerId}', '2048-11-20', '07:30', '11:30', 'manual', 'cancelled', 18, '${ids.registration2}', '${adminId}', '${adminId}', clock_timestamp(), '2048-11-05 08:30:00+07', '${adminId}');

      insert into public.basic_medical_registration_sessions
        (id, registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
      values
        ('${ids.session3}', '${ids.registration2}', '${ids.schedule3}', 'Lesson Cancelled', '${lecturerId}', 1);

      commit;
    `);
  });

  test.afterAll(async () => {
    localSql(`
      begin;
      select set_config('app.basic_medical_registration_mutation', 'true', true);
      delete from public.basic_medical_session_confirmations where id = '${ids.confirmation2}';
      delete from public.basic_medical_registration_sessions where id in ('${ids.session1}', '${ids.session2}', '${ids.session3}');
      delete from public.class_schedules where id in ('${ids.schedule1}', '${ids.schedule2}', '${ids.schedule3}');
      delete from public.basic_medical_registrations where id in ('${ids.registration1}', '${ids.registration2}');
      delete from public.rooms where id = '${ids.room}';
      delete from public.courses where id = '${ids.course}';
      commit;
    `);
  });

  test("1. ConfirmDialog is portalled to document.body, satisfies viewport geometry across viewports, and handles Escape/Cancel", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/basic-medical/registrations?status=all");

    // Expand the active test registration
    const regRow = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: courseCode })
      .filter({ hasNotText: "Đã hủy" })
      .first();
    await expect(regRow).toBeVisible({ timeout: 10_000 });
    await regRow.click();

    const detailRow = page.locator("tr.equipment-request-detail-row").first();
    await expect(detailRow).toBeVisible();

    // Click 'Hủy lớp' on session 1 to trigger ConfirmDialog
    const cancelSessionBtn = detailRow
      .locator("button.button-danger.basic-medical-confirm-button")
      .first();
    await expect(cancelSessionBtn).toBeVisible();
    await cancelSessionBtn.click();

    // Verify confirm dialog exists and is rendered inside body > .confirm-dialog-layer
    const dialogLayer = page.locator("body > .confirm-dialog-layer");
    await expect(dialogLayer).toBeVisible();

    const backdrop = dialogLayer.locator(".confirm-dialog-backdrop");
    await expect(backdrop).toBeVisible();

    const dialog = dialogLayer.locator('section.confirm-dialog[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    // A. Desktop viewport geometry verification (1280x720)
    await page.setViewportSize({ width: 1280, height: 720 });
    let box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
    expect(box!.y + box!.height).toBeLessThanOrEqual(720);

    // B. Short-height viewport verification (1280x420)
    await page.setViewportSize({ width: 1280, height: 420 });
    box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
    expect(box!.y + box!.height).toBeLessThanOrEqual(420);
    await expect(dialog).toBeVisible();

    // C. Narrow/mobile-like viewport verification (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(box!.y + box!.height).toBeLessThanOrEqual(667);
    await expect(dialog).toBeVisible();

    // Reset viewport size to desktop
    await page.setViewportSize({ width: 1280, height: 720 });

    // D. Escape key dismisses dialog and unmounts portal
    await page.keyboard.press("Escape");
    await expect(dialogLayer).toHaveCount(0);
  });

  test("2. Sequential keystroke typing does not lose focus in Basic Medical session cancellation textarea/inputs", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/basic-medical/registrations?status=all");

    // Expand the active test registration
    const regRow = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: courseCode })
      .filter({ hasNotText: "Đã hủy" })
      .first();
    await expect(regRow).toBeVisible({ timeout: 10_000 });
    await regRow.click();

    const detailRow = page.locator("tr.equipment-request-detail-row").first();
    await expect(detailRow).toBeVisible();

    // Click 'Hủy lớp' on session 1
    const cancelSessionBtn = detailRow
      .locator("button.button-danger.basic-medical-confirm-button")
      .first();
    await expect(cancelSessionBtn).toBeVisible();
    await cancelSessionBtn.click();

    const dialogLayer = page.locator("body > .confirm-dialog-layer");
    await expect(dialogLayer).toBeVisible();

    const dialog = dialogLayer.locator('section.confirm-dialog[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Hủy buổi học Y cơ sở?" }),
    ).toBeVisible();

    const reasonInput = dialog.locator(
      'label:has-text("Lý do hủy buổi học *") input',
    );
    await expect(reasonInput).toBeVisible();
    await expect(reasonInput).toHaveAttribute(
      "placeholder",
      "Nhập lý do bắt buộc",
    );

    // Focus input and type multi-word Vietnamese sentence sequentially character-by-character
    const vietnameseSentence = "Điều chỉnh lịch học theo yêu cầu Bộ môn";
    await reasonInput.focus();
    await expect(reasonInput).toBeFocused();

    // Type character by character with pressSequentially
    await reasonInput.pressSequentially(vietnameseSentence, { delay: 15 });

    // Assert:
    // 1. Input remains focused after typing
    await expect(reasonInput).toBeFocused();
    // 2. Full final string is present without dropped characters
    await expect(reasonInput).toHaveValue(vietnameseSentence);
    // 3. Focus did NOT jump to 'Quay lại' button
    const backBtn = dialog.getByRole("button", {
      name: "Quay lại",
      exact: true,
    });
    await expect(backBtn).not.toBeFocused();
    // 4. Dialog stays open until explicitly closed
    await expect(dialog).toBeVisible();

    // Close modal via 'Quay lại' button
    await backBtn.click();
    await expect(dialogLayer).toHaveCount(0);
  });

  test("3. Sequential keystroke typing does not lose focus in Invalidation reason input", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/basic-medical/registrations?status=all");

    // Expand the active test registration
    const regRow = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: courseCode })
      .filter({ hasNotText: "Đã hủy" })
      .first();
    await expect(regRow).toBeVisible({ timeout: 10_000 });
    await regRow.click();

    const detailRow = page.locator("tr.equipment-request-detail-row").first();
    await expect(detailRow).toBeVisible();

    // Session 2 is confirmed -> click 'Vô hiệu hóa xác nhận'
    const invalidateBtn = detailRow
      .getByRole("button", { name: "Vô hiệu hóa xác nhận", exact: true })
      .first();
    await expect(invalidateBtn).toBeVisible();
    await invalidateBtn.click();

    const dialogLayer = page.locator("body > .confirm-dialog-layer");
    await expect(dialogLayer).toBeVisible();

    const dialog = dialogLayer.locator('section.confirm-dialog[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Vô hiệu hóa xác nhận buổi học?" }),
    ).toBeVisible();

    const invalidationInput = dialog.locator(
      'label:has-text("Lý do vô hiệu hóa *") input',
    );
    await expect(invalidationInput).toBeVisible();

    // Focus input and sequentially type multi-word Vietnamese reason
    const invalidationReason =
      "Vô hiệu hóa do sai lệch thông tin thiết bị thực tế";
    await invalidationInput.focus();
    await expect(invalidationInput).toBeFocused();

    await invalidationInput.pressSequentially(invalidationReason, {
      delay: 15,
    });

    // Assert:
    // 1. Full value preserved
    await expect(invalidationInput).toHaveValue(invalidationReason);
    // 2. Focus retained on input
    await expect(invalidationInput).toBeFocused();
    // 3. Dialog stays open
    await expect(dialog).toBeVisible();

    // Close modal via 'Quay lại'
    const backBtn = dialog.getByRole("button", {
      name: "Quay lại",
      exact: true,
    });
    await backBtn.click();
    await expect(dialogLayer).toHaveCount(0);
  });

  test("4. Cancelled registration detail history geometry aligns under header tracks on real rendered DOM", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/basic-medical/registrations?status=all");

    // Locate the cancelled registration row
    const regRows = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: courseCode });
    await expect(regRows.first()).toBeVisible({ timeout: 10_000 });

    // Locate the cancelled registration row with status 'Đã hủy'
    const cancelledRow = regRows.filter({ hasText: "Đã hủy" }).first();
    await expect(cancelledRow).toBeVisible({ timeout: 10_000 });
    await cancelledRow.click();

    const detailRow = page.locator("tr.equipment-request-detail-row").first();
    await expect(detailRow).toBeVisible();

    // Find the real rendered .basic-medical-registration-detail-history block
    const historyBlock = detailRow.locator(
      ".basic-medical-registration-detail-history",
    );
    await expect(historyBlock).toBeVisible();

    // Column 1 block contains 'Thời điểm hủy'
    const cancelTimeBlock = historyBlock.locator("> div").first();
    await expect(cancelTimeBlock).toBeVisible();
    await expect(cancelTimeBlock.locator("span")).toHaveText("Thời điểm hủy");

    // Column 2 block contains 'Lý do hủy'
    const cancelReasonBlock = historyBlock.locator("> div").last();
    await expect(cancelReasonBlock).toBeVisible();
    await expect(cancelReasonBlock.locator("span")).toHaveText("Lý do hủy");
    await expect(cancelReasonBlock.locator("strong")).toHaveText(
      cancelReasonText,
    );

    // Measure real bounding boxes
    const historyBox = await historyBlock.boundingBox();
    const cancelTimeBox = await cancelTimeBlock.boundingBox();
    const cancelReasonBox = await cancelReasonBlock.boundingBox();

    const codeColBox = await detailRow
      .locator(".basic-medical-registration-detail-code")
      .boundingBox();
    const registrantColBox = await detailRow
      .locator(".basic-medical-registration-detail-registrant")
      .boundingBox();

    expect(historyBox).not.toBeNull();
    expect(cancelTimeBox).not.toBeNull();
    expect(cancelReasonBox).not.toBeNull();
    expect(codeColBox).not.toBeNull();
    expect(registrantColBox).not.toBeNull();

    if (
      historyBox &&
      cancelTimeBox &&
      cancelReasonBox &&
      codeColBox &&
      registrantColBox
    ) {
      // 1. 'Thời điểm hủy' is in Track 1 (aligned with column 1 / Mã phiếu)
      expect(Math.abs(cancelTimeBox.x - codeColBox.x)).toBeLessThanOrEqual(4);

      // 2. 'Lý do hủy' is in Track 2 (aligned with column 2 / Người đăng ký / Thời gian đăng ký)
      expect(
        Math.abs(cancelReasonBox.x - registrantColBox.x),
      ).toBeLessThanOrEqual(4);

      // 3. Track 2 is strictly to the right of Track 1
      expect(cancelReasonBox.x).toBeGreaterThan(
        cancelTimeBox.x + cancelTimeBox.width - 5,
      );

      // 4. No clipping or overflow outside history container
      expect(cancelReasonBox.x + cancelReasonBox.width).toBeLessThanOrEqual(
        historyBox.x + historyBox.width + 5,
      );
    }
  });
});
