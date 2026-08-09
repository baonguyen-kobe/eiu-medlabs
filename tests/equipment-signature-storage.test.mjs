import assert from "node:assert/strict";
import test from "node:test";
import {
  EquipmentSignatureStorageError,
  buildEquipmentSignatureObjectPath,
  deleteEquipmentSignatureWithClient,
  downloadEquipmentSignatureWithClient,
  parseEquipmentSignatureDataUrl,
  validateEquipmentSignatureObjectPath,
  uploadEquipmentSignatureWithClient,
} from "../lib/equipment-signature-storage-core.ts";

const REQUEST_ID = "123e4567-e89b-12d3-a456-426614174000";
const OPERATION_ID = "123e4567-e89b-12d3-a456-426614174001";
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

function fakeDownloadStorageClient({ error = null, bytes = PNG_BYTES } = {}) {
  const calls = [];
  return {
    calls,
    client: {
      storage: {
        from(bucket) {
          calls.push({ bucket });
          return {
            async download(path) {
              calls[0] = { ...calls[0], path };
              return {
                data: bytes
                  ? {
                      async arrayBuffer() {
                        return bytes.buffer.slice(
                          bytes.byteOffset,
                          bytes.byteOffset + bytes.byteLength,
                        );
                      },
                    }
                  : null,
                error,
              };
            },
          };
        },
      },
    },
  };
}

function fakeDeleteStorageClient(error = null) {
  const calls = [];
  return {
    calls,
    client: {
      storage: {
        from(bucket) {
          calls.push({ bucket });
          return {
            async remove(paths) {
              calls[0] = { ...calls[0], paths };
              return { error };
            },
          };
        },
      },
    },
  };
}

test("valid handover operation path is canonical", () => {
  assert.equal(
    buildEquipmentSignatureObjectPath(REQUEST_ID, "handover", OPERATION_ID),
    `equipment-requests/${REQUEST_ID}/handover/${OPERATION_ID}.png`,
  );
});

test("valid return operation path is canonical", () => {
  assert.equal(
    buildEquipmentSignatureObjectPath(REQUEST_ID, "return", OPERATION_ID),
    `equipment-requests/${REQUEST_ID}/return/${OPERATION_ID}.png`,
  );
});

test("invalid request UUID is rejected", () => {
  assertStorageError("INVALID_SIGNATURE_REQUEST", () =>
    buildEquipmentSignatureObjectPath(
      "../not-a-uuid",
      "handover",
      OPERATION_ID,
    ),
  );
});

test("invalid phase is rejected", () => {
  assertStorageError("INVALID_SIGNATURE_PHASE", () =>
    buildEquipmentSignatureObjectPath(REQUEST_ID, "upload", OPERATION_ID),
  );
});

test("invalid operation UUID is rejected", () => {
  assertStorageError("INVALID_SIGNATURE_OPERATION", () =>
    buildEquipmentSignatureObjectPath(REQUEST_ID, "handover", "not-a-uuid"),
  );
});

test("only the exact database-issued path is accepted", () => {
  const path = `equipment-requests/${REQUEST_ID}/handover/${OPERATION_ID}.png`;
  assert.equal(
    validateEquipmentSignatureObjectPath({
      requestId: REQUEST_ID,
      phase: "handover",
      operationId: OPERATION_ID,
      objectPath: path,
    }),
    path,
  );
});

test("malformed paths, traversal, extra segments, and non-PNG suffixes are rejected", () => {
  const valid = `equipment-requests/${REQUEST_ID}/handover/${OPERATION_ID}.png`;
  for (const objectPath of [
    `/${valid}`,
    `equipment-requests/${REQUEST_ID}/handover/../${OPERATION_ID}.png`,
    `equipment-requests/${REQUEST_ID}/handover/extra/${OPERATION_ID}.png`,
    `equipment-requests/${REQUEST_ID}/handover/${OPERATION_ID}.jpeg`,
    `equipment-requests/${REQUEST_ID}/handover.png`,
  ]) {
    assertStorageError("INVALID_SIGNATURE_PATH", () =>
      validateEquipmentSignatureObjectPath({
        requestId: REQUEST_ID,
        phase: "handover",
        operationId: OPERATION_ID,
        objectPath,
      }),
    );
  }
});

test("request, phase, and operation path bindings cannot be mismatched", () => {
  const objectPath = `equipment-requests/${REQUEST_ID}/handover/${OPERATION_ID}.png`;
  for (const input of [
    {
      requestId: "123e4567-e89b-12d3-a456-426614174999",
      phase: "handover",
      operationId: OPERATION_ID,
    },
    { requestId: REQUEST_ID, phase: "return", operationId: OPERATION_ID },
    {
      requestId: REQUEST_ID,
      phase: "handover",
      operationId: "123e4567-e89b-12d3-a456-426614174999",
    },
  ]) {
    assertStorageError("INVALID_SIGNATURE_PATH", () =>
      validateEquipmentSignatureObjectPath({ ...input, objectPath }),
    );
  }
});

