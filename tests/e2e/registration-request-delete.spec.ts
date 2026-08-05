import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const adminId = "c18c4f94-a58a-4b5f-abd0-8c4856affab8";
const lecturerId = "fc072ca9-e5e0-4b06-b5a8-5d863273992d";
const skillRoomId = crypto.randomUUID();
const basicRoomId = crypto.randomUUID();
const equipmentScheduleId = crypto.randomUUID();
const equipmentRequestId = crypto.randomUUID();
const equipmentItemId = crypto.randomUUID();
const registrationId = crypto.randomUUID();
const basicScheduleId = crypto.randomUUID();
const basicSessionId = crypto.randomUUID();

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("Admin xóa phiếu Y cơ sở và phiếu thiết bị trên giao diện", async ({
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

  try {
    expect(
      (
        await databaseClient.from("rooms").insert([
          {
            id: skillRoomId,
            room_code: "E2E-SKILL-DELETE",
            building_code: "QA",
            room_type_id: "40000000-0000-0000-0000-000000000001",
          },
          {
            id: basicRoomId,
            room_code: "E2E-BASIC-DELETE",
            building_code: "QA",
            room_type_id: "40000000-0000-0000-0000-000000000002",
          },
        ])
      ).error,
    ).toBeNull();
    expect(
      (
        await databaseClient.from("class_schedules").insert({
          id: equipmentScheduleId,
          course_id: "10000000-0000-0000-0000-000000000001",
          course_code_snapshot: "DELETE-EQUIPMENT",
          course_name_snapshot: "Kiểm thử xóa phiếu thiết bị",
          room_id: skillRoomId,
          schedule_date: "2044-08-20",
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
          id: equipmentRequestId,
          class_schedule_id: equipmentScheduleId,
          semester: "HK1",
          registrant_id: adminId,
          responsible_lecturer_id: lecturerId,
          phone_snapshot: "0901000001",
          email_snapshot: "admin@campus.local",
          receive_at: "2044-08-20T02:00:00.000Z",
          return_at: "2044-08-20T04:00:00.000Z",
          status: "new",
          created_by: adminId,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await databaseClient.from("equipment_request_items").insert({
          id: equipmentItemId,
          request_id: equipmentRequestId,
          skill_name: "Kiểm thử xóa phiếu",
          catalog_item_id: "60000000-0000-0000-0000-000000000001",
          quantity: 1,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await databaseClient.from("basic_medical_registrations").insert({
          id: registrationId,
          academic_year: "2044-2045",
          semester: "HK1",
          start_date: "2044-08-21",
          end_date: "2044-08-21",
          course_id: "10000000-0000-0000-0000-000000000001",
          room_id: basicRoomId,
          student_count: 20,
          registrant_id: adminId,
          responsible_lecturer_id: lecturerId,
          note: "E2E DELETE BASIC MEDICAL",
          created_by: adminId,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await databaseClient.from("class_schedules").insert({
          id: basicScheduleId,
          course_id: "10000000-0000-0000-0000-000000000001",
          course_code_snapshot: "DELETE-BASIC",
          course_name_snapshot: "Kiểm thử xóa phiếu Y cơ sở",
          room_id: basicRoomId,
          lecturer_id: lecturerId,
          schedule_date: "2044-08-21",
          start_time: "07:30",
          end_time: "11:30",
          source: "manual",
          schedule_status: "published",
          student_count: 20,
          basic_medical_registration_id: registrationId,
          created_by: adminId,
          published_by: adminId,
          published_at: new Date().toISOString(),
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await databaseClient
          .from("basic_medical_registration_sessions")
          .insert({
            id: basicSessionId,
            registration_id: registrationId,
            class_schedule_id: basicScheduleId,
            lesson_title: "E2E DELETE BASIC MEDICAL",
            teaching_lecturer_id: lecturerId,
            session_number: 1,
          })
      ).error,
    ).toBeNull();

    await loginAsAdmin(page);
    await page.goto("/equipment/register");
    const editModeButton = page.getByText("Điều chỉnh phiếu", {
      exact: true,
    });
    const copyModeButton = page.getByText("Sao chép phiếu", { exact: true });
    await expect(editModeButton).toHaveCSS(
      "background-color",
      "rgb(255, 247, 237)",
    );
    await expect(copyModeButton).toHaveCSS(
      "background-color",
      "rgb(245, 243, 255)",
    );
    await copyModeButton.click();
    await expect(page.locator('input[name="request"]')).toHaveAttribute(
      "placeholder",
      "Nhập mã phiếu, ví dụ: 123465789356",
    );

    await page.goto("/basic-medical/registrations");
    const registrationCard = page
      .locator(".registration-card-list > .data-panel")
      .filter({ hasText: "E2E DELETE BASIC MEDICAL" });
    await expect(registrationCard).toBeVisible();
    await registrationCard
      .getByRole("button", { name: "Xóa phiếu", exact: true })
      .click();
    const registrationDialog = page.getByRole("dialog", {
      name: "Xác nhận thao tác",
    });
    await expect(registrationDialog).toBeVisible();
    await registrationDialog
      .getByRole("button", { name: "Xác nhận", exact: true })
      .click();
    await expect(page.getByText("Đã xóa phiếu Y cơ sở.")).toBeVisible();
    await expect(registrationCard).toHaveCount(0);

    await page.goto("/equipment/requests");
    await page
      .locator(".equipment-request-filters .data-search input")
      .fill(equipmentRequestId);
    const equipmentRow = page.locator(".equipment-request-list-item");
    await expect(equipmentRow).toHaveCount(1);
    await equipmentRow.locator(".equipment-request-summary").click();
    await expect(equipmentRow.getByText(/^\d{12}$/)).toBeVisible();
    await equipmentRow
      .getByRole("button", { name: "Xóa phiếu", exact: true })
      .click();
    const equipmentDialog = page.getByRole("dialog", {
      name: "Xóa phiếu thiết bị?",
    });
    await expect(equipmentDialog).toContainText(
      "Lớp Skills lab gốc vẫn được giữ lại",
    );
    await equipmentDialog
      .getByRole("button", { name: "Xóa phiếu", exact: true })
      .click();
    await expect(page.getByText("Đã xóa phiếu thiết bị.")).toBeVisible();
    await expect(equipmentRow).toHaveCount(0);

    for (const [table, id, expected] of [
      ["basic_medical_registrations", registrationId, 0],
      ["basic_medical_registration_sessions", basicSessionId, 0],
      ["class_schedules", basicScheduleId, 0],
      ["equipment_requests", equipmentRequestId, 0],
      ["equipment_request_items", equipmentItemId, 0],
      ["class_schedules", equipmentScheduleId, 1],
    ] as const) {
      const { data, error } = await databaseClient
        .from(table)
        .select("id")
        .eq("id", id);
      expect(error).toBeNull();
      expect(data).toHaveLength(expected);
    }
  } finally {
    await databaseClient
      .from("equipment_request_items")
      .delete()
      .eq("id", equipmentItemId);
    await databaseClient
      .from("equipment_requests")
      .delete()
      .eq("id", equipmentRequestId);
    await databaseClient
      .from("basic_medical_registrations")
      .delete()
      .eq("id", registrationId);
    await databaseClient
      .from("class_schedules")
      .delete()
      .in("id", [equipmentScheduleId, basicScheduleId]);
    await databaseClient
      .from("rooms")
      .delete()
      .in("id", [skillRoomId, basicRoomId]);
  }
});
