import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../components/staff-shift-roster.tsx", import.meta.url),
  "utf8",
);
const registrationSource = source.slice(
  source.indexOf("{/* TAB 2: ĐĂNG KÝ LỊCH TRỰC */}"),
  source.indexOf("{/* DIALOG 1:"),
);

test("staff shifts uses the shared seven-column month calendar structure", () => {
  assert.match(source, /period-calendar-month staff-shift-month-calendar/);
  assert.match(source, /monthWeeks\.map\(/);
  assert.match(source, /"--calendar-day-count": week\.length/);
});

test("staff shift registration exposes only constrained shift slots and times", () => {
  assert.doesNotMatch(registrationSource, /value="CUSTOM"/);
  assert.doesNotMatch(registrationSource, /Ghi chú/);
  assert.match(registrationSource, /RegistrationTimeControls/);
  assert.match(source, /MORNING_SHIFT_ALLOWED_TIMES/);
  assert.match(source, /AFTERNOON_SHIFT_ALLOWED_TIMES/);
  assert.match(source, /staff-shift-time-stack/);
});
