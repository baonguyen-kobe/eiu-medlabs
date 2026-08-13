import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [
  migration,
  schema,
  proxy,
  actions,
  forcedPassword,
  passwordActions,
  applicationUrl,
  passwordState,
  catalogManager,
] = await Promise.all([
  readFile(
    new URL(
      "../supabase/migrations/20260813022210_personnel_password_and_catalog_batches.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL(
      "../supabase/schemas/17_personnel_password_and_catalog_batches.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(new URL("../lib/supabase/proxy.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/admin/actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/forced-password.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/password/actions.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/application-url.mjs", import.meta.url), "utf8"),
  readFile(new URL("../lib/password-state.mjs", import.meta.url), "utf8"),
  readFile(
    new URL("../components/catalog-batch-manager.tsx", import.meta.url),
    "utf8",
  ),
]);

test("password operations are server-authorized, fail closed, and sanitized", () => {
  for (const source of [migration, schema]) {
    assert.match(source, /must_change_password boolean not null default false/);
    assert.match(source, /PASSWORD_RESET_NOT_AVAILABLE/);
    assert.match(source, /raw_app_meta_data/);
    assert.match(source, /encrypted_password is not null/);
    assert.match(source, /private\.can_manage_personnel\(\)/);
    assert.match(source, /private\.is_root_administrator\(\)/);
    assert.match(
      source,
      /update public\.profiles set must_change_password = true/,
    );
    assert.match(source, /clear_own_must_change_password/);
    assert.match(
      source,
      /revoke all on function public\.begin_personnel_password_reset/,
    );
    assert.doesNotMatch(source, /recovery_link|service_role|target_password/);
  }
  assert.match(proxy, /PASSWORD_STATE_UNAVAILABLE/);
  assert.match(proxy, /status: 503/);
  assert.match(forcedPassword, /PasswordStateUnavailableError/);
  assert.match(passwordState, /!result\.data/);
  assert.match(
    passwordState,
    /typeof result\.data\.must_change_password !== "boolean"/,
  );
  assert.match(forcedPassword, /PASSWORD_CHANGE_REQUIRED/);
  assert.match(proxy, /PASSWORD_CHANGE_REQUIRED/);
  assert.match(actions, /auth\.admin\.updateUserById/);
  assert.match(actions, /reserve_personnel_password_change/);
  assert.match(passwordActions, /providers\.has\("email"\)/);
  assert.match(passwordActions, /passwordRecoveryRedirectUrl/);
  assert.doesNotMatch(passwordActions, /NEXT_PUBLIC_SITE_URL/);
  assert.match(applicationUrl, /NEXT_PUBLIC_APP_URL/);
  assert.match(applicationUrl, /APPLICATION_ORIGIN_UNAVAILABLE/);
  assert.doesNotMatch(actions, /resetPasswordForEmail\(/);
});

test("catalog writes use authenticated batch RPCs and protect type history", () => {
  for (const source of [migration, schema]) {
    assert.match(source, /set_catalog_rooms_active/);
    assert.match(source, /set_catalog_courses_active/);
    assert.match(source, /ROOM_TYPE_CHANGE_HAS_HISTORY/);
    assert.match(source, /COURSE_TYPE_CHANGE_HAS_HISTORY/);
    assert.match(source, /basic_medical_room_inventory/);
    assert.match(source, /protect_catalog_type_history/);
    assert.match(source, /apply_catalog_course_import/);
    assert.match(source, /apply_catalog_room_import/);
    assert.match(source, /for update/);
  }
  assert.match(actions, /rpc\("set_catalog_rooms_active"/);
  assert.match(actions, /rpc\("set_catalog_courses_active"/);
  assert.match(actions, /rpc\("update_catalog_room"/);
  assert.match(actions, /rpc\("update_catalog_course"/);
  assert.match(actions, /rpc\("apply_catalog_course_import"/);
  assert.match(actions, /rpc\("apply_catalog_room_import"/);
  assert.match(actions, /rpc\("update_catalog_rooms_batch"/);
  assert.match(actions, /rpc\("update_catalog_courses_batch"/);
  assert.match(catalogManager, /updateCatalogRoomsBatch/);
  assert.match(catalogManager, /updateCatalogCoursesBatch/);
  assert.match(catalogManager, /Xóa/);
  assert.match(catalogManager, /Chỉnh sửa từng mục đã chọn/);
});
