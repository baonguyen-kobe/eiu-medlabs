import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const email = (
  process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@medlabs.local"
).toLowerCase();
const fullName = process.env.BOOTSTRAP_ADMIN_NAME ?? "Quản trị viên";
const nursingRoomTypeId = "40000000-0000-0000-0000-000000000001";

if (!supabaseUrl || !secretKey || !password) {
  throw new Error(
    "Thiếu NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY hoặc BOOTSTRAP_ADMIN_PASSWORD.",
  );
}

const supabase = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let adminUser = null;
for (let page = 1; !adminUser; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({
    page,
    perPage: 1000,
  });
  if (error) throw error;
  adminUser =
    data.users.find((user) => user.email?.toLowerCase() === email) ?? null;
  if (data.users.length < 1000) break;
}

if (!adminUser) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { preapproved: true },
  });
  if (error || !data.user)
    throw error ?? new Error("Không tạo được tài khoản admin.");
  adminUser = data.user;
} else {
  const { data, error } = await supabase.auth.admin.updateUserById(
    adminUser.id,
    {
      password,
      email_confirm: true,
      user_metadata: { ...adminUser.user_metadata, full_name: fullName },
      app_metadata: { ...adminUser.app_metadata, preapproved: true },
    },
  );
  if (error || !data.user)
    throw error ?? new Error("Không cập nhật được tài khoản admin.");
  adminUser = data.user;
}

const { error: profileError } = await supabase.from("profiles").upsert({
  id: adminUser.id,
  email,
  full_name: fullName,
  title: "Quản trị viên",
  is_active: true,
});
if (profileError) throw profileError;

const { error: roleError } = await supabase
  .from("user_roles")
  .upsert(
    { user_id: adminUser.id, role: "admin", created_by: adminUser.id },
    { onConflict: "user_id,role" },
  );
if (roleError) throw roleError;

const { error: scopeError } = await supabase.from("profile_room_types").upsert(
  {
    profile_id: adminUser.id,
    room_type_id: nursingRoomTypeId,
    created_by: adminUser.id,
  },
  { onConflict: "profile_id,room_type_id" },
);
if (scopeError) throw scopeError;

console.log(
  JSON.stringify({ ok: true, id: adminUser.id, email, roles: ["admin"] }),
);
