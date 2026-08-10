import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [dashboardSource, schedulesPageSource] = await Promise.all([
  readFile(new URL("../components/dashboard.tsx", import.meta.url), "utf8"),
  readFile(
    new URL("../app/basic-medical/schedules/page.tsx", import.meta.url),
    "utf8",
  ),
]);

test("linked Basic Medical editing receives server-derived scoped authority", () => {
  assert.match(
    schedulesPageSource,
    /canEditBasicMedicalSchedules=\{canManageBasicMedicalWorkspace\(/,
  );
  assert.match(
    dashboardSource,
    /calendarKind === "basic_medical"\s*\? canEditBasicMedicalSchedules/,
  );
});

test("linked Basic Medical editor clears and submits only its primary lecturer", () => {
  assert.match(
    dashboardSource,
    /event\.basicMedicalRegistrationId\s*\?\s*\[event\.personId\]/,
  );
  assert.match(
    dashboardSource,
    /lecturerIds:\s*selectedEvent\.basicMedicalRegistrationId\s*\?\s*\[selectedLecturerIds\[0\]\]/,
  );
});
