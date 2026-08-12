import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const [accessSource, minePage, requestList, actions] = await Promise.all([
  readFile(new URL("../lib/equipment-requests.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/equipment/mine/page.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../components/equipment-request-list.tsx", import.meta.url),
    "utf8",
  ),
  readFile(new URL("../app/equipment/actions.ts", import.meta.url), "utf8"),
]);

const compiledAccess = ts.transpileModule(accessSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const access = await import(
  `data:text/javascript;base64,${Buffer.from(compiledAccess).toString("base64")}`
);

test("equipment item addition allows only Admin/Staff on new or preparing requests", () => {
  for (const role of ["admin", "staff"]) {
    assert.equal(access.canManageEquipmentRequestItems([role]), true);
    assert.equal(access.canAddEquipmentRequestItems([role], "new"), true);
    assert.equal(access.canAddEquipmentRequestItems([role], "preparing"), true);
    for (const status of ["handed_over", "returned", "completed"]) {
      assert.equal(access.canAddEquipmentRequestItems([role], status), false);
    }
  }

  for (const role of ["lecturer", "teaching_assistant", "viewer"]) {
    assert.equal(access.canManageEquipmentRequestItems([role]), false);
    assert.equal(access.canAddEquipmentRequestItems([role], "new"), false);
    assert.equal(
      access.canAddEquipmentRequestItems([role], "preparing"),
      false,
    );
  }
});

test("mine page supplies only active catalog rows to the guarded add-row UI", () => {
  assert.match(
    minePage,
    /const canAddItems = canManageEquipmentRequestItems\(roles\)/,
  );
  assert.match(
    minePage,
    /canAddItems\s*\?\s*supabase\s*\.from\("equipment_catalog"\)[\s\S]*?\.eq\("is_active", true\)/,
  );
  assert.match(minePage, /canAddItems=\{canAddItems\}/);
  assert.match(minePage, /catalog=\{catalog \?\? \[\]\}/);
  assert.match(
    requestList,
    /canAddEquipmentRequestItems\(\s*viewerRoles,\s*getWarehouseStatus\(/,
  );
});

test("server action retains role, status, and active-catalog defenses", () => {
  const start = actions.indexOf(
    "export async function addEquipmentRequestItem",
  );
  const end = actions.indexOf(
    "export async function deleteEquipmentRequest",
    start,
  );
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const action = actions.slice(start, end);

  assert.match(
    action,
    /some\(\(\{ role \}\) => \["admin", "staff"\]\.includes\(role\)\)/,
  );
  assert.match(action, /\["new", "preparing"\]\.includes\(request\.status\)/);
  assert.match(action, /\.rpc\(\s*"add_equipment_request_item"/);
  assert.match(action, /CATALOG_ITEM_INACTIVE_OR_MISSING/);
});
