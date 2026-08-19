import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_TIME_PICKER_ALLOWED_VALUES,
  TIME_PICKER_HOURS,
  TIME_PICKER_MINUTES,
  getDefaultInvalidMessage,
  getHoursForAllowedValues,
  getMinutesForHour,
  isValidTime,
} from "../lib/time-picker-utils.ts";
import {
  BASIC_MEDICAL_END_TIMES,
  BASIC_MEDICAL_START_TIMES,
} from "../lib/business-time.ts";

test("TIME_PICKER_HOURS contains exactly 07 to 19 inclusive", () => {
  assert.deepEqual(TIME_PICKER_HOURS, [
    "07",
    "08",
    "09",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
  ]);
});

test("TIME_PICKER_MINUTES contains exactly 00 and 30", () => {
  assert.deepEqual(TIME_PICKER_MINUTES, ["00", "30"]);
});

test("DEFAULT_TIME_PICKER_ALLOWED_VALUES contains 26 slots from 07:00 to 19:30", () => {
  assert.equal(DEFAULT_TIME_PICKER_ALLOWED_VALUES.length, 26);
  assert.equal(DEFAULT_TIME_PICKER_ALLOWED_VALUES[0], "07:00");
  assert.equal(DEFAULT_TIME_PICKER_ALLOWED_VALUES[25], "19:30");
});

test("isValidTime accepts all canonical valid time strings (07:00 to 19:30 in 30min steps)", () => {
  const validTimes = [
    "07:00",
    "07:30",
    "08:00",
    "08:30",
    "09:00",
    "09:30",
    "10:00",
    "10:30",
    "11:00",
    "11:30",
    "12:00",
    "12:30",
    "13:00",
    "13:30",
    "14:00",
    "14:30",
    "15:00",
    "15:30",
    "16:00",
    "16:30",
    "17:00",
    "17:30",
    "18:00",
    "18:30",
    "19:00",
    "19:30",
  ];

  for (const time of validTimes) {
    assert.equal(isValidTime(time), true, `Expected ${time} to be valid`);
  }
});

test("isValidTime rejects invalid or off-grid time values (e.g. historical 08:15) without silent normalization", () => {
  const invalidTimes = [
    "08:15",
    "05:31",
    "06:30",
    "06:00",
    "07:15",
    "07:45",
    "07:31",
    "11:15",
    "12:45",
    "19:45",
    "20:00",
    "21:00",
    "00:00",
    "23:59",
    "7:30",
    "07:3",
    "07:30:00",
    "abc",
    "",
    "   ",
    null,
    undefined,
    123,
    {},
  ];

  for (const time of invalidTimes) {
    assert.equal(
      isValidTime(time),
      false,
      `Expected ${JSON.stringify(time)} to be invalid`,
    );
  }
});

test("isValidTime with BASIC_MEDICAL_START_TIMES supports 07:00 to 20:30", () => {
  assert.equal(isValidTime("07:00", BASIC_MEDICAL_START_TIMES), true);
  assert.equal(isValidTime("20:00", BASIC_MEDICAL_START_TIMES), true);
  assert.equal(isValidTime("20:30", BASIC_MEDICAL_START_TIMES), true);
  // Rejects out of range or off-grid
  assert.equal(isValidTime("08:15", BASIC_MEDICAL_START_TIMES), false);
  assert.equal(isValidTime("21:00", BASIC_MEDICAL_START_TIMES), false);
  assert.equal(isValidTime("06:30", BASIC_MEDICAL_START_TIMES), false);
  assert.equal(isValidTime("07:15", BASIC_MEDICAL_START_TIMES), false);
});

test("isValidTime with BASIC_MEDICAL_END_TIMES supports 07:30 to 21:00", () => {
  assert.equal(isValidTime("07:30", BASIC_MEDICAL_END_TIMES), true);
  assert.equal(isValidTime("20:30", BASIC_MEDICAL_END_TIMES), true);
  assert.equal(isValidTime("21:00", BASIC_MEDICAL_END_TIMES), true);
  // Rejects out of range or off-grid
  assert.equal(isValidTime("08:15", BASIC_MEDICAL_END_TIMES), false);
  assert.equal(isValidTime("07:00", BASIC_MEDICAL_END_TIMES), false);
  assert.equal(isValidTime("21:30", BASIC_MEDICAL_END_TIMES), false);
  assert.equal(isValidTime("14:15", BASIC_MEDICAL_END_TIMES), false);
});

