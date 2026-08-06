import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyImportPreviewCandidate,
  classifyImportPreviewCandidatesInOrder,
} from "../lib/import-preview-conflicts.ts";

const existing = {
  course_code_snapshot: "NUR 207",
  room_id: "room-a",
  schedule_date: "2039-08-13",
  start_time: "07:30:00",
  end_time: "09:30:00",
  lecturer_id: "lecturer-a",
  lecturer_2_id: null,
};

test("preview nhận lịch manual trùng business key là duplicate", () => {
  assert.deepEqual(
    classifyImportPreviewCandidate(
      {
        courseCode: "NUR207",
        roomId: "room-a",
        scheduleDate: "2039-08-13",
        startTime: "07:30",
        endTime: "09:30",
        lecturerId: null,
      },
      [existing],
    ),
    { duplicate: true, conflict: false },
  );
});

test("preview phân biệt overlap phòng và overlap giảng viên là conflict", () => {
  const roomConflict = classifyImportPreviewCandidate(
    {
      courseCode: "NUR 101",
      roomId: "room-a",
      scheduleDate: "2039-08-13",
      startTime: "08:30",
      endTime: "10:30",
      lecturerId: null,
    },
    [existing],
  );
  const lecturerConflict = classifyImportPreviewCandidate(
    {
      courseCode: "NUR 101",
      roomId: "room-b",
      scheduleDate: "2039-08-13",
      startTime: "08:30",
      endTime: "10:30",
      lecturerId: "lecturer-a",
    },
    [existing],
  );
  assert.deepEqual(roomConflict, { duplicate: false, conflict: true });
  assert.deepEqual(lecturerConflict, { duplicate: false, conflict: true });
});

test("preview trong file giữ dòng hợp lệ đầu tiên và phân loại các dòng sau theo thứ tự", () => {
  const base = {
    courseCode: "NUR 207",
    roomId: "room-a",
    scheduleDate: "2039-08-13",
    startTime: "07:30",
    endTime: "09:30",
    lecturerId: "lecturer-a",
  };
  const results = classifyImportPreviewCandidatesInOrder([
    base,
    { ...base },
    { ...base, courseCode: "NUR 101", startTime: "08:30", endTime: "10:30" },
    { ...base, roomId: "room-b", startTime: "09:30", endTime: "10:30" },
    { ...base, roomId: "room-b", scheduleDate: "2039-08-14" },
  ]);

  assert.deepEqual(results, [
    { duplicate: false, conflict: false },
    { duplicate: true, conflict: false },
    { duplicate: false, conflict: true },
    { duplicate: false, conflict: false },
    { duplicate: false, conflict: false },
  ]);
});

test("preview trong file không cho dòng invalid chặn dòng hợp lệ phía sau", () => {
  const candidate = {
    courseCode: "NUR 207",
    roomId: "room-a",
    scheduleDate: "2039-08-13",
    startTime: "07:30",
    endTime: "09:30",
    lecturerId: "lecturer-a",
  };
  assert.deepEqual(
    classifyImportPreviewCandidatesInOrder([
      { ...candidate, eligible: false },
      candidate,
    ]),
    [
      { duplicate: false, conflict: false },
      { duplicate: false, conflict: false },
    ],
  );
});
