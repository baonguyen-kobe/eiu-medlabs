import nextEnv from "@next/env";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { clickUntilState } from "./helpers/interaction-readiness";

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
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("Room and Course catalog rows edit inline without weakening capacity or batch actions", async ({
  page,
}) => {
  const suffix = `${Date.now()}`.slice(-8);
  const courseCodes = [`UXC${suffix}A`, `UXC${suffix}B`];
  const roomCodes = [`UXR${suffix}A`, `UXR${suffix}B`];

  const { error: courseInsertError } = await serviceDb.from("courses").insert(
    courseCodes.map((course_code) => ({
      course_code,
      course_name: `Inline course ${course_code}`,
      room_type_id: nursingSkillsRoomTypeId,
    })),
  );
  if (courseInsertError) throw courseInsertError;

  const { error: roomInsertError } = await serviceDb.from("rooms").insert(
    roomCodes.map((room_code) => ({
      room_code,
      building_code: "UX",
      room_name: `Inline room ${room_code}`,
      capacity: 9,
      room_type_id: nursingSkillsRoomTypeId,
    })),
  );
  if (roomInsertError) throw roomInsertError;

  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAsAdmin(page);

    await page.goto("/admin/courses");
    const courseRow = (code: string) =>
      page.locator("tbody tr").filter({ hasText: code });
    const editingCourseRow = (code: string) =>
      page
        .locator("tbody tr.is-editing")
        .filter({ has: page.locator(`input[value="${code}"]`) });
    const chooseCourse = async (code: string) => {
      const checkbox = page.getByLabel(`Chọn ${code}`);
      await clickUntilState(checkbox, () =>
        expect(checkbox).toBeChecked({ timeout: 1_000 }),
      );
    };

    await chooseCourse(courseCodes[0]);
    await page.getByRole("button", { name: "Sửa mục đã chọn" }).click();
    await expect(
      editingCourseRow(courseCodes[0]).locator("input").nth(1),
    ).toBeVisible();
    await expect(editingCourseRow(courseCodes[1]).locator("input")).toHaveCount(
      0,
    );
    await expect(
      page.locator(".catalog-data-panel form.admin-create-form"),
    ).toHaveCount(0);
    await editingCourseRow(courseCodes[0])
      .locator("input")
      .nth(2)
      .fill(`Cancelled ${courseCodes[0]}`);
    await page.getByRole("button", { name: "Hủy", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Đã hủy chỉnh sửa");

    const { data: cancelledCourse, error: cancelledCourseError } =
      await serviceDb
        .from("courses")
        .select("course_name")
        .eq("course_code", courseCodes[0])
        .single();
    if (cancelledCourseError) throw cancelledCourseError;
    expect(cancelledCourse.course_name).toBe(`Inline course ${courseCodes[0]}`);

    await page.getByLabel(`Chọn ${courseCodes[0]}`).uncheck();
    await chooseCourse(courseCodes[0]);
    await page.getByRole("button", { name: "Sửa mục đã chọn" }).click();
    await editingCourseRow(courseCodes[0])
      .locator("input")
      .nth(2)
      .fill(`Edited ${courseCodes[0]}`);
    await page.getByRole("button", { name: "Lưu chỉnh sửa" }).click();
    await expect(page.getByRole("status")).toContainText("Đã lưu thay đổi");

    await chooseCourse(courseCodes[0]);
    await chooseCourse(courseCodes[1]);
    await page.getByRole("button", { name: "Sửa mục đã chọn" }).click();
    await editingCourseRow(courseCodes[0])
      .locator("input")
      .nth(2)
      .fill(`Batch ${courseCodes[0]}`);
    await editingCourseRow(courseCodes[1])
      .locator("input")
      .nth(2)
      .fill(`Batch ${courseCodes[1]}`);
    await editingCourseRow(courseCodes[0])
      .locator("select")
      .selectOption(basicMedicalRoomTypeId);
    await page.getByRole("button", { name: "Lưu chỉnh sửa" }).click();
    await expect(page.getByRole("status")).toContainText("Đã lưu thay đổi");

    await chooseCourse(courseCodes[0]);
    await chooseCourse(courseCodes[1]);
    await page.getByRole("button", { name: "Ngừng dùng" }).click();
    const deactivateDialog = page.getByRole("dialog", {
      name: "Ngừng sử dụng 2 môn học?",
    });
    await expect(deactivateDialog).toBeVisible();
    await deactivateDialog.getByRole("button", { name: "Quay lại" }).click();
    const { data: coursesAfterCancel, error: coursesAfterCancelError } =
      await serviceDb
        .from("courses")
        .select("is_active")
        .in("course_code", courseCodes);
    if (coursesAfterCancelError) throw coursesAfterCancelError;
    expect(coursesAfterCancel?.every((course) => course.is_active)).toBe(true);

    await page.getByRole("button", { name: "Ngừng dùng" }).click();
    await page
      .getByRole("dialog", { name: "Ngừng sử dụng 2 môn học?" })
      .getByRole("button", { name: "Xác nhận" })
      .click();
    await expect(page.getByRole("status")).toContainText("Đã ngừng dùng");
    await chooseCourse(courseCodes[0]);
    await chooseCourse(courseCodes[1]);
    await page.getByRole("button", { name: "Kích hoạt" }).click();
    await page
      .getByRole("dialog", { name: "Kích hoạt 2 môn học?" })
      .getByRole("button", { name: "Xác nhận" })
      .click();
    await expect(page.getByRole("status")).toContainText("Đã kích hoạt");

    await courseRow(courseCodes[1])
      .getByRole("button", { name: "Xóa" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận" })
      .click();
    await expect(courseRow(courseCodes[1])).toHaveCount(0);

    await page.goto("/admin/rooms");
    const editingRoomRow = (code: string) =>
      page
        .locator("tbody tr.is-editing")
        .filter({ has: page.locator(`input[value="${code}"]`) });
    const chooseRoom = async (code: string) => {
      const checkbox = page.getByLabel(`Chọn ${code}`);
      await clickUntilState(checkbox, () =>
        expect(checkbox).toBeChecked({ timeout: 1_000 }),
      );
    };

    await chooseRoom(roomCodes[0]);
    await page.getByRole("button", { name: "Sửa mục đã chọn" }).click();
    await expect(
      editingRoomRow(roomCodes[0]).locator("input").first(),
    ).toBeVisible();
    await expect(
      editingRoomRow(roomCodes[0]).locator("input").nth(1),
    ).toBeVisible();
    await editingRoomRow(roomCodes[0]).locator("input").nth(4).fill("");
    await page.getByRole("button", { name: "Lưu chỉnh sửa" }).click();
    await expect(page.getByRole("status")).toContainText("Đã lưu thay đổi");

    const { data: blankCapacityRoom, error: blankCapacityRoomError } =
      await serviceDb
        .from("rooms")
        .select("capacity")
        .eq("room_code", roomCodes[0])
        .single();
    if (blankCapacityRoomError) throw blankCapacityRoomError;
    expect(blankCapacityRoom.capacity).toBeNull();

    await chooseRoom(roomCodes[0]);
    await page.getByRole("button", { name: "Sửa mục đã chọn" }).click();
    await expect(
      editingRoomRow(roomCodes[0]).locator("select option"),
    ).toHaveCount(2);
    await editingRoomRow(roomCodes[0])
      .locator("select")
      .selectOption(nursingSkillsRoomTypeId);
    await editingRoomRow(roomCodes[0]).locator("input").nth(4).fill("1");
    await page.getByRole("button", { name: "Lưu chỉnh sửa" }).click();
    await expect(page.getByRole("status")).toContainText("Đã lưu thay đổi");

    await chooseRoom(roomCodes[0]);
    await page.getByRole("button", { name: "Sửa mục đã chọn" }).click();
    await editingRoomRow(roomCodes[0]).locator("input").nth(4).fill("0");
    await page.getByRole("button", { name: "Lưu chỉnh sửa" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Sức chứa phải là số nguyên từ 1 trở lên hoặc để trống.",
    );
    await page.getByRole("button", { name: "Hủy", exact: true }).click();

    const noDocumentOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
    expect(noDocumentOverflow).toBe(true);
  } finally {
    await serviceDb.from("courses").delete().in("course_code", courseCodes);
    await serviceDb.from("rooms").delete().in("room_code", roomCodes);
  }
});
