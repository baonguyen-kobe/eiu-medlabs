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

test("staff shift registration keeps five columns until the narrow breakpoint", () => {
  assert.match(
    registrationStyles,
    /grid-template-columns:\s*minmax\(190px, 1\.3fr\) minmax\(150px, 1fr\) minmax\(145px, auto\)\s*minmax\(220px, auto\) max-content/,
  );
  const tabletStyles = registrationStyles.slice(
    registrationStyles.indexOf("@media (max-width: 1180px)"),
    registrationStyles.indexOf("@media (max-width: 920px)"),
  );
  assert.match(
    tabletStyles,
    /grid-template-columns:\s*minmax\(160px, 1\.2fr\) minmax\(140px, 1fr\) minmax\(130px, 0\.9fr\)\s*minmax\(190px, 1\.15fr\) max-content/,
  );
  assert.doesNotMatch(tabletStyles, /grid-column|>/);
  assert.match(source, /staff-shift-registration-fields/);
});

test("all-day registration stacks only the time column", () => {
  assert.match(
    source,
    /row\.slotOption === "ALL_DAY"[\s\S]*className="staff-shift-time-stack"/,
  );
  assert.match(styles, /\.staff-shift-time-stack\s*\{\s*display: grid/);
  assert.match(source, /className="staff-shift-remove-row/);
});
