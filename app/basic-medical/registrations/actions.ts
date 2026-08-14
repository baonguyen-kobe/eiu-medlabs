"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { processPendingScheduleEmails } from "@/lib/email-notifications";

function registrationsUrl(kind: "notice" | "error", message: string) {
  return `/basic-medical/registrations?${kind}=${encodeURIComponent(message)}`;
}

export async function cancelBasicMedicalSession(formData: FormData) {
  const sessionId = String(formData.get("session_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !reason) {
    redirect(registrationsUrl("error", "Buổi học Y cơ sở không hợp lệ."));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_basic_medical_session", {
    target_session_id: sessionId,
    target_reason: reason,
  });
  if (error) {
    const message = error.message.includes("INVALIDATION_REQUIRED")
      ? "Buổi học đã được xác nhận. Hãy vô hiệu hóa xác nhận trước khi hủy."
      : "Không thể hủy buổi học đã chọn.";
    redirect(registrationsUrl("error", message));
  }
  after(processPendingScheduleEmails);
  revalidatePath("/basic-medical/registrations");
  revalidatePath("/basic-medical/schedules");
  revalidatePath("/class-schedules");
  redirect(registrationsUrl("notice", "Đã hủy đúng một buổi học Y cơ sở."));
}

export async function invalidateBasicMedicalSessionConfirmation(
  formData: FormData,
) {
  const confirmationId = String(formData.get("confirmation_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(confirmationId) || !reason) {
    redirect(registrationsUrl("error", "Vui lòng nhập Lý do vô hiệu hóa."));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "invalidate_basic_medical_session_confirmation",
    { target_confirmation_id: confirmationId, target_reason: reason },
  );
  if (error) {
    redirect(registrationsUrl("error", "Không thể vô hiệu hóa xác nhận."));
  }
  revalidatePath("/basic-medical/registrations");
  revalidatePath(
    `/basic-medical/registrations/confirmations/${confirmationId}`,
  );
  redirect(
    registrationsUrl(
      "notice",
      "Đã vô hiệu hóa xác nhận; bằng chứng gốc được giữ nguyên.",
    ),
  );
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
  checks: Array<{
    inventoryId: string;
    newlyDamagedQuantity: number;
    expectedCatalogItemId: string;
    expectedTotalQuantity: number;
    expectedGoodQuantity: number;
    expectedDamagedQuantity: number;
    expectedItemName: string;
    expectedCommercialName: string | null;
    expectedUnit: string;
  }>;
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
      ({
        inventoryId,
        newlyDamagedQuantity,
        expectedCatalogItemId,
        expectedTotalQuantity,
        expectedGoodQuantity,
        expectedDamagedQuantity,
        expectedItemName,
        expectedCommercialName,
        expectedUnit,
      }) =>
        !/^[0-9a-f-]{36}$/i.test(inventoryId) ||
        !/^[0-9a-f-]{36}$/i.test(expectedCatalogItemId) ||
        !Number.isInteger(newlyDamagedQuantity) ||
        newlyDamagedQuantity < 0 ||
        newlyDamagedQuantity > 2_147_483_647 ||
        !Number.isInteger(expectedTotalQuantity) ||
        !Number.isInteger(expectedGoodQuantity) ||
        !Number.isInteger(expectedDamagedQuantity) ||
        expectedTotalQuantity < 0 ||
        expectedTotalQuantity > 2_147_483_647 ||
        expectedGoodQuantity < 0 ||
        expectedGoodQuantity > 2_147_483_647 ||
        expectedDamagedQuantity < 0 ||
        expectedDamagedQuantity > 2_147_483_647 ||
        newlyDamagedQuantity > expectedGoodQuantity ||
        !expectedItemName ||
        (expectedCommercialName !== null &&
          typeof expectedCommercialName !== "string") ||
        !expectedUnit,
    )
  ) {
    return { ok: false, message: "Tình trạng thiết bị không hợp lệ." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_basic_medical_session", {
    target_session_id: sessionId,
    target_signature_data: signatureData,
    target_checks: checks.map((check) => ({
      inventory_id: check.inventoryId,
      newly_damaged_quantity: check.newlyDamagedQuantity,
      expected_catalog_item_id: check.expectedCatalogItemId,
      expected_total_quantity: check.expectedTotalQuantity,
      expected_good_quantity: check.expectedGoodQuantity,
      expected_damaged_quantity: check.expectedDamagedQuantity,
      expected_item_name: check.expectedItemName,
      expected_commercial_name: check.expectedCommercialName,
      expected_unit: check.expectedUnit,
    })),
  });
  if (error) return { ok: false, message: error.message };

  const result = data as unknown as {
    confirmation_id: string;
    signed_at: string;
    damaged_items?: unknown[];
  };
  const damagedItems = result.damaged_items ?? [];
  after(processPendingScheduleEmails);
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
