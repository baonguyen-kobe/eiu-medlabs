import assert from "node:assert/strict";
import test from "node:test";
import { parsePersonnelUpdateOperation } from "../lib/personnel-update-operation.ts";

test("accepts a complete personnel update reservation", () => {
  assert.deepEqual(
    parsePersonnelUpdateOperation({
      operation_id: "operation-1",
      previous_email: "old@eiu.edu.vn",
      requested_email: "new@eiu.edu.vn",
      expected_version: 3,
    }),
    {
      operation_id: "operation-1",
      previous_email: "old@eiu.edu.vn",
      requested_email: "new@eiu.edu.vn",
      expected_version: 3,
    },
  );
});

test("rejects malformed personnel update reservations before Auth changes", () => {
  for (const value of [
    null,
    [],
    {},
    {
      operation_id: "operation-1",
      previous_email: "old@eiu.edu.vn",
      requested_email: "new@eiu.edu.vn",
      expected_version: 1.5,
    },
    {
      operation_id: "operation-1",
      previous_email: "old@eiu.edu.vn",
      requested_email: "",
      expected_version: 3,
    },
  ]) {
    assert.equal(parsePersonnelUpdateOperation(value), null);
  }
});
