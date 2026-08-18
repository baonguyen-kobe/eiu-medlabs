import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const migrationPath = path.resolve(
  __dirname,
  "../supabase/migrations/20260817170000_update_basic_medical_session_teaching_lecturer.sql",
);
const schemaPath = path.resolve(
  __dirname,
  "../supabase/schemas/23_update_basic_medical_session_teaching_lecturer.sql",
);
const actionsPath = path.resolve(
  __dirname,
  "../app/basic-medical/registrations/actions.ts",
);
const pagePath = path.resolve(
  __dirname,
  "../app/basic-medical/registrations/page.tsx",
);
const listComponentPath = path.resolve(
  __dirname,
  "../components/basic-medical-registration-list.tsx",
);

test("Basic Medical Lecturer Edit: Migration and declarative schema are valid and synchronized", async () => {
  const migration = await fs.readFile(migrationPath, "utf8");
  const schema = await fs.readFile(schemaPath, "utf8");

  assert.ok(
    migration.includes(
      "create or replace function public.update_basic_medical_session_teaching_lecturer",
    ),
  );
  assert.ok(
    schema.includes(
      "create or replace function public.update_basic_medical_session_teaching_lecturer",
    ),
  );

  // Check security definer and search_path
  assert.match(migration, /security definer\s+set search_path = ''/);

  // Check authorization logic: creator or admin
  assert.match(migration, /is_admin_user := \(select private\.is_admin\(\)\)/);
  assert.match(
    migration,
    /is_creator_user := \(registration_row\.created_by = actor_id\)/,
  );
  assert.match(
    migration,
    /if not \(is_admin_user or is_creator_user\) then[\s\S]*UPDATE_FORBIDDEN/,
  );

  // Check target lecturer validation
  assert.match(
    migration,
    /private\.is_operationally_assignable\(target_teaching_lecturer_id\)/,
  );
  assert.match(migration, /roles\.role = 'lecturer'/);
  assert.match(
    migration,
    /assignments\.room_type_id = basic_medical_room_type_id/,
  );
  assert.match(migration, /raise exception 'INVALID_LECTURER'/);

  // Check mutation flag, preserve confirmation flag, and updates
  assert.match(
    migration,
    /set_config\('app\.basic_medical_registration_mutation', 'true', true\)/,
  );
  assert.match(
    migration,
    /set_config\('app\.basic_medical_preserve_confirmation_lecturer_change', 'true', true\)/,
  );
  assert.match(
    migration,
    /set_config\('app\.basic_medical_preserve_confirmation_lecturer_change', 'false', true\)/,
  );
  assert.match(
    migration,
    /update public\.basic_medical_registration_sessions[\s\S]*where id = session_row\.id/,
  );
  assert.match(
    migration,
    /update public\.class_schedules[\s\S]*set lecturer_id = target_teaching_lecturer_id[\s\S]*where id = session_row\.class_schedule_id/,
  );

  // Check trigger function redefinition with transaction-scoped preservation
  assert.match(
    migration,
    /create or replace function private\.invalidate_basic_medical_confirmation_on_schedule_change/,
  );
  assert.match(
    migration,
    /current_setting\('app\.basic_medical_preserve_confirmation_lecturer_change', true\)/,
  );

  // Check cancellation guards (session and registration)
  assert.match(migration, /REGISTRATION_CANCELLED/);
  assert.match(migration, /BASIC_MEDICAL_SESSION_CANCELLED/);
  assert.match(
    migration,
    /session_row\.cancelled_at is not null or schedule_row\.schedule_status = 'cancelled'/,
  );

  // Check audit log insertion
  assert.match(
    migration,
    /insert into public\.audit_logs[\s\S]*basic_medical_session\.update_teaching_lecturer/,
  );

  // Check grants
  assert.match(
    migration,
    /grant execute on function public\.update_basic_medical_session_teaching_lecturer\(uuid, uuid\) to authenticated/,
  );
  assert.match(
    migration,
    /revoke all on function public\.update_basic_medical_session_teaching_lecturer\(uuid, uuid\) from public, anon/,
  );

  // Ensure declarative schema matches migration logic exactly
  assert.equal(migration.trim(), schema.trim());
});

test("Basic Medical Lecturer Edit: Server action enforces auth, input validation, cancellation rejection, and path revalidation", async () => {
  const actionsSource = await fs.readFile(actionsPath, "utf8");

  assert.ok(
    actionsSource.includes(
      "export async function updateBasicMedicalSessionTeachingLecturer",
    ),
  );
  assert.match(
    actionsSource,
    /update_basic_medical_session_teaching_lecturer/,
    "Calls the RPC update_basic_medical_session_teaching_lecturer",
  );
  assert.match(
    actionsSource,
    /revalidatePath\("\/basic-medical\/registrations"\)/,
  );
  assert.match(actionsSource, /revalidatePath\("\/basic-medical\/schedules"\)/);
  assert.match(actionsSource, /revalidatePath\("\/class-schedules"\)/);
  assert.match(
    actionsSource,
    /UPDATE_FORBIDDEN[\s\S]*Chỉ người tạo phiếu hoặc Admin/,
  );
  assert.match(
    actionsSource,
    /INVALID_LECTURER[\s\S]*Giảng viên không hợp lệ hoặc không thuộc phạm vi Y cơ sở/,
  );
  assert.match(
    actionsSource,
    /BASIC_MEDICAL_SESSION_CANCELLED[\s\S]*Buổi học đã hủy, không thể thay đổi giảng viên/,
  );
});

