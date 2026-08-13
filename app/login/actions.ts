"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error?: string;
};

const BOOTSTRAP_ADMIN_EMAIL = "admin@medlabs.local";

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const identifier = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const email = identifier === "admin" ? BOOTSTRAP_ADMIN_EMAIL : identifier;
  const password = String(formData.get("password") ?? "");

  if (!identifier || !password) {
    return { error: "Vui lòng nhập đầy đủ ID/email và mật khẩu." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    console.error("[auth-login] Supabase sign-in failed", {
      code: error?.code,
      status: error?.status,
      message: error?.message,
    });
    return { error: "ID/email hoặc mật khẩu chưa đúng." };
  }

  const [{ data: profile }, { count: roleCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_active,must_change_password")
      .eq("id", data.user.id)
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("role", { count: "exact", head: true })
      .eq("user_id", data.user.id),
  ]);

  if (!profile?.is_active || !roleCount) {
    await supabase.auth.signOut();
    return {
      error:
        "Tài khoản chưa được tạo hoặc chưa được cấp vai trò trong Nhân sự.",
    };
  }

  if (profile.must_change_password) redirect("/change-password");

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
