import assert from "node:assert/strict";
import test from "node:test";

const identity = await import("../lib/equipment-catalog-identity.ts");

test("catalog commercial name identity trims and compares case only", () => {
  assert.equal(identity.normalizedCommercialName(" ABC-123 "), "abc-123");
  assert.equal(identity.normalizedCommercialName("AbC-123"), "abc-123");
  assert.notEqual(
    identity.normalizedCommercialName("ABC-123"),
    identity.normalizedCommercialName("ABC 123"),
  );
  assert.equal(identity.cleanCommercialName("   "), null);
});

test("catalog import rows reject normalized commercial-name duplicates", () => {
  assert.equal(
    identity.findDuplicateCommercialName([
      { commercial_name: "COMM-X" },
      { commercial_name: " comm-x " },
    ]),
    " comm-x ",
  );
  assert.equal(
    identity.findDuplicateCommercialName([
      { commercial_name: "COMM-X" },
      { commercial_name: "COMM-Y" },
    ]),
    null,
  );
});

test("catalog import New skips existing identities and All preserves matching UUIDs", () => {
  const existing = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      commercial_name: "COMM-A",
      is_active: false,
    },
  ];
  const fileRows = [
    { item_name: "Updated A", commercial_name: " comm-a ", model: "NEW" },
    { item_name: "New B", commercial_name: "COMM-B", model: "M2" },
  ];

  assert.deepEqual(identity.matchCatalogImportRows(fileRows, existing, "new"), [
    { item_name: "New B", commercial_name: "COMM-B", model: "M2" },
  ]);
  assert.deepEqual(identity.matchCatalogImportRows(fileRows, existing, "all"), [
    {
      id: "11111111-1111-4111-8111-111111111111",
      item_name: "Updated A",
      commercial_name: " comm-a ",
      model: "NEW",
      is_active: false,
    },
    { item_name: "New B", commercial_name: "COMM-B", model: "M2" },
  ]);
});
