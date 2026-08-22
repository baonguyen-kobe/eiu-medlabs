import {
  BasicMedicalEquipmentRequestForm,
  type BasicMedicalEquipmentRegistrant,
} from "@/components/basic-medical-equipment-request-form";
import { BasicMedicalEquipmentRequestDetail } from "@/components/basic-medical-equipment-request-detail";
import {
  BasicMedicalEquipmentSessionSelector,
  type BasicMedicalEquipmentSessionOption,
} from "@/components/basic-medical-equipment-session-selector";
import { EquipmentRegistrationDomainSwitch } from "@/components/equipment-registration-domain-switch";
import { WorkspaceShell } from "@/components/workspace-shell";
import type {
  BasicMedicalEquipmentCatalogItem,
  BasicMedicalRegistrationListItem,
  BasicMedicalRegistrationSessionItem,
} from "@/lib/basic-medical-equipment";
import { businessTodayString } from "@/lib/business-time";
import {
  equipmentRequestSelect,
  equipmentStatusMeta,
  type EquipmentRequestListItem,
} from "@/lib/equipment-requests";
import type { getViewer } from "@/lib/viewer";

type Viewer = Awaited<ReturnType<typeof getViewer>>;

type BasicMedicalSessionRow = {
  id: string;
  session_number: number;
  lesson_title: string;
  teaching_lecturer_id: string;
  cancelled_at: string | null;
  teaching: { full_name: string } | null;
  class_schedules: {
    id: string;
    schedule_date: string;
    start_time: string;
    end_time: string;
    schedule_status: string;
  } | null;
  registration: Omit<
    BasicMedicalRegistrationListItem,
    "basic_medical_registration_sessions"
  > | null;
};

function isUuid(value: string | undefined) {
  return Boolean(value && /^[0-9a-f-]{36}$/i.test(value));
}

function sessionOptionLabel(
  registration: BasicMedicalRegistrationListItem,
  session: BasicMedicalRegistrationSessionItem,
) {
  const schedule = session.class_schedules;
  const date = schedule?.schedule_date.split("-").reverse().join("/") ?? "—";
  const time = schedule
    ? `${schedule.start_time.slice(0, 5)}–${schedule.end_time.slice(0, 5)}`
    : "—";
  const room = registration.rooms
    ? `${registration.rooms.room_code}.${registration.rooms.building_code}`
    : "—";
  return [
    date,
    time,
    registration.courses?.course_code,
    registration.courses?.course_name,
    `Buổi ${session.session_number}`,
    session.lesson_title,
    room,
  ]
    .filter(Boolean)
    .join(" · ");
}

function sessionIsActive(
  registration: BasicMedicalRegistrationListItem,
  session: BasicMedicalRegistrationSessionItem,
) {
  return !(
    registration.cancelled_at ||
    session.cancelled_at ||
    session.class_schedules?.schedule_status === "cancelled"
  );
}

function sessionCanCreateEquipmentRequest(
  registration: BasicMedicalRegistrationListItem,
  session: BasicMedicalRegistrationSessionItem,
  today: string,
) {
  return Boolean(
    sessionIsActive(registration, session) &&
    session.class_schedules?.schedule_date &&
    session.class_schedules.schedule_date >= today,
  );
}

