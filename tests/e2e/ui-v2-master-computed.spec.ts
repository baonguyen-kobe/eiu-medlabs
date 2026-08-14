import { expect, test } from "@playwright/test";
import { clickUntilState } from "./helpers/interaction-readiness";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");

  const email = page.locator('input[name="email"]');
  const password = page.locator('input[name="password"]');
  const submit = page.locator('button[type="submit"]');

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

test("canonical UI V2 shared geometry is applied in computed styles", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/dashboard", { waitUntil: "networkidle" });

  const topbar = page.locator(".workspace-topbar");
  await expect(topbar).toHaveCSS("position", "sticky");
  await expect(topbar).toHaveCSS("min-height", "82px");
  await expect(topbar).toHaveCSS("padding", "16px 30px");
  await expect(topbar).toHaveCSS("backdrop-filter", "blur(14px)");
  await expect(page.locator(".workspace-sidebar")).toHaveCSS("width", "244px");
  await expect(
    page.locator(".workspace-sidebar .nav-heading").first(),
  ).toHaveCSS("font-size", "14px");
  await expect(page.locator(".workspace-sidebar .nav-item").first()).toHaveCSS(
    "font-size",
    "12px",
  );

  await page.goto("/admin/equipment", { waitUntil: "networkidle" });
  const table = page.locator(".equipment-catalog-table");
  await expect(table.locator("th").first()).toHaveCSS("text-align", "center");
  await expect(table.locator("th").first()).toHaveCSS("padding", "14px 16px");
  await expect(table.locator("td").first()).toHaveCSS("padding", "14px 16px");
  await expect(
    table.locator("col.equipment-catalog-col-name").first(),
  ).toHaveCSS("width", "275px");
  await expect(
    table.locator("col.equipment-catalog-col-commercial-name"),
  ).toHaveCSS("width", "275px");
  await expect(
    table.locator("col.equipment-catalog-col-metadata").first(),
  ).toHaveCSS("width", "145px");

  const filter = page.locator(".equipment-catalog-filters select").first();
  await expect(filter).toHaveCSS("height", "44px");
  await filter.focus();
  await expect
    .poll(() =>
      filter.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          boxShadow: style.boxShadow,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
        };
      }),
    )
    .toEqual({
      boxShadow: "rgba(20, 64, 105, 0.12) 0px 0px 0px 3px",
      outlineStyle: "none",
      outlineWidth: "0px",
    });
});
