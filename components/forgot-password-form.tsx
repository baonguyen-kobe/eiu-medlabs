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
    <form
      action={action}
      className="login-form"
      aria-busy={pending}
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
    >
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
      <div className="auth-form-actions forgot-password-action-area">
        {state ? (
          <p
            className="action-feedback success"
            role="status"
            aria-live="polite"
          >
            {state.message}
          </p>
        ) : null}
        <div className="forgot-password-actions">
          <button
            className="button button-primary full-width"
            type="submit"
            aria-disabled={pending}
          >
            {pending ? "Đang gửi…" : "Gửi hướng dẫn"}
          </button>
          <Link className="button button-secondary full-width" href="/login">
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </form>
  );
}
