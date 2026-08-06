import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BasicMedicalRegistrationForm,
  type BasicMedicalRegistrationInitialData,
} from "@/components/basic-medical-registration-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import {
  formatBasicMedicalRegistrationCode,
  normalizeBasicMedicalRegistrationCode,
} from "@/lib/basic-medical-registration-code";
import { businessTodayString } from "@/lib/business-time";
import { BASIC_MEDICAL_ROOM_TYPE_ID } from "@/lib/room-types";
import { getViewer } from "@/lib/viewer";
import {
  canCreateBasicMedicalSchedules,
  canViewBasicMedicalSchedules,
} from "@/lib/workspace-access";

export const metadata = { title: "Tạo lịch Y cơ sở" };

type RegistrationMode = "copy" | "edit";

type RegistrationOption = {
  id: string;
  registration_code: string;
  created_at: string;
  created_by: string;
  start_date: string;
  end_date: string;
  registrant: { full_name: string } | null;
  course: { course_code: string } | null;
  room: { room_code: string; building_code: string } | null;
};

type SourceRegistration = {
  id: string;
  registration_code: string;
  created_at: string;
  created_by: string;
  registrant_id: string;
  responsible_lecturer_id: string;
  academic_year: string;
  semester: string;
  start_date: string;
  end_date: string;
  course_id: string;
  room_id: string;
  student_count: number;
  note: string | null;
  registrant: { full_name: string; email: string } | null;
  sessions: Array<{
    session_number: number;
    lesson_title: string;
    teaching_lecturer_id: string;
    schedule: {
      schedule_date: string;
      start_time: string;
      end_time: string;
    } | null;
  }>;
};

const sourceRegistrationSelect =
  "id,registration_code,created_at,created_by,registrant_id,responsible_lecturer_id,academic_year,semester,start_date,end_date,course_id,room_id,student_count,note,registrant:profiles!basic_medical_registrations_registrant_id_fkey(full_name,email),sessions:basic_medical_registration_sessions(session_number,lesson_title,teaching_lecturer_id,schedule:class_schedules(schedule_date,start_time,end_time))";

function registrationOptionLabel(option: RegistrationOption) {
  const dateRange = `${option.start_date.split("-").reverse().join("/")}–${option.end_date.split("-").reverse().join("/")}`;
  return [
    `#${formatBasicMedicalRegistrationCode(option.registration_code)}`,
    option.course?.course_code,
    dateRange,
    option.room
      ? `${option.room.room_code}.${option.room.building_code}`
      : null,
    option.registrant?.full_name,
  ]
    .filter(Boolean)
    .join(" · ");
}

