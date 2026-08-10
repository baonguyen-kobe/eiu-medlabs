"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processPendingScheduleEmails } from "@/lib/email-notifications";

export type ActionResult = {
  ok: boolean;
  message: string;
};

function friendlyDatabaseError(message: string): string {
  if (message.includes("BASIC_MEDICAL_REGISTRATION_EDIT_REQUIRED")) {
    return "Phòng và số sinh viên phải được điều chỉnh tại Phiếu Y cơ sở.";
  }
  if (message.includes("BASIC_MEDICAL_TEACHING_LECTURER_REQUIRED")) {
    return "Mỗi buổi Y cơ sở phải có đúng một giảng viên giảng dạy/hướng dẫn.";
  }
  if (message.includes("BASIC_MEDICAL_SESSION_DATE_OUTSIDE_REGISTRATION")) {
    return "Ngày học phải nằm trong thời gian đăng ký của Phiếu Y cơ sở.";
  }
  if (message.includes("BASIC_MEDICAL_SESSION_ALREADY_CONFIRMED")) {
    return "Buổi học đã được ký xác nhận nên không thể đổi lịch hoặc giảng viên.";
  }
  if (message.includes("BASIC_MEDICAL_LINKED_SCHEDULE_INCONSISTENT")) {
    return "Lịch và Phiếu Y cơ sở chưa đồng bộ. Vui lòng liên hệ quản trị hệ thống.";
  }
  if (message.includes("SCHEDULE_CONFLICT")) {
    return "Phòng hoặc giảng viên đã có lịch trùng trong thời gian này.";
  }
  if (message.includes("INVALID_CLASS_DETAILS")) {
    return "Vui lòng kiểm tra lại ngày, giờ, phòng và số sinh viên.";
  }
  if (
    message.includes("CLASS_UPDATE_FORBIDDEN") ||
    message.includes("CLASS_DETAILS_UPDATE_FORBIDDEN")
  ) {
    return "Bạn không có quyền sửa các nội dung này.";
  }
  if (message.includes("CLASS_NOT_AVAILABLE")) {
    return "Lớp này không còn khả dụng hoặc đã đủ 2 giảng viên.";
  }
  if (message.includes("CLASS_ALREADY_CLAIMED")) {
    return "Bạn đã là giảng viên của lớp này.";
  }
  if (message.includes("LECTURER_SCHEDULE_CONFLICT")) {
    return "Bạn đã có lịch giảng trùng với thời gian của lớp này.";
  }
  if (
    message.includes("ROOM_TYPE_SCOPE_REQUIRED") ||
    message.includes("CLASS_MANAGEMENT_SCOPE_REQUIRED")
  ) {
    return "Bạn không được phân công Loại phòng của lớp này.";
  }
  if (message.includes("ROOM_OR_LECTURER_SCHEDULE_CONFLICT")) {
    return "Không thể đổi ngày vì phòng hoặc một giảng viên có lịch giao nhau trong khung giờ này.";
  }
  if (message.includes("CLASS_DATE_CHANGE_FORBIDDEN")) {
    return "Bạn không có quyền đổi ngày học của lớp này.";
  }
  if (message.includes("CLASS_DELETE_FORBIDDEN")) {
    return "Bạn không có quyền xóa lớp này.";
  }
  if (message.includes("LECTURER_ROOM_TYPE_MISMATCH")) {
    return "Giảng viên được chọn không thuộc Loại phòng của lớp.";
  }
  if (message.includes("LECTURER_ROLE_REQUIRED")) {
    return "Tài khoản cần có vai trò Giảng viên để đăng ký lớp.";
  }
  if (message.includes("CLASS_WITHDRAWAL_CLOSED")) {
    return "Không thể rút lớp sau khi lớp đã bắt đầu.";
  }
  if (message.includes("NOT_CLASS_OWNER")) {
    return "Bạn chỉ có thể rút lớp do chính mình đăng ký.";
  }
  if (message.includes("STAFF_SHIFT_CONFLICT")) {
    return "Ca trực này trùng với một ca bạn đã đăng ký.";
  }
  if (message.includes("SHIFT_REGISTRATION_CLOSED")) {
    return "Chỉ có thể đăng ký ca trực chưa bắt đầu.";
  }
  if (message.includes("STAFF_ROLE_REQUIRED")) {
    return "Tài khoản cần có vai trò Staff để tự đăng ký ca.";
  }
  if (message.includes("SHIFT_CANCELLATION_CLOSED")) {
    return "Không thể hủy ca đã bắt đầu hoặc đã kết thúc.";
  }
  if (message.includes("NOT_SHIFT_OWNER")) {
    return "Bạn chỉ có thể hủy ca trực của chính mình.";
  }
  if (message.includes("STAFF_SHIFT_PATTERN_CONFLICT")) {
    return "Lịch cố định này bị trùng với một ca đã đăng ký trong cùng thứ.";
  }
  if (
    message.includes("INVALID_SHIFT_WEEKDAY") ||
    message.includes("INVALID_SHIFT_TYPE")
  ) {
    return "Thứ hoặc loại ca không hợp lệ.";
  }
  if (message.includes("NOT_SHIFT_PATTERN_OWNER")) {
    return "Bạn chỉ có thể xóa lịch cố định của chính mình.";
  }
  return "Không thể hoàn tất thao tác. Vui lòng kiểm tra dữ liệu và thử lại.";
}

