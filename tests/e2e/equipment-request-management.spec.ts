import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalDestructiveTestTarget } from "../helpers/local-test-safety.mjs";

test("mã phiếu 12 số tải được và Admin thấy dòng bổ sung thiết bị", async ({
  page,
}) => {
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
  assertLocalDestructiveTestTarget({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    playwrightBaseUrl: process.env.PLAYWRIGHT_BASE_URL,
  });
  const databaseClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const authClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: signedIn, error: signInError } =
    await authClient.auth.signInWithPassword({
      email: "admin@campus.local",
      password: "LocalAdmin123!",
    });
  expect(signInError).toBeNull();
  const adminId = signedIn.user?.id;
  expect(adminId).toBeTruthy();

  const { data: lecturerProfile } = await databaseClient
    .from("profiles")
    .select("id")
    .eq("email", "giangvien@campus.local")
    .single();
  expect(lecturerProfile).toBeTruthy();
  if (!lecturerProfile) {
    throw new Error("Missing lecturer test fixture");
  }
  const lecturerId = lecturerProfile.id;

  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  const requestId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const requestCode = "460820123456";

  let scheduleId: string | undefined;
  let catalogItemId: string | undefined;

  try {
    const { data: course } = await databaseClient
      .from("courses")
      .select("id, room_type_id")
      .eq("is_active", true)
      .limit(1)
      .single();
    expect(course).toBeTruthy();
    if (!course) {
      throw new Error("Missing course test fixture");
    }

    const { data: room } = await databaseClient
      .from("rooms")
      .select("id")
      .eq("room_type_id", course.room_type_id)
      .eq("is_active", true)
      .limit(1)
      .single();
    expect(room).toBeTruthy();
    if (!room) {
      throw new Error("Missing room test fixture");
    }

    catalogItemId = crypto.randomUUID();
    expect(
      (
        await databaseClient.from("equipment_catalog").insert({
          id: catalogItemId,
          item_name: `Thiết bị E2E ${suffix}`,
          commercial_name: `Thương mại E2E ${suffix}`,
          unit: "Cái",
        })
      ).error,
    ).toBeNull();
    const catalogItem = { id: catalogItemId };

    const { data: schedule, error: rpcError } = await authClient.rpc(
      "create_manual_class_schedule",
      {
        target_course_id: course.id,
        target_room_id: room.id,
        target_lecturer_id: lecturerId,
        target_lecturer_2_id: null,
        target_schedule_date: "2046-08-20",
        target_start_time: "07:30",
        target_end_time: "11:30",
        target_note: `E2E-${suffix} Kiểm thử quản lý phiếu thiết bị`,
        target_student_count: 20,
      },
    );
    expect(rpcError).toBeNull();
    scheduleId = schedule.id;

    expect(
      (
        await databaseClient.from("equipment_requests").insert({
          id: requestId,
          class_schedule_id: scheduleId,
          semester: "HK1",
          registrant_id: adminId!,
          responsible_lecturer_id: lecturerId,
          phone_snapshot: "0901000001",
          email_snapshot: "admin@campus.local",
          receive_at: "2046-08-19T09:00:00+07:00",
          return_at: "2046-08-20T16:00:00+07:00",
          note: `E2E-${suffix}`,
          status: "preparing",
          created_by: adminId!,
          created_at: "2046-08-20T12:34:56+07:00",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await databaseClient.from("equipment_request_items").insert({
          id: itemId,
          request_id: requestId,
          skill_name: "Kỹ năng E2E",
          catalog_item_id: catalogItem.id,
          quantity: 1,
        })
      ).error,
    ).toBeNull();

    await databaseClient
      .from("profiles")
      .update({ phone: "0901234567" })
      .eq("id", adminId);

    await page.goto("/login");
    await page.locator('input[name="email"]').fill("admin@campus.local");
    await page.locator('input[name="password"]').fill("LocalAdmin123!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto(`/equipment/register?mode=copy&request=${requestCode}`);
    await expect(page.locator(".equipment-form-mode-banner")).toContainText(
      `#${requestCode}`,
    );
    await expect(
      page.getByRole("button", { name: "Tạo phiếu sao chép", exact: true }),
    ).toBeVisible();

    const errors = await page.locator(".form-error").allInnerTexts();
    if (errors.length > 0) {
      console.log("FORM ERRORS:", errors);
    }
    await expect(page.locator(".form-error")).toHaveCount(0);

    await page.goto("/equipment/requests");
    await page.locator(".data-search input").fill(requestId);
    const requestRow = page.locator(".equipment-request-list-item").first();
    await expect(requestRow).toBeVisible();
    const statusStack = requestRow.locator(".equipment-request-status-stack");
    const statusControl = statusStack.locator(
      ".request-status, .equipment-sign-status-button",
    );
    const statusHeading = page.locator(".equipment-status-heading");
    const [headingBox, controlBox] = await Promise.all([
      statusHeading.boundingBox(),
      statusControl.boundingBox(),
    ]);
    expect(Math.abs(headingBox!.x - controlBox!.x)).toBeLessThan(1);

    await requestRow.locator(".equipment-request-summary").click();
    await requestRow
      .getByRole("button", { name: /Xem toàn bộ danh sách/ })
      .click();
    // Modal title will be something like "Phiếu thiết bị #...", but might not be requestCode.
    // Use the dialog role without specific name or find by DOM structure.
    const modal = page.getByRole("dialog");
    await expect(
      modal.getByRole("button", { name: "+ Thêm dòng" }),
    ).toBeVisible();
    await modal.getByRole("button", { name: "+ Thêm dòng" }).click();
    await expect(
      modal.getByRole("combobox", { name: /Tên thiết bị bổ sung/ }),
    ).toBeVisible();
    const itemNameCombobox = modal
      .getByRole("combobox", { name: /Tên thiết bị bổ sung dòng 1/ })
      .first();
    await itemNameCombobox.click();
    const suggestionList = page.locator(".searchable-combobox-portal");
    await expect(suggestionList).toBeVisible();
    await expect(suggestionList).toHaveCSS("z-index", "700");
    await modal
      .getByRole("combobox", { name: /Tên thương mại bổ sung dòng 1/ })
      .click();
    await expect(suggestionList).toBeVisible();
    await expect(suggestionList).toHaveCSS("z-index", "700");
    await expect(
      modal.getByRole("button", { name: "+ Thêm dòng" }),
    ).toBeVisible();
    await modal.getByRole("button", { name: "+ Thêm dòng" }).click();
    await expect(
      modal.getByRole("combobox", { name: /Tên thiết bị bổ sung/ }),
    ).toHaveCount(2);
    await expect(
      modal.getByRole("button", { name: "Lưu 2 dòng thiết bị" }),
    ).toBeDisabled();
    await modal
      .getByRole("button", { name: "Đóng danh sách trang thiết bị" })
      .click();

    await requestRow
      .getByRole("button", { name: "Đã giao", exact: true })
      .click();
    await expect(
      requestRow.locator(".equipment-request-detail-row"),
    ).toBeVisible();
    await expect(
      requestRow.getByRole("button", {
        name: "Ký xác nhận Đã giao",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".form-success")).toHaveCount(0);
  } finally {
    await databaseClient
      .from("equipment_requests")
      .delete()
      .eq("id", requestId);
    if (scheduleId) {
      await databaseClient
        .from("class_schedules")
        .delete()
        .eq("id", scheduleId);
    }
    if (catalogItemId) {
      await databaseClient
        .from("equipment_catalog")
        .delete()
        .eq("id", catalogItemId);
    }
  }
});
