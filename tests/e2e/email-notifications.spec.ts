import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

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

  try {
    const { error } = await admin.from("email_notifications").insert([
      {
        id: firstId,
        notification_type: "e2e_email_test",
        recipient_id: "c18c4f94-a58a-4b5f-abd0-8c4856affab8",
        recipient_email: "first@example.com",
        dedupe_key: `e2e-email-a-${suffix}`,
        subject: subjects[0],
        status: "failed",
      },
      {
        id: secondId,
        notification_type: "e2e_email_test",
        recipient_id: "c18c4f94-a58a-4b5f-abd0-8c4856affab8",
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
