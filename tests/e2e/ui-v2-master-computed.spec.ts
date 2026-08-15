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

async function assertTableRightEdge(
  page: import("@playwright/test").Page,
  selectors: {
    shell: string;
    viewport: string;
    table: string;
    ownsVisualShell?: boolean;
  },
) {
  const geometry = await page.evaluate((current) => {
    const shell = document.querySelector<HTMLElement>(current.shell);
    const viewport = document.querySelector<HTMLElement>(current.viewport);
    const table = document.querySelector<HTMLTableElement>(current.table);
    const lastHeader = table?.querySelector("thead th:last-child");
    const lastBody = table?.querySelector("tbody td:last-child");
    if (!shell || !viewport || !table || !lastHeader || !lastBody) {
      throw new Error("Expected table shell hierarchy is missing");
    }
    viewport.scrollLeft = viewport.scrollWidth;
    const rect = (element: Element) => {
      const value = element.getBoundingClientRect();
      return { right: value.right, width: value.width };
    };
    const style = getComputedStyle(viewport);
    return {
      shell: rect(shell),
      viewport: rect(viewport),
      table: rect(table),
      lastHeader: rect(lastHeader),
      lastBody: rect(lastBody),
      viewportClientWidth: viewport.clientWidth,
      scrollbarGutter: style.scrollbarGutter,
      borderTopWidth: style.borderTopWidth,
      borderRadius: style.borderRadius,
      overflowX: style.overflowX,
      paddingRight: style.paddingRight,
      backgroundColor: style.backgroundColor,
    };
  }, selectors);

  expect(geometry.scrollbarGutter).toBe("auto");
  expect(geometry.overflowX).toBe("auto");
  expect(geometry.paddingRight).toBe("0px");
  if (selectors.ownsVisualShell) {
    expect(geometry.borderTopWidth).toBe("1px");
    expect(geometry.borderRadius).not.toBe("0px");
    expect(geometry.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  } else {
    expect(geometry.borderTopWidth).toBe("0px");
    expect(geometry.borderRadius).toBe("0px");
    expect(geometry.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  }
  expect(geometry.table.width).toBeGreaterThanOrEqual(
    geometry.viewportClientWidth - 1,
  );
  // Border width plus subpixel rounding only; this must not mask a gutter.
  expect(
    Math.abs(geometry.shell.right - geometry.viewport.right),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(geometry.viewport.right - geometry.table.right),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(geometry.table.right - geometry.lastHeader.right),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs(geometry.table.right - geometry.lastBody.right),
  ).toBeLessThanOrEqual(1);
}

async function createDashboardScheduleFixture() {
  const scheduleId = crypto.randomUUID();
  const [courseResult, roomResult, principalsResult] = await Promise.all([
    serviceDb
      .from("courses")
      .select("id,course_code,course_name")
      .eq("is_active", true)
      .limit(1)
      .single(),
    serviceDb
      .from("rooms")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .single(),
    serviceDb
      .from("system_security_principals")
      .select("root_admin_id")
      .eq("singleton", true)
      .single(),
  ]);
  if (
    courseResult.error ||
    roomResult.error ||
    principalsResult.error ||
    !courseResult.data ||
    !roomResult.data ||
    !principalsResult.data
  ) {
    throw new Error("Dashboard table fixture prerequisites are missing");
  }
  const { data: lecturer, error: lecturerError } = await serviceDb
    .from("user_roles")
    .select("user_id")
    .eq("role", "lecturer")
    .neq("user_id", principalsResult.data.root_admin_id)
    .limit(1)
    .single();
  if (lecturerError || !lecturer) {
    throw lecturerError ?? new Error("Dashboard lecturer fixture is missing");
  }
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const { error } = await serviceDb.from("class_schedules").insert({
    id: scheduleId,
    course_id: courseResult.data.id,
    course_code_snapshot: courseResult.data.course_code,
    course_name_snapshot: courseResult.data.course_name,
    room_id: roomResult.data.id,
    lecturer_id: lecturer.user_id,
    schedule_date: date.toISOString().slice(0, 10),
    start_time: "08:00",
    end_time: "10:00",
    source: "manual",
    schedule_status: "published",
    student_count: 1,
    created_by: lecturer.user_id,
    published_by: lecturer.user_id,
    published_at: new Date().toISOString(),
  });
  if (error) throw error;
  return scheduleId;
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
  const dashboardFixtureId = await createDashboardScheduleFixture();
  const equipmentFixtureId = crypto.randomUUID();
  const { error: equipmentFixtureError } = await serviceDb
    .from("equipment_catalog")
    .insert({
      id: equipmentFixtureId,
      item_name: "UI V2 right-edge fixture",
      commercial_name: `UI V2 right-edge ${equipmentFixtureId}`,
      unit: "Cái",
      is_active: true,
    });
  if (equipmentFixtureError) throw equipmentFixtureError;
  try {
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
    await page.setViewportSize({ width: 1366, height: 720 });
    const [brand, firstHeading] = await page
      .locator(
        ".workspace-sidebar .brand-copy, .workspace-sidebar .nav-heading",
      )
      .evaluateAll((elements) =>
        elements.slice(0, 2).map((element) => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom };
        }),
      );
    expect(firstHeading.top - brand.bottom).toBeGreaterThanOrEqual(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await assertTableRightEdge(page, {
      shell: ".overview-schedule-panel",
      viewport: ".overview-schedule-panel .responsive-table",
      table: ".overview-schedule-table",
    });

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
    await assertTableRightEdge(page, {
      shell: ".equipment-catalog-panel",
      viewport: ".equipment-catalog-table-wrap",
      table: ".equipment-catalog-table",
    });

    await page.goto("/equipment/requests", { waitUntil: "networkidle" });
    const requestCount = page.locator(".equipment-filter-count").first();
    await expect(requestCount).toHaveCSS("height", "44px");
    await expect(requestCount).toHaveCSS("display", "inline-flex");
    await expect(requestCount).toHaveCSS("align-items", "center");
    await expect(requestCount).toHaveCSS("justify-content", "center");

    await page.goto("/admin/personnel", { waitUntil: "networkidle" });
    const personnelCount = page.locator(".personnel-result-count");
    await expect(personnelCount).toHaveCSS("height", "44px");
    await expect(personnelCount).toHaveCSS("display", "inline-flex");
    await expect(personnelCount).toHaveCSS("align-items", "center");
    await expect(personnelCount).toHaveCSS("justify-content", "center");
    const personnelTable = page.locator(".personnel-table-wrap");
    await expect(personnelTable).toHaveCSS("scrollbar-gutter", "auto");
    await expect(personnelTable.locator("th").first()).toHaveCSS(
      "text-align",
      "center",
    );
    await expect(personnelTable).toHaveCSS("padding-right", "0px");
    await assertTableRightEdge(page, {
      shell: ".personnel-table-wrap",
      viewport: ".personnel-table-wrap",
      table: ".personnel-table",
      ownsVisualShell: true,
    });

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
      await expect(
        page.locator(".catalog-data-table tr.is-editing"),
      ).toHaveCount(1);
      const after = await buttons.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().x),
      );
      expect(after).toEqual(before.map((item) => item.x));
      await page.getByRole("button", { name: "Hủy", exact: true }).click();
    };

    await assertStableCatalogActions("/admin/rooms");
    await assertStableCatalogActions("/admin/courses");
    await page.goto("/admin/rooms", { waitUntil: "networkidle" });
    await assertTableRightEdge(page, {
      shell: ".catalog-data-panel",
      viewport: ".catalog-data-panel .responsive-table",
      table: ".catalog-data-table",
    });

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
  } finally {
    await serviceDb
      .from("equipment_catalog")
      .delete()
      .eq("id", equipmentFixtureId);
    await serviceDb
      .from("class_schedules")
      .delete()
      .eq("id", dashboardFixtureId);
  }
});
