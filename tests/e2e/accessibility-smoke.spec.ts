import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoWcagViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(
    results.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      targets: nodes.map(({ target }) => target),
    })),
  ).toEqual([]);
}

test("trang đăng nhập không có vi phạm WCAG tự động", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "MedLabs Calendar" }),
  ).toBeVisible();
  await expectNoWcagViolations(page);
});

test("workspace chính có skip link, tên truy cập và không vi phạm WCAG", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("ID hoặc email").fill("admin@campus.local");
  await page.getByLabel("Mật khẩu").fill("LocalAdmin123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.reload();
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", {
    name: "Bỏ qua đến nội dung chính",
  });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  await expectNoWcagViolations(page);
});
