import { expect, test } from "@playwright/test";
import { setInputFilesUntilState } from "./helpers/interaction-readiness";
import * as XLSX from "@e965/xlsx";

test("Skills Lab normalizes LAB room codes, accepts no email and resolves lecturer email", async ({
  page,
}) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        "Mã MH": "NUR 101",
        "Tên môn học": "Thăm khám thể chất",
        "Nhóm tổ": "",
        "Số tín chỉ": "",
        Lớp: "",
        Thứ: "",
        "Giờ bắt đầu": 1,
        "Giờ kết thúc": 8,
        Phòng: "LAB105.B5",
        "Giảng viên": "N.N.Diễm",
        "Sĩ số": 25,
        "Thời gian học": "19/08/41 đến 19/08/41",
      },
    ]),
    "Export_TKB",
  );

  await page.goto("/schedule-entry/import");
  const semesterSelect = page.locator("#import-semester-select");
  await expect(semesterSelect).toBeVisible();
  await semesterSelect.selectOption("HK1");

  const fileInput = page.locator("#schedule-import-file");
  const stepTwo = page.locator(".stepper li").nth(1);
  await setInputFilesUntilState(
    fileInput,
    {
      name: "Export_TKB.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    },
    () => expect(stepTwo).toHaveClass(/active/, { timeout: 2_000 }),
  );

  const continueButton = page.getByRole("button", { name: /Tiếp tục/ });
  await expect(continueButton).toBeEnabled();
  await expect(page.locator(".inline-warning")).toHaveCount(0);
  await expect(page.locator(".preview-table tbody")).toContainText("105");
  await expect(page.locator(".preview-table tbody")).not.toContainText(
    "LAB105",
  );
  await expect(page.locator(".file-summary")).toContainText("HK1");

  await continueButton.click();
  await expect(page.locator(".stepper li").nth(2)).toHaveClass(/active/);
  await expect(page.locator(".preview-table tbody")).toContainText(
    "giangvien@campus.local",
  );
});

test("Skills Lab preview displays and excludes an intra-file conflict", async ({
  page,
}) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      {
        "Mã MH": "NUR 101",
        "Tên môn học": "Thăm khám thể chất",
        "Nhóm tổ": "",
        "Số tín chỉ": "",
        Lớp: "",
        Thứ: "",
        "Giờ bắt đầu": 1,
        "Giờ kết thúc": 4,
        Phòng: "LAB105.B5",
        "Giảng viên": "N.N.Diễm",
        "Sĩ số": 25,
        "Thời gian học": "20/08/41 đến 20/08/41",
      },
      {
        "Mã MH": "NUR 101",
        "Tên môn học": "Thăm khám thể chất",
        "Giờ bắt đầu": 2,
        "Giờ kết thúc": 4,
        Phòng: "LAB105.B5",
        "Giảng viên": "N.N.Diễm",
        "Sĩ số": 25,
        "Thời gian học": "20/08/41 đến 20/08/41",
      },
    ]),
    "Export_TKB",
  );

  await page.goto("/schedule-entry/import");
  const semesterSelect = page.locator("#import-semester-select");
  await expect(semesterSelect).toBeVisible();
  await semesterSelect.selectOption("HK1");

  const fileInput = page.locator("#schedule-import-file");
  const stepTwo = page.locator(".stepper li").nth(1);
  await setInputFilesUntilState(
    fileInput,
    {
      name: "Export_TKB-conflict.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    },
    () => expect(stepTwo).toHaveClass(/active/, { timeout: 2_000 }),
  );
  await page.getByRole("button", { name: /Tiếp tục/ }).click();

  const conflict = page.locator(".preview-status-conflict");
  await expect(conflict).toHaveCount(1);
  await expect(conflict).toHaveText("Xung đột");
  await expect(conflict.locator("xpath=ancestor::tr")).toHaveClass(/row-error/);
  await expect(page.locator(".import-step-note")).toContainText("xung đột");
});

test("Skills Lab import blocks file upload until Semester is selected", async ({
  page,
}) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/schedule-entry/import");
  const semesterSelect = page.locator("#import-semester-select");
  await expect(semesterSelect).toBeVisible();
  await expect(semesterSelect).toHaveValue("");

  const dropZone = page.locator(".drop-zone");
  await dropZone.click();
  await expect(page.locator(".form-error")).toContainText(
    "Vui lòng chọn Học kỳ trước khi chọn file import.",
  );

  await semesterSelect.selectOption("HK2");
  await expect(page.locator(".form-error")).toHaveCount(0);
});
