import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("admin@campus.local");
  await page.locator('input[name="password"]').fill("LocalAdmin123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function loginAsStaff(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("staff@campus.local");
  await page.locator('input[name="password"]').fill("LocalStaff123!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("Phiếu Y cơ sở hiển thị danh sách thu gọn và bộ lọc trạng thái", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.goto("/basic-medical/registrations");
  await expect(
    page.getByRole("heading", { name: "Phiếu Y cơ sở" }),
  ).toBeVisible();
  await expect(page.locator('select[name="status"]')).toHaveValue("incomplete");
  await expect(
    page.getByRole("columnheader", { name: "Trạng thái" }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("Tìm mã môn, tên môn, phòng, giảng viên…"),
  ).toBeVisible();
});

test("Danh sách thiết bị Y cơ sở có đủ bốn tab và thao tác quản lý", async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.goto("/basic-medical/equipment");
  await expect(
    page.getByRole("heading", { name: "Danh sách thiết bị Y cơ sở" }),
  ).toBeVisible();
  await expect(page.locator(".basic-medical-equipment-tabs a")).toHaveText([
    "Thiết bị",
    "Thiết bị theo phòng",
    "Thiết bị hư",
    "Log thay đổi",
  ]);
  const tabsBeforeManualForm = await page.evaluate(() => {
    const tabs = document.querySelector(".basic-medical-equipment-tabs");
    const form = document.querySelector(".equipment-catalog-create-form");
    return Boolean(
      tabs &&
      form &&
      tabs.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(tabsBeforeManualForm).toBe(true);
  await expect(page.getByRole("link", { name: "Tải template" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Export tất cả" })).toBeVisible();
  await page.getByRole("link", { name: "Thiết bị theo phòng" }).click();
  await expect(page).toHaveURL(/tab=rooms/);
  await expect(
    page.getByRole("heading", { name: "Thiết bị theo phòng" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Thiết bị hư" }).click();
  await expect(page).toHaveURL(/tab=damaged/);
  await expect(
    page.getByPlaceholder("Tìm thiết bị, phòng, người thay đổi, ghi chú…"),
  ).toBeVisible();
});

test("Chuyên viên ngoài scope không thấy và không mở được thiết bị Y cơ sở", async ({
  page,
}) => {
  await loginAsStaff(page);
  await expect(
    page.getByRole("link", { name: "Danh sách thiết bị Y cơ sở" }),
  ).toHaveCount(0);
  await page.goto("/basic-medical/equipment");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("Hai page Y cơ sở mới không tràn màn hình mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  for (const path of [
    "/basic-medical/registrations",
    "/basic-medical/equipment",
  ]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("Người xem Y cơ sở không truy cập Danh sách thiết bị Y cơ sở", async ({
  page,
}) => {
  const envText = await readFile(
    new URL("../../.env.local", import.meta.url),
    "utf8",
  );
  const env = Object.fromEntries(
    envText
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const [key, ...value] = line.split("=");
        return [key, value.join("=")];
      }),
  );
  const service = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false } },
  );
  const email = `viewer-basic-${crypto.randomUUID()}@campus.local`;
  const password = "LocalViewer123!";
  const { data: adminProfile } = await service
    .from("profiles")
    .select("id")
    .eq("email", "admin@campus.local")
    .single();
  const { data: created, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Người xem Y cơ sở" },
    app_metadata: { preapproved: true },
  });
  expect(error).toBeNull();
  const userId = created.user!.id;
  try {
    const { error: profileError } = await service
      .from("profiles")
      .update({ is_active: true })
      .eq("id", userId);
    expect(profileError).toBeNull();
    const { error: roleError } = await service.from("user_roles").insert({
      user_id: userId,
      role: "viewer",
      created_by: adminProfile!.id,
    });
    expect(roleError).toBeNull();
    const { error: scopeError } = await service
      .from("profile_room_types")
      .insert({
        profile_id: userId,
        room_type_id: "40000000-0000-0000-0000-000000000002",
        created_by: adminProfile!.id,
        receive_schedule_emails: false,
      });
    expect(scopeError).toBeNull();
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("link", { name: "Danh sách thiết bị Y cơ sở" }),
    ).toHaveCount(0);
    await page.goto("/basic-medical/equipment");
    await expect(
      page.getByRole("heading", { name: "Danh sách thiết bị Y cơ sở" }),
    ).toBeVisible();
    await expect(page.getByText("Thêm thiết bị thủ công")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Import mới" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("link", { name: "Export tất cả" })).toHaveCount(
      0,
    );
    await page.goto("/basic-medical/registrations");
    await expect(
      page.getByRole("heading", { name: "Phiếu Y cơ sở" }),
    ).toBeVisible();
  } finally {
    await service.auth.admin.deleteUser(userId);
  }
});
