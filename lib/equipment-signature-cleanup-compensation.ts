import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function markEquipmentSignatureCompensationRequired(
  operationId: string,
) {
  const { error } = await createAdminClient().rpc(
    "mark_equipment_signature_cleanup_compensation",
    { target_operation_id: operationId },
  );
  if (error) {
    throw new Error("EQUIPMENT_SIGNATURE_COMPENSATION_MARK_FAILED");
  }
}
