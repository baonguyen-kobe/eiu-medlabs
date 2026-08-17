import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {
  buildEmailWebhookClientDiagnostic,
  canonicalEmailWebhookPayload,
  emailFailureStatus,
  maybeLogEmailWebhookClientDiagnostic,
} from "../lib/email-webhook-signature.ts";

const scriptSource = readFileSync(
  new URL("../scripts/apps-script-email-webhook.gs", import.meta.url),
  "utf8",
);

function appsScriptHarness() {
  const values = new Map([["WEBHOOK_SECRET", "review-secret"]]);
  let sent = 0;
  let logRows = 0;
  const logSheet = {
    appendRow() {
      logRows += 1;
    },
    deleteRows(_start, count) {
      logRows = Math.max(1, logRows - count);
    },
    getLastRow: () => logRows,
    getRange() {
      return {
        setValues() {
          logRows = Math.max(logRows, 1);
          return this;
        },
        setFontWeight() {
          return this;
        },
      };
    },
    setFrozenRows() {},
  };
  const context = {
    console,
    Date,
    JSON,
    String,
    Number,
    Object,
    Array,
    RegExp,
    Math,
    Utilities: {
      Charset: { UTF_8: "utf8" },
      DigestAlgorithm: { SHA_256: "sha256" },
      computeHmacSha256Signature(value, secret) {
        return [...createHmac("sha256", secret).update(value).digest()];
      },
      computeDigest(_algorithm, value) {
        return [...createHash("sha256").update(value).digest()];
      },
      getUuid: () => crypto.randomUUID(),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => values.get(key) ?? null,
        setProperty: (key, value) => values.set(key, value),
      }),
    },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput(text) {
        return {
          text,
          setMimeType() {
            return this;
          },
        };
      },
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: () => logSheet,
        insertSheet: () => logSheet,
      }),
    },
    MailApp: {
      sendEmail() {
        sent += 1;
      },
      getRemainingDailyQuota: () => 100,
    },
  };
  vm.createContext(context);
  vm.runInContext(scriptSource, context);
  return { context, logRowCount: () => logRows, sentCount: () => sent };
}

test("canonical HMAC giữ nguyên newline, Unicode và chuỗi rỗng giữa Node/Apps Script", () => {
  const payload = {
    timestamp: "1785978000000",
    nonce: "nonce-vector",
    id: "notification-id",
    dedupeKey: "dedupe-key",
    to: "bao.nguyen@eiu.edu.vn",
    subject: "Dòng một\nDòng hai",
    html: "<p>Tiếng Việt\n第二行</p>",
    text: "",
    senderName: "EIU - MedLabs",
  };
  const { context } = appsScriptHarness();
  assert.equal(
    context.canonicalPayload_(payload),
    canonicalEmailWebhookPayload(payload),
  );
});

test("Apps Script từ chối nonce replay và chỉ gửi provider một lần", () => {
  const harness = appsScriptHarness();
  const payload = {
    timestamp: Date.now().toString(),
    nonce: crypto.randomUUID(),
    id: crypto.randomUUID(),
    dedupeKey: crypto.randomUUID(),
    to: "bao.nguyen@eiu.edu.vn",
    subject: "Kiểm thử replay",
    html: "<p>Nội dung</p>",
    text: "Nội dung",
    senderName: "EIU - MedLabs",
  };
  const signature = createHmac("sha256", "review-secret")
    .update(canonicalEmailWebhookPayload(payload))
    .digest("hex");
  const event = {
    postData: { contents: JSON.stringify({ ...payload, signature }) },
  };
  const first = JSON.parse(harness.context.doPost(event).text);
  const second = JSON.parse(harness.context.doPost(event).text);
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.error, "NONCE_REPLAY");
  assert.equal(harness.sentCount(), 1);
});

test("Apps Script loại timestamp cũ và vô hiệu hóa công thức trong log", () => {
  const { context } = appsScriptHarness();
  assert.equal(context.safeCell_("=IMPORTXML('x')"), "'=IMPORTXML('x')");
  const payload = {
    timestamp: String(Date.now() - 6 * 60 * 1000),
    nonce: crypto.randomUUID(),
    id: "old",
    dedupeKey: "old",
    to: "bao.nguyen@eiu.edu.vn",
    subject: "old",
    html: "<p>old</p>",
    text: "old",
    senderName: "EIU - MedLabs",
  };
  const signature = createHmac("sha256", "review-secret")
    .update(canonicalEmailWebhookPayload(payload))
    .digest("hex");
  const result = JSON.parse(
    context.doPost({
      postData: { contents: JSON.stringify({ ...payload, signature }) },
    }).text,
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, "UNAUTHORIZED");
});

test("request unauthorized không append từng dòng vào Google Sheet", () => {
  const harness = appsScriptHarness();
  for (let index = 0; index < 25; index += 1) {
    const result = JSON.parse(
      harness.context.doPost({
        postData: {
          contents: JSON.stringify({
            timestamp: Date.now().toString(),
            nonce: `invalid-${index}`,
            signature: "invalid",
          }),
        },
      }).text,
    );
    assert.equal(result.error, "UNAUTHORIZED");
  }
  assert.equal(harness.logRowCount(), 0);
  assert.equal(harness.sentCount(), 0);
});

test("provider success nhưng DB ACK fail không trở thành lỗi có thể gửi lại", () => {
  assert.equal(emailFailureStatus(true), "sent_unconfirmed");
  assert.equal(emailFailureStatus(false), "failed");
});