function RegistrationModePicker({
  mode,
  activeRegistrationKey,
  editOptions,
}: {
  mode: RegistrationMode | null;
  activeRegistrationKey: string;
  editOptions: RegistrationOption[];
}) {
  return (
    <section
      className="equipment-registration-tools"
      aria-label="Sao chép hoặc điều chỉnh phiếu Y cơ sở"
    >
      <div className="equipment-registration-tools-heading">
        <strong>Thao tác với phiếu đã đăng ký</strong>
        {mode ? (
          <Link className="button button-secondary" href="/basic-medical/new">
            Đăng ký mới
          </Link>
        ) : null}
      </div>
      <div className="equipment-registration-mode-grid">
        <details className="equipment-registration-mode" open={mode === "edit"}>
          <summary className="button equipment-mode-button equipment-mode-edit">
            Điều chỉnh phiếu
          </summary>
          <form action="/basic-medical/new" method="get">
            <input type="hidden" name="mode" value="edit" />
            <label>
              Chọn phiếu cần điều chỉnh
              <select
                name="registration"
                required
                defaultValue={mode === "edit" ? activeRegistrationKey : ""}
              >
                <option value="" disabled>
                  Chọn phiếu của bạn
                </option>
                {editOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {registrationOptionLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="button button-primary"
              disabled={!editOptions.length}
            >
              Tải phiếu để điều chỉnh
            </button>
          </form>
        </details>

        <details className="equipment-registration-mode" open={mode === "copy"}>
          <summary className="button equipment-mode-button equipment-mode-copy">
            Sao chép phiếu
          </summary>
          <form action="/basic-medical/new" method="get">
            <input type="hidden" name="mode" value="copy" />
            <label>
              Mã phiếu nguồn
              <input
                name="registration"
                required
                defaultValue={mode === "copy" ? activeRegistrationKey : ""}
                placeholder="Nhập mã phiếu, ví dụ: YC-260806-000123"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button type="submit" className="button button-primary">
              Tải dữ liệu để sao chép
            </button>
          </form>
        </details>
      </div>
    </section>
  );
}

function buildInitialData(
  source: SourceRegistration,
  mode: RegistrationMode,
  userId: string,
  instructorIds: Set<string>,
): BasicMedicalRegistrationInitialData {
  const sessions = [...source.sessions]
    .sort((a, b) => a.session_number - b.session_number)
    .map((session) => ({
      date: mode === "copy" ? "" : (session.schedule?.schedule_date ?? ""),
      startTime: session.schedule?.start_time.slice(0, 5) ?? "",
      endTime: session.schedule?.end_time.slice(0, 5) ?? "",
      lessonTitle: session.lesson_title,
      teachingLecturerId: session.teaching_lecturer_id,
    }));
  return {
    mode,
    sourceRegistrationId: source.id,
    sourceRegistrationCode: source.registration_code,
    academicYear: source.academic_year,
    semester: source.semester,
    startDate: mode === "copy" ? "" : source.start_date,
    endDate: mode === "copy" ? "" : source.end_date,
    courseId: source.course_id,
    roomId: source.room_id,
    studentCount: source.student_count,
    responsibleLecturerId:
      mode === "copy" && instructorIds.has(userId)
        ? userId
        : source.responsible_lecturer_id,
    note: source.note ?? "",
    sessions,
  };
}

export default async function NewBasicMedicalSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; registration?: string }>;
}) {
  const [viewer, query] = await Promise.all([getViewer(), searchParams]);
  const {
    supabase,
    userId,
    fullName,
    roles,
    roomTypes,
    allowBasicMedicalAccess,
    canImportSchedules,
    canManagePersonnel,
  } = viewer;
  const roomTypeCodes = roomTypes.map(({ code }) => code);
  if (
    !canCreateBasicMedicalSchedules(
      roles,
      roomTypeCodes,
      allowBasicMedicalAccess,
    )
  ) {
    redirect(
      canViewBasicMedicalSchedules(roles, roomTypeCodes)
        ? "/basic-medical/schedules"
        : "/dashboard",
    );
  }

  const mode: RegistrationMode | null =
    query.mode === "copy" || query.mode === "edit" ? query.mode : null;
  const rawRegistrationKey = String(query.registration ?? "").trim();
  const requestedId = /^[0-9a-f-]{36}$/i.test(rawRegistrationKey)
    ? rawRegistrationKey
    : "";
  const requestedCode = !requestedId
    ? normalizeBasicMedicalRegistrationCode(rawRegistrationKey)
    : null;
  const hasValidRegistrationKey = Boolean(requestedId || requestedCode);
  const sourcePromise =
    mode && hasValidRegistrationKey
      ? (() => {
          let sourceQuery = supabase
            .from("basic_medical_registrations")
            .select(sourceRegistrationSelect);
          sourceQuery = requestedId
            ? sourceQuery.eq("id", requestedId)
            : sourceQuery.eq("registration_code", requestedCode!);
          return sourceQuery.maybeSingle();
        })()
      : Promise.resolve({ data: null, error: null });

  const [
    { data: courses },
    { data: rooms },
    { data: lecturers },
    { data: profile },
    { data: optionRows },
    sourceResult,
  ] = await Promise.all([
    supabase
      .from("courses")
      .select("id, course_code, course_name")
      .eq("is_active", true)
      .eq("room_type_id", BASIC_MEDICAL_ROOM_TYPE_ID)
      .order("course_code"),
    supabase
      .from("rooms")
      .select("id, room_code, building_code, room_name, room_type_id")
      .eq("is_active", true)
      .eq("room_type_id", BASIC_MEDICAL_ROOM_TYPE_ID)
      .order("building_code")
      .order("room_code"),
    supabase.rpc("list_basic_medical_instructors"),
    supabase.from("profiles").select("email").eq("id", userId).single(),
    supabase
      .from("basic_medical_registrations")
      .select(
        "id,registration_code,created_at,created_by,start_date,end_date,registrant:profiles!basic_medical_registrations_registrant_id_fkey(full_name),course:courses(course_code),room:rooms(room_code,building_code)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    sourcePromise,
  ]);

  const canManageAll = roles.some((role) => ["admin", "staff"].includes(role));
  const registrationOptions = (optionRows ??
    []) as unknown as RegistrationOption[];
  const editOptions = registrationOptions.filter(
    (option) => canManageAll || option.created_by === userId,
  );
  const source = sourceResult.data as unknown as SourceRegistration | null;
  const canUseSource = Boolean(
    source && (mode !== "edit" || canManageAll || source.created_by === userId),
  );
  const loadError =
    mode && rawRegistrationKey && !hasValidRegistrationKey
      ? "Mã phiếu không hợp lệ. Ví dụ đúng: YC-260806-000123."
      : mode && hasValidRegistrationKey && !canUseSource
        ? mode === "edit"
          ? "Không tìm thấy phiếu hoặc bạn không có quyền điều chỉnh phiếu này."
          : "Không tìm thấy phiếu nguồn hoặc bạn không có quyền xem phiếu này."
        : mode && !hasValidRegistrationKey
          ? mode === "copy"
            ? "Vui lòng nhập mã phiếu trước khi tải dữ liệu."
            : "Vui lòng chọn một phiếu trước khi tải dữ liệu."
          : "";

  const instructorIds = new Set(
    ((lecturers ?? []) as Array<{ id: string }>).map(({ id }) => id),
  );
  const initialData =
    mode && canUseSource && source
      ? buildInitialData(source, mode, userId, instructorIds)
      : undefined;
  const editingAnotherRegistrant = Boolean(
    initialData?.mode === "edit" && source?.registrant_id !== userId,
  );

  return (
    <WorkspaceShell
      fullName={fullName}
      roles={roles}
      roomTypeCodes={roomTypeCodes}
      allowBasicMedicalAccess={allowBasicMedicalAccess}
      canImportSchedules={canImportSchedules}
      canManagePersonnel={canManagePersonnel}
      title="Tạo lịch Y cơ sở"
      description="Phiếu đăng ký nhiều buổi thực hành Y cơ sở."
    >
      <RegistrationModePicker
        mode={mode}
        activeRegistrationKey={rawRegistrationKey}
        editOptions={editOptions}
      />
      {loadError ? (
        <p className="form-error" role="alert">
          {loadError}
        </p>
      ) : null}
      <BasicMedicalRegistrationForm
        key={`${mode ?? "new"}:${source?.id ?? "empty"}`}
        courses={(courses ?? []).map((course) => ({
          id: course.id,
          label: `${course.course_code} — ${course.course_name}`,
        }))}
        rooms={(rooms ?? []).map((room) => ({
          id: room.id,
          label: `${room.room_code}.${room.building_code}${room.room_name ? ` — ${room.room_name}` : ""}`,
        }))}
        lecturers={(
          (lecturers ?? []) as Array<{ id: string; full_name: string }>
        ).map((person) => ({ id: person.id, label: person.full_name }))}
        registrantId={
          editingAnotherRegistrant && source ? source.registrant_id : userId
        }
        registrantName={
          editingAnotherRegistrant && source
            ? (source.registrant?.full_name ?? "Người đăng ký")
            : fullName
        }
        registrantEmail={
          editingAnotherRegistrant && source
            ? (source.registrant?.email ?? "")
            : (profile?.email ?? "")
        }
        today={businessTodayString()}
        initialData={initialData}
      />
    </WorkspaceShell>
  );
}
