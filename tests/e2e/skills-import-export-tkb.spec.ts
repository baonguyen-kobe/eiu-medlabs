import { expect, test } from "@playwright/test";
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
  await page.locator("#schedule-import-file").setInputFiles({
    name: "Export_TKB.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
  });

  const continueButton = page.getByRole("button", { name: /Tiếp tục/ });
  await expect(continueButton).toBeEnabled();
  await expect(page.locator(".inline-warning")).toHaveCount(0);
  await expect(page.locator(".preview-table tbody")).toContainText("105");
  await expect(page.locator(".preview-table tbody")).not.toContainText(
    "LAB105",
  );

  await continueButton.click();
  await expect(page.locator(".stepper li").nth(2)).toHaveClass(/active/);
  await expect(page.locator(".preview-table tbody")).toContainText(
    "giangvien@campus.local",
  );
});
