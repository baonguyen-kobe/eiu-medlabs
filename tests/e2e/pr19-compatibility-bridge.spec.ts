import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { assertLocalDestructiveTestTarget } from "../helpers/local-test-safety.mjs";

async function localConfig() {
  let fileEnv: Record<string, string> = {};
  try {
    const text = await readFile(
      new URL("../../.env.local", import.meta.url),
      "utf8",
    );
    fileEnv = Object.fromEntries(
      text
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const [key, ...value] = line.split("=");
          return [key, value.join("=")];
        }),
    );
  } catch {
    // Runtime environment is authoritative for disposable stacks.
  }
  return {
    url:
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL,
    secretKey:
      process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      fileEnv.SUPABASE_SECRET_KEY ??
      fileEnv.SUPABASE_SERVICE_ROLE_KEY,
  };
}

function runLocalSql(sql: string) {
  const container = process.env.BRIDGE_DB_CONTAINER;
  if (!container?.startsWith("supabase_db_eiu-medlabs-pr19-bridge-")) {
    throw new Error("REFUSING_NON_DISPOSABLE_BRIDGE_DATABASE");
  }
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
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

async function loginAsLecturer(page: Page, email: string, password: string) {
  await page.goto("/login");
  await expect(async () => {
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
}

test("bridge confirmation and evidence gate match the selected local schema", async ({
  page,
}) => {
  const config = await localConfig();
  assertLocalDestructiveTestTarget({
    supabaseUrl: config.url,
    playwrightBaseUrl: process.env.PLAYWRIGHT_BASE_URL,
  });
  expect(config.secretKey).toBeTruthy();
  const service = createClient(config.url!, config.secretKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suffix = crypto.randomUUID().slice(0, 8);
  const courseId = crypto.randomUUID();
  const roomId = crypto.randomUUID();
  const catalogId = crypto.randomUUID();
  const inventoryId = crypto.randomUUID();
  const registrationId = crypto.randomUUID();
  const scheduleId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const lecturerEmail = `bridge-${suffix}@campus.local`;
  const lecturerPassword = "LocalBridge123!";
  let lecturerId: string | null = null;
  let confirmationId: string | null = null;
  let primaryError: unknown;
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString(
    "en-CA",
    { timeZone: "Asia/Ho_Chi_Minh" },
  );

  try {
    const { data: lecturer, error: lecturerError } =
      await service.auth.admin.createUser({
        email: lecturerEmail,
        password: lecturerPassword,
        email_confirm: true,
        user_metadata: { full_name: `Bridge lecturer ${suffix}` },
        app_metadata: { preapproved: true },
      });
    expect(lecturerError).toBeNull();
    lecturerId = lecturer.user!.id;
    runLocalSql(`
      begin;
      select set_config('app.basic_medical_registration_mutation', 'true', true);
      update public.profiles set is_active = true where id = '${lecturerId}';
      insert into public.user_roles (user_id, role) values ('${lecturerId}', 'lecturer');
      insert into public.profile_room_types (profile_id, room_type_id, receive_schedule_emails)
      select '${lecturerId}', id, false from public.room_types where code = 'basic_medical';
      insert into public.courses (id, course_code, course_name, room_type_id, is_active)
      select '${courseId}', 'BRIDGE-${suffix}', 'PR19 compatibility bridge', id, true
      from public.room_types where code = 'basic_medical';
      insert into public.rooms (id, room_code, building_code, room_type_id, capacity, is_active)
      select '${roomId}', 'BR-${suffix}', 'QA', id, 20, true
      from public.room_types where code = 'basic_medical';
      insert into public.basic_medical_equipment_catalog
        (id, item_name, commercial_name, unit, is_active)
      values
        ('${catalogId}', 'Bridge item ${suffix}', 'Bridge commercial ${suffix}', 'Bộ', true);
      insert into public.basic_medical_room_inventory
        (id, room_id, catalog_item_id, total_quantity, good_quantity, damaged_quantity, is_active)
      values ('${inventoryId}', '${roomId}', '${catalogId}', 5, 5, 0, true);
      insert into public.basic_medical_registrations
        (id, academic_year, semester, start_date, end_date, course_id, room_id,
         student_count, registrant_id, responsible_lecturer_id, note, created_by)
      values
        ('${registrationId}', '2045-2046', 'HK1', '${yesterday}', '${yesterday}',
         '${courseId}', '${roomId}', 10, '${lecturerId}', '${lecturerId}',
         'PR19 bridge ${suffix}', '${lecturerId}');
      insert into public.class_schedules
        (id, course_id, course_code_snapshot, course_name_snapshot, room_id,
         lecturer_id, schedule_date, start_time, end_time, source, schedule_status,
         student_count, basic_medical_registration_id, created_by, published_by, published_at)
      values
        ('${scheduleId}', '${courseId}', 'BRIDGE-${suffix}', 'PR19 compatibility bridge',
         '${roomId}', '${lecturerId}', '${yesterday}', '07:00', '09:00', 'manual',
         'published', 10, '${registrationId}', '${lecturerId}', '${lecturerId}', clock_timestamp());
      insert into public.basic_medical_registration_sessions
        (id, registration_id, class_schedule_id, lesson_title, teaching_lecturer_id, session_number)
      values
        ('${sessionId}', '${registrationId}', '${scheduleId}', 'Bridge session ${suffix}',
         '${lecturerId}', 1);
      commit;
    `);

    await loginAsLecturer(page, lecturerEmail, lecturerPassword);
    await page.goto(
      `/basic-medical/registrations?q=BRIDGE-${suffix}&status=incomplete`,
    );
    await page
      .locator(".equipment-request-course-button")
      .filter({ hasText: `BRIDGE-${suffix}` })
      .click();
    await page.locator(".basic-medical-confirm-button").click();
    const modal = page.locator(".basic-medical-confirmation-modal");
    await expect(modal).toBeVisible();
    await modal.locator(".signature-modal-actions .button-primary").click();
    const canvas = modal.locator("canvas");
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 10, box!.y + 10);
    await page.mouse.down();
    await page.mouse.move(box!.x + 80, box!.y + 35, { steps: 4 });
    await page.mouse.up();
    await modal.locator(".signature-modal-actions .button-primary").click();
    await expect(modal).toBeHidden();

    confirmationId = runLocalSql(
      `select id from public.basic_medical_session_confirmations where session_id = '${sessionId}';`,
    );
    expect(confirmationId).toMatch(/^[0-9a-f-]{36}$/i);
    await page.goto(
      `/basic-medical/registrations?q=BRIDGE-${suffix}&status=completed`,
    );
    await page
      .locator(".equipment-request-course-button")
      .filter({ hasText: `BRIDGE-${suffix}` })
      .click();

    const evidenceEnabled =
      process.env.BASIC_MEDICAL_CONFIRMATION_EVIDENCE_ENABLED === "true";
    const evidenceLink = page.locator(
      `a[href="/basic-medical/registrations/confirmations/${confirmationId}"]`,
    );
    if (evidenceEnabled) {
      await expect(evidenceLink).toBeVisible();
      await expect(evidenceLink).toHaveText("Xem bằng chứng");
      await page.goto(
        `/basic-medical/registrations/confirmations/${confirmationId}`,
      );
      await expect(
        page.locator(".basic-medical-signature-image"),
      ).toBeVisible();
      await expect(page.getByText(`Bridge item ${suffix}`)).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: "ĐVT" }),
      ).toBeVisible();
    } else {
      await expect(evidenceLink).toHaveCount(0);
      const response = await page.goto(
        `/basic-medical/registrations/confirmations/${confirmationId}`,
      );
      expect(response?.status()).toBe(404);
      await expect(page.locator("body")).not.toContainText(
        "get_basic_medical_confirmation_evidence",
      );
    }
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors: unknown[] = [];
    try {
      runLocalSql(`
        begin;
        select set_config('app.basic_medical_registration_mutation', 'true', true);
        delete from public.basic_medical_equipment_condition_logs where inventory_id = '${inventoryId}';
        delete from public.basic_medical_session_equipment_checks where inventory_id = '${inventoryId}';
        delete from public.basic_medical_session_confirmations where session_id = '${sessionId}';
        delete from public.basic_medical_registration_sessions where id = '${sessionId}';
        delete from public.class_schedules where id = '${scheduleId}';
        delete from public.basic_medical_registrations where id = '${registrationId}';
        delete from public.basic_medical_room_inventory where id = '${inventoryId}';
        delete from public.basic_medical_equipment_catalog where id = '${catalogId}';
        delete from public.rooms where id = '${roomId}';
        delete from public.courses where id = '${courseId}';
        commit;
      `);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (lecturerId) {
      const { error } = await service.auth.admin.deleteUser(lecturerId);
      if (error) cleanupErrors.push(error);
    }
    if (primaryError) throw primaryError;
    if (cleanupErrors.length) {
      throw new AggregateError(cleanupErrors, "Bridge fixture cleanup failed");
    }
  }
});
