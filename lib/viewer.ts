import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "lecturer" | "staff" | "importer" | "viewer";

export async function getViewer() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const [{ data: profile }, { data: roleRows }, { data: roomTypeRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, title, allow_basic_medical_access")
        .eq("id", userId)
        .single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("room_types")
        .select("id, code, name")
        .eq("is_active", true)
        .order("name"),
    ]);

  const roomTypes = (roomTypeRows ?? []) as Array<{
    id: string;
    code: string;
    name: string;
  }>;

  return {
    supabase,
    userId,
    email: String(claimsData.claims.email ?? "")
      .trim()
      .toLowerCase(),
    fullName:
      profile?.full_name || String(claimsData.claims.email ?? "Người dùng"),
    title: profile?.title ?? null,
    roles: (roleRows ?? []).map(({ role }) => role as AppRole),
    roomTypes,
    allowBasicMedicalAccess: profile?.allow_basic_medical_access ?? false,
  };
}
