import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  TIME_PICKER_HOURS,
  TIME_PICKER_MINUTES,
  isValidTime,
} from "../lib/time-picker-utils.ts";

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

test("isValidTime rejects invalid time values without silent normalization", () => {
  const invalidTimes = [
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

test("all migrated forms and components use TimePicker and contain no type=time", () => {
  const filesToCheck = [
    "components/schedule-form.tsx",
    "components/class-registration-list.tsx",
    "components/dashboard.tsx",
    "app/admin/shift-templates/page.tsx",
  ];

  for (const relativePath of filesToCheck) {
    const content = readFileSync(
      new URL(`../${relativePath}`, import.meta.url),
      "utf8",
    );
    assert.equal(
      content.includes('type="time"'),
      false,
      `File ${relativePath} must not contain type="time"`,
    );
    assert.equal(
      content.includes("TimePicker"),
      true,
      `File ${relativePath} must import and use TimePicker`,
    );
  }
});
