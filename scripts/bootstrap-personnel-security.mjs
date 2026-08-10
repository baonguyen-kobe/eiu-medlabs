import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const dryRun = process.argv.includes("--dry-run");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const rootEmail = process.env.ROOT_ADMIN_EMAIL?.trim().toLowerCase();
const managerEmail = process.env.PERSONNEL_MANAGER_EMAIL?.trim().toLowerCase();

if (!url || !secretKey) {
  throw new Error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SECRET_KEY.");
}
if (!rootEmail || !managerEmail) {
  throw new Error("Phải cấu hình ROOT_ADMIN_EMAIL và PERSONNEL_MANAGER_EMAIL.");
}
if (rootEmail === managerEmail) {
  throw new Error(
    "Root Administrator và Personnel Manager phải là hai tài khoản khác nhau.",
  );
}

const supabase = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function resolveActiveAdmin(email, label) {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id,email,is_active")
    .ilike("email", email);
  if (error) throw error;
  if (profiles.length !== 1) {
    throw new Error(`${label}: cần tìm thấy đúng 1 profile cho ${email}.`);
  }
  const profile = profiles[0];
  if (!profile.is_active) throw new Error(`${label} phải đang hoạt động.`);
  const { data: role, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError) throw roleError;
  if (!role) throw new Error(`${label} phải có vai trò Quản trị viên.`);
  return profile;
}

const root = await resolveActiveAdmin(rootEmail, "Root Administrator");
const manager = await resolveActiveAdmin(managerEmail, "Personnel Manager");

if (dryRun) {
  console.log(
    "Dry-run thành công: hai tài khoản active, khác nhau và đều có role Admin.",
  );
  process.exit(0);
}

const { error: upsertError } = await supabase
  .from("system_security_principals")
  .upsert(
    {
      singleton: true,
      root_admin_id: root.id,
      personnel_manager_id: manager.id,
      configured_by: root.id,
    },
    { onConflict: "singleton" },
  );
if (upsertError) throw upsertError;

const { error: auditError } = await supabase.from("audit_logs").insert({
  actor_id: root.id,
  action: "personnel.security_bootstrapped",
  entity_type: "system_security_principals",
  metadata: { source: "bootstrap_script" },
});
if (auditError) throw auditError;

console.log("Bootstrap Personnel Security thành công.");
