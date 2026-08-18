import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function loginAsStaff(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("staff@campus.local");
  await page.locator('input[name="password"]').fill("LocalStaff123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("Phiếu Y cơ sở hiển thị danh sách thu gọn và bộ lọc trạng thái", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.goto("/basic-medical/registrations");
  await expect(
    page.getByRole("heading", { name: "Phiếu Y cơ sở" }),
  ).toBeVisible();
  await expect(page.locator('select[name="status"]')).toHaveValue("incomplete");
  await expect(
    page.getByRole("columnheader", { name: "Trạng thái" }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("Tìm mã môn, tên môn, phòng, giảng viên…"),
  ).toBeVisible();
});

test("Danh sách thiết bị Y cơ sở có đủ bốn tab và thao tác quản lý", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.goto("/basic-medical/equipment");
  await expect(
    page.getByRole("heading", { name: "Danh sách thiết bị Y cơ sở" }),
  ).toBeVisible();
  await expect(page.locator(".basic-medical-equipment-tabs a")).toHaveText([
    "Thiết bị",
    "Thiết bị theo phòng",
    "Thiết bị hư",
    "Log thay đổi",
  ]);
  const tabsBeforeManualForm = await page.evaluate(() => {
    const tabs = document.querySelector(".basic-medical-equipment-tabs");
    const form = document.querySelector(".equipment-catalog-create-form");
    return Boolean(
      tabs &&
      form &&
      tabs.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(tabsBeforeManualForm).toBe(true);
  await expect(page.getByRole("link", { name: "Tải template" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export tất cả" })).toBeVisible();
  await page.getByRole("link", { name: "Thiết bị theo phòng" }).click();
  await expect(page).toHaveURL(/tab=rooms/);
  await expect(
    page.getByRole("heading", { name: "Thiết bị theo phòng" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Thiết bị hư" }).click();
  await expect(page).toHaveURL(/tab=damaged/);
  await expect(
    page.getByPlaceholder("Tìm thiết bị, phòng, người thay đổi, ghi chú…"),
  ).toBeVisible();
});

test("Chuyên viên ngoài scope không thấy và không mở được thiết bị Y cơ sở", async ({
  page,
}) => {
  await loginAsStaff(page);
  await expect(
    page.getByRole("link", { name: "Danh mục TB Y cơ sở" }),
  ).toHaveCount(0);
  await page.goto("/basic-medical/equipment");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Hai page Y cơ sở mới không tràn màn hình mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  for (const path of [
    "/basic-medical/registrations",
    "/basic-medical/equipment",
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("Người xem Y cơ sở không truy cập Danh sách thiết bị Y cơ sở", async ({
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
  const service = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false } },
  );
  const email = `viewer-basic-${crypto.randomUUID()}@campus.local`;
  const password = "LocalViewer123!";
  const { data: adminProfile } = await service
    .from("profiles")
    .select("id")
    .eq("email", "admin@campus.local")
    .single();
  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Người xem Y cơ sở" },
    app_metadata: { preapproved: true },
  });
  expect(error).toBeNull();
  const userId = created.user!.id;
  try {
    const { error: profileError } = await service
      .from("profiles")
      .update({ is_active: true })
      .eq("id", userId);
    expect(profileError).toBeNull();
    const { error: roleError } = await service.from("user_roles").insert({
      user_id: userId,
      role: "viewer",
      created_by: adminProfile!.id,
    });
    expect(roleError).toBeNull();
    const { error: scopeError } = await service
      .from("profile_room_types")
      .insert({
        profile_id: userId,
        room_type_id: "40000000-0000-0000-0000-000000000002",
        created_by: adminProfile!.id,
        receive_schedule_emails: false,
      });
    expect(scopeError).toBeNull();
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("link", { name: "Danh mục TB Y cơ sở" }),
    ).toHaveCount(0);
    await page.goto("/basic-medical/equipment");
    await expect(
      page.getByRole("heading", { name: "Danh sách thiết bị Y cơ sở" }),
    ).toBeVisible();
    await expect(page.getByText("Thêm thiết bị thủ công")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Import mới" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: "Export tất cả" })).toHaveCount(
      0,
    );
    await page.goto("/basic-medical/registrations");
    await expect(
      page.getByRole("heading", { name: "Phiếu Y cơ sở" }),
    ).toBeVisible();
  } finally {
    await service.auth.admin.deleteUser(userId);
  }
});

test("Phiếu Y cơ sở: Trạng thái bên trái, nút Sửa/Lưu/Hủy bên phải hàng, Hủy lớp tách biệt bên dưới", async ({
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
  const service = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false } },
  );

  const suffix = crypto.randomUUID().slice(0, 8);
  const courseCode = `BM-UI-${suffix}`;
  const ids = Object.fromEntries(
    [
      "course",
      "room",
      "registration",
      "schedule1",
      "schedule2",
      "session1",
      "session2",
    ].map((name) => [name, crypto.randomUUID()]),
  );

  const { data: adminProfile } = await service
    .from("profiles")
    .select("id")
    .eq("email", "admin@campus.local")
    .single();
  const { data: lecturerProfile } = await service
    .from("profiles")
    .select("id")
    .eq("email", "giangvien@campus.local")
    .single();

  const adminId = adminProfile!.id;
  const lecturerId = lecturerProfile!.id;
  const testDate = "2048-11-20";

  try {
    const { data: roomType } = await service
      .from("room_types")
      .select("id")
      .eq("code", "basic_medical")
      .single();

    // 1. Create course & room
    await service.from("courses").insert({
      id: ids.course,
      course_code: courseCode,
      course_name: `Môn Y cơ sở test UI ${suffix}`,
      room_type_id: roomType!.id,
      is_active: true,
    });
    await service.from("rooms").insert({
      id: ids.room,
      room_code: `R-${suffix}`,
      building_code: "E2E",
      room_name: `Phòng test ${suffix}`,
      room_type_id: roomType!.id,
      capacity: 30,
      is_active: true,
    });

    // 2. Create registration
    await service.from("basic_medical_registrations").insert({
      id: ids.registration,
      academic_year: "2048-2049",
      semester: "HK1",
      start_date: testDate,
      end_date: testDate,
      course_id: ids.course,
      room_id: ids.room,
      student_count: 20,
      registrant_id: adminId,
      responsible_lecturer_id: lecturerId,
      created_by: adminId,
    });

    // 3. Create class_schedules & sessions
    await service.from("class_schedules").insert([
      {
        id: ids.schedule1,
        course_id: ids.course,
        course_code_snapshot: courseCode,
        course_name_snapshot: `Môn Y cơ sở test UI ${suffix}`,
        room_id: ids.room,
        lecturer_id: lecturerId,
        schedule_date: testDate,
        start_time: "07:30",
        end_time: "11:30",
        source: "manual",
        schedule_status: "published",
        student_count: 20,
        basic_medical_registration_id: ids.registration,
        created_by: adminId,
        published_by: adminId,
        published_at: new Date().toISOString(),
      },
      {
        id: ids.schedule2,
        course_id: ids.course,
        course_code_snapshot: courseCode,
        course_name_snapshot: `Môn Y cơ sở test UI ${suffix}`,
        room_id: ids.room,
        lecturer_id: lecturerId,
        schedule_date: testDate,
        start_time: "13:30",
        end_time: "16:30",
        source: "manual",
        schedule_status: "published",
        student_count: 20,
        basic_medical_registration_id: ids.registration,
        created_by: adminId,
        published_by: adminId,
        published_at: new Date().toISOString(),
      },
    ]);

    await service.from("basic_medical_registration_sessions").insert([
      {
        id: ids.session1,
        registration_id: ids.registration,
        class_schedule_id: ids.schedule1,
        lesson_title: `Bài học 1 ${suffix}`,
        teaching_lecturer_id: lecturerId,
        session_number: 1,
      },
      {
        id: ids.session2,
        registration_id: ids.registration,
        class_schedule_id: ids.schedule2,
        lesson_title: `Bài học 2 ${suffix}`,
        teaching_lecturer_id: lecturerId,
        session_number: 2,
      },
    ]);

    // 4. Test UI
    await loginAsAdmin(page);
    await page.goto(`/basic-medical/registrations?status=all`);

    // Find and expand the created registration row
    const regRow = page
      .locator("tr.equipment-request-table-row")
      .filter({ hasText: courseCode });
    await expect(regRow).toBeVisible({ timeout: 10_000 });
    await regRow.click();

    // Verify detail row expanded and session table visible
    const detailRow = page.locator("tr.equipment-request-detail-row");
    await expect(detailRow).toBeVisible();

    const sessionTable = detailRow.locator(".basic-medical-session-table");
    await expect(sessionTable).toBeVisible();

    // Check first session action cell
    const sessionRow1 = sessionTable.locator("tbody tr").first();
    const actionCell = sessionRow1.locator(
      ".basic-medical-session-action-cell",
    );
    const statusRow = actionCell.locator(".basic-medical-session-status-row");

    // A. NORMAL MODE: status on left, Sửa on right
    const statusPill = statusRow.locator(".request-status");
    const editButton = statusRow.locator(
      ".basic-medical-session-lecturer-actions .basic-medical-lecturer-edit-button",
    );
    await expect(statusPill).toBeVisible();
    await expect(statusPill).toHaveText("Chưa xác nhận");
    await expect(editButton).toBeVisible();
    await expect(editButton).toHaveText("Sửa");

    // C. ADMINISTRATIVE ACTIONS PRESENT: Hủy lớp is outside the status row
    const cancelSessionButton = actionCell.locator(
      ".basic-medical-session-action-stack > button.button-danger",
    );
    await expect(cancelSessionButton).toBeVisible();
    await expect(cancelSessionButton).toHaveText("Hủy lớp");

    // Capture Screenshot A: Normal mode & Screenshot C: Administrative action present
    const artifactsDir =
      "C:/Users/User/.gemini/antigravity/brain/dffb3f58-6ffc-43d7-989c-33c163c573f8";
    await page.screenshot({
      path: `${artifactsDir}/basic_medical_session_normal.png`,
    });
    await page.screenshot({
      path: `${artifactsDir}/basic_medical_session_admin.png`,
    });

    // B. EDIT MODE: Click Sửa -> Lưu + Hủy on right of status row, lecturer select visible
    await editButton.click();

    const lecturerSelect = sessionRow1.locator(
      ".basic-medical-lecturer-select",
    );
    await expect(lecturerSelect).toBeVisible();

    const saveButton = statusRow.locator(
      ".basic-medical-session-lecturer-actions .basic-medical-lecturer-save-button",
    );
    const cancelEditButton = statusRow.locator(
      ".basic-medical-session-lecturer-actions .basic-medical-lecturer-cancel-button",
    );
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toHaveText("Lưu");
    await expect(cancelEditButton).toBeVisible();
    await expect(cancelEditButton).toHaveText("Hủy");

    // Capture Screenshot B: Edit mode
    await page.screenshot({
      path: `${artifactsDir}/basic_medical_session_edit.png`,
    });

    // Click Hủy to restore normal read mode
    await cancelEditButton.click();
    await expect(editButton).toBeVisible();
    await expect(lecturerSelect).not.toBeVisible();
  } finally {
    // Cleanup
    await service
      .from("basic_medical_registration_sessions")
      .delete()
      .in("id", [ids.session1, ids.session2]);
    await service
      .from("class_schedules")
      .delete()
      .in("id", [ids.schedule1, ids.schedule2]);
    await service
      .from("basic_medical_registrations")
      .delete()
      .eq("id", ids.registration);
    await service.from("rooms").delete().eq("id", ids.room);
    await service.from("courses").delete().eq("id", ids.course);
  }
});
