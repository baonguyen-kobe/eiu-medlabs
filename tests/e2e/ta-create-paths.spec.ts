import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertLocalDestructiveTestTarget,
  resolveEffectiveSupabaseTestConfig,
} from "../helpers/local-test-safety.mjs";
import { clickUntilState, openCombobox } from "./helpers/interaction-readiness";

type LocalServiceConfig = {
  supabaseUrl: string;
  publishableKey: string;
  secretKey: string;
};

type FixtureUser = {
  id: string;
  email: string;
  password: string;
};

async function loadLocalServiceConfig(): Promise<LocalServiceConfig> {
  const envText = await readFile(
    new URL("../../.env.local", import.meta.url),
    "utf8",
  );
  const fileEnv = Object.fromEntries(
    envText
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const [key, ...value] = line.split("=");
        return [key, value.join("=")];
      }),
  );
  const config = resolveEffectiveSupabaseTestConfig(process.env, fileEnv);
  assertLocalDestructiveTestTarget({
    supabaseUrl: config.supabaseUrl,
    playwrightBaseUrl: process.env.PLAYWRIGHT_BASE_URL,
  });
  if (!config.supabaseUrl || !config.publishableKey || !config.secretKey) {
    throw new Error("Missing local Supabase E2E configuration.");
  }
  return config;
}

