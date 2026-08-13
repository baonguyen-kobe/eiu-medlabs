"use client";
import { useActionState } from "react";
import { completePasswordChange } from "@/app/password/actions";
export function PasswordChangeForm({
  reason = "password_changed",
}: {
  reason?: string;
}) {
  const [state, action, pending] = useActionState(completePasswordChange, null);
  return (
    <form action={action} className="login-form">
      <input name="reason" type="hidden" value={reason} />
      <label>
        Mật khẩu mới
        <input name="password" type="password" minLength={6} required />
      </label>
      <label>
        Xác nhận mật khẩu
        <input name="confirmation" type="password" minLength={6} required />
      </label>
      {state ? (
        <p
          className={
            state.ok ? "action-feedback success" : "action-feedback error"
          }
        >
          {state.message}
        </p>
      ) : null}
      <button className="button button-primary" disabled={pending}>
        Cập nhật mật khẩu
      </button>
    </form>
  );
}