test("small PNG Data URLs decode to their original binary bytes", () => {
  assert.deepEqual(
    parseEquipmentSignatureDataUrl(VALID_PNG_DATA_URL),
    PNG_BYTES,
  );
});

test("only strict, non-empty PNG Base64 Data URLs are accepted", () => {
  for (const value of [
    "data:image/jpeg;base64,aGVsbG8=",
    "data:image/png;base64,",
    "data:image/png;base64,%%%%",
    "data:image/png;base64,aGVsbG8",
  ]) {
    assertStorageError("INVALID_SIGNATURE_DATA", () =>
      parseEquipmentSignatureDataUrl(value),
    );
  }
});

test("PNG magic bytes are required", () => {
  assertStorageError("INVALID_SIGNATURE_DATA", () =>
    parseEquipmentSignatureDataUrl(
      `data:image/png;base64,${Buffer.from("not a png").toString("base64")}`,
    ),
  );
});

test("oversized Data URLs are rejected before upload", () => {
  assertStorageError("SIGNATURE_TOO_LARGE", () =>
    parseEquipmentSignatureDataUrl(
      `data:image/png;base64,${"A".repeat(400_000)}`,
    ),
  );
});

test("upload uses the exact private bucket, operation path, binary bytes, MIME type, and no overwrite", async () => {
  const storage = fakeStorageClient();
  const result = await uploadEquipmentSignatureWithClient(
    {
      requestId: REQUEST_ID,
      phase: "handover",
      operationId: OPERATION_ID,
      objectPath: `equipment-requests/${REQUEST_ID}/handover/${OPERATION_ID}.png`,
      signatureDataUrl: VALID_PNG_DATA_URL,
    },
    storage.client,
  );

  assert.deepEqual(result, {
    path: `equipment-requests/${REQUEST_ID}/handover/${OPERATION_ID}.png`,
  });
  assert.deepEqual(storage.calls, [
    {
      bucket: "equipment_signatures",
      path: `equipment-requests/${REQUEST_ID}/handover/${OPERATION_ID}.png`,
      body: PNG_BYTES,
      options: { contentType: "image/png", upsert: false },
    },
  ]);
});

test("upload results cannot expose public or signed URLs", async () => {
  const storage = fakeStorageClient();
  const result = await uploadEquipmentSignatureWithClient(
    {
      requestId: REQUEST_ID,
      phase: "return",
      operationId: OPERATION_ID,
      objectPath: `equipment-requests/${REQUEST_ID}/return/${OPERATION_ID}.png`,
      signatureDataUrl: VALID_PNG_DATA_URL,
    },
    storage.client,
  );

  assert.equal("publicUrl" in result, false);
  assert.equal("signedUrl" in result, false);
});

test("delete uses one exact private operation path", async () => {
  const storage = fakeDeleteStorageClient();
  const path = `equipment-requests/${REQUEST_ID}/handover/${OPERATION_ID}.png`;

  await deleteEquipmentSignatureWithClient(
    {
      requestId: REQUEST_ID,
      phase: "handover",
      operationId: OPERATION_ID,
      objectPath: path,
    },
    storage.client,
  );

  assert.deepEqual(storage.calls, [
    { bucket: "equipment_signatures", paths: [path] },
  ]);
});

test("delete rejects mismatched paths before private Storage access", async () => {
  const storage = fakeDeleteStorageClient();
  await assert.rejects(
    deleteEquipmentSignatureWithClient(
      {
        requestId: REQUEST_ID,
        phase: "handover",
        operationId: OPERATION_ID,
        objectPath: `equipment-requests/${REQUEST_ID}/return/${OPERATION_ID}.png`,
      },
      storage.client,
    ),
    (error) => {
      assert.ok(error instanceof EquipmentSignatureStorageError);
      assert.equal(error.code, "INVALID_SIGNATURE_PATH");
      return true;
    },
  );
  assert.deepEqual(storage.calls, []);
});

test("delete failures map to a stable internal error", async () => {
  const storage = fakeDeleteStorageClient({ message: "Storage unavailable" });
  await assert.rejects(
    deleteEquipmentSignatureWithClient(
      {
        requestId: REQUEST_ID,
        phase: "return",
        operationId: OPERATION_ID,
        objectPath: `equipment-requests/${REQUEST_ID}/return/${OPERATION_ID}.png`,
      },
      storage.client,
    ),
    (error) => {
      assert.ok(error instanceof EquipmentSignatureStorageError);
      assert.equal(error.code, "SIGNATURE_STORAGE_DELETE_FAILED");
      return true;
    },
  );
});

