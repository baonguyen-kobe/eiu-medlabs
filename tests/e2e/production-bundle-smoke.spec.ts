import { expect, test } from "@playwright/test";

test("compiled bundle serves the public login page", async ({ page }) => {
  const response = await page.goto("/login");

  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(400);
  await expect(
    page.getByRole("heading", { name: "MedLabs Calendar" }),
  ).toBeVisible();
});

test("compiled bundle supports an authenticated workspace request", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("ID hoặc email").fill("admin@campus.local");
  await page.getByLabel("Mật khẩu").fill("LocalAdmin123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
});
