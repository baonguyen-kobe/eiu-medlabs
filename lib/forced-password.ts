import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PasswordStateUnavailableError,
  resolvePasswordChangeState,
} from "@/lib/password-state.mjs";

export { PasswordStateUnavailableError, resolvePasswordChangeState };

export async function getPasswordChangeState(
  client: SupabaseClient,
  userId: string,
) {
  const result = await client
    .from("profiles")
    .select("must_change_password")
    .eq("id", userId)
    .maybeSingle();
  return resolvePasswordChangeState(result);
}

export async function redirectIfPasswordChangeRequired(
  client: SupabaseClient,
  userId: string,
) {
  if (await getPasswordChangeState(client, userId)) {
    redirect("/change-password");
  }
}

export async function assertPasswordChangeNotRequired(
  client: SupabaseClient,
  userId: string,
) {
  if (await getPasswordChangeState(client, userId)) {
    throw new Error("PASSWORD_CHANGE_REQUIRED");
  }
}
