import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { formatBasicMedicalRegistrationCode } from "@/lib/basic-medical-registration-code";
import { BASIC_MEDICAL_ROOM_TYPE_ID } from "@/lib/room-types";

type BasicMedicalEmailEvent = "created" | "updated" | "cancelled";

export type BasicMedicalEmailSnapshot = {
  id: string;
  registration_code: string;
  created_at: string;
  academic_year: string;
  semester: string;
  start_date: string;
  end_date: string;
  student_count: number;
  note: string | null;
  registrant_id: string;
  responsible_lecturer_id: string;
  course: { course_code: string; course_name: string } | null;
  room: { room_code: string; building_code: string } | null;
  registrant: { full_name: string; email: string } | null;
  responsible: { full_name: string; email: string } | null;
  sessions: Array<{
    session_number: number;
    lesson_title: string;
    teaching: { full_name: string } | null;
    schedule: {
      schedule_date: string;
      start_time: string;
      end_time: string;
    } | null;
  }>;
};

export async function loadBasicMedicalEmailSnapshot(registrationId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("basic_medical_registrations")
    .select(
      "id,registration_code,created_at,academic_year,semester,start_date,end_date,student_count,note,registrant_id,responsible_lecturer_id,course:courses(course_code,course_name),room:rooms(room_code,building_code),registrant:profiles!basic_medical_registrations_registrant_id_fkey(full_name,email),responsible:profiles!basic_medical_registrations_responsible_lecturer_id_fkey(full_name,email),sessions:basic_medical_registration_sessions(session_number,lesson_title,teaching:profiles(full_name),schedule:class_schedules(schedule_date,start_time,end_time))",
    )
    .eq("id", registrationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as unknown as BasicMedicalEmailSnapshot | null;
}

export async function enqueueBasicMedicalRegistrationEmails({
  snapshot,
  event,
  actorId,
  operationId = crypto.randomUUID(),
}: {
  snapshot: BasicMedicalEmailSnapshot;
  event: BasicMedicalEmailEvent;
  actorId: string;
  operationId?: string;
}) {
  const supabase = createAdminClient();
  const [{ data: actor }, { data: profiles, error }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", actorId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select(
        "id,email,is_active,user_roles(role),profile_room_types(room_type_id)",
      )
      .eq("is_active", true),
  ]);
  if (error) throw new Error(error.message);

  const recipients = (profiles ?? []).filter((profile) => {
    if (
      profile.id === snapshot.registrant_id ||
      profile.id === snapshot.responsible_lecturer_id
    )
      return true;
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
  const labels: Record<BasicMedicalEmailEvent, { tag: string; text: string }> =
    {
      created: { tag: "New", text: "Có Phiếu Y cơ sở mới" },
      updated: { tag: "Adjusted", text: "Điều chỉnh Phiếu Y cơ sở" },
      cancelled: { tag: "Cancelled", text: "Hủy Phiếu Y cơ sở" },
    };
  const registrationCode = formatBasicMedicalRegistrationCode(
    snapshot.registration_code,
  );
  const dateRange = `${snapshot.start_date.split("-").reverse().join("/")} - ${snapshot.end_date.split("-").reverse().join("/")}`;
  const subjectDetails = `${snapshot.registrant?.full_name ?? "Giảng viên"} - ${snapshot.course?.course_code ?? "Môn học"} - ${dateRange} - ${registrationCode}`;
  const payload = {
    registration_id: snapshot.id,
    registration_code: registrationCode,
    event,
    course_code: snapshot.course?.course_code ?? "",
    course_name: snapshot.course?.course_name ?? "",
    academic_year: snapshot.academic_year,
    semester: snapshot.semester,
    start_date: snapshot.start_date,
    end_date: snapshot.end_date,
    student_count: snapshot.student_count,
    note: snapshot.note,
    room: [snapshot.room?.room_code, snapshot.room?.building_code]
      .filter(Boolean)
      .join(" · "),
    registrant_name: snapshot.registrant?.full_name ?? "",
    responsible_name: snapshot.responsible?.full_name ?? "",
    actor: actor?.full_name ?? "Người dùng hệ thống",
    schedules: snapshot.sessions.map((session) => ({
      schedule_date: session.schedule?.schedule_date,
      start_time: session.schedule?.start_time,
      end_time: session.schedule?.end_time,
      course_code: snapshot.course?.course_code,
      course_name: session.lesson_title || snapshot.course?.course_name,
      room: [snapshot.room?.room_code, snapshot.room?.building_code]
        .filter(Boolean)
        .join(" · "),
      lecturer: session.teaching?.full_name ?? "",
      student_count: snapshot.student_count,
    })),
  };
  const notifications = recipients
    .filter(({ email }) => email?.includes("@"))
    .map((recipient) => {
      const roles = new Set(
        ((recipient.user_roles ?? []) as Array<{ role: string }>).map(
          ({ role }) => role,
        ),
      );
      const isManagementCopy =
        roles.has("admin") ||
        (roles.has("staff") &&
          (
            (recipient.profile_room_types ?? []) as Array<{
              room_type_id: string;
            }>
          ).some(
            ({ room_type_id }) => room_type_id === BASIC_MEDICAL_ROOM_TYPE_ID,
          ));
      const prefix = isManagementCopy
        ? "[Admin MedLabs Calendar]"
        : "[MedLabs Calendar]";
      return {
        notification_type: `basic_medical_registration_${event}`,
        recipient_id: recipient.id,
        recipient_email: recipient.email.toLowerCase(),
        dedupe_key: `basic_medical_registration:${snapshot.id}:${event}:${operationId}:${recipient.id}`,
        subject: `${prefix}[Y cơ sở][${labels[event].tag}] ${labels[event].text} - ${subjectDetails}`,
        payload,
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
