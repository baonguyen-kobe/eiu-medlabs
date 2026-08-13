import nextEnv from "@next/env";
import * as XLSX from "@e965/xlsx";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { openCombobox } from "./helpers/interaction-readiness";

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
