/**
 * MedLabs Calendar - Google Apps Script email webhook.
 *
 * Script Properties:
 * - WEBHOOK_SECRET (bắt buộc): phải trùng EMAIL_APPS_SCRIPT_SECRET trên Vercel.
 * - TEST_EMAIL (tùy chọn): email nhận khi chạy sendMedLabsTestEmail().
 *
 * Deploy: Web app / Execute as Me / Who has access: Anyone.
 */
const MEDLABS_VERSION = "2026.08.06-hmac-v3";
const SECRET_PROPERTY = "WEBHOOK_SECRET";
const LEGACY_SECRET_PROPERTY = "EMAIL_WEBHOOK_SECRET";
const SENT_KEYS_PROPERTY = "MEDLABS_SENT_EMAIL_KEYS";
const USED_NONCES_PROPERTY = "MEDLABS_USED_NONCES";
const LOG_SHEET_NAME = "Email logs";
const MAX_SENT_KEYS = 1000;
const MAX_LOG_ROWS = 5000;
const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;

function jsonResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function safeEqual_(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function hmacHex_(value, secret) {
  return Utilities.computeHmacSha256Signature(value, secret)
    .map(function (byte) {
      const normalized = byte < 0 ? byte + 256 : byte;
      return ("0" + normalized.toString(16)).slice(-2);
    })
    .join("");
}

function canonicalPayload_(body) {
  return JSON.stringify(
    [
      body.timestamp,
      body.nonce,
      body.id,
      body.dedupeKey,
      body.to,
      body.subject,
      body.html,
      body.text,
      body.senderName,
    ].map(function (value) {
      return String(value || "");
    }),
  );
}

function safeCell_(value) {
  const text = String(value || "").slice(0, 1000);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function shortRequestHash_(rawBody) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(rawBody || ""),
    Utilities.Charset.UTF_8,
  )
    .slice(0, 8)
    .map(function (byte) {
      const normalized = byte < 0 ? byte + 256 : byte;
      return ("0" + normalized.toString(16)).slice(-2);
    })
    .join("");
}

function readUsedNonces_(properties) {
  try {
    const value = JSON.parse(
      properties.getProperty(USED_NONCES_PROPERTY) || "{}",
    );
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch (_error) {
    return {};
  }
}

function readSentKeys_(properties) {
  try {
    const value = JSON.parse(
      properties.getProperty(SENT_KEYS_PROPERTY) || "[]",
    );
    return Array.isArray(value) ? value : [];
  } catch (_error) {
    return [];
  }
}

function getWebhookSecret_(properties) {
  return (
    properties.getProperty(SECRET_PROPERTY) ||
    properties.getProperty(LEGACY_SECRET_PROPERTY) ||
    ""
  );
}

function getLogSheet_() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) return null;
    let sheet = spreadsheet.getSheetByName(LOG_SHEET_NAME);
    if (!sheet) sheet = spreadsheet.insertSheet(LOG_SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet
        .getRange(1, 1, 1, 7)
        .setValues([
          [
            "Thời gian",
            "ID thông báo",
            "Mã chống trùng",
            "Người nhận",
            "Tiêu đề",
            "Trạng thái",
            "Lỗi",
          ],
        ])
        .setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
    return sheet;
  } catch (_error) {
    return null;
  }
}

function writeLog_(body, status, error) {
  try {
    const sheet = getLogSheet_();
    if (!sheet) return;
    sheet.appendRow([
      new Date(),
      safeCell_(body.id),
      safeCell_(body.dedupeKey),
      safeCell_(body.to),
      safeCell_(body.subject),
      safeCell_(status),
      safeCell_(error),
    ]);
    const overflow = sheet.getLastRow() - MAX_LOG_ROWS - 1;
    if (overflow > 0) sheet.deleteRows(2, overflow);
  } catch (_error) {
    // Lỗi ghi log không được làm gián đoạn việc gửi email.
  }
}

function writeUnauthorizedLog_(rawBody) {
  writeLog_(
    { id: "request:" + shortRequestHash_(rawBody) },
    "failed",
    "UNAUTHORIZED",
  );
}

