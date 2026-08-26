import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardPage = readFileSync(
  new URL("../app/dashboard/page.tsx", import.meta.url),
  "utf8",
);
const classSchedulesPage = readFileSync(
  new URL("../app/class-schedules/page.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

function shellSegment(source) {
  return source.slice(
    source.indexOf("<WorkspaceShell"),
    source.indexOf('<section className="kpi-grid"'),
  );
}

test("Skills Lab actions move from dashboard to class schedules without changing hrefs", () => {
  const dashboardShell = shellSegment(dashboardPage);

  assert.doesNotMatch(dashboardShell, /schedule-entry\/import/);
  assert.doesNotMatch(dashboardShell, /schedule-entry\/new/);
  assert.match(classSchedulesPage, /const skillsActions = canCreate/);
  assert.match(classSchedulesPage, /href="\/schedule-entry\/import"/);
  assert.match(classSchedulesPage, /href="\/schedule-entry\/new"/);
  assert.match(classSchedulesPage, /skillsActions=\{skillsActions\}/);
});

test("narrow class pickers place the existing create link before the selector", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.class-picker-row\s*\{[\s\S]*flex-direction:\s*column/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.class-picker-row \.create-class-button\s*\{[\s\S]*order:\s*-1/,
  );
});
