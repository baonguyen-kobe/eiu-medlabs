"use client";
import { useActionState } from "react";
import { requestPasswordRecovery } from "@/app/password/actions";
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    requestPasswordRecovery,
    null,
  );
  return (
    <form action={action} className="login-form">
      <label>
        Email đăng nhập
        <input name="email" type="email" required />
      </label>
      {state ? (
        <p className="action-feedback success">{state.message}</p>
      ) : null}
      <button className="button button-primary" disabled={pending}>
        Gửi hướng dẫn
      </button>
    </form>
  );
}
