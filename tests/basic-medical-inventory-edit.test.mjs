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

test("room inventory UI returns on either Cancel before calling the server action", async () => {
  const source = await readFile(
    new URL(
      "../components/basic-medical-equipment-manager.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const start = source.indexOf("const totalRaw = prompt(");
  const handler = source.slice(
    start,
    source.indexOf("saveBasicMedicalRoomInventory({", start),
  );
  assert.notEqual(start, -1);
  assert.match(handler, /if \(totalRaw === null\) return;/);
  assert.match(handler, /if \(damagedRaw === null\) return;/);
  assert.match(handler, /parseBasicMedicalInventoryQuantityEdit/);
});
