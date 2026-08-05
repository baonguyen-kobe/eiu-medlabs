"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CalendarDays, Clock3, Save } from "@/components/icons";
import { createScheduleDraft } from "@/app/schedule-entry/new/actions";
import { SearchableCombobox } from "@/components/searchable-combobox";

const initialCreateScheduleState = {
  ok: false,
  message: "",
};

type Course = {
  id: string;
  course_code: string;
  course_name: string;
};

type Room = {
  id: string;
  room_code: string;
  building_code: string;
  room_name: string | null;
};

type Lecturer = {
  id: string;
  full_name: string;
};

export function ScheduleForm({
  courses,
  rooms,
  lecturers,
  canAssignLecturer,
  scope,
  returnTo,
}: {
  courses: Course[];
  rooms: Room[];
  lecturers: Lecturer[];
  canAssignLecturer: boolean;
  scope: "skills_lab" | "basic_medical";
  returnTo?: string;
}) {
  const [state, formAction, pending] = useActionState(
    createScheduleDraft,
    initialCreateScheduleState,
  );

  return (
    <form className="schedule-form" action={formAction} autoComplete="off">
      <input type="hidden" name="scope" value={scope} />
      {returnTo ? (
        <input type="hidden" name="return_to" value={returnTo} />
      ) : null}
      {state.message ? (
        <p className={state.ok ? "form-success" : "form-error"} role="status">
          {state.message}
        </p>
      ) : null}

      <section>
        <div className="form-section-title">
          <div className="form-section-title-line">
            <span className="form-section-number">01</span>
            <h2 className="standard-section-heading">Môn học</h2>
          </div>
          <p>Chọn từ danh mục để dùng đúng mã và tên môn học.</p>
        </div>
        <div className="form-grid two">
          <label>
            Môn học *
            <SearchableCombobox
              ariaLabel="Tìm và chọn môn học"
              name="course_id"
              options={courses.map((course) => ({
                value: course.id,
                label: `${course.course_code} — ${course.course_name}`,
                keywords: `${course.course_code} ${course.course_name}`,
              }))}
              placeholder="Gõ mã hoặc tên môn học…"
              required
            />
          </label>
          <label>
            Số sinh viên *
            <input
              name="student_count"
              type="number"
              min="1"
              step="1"
              defaultValue="1"
              required
            />
          </label>
        </div>
        {canAssignLecturer ? (
          <div className="lecturer-comboboxes">
            <label>
              Giảng viên 1
              <SearchableCombobox
                ariaLabel="Tìm và chọn giảng viên thứ nhất"
                emptyLabel="Chưa chọn giảng viên"
                name="lecturer_ids"
                options={lecturers.map((lecturer) => ({
                  value: lecturer.id,
                  label: lecturer.full_name,
                }))}
                placeholder="Gõ tên giảng viên…"
              />
            </label>
            <label>
              Giảng viên 2
              <SearchableCombobox
                ariaLabel="Tìm và chọn giảng viên thứ hai"
                emptyLabel="Không có giảng viên thứ hai"
                name="lecturer_ids"
                options={lecturers.map((lecturer) => ({
                  value: lecturer.id,
                  label: lecturer.full_name,
                }))}
                placeholder="Gõ tên giảng viên…"
              />
            </label>
          </div>
        ) : (
          <p className="field-note">
            Lịch được tạo chưa phân công giảng viên. Admin có thể phân công sau
            khi rà soát.
          </p>
        )}
      </section>

      <section>
        <div className="form-section-title">
          <div className="form-section-title-line">
            <span className="form-section-number">02</span>
            <h2 className="standard-section-heading">Phòng & thời gian</h2>
          </div>
          <p>Database sẽ chặn trùng phòng và trùng lịch giảng viên.</p>
        </div>
        <div className="form-grid four">
          <label>
            Phòng *
            <select name="room_id" defaultValue="" required>
              <option value="" disabled>
                Chọn phòng
              </option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.room_code}.{room.building_code}
                  {room.room_name ? ` — ${room.room_name}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ngày học *
            <span className="field-icon">
              <CalendarDays size={16} />
              <input name="schedule_date" type="date" required />
            </span>
          </label>
          <label>
            Giờ bắt đầu *
            <span className="field-icon">
              <Clock3 size={16} />
              <input
                name="start_time"
                type="time"
                defaultValue="07:30"
                required
              />
            </span>
          </label>
          <label>
            Giờ kết thúc *
            <span className="field-icon">
              <Clock3 size={16} />
              <input
                name="end_time"
                type="time"
                defaultValue="11:30"
                required
              />
            </span>
          </label>
        </div>
      </section>

      <section>
        <div className="form-section-title">
          <div className="form-section-title-line">
            <span className="form-section-number">03</span>
            <h2 className="standard-section-heading">Ghi chú</h2>
          </div>
          <p>Thông tin nội bộ bổ sung nếu cần.</p>
        </div>
        <label>
          Ghi chú
          <textarea name="note" rows={4} placeholder="Nhập ghi chú…" />
        </label>
      </section>

      <footer>
        <Link
          className="button button-secondary"
          href={returnTo ?? "/dashboard"}
        >
          Hủy
        </Link>
        <button
          className="button button-primary"
          type="submit"
          disabled={pending}
        >
          <Save size={16} /> {pending ? "Đang lưu…" : "Tạo lịch"}
        </button>
      </footer>
    </form>
  );
}
