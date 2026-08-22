import { spawnSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { assertLocalPlaywrightTarget } from "../helpers/local-test-safety.mjs";

const fixture = {
  course: crypto.randomUUID(),
  room: crypto.randomUUID(),
  registration: crypto.randomUUID(),
  schedule: crypto.randomUUID(),
  session: crypto.randomUUID(),
  catalog: crypto.randomUUID(),
  suffix: crypto.randomUUID().slice(0, 8),
};
const courseCode = `BM-EQUIP-PAGE-${fixture.suffix}`;
const lessonTitle = `Basic Medical equipment page ${fixture.suffix}`;
const catalogName = `Máy đo huyết áp E2E ${fixture.suffix}`;

function localSql(sql: string) {
  const listed = spawnSync(
    "docker",
    [
      "ps",
      "--filter",
      `label=com.supabase.cli.project=${process.env.SUPABASE_LOCAL_PROJECT_ID ?? "lich-truc-app"}`,
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
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

test.beforeAll(() => {
  assertLocalPlaywrightTarget(process.env.PLAYWRIGHT_BASE_URL);
  const adminId = localSql(
    "select id from public.profiles where email = 'admin@campus.local' limit 1;",
  );
  const lecturerId = localSql(
    "select id from public.profiles where email = 'giangvien@campus.local' limit 1;",
  );
  localSql(`
    begin;
    select set_config('app.basic_medical_registration_mutation', 'true', true);
    insert into public.courses (id, course_code, course_name, room_type_id, is_active)
    select '${fixture.course}', '${courseCode}', 'Basic Medical equipment page test', id, true
    from public.room_types where code = 'basic_medical';
    insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity, is_active)
    select '${fixture.room}', 'BM-${fixture.suffix}', 'E2E', 'Basic Medical E2E', id, 20, true
    from public.room_types where code = 'basic_medical';
    insert into public.basic_medical_registrations
      (id, academic_year, semester, start_date, end_date, course_id, room_id, student_count,
       registrant_id, responsible_lecturer_id, created_by)
    values ('${fixture.registration}', '2099-2100', 'HK1', '2099-11-22', '2099-11-22',
      '${fixture.course}', '${fixture.room}', 20, '${adminId}', '${lecturerId}', '${adminId}');
    insert into public.class_schedules
      (id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id, schedule_date,
       start_time, end_time, source, schedule_status, student_count, basic_medical_registration_id,
       created_by, published_by, published_at)
    values ('${fixture.schedule}', '${fixture.course}', '${courseCode}', 'Basic Medical equipment page test',
      '${fixture.room}', '${lecturerId}', '2099-11-22', '09:00', '11:00', 'manual', 'published', 20,
      '${fixture.registration}', '${adminId}', '${adminId}', clock_timestamp());
    insert into public.basic_medical_registration_sessions
      (id, registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
    values ('${fixture.session}', '${fixture.registration}', '${fixture.schedule}', '${lessonTitle}', '${lecturerId}', 1);
    insert into public.basic_medical_equipment_catalog
      (id, item_name, commercial_name, item_type, country_of_origin, manufacturer, model, unit, is_active)
    values ('${fixture.catalog}', '${catalogName}', 'E2E commercial ${fixture.suffix}', 'Thiết bị',
      'Việt Nam', 'E2E', 'PAGE-01', 'Máy', true);
    commit;
  `);
});

test.afterAll(() => {
  localSql(`
    begin;
    set local session_replication_role = replica;
    delete from public.equipment_request_items
    where request_id in (
      select id
      from public.equipment_requests
      where request_domain = 'basic_medical'
        and source_identity_id = '${fixture.session}'
    );
    delete from public.equipment_requests
    where request_domain = 'basic_medical'
      and source_identity_id = '${fixture.session}';
    delete from public.basic_medical_registration_sessions where id = '${fixture.session}';
    delete from public.class_schedules where id = '${fixture.schedule}';
    delete from public.basic_medical_registrations where id = '${fixture.registration}';
    delete from public.basic_medical_equipment_catalog where id = '${fixture.catalog}';
    delete from public.rooms where id = '${fixture.room}';
    delete from public.courses where id = '${fixture.course}';
    commit;
  `);
});

test("Basic Medical equipment registration stays on a stable page flow", async ({
  page,
}) => {
  await loginAsAdmin(page);

  const equipmentRegisterLink = page.getByRole("link", {
    name: "Đăng ký thiết bị",
    exact: true,
  });
  await expect(equipmentRegisterLink).toHaveCount(1);
  await equipmentRegisterLink.click();
  await expect(page).toHaveURL(/\/equipment\/register$/);
  await page.getByRole("link", { name: "Y cơ sở", exact: true }).click();
  await expect(page).toHaveURL(/domain=basic_medical/);

  const sessionPicker = page.getByRole("combobox", {
    name: "Buổi học Y cơ sở",
  });
  await sessionPicker.click();
  await page.getByRole("option", { name: new RegExp(courseCode) }).click();
  await expect(page).toHaveURL(
    new RegExp(`domain=basic_medical&session=${fixture.session}`),
  );

  await page.goto("/basic-medical/registrations?status=all");
  const registrationRow = page
    .locator("tr.equipment-request-table-row")
    .filter({ hasText: courseCode })
    .first();
  await expect(registrationRow).toBeVisible({ timeout: 15_000 });
  await registrationRow.click();
  const sessionRow = page
    .locator(".basic-medical-session-table tbody tr")
    .filter({ hasText: lessonTitle });
  await sessionRow
    .getByRole("link", { name: "Đăng ký thiết bị", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`domain=basic_medical&session=${fixture.session}`),
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);

  for (const heading of [
    "Thông tin môn học",
    "Thông tin người đăng ký",
    "Thông tin giảng viên phụ trách",
    "Thông tin nhận thiết bị",
    "Thiết bị theo bài TN-TH",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await expect(page.locator(`input[value="${courseCode}"]`)).toHaveAttribute(
    "readonly",
    "",
  );
  await page.waitForTimeout(3_000);
  await expect(page).toHaveURL(
    new RegExp(`domain=basic_medical&session=${fixture.session}`),
  );
  await expect(
    page.getByRole("heading", { name: "Thông tin môn học" }),
  ).toBeVisible();

  const itemName = page.getByRole("combobox", {
    name: "Tên thiết bị dòng 1",
  });
  await itemName.click();
  await page.getByRole("option", { name: catalogName }).click();
  const commercialName = page.getByRole("combobox", {
    name: "Tên thương mại dòng 1",
  });
  await commercialName.click();
  await page
    .getByRole("option", { name: `E2E commercial ${fixture.suffix}` })
    .click();
  await page.getByRole("button", { name: "+ Thêm dòng" }).click();
  await expect(
    page.getByRole("combobox", { name: "Tên thiết bị dòng 2" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xóa", exact: true }).last().click();

  await page.locator('input[name="receive_date"]').fill("2099-11-22");
  await page.getByRole("button", { name: "Gửi đăng ký", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`domain=basic_medical&session=${fixture.session}`),
  );
  await expect(
    page.getByRole("button", { name: "Gửi đăng ký", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(courseCode)).toBeVisible();
  await expect(page.getByText(lessonTitle)).toBeVisible();
  const detailTable = page.locator(".equipment-detail-table");
  await expect(detailTable).toContainText(catalogName);
  await expect(detailTable).toContainText(`E2E commercial ${fixture.suffix}`);
  await expect(detailTable.locator("tbody tr").first()).toContainText("1");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForTimeout(3_000);
  await expect(page).toHaveURL(
    new RegExp(`domain=basic_medical&session=${fixture.session}`),
  );

  await page.goto("/basic-medical/registrations?status=all");
  const persistedRegistrationRow = page
    .locator("tr.equipment-request-table-row")
    .filter({ hasText: courseCode })
    .first();
  await expect(persistedRegistrationRow).toBeVisible({ timeout: 15_000 });
  await persistedRegistrationRow.click();
  const persistedSessionRow = page
    .locator(".basic-medical-session-table tbody tr")
    .filter({ hasText: lessonTitle });
  await expect(
    persistedSessionRow.getByRole("link", {
      name: "Đăng ký thiết bị",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    persistedSessionRow.getByRole("link", {
      name: "Xem phiếu thiết bị",
      exact: true,
    }),
  ).toBeVisible();
  await persistedSessionRow
    .getByRole("link", { name: "Xem phiếu thiết bị", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`domain=basic_medical&session=${fixture.session}`),
  );
  await expect(page.locator(".equipment-detail-table")).toContainText(
    catalogName,
  );
});
