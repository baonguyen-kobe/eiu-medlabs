import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manager = await readFile(
  new URL("../components/catalog-batch-manager.tsx", import.meta.url),
  "utf8",
);

test("Room and Course edits stay in selected table rows and retain existing batch actions", () => {
  assert.match(manager, /updateCatalogRoomsBatch/);
  assert.match(manager, /updateCatalogCoursesBatch/);
  assert.match(manager, /setRoomsActive/);
  assert.match(manager, /setCoursesActive/);
  assert.match(manager, /<tr[\s\S]*className=\{isEditing \? "is-editing"/);
  assert.match(manager, /catalog-inline-fields/);
  assert.doesNotMatch(
    manager,
    /<form className="admin-create-form" action=\{save\}/,
  );
});

test("Inline Room capacity preserves null-or-positive-integer validation", () => {
  assert.match(manager, /type="number"/);
  assert.match(manager, /min="1"/);
  assert.match(manager, /step="1"/);
  assert.match(
    manager,
    /!Number\.isInteger\(room\.capacity\) \|\| room\.capacity < 1/,
  );
  assert.match(manager, /INVALID_ROOM_CAPACITY/);
});
