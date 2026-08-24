import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { BASIC_MEDICAL_ROOM_TYPE_ID } from "@/lib/room-types";
import { basicMedicalDamageEmailSubject } from "@/lib/basic-medical-equipment";

export type BasicMedicalDamagedEmailItem = {
  item_name: string;
  commercial_name?: string | null;
  unit: string;
  newly_damaged_quantity: number;
  good_quantity: number;
  damaged_quantity: number;
};

export async function enqueueBasicMedicalEquipmentDamageEmails({
  confirmationId,
  roomCode,
  roomName,
  buildingCode,
  damagedItems,
}: {
  confirmationId: string;
  roomCode: string;
  roomName?: string | null;
  buildingCode: string;
  damagedItems: BasicMedicalDamagedEmailItem[];
}) {
  if (!damagedItems.length) return [];
  const supabase = createAdminClient();
  const { data: confirmation, error: confirmationError } = await supabase
    .from("basic_medical_session_confirmations")
    .select(
      "signed_at,class_schedule_id_snapshot,registration_id_snapshot,teaching_lecturer_id_snapshot,signer:profiles!basic_medical_session_confirmations_signer_id_fkey(full_name)",
    )
    .eq("id", confirmationId)
    .maybeSingle();
  if (confirmationError) throw new Error(confirmationError.message);
  const [
    { data: profiles, error },
    { data: schedule, error: scheduleError },
    { data: registration, error: registrationError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id,email,is_active,user_roles(role),profile_room_types(room_type_id)",
      )
      .eq("is_active", true),
    supabase
      .from("class_schedules")
      .select(
        "course_code_snapshot,course_name_snapshot,schedule_date,start_time,end_time",
      )
      .eq(
        "id",
        confirmation?.class_schedule_id_snapshot ??
          "00000000-0000-0000-0000-000000000000",
      )
      .maybeSingle(),
    supabase
      .from("basic_medical_registrations")
      .select("registrant_id")
      .eq(
        "id",
        confirmation?.registration_id_snapshot ??
          "00000000-0000-0000-0000-000000000000",
      )
      .maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  if (scheduleError) throw new Error(scheduleError.message);
  if (registrationError) throw new Error(registrationError.message);

  const registrantId = registration?.registrant_id;
  const teachingLecturerId = confirmation?.teaching_lecturer_id_snapshot;
  const recipients = (profiles ?? []).filter((profile) => {
    if (profile.id === registrantId || profile.id === teachingLecturerId) {
      return true;
    }
    const roles = new Set(
      ((profile.user_roles ?? []) as Array<{ role: string }>).map(
        ({ role }) => role,
      ),
    );
    if (roles.has("admin")) return true;
    return (
      roles.has("staff") &&
      (
        (profile.profile_room_types ?? []) as Array<{ room_type_id: string }>
      ).some(({ room_type_id }) => room_type_id === BASIC_MEDICAL_ROOM_TYPE_ID)
    );
  });
  const signer = confirmation?.signer as unknown as {
    full_name: string;
  } | null;
  const notifications = recipients
    .filter(({ email }) => email?.includes("@"))
    .map((recipient) => {
      const roles = new Set(
        ((recipient.user_roles ?? []) as Array<{ role: string }>).map(
          ({ role }) => role,
        ),
      );
      const managementCopy =
        roles.has("admin") ||
        (roles.has("staff") &&
          (
            (recipient.profile_room_types ?? []) as Array<{
              room_type_id: string;
            }>
          ).some(
            ({ room_type_id }) => room_type_id === BASIC_MEDICAL_ROOM_TYPE_ID,
          ));
      return {
        notification_type: "basic_medical_room_equipment_damaged",
        recipient_id: recipient.id,
        recipient_email: recipient.email.toLowerCase(),
        dedupe_key: `basic_medical_room_equipment_damaged:${confirmationId}:${recipient.id}`,
        subject: basicMedicalDamageEmailSubject(
          roomCode,
          roomName,
          managementCopy ? "management" : "user",
        ),
        payload: {
          audience: managementCopy ? "admin" : "registrant",
          confirmation_id: confirmationId,
          room_code: roomCode,
          room_name: roomName,
          building_code: buildingCode,
          reporter_name: signer?.full_name ?? "Giảng viên",
          reported_at: confirmation?.signed_at,
          course_code: schedule?.course_code_snapshot,
          course_name: schedule?.course_name_snapshot,
          schedule_date: schedule?.schedule_date,
          start_time: schedule?.start_time,
          end_time: schedule?.end_time,
          items: damagedItems,
        },
      };
    });
  if (!notifications.length) return [];
  const { error: insertError } = await supabase
    .from("email_notifications")
    .upsert(notifications, {
      onConflict: "dedupe_key",
      ignoreDuplicates: true,
    });
  if (insertError) throw new Error(insertError.message);
  return notifications.map(({ dedupe_key }) => dedupe_key);
}
