import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
export default function ForgotPasswordPage() {
  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Quên mật khẩu</h1>
        <ForgotPasswordForm />
        <Link href="/login">Quay lại đăng nhập</Link>
      </section>
    </main>
  );
}