export async function claimClass(scheduleId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  }

  const { error } = await supabase.rpc("claim_class", {
    target_schedule_id: scheduleId,
  });
  if (error) {
    return { ok: false, message: friendlyDatabaseError(error.message) };
  }

  revalidatePath("/dashboard");
  revalidatePath("/class-schedules");
  revalidatePath("/classes/open");
  revalidatePath("/classes/mine");
  return { ok: true, message: "Đăng ký lớp thành công." };
}

export async function registerOwnShift(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) {
    return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  }

  const date = String(formData.get("shift_date") ?? "");
  const start = String(formData.get("start_time") ?? "");
  const end = String(formData.get("end_time") ?? "");
  const shiftType = String(formData.get("shift_type") ?? "").trim();
  const templateId = String(formData.get("shift_template_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!date || !start || !end || !shiftType) {
    return { ok: false, message: "Vui lòng điền đủ ngày, giờ và loại ca." };
  }

  const { error } = await supabase.rpc("register_own_shift", {
    target_date: date,
    target_start: start,
    target_end: end,
    target_shift_type: shiftType,
    target_template_id: templateId || null,
    target_note: note || null,
  });
  if (error) {
    return { ok: false, message: friendlyDatabaseError(error.message) };
  }

  revalidatePath("/dashboard");
  revalidatePath("/staff-shifts");
  return { ok: true, message: "Đã đăng ký ca trực của bạn." };
}

export async function withdrawClass(scheduleId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  const { error } = await supabase.rpc("withdraw_class", {
    target_schedule_id: scheduleId,
  });
  if (error) {
    return { ok: false, message: friendlyDatabaseError(error.message) };
  }

  revalidatePath("/dashboard");
  revalidatePath("/class-schedules");
  revalidatePath("/classes/open");
  revalidatePath("/classes/mine");
  return {
    ok: true,
    message: "Đã rút khỏi lớp. Lớp được mở lại cho giảng viên khác.",
  };
}

export async function deleteClassSchedule(
  scheduleId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };

  const { error } = await supabase.rpc("delete_skills_lab_class_schedule", {
    target_schedule_id: scheduleId,
  });

  if (error) {
    return {
      ok: false,
      message: friendlyDatabaseError(error.message),
    };
  }

  revalidateScheduleViews();
  after(processPendingScheduleEmails);
  return { ok: true, message: "Đã xóa lớp khỏi hệ thống." };
}

export async function cancelOwnShift(shiftId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_own_shift", {
    target_shift_id: shiftId,
  });
  if (error) {
    return { ok: false, message: friendlyDatabaseError(error.message) };
  }

  revalidatePath("/dashboard");
  revalidatePath("/staff-shifts");
  return { ok: true, message: "Đã hủy ca trực của bạn." };
}

