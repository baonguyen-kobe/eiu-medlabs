export type EquipmentSignaturePhase = "handover" | "return";

export type EquipmentSignatureStorageErrorCode =
  | "INVALID_SIGNATURE_REQUEST"
  | "INVALID_SIGNATURE_PHASE"
  | "INVALID_SIGNATURE_DATA"
  | "SIGNATURE_TOO_LARGE"
  | "SIGNATURE_STORAGE_CONFLICT"
  | "SIGNATURE_STORAGE_UPLOAD_FAILED";

export class EquipmentSignatureStorageError extends Error {
  readonly code: EquipmentSignatureStorageErrorCode;

  constructor(code: EquipmentSignatureStorageErrorCode) {
    super(code);
    this.name = "EquipmentSignatureStorageError";
    this.code = code;
  }
}

export type EquipmentSignatureStorageClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array,
        options: { contentType: string; upsert: boolean },
      ): Promise<{
        error: {
          message?: string;
          status?: number;
          statusCode?: string | number;
        } | null;
      }>;
    };
  };
};

export type UploadEquipmentSignatureInput = {
  requestId: string;
  phase: EquipmentSignaturePhase;
  signatureDataUrl: string;
};

const EQUIPMENT_SIGNATURES_BUCKET = "equipment_signatures";
const MAX_SIGNATURE_DATA_URL_LENGTH = 400_000;
const MAX_STORAGE_SIGNATURE_BYTES = 524_288;
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const MAX_SIGNATURE_BYTES = Math.min(
  MAX_STORAGE_SIGNATURE_BYTES,
  Math.floor((MAX_SIGNATURE_DATA_URL_LENGTH - PNG_DATA_URL_PREFIX.length) / 4) *
    3,
);
const PNG_MAGIC_BYTES = Uint8Array.of(
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STRICT_BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function buildEquipmentSignatureObjectPath(
  requestId: string,
  phase: EquipmentSignaturePhase,
) {
  if (!UUID_PATTERN.test(requestId)) {
    throw new EquipmentSignatureStorageError("INVALID_SIGNATURE_REQUEST");
  }

  if (phase !== "handover" && phase !== "return") {
    throw new EquipmentSignatureStorageError("INVALID_SIGNATURE_PHASE");
  }

  return `equipment-requests/${requestId.toLowerCase()}/${phase}.png`;
}

export function parseEquipmentSignatureDataUrl(signatureDataUrl: string) {
  if (typeof signatureDataUrl !== "string" || !signatureDataUrl) {
    throw new EquipmentSignatureStorageError("INVALID_SIGNATURE_DATA");
  }

  if (signatureDataUrl.length > MAX_SIGNATURE_DATA_URL_LENGTH) {
    throw new EquipmentSignatureStorageError("SIGNATURE_TOO_LARGE");
  }

  if (!signatureDataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new EquipmentSignatureStorageError("INVALID_SIGNATURE_DATA");
  }

  const encoded = signatureDataUrl.slice(PNG_DATA_URL_PREFIX.length);
  if (!encoded || !STRICT_BASE64_PATTERN.test(encoded)) {
    throw new EquipmentSignatureStorageError("INVALID_SIGNATURE_DATA");
  }

  const paddingLength = encoded.endsWith("==")
    ? 2
    : encoded.endsWith("=")
      ? 1
      : 0;
  const decodedLength = (encoded.length / 4) * 3 - paddingLength;
  if (decodedLength > MAX_SIGNATURE_BYTES) {
    throw new EquipmentSignatureStorageError("SIGNATURE_TOO_LARGE");
  }

  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length !== decodedLength) {
    throw new EquipmentSignatureStorageError("INVALID_SIGNATURE_DATA");
  }

  if (bytes.length > MAX_SIGNATURE_BYTES) {
    throw new EquipmentSignatureStorageError("SIGNATURE_TOO_LARGE");
  }

  if (
    bytes.length < PNG_MAGIC_BYTES.length ||
    !PNG_MAGIC_BYTES.every((byte, index) => bytes[index] === byte)
  ) {
    throw new EquipmentSignatureStorageError("INVALID_SIGNATURE_DATA");
  }

  return bytes;
}

function isStorageConflict(error: {
  message?: string;
  status?: number;
  statusCode?: string | number;
}) {
  return (
    error.status === 409 ||
    error.statusCode === 409 ||
    error.statusCode === "409" ||
    error.statusCode === "Duplicate" ||
    (error.status === 400 && /asset already exists/i.test(error.message ?? ""))
  );
}

export async function uploadEquipmentSignatureWithClient(
  input: UploadEquipmentSignatureInput,
  client: EquipmentSignatureStorageClient,
) {
  const path = buildEquipmentSignatureObjectPath(input.requestId, input.phase);
  const bytes = parseEquipmentSignatureDataUrl(input.signatureDataUrl);
  const { error } = await client.storage
    .from(EQUIPMENT_SIGNATURES_BUCKET)
    .upload(path, bytes, {
      contentType: "image/png",
      upsert: false,
    });

  if (error) {
    throw new EquipmentSignatureStorageError(
      isStorageConflict(error)
        ? "SIGNATURE_STORAGE_CONFLICT"
        : "SIGNATURE_STORAGE_UPLOAD_FAILED",
    );
  }

  return { path };
}
