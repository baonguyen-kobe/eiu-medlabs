"use client";

import { useActionState } from "react";
import { completePasswordChange } from "@/app/password/actions";

export function PasswordChangeForm({
  reason = "password_changed",
  title,
  description,
}: {
  reason?: string;
  title: string;
  description?: string;
}) {
  const [state, action, pending] = useActionState(completePasswordChange, null);

  return (
    <form
      action={action}
      className="login-form"
      aria-busy={pending}
      onSubmit={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      <input name="reason" type="hidden" value={reason} />
      <header className="login-form-heading">
        <h1>{title}</h1>
        {description ? (
          <p className="login-subtitle">
            <span>{description}</span>
          </p>
        ) : null}
      </header>
      <label>
        Mật khẩu mới
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          minLength={6}
          required
        />
      </label>
      <label>
        Xác nhận mật khẩu
        <input
          name="confirmation"
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          minLength={6}
          required
        />
      </label>
      {state ? (
        <p
          className={
            state.ok ? "action-feedback success" : "action-feedback error"
          }
          role={state.ok ? "status" : "alert"}
          aria-live={state.ok ? "polite" : "assertive"}
        >
          {state.message}
        </p>
      ) : null}
      <button
        className="button button-primary full-width"
        type="submit"
        aria-disabled={pending}
      >
        {pending ? "Đang cập nhật…" : "Cập nhật mật khẩu"}
      </button>
    </form>
  );
}
