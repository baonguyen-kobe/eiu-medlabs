import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLocalDestructiveTestTarget,
  assertLocalPlaywrightTarget,
  assertLocalSupabaseTarget,
  resolveEffectiveSupabaseTestConfig,
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

test("effective Supabase config uses local file values without runtime overrides", () => {
  const config = resolveEffectiveSupabaseTestConfig(
    {},
    {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "file-publishable",
      SUPABASE_SECRET_KEY: "file-secret",
    },
  );

  assert.equal(config.supabaseUrl, "http://127.0.0.1:54321");
  assert.equal(config.publishableKey, "file-publishable");
  assert.equal(config.secretKey, "file-secret");
  assert.doesNotThrow(() => assertLocalSupabaseTarget(config.supabaseUrl));
});

test("effective Supabase config accepts local runtime override", () => {
  const config = resolveEffectiveSupabaseTestConfig(
    { NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" },
    { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" },
  );

  assert.equal(config.supabaseUrl, "http://localhost:54321");
  assert.doesNotThrow(() => assertLocalSupabaseTarget(config.supabaseUrl));
});

test("remote runtime Supabase override wins and is refused", () => {
  const config = resolveEffectiveSupabaseTestConfig(
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "runtime-publishable",
      SUPABASE_SECRET_KEY: "runtime-secret",
    },
    {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "file-publishable",
      SUPABASE_SECRET_KEY: "file-secret",
    },
  );

  assert.equal(config.supabaseUrl, "https://example.supabase.co");
  assert.equal(config.publishableKey, "runtime-publishable");
  assert.equal(config.secretKey, "runtime-secret");
  assert.throws(
    () => assertLocalSupabaseTarget(config.supabaseUrl),
    /REFUSING_DESTRUCTIVE_NON_LOCAL_SUPABASE/,
  );
});
