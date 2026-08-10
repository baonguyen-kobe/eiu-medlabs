import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLocalDestructiveTestTarget,
  assertLocalPlaywrightTarget,
  assertLocalSupabaseTarget,
} from "./helpers/local-test-safety.mjs";

test("local loopback Supabase targets are allowed", () => {
  for (const url of [
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://[::1]:54321",
  ]) {
    assert.doesNotThrow(() => assertLocalSupabaseTarget(url));
  }
});

test("remote, missing, and invalid Supabase targets are refused", () => {
  for (const url of [undefined, "not-a-url", "https://example.supabase.co"]) {
    assert.throws(
      () => assertLocalSupabaseTarget(url),
      /REFUSING_DESTRUCTIVE_NON_LOCAL_SUPABASE/,
    );
  }
});

test("local or default Playwright targets are allowed", () => {
  assert.doesNotThrow(() => assertLocalPlaywrightTarget(undefined));
  assert.doesNotThrow(() =>
    assertLocalPlaywrightTarget("http://localhost:3000"),
  );
});

test("explicit remote Playwright target is refused before destructive tests", () => {
  assert.throws(
    () =>
      assertLocalDestructiveTestTarget({
        supabaseUrl: "http://127.0.0.1:54321",
        playwrightBaseUrl: "https://example.com",
      }),
    /REFUSING_DESTRUCTIVE_NON_LOCAL_PLAYWRIGHT/,
  );
});
