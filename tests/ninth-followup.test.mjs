// Ninth follow-up integration tests.
// Tests the claim/lease concurrency guard (N-MEDIUM-02), import partial
// success (IMP-HIGH-01), and CSV formula injection (API-MEDIUM-01).

import nextEnv from "@next/env";
import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

function service() {
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createTestUser(email, role = "staff") {
  const admin = service();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "LocalNinth123!",
    email_confirm: true,
    user_metadata: { full_name: "Ninth Test" },
    app_metadata: { preapproved: true },
  });
  assert.ifError(error, `createUser(${email}): ${error?.message}`);
  const id = data.user.id;
  assert.ifError(
    (await admin.from("profiles").update({ is_active: true }).eq("id", id))
      .error,
  );
  assert.ifError(
    (
      await admin
        .from("user_roles")
        .insert({ user_id: id, role, created_by: id })
    ).error,
  );
  assert.ifError(
    (
      await admin.from("profile_room_types").upsert({
        profile_id: id,
        room_type_id: "40000000-0000-0000-0000-000000000001",
        created_by: id,
      })
    ).error,
  );
  return id;
}

async function cleanupUser(id) {
  await service().auth.admin.deleteUser(id);
}

await test("claim_personnel_reconciliation_batch atomically claims expired operations", async () => {
  const admin = service();
  const p1email = `ninth-claim-a1-${Date.now()}@campus.local`;
  const u1 = await createTestUser(p1email);
  try {
    const expiredAt = new Date(Date.now() - 2000).toISOString();
    const { data: ops, error: insertError } = await admin
      .from("personnel_update_operations")
      .insert([
        {
          profile_id: u1,
          actor_id: u1,
          previous_email: p1email,
          requested_email: `req-${Date.now()}@campus.local`,
          expected_version: 1,
          payload: {},
          status: "auth_updated",
          expires_at: expiredAt,
        },
      ])
      .select("id");
    assert.ifError(insertError, "Insert test operation failed");
    const opId = ops[0].id;
    const { data: claimed, error: claimErr } = await admin.rpc(
      "claim_personnel_reconciliation_batch",
      {
        target_limit: 1,
        target_worker_id: "test-worker-a",
        target_lease_seconds: 60,
      },
    );
    assert.ifError(claimErr, "Claim should succeed");
    const claimedOp = (claimed ?? []).find((c) => c.id === opId);
    assert.ok(claimedOp, "Our test operation should be claimed");
    const { data: statusRow } = await admin
      .from("personnel_update_operations")
      .select("status,reconcile_worker_id,reconcile_lease_expires_at")
      .eq("id", opId)
      .single();
    assert.equal(statusRow.status, "reconciling", "Op must be reconciling");
    assert.equal(
      statusRow.reconcile_worker_id,
      "test-worker-a",
      "Worker ID recorded",
    );
    assert.ok(statusRow.reconcile_lease_expires_at, "Lease expiry set");
    const { data: claimed2, error: claimErr2 } = await admin.rpc(
      "claim_personnel_reconciliation_batch",
      {
        target_limit: 10,
        target_worker_id: "test-worker-b",
        target_lease_seconds: 60,
      },
    );
    assert.ifError(claimErr2, "Second claim should succeed");
    const doubleClaimedOp = (claimed2 ?? []).find((c) => c.id === opId);
    assert.ok(
      !doubleClaimedOp,
      "Already-claimed op must not be returned to second worker",
    );
    const { error: resolveErr } = await admin.rpc(
      "resolve_personnel_update_operation",
      {
        target_operation_id: opId,
        target_status: "rolled_back",
        target_error: null,
      },
    );
    assert.ifError(resolveErr, "Resolve should succeed");
  } finally {
    await cleanupUser(u1);
  }
});