function doGet() {
  return jsonResponse_({
    ok: true,
    service: "MedLabs Calendar Email Webhook",
    version: MEDLABS_VERSION,
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  let body = {};
  try {
    const rawBody = (e && e.postData && e.postData.contents) || "{}";
    body = JSON.parse(rawBody);
    const properties = PropertiesService.getScriptProperties();
    const expectedSecret = getWebhookSecret_(properties);
    const timestamp = Number(body.timestamp);
    const signatureIsValid =
      expectedSecret &&
      body.nonce &&
      body.signature &&
      Number.isFinite(timestamp) &&
      Math.abs(Date.now() - timestamp) <= MAX_REQUEST_AGE_MS &&
      safeEqual_(
        body.signature,
        hmacHex_(canonicalPayload_(body), expectedSecret),
      );
    if (!signatureIsValid) {
      writeUnauthorizedLog_(rawBody);
      return jsonResponse_({ ok: false, error: "UNAUTHORIZED" });
    }
    if (
      !body.dedupeKey ||
      !body.to ||
      !String(body.to).includes("@") ||
      !body.subject ||
      !body.html
    ) {
      writeLog_(body, "failed", "INVALID_EMAIL_PAYLOAD");
      return jsonResponse_({ ok: false, error: "INVALID_EMAIL_PAYLOAD" });
    }

    lock.waitLock(30000);
    locked = true;
    const now = Date.now();
    const usedNonces = readUsedNonces_(properties);
    Object.keys(usedNonces).forEach(function (nonce) {
      if (now - Number(usedNonces[nonce] || 0) > MAX_REQUEST_AGE_MS * 2) {
        delete usedNonces[nonce];
      }
    });
    if (usedNonces[String(body.nonce)]) {
      writeLog_(
        { id: body.id, dedupeKey: body.dedupeKey },
        "failed",
        "NONCE_REPLAY",
      );
      return jsonResponse_({ ok: false, error: "NONCE_REPLAY" });
    }
    // Persist before the provider call so concurrent/retried copies cannot both send.
    usedNonces[String(body.nonce)] = now;
    properties.setProperty(USED_NONCES_PROPERTY, JSON.stringify(usedNonces));

    const sentKeys = readSentKeys_(properties);
    if (sentKeys.includes(body.dedupeKey)) {
      writeLog_(body, "duplicate", "");
      return jsonResponse_({
        ok: true,
        duplicate: true,
        messageId: "duplicate:" + body.dedupeKey,
      });
    }

    MailApp.sendEmail({
      to: String(body.to),
      subject: String(body.subject),
      body:
        String(body.text || "").trim() ||
        "Vui lòng xem nội dung email ở định dạng HTML.",
      htmlBody: String(body.html),
      name: String(body.senderName || "MedLabs Calendar"),
    });

    sentKeys.push(body.dedupeKey);
    properties.setProperty(
      SENT_KEYS_PROPERTY,
      JSON.stringify(sentKeys.slice(-MAX_SENT_KEYS)),
    );
    const messageId = String(body.id || Utilities.getUuid());
    writeLog_(body, "sent", "");
    return jsonResponse_({ ok: true, messageId: messageId });
  } catch (error) {
    const message = String(
      (error && error.message) || error || "SEND_FAILED",
    ).slice(0, 1000);
    writeLog_(body, "failed", message);
    return jsonResponse_({ ok: false, error: message });
  } finally {
    if (locked) {
      try {
        lock.releaseLock();
      } catch (_error) {}
    }
  }
}

/** Chạy một lần trong Apps Script để kiểm tra cấu hình và tạo sheet Email logs. */
function setupMedLabsEmailWebhook() {
  const properties = PropertiesService.getScriptProperties();
  if (!getWebhookSecret_(properties)) {
    throw new Error(
      "Chưa có Script Property WEBHOOK_SECRET. Hãy tạo property này trước.",
    );
  }
  getLogSheet_();
  return {
    ok: true,
    version: MEDLABS_VERSION,
    remainingDailyQuota: MailApp.getRemainingDailyQuota(),
  };
}

/**
 * Gửi thư thử. Có thể tạo Script Property TEST_EMAIL; nếu không có, script dùng
 * email của tài khoản đang chạy khi Google cho phép đọc địa chỉ này.
 */
function sendMedLabsTestEmail() {
  const properties = PropertiesService.getScriptProperties();
  const recipient =
    properties.getProperty("TEST_EMAIL") || Session.getActiveUser().getEmail();
  if (!recipient || !String(recipient).includes("@")) {
    throw new Error(
      "Chưa xác định được email thử. Hãy tạo Script Property TEST_EMAIL.",
    );
  }
  MailApp.sendEmail({
    to: recipient,
    subject: "[MedLabs Calendar] Kiểm tra kết nối Google Apps Script",
    body: "Kết nối gửi email của MedLabs Calendar đã hoạt động. Bạn có thể triển khai Web app và dùng URL /exec trên Vercel.",
    htmlBody:
      '<div style="font-family:Arial,sans-serif;color:#17324d;line-height:1.5">' +
      '<h2 style="margin:0 0 12px">MedLabs Calendar</h2>' +
      "<p>Kết nối gửi email qua Google Apps Script đã hoạt động.</p>" +
      '<p style="color:#64748b">Bạn có thể triển khai Web app và dùng URL kết thúc bằng <strong>/exec</strong> trên Vercel.</p>' +
      "</div>",
    name: "MedLabs Calendar",
  });
  return { ok: true, recipient: recipient };
}
