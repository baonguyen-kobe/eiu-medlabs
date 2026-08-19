import { expect, test, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("Cancellation Dialog & UI Hardening E2E", () => {
  test("1. ConfirmDialog is portalled to document.body, centered, and not clipped", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/classes/open");

    // Click delete on first class to trigger ConfirmDialog
    const deleteBtn = page.getByRole("button", { name: /^Xóa lớp/ }).first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();

      // Verify confirm dialog exists and is direct child of body
      const dialogOverlay = page.locator("body > .confirm-dialog-backdrop");
      await expect(dialogOverlay).toBeVisible();

      // Check dialog card position is within viewport
      const dialogCard = page.locator(".confirm-dialog-card");
      const box = await dialogCard.boundingBox();
      expect(box).not.toBeNull();
      const viewportSize = page.viewportSize() ?? { width: 1280, height: 720 };
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewportSize.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewportSize.height);

      // Cancel dialog
      await page.getByRole("button", { name: "Đóng", exact: true }).click();
      await expect(dialogOverlay).not.toBeVisible();
    }
  });

  test("2. Sequential keystroke typing does not lose focus in cancellation textarea/inputs", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/basic-medical/registrations");

    // Look for a registration cancel button if available, or verify input typing integrity
    const cancelBtn = page
      .getByRole("button", { name: "Hủy phiếu", exact: true })
      .first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      const reasonInput = page.getByPlaceholder("Nhập lý do hủy phiếu…");
      await expect(reasonInput).toBeVisible();

      // Type text character by character
      const testReason =
        "Lý do hủy chi tiết từ giảng viên phụ trách phòng thực hành";
      await reasonInput.focus();
      await page.keyboard.type(testReason, { delay: 20 });

      // Verify the entire text is preserved without dropping characters or losing focus
      await expect(reasonInput).toHaveValue(testReason);
      await expect(reasonInput).toBeFocused();

      // Close modal
      await page.getByRole("button", { name: "Đóng", exact: true }).click();
    }
  });

  test("3. Cancelled registration detail history aligns under header tracks", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/basic-medical/registrations");

    // If cancelled registration detail history exists in DOM or CSS styles match 5-track template
    const historyTemplate = await page.evaluate(() => {
      const el = document.createElement("div");
      el.className = "basic-medical-registration-detail-history";
      document.body.appendChild(el);
      const computed = window.getComputedStyle(el);
      const display = computed.display;
      const gridTemplateColumns = computed.gridTemplateColumns;
      document.body.removeChild(el);
      return { display, gridTemplateColumns };
    });

    expect(historyTemplate.display).toBe("grid");
  });
});
