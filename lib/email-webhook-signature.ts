export type EmailWebhookPayload = {
  timestamp: string;
  nonce: string;
  id: string;
  dedupeKey: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  senderName: string;
};

/**
 * An ordered JSON array is unambiguous even when email fields contain newlines.
 * Keep this byte-for-byte equivalent to canonicalPayload_ in the Apps Script.
 */
export function canonicalEmailWebhookPayload(payload: EmailWebhookPayload) {
  return JSON.stringify(
    [
      payload.timestamp,
      payload.nonce,
      payload.id,
      payload.dedupeKey,
      payload.to,
      payload.subject,
      payload.html,
      payload.text,
      payload.senderName,
    ].map((value) => String(value ?? "")),
  );
}

export function emailFailureStatus(providerSucceeded: boolean) {
  return providerSucceeded ? "sent_unconfirmed" : "failed";
}
