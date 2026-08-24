import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Phase 3B keeps lifecycle notifications transactional and domain scoped", async () => {
  const migration = await source(
    "supabase/migrations/20260824090000_phase3b_operational_notifications_audit.sql",
  );

  assert.match(migration, /create table public\.user_notifications/i);
  assert.match(migration, /recipient_id = \(select auth\.uid\(\)\)/i);
  assert.match(
    migration,
    /grant update\(read_at\) on public\.user_notifications/i,
  );
  assert.match(
    migration,
    /alter publication supabase_realtime add table public\.user_notifications/i,
  );
  assert.match(migration, /equipment_request\.handover_staff_confirmed/i);
  assert.match(migration, /equipment_request\.return_recipient_signed/i);
  assert.match(
    migration,
    /private\.can_manage_equipment_request\(target_request_id\)/i,
  );
  assert.match(migration, /basic_medical.*nursing_skills/is);
  assert.match(migration, /late_pending_updated/i);
  assert.match(
    migration,
    /create trigger email_outbox_suppress_repeated_late_equipment_email/i,
  );
  assert.doesNotMatch(
    migration,
    /ready_for_handover|handed_over_email|completed_email/i,
  );
  assert.doesNotMatch(migration, /to_jsonb\(old\)|to_jsonb\(new\)/i);
});

test("notification bell uses realtime rather than polling and exposes accessible controls", async () => {
  const bell = await source("components/notification-bell.tsx");
  const shell = await source("components/workspace-shell.tsx");

  assert.match(bell, /table:\s*"user_notifications"/);
  assert.match(bell, /filter:\s*`recipient_id=eq\.\$\{id\}`/);
  assert.match(bell, /removeChannel/);
  assert.match(bell, /Đánh dấu tất cả đã đọc/);
  assert.match(bell, /event\.key !== "Escape"/);
  assert.doesNotMatch(bell, /setInterval|setTimeout\([^,]+,\s*\d{3,}/);
  assert.match(shell, /<NotificationBell\s*\/>/);
});

test("email grammar and Basic Medical cancellation remain domain aware", async () => {
  const equipment = await source("lib/equipment-request-emails.ts");
  const basicMedical = await source("lib/basic-medical-emails.ts");
  const renderer = await source("lib/email-template-v2.ts");
  const damage = await source("lib/basic-medical-equipment-emails.ts");

  assert.match(equipment, /\[Skills Lab\]\[New\]/);
  assert.match(equipment, /\[Cancelled\] Hủy phiếu đăng ký thiết bị/);
  assert.match(equipment, /\[Admin MedLabs Calendar\]\[Skills Lab\]/);
  assert.match(basicMedical, /tag: "Cancelled", text: "Hủy Phiếu Y cơ sở"/);
  assert.match(renderer, /đã được hủy/);
  assert.match(damage, /registration_id_snapshot/);
  assert.match(damage, /teaching_lecturer_id_snapshot/);
});
