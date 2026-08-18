import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  assertLocalDestructiveTestTarget,
  assertLocalSupabaseTarget,
} from "../helpers/local-test-safety.mjs";
import { clickUntilState, openCombobox } from "./helpers/interaction-readiness";

type LocalServiceConfig = { url: string; serviceKey: string };

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function loadLocalServiceConfig(): Promise<LocalServiceConfig> {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const envText = await readFile(
      new URL("../../.env.local", import.meta.url),
      "utf8",
    );
    const env = Object.fromEntries(
      envText
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const [key, ...value] = line.split("=");
          return [key, value.join("=")];
        }),
    );
    url = url || env.NEXT_PUBLIC_SUPABASE_URL;
    serviceKey = serviceKey || env.SUPABASE_SERVICE_ROLE_KEY;
  } catch {
    // Ignore missing env file
  }
  url = url || "http://127.0.0.1:54321";
  serviceKey =
    serviceKey ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
  return { url: url!, serviceKey: serviceKey! };
}

async function removeClassesForDate(
  date: string,
  { url, serviceKey }: LocalServiceConfig,
) {
  assertLocalSupabaseTarget(url);
  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: deleteError } = await client
    .from("class_schedules")
    .delete()
    .eq("schedule_date", date);
  expect(deleteError).toBeNull();
}

async function createManualClass(
  page: Page,
  date: string,
  courseIndex = 1,
  roomIndex = 1,
) {
  await page.goto("/schedule-entry/new");
  const courseCombobox = page.getByRole("combobox", {
    name: "Tìm và chọn môn học",
  });
  await openCombobox(courseCombobox);
  await page
    .getByRole("listbox")
    .getByRole("option")
    .nth(courseIndex - 1)
    .click();
  await page
    .locator('select[name="room_id"]')
    .selectOption({ index: roomIndex });
  await page.locator('select[name="semester"]').selectOption("HK1");
  await page.locator('input[name="schedule_date"]').fill(date);
  await page.locator('input[name="start_time"]').fill("07:30");
  await page.locator('input[name="end_time"]').fill("11:30");
  await page.getByRole("button", { name: "Tạo lịch" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã tạo lịch thành công.");
}

test("admin creates and removes a manual class schedule", async ({ page }) => {
  const serviceConfig = await loadLocalServiceConfig();
  assertLocalDestructiveTestTarget({
    supabaseUrl: serviceConfig.url,
    playwrightBaseUrl: process.env.PLAYWRIGHT_BASE_URL,
  });
  await loginAsAdmin(page);

  await removeClassesForDate("2035-12-15", serviceConfig);
  await createManualClass(page, "2035-12-15");

  await page.goto("/classes/open?period=day&date=2035-12-15");
  await expect(page.locator('tbody tr input[type="date"]').first()).toHaveValue(
    "2035-12-15",
  );
  await removeClassesForDate("2035-12-15", serviceConfig);
});

test("manual form fields and section headings share the approved desktop layout", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.goto("/schedule-entry/new");

  const lecturerBoxes = await page
    .locator(".lecturer-comboboxes > label")
    .evaluateAll((labels) =>
      labels.map((label) => {
        const box = label.getBoundingClientRect();
        return { top: box.top, width: box.width };
      }),
    );
  expect(lecturerBoxes).toHaveLength(2);
  expect(
    Math.abs(lecturerBoxes[0].top - lecturerBoxes[1].top),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(lecturerBoxes[0].width - lecturerBoxes[1].width),
  ).toBeLessThanOrEqual(1);

  const timeBoxes = await page
    .locator(".form-grid.four > label")
    .evaluateAll((labels) =>
      labels.map((label) => {
        const box = label.getBoundingClientRect();
        return { top: box.top, width: box.width };
      }),
    );
  expect(timeBoxes).toHaveLength(4);
  expect(new Set(timeBoxes.map((box) => Math.round(box.top))).size).toBe(1);
  expect(
    Math.max(...timeBoxes.map((box) => box.width)) -
      Math.min(...timeBoxes.map((box) => box.width)),
  ).toBeLessThanOrEqual(1);

  await expect(page.locator(".form-section-title-line").first()).toHaveCSS(
    "display",
    "flex",
  );
  const formHeadingStyle = await page
    .locator(".form-section-title h2")
    .first()
    .evaluate((heading) => {
      const style = getComputedStyle(heading);
      return {
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        textTransform: style.textTransform,
      };
    });
  const sectionNumberStyle = await page
    .locator(".form-section-number")
    .first()
    .evaluate((number) => {
      const style = getComputedStyle(number);
      return { fontSize: style.fontSize, fontWeight: style.fontWeight };
    });
  expect(sectionNumberStyle.fontSize).toBe(formHeadingStyle.fontSize);
  expect(sectionNumberStyle.fontWeight).toBe(formHeadingStyle.fontWeight);

  expect(formHeadingStyle).toMatchObject({
    color: "rgb(20, 64, 105)",
    fontSize: "16px",
    fontWeight: "800",
    textTransform: "uppercase",
  });

  await page.goto("/imports");
  await expect(
    page.locator(".data-toolbar .standard-section-heading"),
  ).toHaveCSS("text-transform", "uppercase");
  const importHeadingStyle = await page
    .locator(".data-toolbar .standard-section-heading")
    .evaluate((heading) => {
      const style = getComputedStyle(heading);
      return {
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        textTransform: style.textTransform,
      };
    });
  expect(importHeadingStyle).toEqual(formHeadingStyle);
});

test("calendar stacks classes in one session and opens every class directly", async ({
  page,
}) => {
  const serviceConfig = await loadLocalServiceConfig();
  assertLocalDestructiveTestTarget({
    supabaseUrl: serviceConfig.url,
    playwrightBaseUrl: process.env.PLAYWRIGHT_BASE_URL,
  });
  await loginAsAdmin(page);
  await removeClassesForDate("2035-12-16", serviceConfig);

  try {
    await createManualClass(page, "2035-12-16", 1, 1);
    await createManualClass(page, "2035-12-16", 2, 2);
    await createManualClass(page, "2035-12-16", 3, 3);

    await page.goto("/class-schedules?view=week&date=2035-12-16");
    const classCards = page.locator(".slot-event-class");
    await expect(classCards).toHaveCount(3);

    for (let index = 0; index < 3; index += 1) {
      const detailDrawer = page.getByLabel("Chi tiết lịch");
      await clickUntilState(classCards.nth(index), () =>
        expect(detailDrawer).toBeVisible({ timeout: 1_000 }),
      );
      await detailDrawer
        .getByRole("button", { name: "Đóng", exact: true })
        .click();
      await expect(detailDrawer).toHaveCount(0);
    }
  } finally {
    await removeClassesForDate("2035-12-16", serviceConfig);
  }
});
