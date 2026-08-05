import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.skip(
  process.env.RUN_EMAIL_MATRIX_DELIVERY !== "1",
  "Chỉ chạy khi chủ động kiểm thử gửi email thật qua Apps Script.",
);

test("gửi một bản kiểm thử cho từng loại email đã chốt", async ({ page }) => {
  test.setTimeout(10 * 60_000);
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
  expect(
    (env.EMAIL_TEST_RECIPIENT || "bao.nguyen@eiu.edu.vn").toLowerCase(),
  ).toBe("bao.nguyen@eiu.edu.vn");

  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: adminProfile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", "admin@campus.local")
    .single();
  expect(profileError).toBeNull();
  expect(adminProfile).toBeTruthy();

  const runId = crypto.randomUUID();
  const schedule = {
    course_code: "NUR 207",
    course_name: "Nền tảng Điều dưỡng và Điều dưỡng cơ sở II",
    schedule_date: "2026-08-13",
    start_time: "12:30",
    end_time: "16:30",
    room: "114 · B08",
    lecturer: "Nguyễn An",
    student_count: 25,
    actor: "Nguyễn An",
    creator: "Nguyễn An",
    request_code: "260805130000",
  };
  const equipment = {
    ...schedule,
    request_id: runId,
    request_code: "260805130001",
    semester: "HK1 (2026-2027)",
    lab_type: "Kỹ năng Điều dưỡng",
    registrant_name: "Nguyễn An",
    registrant_email: "admin@campus.local",
    registrant_phone: "0901000001",
    responsible_name: "Nguyễn Ngọc Diễm",
    responsible_email: "giangvien@campus.local",
    receive_at: "2026-08-12T01:00:00.000Z",
    return_at: "2026-08-13T10:00:00.000Z",
    late_registration_reason: "Kiểm thử nội dung đăng ký trễ",
    late_review_note: "Kiểm thử nội dung xét duyệt",
    note: "Email kiểm thử ma trận thông báo",
    audience: "registrant",
    items: [
      {
        skill_name: "Kỹ năng kiểm thử",
        item_name: "Ống nghe",
        commercial_name: "Littmann Classic III",
        unit: "Cái",
        quantity: 2,
        note: "Chuẩn bị đủ phụ kiện",
      },
    ],
  };
  const basicRegistration = {
    ...schedule,
    registration_id: runId,
    registration_code: "260805130002",
    academic_year: "2026-2027",
    semester: "HK1",
    start_date: "2026-08-13",
    end_date: "2026-08-20",
    registrant_name: "Nguyễn An",
    responsible_name: "Nguyễn Ngọc Diễm",
    note: "Email kiểm thử phiếu Y cơ sở",
    schedules: [schedule],
  };
  const subjectsAndPayloads = [
    {
      type: "class_schedule_created",
      subject:
        "[MedLabs Calendar] Lịch phòng Skills Lab mới của Nguyễn An - 13/08/2026 - NUR 207 - 260805130000",
      payload: { ...schedule, room_type_code: "nursing_skills" },
    },
    {
      type: "class_schedule_import_summary",
      subject:
        "[MedLabs Calendar] Cập nhật Lịch sử dụng phòng Skills Lab mới · 1 lịch mới",
      payload: {
        ...schedule,
        file_name: "Export_TKB.xlsx",
        total_rows: 1,
        imported_rows: 1,
        warning_rows: 0,
        error_rows: 0,
        duplicate_rows: 0,
        schedules: [schedule],
      },
    },
    {
      type: "class_schedule_rescheduled",
      subject:
        "[MedLabs Calendar] Đổi ngày học của Nguyễn An - NUR 207 - 14/08/2026 - 260805130000",
      payload: {
        ...schedule,
        old_schedule_date: "2026-08-13",
        schedule_date: "2026-08-14",
      },
    },
    {
      type: "class_schedule_skills_lab_deleted",
      subject:
        "[MedLabs Calendar] Giảng viên Nguyễn An xóa lớp Skills Lab - NUR 207 - 13/08/2026 - 260805130000",
      payload: schedule,
    },
    ...[
      [
        "created",
        "[MedLabs Calendar][New] Xác nhận đăng ký trang thiết bị của Nguyễn An - 13/08/2026 - NUR 207 - 260805130001",
      ],
      [
        "updated",
        "[MedLabs Calendar][Adjusted] Điều chỉnh phiếu đăng ký thiết bị của Nguyễn An - 13/08/2026 - NUR 207 - 260805130001",
      ],
      [
        "late_approval_requested",
        "[MedLabs Calendar][Late] Gửi phiếu đăng ký thiết bị trễ - Nguyễn An - 13/08/2026 - NUR 207 - 260805130001",
      ],
      [
        "late_approval_approved",
        "[MedLabs Calendar][Late] Đã duyệt đăng ký trễ - Nguyễn An - 13/08/2026 - NUR 207 - 260805130001",
      ],
      [
        "late_approval_rejected",
        "[MedLabs Calendar][Late] Từ chối đăng ký trễ - Nguyễn An - 13/08/2026 - NUR 207 - 260805130001",
      ],
      [
        "deleted",
        "[MedLabs Calendar][Deleted] Phiếu đăng ký thiết bị đã bị xóa - Nguyễn An - 13/08/2026 - NUR 207 - 260805130001",
      ],
    ].map(([event, subject]) => ({
      type: `equipment_request_${event}`,
      subject,
      payload: { ...equipment, event },
    })),
    ...[
      [
        "created",
        "[MedLabs Calendar] Có đăng ký phòng TNTH mới · Nguyễn An - NUR 207 - 13/08/2026–20/08/2026 - 260805130002",
      ],
      [
        "updated",
        "[MedLabs Calendar] Điều chỉnh phiếu đăng ký phòng TNTH · Nguyễn An - NUR 207 - 13/08/2026–20/08/2026 - 260805130002",
      ],
      [
        "deleted",
        "[MedLabs Calendar] Xóa phiếu đăng ký phòng TNTH · Nguyễn An - NUR 207 - 13/08/2026–20/08/2026 - 260805130002",
      ],
    ].map(([event, subject]) => ({
      type: `basic_medical_registration_${event}`,
      subject,
      payload: basicRegistration,
    })),
    {
      type: "class_schedule_basic_medical_updated",
      subject: "[MedLabs Calendar] Đổi ngày học Y cơ sở · NUR 207",
      payload: {
        ...schedule,
        old_schedule_date: "2026-08-13",
        schedule_date: "2026-08-14",
      },
    },
    {
      type: "class_schedule_basic_medical_updated",
      subject: "[MedLabs Calendar] Điều chỉnh lịch Y cơ sở · NUR 207",
      payload: schedule,
    },
    {
      type: "class_schedule_basic_medical_cancelled",
      subject: "[MedLabs Calendar] Hủy lịch Y cơ sở · NUR 207",
      payload: schedule,
    },
  ];
  expect(subjectsAndPayloads).toHaveLength(16);
  const startIndex = Number(process.env.EMAIL_MATRIX_START_INDEX ?? "0");
  const limit = Number(
    process.env.EMAIL_MATRIX_LIMIT ?? subjectsAndPayloads.length,
  );
  const selectedNotifications = subjectsAndPayloads.slice(
    startIndex,
    startIndex + limit,
  );
  expect(selectedNotifications.length).toBeGreaterThan(0);

  const ids = selectedNotifications.map(() => crypto.randomUUID());
  const rows = selectedNotifications.map((item, index) => ({
    id: ids[index],
    notification_type: item.type,
    recipient_id: adminProfile!.id,
    recipient_email: "original-recipient@example.com",
    dedupe_key: `email-matrix-smoke:${runId}:${startIndex + index}`,
    subject: item.subject,
    payload: item.payload,
    status: "failed",
    attempts: 0,
    last_error: "Chờ kiểm thử gửi chủ động",
  }));

  try {
    const { error: modeError } = await admin
      .from("email_delivery_settings")
      .update({
        delivery_mode: "test",
        updated_by: adminProfile!.id,
        updated_at: new Date().toISOString(),
      })
      .eq("setting_key", "primary");
    expect(modeError).toBeNull();
    const { error: insertError } = await admin
      .from("email_notifications")
      .insert(rows);
    expect(insertError).toBeNull();

    await page.goto("/login");
    await page.locator('input[name="email"]').fill("admin@campus.local");
    await page.locator('input[name="password"]').fill("LocalAdmin123!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    for (const [index, item] of selectedNotifications.entries()) {
      await page.goto("/email-notifications");
      const row = page.locator("tr", { hasText: item.subject });
      await expect(row).toHaveCount(1);
      await row.getByRole("button", { name: "Gửi lại" }).click();
      await expect
        .poll(
          async () => {
            const { data } = await admin
              .from("email_notifications")
              .select("status,last_error")
              .eq("id", ids[index])
              .single();
            return data?.status === "failed"
              ? `failed: ${data.last_error ?? "Không có mô tả lỗi"}`
              : data?.status;
          },
          { timeout: 90_000, intervals: [500, 1_000, 2_000, 5_000] },
        )
        .toBe("simulated");
      const { data: deliveredRow, error: deliveredRowError } = await admin
        .from("email_notifications")
        .select("status,last_error,sent_at")
        .eq("id", ids[index])
        .single();
      expect(deliveredRowError).toBeNull();
      expect(deliveredRow?.status, deliveredRow?.last_error ?? undefined).toBe(
        "simulated",
      );
      expect(deliveredRow?.sent_at).toBeTruthy();
    }

    const { data: delivered, error: deliveredError } = await admin
      .from("email_notifications")
      .select("id,status,sent_at")
      .in("id", ids);
    expect(deliveredError).toBeNull();
    expect(delivered).toHaveLength(selectedNotifications.length);
    expect(delivered?.every((item) => item.status === "simulated")).toBe(true);
    expect(delivered?.every((item) => item.sent_at)).toBe(true);
  } finally {
    await admin.from("email_notifications").delete().in("id", ids);
  }
});
