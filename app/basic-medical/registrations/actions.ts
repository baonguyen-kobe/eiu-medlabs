"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  enqueueBasicMedicalRegistrationEmails,
  loadBasicMedicalEmailSnapshot,
} from "@/lib/basic-medical-emails";
import {
  enqueueBasicMedicalEquipmentDamageEmails,
  type BasicMedicalDamagedEmailItem,
} from "@/lib/basic-medical-equipment-emails";
import { processEmailNotificationsByDedupeKeys } from "@/lib/email-notifications";

function registrationsUrl(kind: "notice" | "error", message: string) {
  return `/basic-medical/registrations?${kind}=${encodeURIComponent(message)}`;
}

export async function deleteBasicMedicalRegistration(formData: FormData) {
  const registrationId = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(registrationId)) {
    redirect(registrationsUrl("error", "Phiếu Y cơ sở không hợp lệ."));
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) {
    redirect(registrationsUrl("error", "Phiên đăng nhập đã hết hạn."));
  }

  const { data: authority, error: authorityError } = await supabase.rpc(
    "get_basic_medical_authority_context",
  );
  if (
    authorityError ||
    !(authority as { can_manage_basic_medical?: boolean } | null)
      ?.can_manage_basic_medical
  ) {
    redirect(
      registrationsUrl(
        "error",
        "Chỉ Admin hoặc Chuyên viên được xóa phiếu Y cơ sở.",
      ),
    );
  }

  let emailSnapshot = null;
  try {
    emailSnapshot = await loadBasicMedicalEmailSnapshot(registrationId);
  } catch (emailError) {
    console.error("Không thể đọc phiếu Y cơ sở trước khi xóa:", emailError);
  }

  const { data, error } = await supabase
    .from("basic_medical_registrations")
    .delete()
    .eq("id", registrationId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect(
      registrationsUrl(
        "error",
        "Không thể xóa phiếu Y cơ sở. Phiếu có thể đã bị xóa.",
      ),
    );
  }

  if (emailSnapshot) {
    try {
      const dedupeKeys = await enqueueBasicMedicalRegistrationEmails({
        snapshot: emailSnapshot,
        event: "deleted",
        actorId: userId,
      });
      after(() => processEmailNotificationsByDedupeKeys(dedupeKeys));
    } catch (emailError) {
      console.error("Không thể xếp email xóa phiếu Y cơ sở:", emailError);
    }
  }

  revalidatePath("/basic-medical/registrations");
  revalidatePath("/basic-medical/schedules");
  revalidatePath("/class-schedules");
  redirect(registrationsUrl("notice", "Đã xóa phiếu Y cơ sở."));
}

export type ConfirmBasicMedicalSessionResult = {
  ok: boolean;
  message: string;
  confirmationId?: string;
  signedAt?: string;
};

export async function confirmBasicMedicalSession({
  sessionId,
  signatureData,
  checks,
}: {
  sessionId: string;
  signatureData: string;
  checks: Array<{ inventoryId: string; newlyDamagedQuantity: number }>;
}): Promise<ConfirmBasicMedicalSessionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return { ok: false, message: "Buổi học không hợp lệ." };
  }
  if (
    !signatureData.startsWith("data:image/png;base64,") ||
    signatureData.length < 100 ||
    signatureData.length > 400_000
  ) {
    return { ok: false, message: "Chữ ký điện tử không hợp lệ." };
  }
  if (
    checks.some(
      ({ inventoryId, newlyDamagedQuantity }) =>
        !/^[0-9a-f-]{36}$/i.test(inventoryId) ||
        !Number.isInteger(newlyDamagedQuantity) ||
        newlyDamagedQuantity < 0,
    )
  ) {
    return { ok: false, message: "Tình trạng thiết bị không hợp lệ." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_basic_medical_session", {
    target_session_id: sessionId,
    target_signature_data: signatureData,
    target_checks: checks.map(({ inventoryId, newlyDamagedQuantity }) => ({
      inventory_id: inventoryId,
      newly_damaged_quantity: newlyDamagedQuantity,
    })),
  });
  if (error) return { ok: false, message: error.message };

  const result = data as unknown as {
    confirmation_id: string;
    signed_at: string;
    room_code: string;
    room_name?: string | null;
    building_code: string;
    damaged_items?: BasicMedicalDamagedEmailItem[];
  };
  const damagedItems = result.damaged_items ?? [];
  if (damagedItems.length) {
    try {
      const dedupeKeys = await enqueueBasicMedicalEquipmentDamageEmails({
        confirmationId: result.confirmation_id,
        roomCode: result.room_code,
        roomName: result.room_name,
        buildingCode: result.building_code,
        damagedItems,
      });
      after(() => processEmailNotificationsByDedupeKeys(dedupeKeys));
    } catch (emailError) {
      console.error("Không thể xếp email báo thiết bị phòng hư:", emailError);
    }
  }
  revalidatePath("/basic-medical/registrations");
  revalidatePath("/basic-medical/equipment");
  return {
    ok: true,
    message: damagedItems.length
      ? "Đã ký xác nhận và ghi nhận thiết bị hư."
      : "Đã ký xác nhận buổi học.",
    confirmationId: result.confirmation_id,
    signedAt: result.signed_at,
  };
}
