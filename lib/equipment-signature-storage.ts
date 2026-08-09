import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  uploadEquipmentSignatureWithClient,
  type UploadEquipmentSignatureInput,
} from "./equipment-signature-storage-core";

export type {
  EquipmentSignaturePhase,
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
