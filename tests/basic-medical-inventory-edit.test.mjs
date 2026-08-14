import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseBasicMedicalInventoryQuantityEdit } from "../lib/basic-medical-inventory-edit.mjs";

test("inventory edit stages both quantities before any mutation", () => {
  assert.deepEqual(parseBasicMedicalInventoryQuantityEdit("0", "0"), {
    ok: true,
    totalQuantity: 0,
    damagedQuantity: 0,
  });
  assert.equal(parseBasicMedicalInventoryQuantityEdit("7", "2").ok, true);
  for (const [total, damaged] of [
    ["", "0"],
    ["7", ""],
    ["-1", "0"],
    ["7", "-1"],
    ["3", "4"],
    ["1.5", "0"],
  ]) {
    assert.equal(
      parseBasicMedicalInventoryQuantityEdit(total, damaged).ok,
      false,
    );
  }
});

test("room inventory UI uses a cancellable app modal before calling the server action", async () => {
  const source = await readFile(
    new URL(
      "../components/basic-medical-equipment-manager.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /\bprompt\s*\(/);
  assert.match(source, /InventoryAdjustmentDialog/);
  assert.match(source, /onCancel=\{onCancel\}/);
  assert.match(source, /saveBasicMedicalRoomInventory\(\{/);
});
