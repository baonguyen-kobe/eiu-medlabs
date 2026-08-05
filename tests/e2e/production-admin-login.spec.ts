import { expect, test } from "@playwright/test";

const productionPassword = process.env.PRODUCTION_ADMIN_PASSWORD;
const productionIdentifier = process.env.PRODUCTION_ADMIN_IDENTIFIER ?? "admin";

test.use({
  baseURL:
    process.env.PRODUCTION_BASE_URL ?? "https://medlabs-calendar.vercel.app",
});

test("tài khoản bootstrap đăng nhập production bằng ID admin", async ({
  page,
}) => {
  test.skip(!productionPassword, "Thiếu PRODUCTION_ADMIN_PASSWORD.");

  await page.goto("/login");
  await page.getByLabel("ID hoặc email").fill(productionIdentifier);
  await page.getByLabel("Mật khẩu").fill(productionPassword!);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();

  const accountTrigger = page.locator(".workspace-user-trigger");
  const fullName =
    (await accountTrigger.locator("strong").textContent())?.trim() ?? "";
  const expectedInitials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toLocaleUpperCase("vi-VN");

  expect(fullName).not.toBe("");
  await expect(accountTrigger.locator(".avatar")).toHaveText(expectedInitials);
  await expect(
    accountTrigger.locator(".workspace-user-copy > span"),
  ).toHaveText("Quản trị viên");
  await expect(accountTrigger).toHaveAttribute(
    "aria-label",
    `Tài khoản của ${fullName}`,
  );
  await expect(accountTrigger).toHaveAttribute("aria-expanded", "false");

  await accountTrigger.click();
  const logoutButton = page.getByRole("button", {
    name: "Đăng xuất",
    exact: true,
  });
  await expect(logoutButton).toBeVisible();
  const placement = await page.evaluate(() => {
    const trigger = document.querySelector<HTMLElement>(
      ".workspace-user-trigger",
    );
    const popover = document.querySelector<HTMLElement>(
      ".workspace-account-popover",
    );
    if (!trigger || !popover) throw new Error("Account menu missing");
    return {
      popoverBottom: popover.getBoundingClientRect().bottom,
      triggerTop: trigger.getBoundingClientRect().top,
    };
  });
  expect(placement.popoverBottom).toBeLessThanOrEqual(placement.triggerTop);
  await page.keyboard.press("Escape");
  await expect(logoutButton).toHaveCount(0);
  await expect(accountTrigger).toBeFocused();

  await page.goto("/basic-medical/schedules");
  await expect(
    page.getByRole("heading", { name: "Lịch Y cơ sở" }),
  ).toBeVisible();
  await expect(page.locator(".kpi-grid-three article")).toHaveCount(3);
  await expect(page.getByLabel("Lịch học", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Lịch trực", { exact: true })).toHaveCount(0);
});

test("Google OAuth production chuyển đến trang đăng nhập Google", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Đăng nhập bằng Google" }).click();

  await expect(page).toHaveURL(/accounts\.google\.com\//, { timeout: 15_000 });
});
