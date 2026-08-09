import assert from "node:assert/strict";
import test from "node:test";
import { compensateCleanupOwnedSignatureUpload } from "../lib/equipment-signature-upload-compensation-core.ts";

const cleanupOwnedError = { message: "EQUIPMENT_SIGNATURE_CLEANUP_OWNED" };

test("a successful current upload is deleted once after a cleanup-owned finalize", async () => {
  let deleteCalls = 0;
  const result = await compensateCleanupOwnedSignatureUpload({
    createdByThisAttempt: true,
    finalizeError: cleanupOwnedError,
    deleteObject: async () => {
      deleteCalls += 1;
    },
    markForCleanup: async () => {
      throw new Error("should not mark after a successful delete");
    },
  });

  assert.equal(result, "deleted");
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
    const result = await compensateCleanupOwnedSignatureUpload({
      ...input,
      deleteObject: async () => {
        deleteCalls += 1;
      },
      markForCleanup: async () => {
        throw new Error("should not mark an unqualified upload");
      },
    });

    assert.equal(result, "not-needed");
    assert.equal(deleteCalls, 0);
  }
});

test("a failed exact delete requests durable recovery once", async () => {
  let deleteCalls = 0;
  let markerCalls = 0;
  const result = await compensateCleanupOwnedSignatureUpload({
    createdByThisAttempt: true,
    finalizeError: cleanupOwnedError,
    deleteObject: async () => {
      deleteCalls += 1;
      throw new Error("storage unavailable");
    },
    markForCleanup: async () => {
      markerCalls += 1;
    },
  });

  assert.equal(result, "marked");
  assert.equal(deleteCalls, 1);
  assert.equal(markerCalls, 1);
});

test("a failed marker returns a safe terminal result without retrying deletion", async () => {
  let deleteCalls = 0;
  let markerCalls = 0;
  const result = await compensateCleanupOwnedSignatureUpload({
    createdByThisAttempt: true,
    finalizeError: cleanupOwnedError,
    deleteObject: async () => {
      deleteCalls += 1;
      throw new Error("storage unavailable");
    },
    markForCleanup: async () => {
      markerCalls += 1;
      throw new Error("database unavailable");
    },
  });

  assert.equal(result, "marker-failed");
  assert.equal(deleteCalls, 1);
  assert.equal(markerCalls, 1);
});
