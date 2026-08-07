import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createAdminUser(email, role) {
  const { data: user, error } = await supabase.auth.admin.createUser({
    email: email,
    password: "LocalAdmin123!",
    email_confirm: true,
  });
  if (error && error.code !== "email_exists") throw error;

  const targetEmail = error ? email : user.user.email;
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", targetEmail);
  if (profiles && profiles.length > 0) {
    const profileId = profiles[0].id;
    await supabase
      .from("user_roles")
      .upsert({ user_id: profileId, role: role });
    if (role === "lecturer") {
      await supabase.from("profile_room_types").upsert({
        profile_id: profileId,
        room_type_id: "40000000-0000-0000-0000-000000000001",
      });
    }
  }
}

async function run() {
  try {
    await createAdminUser("admin@campus.local", "admin");
    await createAdminUser("hr@campus.local", "staff");
    await createAdminUser("lecturer@campus.local", "lecturer");
    console.log("Test users created");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
