import { PasswordChangeForm } from "@/components/password-change-form";
export default function ChangePasswordPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Đổi mật khẩu bắt buộc</h1>
        <p>Hãy tạo mật khẩu mới để tiếp tục.</p>
        <PasswordChangeForm />
      </section>
    </main>
  );
}
