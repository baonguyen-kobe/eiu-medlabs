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

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

test("Personnel reset forces an email-password account through password change before workspace access", async ({
  page,
}) => {
  const email = `password-flow-${crypto.randomUUID()}@campus.local`;
  const initialPassword = "InitialPassword123!";
  const changedPassword = "ChangedPassword123!";
  const { data: created, error: createError } =
    await serviceDb.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
    });
  expect(createError).toBeNull();
  const targetId = created.user?.id;
  if (!targetId) throw new Error("Missing password-flow user id");

  try {
    await serviceDb.from("user_roles").insert({
      user_id: targetId,
      role: "lecturer",
    });

    await login(page, "admin@campus.local", "LocalAdmin123!");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto(`/admin/personnel?q=${encodeURIComponent(email)}`);
    const row = page
      .locator(".personnel-table tbody tr")
      .filter({ hasText: email });
    await expect(row).toBeVisible();
    const drawer = page.getByRole("dialog", { name: "Chỉnh sửa nhân sự" });
    await clickUntilState(row.getByRole("button", { name: "Sửa" }), () =>
      expect(drawer).toBeVisible({ timeout: 1_000 }),
    );
    page.once("dialog", (dialog) => dialog.accept());
    await drawer.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
    await expect(drawer.getByRole("status")).toContainText("mật khẩu tạm thời");

    const { data: forcedProfile } = await serviceDb
      .from("profiles")
      .select("must_change_password")
      .eq("id", targetId)
      .single();
    expect(forcedProfile?.must_change_password).toBe(true);

    await page.context().clearCookies();
    await login(page, email, email);
    await expect(page).toHaveURL(/\/change-password$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/change-password$/);
    await page.getByLabel("Mật khẩu mới").fill(changedPassword);
    await page.getByLabel("Xác nhận mật khẩu").fill(changedPassword);
    await page.getByRole("button", { name: "Cập nhật mật khẩu" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const { data: completedProfile } = await serviceDb
      .from("profiles")
      .select("must_change_password")
      .eq("id", targetId)
      .single();
    expect(completedProfile?.must_change_password).toBe(false);
  } finally {
    await serviceDb.auth.admin.deleteUser(targetId);
  }
});
