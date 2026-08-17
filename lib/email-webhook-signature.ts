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

export type EmailWebhookDiagnostic = {
  event: "EMAIL_HMAC_CLIENT_DIAGNOSTIC";
  runtimeSecretLength: number;
  runtimeSecretSha256_16: string;
  runtimeUrlSha256_16: string;
  canonicalSha256_16: string;
  signatureSha256_16: string;
  requestBodySha256_16: string;
  timestampLength: number;
  nonceLength: number;
  idLength: number;
  dedupeKeyLength: number;
  toLength: number;
  subjectLength: number;
  htmlLength: number;
  textLength: number;
  senderNameLength: number;
  subjectHasNonAscii: boolean;
  htmlHasNonAscii: boolean;
  textHasNonAscii: boolean;
  senderNameHasNonAscii: boolean;
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

export function buildEmailWebhookClientDiagnostic(params: {
  secret: string;
  url: string;
  canonicalPayload: string;
  signature: string;
  requestBody: string;
  payload: EmailWebhookPayload;
  sha256Hex16: (input: string) => string;
}): EmailWebhookDiagnostic {
  const {
    secret,
    url,
    canonicalPayload,
    signature,
    requestBody,
    payload,
    sha256Hex16,
  } = params;
  return {
    event: "EMAIL_HMAC_CLIENT_DIAGNOSTIC",
    runtimeSecretLength: secret.length,
    runtimeSecretSha256_16: sha256Hex16(secret),
    runtimeUrlSha256_16: sha256Hex16(url),
    canonicalSha256_16: sha256Hex16(canonicalPayload),
    signatureSha256_16: sha256Hex16(signature),
    requestBodySha256_16: sha256Hex16(requestBody),
    timestampLength: String(payload.timestamp ?? "").length,
    nonceLength: String(payload.nonce ?? "").length,
    idLength: String(payload.id ?? "").length,
    dedupeKeyLength: String(payload.dedupeKey ?? "").length,
    toLength: String(payload.to ?? "").length,
    subjectLength: String(payload.subject ?? "").length,
    htmlLength: String(payload.html ?? "").length,
    textLength: String(payload.text ?? "").length,
    senderNameLength: String(payload.senderName ?? "").length,
    subjectHasNonAscii: /[^\x00-\x7F]/.test(String(payload.subject ?? "")),
    htmlHasNonAscii: /[^\x00-\x7F]/.test(String(payload.html ?? "")),
    textHasNonAscii: /[^\x00-\x7F]/.test(String(payload.text ?? "")),
    senderNameHasNonAscii: /[^\x00-\x7F]/.test(
      String(payload.senderName ?? ""),
    ),
  };
}
