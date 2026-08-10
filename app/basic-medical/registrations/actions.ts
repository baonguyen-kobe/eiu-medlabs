"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { processPendingScheduleEmails } from "@/lib/email-notifications";
import { parseBasicMedicalSessionConfirmation } from "@/lib/basic-medical-session-confirmation";

function registrationsUrl(kind: "notice" | "error", message: string) {
  return `/basic-medical/registrations?${kind}=${encodeURIComponent(message)}`;
}

export async function cancelBasicMedicalRegistration(formData: FormData) {
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
        "Chỉ Admin hoặc Chuyên viên được hủy phiếu Y cơ sở.",
      ),
    );
  }

  const reason = String(formData.get("reason") ?? "").trim();
  const { data, error } = await supabase.rpc(
    "cancel_basic_medical_registration",
    {
      target_registration_id: registrationId,
      target_reason: reason || null,
    },
  );

  if (error || !data) {
    redirect(
      registrationsUrl(
        "error",
        "Không thể hủy phiếu Y cơ sở. Phiếu có thể đã được hủy.",
      ),
    );
  }

  after(processPendingScheduleEmails);

  revalidatePath("/basic-medical/registrations");
  revalidatePath("/basic-medical/schedules");
  revalidatePath("/class-schedules");
  redirect(registrationsUrl("notice", "Đã hủy phiếu Y cơ sở."));
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
  if (error) {
    return { ok: false, message: "Không thể ký xác nhận buổi học." };
  }

  const result = parseBasicMedicalSessionConfirmation(data);
  if (!result) {
    return { ok: false, message: "Không thể xác nhận kết quả ký buổi học." };
  }
  after(processPendingScheduleEmails);
  revalidatePath("/basic-medical/registrations");
  revalidatePath("/basic-medical/equipment");
  return {
    ok: true,
    message: result.damagedItemCount
      ? "Đã ký xác nhận và ghi nhận thiết bị hư."
      : "Đã ký xác nhận buổi học.",
    confirmationId: result.confirmationId,
    signedAt: result.signedAt,
  };
}