export async function registerOwnShiftPattern(
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const weekday = Number(formData.get("weekday"));
  const shiftType = String(formData.get("shift_type") ?? "").trim();
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim();
  const effectiveTo = String(formData.get("effective_to") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (
    !Number.isInteger(weekday) ||
    weekday < 1 ||
    weekday > 7 ||
    !shiftType ||
    !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)
  ) {
    return {
      ok: false,
      message: "Vui lòng chọn thứ, loại ca và ngày hiệu lực bắt đầu.",
    };
  }
  if (effectiveTo && effectiveTo < effectiveFrom) {
    return {
      ok: false,
      message: "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.",
    };
  }

  const { error } = await supabase.rpc("register_own_shift_pattern", {
    target_weekday: weekday,
    target_shift_type: shiftType,
    target_effective_from: effectiveFrom,
    target_effective_to: effectiveTo || null,
    target_note: note || null,
  });
  if (error)
    return { ok: false, message: friendlyDatabaseError(error.message) };

  revalidatePath("/staff-shifts");
  return { ok: true, message: "Đã đăng ký lịch trực cố định." };
}

export async function deleteShiftPattern(
  patternId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_own_shift_pattern", {
    target_pattern_id: patternId,
  });
  if (error)
    return { ok: false, message: friendlyDatabaseError(error.message) };

  revalidatePath("/staff-shifts");
  return { ok: true, message: "Đã xóa lịch trực cố định." };
}

async function requireAdminAction() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  const { data: adminRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return adminRole ? { supabase, userId } : null;
}

function revalidateScheduleViews() {
  revalidatePath("/dashboard");
  revalidatePath("/class-schedules");
  revalidatePath("/classes/open");
  revalidatePath("/classes/mine");
  revalidatePath("/staff-shifts");
  revalidatePath("/basic-medical/schedules");
}

async function requireClassManagerAction() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "staff", "teaching_assistant"]);
  return roles?.length ? { supabase, userId } : null;
}

export async function adminAssignClassLecturer(
  scheduleId: string,
  lecturerIds: string[],
): Promise<ActionResult> {
  const context = await requireClassManagerAction();
  if (!context)
    return { ok: false, message: "Bạn không có quyền phân công giảng viên." };
  const uniqueLecturerIds = [...new Set(lecturerIds.filter(Boolean))];
  if (
    uniqueLecturerIds.length > 2 ||
    uniqueLecturerIds.length !== lecturerIds.filter(Boolean).length
  ) {
    return {
      ok: false,
      message: "Mỗi lớp chỉ có tối đa 2 giảng viên khác nhau.",
    };
  }
  const { error } = await context.supabase.rpc("assign_class_lecturers", {
    target_schedule_id: scheduleId,
    target_lecturer_ids: uniqueLecturerIds,
  });
  if (error) {
    return { ok: false, message: friendlyDatabaseError(error.message) };
  }
  revalidateScheduleViews();
  return { ok: true, message: "Đã cập nhật giảng viên nhận lớp." };
}

export async function rescheduleClass(
  scheduleId: string,
  scheduleDate: string,
): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
    return { ok: false, message: "Ngày học không hợp lệ." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("reschedule_class", {
    target_schedule_id: scheduleId,
    target_schedule_date: scheduleDate,
  });
  if (error)
    return { ok: false, message: friendlyDatabaseError(error.message) };
  revalidateScheduleViews();
  after(processPendingScheduleEmails);
  return { ok: true, message: "Đã đổi ngày học và xếp email thông báo." };
}

