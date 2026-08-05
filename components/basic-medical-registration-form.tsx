"use client";
import Link from "next/link";
import {
  type FormEvent,
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createBasicMedicalRegistration,
  updateBasicMedicalRegistration,
} from "@/app/basic-medical/new/actions";
import {
  BASIC_MEDICAL_END_TIMES,
  BASIC_MEDICAL_START_TIMES,
  isValidBasicMedicalSessionTime,
} from "@/lib/business-time";
type Option = { id: string; label: string };
type Session = {
  key: number;
  date: string;
  startTime: string;
  endTime: string;
  lessonTitle: string;
  teachingLecturerId: string;
};

export type BasicMedicalRegistrationInitialData = {
  mode: "copy" | "edit";
  sourceRegistrationId: string;
  sourceRegistrationCode: string;
  academicYear: string;
  semester: string;
  startDate: string;
  endDate: string;
  courseId: string;
  roomId: string;
  studentCount: number;
  responsibleLecturerId: string;
  note: string;
  sessions: Array<Omit<Session, "key">>;
};

function suggestAcademicYear(dateString: string) {
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match ? new Date(`${dateString}T12:00:00+07:00`) : new Date();
  const year = match ? Number(match[1]) : date.getFullYear();
  const month = match ? Number(match[2]) : date.getMonth() + 1;
  return month >= 10 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export function BasicMedicalRegistrationForm({
  courses,
  rooms,
  lecturers,
  registrantName,
  registrantEmail,
  registrantId,
  today,
  initialData,
}: {
  courses: Option[];
  rooms: Option[];
  lecturers: Option[];
  registrantName: string;
  registrantEmail: string;
  registrantId: string;
  today: string;
  initialData?: BasicMedicalRegistrationInitialData;
}) {
  const submitAction =
    initialData?.mode === "edit"
      ? updateBasicMedicalRegistration
      : createBasicMedicalRegistration;
  const [state, action, pending] = useActionState(submitAction, {
    ok: false,
    message: "",
  });
  const feedbackRef = useRef<HTMLDivElement>(null);
  const registrantIsInstructor = lecturers.some(
    (lecturer) => lecturer.id === registrantId,
  );
  const defaultInstructorId = registrantIsInstructor ? registrantId : "";
  const [responsible, setResponsible] = useState(
    initialData?.responsibleLecturerId ?? defaultInstructorId,
  );
  const [startDate, setStartDate] = useState(initialData?.startDate ?? "");
  const [endDate, setEndDate] = useState(initialData?.endDate ?? "");
  const [semester, setSemester] = useState(initialData?.semester ?? "");
  const [courseId, setCourseId] = useState(initialData?.courseId ?? "");
  const [roomId, setRoomId] = useState(initialData?.roomId ?? "");
  const [studentCount, setStudentCount] = useState(
    initialData ? String(initialData.studentCount) : "",
  );
  const [note, setNote] = useState(initialData?.note ?? "");
  const [clientError, setClientError] = useState("");
  const [academicYear, setAcademicYear] = useState(
    initialData?.academicYear ?? suggestAcademicYear(today),
  );
  const [count, setCount] = useState(initialData?.sessions.length || 1);
  const [sessions, setSessions] = useState<Session[]>(() =>
    initialData?.sessions.length
      ? initialData.sessions.map((session, index) => ({
          ...session,
          key: index + 1,
        }))
      : [
          {
            key: 1,
            date: "",
            startTime: "",
            endTime: "",
            lessonTitle: "",
            teachingLecturerId: defaultInstructorId,
          },
        ],
  );
  const allowed = useMemo(
    () => [
      ...new Map(
        lecturers
          .map((lecturer) => ({
            ...lecturer,
            label:
              lecturer.id === registrantId && lecturer.id === responsible
                ? `${lecturer.label} (Giảng viên đăng ký, phụ trách)`
                : lecturer.id === registrantId
                  ? `${lecturer.label} (Giảng viên đăng ký)`
                  : lecturer.id === responsible
                    ? `${lecturer.label} (Giảng viên phụ trách)`
                    : lecturer.label,
          }))
          .map((option) => [option.id, option]),
      ).values(),
    ],
    [lecturers, registrantId, responsible],
  );
  function resize(next: number) {
    setCount(next);
    setSessions((current) =>
      Array.from(
        { length: next },
        (_, i) =>
          current[i] ?? {
            key: i + 1,
            date: "",
            startTime: "",
            endTime: "",
            lessonTitle: "",
            teachingLecturerId: defaultInstructorId,
          },
      ),
    );
  }
  const update = (key: number, patch: Partial<Session>) =>
    setSessions((current) =>
      current.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );

  function validateBeforeSubmit(event: FormEvent<HTMLFormElement>) {
    setClientError("");
    if (endDate < startDate) {
      event.preventDefault();
      setClientError("Ngày kết thúc phải bằng hoặc sau Ngày bắt đầu.");
      return;
    }
    for (const [index, session] of sessions.entries()) {
      const number = index + 1;
      if (session.date < startDate || session.date > endDate) {
        event.preventDefault();
        setClientError(
          `Buổi ${number}: Ngày học phải nằm trong khoảng đăng ký.`,
        );
        return;
      }
      if (!isValidBasicMedicalSessionTime(session.startTime, session.endTime)) {
        event.preventDefault();
        setClientError(
          `Buổi ${number}: Giờ kết thúc phải sau Giờ bắt đầu và không quá 21:00.`,
        );
        return;
      }
    }
  }

  useEffect(() => {
    if (!state.ok) return;
    feedbackRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    feedbackRef.current?.focus({ preventScroll: true });
  }, [state.ok, state.message]);

  return (
    <form
      action={action}
      className="schedule-form external-layout-form"
      onSubmit={validateBeforeSubmit}
    >
      <input
        type="hidden"
        name="sessions"
        value={JSON.stringify(
          sessions.map((s) => ({
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
            lessonTitle: s.lessonTitle,
            teachingLecturerId: s.teachingLecturerId,
          })),
        )}
      />
      {initialData?.mode === "edit" ? (
        <input
          type="hidden"
          name="registration_id"
          value={initialData.sourceRegistrationId}
        />
      ) : null}
      {initialData ? (
        <div
          className={`equipment-form-mode-banner equipment-form-mode-${initialData.mode}`}
        >
          <strong>
            {initialData.mode === "copy"
              ? "Đang sao chép phiếu"
              : "Đang điều chỉnh phiếu"}{" "}
            #{initialData.sourceRegistrationCode}
          </strong>
        </div>
      ) : null}
      {clientError || state.message ? (
        <div
          className="basic-medical-form-feedback"
          ref={feedbackRef}
          role={state.ok && !clientError ? "status" : "alert"}
          tabIndex={-1}
        >
          <p
            className={state.ok && !clientError ? "form-success" : "form-error"}
          >
            {clientError || state.message}
          </p>
          {state.ok && !clientError ? (
            <Link className="button button-primary" href="/basic-medical/new">
              Tạo mới
            </Link>
          ) : null}
        </div>
      ) : null}
      <section>
        <div className="form-section-title">
          <div className="form-section-title-line">
            <span className="form-section-number">01</span>
            <h2>Thông tin môn học</h2>
          </div>
        </div>
        <div className="form-grid three">
          <label>
            Ngày bắt đầu *
            <input
              name="start_date"
              type="date"
              value={startDate}
              onChange={(event) => {
                const value = event.target.value;
                setStartDate(value);
                if (endDate && value && endDate < value) setEndDate("");
                setAcademicYear(suggestAcademicYear(value || today));
              }}
              required
            />
          </label>
          <label>
            Ngày kết thúc *
            <input
              name="end_date"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => setEndDate(event.target.value)}
              required
            />
          </label>
          <label>
            Học kỳ *
            <select
              name="semester"
              value={semester}
              onChange={(event) => setSemester(event.target.value)}
              required
            >
              <option value="" disabled>
                Chọn học kỳ
              </option>
              {[1, 2, 3, 4].map((n) => (
                <option key={n}>HK{n}</option>
              ))}
            </select>
          </label>
          <label>
            Năm học *
            <input
              name="academic_year"
              value={academicYear}
              onChange={(event) => setAcademicYear(event.target.value)}
              placeholder="2026-2027"
              pattern="[0-9]{4}-[0-9]{4}"
              required
            />
          </label>
          <label>
            Mã và tên môn học *
            <select
              name="course_id"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              required
            >
              <option value="" disabled>
                Chọn môn học
              </option>
              {courses.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Phòng/Lab *
            <select
              name="room_id"
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
              required
            >
              <option value="" disabled>
                Chọn phòng
              </option>
              {rooms.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Số lượng SV *
            <input
              name="student_count"
              type="number"
              min="1"
              step="1"
              value={studentCount}
              onChange={(event) => setStudentCount(event.target.value)}
              required
            />
          </label>
        </div>
      </section>
      <section>
        <div className="form-section-title">
          <div className="form-section-title-line">
            <span className="form-section-number">02</span>
            <h2>Thông tin người đăng ký</h2>
          </div>
        </div>
        <div className="form-grid three">
          <label>
            Giảng viên đăng ký
            <input value={registrantName} readOnly />
          </label>
          <label>
            Email
            <input value={registrantEmail} readOnly />
          </label>
        </div>
      </section>
      <section>
        <div className="form-section-title">
          <div className="form-section-title-line">
            <span className="form-section-number">03</span>
            <h2>Thông tin giảng viên phụ trách</h2>
          </div>
        </div>
        <div className="form-grid three">
          <label>
            Giảng viên phụ trách *
            <select
              name="responsible_lecturer_id"
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              required
            >
              <option value="">Chọn giảng viên</option>
              {lecturers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!lecturers.length ? (
          <p className="form-error" role="alert">
            Chưa có nhân sự đang hoạt động với chức danh Giảng viên thuộc loại
            phòng Y cơ sở. Vui lòng cập nhật trong mục Nhân sự.
          </p>
        ) : null}
      </section>
      <section>
        <div className="form-section-title">
          <div className="form-section-title-line">
            <span className="form-section-number">04</span>
            <h2>Thông tin đăng ký</h2>
          </div>
          <p>
            Giảng viên giảng dạy/hướng dẫn của từng buổi được chọn từ nhân sự có
            chức danh Giảng viên thuộc Y cơ sở.
          </p>
        </div>
        <label>
          Số buổi TN-TH *
          <input
            type="number"
            min="1"
            step="1"
            value={count}
            onChange={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (Number.isInteger(next) && next >= 1) resize(next);
            }}
            required
          />
        </label>
        <div className="responsive-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Ngày học *</th>
                <th>Giờ bắt đầu *</th>
                <th>Giờ kết thúc *</th>
                <th>Tên bài TN-TH *</th>
                <th>GV giảng dạy/hướng dẫn *</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={s.key}>
                  <td>{i + 1}</td>
                  <td>
                    <input
                      aria-label={`Buổi ${i + 1} - Ngày học`}
                      type="date"
                      value={s.date}
                      min={startDate || undefined}
                      max={endDate || undefined}
                      onChange={(e) => update(s.key, { date: e.target.value })}
                      required
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Buổi ${i + 1} - Giờ bắt đầu`}
                      value={s.startTime}
                      onChange={(e) =>
                        update(s.key, { startTime: e.target.value })
                      }
                      required
                    >
                      <option value="">Chọn giờ</option>
                      {BASIC_MEDICAL_START_TIMES.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={`Buổi ${i + 1} - Giờ kết thúc`}
                      value={s.endTime}
                      onChange={(e) =>
                        update(s.key, { endTime: e.target.value })
                      }
                      required
                    >
                      <option value="">Chọn giờ</option>
                      {BASIC_MEDICAL_END_TIMES.map((time) => (
                        <option key={time} value={time}>
                          {time}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      aria-label={`Buổi ${i + 1} - Tên bài TN-TH`}
                      value={s.lessonTitle}
                      onChange={(e) =>
                        update(s.key, { lessonTitle: e.target.value })
                      }
                      required
                    />
                  </td>
                  <td>
                    <select
                      aria-label={`Buổi ${i + 1} - Giảng viên giảng dạy/hướng dẫn`}
                      value={s.teachingLecturerId}
                      onChange={(e) =>
                        update(s.key, { teachingLecturerId: e.target.value })
                      }
                      required
                    >
                      <option value="">Chọn giảng viên</option>
                      {allowed.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <label>
          Ghi chú
          <textarea
            name="note"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      </section>
      <footer>
        <Link
          href="/basic-medical/schedules"
          className="button button-secondary"
        >
          Hủy
        </Link>
        <button
          type="submit"
          className="button button-primary"
          disabled={pending}
        >
          {pending
            ? "Đang lưu…"
            : initialData?.mode === "edit"
              ? "Lưu điều chỉnh"
              : "Gửi đăng ký"}
        </button>
      </footer>
    </form>
  );
}
