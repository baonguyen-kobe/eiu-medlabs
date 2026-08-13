export class PasswordStateUnavailableError extends Error {
  constructor() {
    super("PASSWORD_STATE_UNAVAILABLE");
  }
}

export function resolvePasswordChangeState(result) {
  if (
    result.error ||
    !result.data ||
    typeof result.data.must_change_password !== "boolean"
  ) {
    throw new PasswordStateUnavailableError();
  }
  return result.data.must_change_password;
}