export async function updateClassSchedule(
  scheduleId: string,
  values: {
    scheduleDate: string;
    startTime: string;
    endTime: string;
    roomId: string;
    studentCount: number;
    lecturerIds: string[];
  },
): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.scheduleDate))
    return { ok: false, message: "Ngày học không hợp lệ." };
  if (
    !/^\d{2}:\d{2}$/.test(values.startTime) ||
    !/^\d{2}:\d{2}$/.test(values.endTime) ||
    values.endTime <= values.startTime
  ) {
    return { ok: false, message: "Thời gian học không hợp lệ." };
  }
  if (!Number.isInteger(values.studentCount) || values.studentCount < 1)
    return { ok: false, message: "Số sinh viên phải từ 1 trở lên." };
  const uniqueLecturerIds = [...new Set(values.lecturerIds.filter(Boolean))];
  if (
    uniqueLecturerIds.length > 2 ||
    uniqueLecturerIds.length !== values.lecturerIds.filter(Boolean).length
  ) {
    return {
      ok: false,
      message: "Mỗi lớp chỉ có tối đa 2 giảng viên khác nhau.",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_class_schedule_details", {
    target_schedule_id: scheduleId,
    target_schedule_date: values.scheduleDate,
    target_start_time: values.startTime,
    target_end_time: values.endTime,
    target_room_id: values.roomId,
    target_student_count: values.studentCount,
    target_lecturer_ids: uniqueLecturerIds,
  });
  if (error)
    return { ok: false, message: friendlyDatabaseError(error.message) };
  revalidateScheduleViews();
  after(processPendingScheduleEmails);
  return { ok: true, message: "Đã lưu thay đổi lớp học." };
}

export async function adminCancelClass(
  scheduleId: string,
): Promise<ActionResult> {
  const context = await requireAdminAction();
  if (!context) return { ok: false, message: "Chỉ Admin được hủy lớp." };
  const { error } = await context.supabase.rpc("cancel_class_schedule", {
    target_schedule_id: scheduleId,
  });
  if (error)
    return { ok: false, message: friendlyDatabaseError(error.message) };
  revalidateScheduleViews();
  after(processPendingScheduleEmails);
  return { ok: true, message: "Đã hủy lớp và lưu lại lịch sử thay đổi." };
}

export async function adminReassignShift(
  shiftId: string,
  staffId: string,
): Promise<ActionResult> {
  const context = await requireAdminAction();
  if (!context) return { ok: false, message: "Chỉ Admin được đổi lịch trực." };
  const { data: eligibleRole } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", staffId)
    .in("role", ["staff", "admin"])
    .limit(1)
    .maybeSingle();
  if (!eligibleRole)
    return { ok: false, message: "Người được chọn phải là Staff hoặc Admin." };

  const { data, error } = await context.supabase
    .from("staff_shifts")
    .update({ staff_id: staffId, registration_source: "admin_assigned" })
    .eq("id", shiftId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return {
      ok: false,
      message:
        error?.code === "23P01"
          ? "Nhân sự bị trùng ca trực."
          : "Không thể đổi người trực.",
    };
  }
  revalidateScheduleViews();
  return { ok: true, message: "Đã đổi người trực." };
}

export async function adminCreateShift(
  shiftDate: string,
  shiftType: "MORNING" | "AFTERNOON",
  staffId: string,
): Promise<ActionResult> {
  const context = await requireAdminAction();
  if (!context) return { ok: false, message: "Chỉ Admin được tạo lịch trực." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)) {
    return { ok: false, message: "Ngày trực không hợp lệ." };
  }

  const { data: eligibleRole } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", staffId)
    .in("role", ["staff", "admin"])
    .limit(1)
    .maybeSingle();
  if (!eligibleRole)
    return { ok: false, message: "Người được chọn phải là Staff hoặc Admin." };

  const startTime = shiftType === "MORNING" ? "08:30" : "13:30";
  const endTime = shiftType === "MORNING" ? "11:30" : "16:30";
  const { error } = await context.supabase.from("staff_shifts").insert({
    staff_id: staffId,
    shift_date: shiftDate,
    start_time: startTime,
    end_time: endTime,
    shift_type: shiftType,
    shift_template_id: null,
    note: null,
    status: "scheduled",
    registration_source: "admin_assigned",
    created_by: context.userId,
  });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "23P01"
          ? "Nhân sự bị trùng ca trực."
          : "Không thể tạo lịch trực.",
    };
  }

  revalidateScheduleViews();
  return { ok: true, message: "Đã tạo lịch trực mới." };
}
