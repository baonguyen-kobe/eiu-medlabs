import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const adminId = "c18c4f94-a58a-4b5f-abd0-8c4856affab8";

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
  const databaseClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: signInError } = await databaseClient.auth.signInWithPassword({
    email: "admin@campus.local",
    password: "LocalAdmin123!",
  });
  expect(signInError).toBeNull();

  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  const roomId = crypto.randomUUID();
  const catalogItemId = crypto.randomUUID();
  const scheduleId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const requestCode = "460820123456";

  try {
    expect(
      (
        await databaseClient.from("rooms").insert({
          id: roomId,
          room_code: `E2E-${suffix}`,
          building_code: "QA",
          room_type_id: "40000000-0000-0000-0000-000000000001",
        })
      ).error,
    ).toBeNull();
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
    expect(
      (
        await databaseClient.from("class_schedules").insert({
          id: scheduleId,
          course_id: null,
          course_code_snapshot: `E2E-${suffix}`,
          course_name_snapshot: "Kiểm thử quản lý phiếu thiết bị",
          room_id: roomId,
          schedule_date: "2046-08-20",
          start_time: "07:30",
          end_time: "11:30",
          source: "manual",
          schedule_status: "published",
          student_count: 20,
          created_by: adminId,
          published_by: adminId,
          published_at: new Date().toISOString(),
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await databaseClient.from("equipment_requests").insert({
          id: requestId,
          class_schedule_id: scheduleId,
          semester: "HK1",
          registrant_id: adminId,
          responsible_lecturer_id: adminId,
          phone_snapshot: "0901000001",
          email_snapshot: "admin@campus.local",
          receive_at: "2046-08-19T09:00:00+07:00",
          return_at: "2046-08-20T16:00:00+07:00",
          status: "preparing",
          created_by: adminId,
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
          catalog_item_id: catalogItemId,
          quantity: 1,
        })
      ).error,
    ).toBeNull();

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
    await expect(page.locator(".form-error")).toHaveCount(0);

    await page.goto("/equipment/requests");
    await page.locator(".data-search input").fill(`E2E-${suffix}`);
    const requestRow = page.locator(".equipment-request-list-item").filter({
      hasText: `E2E-${suffix}`,
    });
    await expect(requestRow).toHaveCount(1);
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
    const modal = page.getByRole("dialog", { name: /E2E-/ });
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
    await databaseClient.from("class_schedules").delete().eq("id", scheduleId);
    await databaseClient.from("rooms").delete().eq("id", roomId);
    await databaseClient
      .from("equipment_catalog")
      .delete()
      .eq("id", catalogItemId);
  }
});
