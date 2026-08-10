export type EmailOutboxError = {
  message?: string | null;
};

const INLINE_SECRET_VALUE =
  /\b(password|secret|token|authorization|api[_-]?key)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi;
const BEARER_TOKEN = /\bbearer\s+\S+/gi;
const INLINE_PAYLOAD_VALUE =
  /\b(body|html|text|content|payload)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|\S+)/gi;

function safeEmailOutboxErrorDetail(error: EmailOutboxError) {
  const detail = error.message?.trim() || "Unknown database error.";

  return detail
    .replace(INLINE_SECRET_VALUE, "$1=[REDACTED]")
    .replace(BEARER_TOKEN, "Bearer [REDACTED]")
    .replace(INLINE_PAYLOAD_VALUE, "$1=[REDACTED]")
    .slice(0, 1000);
}

export function assertEmailOutboxOperationSucceeded(
  operation: string,
  error: EmailOutboxError | null,
) {
  if (!error) return;

  throw new Error(
    `EMAIL_OUTBOX_${operation}_FAILED: ${safeEmailOutboxErrorDetail(error)}`,
  );
}

export function isEmailDeliveryDisabled(deliveryMode: string) {
  return deliveryMode === "off";
}

export function isSuccessfulEmailRetryStatus(status: string | null) {
  return status === "sent" || status === "simulated";
}
