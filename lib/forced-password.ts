import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function redirectIfPasswordChangeRequired(
  client: SupabaseClient,
  userId: string,
) {
  const { data } = await client
    .from("profiles")
    .select("must_change_password")
    .eq("id", userId)
    .maybeSingle();
  if (data?.must_change_password) redirect("/change-password");
}

export async function assertPasswordChangeNotRequired(
  client: SupabaseClient,
  userId: string,
) {
  const { data } = await client
    .from("profiles")
    .select("must_change_password")
    .eq("id", userId)
    .maybeSingle();
  if (data?.must_change_password) throw new Error("PASSWORD_CHANGE_REQUIRED");
}