test("Basic Medical Lecturer Edit: Page query selects created_by and fetches active instructors", async () => {
  const pageSource = await fs.readFile(pagePath, "utf8");

  assert.match(pageSource, /select\([\s\S]*created_by/);
  assert.match(pageSource, /list_basic_medical_instructors/);
  assert.match(pageSource, /instructors=\{instructors\}/);
  assert.match(pageSource, /isAdmin=\{roles\.includes\("admin"\)\}/);
});

test("Basic Medical Lecturer Edit: UI component implements inline lecturer edit UX contract", async () => {
  const listSource = await fs.readFile(listComponentPath, "utf8");

  // SessionLecturerCell exists and handles read vs edit mode
  assert.ok(listSource.includes("function SessionLecturerCell"));

  // In read mode, lecturer cell renders plain text only (no Sửa or Đổi GV button inside lecturer cell)
  assert.match(
    listSource,
    /if \(!isEditing\) \{\s*return <td>\{session\.teaching\?\.full_name \?\? "—"\}<\/td>;\s*\}/,
    "Lecturer cell is read-only text in read mode",
  );
  assert.doesNotMatch(
    listSource,
    /basic-medical-lecturer-edit-button[\s\S]*SessionLecturerCell/,
    "Sửa button is not placed inside SessionLecturerCell",
  );
  assert.doesNotMatch(
    listSource,
    />Đổi GV<\/button>/,
    "Old Đổi GV button is completely removed",
  );

  // In edit mode, lecturer cell renders select dropdown with canonical options
  assert.match(
    listSource,
    /<select[\s\S]*className="form-select basic-medical-lecturer-select"[\s\S]*value=\{selectedLecturerId\}[\s\S]*onChange=\{[\s\S]*onLecturerChange[\s\S]*>/,
    "Renders select dropdown in edit mode",
  );
  assert.match(
    listSource,
    /instructor\.title\s*\?\s*`\$\{instructor\.title\}\s*\$\{instructor\.full_name\}`\s*:\s*instructor\.full_name/,
    "Formats lecturer title and full name identically to registration form",
  );

  // Sửa button is positioned in the final action area (basic-medical-session-action-stack)
  assert.match(
    listSource,
    /<td className="basic-medical-session-action-cell">\s*<div className="basic-medical-session-action-stack">[\s\S]*<SessionStatus[\s\S]*\{canEditLecturer \? \(/,
    "Sửa button is placed in the final Trạng thái / Thao tác action stack",
  );

  // In edit mode, Sửa changes to Lưu with secondary Hủy button
  assert.match(
    listSource,
    /isEditing\s*\?\s*\([\s\S]*basic-medical-session-lecturer-actions[\s\S]*updateBasicMedicalSessionTeachingLecturer[\s\S]*basic-medical-lecturer-save-button[\s\S]*isSavingLecturer[\s\S]*Lưu[\s\S]*basic-medical-lecturer-cancel-button[\s\S]*handleCancelEditLecturer[\s\S]*Hủy/,
    "Sửa becomes Lưu in primary position with adjacent Hủy button",
  );

  // Authorization and cancellation gating
  assert.match(
    listSource,
    /canEditLecturer\s*=\s*!isCancelled\s*&&\s*!isSessionCancelled\s*&&\s*\(\s*isAdmin\s*\|\|\s*registration\.created_by\s*===\s*viewerId\s*\)\s*&&\s*instructors\.length\s*>\s*0/,
    "Gated to creator or admin when registration and session are not cancelled",
  );

  // Multi-session isolation and stable session ID
  assert.match(
    listSource,
    /isEditing =\s*editingSessionId === session\.id/,
    "Edit mode is isolated to exact stable session ID",
  );
  assert.match(
    listSource,
    /name="session_id"\s*value=\{session\.id\}/,
    "Submits exact stable session ID",
  );

  // No-change save optimization
  assert.match(
    listSource,
    /if \(selectedLecturerId === session\.teaching_lecturer_id\) \{\s*setEditingSessionId\(null\);\s*return;\s*\}/,
    "Exits edit mode cleanly without unnecessary server mutation when unchanged",
  );

  // Old lecturer ConfirmDialog removed, but administrative ConfirmDialogs preserved
  assert.doesNotMatch(
    listSource,
    /title="Đổi giảng viên giảng dạy\/hướng dẫn"/,
    "Old lecturer ConfirmDialog is removed",
  );
  assert.match(
    listSource,
    /title="Hủy buổi học Y cơ sở\?"/,
    "Preserves Hủy lớp ConfirmDialog",
  );
  assert.match(
    listSource,
    /title="Vô hiệu hóa xác nhận buổi học\?"/,
    "Preserves Vô hiệu hóa xác nhận ConfirmDialog",
  );
});
