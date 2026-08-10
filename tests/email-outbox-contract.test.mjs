import assert from "node:assert/strict";
import test from "node:test";
import {
  assertEmailOutboxOperationSucceeded,
  isEmailDeliveryDisabled,
  isSuccessfulEmailRetryStatus,
} from "../lib/email-outbox-contract.ts";

test("email outbox RPC success remains a success", () => {
  assert.doesNotThrow(() =>
    assertEmailOutboxOperationSucceeded("EXPAND", null),
  );
});

test("email outbox database errors reject for every changed operation", () => {
  for (const operation of [
    "EXPAND",
    "QUEUE_READ",
    "CLAIM",
    "RETRY",
    "RETRY_OUTCOME",
  ]) {
    assert.throws(
      () =>
        assertEmailOutboxOperationSucceeded(operation, {
          message: "permission denied for email outbox operation",
        }),
      new RegExp(`EMAIL_OUTBOX_${operation}_FAILED: permission denied`),
    );
  }
});

test("email outbox errors keep useful database context without secret values", () => {
  assert.throws(
    () =>
      assertEmailOutboxOperationSucceeded("CLAIM", {
        message:
          "permission denied; token=abc123 bearer xyz789 password: LocalAdmin123! payload=private-message",
      }),
    (error) => {
      assert.match(error.message, /permission denied/);
      assert.doesNotMatch(
        error.message,
        /abc123|xyz789|LocalAdmin123|private-message/,
      );
      return true;
    },
  );
});

test("only delivered retry states are reported as retry success", () => {
  assert.equal(isSuccessfulEmailRetryStatus("sent"), true);
  assert.equal(isSuccessfulEmailRetryStatus("simulated"), true);
  assert.equal(isSuccessfulEmailRetryStatus("failed"), false);
  assert.equal(isSuccessfulEmailRetryStatus("processing"), false);
  assert.equal(isSuccessfulEmailRetryStatus(null), false);
});

test("email-off remains a delivery guard", () => {
  assert.equal(isEmailDeliveryDisabled("off"), true);
  assert.equal(isEmailDeliveryDisabled("test"), false);
  assert.equal(isEmailDeliveryDisabled("live"), false);
});
