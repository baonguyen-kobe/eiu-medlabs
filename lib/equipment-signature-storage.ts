import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteEquipmentSignatureWithClient,
  downloadEquipmentSignatureWithClient,
  uploadEquipmentSignatureWithClient,
  type DeleteEquipmentSignatureInput,
  type DownloadEquipmentSignatureInput,
  type UploadEquipmentSignatureInput,
} from "./equipment-signature-storage-core";

export type {
  EquipmentSignaturePhase,
  DeleteEquipmentSignatureInput,
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

export async function deleteEquipmentSignature(
  input: DeleteEquipmentSignatureInput,
) {
  return deleteEquipmentSignatureWithClient(input, createAdminClient());
}

export async function downloadEquipmentSignature(
  input: DownloadEquipmentSignatureInput,
) {
  return downloadEquipmentSignatureWithClient(input, createAdminClient());
}
