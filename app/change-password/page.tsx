import { AuthPageShell } from "@/components/auth-page-shell";
import { PasswordChangeForm } from "@/components/password-change-form";

export default function ChangePasswordPage() {
  return (
    <AuthPageShell>
      <PasswordChangeForm
        title="Đổi mật khẩu bắt buộc"
        description="Hãy tạo mật khẩu mới để tiếp tục."
      />
    </AuthPageShell>
  );
}
