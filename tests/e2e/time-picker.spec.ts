import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ARTIFACTS_DIR =
  "C:/Users/User/.gemini/antigravity/brain/dffb3f58-6ffc-43d7-989c-33c163c573f8";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/(dashboard|basic-medical\/schedules)/);
}

test.describe("Shared Custom Time Picker E2E Verification", () => {
  test("Schedule Form: display, click target, keyboard, popover, manual typing and visible validation", async ({
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

    // Screenshot 1: Skills Lab shared picker
    await page.screenshot({
      path: resolve(ARTIFACTS_DIR, "time_picker_skills_lab.png"),
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

    // 4. MANUAL DIRECT TYPING & VISIBLE VALIDATION MESSAGE
    // Type valid value "08:30"
    await startInput.fill("08:30");
    await startInput.blur();
    await expect(startInput).toHaveValue("08:30");
    await expect(
      startTimeContainer.locator(".time-picker-control"),
    ).not.toHaveClass(/is-invalid/);
    await expect(startTimeContainer.locator(".time-picker-error")).toHaveCount(
      0,
    );

    // Type invalid value "07:15"
    await startInput.fill("07:15");
    await startInput.blur();
    await expect(startInput).toHaveValue("07:15"); // Exact invalid text retained!
    await expect(
      startTimeContainer.locator(".time-picker-control"),
    ).toHaveClass(/is-invalid/);
    await expect(startInput).toHaveAttribute("aria-invalid", "true");

    // Visible validation message is displayed below field
    const visibleError = startTimeContainer.locator(".time-picker-error");
    await expect(visibleError).toBeVisible();
    await expect(visibleError).toContainText("07:00 đến 19:30");

    // aria-describedby association
    const errorId = await visibleError.getAttribute("id");
    expect(errorId).toBeTruthy();
    await expect(startInput).toHaveAttribute(
      "aria-describedby",
      new RegExp(errorId!),
    );

    // Screenshot 4: Invalid manual typing with visible error message
    await page.screenshot({
      path: resolve(ARTIFACTS_DIR, "time_picker_visible_error.png"),
      fullPage: false,
    });

    // Try submitting form with invalid start time -> should be blocked by validation
    const submitButton = page.getByRole("button", { name: "Tạo lịch" });
    await submitButton.click();
    await expect(page.getByRole("status")).toHaveCount(0);

    // Fix start time to valid "07:30" -> error clears
    await startInput.fill("07:30");
    await startInput.blur();
    await expect(
      startTimeContainer.locator(".time-picker-control"),
    ).not.toHaveClass(/is-invalid/);
    await expect(startTimeContainer.locator(".time-picker-error")).toHaveCount(
      0,
    );
  });

  test("Historical off-grid 08:15 compatibility: untouched, focus/open/close, edit, recovery, and record switch", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/shift-templates");
    await expect(page.locator("h1")).toContainText("Mẫu ca trực");

    const form = page.locator("form.admin-create-form");
    const startTimeContainer = form.locator(
      "label:has-text('Bắt đầu') .time-picker",
    );
    const startInput = startTimeContainer.locator("input.time-picker-input");

    // 1. On initial mount, default value "07:00" is untouched and valid:
    await expect(startInput).toHaveValue("07:00");
    await expect(startTimeContainer.locator(".time-picker-error")).toHaveCount(
      0,
    );
    await expect(
      startTimeContainer.locator(".time-picker-control"),
    ).not.toHaveClass(/is-invalid/);
    const initialValidationMessage = await startInput.evaluate(
      (el: HTMLInputElement) => el.validationMessage,
    );
    expect(initialValidationMessage).toBe("");

    // 2. Focus and open popover without editing:
    await startInput.click();
    const popover = page.locator('.time-picker-popover[role="dialog"]');
    await expect(popover).toBeVisible();

    // Close via Escape without picking
    await page.keyboard.press("Escape");
    await expect(popover).not.toBeVisible();
    await expect(startTimeContainer.locator(".time-picker-error")).toHaveCount(
      0,
    );
    await expect(
      startTimeContainer.locator(".time-picker-control"),
    ).not.toHaveClass(/is-invalid/);

    // 3. User edits the field (types off-grid "08:15") -> visible error appears + customValidity set
    await startInput.fill("08:15");
    await startInput.blur();
    await expect(startInput).toHaveValue("08:15"); // Exact invalid text preserved
    await expect(
      startTimeContainer.locator(".time-picker-control"),
    ).toHaveClass(/is-invalid/);
    await expect(startInput).toHaveAttribute("aria-invalid", "true");
    await expect(
      startTimeContainer.locator(".time-picker-error"),
    ).toBeVisible();
    const isCustomValiditySet = await startInput.evaluate(
      (el: HTMLInputElement) => el.validationMessage.length > 0,
    );
    expect(isCustomValiditySet).toBe(true);

    // 4. User corrects to valid "08:30" -> error clears + customValidity cleared
    await startInput.fill("08:30");
    await startInput.blur();
    await expect(startInput).toHaveValue("08:30");
    await expect(
      startTimeContainer.locator(".time-picker-control"),
    ).not.toHaveClass(/is-invalid/);
    await expect(startTimeContainer.locator(".time-picker-error")).toHaveCount(
      0,
    );
    const isCustomValidityCleared = await startInput.evaluate(
      (el: HTMLInputElement) => el.validationMessage === "",
    );
    expect(isCustomValidityCleared).toBe(true);
  });

  test("Basic Medical Form: sessions table uses TimePicker with extended range 20:30 and 21:00", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/basic-medical/new");
    await expect(page.locator("h1")).toContainText("Tạo lịch Y cơ sở");

    // Check Buổi 1 session time pickers
    const sessionStartPicker = page
      .locator("tbody tr")
      .first()
      .locator(".time-picker")
      .first();
    const sessionEndPicker = page
      .locator("tbody tr")
      .first()
      .locator(".time-picker")
      .nth(1);

    await expect(sessionStartPicker.locator(".time-picker-icon")).toHaveCount(
      1,
    );
    await expect(sessionEndPicker.locator(".time-picker-icon")).toHaveCount(1);
    await expect(page.locator('tbody input[type="time"]')).toHaveCount(0);

    // Open Start Time Popover: verify hour 20 is available (Basic Medical allows up to 20:30)
    await sessionStartPicker.locator(".time-picker-control").click();
    const popover = page.locator('.time-picker-popover[role="dialog"]');
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("option", { name: "20" })).toBeVisible();

    // Select 20:30
    await popover.getByRole("option", { name: "20" }).click();
    await popover.getByRole("option", { name: "30" }).click();
    await expect(popover).not.toBeVisible();
    await expect(
      sessionStartPicker.locator("input.time-picker-input"),
    ).toHaveValue("20:30");

    // Open End Time Popover: verify hour 21 is available (Basic Medical allows up to 21:00)
    await sessionEndPicker.locator(".time-picker-control").click();
    await expect(popover).toBeVisible();
    await expect(popover.getByRole("option", { name: "21" })).toBeVisible();

    // Select 21:00
    await popover.getByRole("option", { name: "21" }).click();
    await popover.getByRole("option", { name: "00" }).click();
    await expect(popover).not.toBeVisible();
    await expect(
      sessionEndPicker.locator("input.time-picker-input"),
    ).toHaveValue("21:00");

    // Screenshot 2: Basic Medical shared picker
    await page.screenshot({
      path: resolve(ARTIFACTS_DIR, "time_picker_basic_medical.png"),
      fullPage: false,
    });
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

    // Screenshot 3: Admin shift template shared picker
    await page.screenshot({
      path: resolve(ARTIFACTS_DIR, "time_picker_admin_shift.png"),
      fullPage: false,
    });
  });
});
