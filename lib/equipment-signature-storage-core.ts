export type EquipmentSignaturePhase = "handover" | "return";

export type EquipmentSignatureStorageErrorCode =
  | "INVALID_SIGNATURE_REQUEST"
  | "INVALID_SIGNATURE_PHASE"
  | "INVALID_SIGNATURE_OPERATION"
  | "INVALID_SIGNATURE_PATH"
  | "INVALID_SIGNATURE_DATA"
  | "SIGNATURE_TOO_LARGE"
  | "SIGNATURE_STORAGE_CONFLICT"
  | "SIGNATURE_STORAGE_UPLOAD_FAILED"
  | "SIGNATURE_STORAGE_DELETE_FAILED"
  | "SIGNATURE_STORAGE_DOWNLOAD_FAILED";

export class EquipmentSignatureStorageError extends Error {
  readonly code: EquipmentSignatureStorageErrorCode;

  constructor(code: EquipmentSignatureStorageErrorCode) {
    super(code);
    this.name = "EquipmentSignatureStorageError";
    this.code = code;
  }
}

type StorageError = {
  message?: string;
  status?: number;
  statusCode?: string | number;
};

type StorageDownloadData = {
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type EquipmentSignatureStorageClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array,
        options: { contentType: string; upsert: boolean },
      ): Promise<{ error: StorageError | null }>;
      remove(paths: string[]): Promise<{ error: StorageError | null }>;
      download(path: string): Promise<{
        data: StorageDownloadData | null;
        error: StorageError | null;
      }>;
    };
  };
};

export type UploadEquipmentSignatureInput = {
  requestId: string;
  phase: EquipmentSignaturePhase;
  operationId: string;
  objectPath: string;
  signatureDataUrl: string;
};

export type DownloadEquipmentSignatureInput = {
  requestId: string;
  phase: EquipmentSignaturePhase;
  objectPath: string;
};

export type DeleteEquipmentSignatureInput = Omit<
  UploadEquipmentSignatureInput,
  "signatureDataUrl"
>;

const EQUIPMENT_SIGNATURES_BUCKET = "equipment_signatures";
const DATA_URL_PREFIX = "data:image/png;base64,";
const MAX_DATA_URL_LENGTH = 400_000;
const MAX_BYTES = Math.min(
  524_288,
  Math.floor((MAX_DATA_URL_LENGTH - DATA_URL_PREFIX.length) / 4) * 3,
);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATION_PATH =
  /^equipment-requests\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(handover|return)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.png$/;
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const PNG_MAGIC = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

export function buildEquipmentSignatureObjectPath(
  requestId: string,
  phase: EquipmentSignaturePhase,
  operationId: string,
) {
  if (!UUID.test(requestId)) {
    throw new EquipmentSignatureStorageError("INVALID_SIGNATURE_REQUEST");
  }
  if (phase !== "handover" && phase !== "return") {
    throw new EquipmentSignatureStorageError("INVALID_SIGNATURE_PHASE");
  }
  if (!UUID.test(operationId)) {
    throw new EquipmentSignatureStorageError("INVALID_SIGNATURE_OPERATION");
  }

  return `equipment-requests/${requestId.toLowerCase()}/${phase}/${operationId.toLowerCase()}.png`;
}

export function validateEquipmentSignatureObjectPath(
  input: Omit<UploadEquipmentSignatureInput, "signatureDataUrl">,
) {
  const expected = buildEquipmentSignatureObjectPath(
    input.requestId,
    input.phase,
    input.operationId,
  );
  if (input.objectPath !== expected) {
    throw new EquipmentSignatureStorageError("INVALID_SIGNATURE_PATH");
  }
  return expected;
}

