import assert from "node:assert/strict";
import test from "node:test";
import { parseBasicMedicalSessionConfirmation } from "../lib/basic-medical-session-confirmation.ts";

test("accepts the complete basic medical session confirmation RPC result", () => {
  assert.deepEqual(
    parseBasicMedicalSessionConfirmation({
      confirmation_id: "123e4567-e89b-12d3-a456-426614174000",
      signed_at: "2026-08-09T12:00:00.000Z",
      damaged_items: [{ inventory_id: "item-1" }],
    }),
    {
      confirmationId: "123e4567-e89b-12d3-a456-426614174000",
      signedAt: "2026-08-09T12:00:00.000Z",
      damagedItemCount: 1,
    },
  );
});

test("rejects incomplete basic medical session confirmation RPC results", () => {
  for (const value of [
    null,
    {},
    { confirmation_id: "id", signed_at: "time" },
    { confirmation_id: "id", signed_at: "time", damaged_items: null },
  ]) {
    assert.equal(parseBasicMedicalSessionConfirmation(value), null);
  }
});
