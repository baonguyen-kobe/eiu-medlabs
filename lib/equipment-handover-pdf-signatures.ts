import type { EquipmentSignaturePhase } from "./equipment-signature-storage-core";

export type EquipmentSignaturePdfDownload = (input: {
  requestId: string;
  phase: EquipmentSignaturePhase;
  objectPath: string;
}) => Promise<Buffer>;

export type EquipmentSignaturePdfResolutionInput = {
  requestId: string;
  phase: EquipmentSignaturePhase;
  storagePath: string | null;
  legacyDataUrl: string | null;
};

function legacySignatureBuffer(value: string | null) {
  if (!value?.startsWith("data:image/png;base64,")) {
    return null;
  }
  try {
    return Buffer.from(value.slice(value.indexOf(",") + 1), "base64");
  } catch {
    return null;
  }
}

export async function resolveEquipmentSignatureForPdf(
  input: EquipmentSignaturePdfResolutionInput,
  download: EquipmentSignaturePdfDownload,
) {
  if (input.storagePath) {
    return download({
      requestId: input.requestId,
      phase: input.phase,
      objectPath: input.storagePath,
    });
  }
  return legacySignatureBuffer(input.legacyDataUrl);
}
