import nextEnv from "@next/env";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { clickUntilState } from "./helpers/interaction-readiness";

nextEnv.loadEnvConfig(process.cwd());

const serviceDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

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
      await email.fill(process.env.E2E_ADMIN_EMAIL ?? "admin@campus.local");
      await password.fill(process.env.E2E_ADMIN_PASSWORD ?? "LocalAdmin123!");
    },
  );
}

test("canonical UI V2 shared geometry is applied in computed styles", async ({
  page,
}) => {
  const catalogFixtureId = crypto.randomUUID();
  const { error: catalogFixtureError } = await serviceDb
    .from("equipment_catalog")
    .insert({
      id: catalogFixtureId,
      item_name: "UI V2 computed fixture",
      commercial_name: `UI V2 computed ${catalogFixtureId}`,
      unit: "Cái",
      is_active: true,
    });
  if (catalogFixtureError) throw catalogFixtureError;
  try {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/dashboard", { waitUntil: "networkidle" });

    const topbar = page.locator(".workspace-topbar");
    await expect(topbar).toHaveCSS("position", "sticky");
    await expect(topbar).toHaveCSS("min-height", "82px");
    await expect(topbar).toHaveCSS("padding", "16px 30px");
    await expect(topbar).toHaveCSS("backdrop-filter", "blur(14px)");
    await expect(page.locator(".workspace-sidebar")).toHaveCSS(
      "width",
      "244px",
    );
    await expect(
      page.locator(".workspace-sidebar .nav-heading").first(),
    ).toHaveCSS("font-size", "14px");
    await expect(
      page.locator(".workspace-sidebar .nav-item").first(),
    ).toHaveCSS("font-size", "12px");

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
  } finally {
    await serviceDb
      .from("equipment_catalog")
      .delete()
      .eq("id", catalogFixtureId);
  }
});

test("table shells, counters, and catalog action slots retain Master geometry", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await expect(
    page.locator(".workspace-sidebar .brand-lockup strong"),
  ).toHaveCSS("font-size", "21.5px");
  await expect(
    page.locator(".workspace-sidebar .brand-lockup strong"),
  ).toHaveCSS("font-weight", "800");
  await expect(
    page.locator(".workspace-sidebar .brand-lockup strong"),
  ).toHaveCSS("line-height", "25.8px");
  await expect(
    page.locator(".workspace-sidebar .brand-lockup strong"),
  ).toHaveCSS("letter-spacing", "-0.5375px");
  await expect(
    page.locator(".workspace-sidebar .brand-lockup strong"),
  ).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(page.locator(".workspace-sidebar .brand-mark")).toHaveCSS(
    "height",
    "62px",
  );
  await expect(page.locator(".workspace-sidebar .brand-mark")).toHaveCSS(
    "padding",
    "8px 10px",
  );
  await expect(page.locator(".workspace-sidebar .brand-mark")).toHaveCSS(
    "border-radius",
    "12px",
  );
  await expect(
    page.locator(".overview-schedule-panel .responsive-table"),
  ).toHaveCSS("scrollbar-gutter", "auto");
  const dashboardEdges = await page
    .locator(
      ".overview-schedule-panel, .overview-schedule-panel .responsive-table",
    )
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
    );
  expect(
    Math.abs(dashboardEdges[0].right - dashboardEdges[1].right),
  ).toBeLessThanOrEqual(1);

  await page.goto("/admin/equipment", { waitUntil: "networkidle" });
  const catalogCount = page.locator(
    ".equipment-catalog-filters .equipment-catalog-count",
  );
  await expect(catalogCount).toHaveCSS("height", "44px");
  await expect(catalogCount).toHaveCSS("display", "inline-flex");
  await expect(catalogCount).toHaveCSS("align-items", "center");
  await expect(catalogCount).toHaveCSS("justify-content", "center");
  await expect(page.locator(".equipment-catalog-table-wrap")).toHaveCSS(
    "scrollbar-gutter",
    "auto",
  );
  await expect(page.locator(".equipment-catalog-table-wrap")).toHaveCSS(
    "padding-right",
    "0px",
  );

  await page.goto("/equipment/requests", { waitUntil: "networkidle" });
  const requestCount = page.locator(".equipment-filter-count").first();
  await expect(requestCount).toHaveCSS("height", "44px");
  await expect(requestCount).toHaveCSS("display", "inline-flex");
  await expect(requestCount).toHaveCSS("align-items", "center");
  await expect(requestCount).toHaveCSS("justify-content", "center");

  await page.goto("/admin/personnel", { waitUntil: "networkidle" });
  const personnelTable = page.locator(".personnel-table-wrap");
  await expect(personnelTable).toHaveCSS("scrollbar-gutter", "auto");
  await expect(personnelTable.locator("th").first()).toHaveCSS(
    "text-align",
    "center",
  );
  await expect(personnelTable).toHaveCSS("padding-right", "0px");

  const assertStableCatalogActions = async (route: string) => {
    await page.goto(route, { waitUntil: "networkidle" });
    const group = page.locator(".catalog-master-action-group");
    const buttons = group.locator("button");
    await expect(buttons).toHaveCount(4);
    await expect(buttons).toHaveText([
      "Kích hoạt",
      "Sửa",
      "Ngừng sử dụng",
      "Xóa",
    ]);
    const before = await buttons.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          x: box.x,
          width: box.width,
          minHeight: style.minHeight,
          whiteSpace: style.whiteSpace,
        };
      }),
    );
    expect(before.map((item) => item.width)).toEqual([154, 154, 154, 154]);
    expect(before.map((item) => item.minHeight)).toEqual([
      "42px",
      "42px",
      "42px",
      "42px",
    ]);
    expect(before.map((item) => item.whiteSpace)).toEqual([
      "nowrap",
      "nowrap",
      "nowrap",
      "nowrap",
    ]);
    await page
      .locator('.catalog-data-table tbody input[type="checkbox"]')
      .first()
      .check();
    await group.locator("button").nth(1).click();
    await expect(page.locator(".catalog-data-table tr.is-editing")).toHaveCount(
      1,
    );
    const after = await buttons.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().x),
    );
    expect(after).toEqual(before.map((item) => item.x));
    await page.getByRole("button", { name: "Hủy", exact: true }).click();
  };

  await assertStableCatalogActions("/admin/rooms");
  await assertStableCatalogActions("/admin/courses");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/rooms", { waitUntil: "networkidle" });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  const mobileCatalogActions = page.locator(
    ".catalog-master-action-group button",
  );
  await expect(mobileCatalogActions).toHaveCount(4);
  for (const action of await mobileCatalogActions.all()) {
    await expect(action).toBeVisible();
  }
});