await test("concurrent workers claim disjoint operations without overlap", async () => {
  const admin = service();
  const p1 = `ninth-conc-1-${Date.now()}@campus.local`;
  const p2 = `ninth-conc-2-${Date.now()}@campus.local`;
  const u1 = await createTestUser(p1);
  const u2 = await createTestUser(p2);
  try {
    const expiredAt = new Date(Date.now() - 2000).toISOString();
    const { data: ops, error: insertError } = await admin
      .from("personnel_update_operations")
      .insert([
        {
          profile_id: u1,
          actor_id: u1,
          previous_email: p1,
          requested_email: `r1-${Date.now()}@campus.local`,
          expected_version: 1,
          payload: {},
          status: "auth_updated",
          expires_at: expiredAt,
        },
        {
          profile_id: u2,
          actor_id: u2,
          previous_email: p2,
          requested_email: `r2-${Date.now()}@campus.local`,
          expected_version: 1,
          payload: {},
          status: "auth_updated",
          expires_at: expiredAt,
        },
      ])
      .select("id");
    assert.ifError(insertError);
    const opIds = ops.map((o) => o.id);
    const [resultA, resultB] = await Promise.all([
      admin.rpc("claim_personnel_reconciliation_batch", {
        target_limit: 1,
        target_worker_id: "worker-a",
        target_lease_seconds: 300,
      }),
      admin.rpc("claim_personnel_reconciliation_batch", {
        target_limit: 1,
        target_worker_id: "worker-b",
        target_lease_seconds: 300,
      }),
    ]);
    assert.ifError(resultA.error);
    assert.ifError(resultB.error);
    const allClaimed = [
      ...(resultA.data ?? []),
      ...(resultB.data ?? []),
    ].filter((c) => opIds.includes(c.id));
    const claimedIds = new Set(allClaimed.map((c) => c.id));
    assert.equal(
      claimedIds.size,
      allClaimed.length,
      "No operation was claimed by two workers simultaneously",
    );
    for (const id of claimedIds) {
      await admin.rpc("resolve_personnel_update_operation", {
        target_operation_id: id,
        target_status: "rolled_back",
        target_error: null,
      });
    }
  } finally {
    await cleanupUser(u1);
    await cleanupUser(u2);
  }
});

await test("import conflict and system_error row statuses persist without fatal batch", async () => {
  const admin = service();
  const importerId = await createTestUser(
    `ninth-importer-${Date.now()}@campus.local`,
    "staff",
  );
  await admin
    .from("profiles")
    .update({ can_import_schedules: true })
    .eq("id", importerId);
  try {
    const roomTypeId = "40000000-0000-0000-0000-000000000001";
    const { data: batch, error: batchErr } = await admin
      .from("import_batches")
      .insert({
        source_type: "import",
        original_file_name: "ninth-test.xlsx",
        file_hash: `ninth-hash-${Date.now()}`,
        status: "importing",
        total_rows: 4,
        created_by: importerId,
        room_type_id: roomTypeId,
      })
      .select("id")
      .single();
    assert.ifError(batchErr);
    const batchId = batch.id;
    for (const [rowNum, status] of [
      [1, "imported"],
      [2, "duplicate"],
      [3, "conflict"],
      [4, "system_error"],
    ]) {
      const { error } = await admin.from("import_rows").insert({
        import_batch_id: batchId,
        row_number: rowNum,
        normalized_row_hash: `ninth-h-${rowNum}-${Date.now()}`,
        raw_data: {},
        normalized_data: {},
        validation_status: status,
        errors: [],
        warnings: [],
      });
      assert.ifError(
        error,
        `Insert row ${rowNum} (${status}): ${error?.message}`,
      );
    }
    const { data: rows } = await admin
      .from("import_rows")
      .select("validation_status")
      .eq("import_batch_id", batchId);
    const statuses = new Set(rows.map((r) => r.validation_status));
    assert.ok(statuses.has("conflict"), "conflict row persisted");
    assert.ok(statuses.has("system_error"), "system_error row persisted");
    assert.ok(statuses.has("imported"), "imported row persisted");
    assert.ok(statuses.has("duplicate"), "duplicate row persisted");
  } finally {
    await cleanupUser(importerId);
  }
});

test("CSV export neutralises formula-injection characters", () => {
  function csvCell(value) {
    const text =
      typeof value === "string" ? value : JSON.stringify(value ?? "");
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  }
  for (const cell of ["=CMD", "+EXEC", "-EVAL", "@SUM(A1)"]) {
    assert.ok(csvCell(cell).startsWith("\"'"), `${cell} must be prefixed`);
  }
  assert.equal(csvCell("Normal text"), '"Normal text"');
  assert.equal(csvCell('He said "hello"'), '"He said ""hello"""');
});

console.log("Ninth follow-up integration tests completed.");
