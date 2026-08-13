"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { passwordRecoveryRedirectUrl } from "@/lib/application-url.mjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function passwordValid(password: string) {
  return password.length >= 6 && password.length <= 128;
}

export async function requestPasswordRecovery(
  _: { ok: boolean; message: string } | null,
  formData: FormData,
) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (email && /^\S+@\S+\.\S+$/.test(email)) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (profile) {
      const { data } = await admin.auth.admin.getUserById(profile.id);
      const providers = new Set([
        data.user?.app_metadata?.provider,
        ...(data.user?.app_metadata?.providers ?? []),
        ...(data.user?.identities ?? []).map((identity) => identity.provider),
      ]);
      if (providers.has("email")) {
        try {
          const supabase = await createClient();
          const requestHeaders = await headers();
          const host = requestHeaders.get("host");
          const requestOrigin =
            requestHeaders.get("origin") ??
            (host
              ? `${requestHeaders.get("x-forwarded-proto") ?? "http"}://${host}`
              : undefined);
          await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: passwordRecoveryRedirectUrl(process.env, requestOrigin),
          });
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== "APPLICATION_ORIGIN_UNAVAILABLE"
          ) {
            console.error("password.recovery.request_failed", {
              code: error instanceof Error ? error.name : "UNKNOWN",
            });
          }
        }
      }
    }
  }
  return {
    ok: true,
    message: "Nếu tài khoản hỗ trợ mật khẩu, hướng dẫn đặt lại đã được gửi.",
  };
}

export async function completePasswordChange(
  _: { ok: boolean; message: string } | null,
  formData: FormData,
) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const reason = String(formData.get("reason") ?? "password_changed");
  if (!passwordValid(password) || password !== confirmation)
    return { ok: false, message: "Mật khẩu phải khớp và có ít nhất 6 ký tự." };
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const providers = new Set([
    userData.user?.app_metadata?.provider,
    ...(userData.user?.app_metadata?.providers ?? []),
    ...(userData.user?.identities ?? []).map((identity) => identity.provider),
  ]);
  if (!providers.has("email")) {
    return { ok: false, message: "Google-only account cannot set a password." };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: "Không thể cập nhật mật khẩu." };
  const { error: flagError } = await supabase.rpc(
    "clear_own_must_change_password",
    {
      target_reason:
        reason === "password_recovered"
          ? "password_recovered"
          : "password_changed",
    },
  );
  if (flagError)
    return {
      ok: false,
      message: "Mật khẩu đã đổi; vui lòng đăng nhập lại để hoàn tất.",
    };
  redirect("/dashboard");
}