test("getHoursForAllowedValues extracts unique sorted hours", () => {
  const defaultHours = getHoursForAllowedValues();
  assert.deepEqual(defaultHours, [
    "07",
    "08",
    "09",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
  ]);

  const basicMedicalStartHours = getHoursForAllowedValues(
    BASIC_MEDICAL_START_TIMES,
  );
  assert.deepEqual(basicMedicalStartHours, [
    "07",
    "08",
    "09",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
  ]);

  const basicMedicalEndHours = getHoursForAllowedValues(
    BASIC_MEDICAL_END_TIMES,
  );
  assert.deepEqual(basicMedicalEndHours, [
    "07",
    "08",
    "09",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
    "21",
  ]);
});

test("getMinutesForHour extracts available minutes per hour", () => {
  // Default minutes
  assert.deepEqual(getMinutesForHour("08"), ["00", "30"]);

  // Basic Medical End Time: 07 has only "30", 21 has only "00", other hours have "00" and "30"
  assert.deepEqual(getMinutesForHour("07", BASIC_MEDICAL_END_TIMES), ["30"]);
  assert.deepEqual(getMinutesForHour("08", BASIC_MEDICAL_END_TIMES), [
    "00",
    "30",
  ]);
  assert.deepEqual(getMinutesForHour("21", BASIC_MEDICAL_END_TIMES), ["00"]);
});

test("getDefaultInvalidMessage generates appropriate message", () => {
  assert.ok(getDefaultInvalidMessage().includes("07:00"));
  assert.ok(getDefaultInvalidMessage().includes("19:30"));
  assert.ok(
    getDefaultInvalidMessage(BASIC_MEDICAL_START_TIMES).includes("07:00"),
  );
  assert.ok(
    getDefaultInvalidMessage(BASIC_MEDICAL_START_TIMES).includes("20:30"),
  );
  assert.ok(
    getDefaultInvalidMessage(BASIC_MEDICAL_END_TIMES).includes("07:30"),
  );
  assert.ok(
    getDefaultInvalidMessage(BASIC_MEDICAL_END_TIMES).includes("21:00"),
  );
});

test("all migrated forms and components use TimePicker and contain no type=time or start/end selects", () => {
  const filesToCheck = [
    "components/schedule-form.tsx",
    "components/class-registration-list.tsx",
    "components/dashboard.tsx",
    "app/admin/shift-templates/page.tsx",
    "components/basic-medical-registration-form.tsx",
  ];

  for (const relativePath of filesToCheck) {
    const content = readFileSync(
      new URL(`../${relativePath}`, import.meta.url),
      "utf8",
    );
    assert.equal(
      content.includes('type="time"'),
      false,
      `Expected ${relativePath} to not contain type="time"`,
    );
    assert.ok(
      content.includes("TimePicker"),
      `Expected ${relativePath} to import and use TimePicker`,
    );
  }

  // Verify basic medical registration form does not use <select> for session startTime / endTime
  const basicMedicalFormContent = readFileSync(
    new URL(
      "../components/basic-medical-registration-form.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.equal(
    basicMedicalFormContent.includes(
      "aria-label={`Buổi ${i + 1} - Giờ bắt đầu`}\n                      value={s.startTime}",
    ),
    false,
  );
  assert.equal(
    basicMedicalFormContent.includes(
      "<select\n                      aria-label={`Buổi ${i + 1} - Giờ bắt đầu`}",
    ),
    false,
  );
});

test("TimePicker: shared icon positioning and text padding provide clear horizontal gap without overlap", () => {
  const css = readFileSync(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  );
  const component = readFileSync(
    new URL("../components/time-picker.tsx", import.meta.url),
    "utf8",
  );

  // 1. Component renders single Clock3 icon before input inside time-picker-control
  assert.match(
    component,
    /<Clock3[^>]*className="time-picker-icon"[^>]*\/>\s*<input[^>]*className="time-picker-input"/,
    "TimePicker renders single clock icon on the left followed by time input",
  );

  // 2. Icon is positioned on the left (11px)
  assert.match(
    css,
    /\.time-picker-icon\s*\{[^}]*left:\s*11px/,
    "TimePicker clock icon has left offset of 11px",
  );

  // 3. Shared input has 36px left padding (leaving a 9px gap after 16px icon)
  assert.match(
    css,
    /\.time-picker-input\s*\{[^}]*padding:\s*0\s+11px\s+0\s+36px/,
    "TimePicker input has 36px left padding for clean gap after icon",
  );

  // 4. Schedule-form container override protects .time-picker-input from container input rule resets
  assert.match(
    css,
    /\.schedule-form\s+\.time-picker-control\s+input\.time-picker-input/,
    "Schedule form protects time-picker-input padding and transparency against general input rules",
  );
});