export function validateEquipmentSignatureDownloadPath(
  input: DownloadEquipmentSignatureInput,
) {
  const parts = OPERATION_PATH.exec(input.objectPath);
  if (!parts) {
    throw new EquipmentSignatureStorageError("INVALID_SIGNATURE_PATH");
  }
  return validateEquipmentSignatureObjectPath({
    requestId: input.requestId,
    phase: input.phase,
    operationId: parts[3],
    objectPath: input.objectPath,
  });
}

export function parseEquipmentSignatureDataUrl(value: string) {
  if (
    typeof value !== "string" ||
    !value.startsWith(DATA_URL_PREFIX) ||
    value.length > MAX_DATA_URL_LENGTH
  ) {
    throw new EquipmentSignatureStorageError(
      value?.length > MAX_DATA_URL_LENGTH
        ? "SIGNATURE_TOO_LARGE"
        : "INVALID_SIGNATURE_DATA",
    );
  }

  const encoded = value.slice(DATA_URL_PREFIX.length);
  if (!encoded || !BASE64.test(encoded)) {
    throw new EquipmentSignatureStorageError("INVALID_SIGNATURE_DATA");
  }

  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const expectedLength = (encoded.length / 4) * 3 - padding;
  if (expectedLength > MAX_BYTES) {
    throw new EquipmentSignatureStorageError("SIGNATURE_TOO_LARGE");
  }

  const bytes = Buffer.from(encoded, "base64");
  if (
    !bytes.length ||
    bytes.length !== expectedLength ||
    bytes.toString("base64") !== encoded ||
    bytes.length > MAX_BYTES ||
    bytes.length < PNG_MAGIC.length ||
    !PNG_MAGIC.every((byte, index) => bytes[index] === byte)
  ) {
    throw new EquipmentSignatureStorageError(
      bytes.length > MAX_BYTES
        ? "SIGNATURE_TOO_LARGE"
        : "INVALID_SIGNATURE_DATA",
    );
  }
  return bytes;
}

function validateDownloadedPng(bytes: Buffer) {
  if (
    !bytes.length ||
    bytes.length > MAX_BYTES ||
    bytes.length < PNG_MAGIC.length ||
    !PNG_MAGIC.every((byte, index) => bytes[index] === byte)
  ) {
    throw new EquipmentSignatureStorageError(
      "SIGNATURE_STORAGE_DOWNLOAD_FAILED",
    );
  }
  return bytes;
}

function isConflict(error: StorageError) {
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
  const path = validateEquipmentSignatureObjectPath(input);
  const { error } = await client.storage
    .from(EQUIPMENT_SIGNATURES_BUCKET)
    .upload(path, parseEquipmentSignatureDataUrl(input.signatureDataUrl), {
      contentType: "image/png",
      upsert: false,
    });

  if (error) {
    throw new EquipmentSignatureStorageError(
      isConflict(error)
        ? "SIGNATURE_STORAGE_CONFLICT"
        : "SIGNATURE_STORAGE_UPLOAD_FAILED",
    );
  }
  return { path };
}

export async function deleteEquipmentSignatureWithClient(
  input: DeleteEquipmentSignatureInput,
  client: EquipmentSignatureStorageClient,
) {
  const path = validateEquipmentSignatureObjectPath(input);
  const { error } = await client.storage
    .from(EQUIPMENT_SIGNATURES_BUCKET)
    .remove([path]);
  if (error) {
    throw new EquipmentSignatureStorageError("SIGNATURE_STORAGE_DELETE_FAILED");
  }
}

export async function downloadEquipmentSignatureWithClient(
  input: DownloadEquipmentSignatureInput,
  client: EquipmentSignatureStorageClient,
) {
  const path = validateEquipmentSignatureDownloadPath(input);
  const { data, error } = await client.storage
    .from(EQUIPMENT_SIGNATURES_BUCKET)
    .download(path);
  if (error || !data) {
    throw new EquipmentSignatureStorageError(
      "SIGNATURE_STORAGE_DOWNLOAD_FAILED",
    );
  }
  return validateDownloadedPng(Buffer.from(await data.arrayBuffer()));
}
