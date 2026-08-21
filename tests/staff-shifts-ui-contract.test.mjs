import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../components/staff-shift-roster.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const registrationSource = source.slice(
  source.indexOf("{/* TAB 2: ĐĂNG KÝ LỊCH TRỰC */}"),
  source.indexOf("{/* DIALOG 1:"),
);
const toolbarSource = source.slice(
  source.indexOf("{/* TAB 1:"),
  source.indexOf("{/* Calendar Grid"),
);
const registrationStyles = styles.slice(
  styles.indexOf(".staff-shift-registration-row-grid"),
  styles.indexOf("/* Basic Medical registration"),
);

test("staff shifts uses the shared seven-column month calendar structure", () => {
  assert.match(source, /period-calendar-month staff-shift-month-calendar/);
  assert.match(source, /monthWeeks\.map\(/);
  assert.match(source, /"--calendar-day-count": week\.length/);
});

test("staff shifts week roster uses the shared period calendar structure", () => {
  const weekCalendarSource = source.slice(
    source.indexOf(
      'className="period-calendar period-calendar-week staff-shift-period-calendar"',
    ),
    source.indexOf("{/* TAB 2:"),
  );

  assert.doesNotMatch(weekCalendarSource, /<table/);
  assert.doesNotMatch(source, /staff-shift-week-calendar/);
  assert.match(
    weekCalendarSource,
    /className="period-calendar period-calendar-week staff-shift-period-calendar"/,
  );
  assert.match(weekCalendarSource, /className="period-grid"/);
  assert.match(weekCalendarSource, /className={`period-day-heading/);
  assert.match(weekCalendarSource, /period-label period-label-shift/);
  assert.match(weekCalendarSource, /period-cell period-cell-shift/);
  const periodDefinition = source.slice(
    source.indexOf("const staffShiftPeriods = ["),
    source.indexOf("function getDayOfWeekLabel"),
  );
  assert.deepEqual(
    [...periodDefinition.matchAll(/\["([A-Z_]+)",/g)].map((match) => match[1]),
    ["MORNING", "AFTERNOON"],
  );
  assert.doesNotMatch(weekCalendarSource, /L\u1ecbch h\u1ecdc/);
});

test("staff shift registration exposes only constrained shift slots and times", () => {
  assert.doesNotMatch(registrationSource, /value="CUSTOM"/);
  assert.doesNotMatch(registrationSource, /Ghi chú/);
  assert.match(registrationSource, /RegistrationTimeControls/);
  assert.match(source, /MORNING_SHIFT_ALLOWED_TIMES/);
  assert.match(source, /AFTERNOON_SHIFT_ALLOWED_TIMES/);
  assert.match(source, /staff-shift-time-stack/);
});

test("staff shifts roster uses the shared date navigation pattern", () => {
  assert.match(toolbarSource, /className="date-nav"/);
  assert.match(toolbarSource, /className="today-button"/);
  assert.match(toolbarSource, /"Tháng này" : "Tuần này"/);
  assert.match(
    toolbarSource,
    /className=\{view === "week" \? "selected" : ""\}/,
  );
  assert.match(
    toolbarSource,
    /className=\{view === "month" \? "selected" : ""\}/,
  );
  assert.doesNotMatch(toolbarSource, /button-secondary/);
  assert.doesNotMatch(toolbarSource, /Hôm nay/);
});

test("staff shift registration keeps its desktop columns until the narrow breakpoint", () => {
  assert.match(
    registrationStyles,
    /grid-template-columns:\s*minmax\(132px, 1\.1fr\) minmax\(150px, 1fr\) minmax\(130px, auto\)\s*minmax\(280px, auto\) max-content max-content/,
  );
  const tabletStyles = registrationStyles.slice(
    registrationStyles.indexOf("@media (max-width: 1180px)"),
    registrationStyles.indexOf("@media (max-width: 920px)"),
  );
  assert.match(
    tabletStyles,
    /grid-template-columns:\s*minmax\(132px, 1fr\) minmax\(150px, 1fr\) minmax\(126px, auto\)\s*minmax\(280px, auto\) max-content max-content/,
  );
  assert.doesNotMatch(tabletStyles, /grid-column|>/);
  assert.match(source, /staff-shift-registration-fields/);
  assert.match(
    registrationStyles,
    /\.staff-shift-assignee\s*\{[\s\S]*max-width: 190px/,
  );
});

test("registration time controls stay compact without clipping clock values", () => {
  assert.match(
    registrationStyles,
    /\.staff-shift-time-picker\s*\{\s*width: 108px/,
  );
  assert.doesNotMatch(
    registrationStyles,
    /\.staff-shift-time-picker\s*\{\s*width: 86px/,
  );
  assert.match(
    registrationStyles,
    /\.staff-shift-time-picker \.time-picker-input\s*\{[\s\S]*padding: 0 8px 0 30px/,
  );
});

test("all-day registration stacks only the time column and keeps delete in-row", () => {
  assert.match(
    source,
    /row\.slotOption === "ALL_DAY"[\s\S]*className="staff-shift-time-stack"/,
  );
  assert.match(styles, /\.staff-shift-time-stack\s*\{\s*display: grid/);
  assert.match(
    registrationSource,
    /freeformRows\.length > 1[\s\S]*staff-shift-delete-button[\s\S]*Trash2[\s\S]*X\u00f3a/,
  );
  assert.doesNotMatch(source, /staff-shift-remove-row/);
  assert.doesNotMatch(registrationStyles, /position:\s*absolute/);
});
