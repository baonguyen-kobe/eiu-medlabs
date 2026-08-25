import { AuthPageShell } from "@/components/auth-page-shell";
import { PasswordChangeForm } from "@/components/password-change-form";

export default function ResetPasswordPage() {
  return (
    <AuthPageShell>
      <PasswordChangeForm
        reason="password_recovered"
        title="Đặt lại mật khẩu"
      />
    </AuthPageShell>
  );
}
