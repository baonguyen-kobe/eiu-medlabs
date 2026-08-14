import nextEnv from "@next/env";
import * as XLSX from "@e965/xlsx";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { clickUntilState, openCombobox } from "./helpers/interaction-readiness";

nextEnv.loadEnvConfig(process.cwd());

const serviceDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const nursingSkillsRoomTypeId = "40000000-0000-0000-0000-000000000001";
const basicMedicalRoomTypeId = "40000000-0000-0000-0000-000000000002";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function deleteCourseByCode(page: Page, courseCode: string) {
  await page.goto("/admin/courses");
  const row = page.locator("tbody tr").filter({ hasText: courseCode });
  if ((await row.count()) === 0) return;
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Xóa" }).click();
}

test("môn học chỉ được gợi ý trong đúng Loại lịch", async ({ page }) => {
  const suffix = `${Date.now()}`.slice(-8);
  const skillsCode = `SK${suffix}`;
  const medicalCode = `YM${suffix}`;
  const importedCode = `IM${suffix}`;

  const { error: insertError } = await serviceDb.from("courses").insert([
    {
      course_code: skillsCode,
      course_name: `Môn Skills ${suffix}`,
      room_type_id: nursingSkillsRoomTypeId,
    },
    {
      course_code: medicalCode,
      course_name: `Môn Y cơ sở ${suffix}`,
      room_type_id: basicMedicalRoomTypeId,
    },
  ]);
  if (insertError) throw insertError;

  try {
    await loginAsAdmin(page);

    await page.goto("/schedule-entry/new");
    const skillsCourse = page.getByRole("combobox", {
      name: "Tìm và chọn môn học",
    });
    await openCombobox(skillsCourse);
    await skillsCourse.fill(skillsCode);
    await expect(
      page
        .getByRole("listbox")
        .getByRole("option", { name: new RegExp(skillsCode) }),
    ).toBeVisible();
    await skillsCourse.fill(medicalCode);
    await expect(
      page
        .getByRole("listbox")
        .getByRole("option", { name: new RegExp(medicalCode) }),
    ).toHaveCount(0);

    await page.goto("/basic-medical/new");
    const medicalCourse = page.locator('select[name="course_id"]');
    await expect(
      medicalCourse.locator(`option:has-text("${medicalCode}")`),
    ).toHaveCount(1);
    await expect(
      medicalCourse.locator(`option:has-text("${skillsCode}")`),
    ).toHaveCount(0);

    await page.goto("/admin/courses");
    const templateResponse = await page.request.get(
      "/api/admin-catalog-template/courses",
    );
    expect(templateResponse.ok()).toBe(true);
    const templateWorkbook = XLSX.read(await templateResponse.body(), {
      type: "buffer",
    });
    const templateRows = XLSX.utils.sheet_to_json<Array<string>>(
      templateWorkbook.Sheets[templateWorkbook.SheetNames[0]],
      { header: 1, defval: "" },
    );
    expect(templateRows[0]).toEqual(["Mã môn học", "Tên môn học", "Loại"]);
    expect(templateRows.flat().join("\n")).toContain("Kỹ năng Điều dưỡng");
    expect(templateRows.flat().join("\n")).toContain("Y cơ sở");

    await page.getByLabel("Chọn file import môn học").setInputFiles({
      name: "courses-by-type.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        `Mã môn học,Tên môn học,Loại\n${importedCode},Môn import Y cơ sở ${suffix},Y cơ sở`,
        "utf8",
      ),
    });
    await expect(page).toHaveURL(/\/admin\/courses\?notice=/);
    await expect(
      page.locator("tbody tr").filter({ hasText: importedCode }),
    ).toContainText("Y cơ sở");

    const { data: imported, error: importedError } = await serviceDb
      .from("courses")
      .select("room_type_id")
      .eq("course_code", importedCode)
      .single();
    if (importedError) throw importedError;
    expect(imported.room_type_id).toBe(basicMedicalRoomTypeId);
  } finally {
    for (const courseCode of [skillsCode, medicalCode, importedCode]) {
      await deleteCourseByCode(page, courseCode);
    }
  }
});

