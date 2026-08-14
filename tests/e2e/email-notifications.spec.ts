import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { clickUntilState } from "./helpers/interaction-readiness";

async function login(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await clickUntilState(
    page.locator('button[type="submit"]'),
    () => expect(page).toHaveURL(/\/dashboard$/, { timeout: 1_000 }),
    async () => {
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="password"]').fill(password);
    },
  );
}

test("tắt gửi thật sự và Admin xóa hàng loạt email đã chọn", async ({
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
        return [key, value.join("=").replace(/^"|"$/g, "")];
      }),
  );
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const suffix = crypto.randomUUID();
  const firstId = crypto.randomUUID();
  const secondId = crypto.randomUUID();
  const subjects = [`E2E email A ${suffix}`, `E2E email B ${suffix}`];
  const { data: recipient, error: recipientError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", "admin@campus.local")
    .single();
  expect(recipientError).toBeNull();
  expect(recipient).not.toBeNull();

  try {
    const { error } = await admin.from("email_notifications").insert([
      {
        id: firstId,
        notification_type: "e2e_email_test",
        recipient_id: recipient!.id,
        recipient_email: "first@example.com",
        dedupe_key: `e2e-email-a-${suffix}`,
        subject: subjects[0],
        status: "failed",
      },
      {
        id: secondId,
        notification_type: "e2e_email_test",
        recipient_id: recipient!.id,
        recipient_email: "second@example.com",
        dedupe_key: `e2e-email-b-${suffix}`,
        subject: subjects[1],
        status: "suppressed",
      },
    ]);
    expect(error).toBeNull();

    await page.goto("/login");
    await page.locator('input[name="email"]').fill("admin@campus.local");
    await page.locator('input[name="password"]').fill("LocalAdmin123!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/email-notifications");
    await expect(page.getByText("Chế độ hiện tại: Tắt gửi")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Tắt gửi email" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Bật gửi email thật" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Gửi lại" })).toHaveCount(0);

    await page.getByLabel(`Chọn email ${subjects[0]}`).check();
    await page.getByLabel(`Chọn email ${subjects[1]}`).check();
    await expect(page.getByText("Đã chọn 2 email")).toBeVisible();
    await page.getByRole("button", { name: "Xóa đã chọn" }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "Xóa vĩnh viễn 2 email thông báo đã chọn?",
    );
    await page.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await expect(page.getByText("Đã xóa 2 email thông báo.")).toBeVisible();
    await expect(page.getByText(subjects[0])).toHaveCount(0);
    await expect(page.getByText(subjects[1])).toHaveCount(0);
  } finally {
    await admin
      .from("email_notifications")
      .delete()
      .in("id", [firstId, secondId]);
  }
});

test("email capability navigation remains consistent across workspaces and direct URL is guarded", async ({
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
        return [key, value.join("=").replace(/^"|"$/g, "")];
      }),
  );
  const service = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: staff } = await service
    .from("profiles")
    .select("id,can_manage_email_notifications")
    .eq("email", "staff@campus.local")
    .single();
  expect(staff).not.toBeNull();
  const originalCapability = Boolean(staff?.can_manage_email_notifications);
  const { data: basicMedicalRoomType, error: roomTypeError } = await service
    .from("room_types")
    .select("id")
    .eq("code", "basic_medical")
    .single();
  expect(roomTypeError).toBeNull();
  expect(basicMedicalRoomType).not.toBeNull();
  const { data: existingScope, error: scopeError } = await service
    .from("profile_room_types")
    .select("profile_id")
    .eq("profile_id", staff!.id)
    .eq("room_type_id", basicMedicalRoomType!.id)
    .maybeSingle();
  expect(scopeError).toBeNull();
  let insertedBasicMedicalScope = false;

  try {
    expect(
      (
        await service
          .from("profiles")
          .update({ can_manage_email_notifications: true })
          .eq("id", staff!.id)
      ).error,
    ).toBeNull();
    if (!existingScope) {
      expect(
        (
          await service.from("profile_room_types").insert({
            profile_id: staff!.id,
            room_type_id: basicMedicalRoomType!.id,
          })
        ).error,
      ).toBeNull();
      insertedBasicMedicalScope = true;
    }
    await login(page, "staff@campus.local", "LocalStaff123!");
    for (const path of [
      "/class-schedules",
      "/basic-medical/schedules",
      "/email-notifications",
    ]) {
      await page.goto(path);
      await expect(
        page
          .getByRole("complementary")
          .locator('a[href="/email-notifications"]'),
      ).toBeVisible();
    }

    await page.context().clearCookies();
    expect(
      (
        await service
          .from("profiles")
          .update({ can_manage_email_notifications: false })
          .eq("id", staff!.id)
      ).error,
    ).toBeNull();
    await login(page, "staff@campus.local", "LocalStaff123!");
    await page.goto("/class-schedules");
    await expect(
      page.getByRole("complementary").locator('a[href="/email-notifications"]'),
    ).toHaveCount(0);
    await page.goto("/email-notifications");
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.context().clearCookies();
    await login(page, "admin@campus.local", "LocalAdmin123!");
    for (const path of [
      "/class-schedules",
      "/basic-medical/schedules",
      "/email-notifications",
    ]) {
      await page.goto(path);
      await expect(
        page
          .getByRole("complementary")
          .locator('a[href="/email-notifications"]'),
      ).toBeVisible();
    }
  } finally {
    if (staff) {
      await service
        .from("profiles")
        .update({ can_manage_email_notifications: originalCapability })
        .eq("id", staff.id);
    }
    if (insertedBasicMedicalScope && basicMedicalRoomType && staff) {
      await service
        .from("profile_room_types")
        .delete()
        .eq("profile_id", staff.id)
        .eq("room_type_id", basicMedicalRoomType.id);
    }
  }
});
