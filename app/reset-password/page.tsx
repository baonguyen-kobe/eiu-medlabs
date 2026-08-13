import { PasswordChangeForm } from "@/components/password-change-form";
export default function ResetPasswordPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Đặt lại mật khẩu</h1>
        <PasswordChangeForm reason="password_recovered" />
      </section>
    </main>
  );
}