test("generic upload failures map to a stable internal error", async () => {
  const storage = fakeStorageClient({
    message: "Storage unavailable",
    status: 500,
  });
  await assert.rejects(
    uploadEquipmentSignatureWithClient(
      {
        requestId: REQUEST_ID,
        phase: "return",
        operationId: OPERATION_ID,
        objectPath: `equipment-requests/${REQUEST_ID}/return/${OPERATION_ID}.png`,
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

test("valid handover download uses the exact private path", async () => {
  const storage = fakeDownloadStorageClient();
  const path =
    "equipment-requests/" + REQUEST_ID + "/handover/" + OPERATION_ID + ".png";
  const bytes = await downloadEquipmentSignatureWithClient(
    { requestId: REQUEST_ID, phase: "handover", objectPath: path },
    storage.client,
  );

  assert.deepEqual(bytes, PNG_BYTES);
  assert.deepEqual(storage.calls, [{ bucket: "equipment_signatures", path }]);
});

test("valid return download uses the exact private path", async () => {
  const storage = fakeDownloadStorageClient();
  const path =
    "equipment-requests/" + REQUEST_ID + "/return/" + OPERATION_ID + ".png";
  await downloadEquipmentSignatureWithClient(
    { requestId: REQUEST_ID, phase: "return", objectPath: path },
    storage.client,
  );
  assert.equal(storage.calls[0].path, path);
});

test("download rejects request and phase mismatches before Storage access", async () => {
  const storage = fakeDownloadStorageClient();
  const path =
    "equipment-requests/" + REQUEST_ID + "/handover/" + OPERATION_ID + ".png";
  for (const input of [
    {
      requestId: "123e4567-e89b-12d3-a456-426614174999",
      phase: "handover",
    },
    { requestId: REQUEST_ID, phase: "return" },
  ]) {
    await assert.rejects(
      downloadEquipmentSignatureWithClient(
        { ...input, objectPath: path },
        storage.client,
      ),
      (error) => {
        assert.ok(error instanceof EquipmentSignatureStorageError);
        assert.equal(error.code, "INVALID_SIGNATURE_PATH");
        return true;
      },
    );
  }
  assert.deepEqual(storage.calls, []);
});

test("download rejects malformed, traversal, and non-PNG paths before Storage access", async () => {
  const storage = fakeDownloadStorageClient();
  for (const objectPath of [
    "equipment-requests/" + REQUEST_ID + "/handover/not-a-uuid.png",
    "equipment-requests/" +
      REQUEST_ID +
      "/handover/../" +
      OPERATION_ID +
      ".png",
    "equipment-requests/" + REQUEST_ID + "/handover/" + OPERATION_ID + ".jpeg",
  ]) {
    await assert.rejects(
      downloadEquipmentSignatureWithClient(
        { requestId: REQUEST_ID, phase: "handover", objectPath },
        storage.client,
      ),
      (error) => {
        assert.ok(error instanceof EquipmentSignatureStorageError);
        assert.equal(error.code, "INVALID_SIGNATURE_PATH");
        return true;
      },
    );
  }
  assert.deepEqual(storage.calls, []);
});

test("empty and corrupt private downloads are rejected", async () => {
  const path =
    "equipment-requests/" + REQUEST_ID + "/handover/" + OPERATION_ID + ".png";
  for (const bytes of [Buffer.alloc(0), Buffer.from("not a png")]) {
    const storage = fakeDownloadStorageClient({ bytes });
    await assert.rejects(
      downloadEquipmentSignatureWithClient(
        { requestId: REQUEST_ID, phase: "handover", objectPath: path },
        storage.client,
      ),
      (error) => {
        assert.ok(error instanceof EquipmentSignatureStorageError);
        assert.equal(error.code, "SIGNATURE_STORAGE_DOWNLOAD_FAILED");
        return true;
      },
    );
  }
});

test("Storage download failures map to a stable internal error without URL helpers", async () => {
  const storage = fakeDownloadStorageClient({
    error: { message: "Object not found", status: 404 },
    bytes: null,
  });
  const path =
    "equipment-requests/" + REQUEST_ID + "/handover/" + OPERATION_ID + ".png";
  await assert.rejects(
    downloadEquipmentSignatureWithClient(
      { requestId: REQUEST_ID, phase: "handover", objectPath: path },
      storage.client,
    ),
    (error) => {
      assert.ok(error instanceof EquipmentSignatureStorageError);
      assert.equal(error.code, "SIGNATURE_STORAGE_DOWNLOAD_FAILED");
      return true;
    },
  );
  const bucket = storage.client.storage.from("unused");
  assert.equal("getPublicUrl" in bucket, false);
  assert.equal("createSignedUrl" in bucket, false);
});

test("existing-object upload conflicts remain distinguishable", async () => {
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
        operationId: OPERATION_ID,
        objectPath: `equipment-requests/${REQUEST_ID}/return/${OPERATION_ID}.png`,
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
