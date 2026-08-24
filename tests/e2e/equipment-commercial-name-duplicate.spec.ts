import { spawnSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { assertLocalPlaywrightTarget } from "../helpers/local-test-safety.mjs";

const fixture = {
  course: crypto.randomUUID(),
  room: crypto.randomUUID(),
  schedule: crypto.randomUUID(),
  catalog: crypto.randomUUID(),
  suffix: crypto.randomUUID().slice(0, 8),
};
const scheduleDate = "2099-11-22";
const commercialName = `Commercial duplicate E2E ${fixture.suffix}`;

function localSql(sql: string) {
  const databases = spawnSync(
    "docker",
    [
      "ps",
      "--filter",
      `label=com.supabase.cli.project=${process.env.SUPABASE_LOCAL_PROJECT_ID ?? "lich-truc-app"}`,
      "--format",
      "{{.Names}}",
    ],
    { encoding: "utf8" },
  )
    .stdout.split(/\r?\n/)
    .filter((name) => name.startsWith("supabase_db_"));

  if (databases.length !== 1) {
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
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.beforeAll(() => {
  assertLocalPlaywrightTarget(process.env.PLAYWRIGHT_BASE_URL);
  localSql(`
    begin;
    insert into public.courses (id, course_code, course_name, room_type_id, is_active)
    select '${fixture.course}', 'SK-DUP-${fixture.suffix}', 'Skills duplicate E2E', id, true
    from public.room_types where code = 'nursing_skills';
    insert into public.rooms (id, room_code, building_code, room_name, room_type_id, capacity, is_active)
    select '${fixture.room}', 'SK-${fixture.suffix}', 'E2E', 'Skills duplicate E2E', id, 20, true
    from public.room_types where code = 'nursing_skills';
    insert into public.class_schedules
      (id, course_id, course_code_snapshot, course_name_snapshot, room_id, lecturer_id,
       schedule_date, start_time, end_time, source, schedule_status, student_count,
       semester, created_by, published_by, published_at)
    select '${fixture.schedule}', '${fixture.course}', 'SK-DUP-${fixture.suffix}',
      'Skills duplicate E2E', '${fixture.room}', id, '${scheduleDate}', '09:00',
      '11:00', 'manual', 'published', 20, 'HK1',
      (select id from public.profiles where email = 'admin@campus.local'),
      (select id from public.profiles where email = 'admin@campus.local'), clock_timestamp()
    from public.profiles where email = 'giangvien@campus.local';
    insert into public.equipment_catalog (id, item_name, commercial_name, unit, is_active)
    values ('${fixture.catalog}', 'Skills duplicate item ${fixture.suffix}', '${commercialName}', 'cái', true);
    commit;
  `);
});

test.afterAll(() => {
  localSql(`
    begin;
    delete from public.equipment_request_items
    where request_id in (select id from public.equipment_requests where class_schedule_id = '${fixture.schedule}');
    delete from public.equipment_requests where class_schedule_id = '${fixture.schedule}';
    delete from public.class_schedules where id = '${fixture.schedule}';
    delete from public.equipment_catalog where id = '${fixture.catalog}';
    delete from public.rooms where id = '${fixture.room}';
    delete from public.courses where id = '${fixture.course}';
    commit;
  `);
});

test("Skills UI hard-blocks duplicate commercial names in the same activity", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.goto("/equipment/register");
  await page
    .locator('select[name="class_schedule_id"]')
    .selectOption(fixture.schedule);
  await page
    .locator('select[name="responsible_lecturer_id"]')
    .selectOption({ index: 1 });
  await page.getByLabel("Số lượng kỹ năng/bài thực hành *").selectOption("1");
  await page.getByRole("button", { name: "+ Tạo bảng thiết bị" }).click();
  await page
    .getByLabel("Tên kỹ năng/Bài thực hành *")
    .fill("Kỹ năng kiểm tra trùng E2E");

  const rows = page.locator(".equipment-items-table tbody tr");
  await rows.nth(2).getByRole("button", { name: "Xóa", exact: true }).click();
  await expect(rows).toHaveCount(2);

  for (const rowIndex of [1, 2]) {
    const name = page.getByRole("combobox", {
      name: `Tên thương mại dòng ${rowIndex}, kỹ năng 1`,
    });
    await name.fill(commercialName);
    await page.getByRole("option", { name: commercialName }).click();
  }

  await page.locator('input[name="receive_date"]').fill(scheduleDate);
  await page.locator('input[name="return_date"]').fill(scheduleDate);
  await page.locator('select[name="receive_time"]').selectOption("09:00");
  await page.locator('select[name="return_time"]').selectOption("11:00");
  await page.getByRole("button", { name: "Gửi đăng ký", exact: true }).click();

  await expect(
    page.locator(".equipment-request-form .form-error"),
  ).toContainText(
    "Cùng một tên thương mại thiết bị đã được đăng ký trong kỹ năng/bài thực hành này.",
  );
  await expect(page).toHaveURL(/\/equipment\/register$/);
});
