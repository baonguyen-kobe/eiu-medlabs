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

async function loginAsUser(page: Page, email: string, pass: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(pass);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const cancelReasonText = "Điều chỉnh chương trình đào tạo học kỳ mới";

const ids = {
  courseR1: "11111111-c000-4000-a000-000000000001",
  courseR2: "11111111-c000-4000-a000-000000000002",
  courseCR: "11111111-c000-4000-a000-000000000003",
  courseTL: "11111111-c000-4000-a000-000000000004",
  courseUN: "11111111-c000-4000-a000-000000000005",
  courseML: "11111111-c000-4000-a000-000000000006",
  room: "22222222-b000-4000-a000-000000000002",
  // Reg 1: Active with session 1 (unconfirmed) and session 2 (confirmed)
  reg1: "33333333-b000-4000-a000-000000000001",
  sched1: "44444444-e000-4000-a000-000000000001",
  sched2: "44444444-e000-4000-a000-000000000002",
  sess1: "55555555-e000-4000-a000-000000000001",
  sess2: "55555555-e000-4000-a000-000000000002",
  conf2: "66666666-f000-4000-a000-000000000001",
  // Reg 2: Historical cancelled registration
  reg2: "33333333-b000-4000-a000-000000000002",
  sched3: "44444444-e000-4000-a000-000000000003",
  sess3: "55555555-e000-4000-a000-000000000003",
  // Reg CR: Created by non-admin creator (importer)
  regCR: "33333333-b000-4000-a000-000000000004",
  schedCR: "44444444-e000-4000-a000-000000000004",
  sessCR: "55555555-e000-4000-a000-000000000004",
  // Reg TL: Teaching lecturer cancellation flow
  regTL: "33333333-b000-4000-a000-000000000005",
  schedTL: "44444444-e000-4000-a000-000000000005",
  sessTL: "55555555-e000-4000-a000-000000000005",
  // Reg UN: Unrelated actor exclusion flow
  regUN: "33333333-b000-4000-a000-000000000006",
  schedUN: "44444444-e000-4000-a000-000000000006",
  sessUN: "55555555-e000-4000-a000-000000000006",
  // Reg ML: Multi-session distinct attribution
  regML: "33333333-b000-4000-a000-000000000007",
  schedML1: "44444444-e000-4000-a000-000000000007",
  schedML2: "44444444-e000-4000-a000-000000000008",
  sessML1: "55555555-e000-4000-a000-000000000007",
  sessML2: "55555555-e000-4000-a000-000000000008",
};

test.describe("Cancellation Dialog & UI Hardening E2E", () => {
  test.beforeAll(async () => {
    const adminId = localSql("select id from public.profiles where email = 'admin@campus.local' limit 1;");
    const lecturerId = localSql("select id from public.profiles where email = 'giangvien@campus.local' limit 1;");
    const importerId = localSql("select id from public.profiles where email = 'importer@campus.local' limit 1;");
    const assistantId = localSql("select id from public.profiles where email = 'trogiang@campus.local' limit 1;");

    localSql(`
      begin;
      select set_config('app.basic_medical_registration_mutation', 'true', true);

      delete from public.basic_medical_session_confirmations where id in ('${ids.conf2}');
      delete from public.basic_medical_registration_sessions where id in ('${ids.sess1}', '${ids.sess2}', '${ids.sess3}', '${ids.sessCR}', '${ids.sessTL}', '${ids.sessUN}', '${ids.sessML1}', '${ids.sessML2}');
      delete from public.class_schedules where id in ('${ids.sched1}', '${ids.sched2}', '${ids.sched3}', '${ids.schedCR}', '${ids.schedTL}', '${ids.schedUN}', '${ids.schedML1}', '${ids.schedML2}');
      delete from public.basic_medical_registrations where id in ('${ids.reg1}', '${ids.reg2}', '${ids.regCR}', '${ids.regTL}', '${ids.regUN}', '${ids.regML}');
      delete from public.rooms where id = '${ids.room}';
      delete from public.courses where id in ('${ids.courseR1}', '${ids.courseR2}', '${ids.courseCR}', '${ids.courseTL}', '${ids.courseUN}', '${ids.courseML}');

      -- Ensure correct full_name and basic_medical permissions
      update public.profiles set full_name = 'Nguyễn An', allow_basic_medical_access = true where id = '${adminId}';
      update public.profiles set full_name = 'Nguyễn Ngọc Diễm', allow_basic_medical_access = true where id = '${lecturerId}';
      update public.profiles set full_name = 'Trần Minh Anh', allow_basic_medical_access = true where id = '${importerId}';
      update public.profiles set full_name = 'Phạm Ngọc D', allow_basic_medical_access = true where id = '${assistantId}';

      -- Ensure profile_room_types has basic_medical for test accounts
      insert into public.profile_room_types (profile_id, room_type_id)
      select p.id, '40000000-0000-0000-0000-000000000002'::uuid
      from public.profiles p
      where p.id in ('${adminId}', '${lecturerId}', '${importerId}', '${assistantId}')
      on conflict do nothing;

      insert into public.courses (id, course_code, course_name, room_type_id, is_active)
      select '${ids.courseR1}', 'MED-E2E-R1', 'BM Test Active R1', '40000000-0000-0000-0000-000000000002'::uuid, true;

      insert into public.courses (id, course_code, course_name, room_type_id, is_active)
      select '${ids.courseR2}', 'MED-E2E-R2', 'BM Test Cancelled R2', '40000000-0000-0000-0000-000000000002'::uuid, true;

      insert into public.courses (id, course_code, course_name, room_type_id, is_active)
      select '${ids.courseCR}', 'MED-E2E-CR', 'BM Test Creator CR', '40000000-0000-0000-0000-000000000002'::uuid, true;

      insert into public.courses (id, course_code, course_name, room_type_id, is_active)
      select '${ids.courseTL}', 'MED-E2E-TL', 'BM Test Lecturer TL', '40000000-0000-0000-0000-000000000002'::uuid, true;

      insert into public.courses (id, course_code, course_name, room_type_id, is_active)
      select '${ids.courseUN}', 'MED-E2E-UN', 'BM Test Unrelated UN', '40000000-0000-0000-0000-000000000002'::uuid, true;

      insert into public.courses (id, course_code, course_name, room_type_id, is_active)
      select '${ids.courseML}', 'MED-E2E-ML', 'BM Test Multi ML', '40000000-0000-0000-0000-000000000002'::uuid, true;

      insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity, is_active)
      select '${ids.room}', 'R-TYP', 'E2E', 'Typing Room E2E', '40000000-0000-0000-0000-000000000002'::uuid, 20, true;

      -- Reg 1: Active with 2 sessions (sess 1 unconfirmed, sess 2 confirmed)
      insert into public.basic_medical_registrations
        (id, registration_code, academic_year, semester, start_date, end_date, course_id, room_id, student_count,
         registrant_id, responsible_lecturer_id, created_by)
      values ('${ids.reg1}', 'YC-260820-000001', '2048-2049', 'HK1', '2048-11-10', '2048-11-12', '${ids.courseR1}',
        '${ids.room}', 20, '${adminId}', '${lecturerId}', '${adminId}');

      insert into public.class_schedules
        (id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date,
         start_time, end_time, source, schedule_status, student_count, basic_medical_registration_id,
         created_by, published_by, published_at)
      values
        ('${ids.sched1}', '${ids.courseR1}', 'MED-E2E-R1', 'Typing Session 1', '${ids.room}', '${lecturerId}', '2048-11-10', '07:30', '11:30', 'manual', 'published', 20, '${ids.reg1}', '${adminId}', '${adminId}', clock_timestamp()),
        ('${ids.sched2}', '${ids.courseR1}', 'MED-E2E-R1', 'Typing Session 2', '${ids.room}', '${lecturerId}', '2048-11-12', '13:30', '16:30', 'manual', 'published', 20, '${ids.reg1}', '${adminId}', '${adminId}', clock_timestamp());

      insert into public.basic_medical_registration_sessions
        (id, registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
      values
        ('${ids.sess1}', '${ids.reg1}', '${ids.sched1}', 'Lesson 1 Unconfirmed', '${lecturerId}', 1),
        ('${ids.sess2}', '${ids.reg1}', '${ids.sched2}', 'Lesson 2 Confirmed', '${lecturerId}', 2);

      -- Confirmation for Session 2
      insert into public.basic_medical_session_confirmations
        (id, session_id, registration_id_snapshot, class_schedule_id_snapshot, signer_id,
         signature_data, schedule_date_snapshot, start_time_snapshot, end_time_snapshot,
         room_id_snapshot, teaching_lecturer_id_snapshot, signed_at)
      values
        ('${ids.conf2}', '${ids.sess2}', '${ids.reg1}', '${ids.sched2}', '${adminId}',
         'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' || repeat('A', 80),
         '2048-11-12', '13:30', '16:30', '${ids.room}', '${lecturerId}', clock_timestamp());

      -- Reg 2: Cancelled registration with cancellation reason
      insert into public.basic_medical_registrations
        (id, registration_code, academic_year, semester, start_date, end_date, course_id, room_id, student_count,
         registrant_id, responsible_lecturer_id, created_by, cancelled_at, cancel_reason)
      values ('${ids.reg2}', 'YC-260820-000002', '2048-2049', 'HK1', '2048-11-20', '2048-11-20', '${ids.courseR2}',
        '${ids.room}', 18, '${adminId}', '${lecturerId}', '${adminId}', '2048-11-05 08:30:00+07', '${cancelReasonText}');

      insert into public.class_schedules
        (id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date,
         start_time, end_time, source, schedule_status, student_count, basic_medical_registration_id,
         created_by, published_by, published_at, cancelled_at, cancelled_by)
      values
        ('${ids.sched3}', '${ids.courseR2}', 'MED-E2E-R2', 'Cancelled Session', '${ids.room}', '${lecturerId}', '2048-11-20', '07:30', '11:30', 'manual', 'cancelled', 18, '${ids.reg2}', '${adminId}', '${adminId}', clock_timestamp(), '2048-11-05 08:30:00+07', '${adminId}');

      insert into public.basic_medical_registration_sessions
        (id, registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
      values
        ('${ids.sess3}', '${ids.reg2}', '${ids.sched3}', 'Lesson Cancelled', '${lecturerId}', 1);

      -- Reg CR: Created by non-admin lecturer (importerId)
      insert into public.basic_medical_registrations
        (id, registration_code, academic_year, semester, start_date, end_date, course_id, room_id, student_count,
         registrant_id, responsible_lecturer_id, created_by)
      values ('${ids.regCR}', 'YC-260820-000003', '2048-2049', 'HK1', '2048-11-25', '2048-11-25', '${ids.courseCR}',
        '${ids.room}', 22, '${importerId}', '${importerId}', '${importerId}');

      insert into public.class_schedules
        (id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date,
         start_time, end_time, source, schedule_status, student_count, basic_medical_registration_id,
         created_by, published_by, published_at)
      values
        ('${ids.schedCR}', '${ids.courseCR}', 'MED-E2E-CR', 'Creator Class', '${ids.room}', '${lecturerId}', '2048-11-25', '07:30', '11:30', 'manual', 'published', 22, '${ids.regCR}', '${importerId}', '${importerId}', clock_timestamp());

      insert into public.basic_medical_registration_sessions
        (id, registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
      values
        ('${ids.sessCR}', '${ids.regCR}', '${ids.schedCR}', 'Bài Hủy Bởi Creator', '${lecturerId}', 1);

      -- Reg TL: Teaching lecturer cancellation flow (responsible = lecturerId)
      insert into public.basic_medical_registrations
        (id, registration_code, academic_year, semester, start_date, end_date, course_id, room_id, student_count,
         registrant_id, responsible_lecturer_id, created_by)
      values ('${ids.regTL}', 'YC-260820-000004', '2048-2049', 'HK1', '2048-11-28', '2048-11-28', '${ids.courseTL}',
        '${ids.room}', 20, '${lecturerId}', '${lecturerId}', '${adminId}');

      insert into public.class_schedules
        (id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date,
         start_time, end_time, source, schedule_status, student_count, basic_medical_registration_id,
         created_by, published_by, published_at)
      values
        ('${ids.schedTL}', '${ids.courseTL}', 'MED-E2E-TL', 'Lecturer Class', '${ids.room}', '${lecturerId}', '2048-11-28', '07:30', '11:30', 'manual', 'published', 20, '${ids.regTL}', '${adminId}', '${adminId}', clock_timestamp());

      insert into public.basic_medical_registration_sessions
        (id, registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
      values
        ('${ids.sessTL}', '${ids.regTL}', '${ids.schedTL}', 'Bài Hủy Bởi Lecturer', '${lecturerId}', 1);

      -- Reg UN: Unrelated actor exclusion flow (registrant = assistantId, responsible = assistantId so TA can view row)
      insert into public.basic_medical_registrations
        (id, registration_code, academic_year, semester, start_date, end_date, course_id, room_id, student_count,
         registrant_id, responsible_lecturer_id, created_by)
      values ('${ids.regUN}', 'YC-260820-000005', '2048-2049', 'HK1', '2048-11-29', '2048-11-29', '${ids.courseUN}',
        '${ids.room}', 20, '${assistantId}', '${assistantId}', '${adminId}');

      insert into public.class_schedules
        (id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date,
         start_time, end_time, source, schedule_status, student_count, basic_medical_registration_id,
         created_by, published_by, published_at)
      values
        ('${ids.schedUN}', '${ids.courseUN}', 'MED-E2E-UN', 'Unrelated Class', '${ids.room}', '${lecturerId}', '2048-11-29', '07:30', '11:30', 'manual', 'published', 20, '${ids.regUN}', '${adminId}', '${adminId}', clock_timestamp());

      insert into public.basic_medical_registration_sessions
        (id, registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
      values
        ('${ids.sessUN}', '${ids.regUN}', '${ids.schedUN}', 'Bài Khóa Với TA', '${lecturerId}', 1);

      -- Reg ML: Multi-session registration with distinct session cancellations
      insert into public.basic_medical_registrations
        (id, registration_code, academic_year, semester, start_date, end_date, course_id, room_id, student_count,
         registrant_id, responsible_lecturer_id, created_by)
      values ('${ids.regML}', 'YC-260820-000006', '2048-2049', 'HK1', '2048-12-01', '2048-12-02', '${ids.courseML}',
        '${ids.room}', 25, '${adminId}', '${lecturerId}', '${adminId}');

      insert into public.class_schedules
        (id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date,
         start_time, end_time, source, schedule_status, student_count, basic_medical_registration_id,
         created_by, published_by, published_at, cancelled_at, cancelled_by)
      values
        ('${ids.schedML1}', '${ids.courseML}', 'MED-E2E-ML', 'Buổi 1 Multi', '${ids.room}', '${lecturerId}', '2048-12-01', '07:30', '11:30', 'manual', 'cancelled', 25, '${ids.regML}', '${adminId}', '${adminId}', clock_timestamp(), '2048-11-01 09:00:00+07', '${adminId}'),
        ('${ids.schedML2}', '${ids.courseML}', 'MED-E2E-ML', 'Buổi 2 Multi', '${ids.room}', '${lecturerId}', '2048-12-02', '13:30', '16:30', 'manual', 'cancelled', 25, '${ids.regML}', '${adminId}', '${adminId}', clock_timestamp(), '2048-11-02 10:00:00+07', '${lecturerId}');

      insert into public.basic_medical_registration_sessions
        (id, registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number, cancelled_at, cancelled_by, cancellation_reason)
      values
        ('${ids.sessML1}', '${ids.regML}', '${ids.schedML1}', 'Bài 1 Bảo Trì', '${lecturerId}', 1, '2048-11-01 09:00:00+07', '${adminId}', 'Bảo trì phòng máy thực hành'),
        ('${ids.sessML2}', '${ids.regML}', '${ids.schedML2}', 'Bài 2 Trùng Lịch', '${lecturerId}', 2, '2048-11-02 10:00:00+07', '${lecturerId}', 'Giảng viên bận công tác hội thảo');

      commit;
    `);
  });

  test.afterAll(async () => {
    localSql(`
      begin;
      select set_config('app.basic_medical_registration_mutation', 'true', true);
      delete from public.basic_medical_session_confirmations where id in ('${ids.conf2}');
      delete from public.basic_medical_registration_sessions where id in ('${ids.sess1}', '${ids.sess2}', '${ids.sess3}', '${ids.sessCR}', '${ids.sessTL}', '${ids.sessUN}', '${ids.sessML1}', '${ids.sessML2}');
      delete from public.class_schedules where id in ('${ids.sched1}', '${ids.sched2}', '${ids.sched3}', '${ids.schedCR}', '${ids.schedTL}', '${ids.schedUN}', '${ids.schedML1}', '${ids.schedML2}');
      delete from public.basic_medical_registrations where id in ('${ids.reg1}', '${ids.reg2}', '${ids.regCR}', '${ids.regTL}', '${ids.regUN}', '${ids.regML}');
      delete from public.rooms where id = '${ids.room}';
      delete from public.courses where id in ('${ids.courseR1}', '${ids.courseR2}', '${ids.courseCR}', '${ids.courseTL}', '${ids.courseUN}', '${ids.courseML}');
      commit;
    `);
  });

  test("1. ConfirmDialog structure and geometry contract across viewports (1280x720, 1280x420, 375x667)", async ({
    page,
  }) => {
    await loginAsUser(page, "admin@campus.local", "LocalAdmin123!");
    await page.goto("/basic-medical/registrations?status=all");

    // Expand active registration 1
    const regRow = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: "MED-E2E-R1" })
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

    // Exactly 1 dialog layer rendered in body
    const dialogLayers = page.locator("body > .confirm-dialog-layer");
    await expect(dialogLayers).toHaveCount(1);
    await expect(dialogLayers.first()).toBeVisible();

    const backdrop = dialogLayers.locator(".confirm-dialog-backdrop");
    await expect(backdrop).toBeVisible();

    const dialog = dialogLayers.locator('section.confirm-dialog[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    // Structural elements contract
    const header = dialog.locator(".confirm-dialog-header");
    const body = dialog.locator(".confirm-dialog-body");
    const actions = dialog.locator(".confirm-dialog-actions");
    await expect(header).toBeVisible();
    await expect(body).toBeVisible();
    await expect(actions).toBeVisible();

    const reasonInput = body.locator('label:has-text("Lý do hủy buổi học *") input');
    await expect(reasonInput).toBeVisible();

    // A. Desktop viewport geometry (1280x720)
    await page.setViewportSize({ width: 1280, height: 720 });
    let dialogBox = await dialog.boundingBox();
    const bodyBox = await body.boundingBox();
    const inputBox = await reasonInput.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(bodyBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(1280);
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(720);
    // Reason input must be physically bounded inside the dialog body
    expect(inputBox!.x).toBeGreaterThanOrEqual(bodyBox!.x - 1);
    expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(bodyBox!.x + bodyBox!.width + 1);

    // B. Short-height viewport verification (1280x420)
    await page.setViewportSize({ width: 1280, height: 420 });
    dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(1280);
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(420);
    await expect(dialog).toBeVisible();

    // C. Narrow/mobile-like viewport verification (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(375);
    expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(667);
    await expect(dialog).toBeVisible();

    // Check no horizontal overflow on body or dialog
    const hasHorizontalOverflow = await page.evaluate(() => {
      const el = document.querySelector('section.confirm-dialog[role="dialog"]');
      return el ? el.scrollWidth > el.clientWidth : false;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Reset viewport size to desktop
    await page.setViewportSize({ width: 1280, height: 720 });

    // D. Escape key dismisses dialog and unmounts layer
    await page.keyboard.press("Escape");
    await expect(dialogLayers).toHaveCount(0);
  });

  test("2. DOM Identity & Typing Continuity Contract (No Remount, No Keystroke Loss, Focus Maintained)", async ({
    page,
  }) => {
    await loginAsUser(page, "admin@campus.local", "LocalAdmin123!");
    await page.goto("/basic-medical/registrations?status=all");

    const regRow = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: "MED-E2E-R1" })
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

    const dialog = page.locator('body > .confirm-dialog-layer section.confirm-dialog[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Set DOM instance marker on the mounted dialog element
    await dialog.evaluate((el) => {
      el.setAttribute("data-mount-marker", "initial-dialog-instance");
    });

    const reasonInput = dialog.locator('label:has-text("Lý do hủy buổi học *") input');
    await expect(reasonInput).toBeVisible();
    await reasonInput.focus();
    await expect(reasonInput).toBeFocused();

    // Type multi-word Vietnamese sentence sequentially keystroke by keystroke
    const vietnameseSentence = "Hủy buổi do bão số 5 và mất điện toàn khu vực";
    await reasonInput.pressSequentially(vietnameseSentence, { delay: 15 });

    // Assertions proving zero remount and continuous DOM identity:
    // 1. Instance marker is preserved across all keystrokes
    const marker = await dialog.getAttribute("data-mount-marker");
    expect(marker).toBe("initial-dialog-instance");

    // 2. Exactly 1 dialog layer is in DOM
    await expect(page.locator("body > .confirm-dialog-layer")).toHaveCount(1);

    // 3. Focus remains on the reason input
    await expect(reasonInput).toBeFocused();

    // 4. Exact full Vietnamese text preserved with 0 dropped characters
    await expect(reasonInput).toHaveValue(vietnameseSentence);

    // 5. Dialog remains open without restarting animations
    await expect(dialog).toBeVisible();

    // Close modal via 'Quay lại'
    const backBtn = dialog.getByRole("button", { name: "Quay lại", exact: true });
    await backBtn.click();
    await expect(page.locator("body > .confirm-dialog-layer")).toHaveCount(0);
  });

  test("3. Registration Creator cancellation UI flow: non-admin creator cancels session, persists after reload", async ({
    page,
  }) => {
    // Login as non-admin creator (importer@campus.local)
    await loginAsUser(page, "importer@campus.local", "LocalImporter123!");
    await page.goto("/basic-medical/registrations?status=all");

    const regRow = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: "MED-E2E-CR" })
      .first();
    await expect(regRow).toBeVisible({ timeout: 10_000 });
    await regRow.click();

    const detailRow = page.locator("tr.equipment-request-detail-row").first();
    await expect(detailRow).toBeVisible();

    // Creator has cancellation button
    const cancelBtn = detailRow.locator("button.button-danger.basic-medical-confirm-button").first();
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    const dialog = page.locator('body > .confirm-dialog-layer section.confirm-dialog[role="dialog"]');
    await expect(dialog).toBeVisible();

    const reasonInput = dialog.locator('label:has-text("Lý do hủy buổi học *") input');
    const creatorReason = "Người tạo phiếu hủy buổi học do điều chỉnh kế hoạch giảng viên";
    await reasonInput.fill(creatorReason);

    // Submit cancellation
    const confirmBtn = dialog.getByRole("button", { name: "Hủy buổi học", exact: true });
    await confirmBtn.click();

    // Wait for dialog to dismiss and status to update
    await expect(page.locator("body > .confirm-dialog-layer")).toHaveCount(0, { timeout: 10_000 });

    // Reload page and verify persistence
    await page.reload();
    const reloadedRegRow = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: "MED-E2E-CR" })
      .first();
    await expect(reloadedRegRow).toBeVisible();
    await reloadedRegRow.click();

    const reloadedDetailRow = page.locator("tr.equipment-request-detail-row").first();
    await expect(reloadedDetailRow.locator(".request-status", { hasText: "Đã hủy" }).first()).toBeVisible();
    await expect(reloadedDetailRow.locator(".basic-medical-session-cancellation-metadata").first()).toContainText("Trần Minh Anh");
    await expect(reloadedDetailRow.locator(".basic-medical-session-cancellation-metadata").first()).toContainText(creatorReason);
  });

  test("4. Teaching Lecturer cancellation UI flow: assigned lecturer cancels session, persists after reload", async ({
    page,
  }) => {
    // Login as assigned teaching lecturer (giangvien@campus.local)
    await loginAsUser(page, "giangvien@campus.local", "LocalLecturer123!");
    await page.goto("/basic-medical/registrations?status=all");

    // Expand dedicated registration MED-E2E-TL (where giangvien is teaching lecturer)
    const regRow = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: "MED-E2E-TL" })
      .first();
    await expect(regRow).toBeVisible({ timeout: 10_000 });
    await regRow.click();

    const detailRow = page.locator("tr.equipment-request-detail-row").first();
    await expect(detailRow).toBeVisible();

    // Teaching lecturer sees 'Hủy lớp' on unconfirmed session
    const cancelBtn = detailRow.locator("button.button-danger.basic-medical-confirm-button").first();
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    const dialog = page.locator('body > .confirm-dialog-layer section.confirm-dialog[role="dialog"]');
    await expect(dialog).toBeVisible();

    const reasonInput = dialog.locator('label:has-text("Lý do hủy buổi học *") input');
    const lecturerReason = "Giảng viên phụ trách hủy buổi do công tác đột xuất";
    await reasonInput.fill(lecturerReason);

    const confirmBtn = dialog.getByRole("button", { name: "Hủy buổi học", exact: true });
    await confirmBtn.click();

    await expect(page.locator("body > .confirm-dialog-layer")).toHaveCount(0, { timeout: 10_000 });

    // Reload page to verify persistence
    await page.reload();
    const reloadedRegRow = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: "MED-E2E-TL" })
      .first();
    await expect(reloadedRegRow).toBeVisible();
    await reloadedRegRow.click();

    const reloadedDetailRow = page.locator("tr.equipment-request-detail-row").first();
    await expect(reloadedDetailRow.locator(".request-status", { hasText: "Đã hủy" }).first()).toBeVisible();
    await expect(reloadedDetailRow.locator(".basic-medical-session-cancellation-metadata").first()).toContainText("Nguyễn Ngọc Diễm");
    await expect(reloadedDetailRow.locator(".basic-medical-session-cancellation-metadata").first()).toContainText(lecturerReason);
  });

  test("5. Unrelated actor UI contract: cancellation action is NOT offered to unrelated actors", async ({
    page,
  }) => {
    // Login as unrelated TA (trogiang@campus.local)
    await loginAsUser(page, "trogiang@campus.local", "LocalAssistant123!");
    await page.goto("/basic-medical/registrations?status=all");

    const regRow = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: "MED-E2E-UN" })
      .first();
    await expect(regRow).toBeVisible({ timeout: 10_000 });
    await regRow.click();

    const detailRow = page.locator("tr.equipment-request-detail-row").first();
    await expect(detailRow).toBeVisible();

    // Cancellation button 'Hủy lớp' must NOT be rendered for unrelated actor
    const cancelBtn = detailRow.locator("button.button-danger.basic-medical-confirm-button");
    await expect(cancelBtn).toHaveCount(0);
  });

  test("6. Multi-session distinct attribution UI contract: renders independent canceller and reason per session", async ({
    page,
  }) => {
    await loginAsUser(page, "admin@campus.local", "LocalAdmin123!");
    await page.goto("/basic-medical/registrations?status=all");

    const regRow = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: "MED-E2E-ML" })
      .first();
    await expect(regRow).toBeVisible({ timeout: 10_000 });
    await regRow.click();

    const detailRow = page.locator("tr.equipment-request-detail-row").first();
    await expect(detailRow).toBeVisible();

    const sessionRows = detailRow.locator("table.basic-medical-session-table tbody tr");
    await expect(sessionRows).toHaveCount(2);

    // Session 1: Cancelled by Admin with 'Bảo trì phòng máy thực hành'
    const sess1Row = sessionRows.nth(0);
    await expect(sess1Row.locator(".request-status")).toHaveText("Đã hủy");
    await expect(sess1Row.locator(".basic-medical-session-cancellation-metadata")).toContainText("Nguyễn An");
    await expect(sess1Row.locator(".basic-medical-session-cancellation-metadata")).toContainText("Bảo trì phòng máy thực hành");

    // Session 2: Cancelled by Lecturer with 'Giảng viên bận công tác hội thảo'
    const sess2Row = sessionRows.nth(1);
    await expect(sess2Row.locator(".request-status")).toHaveText("Đã hủy");
    await expect(sess2Row.locator(".basic-medical-session-cancellation-metadata")).toContainText("Nguyễn Ngọc Diễm");
    await expect(sess2Row.locator(".basic-medical-session-cancellation-metadata")).toContainText("Giảng viên bận công tác hội thảo");

    // Ensure they are distinctly attributed and did not bleed across rows
    await expect(sess1Row.locator(".basic-medical-session-cancellation-metadata")).not.toContainText("Giảng viên bận công tác hội thảo");
    await expect(sess2Row.locator(".basic-medical-session-cancellation-metadata")).not.toContainText("Bảo trì phòng máy thực hành");
  });

  test("7. Sequential keystroke typing does not lose focus in Invalidation reason input", async ({
    page,
  }) => {
    await loginAsUser(page, "admin@campus.local", "LocalAdmin123!");
    await page.goto("/basic-medical/registrations?status=all");

    const regRow = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: "MED-E2E-R1" })
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
    const invalidationReason = "Vô hiệu hóa do sai lệch thông tin thiết bị thực tế";
    await invalidationInput.focus();
    await expect(invalidationInput).toBeFocused();

    await invalidationInput.pressSequentially(invalidationReason, {
      delay: 15,
    });

    // Assertions:
    await expect(invalidationInput).toHaveValue(invalidationReason);
    await expect(invalidationInput).toBeFocused();
    await expect(dialog).toBeVisible();

    // Close modal via 'Quay lại'
    const backBtn = dialog.getByRole("button", {
      name: "Quay lại",
      exact: true,
    });
    await backBtn.click();
    await expect(dialogLayer).toHaveCount(0);
  });

  test("8. Cancelled registration detail history geometry aligns under header tracks on real rendered DOM", async ({
    page,
  }) => {
    await loginAsUser(page, "admin@campus.local", "LocalAdmin123!");
    await page.goto("/basic-medical/registrations?status=all");

    const regRows = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: "MED-E2E-R2" });
    await expect(regRows.first()).toBeVisible({ timeout: 10_000 });

    const cancelledRow = regRows.filter({ hasText: "Đã hủy" }).first();
    await expect(cancelledRow).toBeVisible({ timeout: 10_000 });
    await cancelledRow.click();

    const detailRow = page.locator("tr.equipment-request-detail-row").first();
    await expect(detailRow).toBeVisible();

    const historyBlock = detailRow.locator(
      ".basic-medical-registration-detail-history",
    );
    await expect(historyBlock).toBeVisible();

    const cancelTimeBlock = historyBlock.locator("> div").first();
    await expect(cancelTimeBlock).toBeVisible();
    await expect(cancelTimeBlock.locator("span")).toHaveText("Thời điểm hủy");

    const cancelReasonBlock = historyBlock.locator("> div").last();
    await expect(cancelReasonBlock).toBeVisible();
    await expect(cancelReasonBlock.locator("span")).toHaveText("Lý do hủy");
    await expect(cancelReasonBlock.locator("strong")).toHaveText(
      cancelReasonText,
    );

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
      expect(Math.abs(cancelTimeBox.x - codeColBox.x)).toBeLessThanOrEqual(4);
      expect(
        Math.abs(cancelReasonBox.x - registrantColBox.x),
      ).toBeLessThanOrEqual(4);
      expect(cancelReasonBox.x).toBeGreaterThan(
        cancelTimeBox.x + cancelTimeBox.width - 5,
      );
      expect(cancelReasonBox.x + cancelReasonBox.width).toBeLessThanOrEqual(
        historyBox.x + historyBox.width + 5,
      );
    }
  });
});

