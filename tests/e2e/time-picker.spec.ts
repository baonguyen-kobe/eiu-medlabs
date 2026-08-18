import nextEnv from "@next/env";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const ARTIFACTS_DIR =
  "C:/Users/User/.gemini/antigravity/brain/dffb3f58-6ffc-43d7-989c-33c163c573f8";

// Service-role client — can bypass RLS for fixture insert/cleanup
const serviceDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Seed UUIDs from supabase/seed.sql
const SEED_COURSE_ID = "10000000-0000-0000-0000-000000000001"; // NUR 101
const SEED_ROOM_ID = "20000000-0000-0000-0000-000000000001"; // Skills Lab 1

async function getAdminUserId(): Promise<string> {
  const { data } = await serviceDb
    .from("profiles")
    .select("id")
    .eq("email", "admin@campus.local")
    .single();
  if (!data?.id) throw new Error("Admin profile not found in test DB");
  return data.id;
}

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

  // C8: Create form – new inputs continue to enforce strict validation from first edit
  test("C8 — Create form: new off-grid input triggers validation immediately on edit", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/schedule-entry/new");
    await expect(page.locator("h1")).toContainText("Tạo lịch Skills lab");

    const startTimeContainer = page.locator(
      "label:has-text('Giờ bắt đầu *') .time-picker",
    );
    const startInput = startTimeContainer.locator("input.time-picker-input");

    // Initial state: "07:30" default is valid and untouched
    await expect(startInput).toHaveValue("07:30");
    await expect(startTimeContainer.locator(".time-picker-error")).toHaveCount(
      0,
    );
    await expect(
      startTimeContainer.locator(".time-picker-control"),
    ).not.toHaveClass(/is-invalid/);

    // User types off-grid "08:15" -> must trigger validation immediately
    await startInput.fill("08:15");
    await startInput.blur();
    await expect(startInput).toHaveValue("08:15");
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
  });

  /**
   * C1–C7: Historical off-grid compatibility using real DB fixture
   *
   * Strategy: insert a class_schedule with start_time=08:15 via serviceDb,
   * navigate to the dashboard, open the detail drawer for that event, and
   * verify the TimePicker treats 08:15 as grandfathered (C1, C2).
   * Then test edit (C3), recovery (C4), different-value switch (C5),
   * same-value switch (C6 — CRITICAL), and parent echo (C7).
   */
  test("C1–C7 — Historical off-grid 08:15 compatibility via DB fixture: initial load, interaction, edit, recovery, same-value record switch", async ({
    page,
  }) => {
    const adminId = await getAdminUserId();
    // Use a date far in the future to avoid collision with other test data
    const fixtureDate = "2047-11-17";

    // Insert two class_schedule fixtures:
    //   Event A: start_time=08:15, end_time=11:30 (off-grid start — historical)
    //   Event B: start_time=08:15, end_time=13:30 (SAME start time — critical C6 case)
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();

    try {
      const { error: insertError } = await serviceDb
        .from("class_schedules")
        .insert([
          {
            id: idA,
            course_id: SEED_COURSE_ID,
            course_code_snapshot: "NUR 101",
            course_name_snapshot: "Thăm khám thể chất",
            room_id: SEED_ROOM_ID,
            schedule_date: fixtureDate,
            start_time: "08:15",
            end_time: "11:30",
            source: "manual",
            schedule_status: "draft",
            created_by: adminId,
          },
          {
            id: idB,
            course_id: SEED_COURSE_ID,
            course_code_snapshot: "NUR 101",
            course_name_snapshot: "Thăm khám thể chất",
            // Use a different room to avoid room-overlap constraint
            room_id: "20000000-0000-0000-0000-000000000002",
            schedule_date: fixtureDate,
            start_time: "08:15", // SAME start_time as A — C6 critical case
            end_time: "13:30",
            source: "manual",
            schedule_status: "draft",
            created_by: adminId,
          },
        ]);

      if (insertError) throw insertError;

      await loginAsAdmin(page);
      await page.goto(`/class-schedules?view=week&date=${fixtureDate}`);

      // Find and open event A (08:15–11:30)
      const eventA = page
        .locator(".slot-event-class")
        .filter({
          hasText: "08:15",
        })
        .filter({ hasText: "11:30" })
        .first();
      await expect(eventA).toBeVisible({ timeout: 15_000 });
      await eventA.click();

      const drawer = page.getByLabel("Chi tiết lịch");
      await expect(drawer).toBeVisible();

      const startTimeEditor = drawer.locator(
        '.drawer-time-editor .time-picker:has(input[aria-label="Giờ bắt đầu"])',
      );
      const startInput = startTimeEditor.locator("input.time-picker-input");

      // C1: Initial historical off-grid mount
      // TimePicker displays 08:15 with NO error state, NO aria-invalid, empty customValidity
      await expect(startInput).toHaveValue("08:15");
      await expect(startTimeEditor.locator(".time-picker-error")).toHaveCount(
        0,
      );
      await expect(
        startTimeEditor.locator(".time-picker-control"),
      ).not.toHaveClass(/is-invalid/);
      await expect(startInput).not.toHaveAttribute("aria-invalid");
      const c1CustomValidity = await startInput.evaluate(
        (el: HTMLInputElement) => el.validationMessage,
      );
      expect(c1CustomValidity).toBe("");

      // C2: Interaction without edit — focus, open picker, Escape, blur
      await startInput.click();
      const popover = page.locator('.time-picker-popover[role="dialog"]');
      await expect(popover).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(popover).not.toBeVisible();
      // Still grandfathered after open/close
      await expect(startTimeEditor.locator(".time-picker-error")).toHaveCount(
        0,
      );
      await expect(
        startTimeEditor.locator(".time-picker-control"),
      ).not.toHaveClass(/is-invalid/);
      const c2CustomValidity = await startInput.evaluate(
        (el: HTMLInputElement) => el.validationMessage,
      );
      expect(c2CustomValidity).toBe("");

      // C3: Edit same value — user types 08:15 -> now invalid (dirty)
      await startInput.fill("08:15");
      await startInput.blur();
      await expect(startInput).toHaveValue("08:15");
      await expect(startTimeEditor.locator(".time-picker-control")).toHaveClass(
        /is-invalid/,
      );
      await expect(startInput).toHaveAttribute("aria-invalid", "true");
      await expect(startTimeEditor.locator(".time-picker-error")).toBeVisible();
      const c3CustomValidity = await startInput.evaluate(
        (el: HTMLInputElement) => el.validationMessage.length > 0,
      );
      expect(c3CustomValidity).toBe(true);

      // C4: Recovery — type valid 08:30 -> error clears
      await startInput.fill("08:30");
      await startInput.blur();
      await expect(startInput).toHaveValue("08:30");
      await expect(
        startTimeEditor.locator(".time-picker-control"),
      ).not.toHaveClass(/is-invalid/);
      await expect(startTimeEditor.locator(".time-picker-error")).toHaveCount(
        0,
      );
      const c4CustomValidity = await startInput.evaluate(
        (el: HTMLInputElement) => el.validationMessage,
      );
      expect(c4CustomValidity).toBe("");

      // Close drawer
      await drawer.locator('button[aria-label="Đóng"]').click();
      await expect(drawer).not.toBeVisible();

      // C5: Different record, DIFFERENT value — open event B (08:15–13:30)
      // After editing A's start to 08:30 (dirty), now open B.
      // B's start is 08:15 (different end time = different event).
      const eventB = page
        .locator(".slot-event-class")
        .filter({
          hasText: "08:15",
        })
        .filter({ hasText: "13:30" })
        .first();
      await expect(eventB).toBeVisible({ timeout: 10_000 });
      await eventB.click();
      await expect(drawer).toBeVisible();

      // The TimePicker for event B's start must be grandfathered (untouched 08:15)
      const startInputB = drawer.locator(
        'input.time-picker-input[aria-label="Giờ bắt đầu"]',
      );
      const startTimeEditorB = drawer.locator(
        '.drawer-time-editor .time-picker:has(input[aria-label="Giờ bắt đầu"])',
      );
      await expect(startInputB).toHaveValue("08:15");
      await expect(
        startTimeEditorB.locator(".time-picker-control"),
      ).not.toHaveClass(/is-invalid/);
      await expect(startTimeEditorB.locator(".time-picker-error")).toHaveCount(
        0,
      );
      const c5CustomValidity = await startInputB.evaluate(
        (el: HTMLInputElement) => el.validationMessage,
      );
      expect(c5CustomValidity).toBe("");

      // C6 (CRITICAL): Same-value record switch
      // Make event B's start dirty (type 08:15 -> now invalid)
      await startInputB.fill("08:15");
      await startInputB.blur();
      await expect(
        startTimeEditorB.locator(".time-picker-control"),
      ).toHaveClass(/is-invalid/);
      // Now close and reopen event A — which also has start_time=08:15
      await drawer.locator('button[aria-label="Đóng"]').click();
      await expect(drawer).not.toBeVisible();

      // Reopen event A
      await eventA.click();
      await expect(drawer).toBeVisible();

      // C6: Event A's start is 08:15 but dirty state from B must NOT carry over
      // (baselineKey changed from idB to idA, even though value string "08:15" is the same)
      const startInputA2 = drawer.locator(
        'input.time-picker-input[aria-label="Giờ bắt đầu"]',
      );
      const startTimeEditorA2 = drawer.locator(
        '.drawer-time-editor .time-picker:has(input[aria-label="Giờ bắt đầu"])',
      );
      await expect(startInputA2).toHaveValue("08:15");
      await expect(
        startTimeEditorA2.locator(".time-picker-control"),
      ).not.toHaveClass(/is-invalid/);
      await expect(startTimeEditorA2.locator(".time-picker-error")).toHaveCount(
        0,
      );
      await expect(startInputA2).not.toHaveAttribute("aria-invalid");
      const c6CustomValidity = await startInputA2.evaluate(
        (el: HTMLInputElement) => el.validationMessage,
      );
      expect(c6CustomValidity).toBe("");

      // C7: Parent echo — make dirty with 08:15, then verify echo does NOT reset dirty
      // Re-dirty event A by typing 08:15 (currently grandfathered from C6 reset)
      await startInputA2.fill("08:15");
      await startInputA2.blur();
      await expect(
        startTimeEditorA2.locator(".time-picker-control"),
      ).toHaveClass(/is-invalid/);
      // The parent will echo "08:15" back via onChange -> value prop stays "08:15"
      // since the drawer's selectedStartTime is already "08:15" from the echo.
      // Verify the dirty state persists: still invalid (not reset by parent echo).
      await expect(startInputA2).toHaveValue("08:15");
      await expect(
        startTimeEditorA2.locator(".time-picker-control"),
      ).toHaveClass(/is-invalid/);
      await expect(startInputA2).toHaveAttribute("aria-invalid", "true");
      const c7CustomValidity = await startInputA2.evaluate(
        (el: HTMLInputElement) => el.validationMessage.length > 0,
      );
      expect(c7CustomValidity).toBe(true);

      await drawer.locator('button[aria-label="Đóng"]').click();
    } finally {
      await serviceDb.from("class_schedules").delete().in("id", [idA, idB]);
    }
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

    // C9: Basic Medical — after selecting 20:30, the control must not show is-invalid
    // After selecting 20:30 above, it should be valid and no error
    await expect(
      page.locator("tbody tr").first().locator(".time-picker-control").first(),
    ).not.toHaveClass(/is-invalid/);

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
