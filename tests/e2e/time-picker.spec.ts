import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { clickUntilState } from "./helpers/interaction-readiness";

const ARTIFACTS_DIR =
  "C:/Users/User/.gemini/antigravity/brain/dffb3f58-6ffc-43d7-989c-33c163c573f8";

async function loginAsAdmin(page: Page) {
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

test.describe("Shared Custom Time Picker E2E Verification", () => {
  test("Schedule Form: display, click target, keyboard, popover, manual typing and validation", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/schedule-entry/new");
    await expect(page.locator("h1")).toContainText("Tạo lịch Skills lab");

    const startTimeContainer = page.locator(
      "label:has-text('Giờ bắt đầu *') .time-picker",
    );
    const endTimeContainer = page.locator(
      "label:has-text('Giờ kết thúc *') .time-picker",
    );

    // 1. DISPLAY CHECKS
    // Exactly 1 clock icon per field
    await expect(startTimeContainer.locator(".time-picker-icon")).toHaveCount(
      1,
    );
    await expect(endTimeContainer.locator(".time-picker-icon")).toHaveCount(1);

    // No input[type="time"]
    await expect(page.locator('input[type="time"]')).toHaveCount(0);

    // Inputs have type="text" and numeric inputMode
    const startInput = startTimeContainer.locator("input.time-picker-input");
    const endInput = endTimeContainer.locator("input.time-picker-input");
    await expect(startInput).toHaveAttribute("type", "text");
    await expect(startInput).toHaveAttribute("inputmode", "numeric");
    await expect(startInput).toHaveValue("07:30");
    await expect(endInput).toHaveValue("11:30");

    // Screenshot 1: Closed field
    await page.screenshot({
      path: resolve(ARTIFACTS_DIR, "time_picker_closed.png"),
      fullPage: false,
    });

    // 2. CLICK TARGET CHECKS
    // A. Click the Clock icon -> opens popover
    const startIcon = startTimeContainer.locator(".time-picker-icon");
    await startIcon.click({ force: true });
    const popover = page.locator('.time-picker-popover[role="dialog"]');
    await expect(popover).toBeVisible();

    // Verify two columns: Giờ and Phút
    await expect(
      popover.locator(".time-picker-column-header").first(),
    ).toHaveText("Giờ");
    await expect(
      popover.locator(".time-picker-column-header").nth(1),
    ).toHaveText("Phút");

    // Verify preselection for 07:30
    await expect(
      popover
        .locator(".time-picker-column")
        .first()
        .locator(".time-picker-option.selected"),
    ).toHaveText("07");
    await expect(
      popover
        .locator(".time-picker-column")
        .nth(1)
        .locator(".time-picker-option.selected"),
    ).toHaveText("30");

    // Screenshot 2: Open picker
    await page.screenshot({
      path: resolve(ARTIFACTS_DIR, "time_picker_open.png"),
      fullPage: false,
    });

    // Close via Escape key
    await page.keyboard.press("Escape");
    await expect(popover).not.toBeVisible();

    // B. Click time text -> opens popover
    await startInput.click();
    await expect(popover).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popover).not.toBeVisible();

    // C. Click blank area inside container -> opens popover
    await startTimeContainer
      .locator(".time-picker-control")
      .click({ position: { x: 120, y: 15 } });
    await expect(popover).toBeVisible();

    // 3. POPOVER SELECTION INTERACTION
    // Select Hour 14 -> stays open, value updates to 14:30
    await popover
      .locator(".time-picker-column")
      .first()
      .getByRole("option", { name: "14" })
      .click();
    await expect(popover).toBeVisible();
    await expect(startInput).toHaveValue("14:30");

    // Select Minute 00 -> completes selection, value becomes 14:00, popover closes
    await popover
      .locator(".time-picker-column")
      .nth(1)
      .getByRole("option", { name: "00" })
      .click();
    await expect(popover).not.toBeVisible();
    await expect(startInput).toHaveValue("14:00");

    // 4. MANUAL DIRECT TYPING & VALIDATION
    // Type valid value "08:30"
    await startInput.fill("08:30");
    await startInput.blur();
    await expect(startInput).toHaveValue("08:30");
    await expect(
      startTimeContainer.locator(".time-picker-control"),
    ).not.toHaveClass(/is-invalid/);

    // Type invalid value "07:15"
    await startInput.fill("07:15");
    await startInput.blur();
    await expect(startInput).toHaveValue("07:15"); // No silent normalization!
    await expect(
      startTimeContainer.locator(".time-picker-control"),
    ).toHaveClass(/is-invalid/);

    // Screenshot 3: Manual typing invalid state
    await page.screenshot({
      path: resolve(ARTIFACTS_DIR, "time_picker_manual_invalid.png"),
      fullPage: false,
    });

    // Try submitting form with invalid start time -> should be blocked by browser validation
    const submitButton = page.getByRole("button", { name: "Tạo lịch" });
    await submitButton.click();
    // Status message should NOT be "Đang lưu…" or success
    await expect(page.getByRole("status")).toHaveCount(0);

    // Fix start time to valid "07:30"
    await startInput.fill("07:30");
    await startInput.blur();
    await expect(
      startTimeContainer.locator(".time-picker-control"),
    ).not.toHaveClass(/is-invalid/);
  });

  test("Schedule Form: end_time > start_time validation prevents invalid submission", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/schedule-entry/new");
    await expect(page.locator("h1")).toContainText("Tạo lịch Skills lab");

    const startInput = page.locator(
      "label:has-text('Giờ bắt đầu *') input.time-picker-input",
    );
    const endInput = page.locator(
      "label:has-text('Giờ kết thúc *') input.time-picker-input",
    );

    // Set start time = 14:00, end time = 08:30 (end < start)
    await startInput.fill("14:00");
    await startInput.blur();
    await endInput.fill("08:30");
    await endInput.blur();

    // Select course, room, semester, date
    const courseCombobox = page.getByRole("combobox", {
      name: "Tìm và chọn môn học",
    });
    await courseCombobox.click();
    await page.getByRole("listbox").getByRole("option").first().click();
    await page.locator('select[name="room_id"]').selectOption({ index: 1 });
    await page.locator('select[name="semester"]').selectOption("HK1");
    await page.locator('input[name="schedule_date"]').fill("2048-09-10");

    await page.getByRole("button", { name: "Tạo lịch" }).click();
    // Action validation should return error message
    const errorMsg = page.locator(".form-error");
    await expect(errorMsg).toBeVisible();
    await expect(errorMsg).toContainText("sau giờ bắt đầu");
  });

  test("Admin shift templates form uses TimePicker with exact-one clock icon", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/shift-templates");
    await expect(page.locator("h1")).toContainText("Mẫu ca trực");

    const form = page.locator("form.admin-create-form");
    const startTimePicker = form.locator(
      "label:has-text('Bắt đầu') .time-picker",
    );
    const endTimePicker = form.locator(
      "label:has-text('Kết thúc') .time-picker",
    );

    await expect(startTimePicker.locator(".time-picker-icon")).toHaveCount(1);
    await expect(endTimePicker.locator(".time-picker-icon")).toHaveCount(1);
    await expect(page.locator('input[type="time"]')).toHaveCount(0);

    // Check defaults
    await expect(
      startTimePicker.locator("input.time-picker-input"),
    ).toHaveValue("07:00");
    await expect(endTimePicker.locator("input.time-picker-input")).toHaveValue(
      "11:30",
    );
  });
});
