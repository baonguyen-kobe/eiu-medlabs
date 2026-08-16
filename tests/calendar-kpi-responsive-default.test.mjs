import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Skills equipment KPI counts only active classes without an effective request", async () => {
  const overview = await source("app/dashboard/page.tsx");
  const calendar = await source("components/dashboard.tsx");
  const skills = await source("app/class-schedules/page.tsx");
  const basicMedical = await source("app/basic-medical/schedules/page.tsx");
  const staffShifts = await source("app/staff-shifts/page.tsx");

  assert.match(
    overview,
    /import \{ normalizeCalendarEquipmentRequest \} from "@\/lib\/equipment-calendar-request"/,
  );
  assert.match(
    overview,
    /equipment_requests \(id, status\)[\s\S]*\.neq\("schedule_status", "cancelled"\)/,
  );
  assert.match(
    overview,
    /monthClassesWithoutEffectiveEquipmentRequest = monthClasses\.filter\([\s\S]*normalizeCalendarEquipmentRequest\([\s\S]*schedule\.equipment_requests[\s\S]*equipmentRequest\.status === "cancelled"/,
  );
  assert.match(
    overview,
    /kpi-card kpi-violet[\s\S]*Số lớp chưa có đăng ký thiết bị[\s\S]*monthClassesWithoutEffectiveEquipmentRequest\.length/,
  );
  assert.doesNotMatch(overview, /Ca trực Kho trong tháng/);
  assert.doesNotMatch(overview, /Lớp của tôi trong tháng/);

  assert.match(
    skills,
    /equipment_requests \(id, status\)[\s\S]*normalizeCalendarEquipmentRequest[\s\S]*schedule\.equipment_requests/,
  );
  assert.match(
    calendar,
    /loadedClassEvents = events\.filter\(\(event\) => event\.type === "class"\)/,
  );
  assert.match(
    calendar,
    /classesWithoutEffectiveEquipmentRequest = loadedClassEvents\.filter\([\s\S]*inactiveCalendarEquipmentRequestStatuses\.has\(\s*event\.equipmentRequest\.status/,
  );
  assert.match(calendar, /calendarKind === "basic_medical"/);
  assert.match(calendar, /Tổng số sinh viên/);
  assert.match(calendar, /Số lớp chưa có đăng ký thiết bị/);
  assert.doesNotMatch(basicMedical, /equipment_requests/);
  assert.doesNotMatch(staffShifts, /Số lớp chưa có đăng ký thiết bị/);
});

test("Skills and Basic Medical calendars share a one-time responsive default without overriding URL choice", async () => {
  const calendar = await source("components/dashboard.tsx");
  const skills = await source("app/class-schedules/page.tsx");
  const basicMedical = await source("app/basic-medical/schedules/page.tsx");
  const staffShifts = await source("app/staff-shifts/page.tsx");
  const overview = await source("app/dashboard/page.tsx");
  const master = await source("docs/UI_DESIGN_SYSTEM_V2_MASTER.md");

  assert.match(
    calendar,
    /responsiveCalendarDefaultMedia = "\(max-width: 760px\)"/,
  );
  assert.match(calendar, /hasExplicitView = false/);
  assert.match(
    calendar,
    /useSyncExternalStore\([\s\S]*getInitialCalendarViewportDefault[\s\S]*getServerCalendarViewportDefault/,
  );
  assert.match(
    calendar,
    /const view = hasExplicitView[\s\S]*viewLabels\[initialView\][\s\S]*manualView[\s\S]*useCompactCalendarDefault \? "Danh sách" : "Tuần"/,
  );
  assert.match(calendar, /setManualView\(nextView\)/);
  assert.doesNotMatch(calendar, /addEventListener\(\s*["']resize/);

  for (const page of [skills, basicMedical]) {
    assert.match(
      page,
      /const hasExplicitView = \["month", "week", "list"\]\.includes\([\s\S]*initialView=\{viewMode\}[\s\S]*hasExplicitView=\{hasExplicitView\}/,
    );
  }
  assert.match(basicMedical, /calendarKind="basic_medical"/);
  assert.doesNotMatch(overview, /hasExplicitView/);
  assert.doesNotMatch(staffShifts, /hasExplicitView/);
  assert.match(
    master,
    /Responsive calendar default[\s\S]*`view=week`, `view=month`, hoặc `view=list`[\s\S]*max-width: 760px[\s\S]*không lắng nghe\s+resize[\s\S]*`Tổng quan` và `Lịch trực` không thừa hưởng/s,
  );
});
