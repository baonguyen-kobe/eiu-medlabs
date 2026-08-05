import { expect, test, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function removeClassesForDate(
  page: Page,
  date: string,
  displayDate: string,
) {
  await page.goto(`/classes/open?period=day&date=${date}`);
  const matchingRows = page
    .locator("tbody tr")
    .filter({ hasText: displayDate });

  while (await matchingRows.count()) {
    const previousCount = await matchingRows.count();
    await matchingRows
      .first()
      .getByRole("button", { name: /Xóa lớp/ })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Xóa lịch học" }).click();
    await expect.poll(() => matchingRows.count()).toBeLessThan(previousCount);
  }
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
  await courseCombobox.click();
  await page
    .getByRole("listbox")
    .getByRole("option")
    .nth(courseIndex - 1)
    .click();
  await page
    .locator('select[name="room_id"]')
    .selectOption({ index: roomIndex });
  await page.locator('input[name="schedule_date"]').fill(date);
  await page.locator('input[name="start_time"]').fill("07:30");
  await page.locator('input[name="end_time"]').fill("11:30");
  await page.getByRole("button", { name: "Tạo lịch" }).click();
  await expect(page.getByRole("status")).toHaveText("Đã tạo lịch thành công.");
}

test("admin creates and removes a manual class schedule", async ({ page }) => {
  await loginAsAdmin(page);

  await removeClassesForDate(page, "2035-12-15", "15/12/2035");
  await createManualClass(page, "2035-12-15");

  await page.goto("/classes/open?period=day&date=2035-12-15");
  const createdRow = page
    .locator("tbody tr")
    .filter({ hasText: "15/12/2035" })
    .first();
  await expect(createdRow).toBeVisible();
  await removeClassesForDate(page, "2035-12-15", "15/12/2035");
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

  await page.goto("/dashboard");
  const overviewHeadingStyle = await page
    .locator(".overview-schedule-panel .overview-panel-heading > h2")
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
  expect(formHeadingStyle).toEqual(overviewHeadingStyle);

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
  expect(importHeadingStyle).toEqual(overviewHeadingStyle);
});

test("calendar stacks classes in one session and opens every class directly", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await removeClassesForDate(page, "2035-12-16", "16/12/2035");

  try {
    await createManualClass(page, "2035-12-16", 1, 1);
    await createManualClass(page, "2035-12-16", 2, 2);
    await createManualClass(page, "2035-12-16", 3, 3);

    await page.goto("/class-schedules?view=week&date=2035-12-16");
    const crowdedCell = page
      .locator(".period-cell-class")
      .filter({ has: page.locator(".slot-event-class") })
      .first();
    const classCards = crowdedCell.locator(".slot-event-class");
    await expect(classCards).toHaveCount(3);
    await expect(crowdedCell.locator(".slot-events")).toHaveCSS(
      "flex-direction",
      "column",
    );

    const cardPositions = await classCards.evaluateAll((cards) =>
      cards.map((card) => card.getBoundingClientRect().top),
    );
    expect(cardPositions[1]).toBeGreaterThan(cardPositions[0]);
    expect(cardPositions[2]).toBeGreaterThan(cardPositions[1]);
    expect((await crowdedCell.boundingBox())?.height ?? 0).toBeGreaterThan(190);

    for (let index = 0; index < 3; index += 1) {
      await classCards.nth(index).click();
      const detailDrawer = page.getByLabel("Chi tiết lịch");
      await expect(detailDrawer).toBeVisible();
      await detailDrawer
        .getByRole("button", { name: "Đóng", exact: true })
        .click();
      await expect(detailDrawer).toHaveCount(0);
    }
  } finally {
    await removeClassesForDate(page, "2035-12-16", "16/12/2035");
  }
});
