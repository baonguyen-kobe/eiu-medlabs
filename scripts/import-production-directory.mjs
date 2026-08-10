import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "@e965/xlsx";

const APPLY = process.argv.includes("--apply");
const envFileIndex = process.argv.indexOf("--env-file");
if (envFileIndex >= 0) {
  const envFile = process.argv[envFileIndex + 1];
  if (!envFile) throw new Error("Thiếu đường dẫn sau --env-file.");
  const pulledEnv = parseEnv(
    readFileSync(resolve(process.cwd(), envFile), "utf8"),
  );
  Object.assign(
    process.env,
    Object.fromEntries(
      Object.entries(pulledEnv).map(([key, value]) => [key, value.trim()]),
    ),
  );
}
const workbookPath = resolve(process.cwd(), "..", "Import.xlsx");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !secretKey) {
  throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SECRET_KEY.");
}

const workbook = XLSX.read(readFileSync(workbookPath), {
  type: "buffer",
  cellDates: true,
});

function rowsFromSheet(name) {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Không tìm thấy sheet "${name}".`);
  return XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return text(value).toLowerCase();
}

function normalizeCode(value) {
  return text(value).toUpperCase();
}

const roleMap = new Map([
  ["giảng viên", "lecturer"],
  ["staff", "staff"],
  ["nhân viên", "staff"],
  ["quản trị viên", "admin"],
  ["admin", "admin"],
  ["trợ giảng", "teaching_assistant"],
  ["teaching assistant", "teaching_assistant"],
]);

const courses = rowsFromSheet("Môn")
  .map((row, index) => ({
    row: index + 2,
    courseCode: normalizeCode(row["Mã môn"]),
    courseName: text(row["Tên môn học"]),
  }))
  .filter((row) => row.courseCode || row.courseName);

const personnel = rowsFromSheet("Nhân sự")
  .map((row, index) => ({
    row: index + 2,
    email: normalizeEmail(row.Email),
    fullName: text(row["Họ tên"]),
    phone: text(row["SĐT"]) || null,
    title: text(row["Chức danh"]) || null,
    role: roleMap.get(text(row["Vai trò"]).toLocaleLowerCase("vi-VN")),
    password: text(row["Mật khẩu tạm"]),
  }))
  .filter(
    (row) =>
      row.email || row.fullName || row.phone || row.title || row.password,
  );

const problems = [];
const seenCourseCodes = new Set();
for (const course of courses) {
  if (!course.courseCode)
    problems.push(`Sheet Môn dòng ${course.row}: thiếu Mã môn.`);
  if (!course.courseName)
    problems.push(`Sheet Môn dòng ${course.row}: thiếu Tên môn học.`);
  if (seenCourseCodes.has(course.courseCode)) {
    problems.push(
      `Sheet Môn dòng ${course.row}: trùng Mã môn ${course.courseCode}.`,
    );
  }
  seenCourseCodes.add(course.courseCode);
}

const seenEmails = new Set();
for (const person of personnel) {
  if (!person.email.endsWith("@eiu.edu.vn")) {
    problems.push(
      `Sheet Nhân sự dòng ${person.row}: email không thuộc @eiu.edu.vn.`,
    );
  }
  if (!person.fullName)
    problems.push(`Sheet Nhân sự dòng ${person.row}: thiếu Họ tên.`);
  if (!person.role)
    problems.push(`Sheet Nhân sự dòng ${person.row}: Vai trò không hợp lệ.`);
  if (person.password.length < 8) {
    problems.push(
      `Sheet Nhân sự dòng ${person.row}: Mật khẩu tạm phải có ít nhất 8 ký tự.`,
    );
  }
  if (seenEmails.has(person.email)) {
    problems.push(
      `Sheet Nhân sự dòng ${person.row}: trùng email ${person.email}.`,
    );
  }
  seenEmails.add(person.email);
}

if (problems.length) {
  console.error(
    JSON.stringify(
      { valid: false, problemCount: problems.length, problems },
      null,
      2,
    ),
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function selectAll(table, columns) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

const [existingCourses, existingProfiles, existingRoles] = await Promise.all([
  selectAll("courses", "id,course_code,course_name,is_active"),
  selectAll("profiles", "id,email,full_name,phone,title,is_active"),
  selectAll("user_roles", "user_id,role"),
]);

const coursesByCode = new Map(
  existingCourses.map((course) => [normalizeCode(course.course_code), course]),
);
const profilesByEmail = new Map(
  existingProfiles.map((profile) => [normalizeEmail(profile.email), profile]),
);
const rolesByUser = new Map();
for (const item of existingRoles) {
  const roles = rolesByUser.get(item.user_id) ?? new Set();
  roles.add(item.role);
  rolesByUser.set(item.user_id, roles);
}

const preview = {
  mode: APPLY ? "apply" : "dry-run",
  valid: true,
  workbook: { courses: courses.length, personnel: personnel.length },
  courses: {
    create: courses.filter((course) => !coursesByCode.has(course.courseCode))
      .length,
    update: courses.filter((course) => coursesByCode.has(course.courseCode))
      .length,
  },
  personnel: {
    create: personnel.filter((person) => !profilesByEmail.has(person.email))
      .length,
    update: personnel.filter((person) => profilesByEmail.has(person.email))
      .length,
    addRole: personnel.filter((person) => {
      const profile = profilesByEmail.get(person.email);
      return (
        profile && person.role && !rolesByUser.get(profile.id)?.has(person.role)
      );
    }).length,
  },
};

if (!APPLY) {
  console.log(JSON.stringify(preview, null, 2));
} else {
  const result = {
    ...preview,
    courses: { created: 0, updated: 0 },
    personnel: { created: 0, updated: 0, rolesAdded: 0 },
  };

  for (const course of courses) {
    const existing = coursesByCode.get(course.courseCode);
    const operation = existing
      ? supabase
          .from("courses")
          .update({
            course_code: course.courseCode,
            course_name: course.courseName,
            is_active: true,
          })
          .eq("id", existing.id)
      : supabase.from("courses").insert({
          course_code: course.courseCode,
          course_name: course.courseName,
          is_active: true,
        });
    const { error } = await operation;
    if (error)
      throw new Error(
        `Không thể nhập môn học ở dòng ${course.row}: ${error.message}`,
      );
    if (existing) result.courses.updated += 1;
    else result.courses.created += 1;
  }

  for (const person of personnel) {
    const existing = profilesByEmail.get(person.email);
    let userId = existing?.id;
    let createdUser = false;

    if (!userId) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: person.email,
        password: person.password,
        email_confirm: true,
        user_metadata: { full_name: person.fullName },
        app_metadata: { preapproved: true },
      });
      if (error || !data.user) {
        throw new Error(
          `Không thể tạo nhân sự ở dòng ${person.row}: ${error?.message ?? "Không có user trả về"}`,
        );
      }
      userId = data.user.id;
      createdUser = true;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        email: person.email,
        full_name: person.fullName,
        phone: person.phone,
        title: person.title,
        is_active: true,
      })
      .eq("id", userId);

    if (profileError) {
      if (createdUser) await supabase.auth.admin.deleteUser(userId);
      throw new Error(
        `Không thể cập nhật hồ sơ ở dòng ${person.row}: ${profileError.message}`,
      );
    }

    const hasRole = rolesByUser.get(userId)?.has(person.role);
    if (!hasRole) {
      const { error: roleError } = await supabase
        .from("user_roles")
        .upsert(
          { user_id: userId, role: person.role },
          { onConflict: "user_id,role" },
        );
      if (roleError) {
        if (createdUser) await supabase.auth.admin.deleteUser(userId);
        throw new Error(
          `Không thể gán vai trò ở dòng ${person.row}: ${roleError.message}`,
        );
      }
      result.personnel.rolesAdded += 1;
    }

    if (createdUser) result.personnel.created += 1;
    else result.personnel.updated += 1;
  }

  const [verifiedCourses, verifiedProfiles] = await Promise.all([
    selectAll("courses", "course_code"),
    selectAll("profiles", "email"),
  ]);
  const verifiedCourseCodes = new Set(
    verifiedCourses.map((course) => normalizeCode(course.course_code)),
  );
  const verifiedEmails = new Set(
    verifiedProfiles.map((profile) => normalizeEmail(profile.email)),
  );
  result.verification = {
    coursesPresent: courses.filter((course) =>
      verifiedCourseCodes.has(course.courseCode),
    ).length,
    personnelPresent: personnel.filter((person) =>
      verifiedEmails.has(person.email),
    ).length,
  };

  console.log(JSON.stringify(result, null, 2));
}
