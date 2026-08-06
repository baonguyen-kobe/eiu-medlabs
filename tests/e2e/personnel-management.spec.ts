import nextEnv from "@next/env";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const serviceDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function deletePersonnel(email: string) {
  await adminDb.auth.signInWithPassword({
    email: "admin@campus.local",
    password: "LocalAdmin123!",
  });
  const { data } = await adminDb
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (data?.id) await serviceDb.auth.admin.deleteUser(data.id);
}

test("personnel drawer saves role, import capability and lock atomically", async ({
  page,
}) => {
  const email = `personnel-e2e-${Date.now()}@campus.local`;
  await loginAsAdmin(page);
  try {
    await page.goto("/admin/personnel");
    await page.getByText("Thêm nhân sự mới", { exact: true }).click();
    const createForm = page.locator(".admin-create-personnel form");
    await createForm.locator('input[name="full_name"]').fill("Trợ giảng E2E");
    await createForm.locator('input[name="email"]').fill(email);
    await createForm.locator('input[name="password"]').fill("LocalQa123!");
    await createForm.locator('input[name="phone"]').fill("0900999888");
    await createForm
      .locator('input[name="roles"][value="teaching_assistant"]')
      .check();
    await createForm.locator('input[name="can_import_schedules"]').check();
    await createForm.getByRole("button", { name: "Tạo tài khoản" }).click();

    const row = page
      .locator(".personnel-table tbody tr")
      .filter({ hasText: email });
    await expect(row).toContainText("Trợ giảng");
    await expect(row).toContainText("Nhập lịch");
    await row.getByRole("button", { name: "Sửa" }).click();

    const drawer = page.getByRole("dialog", { name: "Chỉnh sửa nhân sự" });
    await drawer.getByLabel("Cho phép nhập lịch").uncheck();
    await drawer.getByLabel("Đang hoạt động").uncheck();
    page.once("dialog", (dialog) => dialog.accept());
    await drawer.getByRole("button", { name: "Lưu thay đổi" }).click();

    await expect(drawer.getByRole("status")).toContainText(
      "Đã cập nhật nhân sự.",
    );
    await expect(row).toContainText("Đã khóa");
    await expect(row).not.toContainText("Nhập lịch");
  } finally {
    await deletePersonnel(email);
  }
});
