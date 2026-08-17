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

test("Basic Medical Lecturer Edit: UI component gates edit control to creator or Admin and preserves read-only for others", async () => {
  const listSource = await fs.readFile(listComponentPath, "utf8");

  assert.ok(listSource.includes("function SessionLecturerCell"));
  assert.match(
    listSource,
    /canEdit =\s*!isCancelled &&\s*\(isAdmin \|\| registration\.created_by === viewerId\) &&\s*instructors\.length > 0/,
    "Gated to creator or admin when not cancelled",
  );
  assert.match(
    listSource,
    /if \(!canEdit\) \{\s*return <td>\{session\.teaching\?\.full_name \?\? "—"\}<\/td>;\s*\}/,
    "Renders read-only plain text for unauthorized users",
  );
  assert.match(
    listSource,
    /ConfirmDialog[\s\S]*Đổi giảng viên giảng dạy\/hướng dẫn[\s\S]*Lưu thay đổi/,
    "Uses ConfirmDialog with confirmation prompt and explicit save",
  );
});
