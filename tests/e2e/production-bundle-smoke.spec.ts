import { expect, test } from "@playwright/test";
import { clickUntilState } from "./helpers/interaction-readiness";

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
  const email = page.getByLabel("ID hoặc email");
  const password = page.getByLabel("Mật khẩu");
  await clickUntilState(
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
    () => expect(page).toHaveURL(/\/dashboard$/, { timeout: 1_000 }),
    async () => {
      await email.fill("admin@campus.local");
      await password.fill("LocalAdmin123!");
    },
  );

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
});
