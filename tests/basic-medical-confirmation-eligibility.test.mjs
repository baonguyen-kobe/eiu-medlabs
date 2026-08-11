import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [registrationsPage, confirmationRpc] = await Promise.all([
  readFile(
    new URL("../app/basic-medical/registrations/page.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL(
      "../supabase/migrations/20260809090000_basic_medical_transactional_outbox.sql",
      import.meta.url,
    ),
    "utf8",
  ),
]);

test("confirmation UI selects only active allocations with active catalog items", () => {
  assert.match(
    registrationsPage,
    /catalog:basic_medical_equipment_catalog!inner\([^)]*is_active\)/,
  );
  assert.match(registrationsPage, /\.eq\("is_active", true\)/);
  assert.match(registrationsPage, /\.eq\("catalog\.is_active", true\)/);
});

test("confirmation RPC uses the same active allocation and catalog eligibility", () => {
  const rpcStart = confirmationRpc.indexOf(
    "create or replace function public.confirm_basic_medical_session",
  );
  assert.notEqual(rpcStart, -1);
  const rpc = confirmationRpc.slice(rpcStart);

  assert.match(
    rpc,
    /where inventory\.room_id = session_row\.room_id\s+and inventory\.is_active\s+and catalog\.is_active;/,
  );
  assert.match(
    rpc,
    /and inventory\.room_id = session_row\.room_id\s+and inventory\.is_active\s+left join public\.basic_medical_equipment_catalog as catalog\s+on catalog\.id = inventory\.catalog_item_id and catalog\.is_active/,
  );
});
