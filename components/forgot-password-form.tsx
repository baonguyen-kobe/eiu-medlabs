"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordRecovery } from "@/app/password/actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    requestPasswordRecovery,
    null,
  );

  return (
    <form action={action} className="login-form" aria-busy={pending}>
      <header className="login-form-heading">
        <h1>Quên mật khẩu</h1>
      </header>
      <label>
        Email đăng nhập
        <input
          name="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          required
        />
      </label>
      {state ? (
        <p className="action-feedback success" role="status" aria-live="polite">
          {state.message}
        </p>
      ) : null}
      <button
        className="button button-primary full-width"
        type="submit"
        disabled={pending}
      >
        {pending ? "Đang gửi…" : "Gửi hướng dẫn"}
      </button>
      <Link className="button button-secondary full-width" href="/login">
        Quay lại đăng nhập
      </Link>
    </form>
  );
}