function serviceClient(config: LocalServiceConfig) {
  return createClient(config.supabaseUrl, config.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function login(
  page: Page,
  email: string,
  password: string,
  expectedLanding = /\/dashboard$/,
) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(expectedLanding);
}

async function createManualSchedule(
  page: Page,
  service: SupabaseClient,
  marker: string,
  date: string,
  selectLecturer: boolean,
) {
  await page.goto("/schedule-entry/new");
  await openCombobox(
    page.getByRole("combobox", { name: "Tìm và chọn môn học" }),
  );
  await page.getByRole("listbox").getByRole("option").first().click();
  if (selectLecturer) {
    await openCombobox(
      page.getByRole("combobox", {
        name: "Tìm và chọn giảng viên thứ nhất",
      }),
    );
    const lecturerOptions = page
      .getByRole("listbox")
      .getByRole("option")
      .filter({ hasNotText: "Chưa chọn giảng viên" });
    await expect(lecturerOptions.filter({ hasText: "Nguyễn An" })).toHaveCount(
      0,
    );
    await lecturerOptions.first().click();
  }
  await page.locator('select[name="room_id"]').selectOption({ index: 1 });
  await page.locator('input[name="schedule_date"]').fill(date);
  await page.locator('input[name="start_time"]').fill("07:30");
  await page.locator('input[name="end_time"]').fill("11:30");
  await page.locator('textarea[name="note"]').fill(marker);
  await clickUntilState(
    page.getByRole("button", { name: "Tạo lịch", exact: true }),
    () =>
      expect(page.getByRole("status")).toHaveText("Đã tạo lịch thành công.", {
        timeout: 1_000,
      }),
  );

  const { data, error } = await service
    .from("class_schedules")
    .select("id,lecturer_id")
    .eq("note", marker)
    .single();
  expect(error).toBeNull();
  expect(data?.id).toBeTruthy();
  expect(data?.lecturer_id).toBeTruthy();
  return data as { id: string; lecturer_id: string };
}

async function createEquipmentRequest(
  page: Page,
  service: SupabaseClient,
  schedule: { id: string; lecturer_id: string },
  catalog: { id: string; item_name: string; commercial_name: string },
  userId: string,
  date: string,
) {
  await page.goto(`/equipment/register?schedule=${schedule.id}`);
  await clickUntilState(
    page.getByRole("button", {
      name: "+ Tạo bảng thiết bị",
      exact: true,
    }),
    () =>
      expect(page.locator(".equipment-skill-card")).toBeVisible({
        timeout: 1_000,
      }),
  );
  await page
    .locator('select[name="class_schedule_id"]')
    .selectOption(schedule.id);
  await page.locator('select[name="semester"]').selectOption("HK1");
  await page
    .locator('select[name="responsible_lecturer_id"]')
    .selectOption(schedule.lecturer_id);
  await page.locator('input[name="receive_date"]').fill(date);
  await page.locator('select[name="receive_time"]').selectOption("09:00");
  await page.locator('input[name="return_date"]').fill(date);
  await page.locator('select[name="return_time"]').selectOption("16:00");
  await page.getByRole("button", { name: "Xóa", exact: true }).last().click();
  await page.getByRole("button", { name: "Xóa", exact: true }).last().click();
  await page
    .locator('input[list="equipment-skill-suggestions"]')
    .fill("Kỹ năng M2 E2E");
  await page
    .getByRole("combobox", { name: "Tên thiết bị dòng 1, kỹ năng 1" })
    .click();
  await page
    .getByRole("option", { name: catalog.item_name, exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Tên thương mại dòng 1, kỹ năng 1" })
    .click();
  await page.getByRole("option", { name: catalog.commercial_name }).click();
  await page.getByRole("button", { name: "Gửi đăng ký", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Đã tạo phiếu đăng ký thiết bị.",
  );

  const { data, error } = await service
    .from("equipment_requests")
    .select("id,registrant_id")
    .eq("class_schedule_id", schedule.id)
    .eq("registrant_id", userId)
    .single();
  expect(error).toBeNull();
  expect(data?.id).toBeTruthy();
  return data?.id as string;
}

async function cleanupCreatePathFixtures(
  service: SupabaseClient,
  scheduleId?: string,
  catalogId?: string,
) {
  if (scheduleId) {
    await service
      .from("equipment_requests")
      .delete()
      .eq("class_schedule_id", scheduleId);
    await service.from("class_schedules").delete().eq("id", scheduleId);
  }
  if (catalogId) {
    await service.from("equipment_catalog").delete().eq("id", catalogId);
  }
}

async function createUnscopedTeachingAssistant(
  service: SupabaseClient,
): Promise<FixtureUser> {
  const email = `m2-e2e-unscoped-${crypto.randomUUID()}@campus.local`;
  const password = "LocalM2E2E123!";
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { preapproved: true },
    user_metadata: { full_name: "M2 E2E Unscoped TA" },
  });
  expect(error).toBeNull();
  const id = data.user?.id;
  expect(id).toBeTruthy();
  if (!id) throw new Error("Unable to create local unscoped TA fixture.");

  expect(
    (
      await service
        .from("profiles")
        .update({ is_active: true, phone: "0901234567" })
        .eq("id", id)
    ).error,
  ).toBeNull();
  expect(
    (
      await service
        .from("user_roles")
        .upsert({ user_id: id, role: "teaching_assistant" })
    ).error,
  ).toBeNull();
  expect(
    (
      await service
        .from("profile_room_types")
        .update({ room_type_id: "40000000-0000-0000-0000-000000000002" })
        .eq("profile_id", id)
    ).error,
  ).toBeNull();
  return { id, email, password };
}

test("scoped Teaching Assistant creates a Skills schedule and equipment request through the UI", async ({
  page,
}) => {
  const config = await loadLocalServiceConfig();
  const service = serviceClient(config);
  const marker = `M2-09 TA ${crypto.randomUUID()}`;
  const date = "2051-12-17";
  let scheduleId: string | undefined;
  let catalogId: string | undefined;

  try {
    const { data: assistant, error: assistantError } = await service
      .from("profiles")
      .select("id")
      .eq("email", "trogiang@campus.local")
      .single();
    expect(assistantError).toBeNull();
    expect(assistant?.id).toBeTruthy();

    catalogId = crypto.randomUUID();
    const catalog = {
      id: catalogId,
      item_name: `Thiết bị M2 ${marker}`,
      commercial_name: `Thương mại M2 ${marker}`,
    };
    expect(
      (
        await service.from("equipment_catalog").insert({
          ...catalog,
          unit: "Cái",
        })
      ).error,
    ).toBeNull();

    await login(page, "trogiang@campus.local", "LocalAssistant123!");
    const schedule = await createManualSchedule(
      page,
      service,
      marker,
      date,
      true,
    );
    scheduleId = schedule.id;
    await createEquipmentRequest(
      page,
      service,
      schedule,
      catalog,
      assistant!.id,
      date,
    );
  } finally {
    await cleanupCreatePathFixtures(service, scheduleId, catalogId);
  }
});

test("Lecturer remains able to create a Skills schedule and equipment request through the UI", async ({
  page,
}) => {
  const config = await loadLocalServiceConfig();
  const service = serviceClient(config);
  const marker = `M2-09 Lecturer ${crypto.randomUUID()}`;
  const date = "2051-12-18";
  let scheduleId: string | undefined;
  let catalogId: string | undefined;

  try {
    const { data: lecturer, error: lecturerError } = await service
      .from("profiles")
      .select("id")
      .eq("email", "giangvien@campus.local")
      .single();
    expect(lecturerError).toBeNull();
    expect(lecturer?.id).toBeTruthy();

    catalogId = crypto.randomUUID();
    const catalog = {
      id: catalogId,
      item_name: `Thiết bị M2 ${marker}`,
      commercial_name: `Thương mại M2 ${marker}`,
    };
    expect(
      (
        await service.from("equipment_catalog").insert({
          ...catalog,
          unit: "Cái",
        })
      ).error,
    ).toBeNull();

    await login(page, "giangvien@campus.local", "LocalLecturer123!");
    const schedule = await createManualSchedule(
      page,
      service,
      marker,
      date,
      false,
    );
    scheduleId = schedule.id;
    await createEquipmentRequest(
      page,
      service,
      schedule,
      catalog,
      lecturer!.id,
      date,
    );
  } finally {
    await cleanupCreatePathFixtures(service, scheduleId, catalogId);
  }
});

test("Teaching Assistant without Skills scope is redirected from both create paths", async ({
  page,
}) => {
  const config = await loadLocalServiceConfig();
  const service = serviceClient(config);
  let fixture: FixtureUser | undefined;

  try {
    fixture = await createUnscopedTeachingAssistant(service);
    await login(
      page,
      fixture.email,
      fixture.password,
      /\/basic-medical\/schedules$/,
    );

    await page.goto("/schedule-entry/new");
    await page.waitForURL((url) => url.pathname !== "/schedule-entry/new");
    expect(new URL(page.url()).pathname).not.toBe("/schedule-entry/new");
    await page.goto("/equipment/register");
    await page.waitForURL((url) => url.pathname !== "/equipment/register");
    expect(new URL(page.url()).pathname).not.toBe("/equipment/register");
  } finally {
    if (fixture) await service.auth.admin.deleteUser(fixture.id);
  }
});
