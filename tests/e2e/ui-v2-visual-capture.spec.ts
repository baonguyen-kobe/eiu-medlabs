import { expect, test } from "@playwright/test";
import { clickUntilState } from "./helpers/interaction-readiness";

const outputRoot =
  process.env.UI_CAPTURE_DIR ??
  "D:/Webapp/Lịch trực/_EIU_MEDLABS_LOCAL/reports/ui-v2/after";

const viewports = [
  { name: "1920", width: 1920, height: 1080 },
  { name: "1440", width: 1440, height: 1000 },
  { name: "1366", width: 1366, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "820", width: 820, height: 1180 },
  { name: "390", width: 390, height: 844 },
];

const routes = [
  ["dashboard", "/dashboard"],
  ["skills-calendar", "/class-schedules"],
  ["skills-create", "/schedule-entry/new"],
  ["personnel", "/admin/personnel"],
  ["equipment-catalog", "/admin/equipment"],
  ["catalog-rooms", "/admin/rooms"],
  ["catalog-courses", "/admin/courses"],
  ["my-equipment", "/equipment/mine"],
  ["equipment-requests", "/equipment/requests"],
  ["basic-medical-registrations", "/basic-medical/registrations"],
  ["basic-medical-calendar", "/basic-medical/schedules"],
  ["basic-medical-create", "/basic-medical/new"],
  ["skills-import", "/schedule-entry/import"],
  [
    "basic-medical-evidence",
    "/basic-medical/registrations/confirmations/00000000-0000-0000-0000-000000000000",
  ],
] as const;

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  const email = page.locator('input[name="email"]');
  const password = page.locator('input[name="password"]');
  const submit = page.getByRole("button", { name: "Đăng nhập", exact: true });
  await clickUntilState(
    submit,
    () =>
      expect(page).toHaveURL(/\/(dashboard|basic-medical\/schedules)/, {
        timeout: 1_000,
      }),
    async () => {
      await email.fill("admin@campus.local");
      await password.fill("LocalAdmin123!");
    },
  );
}

test("captures the approved UI V2 baseline surfaces", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);

  for (const viewport of viewports) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    for (const [name, route] of routes) {
      await page.goto(route, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toBeVisible();
      const horizontalOverflow = await page.evaluate(
        () =>
          Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth,
          ) - window.innerWidth,
      );
      expect(
        horizontalOverflow,
        `${name} must not create document-level horizontal overflow at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        fullPage: true,
        path: `${outputRoot}/${viewport.name}-${name}.png`,
      });
    }
  }

  await page.goto("/login", { waitUntil: "networkidle" });
  for (const viewport of viewports) {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.screenshot({
      fullPage: true,
      path: `${outputRoot}/${viewport.name}-login.png`,
    });
  }
});

test("captures a representative Skills calendar detail drawer", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/class-schedules?view=week&date=2026-07-31", {
    waitUntil: "networkidle",
  });
  const event = page.locator(".slot-event-class").first();
  const drawer = page.getByLabel("Chi tiết lịch");
  await clickUntilState(event, () => expect(drawer).toBeVisible());
  await page.screenshot({
    fullPage: true,
    path: `${outputRoot}/1440-skills-calendar-drawer.png`,
  });
  await drawer.getByRole("button", { name: "Đóng", exact: true }).click();
});
