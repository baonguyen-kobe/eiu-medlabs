import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {
  canonicalEmailWebhookPayload,
  emailFailureStatus,
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
      computeHmacSha256Signature(value, secret, charset) {
        if (charset !== undefined && charset !== "utf8") {
          throw new Error(`Unexpected charset: ${charset}`);
        }
        return [...createHmac("sha256", secret).update(value, "utf8").digest()];
      },
      computeDigest(_algorithm, value, charset) {
        if (charset !== undefined && charset !== "utf8") {
          throw new Error(`Unexpected charset: ${charset}`);
        }
        return [...createHash("sha256").update(value, "utf8").digest()];
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

test("Apps Script canonical source sử dụng UTF-8 rõ ràng, không chứa hàm diagnostic tạm và giữ nguyên thứ tự trường", () => {
  // 1. Explicit UTF-8 in HMAC
  assert.ok(
    scriptSource.includes("Utilities.Charset.UTF_8"),
    "Apps Script source must explicitly reference Utilities.Charset.UTF_8",
  );
  assert.match(
    scriptSource,
    /Utilities\.computeHmacSha256Signature\s*\(\s*String\(value\s*\|\|\s*["']{2}\)\s*,\s*String\(secret\s*\|\|\s*["']{2}\)\s*,\s*Utilities\.Charset\.UTF_8\s*,?\s*\)/,
    "hmacHex_ must pass Utilities.Charset.UTF_8 explicitly",
  );

  // 2. Canonical field order
  assert.match(
    scriptSource,
    /canonicalPayload_[\s\S]*?body\.timestamp[\s\S]*?body\.nonce[\s\S]*?body\.id[\s\S]*?body\.dedupeKey[\s\S]*?body\.to[\s\S]*?body\.subject[\s\S]*?body\.html[\s\S]*?body\.text[\s\S]*?body\.senderName/,
    "canonicalPayload_ must retain exact 9-field ordered array",
  );

  // 3. No temporary diagnostic helpers or properties
  assert.ok(
    !scriptSource.includes("diagnoseMedLabsHmac"),
    "Must not contain diagnoseMedLabsHmac",
  );
  assert.ok(
    !scriptSource.includes("showLatestHmacDiagnostic"),
    "Must not contain showLatestHmacDiagnostic",
  );
  assert.ok(
    !scriptSource.includes("writeHmacMismatchDiagnostic_"),
    "Must not contain writeHmacMismatchDiagnostic_",
  );
  assert.ok(
    !scriptSource.includes("MEDLABS_LAST_HMAC_DIAGNOSTIC"),
    "Must not contain MEDLABS_LAST_HMAC_DIAGNOSTIC",
  );
  assert.ok(
    !scriptSource.includes("AUTH_SIGNATURE_MISMATCH"),
    "Must not return verbose auth diagnostic error codes",
  );

  // 4. Secret property name
  assert.match(
    scriptSource,
    /const SECRET_PROPERTY = "WEBHOOK_SECRET";/,
    "Must use WEBHOOK_SECRET script property",
  );

  // 5. Version
  assert.match(
    scriptSource,
    /const MEDLABS_VERSION = "2026\.08\.17-hmac-v3-clean";/,
    "Must use clean non-diagnostic version string",
  );
});
