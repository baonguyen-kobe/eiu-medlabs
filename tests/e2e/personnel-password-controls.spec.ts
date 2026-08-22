import nextEnv from "@next/env";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { clickUntilState } from "./helpers/interaction-readiness";

nextEnv.loadEnvConfig(process.cwd());

const localMailpitUrl = process.env.LOCAL_SMTP_URL ?? "http://127.0.0.1:54324";

const serviceDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function login(
  page: Page,
  email: string,
  password: string,
  expectedLanding = /\/(dashboard|change-password)$/,
) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(expectedLanding, { timeout: 20_000 });
}

async function waitForRecoveryLink(email: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const listResponse = await fetch(`${localMailpitUrl}/api/v1/messages`);
    const list = (await listResponse.json()) as {
      messages?: Array<{ ID?: string; To?: Array<{ Address?: string }> }>;
    };
    const message = list.messages?.find((candidate) =>
      candidate.To?.some(
        (recipient) => recipient.Address?.toLowerCase() === email.toLowerCase(),
      ),
    );
    if (message?.ID) {
      const detailResponse = await fetch(
        `${localMailpitUrl}/api/v1/message/${message.ID}`,
      );
      const detail = (await detailResponse.json()) as {
        Text?: string;
        HTML?: string;
      };
      const content = `${detail.Text ?? ""}\n${detail.HTML ?? ""}`.replaceAll(
        "&amp;",
        "&",
      );
      const link = content
        .match(/https?:\/\/[^\s"'<>]+/g)
        ?.find((value) => value.includes("/auth/v1/verify"));
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Password recovery email was not delivered to local Mailpit");
}

test("Personnel reset forces an email-password account through password change before workspace access", async ({
  page,
}) => {
  test.slow();
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
    await drawer
      .getByRole("textbox", { name: "Mật khẩu mới", exact: true })
      .fill("RootCustom123!");
    await drawer.getByLabel("Xác nhận mật khẩu mới").fill("RootCustom123!");
    await drawer.getByRole("button", { name: "Đổi mật khẩu" }).click();
    const customPasswordDialog = page.getByRole("dialog", {
      name: "Đổi mật khẩu với quyền Root?",
    });
    await expect(customPasswordDialog).toBeVisible();
    await customPasswordDialog
      .getByRole("button", { name: "Đổi mật khẩu", exact: true })
      .click();
    await expect(drawer.getByRole("status")).toContainText("Đã đổi mật khẩu", {
      timeout: 20_000,
    });

    await page.context().clearCookies();
    await login(page, email, "RootCustom123!");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.context().clearCookies();
    await login(page, "admin@campus.local", "LocalAdmin123!");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto(`/admin/personnel?q=${encodeURIComponent(email)}`);
    await expect(row).toBeVisible();
    await clickUntilState(row.getByRole("button", { name: "Sửa" }), () =>
      expect(drawer).toBeVisible({ timeout: 1_000 }),
    );
    await drawer.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
    const resetPasswordDialog = page.getByRole("dialog", {
      name: "Đặt lại mật khẩu?",
    });
    await expect(resetPasswordDialog).toBeVisible();
    await resetPasswordDialog
      .getByRole("button", { name: "Đặt lại mật khẩu", exact: true })
      .click();
    await expect(drawer.getByRole("status")).toContainText(
      "mật khẩu tạm thời",
      { timeout: 20_000 },
    );

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
    await expect(page).toHaveURL(/\/dashboard$/, {
      timeout: 20_000,
    });

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

test("forgot-password uses the local canonical callback and completes an email-password recovery", async ({
  page,
}) => {
  test.slow();
  const email = `recovery-${crypto.randomUUID()}@campus.local`;
  const initialPassword = "InitialPassword123!";
  const recoveredPassword = "RecoveredPassword123!";
  const { data: created, error: createError } =
    await serviceDb.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
    });
  expect(createError).toBeNull();
  const targetId = created.user?.id;
  if (!targetId) throw new Error("Missing recovery test user id");

  try {
    await serviceDb.from("user_roles").insert({
      user_id: targetId,
      role: "lecturer",
    });
    await page.goto("/forgot-password");
    await page.getByLabel("Email đăng nhập").fill(email);
    await page.getByRole("button", { name: "Gửi hướng dẫn" }).click();
    await expect(page.getByText("Nếu tài khoản hỗ trợ mật khẩu")).toBeVisible({
      timeout: 20_000,
    });

    const recoveryLink = await waitForRecoveryLink(email);
    expect(recoveryLink).toContain("redirect_to=http%3A%2F%2Flocalhost%3A3000");
    await page.goto(recoveryLink);
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel("Mật khẩu mới").fill(recoveredPassword);
    await page.getByLabel("Xác nhận mật khẩu").fill(recoveredPassword);
    await page.getByRole("button", { name: "Cập nhật mật khẩu" }).click();
    await expect(page).toHaveURL(/\/dashboard$/, {
      timeout: 20_000,
    });

    await page.context().clearCookies();
    await login(page, email, recoveredPassword);
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally {
    await serviceDb.auth.admin.deleteUser(targetId);
  }
});

test("database password operations reject Google-only targets and non-Root custom changes", async () => {
  const suffix = crypto.randomUUID();
  const { data: passwordUser, error: passwordUserError } =
    await serviceDb.auth.admin.createUser({
      email: `non-root-${suffix}@campus.local`,
      password: "InitialPassword123!",
      email_confirm: true,
    });
  const { data: googleUser, error: googleUserError } =
    await serviceDb.auth.admin.createUser({
      email: `google-only-${suffix}@campus.local`,
      email_confirm: true,
      app_metadata: { provider: "google", providers: ["google"] },
    });
  expect(passwordUserError).toBeNull();
  expect(googleUserError).toBeNull();
  const passwordUserId = passwordUser.user?.id;
  const googleUserId = googleUser.user?.id;
  if (!passwordUserId || !googleUserId)
    throw new Error("Missing provider fixtures");

  try {
    await serviceDb.from("user_roles").insert([
      { user_id: passwordUserId, role: "lecturer" },
      { user_id: googleUserId, role: "lecturer" },
    ]);
    const root = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error: rootSignInError } = await root.auth.signInWithPassword({
      email: "admin@campus.local",
      password: "LocalAdmin123!",
    });
    expect(rootSignInError).toBeNull();
    const { error: googleResetError } = await root.rpc(
      "begin_personnel_password_reset",
      { target_user_id: googleUserId },
    );
    expect(googleResetError?.message).toContain("PASSWORD_RESET_NOT_AVAILABLE");

    const nonRoot = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error: nonRootSignInError } = await nonRoot.auth.signInWithPassword(
      {
        email: "admin.other@campus.local",
        password: "LocalOtherAdmin123!",
      },
    );
    expect(nonRootSignInError).toBeNull();
    const { error: nonRootChangeError } = await nonRoot.rpc(
      "reserve_personnel_password_change",
      { target_user_id: passwordUserId },
    );
    expect(nonRootChangeError?.message).toMatch(
      /ROOT_REQUIRED|PERSONNEL_MANAGER_REQUIRED/,
    );
  } finally {
    await serviceDb.auth.admin.deleteUser(passwordUserId);
    await serviceDb.auth.admin.deleteUser(googleUserId);
  }
});
