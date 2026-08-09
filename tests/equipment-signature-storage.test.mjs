import assert from "node:assert/strict";
import test from "node:test";
import {
  EquipmentSignatureStorageError,
  buildEquipmentSignatureObjectPath,
  parseEquipmentSignatureDataUrl,
  uploadEquipmentSignatureWithClient,
} from "../lib/equipment-signature-storage-core.ts";

const REQUEST_ID = "123e4567-e89b-12d3-a456-426614174000";
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const VALID_PNG_DATA_URL = `data:image/png;base64,${PNG_BYTES.toString("base64")}`;

function assertStorageError(code, run) {
  assert.throws(run, (error) => {
    assert.ok(error instanceof EquipmentSignatureStorageError);
    assert.equal(error.code, code);
    return true;
  });
}

function fakeStorageClient(error = null) {
  const calls = [];
  return {
    calls,
    client: {
      storage: {
        from(bucket) {
          calls.push({ bucket });
          return {
            async upload(path, body, options) {
              calls[0] = { ...calls[0], path, body, options };
              return { error };
            },
          };
        },
      },
    },
  };
}

test("handover path is deterministic and request-scoped", () => {
  assert.equal(
    buildEquipmentSignatureObjectPath(REQUEST_ID, "handover"),
    `equipment-requests/${REQUEST_ID}/handover.png`,
  );
});

test("return path is distinct from handover", () => {
  assert.equal(
    buildEquipmentSignatureObjectPath(REQUEST_ID, "return"),
    `equipment-requests/${REQUEST_ID}/return.png`,
  );
});

test("invalid request IDs and phases are rejected before path construction", () => {
  assertStorageError("INVALID_SIGNATURE_REQUEST", () =>
    buildEquipmentSignatureObjectPath("../not-a-uuid", "handover"),
  );
  assertStorageError("INVALID_SIGNATURE_PHASE", () =>
    buildEquipmentSignatureObjectPath(REQUEST_ID, "upload"),
  );
});

test("a small PNG Data URL decodes to its original binary bytes", () => {
  assert.deepEqual(
    parseEquipmentSignatureDataUrl(VALID_PNG_DATA_URL),
    PNG_BYTES,
  );
});

test("only PNG Data URLs with strict, non-empty Base64 are accepted", () => {
  assertStorageError("INVALID_SIGNATURE_DATA", () =>
    parseEquipmentSignatureDataUrl("data:image/jpeg;base64,aGVsbG8="),
  );
  assertStorageError("INVALID_SIGNATURE_DATA", () =>
    parseEquipmentSignatureDataUrl("data:image/png;base64,"),
  );
  assertStorageError("INVALID_SIGNATURE_DATA", () =>
    parseEquipmentSignatureDataUrl("data:image/png;base64,%%%%"),
  );
});

test("decoded data must carry the PNG magic bytes", () => {
  assertStorageError("INVALID_SIGNATURE_DATA", () =>
    parseEquipmentSignatureDataUrl(
      `data:image/png;base64,${Buffer.from("not a png").toString("base64")}`,
    ),
  );
});

test("oversized data is rejected before it is decoded", () => {
  const oversized = `data:image/png;base64,${"A".repeat(400_000)}`;
  assertStorageError("SIGNATURE_TOO_LARGE", () =>
    parseEquipmentSignatureDataUrl(oversized),
  );
});

test("upload sends binary PNG bytes to the private bucket without overwrite", async () => {
  const storage = fakeStorageClient();
  const result = await uploadEquipmentSignatureWithClient(
    {
      requestId: REQUEST_ID,
      phase: "handover",
      signatureDataUrl: VALID_PNG_DATA_URL,
    },
    storage.client,
  );

  assert.deepEqual(result, {
    path: `equipment-requests/${REQUEST_ID}/handover.png`,
  });
  assert.deepEqual(storage.calls, [
    {
      bucket: "equipment_signatures",
      path: `equipment-requests/${REQUEST_ID}/handover.png`,
      body: PNG_BYTES,
      options: { contentType: "image/png", upsert: false },
    },
  ]);
  assert.notEqual(storage.calls[0].body, VALID_PNG_DATA_URL);
  assert.equal("publicUrl" in result, false);
  assert.equal("signedUrl" in result, false);
});

test("generic Storage failures have a stable internal error code", async () => {
  const storage = fakeStorageClient({
    message: "Storage unavailable",
    status: 500,
  });
  await assert.rejects(
    uploadEquipmentSignatureWithClient(
      {
        requestId: REQUEST_ID,
        phase: "return",
        signatureDataUrl: VALID_PNG_DATA_URL,
      },
      storage.client,
    ),
    (error) => {
      assert.ok(error instanceof EquipmentSignatureStorageError);
      assert.equal(error.code, "SIGNATURE_STORAGE_UPLOAD_FAILED");
      return true;
    },
  );
});

test("Storage conflict failures remain distinguishable", async () => {
  const storage = fakeStorageClient({
    message: "Asset already exists",
    status: 409,
    statusCode: "409",
  });
  await assert.rejects(
    uploadEquipmentSignatureWithClient(
      {
        requestId: REQUEST_ID,
        phase: "return",
        signatureDataUrl: VALID_PNG_DATA_URL,
      },
      storage.client,
    ),
    (error) => {
      assert.ok(error instanceof EquipmentSignatureStorageError);
      assert.equal(error.code, "SIGNATURE_STORAGE_CONFLICT");
      return true;
    },
  );
});
