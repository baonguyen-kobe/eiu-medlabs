import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Basic Medical equipment email renderer keeps domain terminology isolated", async () => {
  const [template, legacyRenderer, snapshot] = await Promise.all([
    source("lib/email-template-v2.ts"),
    source("lib/email-notifications.ts"),
    source("lib/equipment-request-emails.ts"),
  ]);

  for (const renderer of [template, legacyRenderer]) {
    assert.match(renderer, /payload\.request_domain === "basic_medical"/);
    assert.match(renderer, /Giảng viên giảng dạy\/hướng dẫn/);
    assert.match(renderer, /Giảng viên phụ trách/);
  }
  assert.match(snapshot, /basic_medical_equipment_catalog/);
  assert.match(snapshot, /request_domain: "nursing_skills" \| "basic_medical"/);
  assert.match(snapshot, /Y cơ sở/);
  assert.match(snapshot, /\[Y cơ sở\]/);
  assert.doesNotMatch(
    snapshot.match(/function subjectForAudience[\s\S]*?\n}\n/)?.[0] ?? "",
    /\[Y cơ sở\].*nursing_skills/,
  );
});

test("Basic Medical actions process the durable outbox only after successful mutations", async () => {
  const actions = await source("app/basic-medical/registrations/actions.ts");

  assert.match(actions, /import \{ processPendingEmailOutbox \}/);
  assert.match(
    actions,
    /if \(error \|\| !requestId\) \{[\s\S]*?return \{ ok: false/,
  );
  assert.match(
    actions,
    /create_equipment_request_with_items[\s\S]*?if \(error \|\| !requestId\)[\s\S]*?after\(\(\) => processPendingEmailOutbox\(\)\)/,
  );
  assert.match(
    actions,
    /update_basic_medical_equipment_request_content[\s\S]*?if \(error \|\| !updatedId\)[\s\S]*?after\(\(\) => processPendingEmailOutbox\(\)\)/,
  );
});

test("the final domain-aware outbox processor skips deleted recipient profiles", async () => {
  const [migration, schema] = await Promise.all([
    source(
      "supabase/migrations/20260823121000_restore_email_outbox_deleted_recipient_guard.sql",
    ),
    source("supabase/schemas/29_basic_medical_equipment_request_email.sql"),
  ]);

  assert.match(migration, /public\.process_email_outbox_events/);
  assert.match(
    migration,
    /if not exists \(select 1 from public\.profiles where id = recipient_id_value\) then continue; end if;/,
  );
  assert.match(
    schema,
    /20260823121000_restore_email_outbox_deleted_recipient_guard\.sql/,
  );
});
