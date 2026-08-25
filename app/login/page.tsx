import { AuthPageShell } from "@/components/auth-page-shell";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Đăng nhập",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;

  return (
    <AuthPageShell>
      <LoginForm oauthError={query.error} />
    </AuthPageShell>
  );
}
