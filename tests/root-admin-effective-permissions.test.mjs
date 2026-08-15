import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("viewer projects Admin schedule-import access as an effective permission", async () => {
  const viewer = await readFile(new URL("lib/viewer.ts", root), "utf8");

  assert.match(
    viewer,
    /canImportSchedules:\s*roles\.includes\("admin"\)\s*\|\|\s*\(profile\?\.can_import_schedules \?\? false\)/,
  );
  assert.match(
    viewer,
    /canManageEmailNotifications:\s*roles\.includes\("admin"\)\s*\|\|\s*\(roles\.includes\("staff"\)\s*&&\s*\(profile\?\.can_manage_email_notifications \?\? false\)\)/,
  );
  assert.doesNotMatch(viewer, /\.update\(\{\s*can_import_schedules:\s*true/);
});
