import assert from "node:assert/strict";
import test from "node:test";
import { resolveEquipmentSignatureForPdf } from "../lib/equipment-handover-pdf-signatures.ts";

const REQUEST_ID = "123e4567-e89b-12d3-a456-426614174000";
const OPERATION_ID = "123e4567-e89b-12d3-a456-426614174001";
const HANDOVER_PATH =
  "equipment-requests/" + REQUEST_ID + "/handover/" + OPERATION_ID + ".png";
const RETURN_PATH =
  "equipment-requests/" + REQUEST_ID + "/return/" + OPERATION_ID + ".png";
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const LEGACY_DATA_URL = "data:image/png;base64," + PNG_BYTES.toString("base64");

test("Base64-only handover resolves the legacy source", async () => {
  let downloaded = false;
  const result = await resolveEquipmentSignatureForPdf(
    {
      requestId: REQUEST_ID,
      phase: "handover",
      storagePath: null,
      legacyDataUrl: LEGACY_DATA_URL,
    },
    async () => {
      downloaded = true;
      return PNG_BYTES;
    },
  );
  assert.deepEqual(result, PNG_BYTES);
  assert.equal(downloaded, false);
});

test("Base64-only return resolves the legacy source", async () => {
  const result = await resolveEquipmentSignatureForPdf(
    {
      requestId: REQUEST_ID,
      phase: "return",
      storagePath: null,
      legacyDataUrl: LEGACY_DATA_URL,
    },
    async () => PNG_BYTES,
  );
  assert.deepEqual(result, PNG_BYTES);
});

test("Storage-only rows use the private downloader with handover identity", async () => {
  let input;
  const result = await resolveEquipmentSignatureForPdf(
    {
      requestId: REQUEST_ID,
      phase: "handover",
      storagePath: HANDOVER_PATH,
      legacyDataUrl: null,
    },
    async (value) => {
      input = value;
      return PNG_BYTES;
    },
  );
  assert.deepEqual(result, PNG_BYTES);
  assert.deepEqual(input, {
    requestId: REQUEST_ID,
    phase: "handover",
    objectPath: HANDOVER_PATH,
  });
});

test("Storage takes priority over legacy Base64 for return", async () => {
  const storageBytes = Buffer.from([...PNG_BYTES, 1]);
  const result = await resolveEquipmentSignatureForPdf(
    {
      requestId: REQUEST_ID,
      phase: "return",
      storagePath: RETURN_PATH,
      legacyDataUrl: LEGACY_DATA_URL,
    },
    async () => storageBytes,
  );
  assert.deepEqual(result, storageBytes);
});

test("unsigned rows resolve to no signature source", async () => {
  const result = await resolveEquipmentSignatureForPdf(
    {
      requestId: REQUEST_ID,
      phase: "handover",
      storagePath: null,
      legacyDataUrl: null,
    },
    async () => PNG_BYTES,
  );
  assert.equal(result, null);
});

test("missing Storage objects fail without legacy fallback", async () => {
  await assert.rejects(
    resolveEquipmentSignatureForPdf(
      {
        requestId: REQUEST_ID,
        phase: "handover",
        storagePath: HANDOVER_PATH,
        legacyDataUrl: LEGACY_DATA_URL,
      },
      async () => {
        throw new Error("SIGNATURE_STORAGE_DOWNLOAD_FAILED");
      },
    ),
    /SIGNATURE_STORAGE_DOWNLOAD_FAILED/,
  );
});

test("corrupt Storage PNG failures propagate without legacy fallback", async () => {
  await assert.rejects(
    resolveEquipmentSignatureForPdf(
      {
        requestId: REQUEST_ID,
        phase: "return",
        storagePath: RETURN_PATH,
        legacyDataUrl: LEGACY_DATA_URL,
      },
      async () => {
        throw new Error("SIGNATURE_STORAGE_DOWNLOAD_FAILED");
      },
    ),
    /SIGNATURE_STORAGE_DOWNLOAD_FAILED/,
  );
});
