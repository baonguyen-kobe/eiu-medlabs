import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manager = readFileSync(
  new URL("../components/catalog-batch-manager.tsx", import.meta.url),
  "utf8",
);
const roomsPage = readFileSync(
  new URL("../app/admin/rooms/page.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("MOB-01.7 Batch 04A preserves one catalog state machine while marking card cells", () => {
  assert.match(
    manager,
    /const \[selected, setSelected\] = useState<string\[\]>\(\[\]\)/,
  );
  assert.match(
    manager,
    /const \[editing, setEditing\] = useState<string\[\]>\(\[\]\)/,
  );
  assert.match(manager, /function beginEdit\(ids: string\[\]\)/);
  assert.match(
    manager,
    /function updateDraft\(id: string, field: keyof Draft, value: string\)/,
  );
  assert.match(manager, /function save\(\)/);
  assert.match(manager, /function cancelEdit\(\)/);
  assert.match(manager, /catalog-batch-data-table/);
  assert.match(manager, /catalog-selection-cell/);
  assert.match(manager, /catalog-code-cell/);
  assert.match(manager, /catalog-name-cell/);
  assert.match(manager, /catalog-type-cell/);
  assert.match(manager, /catalog-status-cell/);
  assert.match(manager, /catalog-row-actions/);
});

test("MOB-01.7 Batch 04A scopes Course and Room cards without changing unrelated catalog tables", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*:is\(\.catalog-batch-data-table, \.room-type-data-table\) tbody > tr/,
  );
  assert.match(styles, /\.catalog-batch-data-table tbody > tr\.is-editing/);
  assert.match(
    styles,
    /\.catalog-batch-data-table tbody > tr\.is-editing :is\(input, select\)/,
  );
  assert.doesNotMatch(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.catalog-data-table tbody > tr \{[\s\S]*grid-template-columns/,
  );
});

test("MOB-01.7 Batch 04A gives catalog batch toolbar a narrow two-column action grid", () => {
  assert.match(
    manager,
    /equipment-catalog-toolbar\$\{editing\.length \? " is-editing" : ""\}/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.catalog-master-action-group\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styles,
    /\.equipment-catalog-toolbar\.is-editing[\s\S]*button:not\(:nth-child\(2\)\)/,
  );
});

test("MOB-01.7 Batch 04A exposes compact Room Type cards with original toggle form", () => {
  assert.match(roomsPage, /room-type-data-table/);
  assert.match(roomsPage, /room-type-name-cell/);
  assert.match(roomsPage, /room-type-code-cell/);
  assert.match(roomsPage, /room-type-status-cell/);
  assert.match(roomsPage, /room-type-action-cell/);
  assert.match(roomsPage, /form action=\{toggleRoomType\}/);
  assert.match(
    styles,
    /\.room-type-data-table tbody > tr\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/,
  );
});