export async function BasicMedicalEquipmentRegistrationPage({
  viewer,
  sessionId,
  canUseSkills,
}: {
  viewer: Viewer;
  sessionId?: string;
  canUseSkills: boolean;
}) {
  const {
    supabase,
    userId,
    fullName,
    email,
    roles,
    roomTypes,
    allowBasicMedicalAccess,
    canImportSchedules,
    canManagePersonnel,
    canManageEmailNotifications,
    canManageBasicMedical,
  } = viewer;
  const roomTypeCodes = roomTypes.map(({ code }) => code);
  const today = businessTodayString();
  const { data: rawSessions, error: sessionError } = await supabase
    .from("basic_medical_registration_sessions")
    .select(
      "id,session_number,lesson_title,teaching_lecturer_id,cancelled_at,teaching:profiles!basic_medical_registration_sessions_teaching_lecturer_id_fkey(full_name),class_schedules!inner(id,schedule_date,start_time,end_time,schedule_status),registration:basic_medical_registrations!inner(id,created_by,registrant_id,registration_code,created_at,academic_year,semester,start_date,end_date,student_count,note,cancelled_at,cancelled_by,cancel_reason,courses(course_code,course_name),rooms(id,room_code,building_code,room_name),registrant:profiles!basic_medical_registrations_registrant_id_fkey(full_name),responsible:profiles!basic_medical_registrations_responsible_lecturer_id_fkey(full_name))",
    )
    .order("session_number");

  const visibleSources = (
    (rawSessions ?? []) as unknown as BasicMedicalSessionRow[]
  ).flatMap((row) => {
    if (!row.registration || !row.class_schedules) return [];
    const session: BasicMedicalRegistrationSessionItem = {
      id: row.id,
      session_number: row.session_number,
      lesson_title: row.lesson_title,
      teaching_lecturer_id: row.teaching_lecturer_id,
      teaching: row.teaching,
      cancelled_at: row.cancelled_at,
      class_schedules: row.class_schedules,
      confirmations: [],
    };
    const registration: BasicMedicalRegistrationListItem = {
      ...row.registration,
      basic_medical_registration_sessions: [session],
    };
    const eligible =
      canManageBasicMedical ||
      registration.created_by === userId ||
      registration.registrant_id === userId ||
      session.teaching_lecturer_id === userId;
    return eligible ? [{ registration, session }] : [];
  });
  const sourceIds = visibleSources.map(({ session }) => session.id);
  const { data: requestRows, error: requestError } = sourceIds.length
    ? await supabase
        .from("equipment_requests")
        .select(equipmentRequestSelect)
        .eq("request_domain", "basic_medical")
        .in("source_identity_id", sourceIds)
    : { data: [], error: null };
  const requestsBySession = new Map(
    ((requestRows ?? []) as unknown as EquipmentRequestListItem[]).map(
      (request) => [request.source_identity_id, request],
    ),
  );
  const selected = isUuid(sessionId)
    ? visibleSources.find(({ session }) => session.id === sessionId)
    : undefined;
  const selectedRequest = selected
    ? requestsBySession.get(selected.session.id)
    : undefined;
  const canCreateSelected = Boolean(
    selected &&
    sessionCanCreateEquipmentRequest(
      selected.registration,
      selected.session,
      today,
    ) &&
    !selectedRequest,
  );
  const [catalogResult, profileResult] = await Promise.all([
    canCreateSelected
      ? supabase
          .from("basic_medical_equipment_catalog")
          .select(
            "id,item_name,commercial_name,item_type,country_of_origin,manufacturer,model,unit,is_active",
          )
          .eq("is_active", true)
          .order("item_name")
      : Promise.resolve({ data: [], error: null }),
    canCreateSelected
      ? supabase.from("profiles").select("phone").eq("id", userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const availableSessionOptions: BasicMedicalEquipmentSessionOption[] =
    visibleSources
      .filter(
        ({ registration, session }) =>
          sessionCanCreateEquipmentRequest(registration, session, today) &&
          !requestsBySession.has(session.id),
      )
      .map(({ registration, session }) => {
        const label = sessionOptionLabel(registration, session);
        return { value: session.id, label, keywords: label };
      });
  const equipmentRegistrant: BasicMedicalEquipmentRegistrant = {
    id: userId,
    fullName,
    email,
    phone: profileResult.data?.phone ?? "",
  };
  const loadError = sessionError ?? requestError ?? catalogResult.error;
  const invalidSession = Boolean(sessionId && !isUuid(sessionId));

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypeCodes}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      canManagePersonnel={canManagePersonnel}
      canManageEmailNotifications={canManageEmailNotifications}
      title="Đăng ký thiết bị"
      description="Phiếu trang thiết bị thực hành cho buổi học Y cơ sở."
    >
      <EquipmentRegistrationDomainSwitch
        activeDomain="basic_medical"
        canUseSkills={canUseSkills}
        canUseBasicMedical
      />
      {loadError ? (
        <p className="form-error" role="alert">
          Không thể tải dữ liệu đăng ký thiết bị: {loadError.message}
        </p>
      ) : null}
      {!selected ? (
        <>
          {invalidSession || sessionId ? (
            <p className="form-error" role="alert">
              Không tìm thấy buổi học Y cơ sở phù hợp để đăng ký thiết bị.
            </p>
          ) : null}
          <BasicMedicalEquipmentSessionSelector
            sessions={availableSessionOptions}
          />
        </>
      ) : selectedRequest ? (
        <>
          <section className="data-panel">
            <strong>
              {selectedRequest.status === "cancelled"
                ? "Phiếu thiết bị đã hủy"
                : `Phiếu thiết bị ${equipmentStatusMeta(selectedRequest.status).label}`}
            </strong>
          </section>
          <BasicMedicalEquipmentRequestDetail
            request={selectedRequest}
            registration={selected.registration}
            session={selected.session}
          />
        </>
      ) : canCreateSelected ? (
        <BasicMedicalEquipmentRequestForm
          registration={selected.registration}
          session={selected.session}
          catalog={
            (catalogResult.data ?? []) as BasicMedicalEquipmentCatalogItem[]
          }
          today={today}
          equipmentRegistrant={equipmentRegistrant}
        />
      ) : (
        <>
          <p className="form-error" role="alert">
            Buổi học Y cơ sở đã hủy hoặc không còn hợp lệ để đăng ký thiết bị.
          </p>
          <BasicMedicalEquipmentSessionSelector
            sessions={availableSessionOptions}
          />
        </>
      )}
    </WorkspaceShell>
  );
}
