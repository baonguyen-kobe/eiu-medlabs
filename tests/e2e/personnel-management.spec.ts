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

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
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

test("Root và Bảo thấy Personnel, Admin thường bị ẩn menu và redirect", async ({
  page,
}) => {
  await login(page, "bao.nguyen@eiu.edu.vn", "LocalPersonnelManager123!");
  await expect(page.getByRole("link", { name: "Nhân sự" })).toBeVisible();
  await page.goto("/admin/personnel");
  await expect(page).toHaveURL(/\/admin\/personnel/);
  const rootRow = page
    .locator(".personnel-table tbody tr")
    .filter({ hasText: "admin@campus.local" });
  await expect(rootRow).toContainText("Root Administrator");
  await expect(rootRow.getByRole("button", { name: "Xem" })).toBeVisible();
  const managerRow = page
    .locator(".personnel-table tbody tr")
    .filter({ hasText: "bao.nguyen@eiu.edu.vn" });
  await expect(managerRow).toContainText("Quản lý nhân sự");
  await expect(managerRow.getByRole("button", { name: "Xem" })).toBeVisible();

  await page.context().clearCookies();
  await login(page, "admin.other@campus.local", "LocalOtherAdmin123!");
  await expect(page.getByRole("link", { name: "Nhân sự" })).toHaveCount(0);
  await page.goto("/admin/personnel");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("personnel reconciler actual integration test (N-MEDIUM-01)", async ({
  request,
}) => {
  const email = `reconciler-e2e-${Date.now()}@campus.local`;
  const { data: targetUser, error: createError } =
    await serviceDb.auth.admin.createUser({
      email,
      password: "LocalTest123!",
      email_confirm: true,
    });
  expect(createError).toBeNull();
  if (!targetUser?.user?.id) {
    throw new Error("Failed to create personnel reconciliation test user");
  }
  const targetUserId = targetUser.user.id;

  try {
    // Create a fresh client for root admin to avoid sharing state
    const rootDb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Sign in as root temporarily to get session
    const { error: rootAuthError } = await rootDb.auth.signInWithPassword({
      email: "admin@campus.local",
      password: "LocalAdmin123!",
    });
    expect(rootAuthError).toBeNull();

    // Get profile data for target
    const { data: profile } = await serviceDb
      .from("profiles")
      .select("*")
      .eq("id", targetUserId)
      .single();
    if (!profile) {
      throw new Error("Missing personnel reconciliation test profile");
    }

    const { data: roomType } = await serviceDb
      .from("room_types")
      .select("id")
      .limit(1)
      .single();
    if (!roomType) {
      throw new Error(
        "Missing room type fixture for personnel reconciliation test",
      );
    }

    // 1. Begin personnel update
    const requestedEmail = `changed-${email}`;
    const payload = {
      target_profile_id: targetUserId,
      target_full_name: profile.full_name || "Reconciler Test",
      target_email: requestedEmail,
      target_phone: profile.phone || "0900999888",
      target_roles: ["lecturer"],
      target_room_type_ids: [roomType.id],
      target_email_room_type_ids: [roomType.id],
      target_title: profile.title || null,
      target_allow_basic_medical_access: false,
      target_is_active: true,
      target_expected_version: profile.access_version,
      target_can_import_schedules: false,
    };

    const { data: operation, error: beginError } = await rootDb.rpc(
      "begin_personnel_update",
      payload,
    );
    expect(beginError).toBeNull();
    if (!operation?.operation_id) {
      throw new Error("Personnel update operation is missing operation_id");
    }
    const operationId = operation.operation_id;

    // 2. Auth update succeeds
    const { error: authUpdateError } =
      await serviceDb.auth.admin.updateUserById(targetUserId, {
        email: requestedEmail,
        email_confirm: true,
      });
    expect(authUpdateError).toBeNull();

    // 3. DB mark/finalization is intentionally skipped
    // 4. Operation becomes expired (we simulate by updating expires_at)
    await serviceDb
      .from("personnel_update_operations")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", operationId);

    // 5. REAL reconciler runs
    const response = await request.get(
      "/api/internal/personnel-reconciliation",
      {
        headers: {
          authorization: "Bearer local-e2e-cron-secret",
        },
      },
    );
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.rolledBack).toBeGreaterThanOrEqual(1);

    // 6. Auth is restored
    const { data: finalAuth } =
      await serviceDb.auth.admin.getUserById(targetUserId);
    expect(finalAuth.user?.email).toBe(email);

    // 7. Profile stays/restores previous state
    const { data: finalProfile } = await serviceDb
      .from("profiles")
      .select("email")
      .eq("id", targetUserId)
      .single();
    if (!finalProfile) {
      throw new Error("Missing profile during reconciliation verify");
    }
    expect(finalProfile.email).toBe(email);

    // 8. Operation becomes rolled_back
    const { data: durable } = await serviceDb
      .from("personnel_update_operations")
      .select("status")
      .eq("id", operationId)
      .single();
    if (!durable) {
      throw new Error("Missing personnel operation during verify");
    }
    expect(durable.status).toBe("rolled_back");
  } finally {
    if (targetUser?.user?.id) {
      await serviceDb.auth.admin.deleteUser(targetUser.user.id);
    }
  }
});
