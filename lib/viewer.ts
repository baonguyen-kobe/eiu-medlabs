import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole =
  "admin" | "staff" | "lecturer" | "teaching_assistant" | "viewer";

export async function getViewer() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const [
    { data: profile },
    { data: roleRows },
    { data: allRoomTypeRows },
    { data: assignedRoomTypeRows },
    { data: personnelAuthority },
    { data: basicMedicalAuthority },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, title, allow_basic_medical_access, can_import_schedules",
      )
      .eq("id", userId)
      .single(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase
      .from("room_types")
      .select("id, code, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("profile_room_types")
      .select("room_types!inner(id,code,name,is_active)")
      .eq("profile_id", userId)
      .eq("room_types.is_active", true),
    supabase.rpc("get_personnel_authority_context"),
    supabase.rpc("get_basic_medical_authority_context"),
  ]);

  const roles = (roleRows ?? []).map(({ role }) => role as AppRole);
  const assignedRoomTypes = (assignedRoomTypeRows ?? []).flatMap((row) => {
    const roomType = row.room_types as unknown as {
      id: string;
      code: string;
      name: string;
    } | null;
    return roomType ? [roomType] : [];
  });
  const roomTypes = (
    roles.includes("admin") ? (allRoomTypeRows ?? []) : assignedRoomTypes
  ) as Array<{
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
    roles,
    roomTypes,
    allowBasicMedicalAccess: profile?.allow_basic_medical_access ?? false,
    canImportSchedules: profile?.can_import_schedules ?? false,
    canManagePersonnel: Boolean(
      (personnelAuthority as { can_manage_personnel?: boolean } | null)
        ?.can_manage_personnel,
    ),
    canManageBasicMedical: Boolean(
      (
        basicMedicalAuthority as {
          can_manage_basic_medical?: boolean;
        } | null
      )?.can_manage_basic_medical,
    ),
  };
}