test("Admin edits and toggles selected Room and Course catalog rows through the batch UI", async ({
  page,
}) => {
  const suffix = `${Date.now()}`.slice(-8);
  const courseCodes = [`BC${suffix}A`, `BC${suffix}B`];
  const roomCodes = [`BR${suffix}A`, `BR${suffix}B`];
  const { error: courseError } = await serviceDb.from("courses").insert(
    courseCodes.map((course_code) => ({
      course_code,
      course_name: `Batch Course ${course_code}`,
      room_type_id: nursingSkillsRoomTypeId,
    })),
  );
  if (courseError) throw courseError;
  const { error: roomError } = await serviceDb.from("rooms").insert(
    roomCodes.map((room_code) => ({
      room_code,
      building_code: "BATCH",
      room_name: `Batch Room ${room_code}`,
      capacity: 20,
      room_type_id: nursingSkillsRoomTypeId,
    })),
  );
  if (roomError) throw roomError;

  try {
    await loginAsAdmin(page);

    await page.goto("/admin/courses");
    for (const courseCode of courseCodes) {
      const checkbox = page.getByLabel(`Chọn ${courseCode}`);
      await clickUntilState(checkbox, () =>
        expect(checkbox).toBeChecked({ timeout: 1_000 }),
      );
    }
    await page.getByRole("button", { name: "Sửa mục đã chọn" }).click();
    const courseEditors = page.locator("form.admin-create-form fieldset");
    await expect(courseEditors).toHaveCount(2);
    await courseEditors
      .nth(0)
      .getByLabel("Tên")
      .fill(`Edited ${courseCodes[0]}`);
    await courseEditors
      .nth(1)
      .getByLabel("Tên")
      .fill(`Edited ${courseCodes[1]}`);
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Đã lưu thay đổi");
    const firstCourseCheckbox = page.getByLabel(`Chọn ${courseCodes[0]}`);
    await clickUntilState(firstCourseCheckbox, () =>
      expect(firstCourseCheckbox).toBeChecked({ timeout: 1_000 }),
    );
    const secondCourseCheckbox = page.getByLabel(`Chọn ${courseCodes[1]}`);
    await clickUntilState(secondCourseCheckbox, () =>
      expect(secondCourseCheckbox).toBeChecked({ timeout: 1_000 }),
    );
    await page.getByRole("button", { name: "Ngừng dùng" }).click();
    const deactivateDialog = page.getByRole("dialog", {
      name: "Ngừng sử dụng 2 môn học?",
    });
    await expect(deactivateDialog).toBeVisible();
    await expect(deactivateDialog).toContainText("đúng các mục đang chọn");
    await deactivateDialog.getByRole("button", { name: "Quay lại" }).click();
    await expect(deactivateDialog).toBeHidden();

    const { data: coursesAfterCancel, error: coursesAfterCancelError } =
      await serviceDb
        .from("courses")
        .select("course_code,is_active")
        .in("course_code", courseCodes)
        .order("course_code");
    if (coursesAfterCancelError) throw coursesAfterCancelError;
    expect(coursesAfterCancel?.every((course) => course.is_active)).toBe(true);

    await page.getByRole("button", { name: "Ngừng dùng" }).click();
    await page
      .getByRole("dialog", { name: "Ngừng sử dụng 2 môn học?" })
      .getByRole("button", { name: "Xác nhận" })
      .click();
    await expect(page.getByRole("status")).toContainText("Đã ngừng dùng");

    const { data: updatedCourses, error: updatedCoursesError } = await serviceDb
      .from("courses")
      .select("course_code,course_name,is_active")
      .in("course_code", courseCodes)
      .order("course_code");
    if (updatedCoursesError) throw updatedCoursesError;
    expect(updatedCourses).toEqual([
      {
        course_code: courseCodes[0],
        course_name: `Edited ${courseCodes[0]}`,
        is_active: false,
      },
      {
        course_code: courseCodes[1],
        course_name: `Edited ${courseCodes[1]}`,
        is_active: false,
      },
    ]);

    await page.goto("/admin/rooms");
    for (const roomCode of roomCodes) {
      const checkbox = page.getByLabel(`Chọn ${roomCode}`);
      await clickUntilState(checkbox, () =>
        expect(checkbox).toBeChecked({ timeout: 1_000 }),
      );
    }
    await page.getByRole("button", { name: "Sửa mục đã chọn" }).click();
    const roomEditors = page.locator("form.admin-create-form fieldset");
    await expect(roomEditors).toHaveCount(2);
    await roomEditors.nth(0).getByLabel("Sức chứa").fill("25");
    await roomEditors.nth(1).getByLabel("Sức chứa").fill("30");
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Đã lưu thay đổi");

    const { data: updatedRooms, error: updatedRoomsError } = await serviceDb
      .from("rooms")
      .select("room_code,capacity")
      .in("room_code", roomCodes)
      .order("room_code");
    if (updatedRoomsError) throw updatedRoomsError;
    expect(updatedRooms).toEqual([
      { room_code: roomCodes[0], capacity: 25 },
      { room_code: roomCodes[1], capacity: 30 },
    ]);
  } finally {
    await serviceDb.from("courses").delete().in("course_code", courseCodes);
    await serviceDb.from("rooms").delete().in("room_code", roomCodes);
  }
});
