import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  downloadEquipmentSignatureWithClient,
  uploadEquipmentSignatureWithClient,
  type DownloadEquipmentSignatureInput,
  type UploadEquipmentSignatureInput,
} from "./equipment-signature-storage-core";

export type {
  EquipmentSignaturePhase,
  DownloadEquipmentSignatureInput,
  UploadEquipmentSignatureInput,
} from "./equipment-signature-storage-core";
export {
  EquipmentSignatureStorageError,
  type EquipmentSignatureStorageErrorCode,
} from "./equipment-signature-storage-core";

export async function uploadEquipmentSignature(
  input: UploadEquipmentSignatureInput,
) {
  return uploadEquipmentSignatureWithClient(input, createAdminClient());
}

export async function downloadEquipmentSignature(
  input: DownloadEquipmentSignatureInput,
) {
  return downloadEquipmentSignatureWithClient(input, createAdminClient());
}
