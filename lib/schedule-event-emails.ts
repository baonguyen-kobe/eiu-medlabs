import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { BASIC_MEDICAL_ROOM_TYPE_CODE } from "@/lib/room-types";
import { formatTimestampRecordCode } from "@/lib/timestamp-record-code";

export type ScheduleEmailEvent =
  "skills_lab_deleted" | "basic_medical_updated" | "basic_medical_cancelled";

export type ScheduleEmailSnapshot = {
  id: string;
  created_at: string;
  course_code_snapshot: string;
  course_name_snapshot: string;
  schedule_date: string;
  start_time: string;
  end_time: string;
  student_count: number;
  lecturer_id: string | null;
  lecturer_2_id: string | null;
  room: {
    room_code: string;
    building_code: string;
    room_type_id: string;
    room_types: { code: string; name: string } | null;
  } | null;
  lecturer: { full_name: string; email: string; is_active: boolean } | null;
  lecturer_2: { full_name: string; email: string; is_active: boolean } | null;
};

export async function loadScheduleEmailSnapshot(scheduleId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("class_schedules")
    .select(
      "id,created_at,course_code_snapshot,course_name_snapshot,schedule_date,start_time,end_time,student_count,lecturer_id,lecturer_2_id,room:rooms(room_code,building_code,room_type_id,room_types(code,name)),lecturer:profiles!class_schedules_lecturer_id_fkey(full_name,email,is_active),lecturer_2:profiles!class_schedules_lecturer_2_id_fkey(full_name,email,is_active)",
    )
    .eq("id", scheduleId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as ScheduleEmailSnapshot | null;
}

export async function enqueueScheduleEventEmails({
  snapshot,
  event,
  actorId,
  operationId = crypto.randomUUID(),
}: {
  snapshot: ScheduleEmailSnapshot;
  event: ScheduleEmailEvent;
  actorId: string;
  operationId?: string;
}) {
  const supabase = createAdminClient();
  const roomTypeId = snapshot.room?.room_type_id;
  const roomTypeCode = snapshot.room?.room_types?.code;
  if (!roomTypeId) return [];
  if (
    event.startsWith("basic_medical_") &&
    roomTypeCode !== BASIC_MEDICAL_ROOM_TYPE_CODE
  ) {
    return [];
  }

  const [{ data: actor }, { data: profiles, error }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", actorId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select(
        "id,email,is_active,user_roles(role),profile_room_types(room_type_id,receive_schedule_emails)",
      )
      .eq("is_active", true),
  ]);
  if (error) throw new Error(error.message);

  const lecturerIds = new Set(
    [snapshot.lecturer_id, snapshot.lecturer_2_id].filter(Boolean) as string[],
  );
  if (event === "skills_lab_deleted") {
    lecturerIds.add(actorId);
  }

  const recipients = (profiles ?? []).filter((profile) => {
    const roles = new Set(
      ((profile.user_roles ?? []) as Array<{ role: string }>).map(
        ({ role }) => role,
      ),
    );
    const assignments = (profile.profile_room_types ?? []) as Array<{
      room_type_id: string;
      receive_schedule_emails: boolean;
    }>;
    const scoped = assignments.some(
      ({ room_type_id }) => room_type_id === roomTypeId,
    );
    const optedIn = assignments.some(
      ({ room_type_id, receive_schedule_emails }) =>
        room_type_id === roomTypeId && receive_schedule_emails,
    );

    if (lecturerIds.has(profile.id)) return true;
    if (roles.has("admin")) return true;
    if (roles.has("staff") && scoped) return true;
    return event.startsWith("basic_medical_") && roles.has("viewer") && optedIn;
  });

  const eventLabels: Record<ScheduleEmailEvent, string> = {
    skills_lab_deleted: "Giảng viên xóa lớp Skills Lab",
    basic_medical_updated: "Điều chỉnh lịch Y cơ sở",
    basic_medical_cancelled: "Hủy lịch Y cơ sở",
  };
  const payload = {
    schedule_id: snapshot.id,
    event,
    course_code: snapshot.course_code_snapshot,
    course_name: snapshot.course_name_snapshot,
    schedule_date: snapshot.schedule_date,
    start_time: snapshot.start_time,
    end_time: snapshot.end_time,
    room: [snapshot.room?.room_code, snapshot.room?.building_code]
      .filter(Boolean)
      .join(" · "),
    room_type_code: roomTypeCode,
    lecturer: [snapshot.lecturer?.full_name, snapshot.lecturer_2?.full_name]
      .filter(Boolean)
      .join(" · "),
    student_count: snapshot.student_count,
    actor: actor?.full_name ?? "Người dùng hệ thống",
  };
  const notifications = recipients
    .filter(({ email }) => email?.includes("@"))
    .map((recipient) => ({
      notification_type: `class_schedule_${event}`,
      recipient_id: recipient.id,
      recipient_email: recipient.email.toLowerCase(),
      dedupe_key: `class_schedule:${snapshot.id}:${event}:${operationId}:${recipient.id}`,
      subject:
        event === "skills_lab_deleted"
          ? `[MedLabs Calendar] Giảng viên ${actor?.full_name ?? "Người dùng hệ thống"} xóa lớp Skills Lab - ${snapshot.course_code_snapshot} - ${snapshot.schedule_date.split("-").reverse().join("/")} - ${formatTimestampRecordCode(snapshot.created_at)}`
          : `[MedLabs Calendar] ${eventLabels[event]} · ${snapshot.course_code_snapshot}`,
      payload,
    }));

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
