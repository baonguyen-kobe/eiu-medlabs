import assert from "node:assert/strict";
import test from "node:test";
import { parsePersonnelUpdateOperation } from "../lib/personnel-update-operation.ts";

const binding = {
  previousEmail: "old@eiu.edu.vn",
  requestedEmail: "new@eiu.edu.vn",
  expectedVersion: 3,
};

const validOperation = {
  operation_id: "d1000000-0000-0000-0000-000000000001",
  previous_email: "old@eiu.edu.vn",
  requested_email: "new@eiu.edu.vn",
  expected_version: 3,
};

test("accepts a complete personnel update reservation", () => {
  assert.deepEqual(
    parsePersonnelUpdateOperation(validOperation, binding),
    validOperation,
  );
});

test("normalizes bound email values before comparing them", () => {
  assert.deepEqual(
    parsePersonnelUpdateOperation(
      {
        ...validOperation,
        previous_email: " OLD@EIU.EDU.VN ",
        requested_email: " NEW@EIU.EDU.VN ",
      },
      binding,
    ),
    validOperation,
  );
});

test("rejects malformed or mismatched reservations before Auth changes", () => {
  for (const value of [
    null,
    [],
    {},
    {
      ...validOperation,
      expected_version: 1.5,
    },
    {
      ...validOperation,
      requested_email: "",
    },
    { ...validOperation, operation_id: "not-a-uuid" },
    { ...validOperation, previous_email: "other@eiu.edu.vn" },
    { ...validOperation, requested_email: "other@eiu.edu.vn" },
    { ...validOperation, expected_version: 4 },
  ]) {
    assert.equal(parsePersonnelUpdateOperation(value, binding), null);
  }
});
