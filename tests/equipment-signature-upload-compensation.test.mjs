import assert from "node:assert/strict";
import test from "node:test";
import { compensateCleanupOwnedSignatureUpload } from "../lib/equipment-signature-upload-compensation-core.ts";

const cleanupOwnedError = { message: "EQUIPMENT_SIGNATURE_CLEANUP_OWNED" };

test("a successful current upload is deleted once after a cleanup-owned finalize", async () => {
  let deleteCalls = 0;
  const compensated = await compensateCleanupOwnedSignatureUpload({
    createdByThisAttempt: true,
    finalizeError: cleanupOwnedError,
    deleteObject: async () => {
      deleteCalls += 1;
    },
  });

  assert.equal(compensated, true);
  assert.equal(deleteCalls, 1);
});

test("compensation never deletes for conflicts, ambiguous failures, or adopted recovery", async () => {
  for (const input of [
    { createdByThisAttempt: false, finalizeError: cleanupOwnedError },
    {
      createdByThisAttempt: true,
      finalizeError: { message: "network timeout" },
    },
    { createdByThisAttempt: true, finalizeError: null },
    {
      createdByThisAttempt: true,
      finalizeError: { message: "already adopted" },
    },
  ]) {
    let deleteCalls = 0;
    const compensated = await compensateCleanupOwnedSignatureUpload({
      ...input,
      deleteObject: async () => {
        deleteCalls += 1;
      },
    });

    assert.equal(compensated, false);
    assert.equal(deleteCalls, 0);
  }
});
