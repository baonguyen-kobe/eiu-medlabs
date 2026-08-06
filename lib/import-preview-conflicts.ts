export type ImportPreviewCandidate = {
  courseCode: string;
  endTime: string | null;
  lecturerId: string | null;
  roomId: string | null;
  scheduleDate: string | null;
  startTime: string | null;
};

export type ExistingScheduleForPreview = {
  course_code_snapshot: string;
  end_time: string;
  lecturer_2_id: string | null;
  lecturer_id: string | null;
  room_id: string;
  schedule_date: string;
  start_time: string;
};

function time(value: string) {
  const match = String(value).match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : null;
}

function course(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function classifyImportPreviewCandidate(
  candidate: ImportPreviewCandidate,
  schedules: ExistingScheduleForPreview[],
): { conflict: boolean; duplicate: boolean } {
  if (
    !candidate.roomId ||
    !candidate.scheduleDate ||
    !candidate.startTime ||
    !candidate.endTime
  ) {
    return { conflict: false, duplicate: false };
  }
  let conflict = false;
  for (const existing of schedules) {
    if (existing.schedule_date !== candidate.scheduleDate) continue;
    const existingStart = time(existing.start_time);
    const existingEnd = time(existing.end_time);
    if (!existingStart || !existingEnd) continue;
    const overlaps =
      candidate.startTime < existingEnd && candidate.endTime > existingStart;
    if (!overlaps) continue;
    if (
      existing.room_id === candidate.roomId &&
      existingStart === candidate.startTime &&
      existingEnd === candidate.endTime &&
      course(existing.course_code_snapshot) === course(candidate.courseCode)
    ) {
      return { conflict: false, duplicate: true };
    }
    conflict ||=
      existing.room_id === candidate.roomId ||
      Boolean(
        candidate.lecturerId &&
        [existing.lecturer_id, existing.lecturer_2_id].includes(
          candidate.lecturerId,
        ),
      );
  }
  return { conflict, duplicate: false };
}
