import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) redirect("/dashboard");
  return { supabase, userId };
}

export type PersonnelAuthority = {
  configured: boolean;
  can_manage_personnel: boolean;
  is_root_administrator: boolean;
  is_secondary_personnel_manager: boolean;
};

export async function requirePersonnelManager() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data, error } = await supabase.rpc("get_personnel_authority_context");
  const authority = data as PersonnelAuthority | null;
  if (error || !authority?.configured || !authority.can_manage_personnel) {
    redirect("/dashboard");
  }
  return { supabase, userId, authority };
}