test("buildEmailWebhookClientDiagnostic tạo fingerprint an toàn không chứa raw secret hoặc raw payload", () => {
  const secret = "very-sensitive-secret-value-1234567890";
  const url = "https://script.google.com/macros/s/AKfycbx_TEST/exec";
  const payload = {
    timestamp: "1785978000000",
    nonce: "test-nonce-123",
    id: "notif-id-456",
    dedupeKey: "dedupe-789",
    to: "test.recipient@example.com",
    subject: "Tiêu đề kiểm tra",
    html: "<p>Nội dung HTML tiếng Việt</p>",
    text: "Nội dung Text tiếng Việt",
    senderName: "MedLabs Calendar",
  };
  const canonicalPayload = canonicalEmailWebhookPayload(payload);
  const signature = createHmac("sha256", secret)
    .update(canonicalPayload)
    .digest("hex");
  const requestBody = JSON.stringify({ ...payload, signature });

  const sha256Hex16 = (str) =>
    createHash("sha256").update(str, "utf8").digest("hex").slice(0, 16);

  const diag = buildEmailWebhookClientDiagnostic({
    secret,
    url,
    canonicalPayload,
    signature,
    requestBody,
    payload,
    sha256Hex16,
  });

  assert.equal(diag.event, "EMAIL_HMAC_CLIENT_DIAGNOSTIC");
  assert.equal(diag.runtimeSecretLength, secret.length);
  assert.equal(diag.runtimeSecretSha256_16, sha256Hex16(secret));
  assert.equal(diag.runtimeUrlSha256_16, sha256Hex16(url));
  assert.equal(diag.canonicalSha256_16, sha256Hex16(canonicalPayload));
  assert.equal(diag.signatureSha256_16, sha256Hex16(signature));
  assert.equal(diag.requestBodySha256_16, sha256Hex16(requestBody));

  assert.equal(diag.timestampLength, payload.timestamp.length);
  assert.equal(diag.nonceLength, payload.nonce.length);
  assert.equal(diag.idLength, payload.id.length);
  assert.equal(diag.dedupeKeyLength, payload.dedupeKey.length);
  assert.equal(diag.toLength, payload.to.length);
  assert.equal(diag.subjectLength, payload.subject.length);
  assert.equal(diag.htmlLength, payload.html.length);
  assert.equal(diag.textLength, payload.text.length);
  assert.equal(diag.senderNameLength, payload.senderName.length);

  assert.equal(diag.subjectHasNonAscii, true);
  assert.equal(diag.htmlHasNonAscii, true);
  assert.equal(diag.textHasNonAscii, true);
  assert.equal(diag.senderNameHasNonAscii, false);

  const serialized = JSON.stringify(diag);
  assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes(payload.to));
  assert.ok(!serialized.includes(payload.subject));
  assert.ok(!serialized.includes(payload.html));
  assert.ok(!serialized.includes(payload.text));
  assert.ok(!serialized.includes(payload.senderName));
  assert.ok(!serialized.includes(signature));

  // Request body integrity
  const parsedRequestBody = JSON.parse(requestBody);
  assert.equal(parsedRequestBody.signature, signature);
  assert.equal(parsedRequestBody.timestamp, payload.timestamp);
  assert.equal(parsedRequestBody.nonce, payload.nonce);
});

test("chỉ ghi log diagnostic khi Apps Script trả về đúng mã lỗi AUTH_SIGNATURE_MISMATCH", () => {
  const secret = "test-secret-value-1234567890";
  const url = "https://script.google.com/macros/s/AKfycbx_TEST/exec";
  const payload = {
    timestamp: "1785978000000",
    nonce: "test-nonce-123",
    id: "notif-id-456",
    dedupeKey: "dedupe-789",
    to: "test.recipient@example.com",
    subject: "Tiêu đề kiểm tra",
    html: "<p>Nội dung HTML</p>",
    text: "Nội dung Text",
    senderName: "MedLabs Calendar",
  };
  const canonicalPayload = canonicalEmailWebhookPayload(payload);
  const signature = createHmac("sha256", secret)
    .update(canonicalPayload)
    .digest("hex");
  const requestBody = JSON.stringify({ ...payload, signature });
  const sha256Hex16 = (str) =>
    createHash("sha256").update(str, "utf8").digest("hex").slice(0, 16);

  const logs = [];
  const mockWarn = (msg) => logs.push(msg);

  // A. AUTH_SIGNATURE_MISMATCH path produces diagnostic
  const mismatchResult = maybeLogEmailWebhookClientDiagnostic({
    resultError: "AUTH_SIGNATURE_MISMATCH",
    secret,
    url,
    canonicalPayload,
    signature,
    requestBody,
    payload,
    sha256Hex16,
    warn: mockWarn,
  });
  assert.ok(mismatchResult);
  assert.equal(logs.length, 1);
  assert.ok(logs[0].startsWith("EMAIL_HMAC_CLIENT_DIAGNOSTIC: "));

  // B. Successful response does NOT produce diagnostic
  logs.length = 0;
  const successResult = maybeLogEmailWebhookClientDiagnostic({
    resultError: undefined,
    secret,
    url,
    canonicalPayload,
    signature,
    requestBody,
    payload,
    sha256Hex16,
    warn: mockWarn,
  });
  assert.equal(successResult, null);
  assert.equal(logs.length, 0);

  // C. Other errors do NOT produce diagnostic
  for (const otherError of [
    "INVALID_EMAIL_PAYLOAD",
    "UNAUTHORIZED",
    "NONCE_REPLAY",
    "UNAUTHORIZED_TIMESTAMP",
    "INTERNAL_ERROR",
  ]) {
    logs.length = 0;
    const otherResult = maybeLogEmailWebhookClientDiagnostic({
      resultError: otherError,
      secret,
      url,
      canonicalPayload,
      signature,
      requestBody,
      payload,
      sha256Hex16,
      warn: mockWarn,
    });
    assert.equal(otherResult, null);
    assert.equal(logs.length, 0);
  }
});
