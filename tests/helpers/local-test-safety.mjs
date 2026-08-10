const LOCAL_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function assertLocalUrl(value, refusalCode) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(refusalCode);
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(refusalCode);
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !LOCAL_LOOPBACK_HOSTS.has(hostname)
  ) {
    throw new Error(refusalCode);
  }

  return parsed;
}

export function assertLocalSupabaseTarget(supabaseUrl) {
  return assertLocalUrl(supabaseUrl, "REFUSING_DESTRUCTIVE_NON_LOCAL_SUPABASE");
}

export function assertLocalPlaywrightTarget(playwrightBaseUrl) {
  if (playwrightBaseUrl === undefined) return;
  return assertLocalUrl(
    playwrightBaseUrl,
    "REFUSING_DESTRUCTIVE_NON_LOCAL_PLAYWRIGHT",
  );
}

export function assertLocalDestructiveTestTarget({
  supabaseUrl,
  playwrightBaseUrl,
}) {
  assertLocalSupabaseTarget(supabaseUrl);
  assertLocalPlaywrightTarget(playwrightBaseUrl);
}
