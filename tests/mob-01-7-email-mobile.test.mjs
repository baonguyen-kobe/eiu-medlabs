import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const componentSource = readFileSync(
  "components/email-notification-table.tsx",
  "utf8",
);
const cssSource = readFileSync("app/globals.css", "utf8");

test("MOB-01.7 Batch 04B: provides Strategy D summary and expandable detail without removing desktop table", () => {
  assert.match(
    componentSource,
    /className=["'][^"']*email-notification-desktop-row/,
  );
  assert.match(
    componentSource,
    /className=["'][^"']*email-notification-mobile-row/,
  );
  assert.match(componentSource, /className=["'][^"']*email-notification-card/);
  assert.match(
    componentSource,
    /className=["'][^"']*email-notification-card-summary/,
  );
  assert.match(
    componentSource,
    /className=["'][^"']*email-notification-card-detail/,
  );

  // Chevron accessible contract
  assert.match(componentSource, /aria-expanded=\{isExpanded\}/);
  assert.match(componentSource, /Thu gọn chi tiết email/);
  assert.match(componentSource, /Mở chi tiết email/);

  // Secondary fields
  assert.match(componentSource, /Loại thông báo/);
  assert.match(componentSource, /Lần gửi/);
  assert.match(componentSource, /Lỗi gần nhất/);
  assert.match(componentSource, /Thời gian gửi/);
});

test("MOB-01.7 Batch 04B: preserves retry workflow and business actions", () => {
  assert.match(componentSource, /action=\{retryFailedEmail\}/);
  assert.match(
    componentSource,
    /item\.status === ["']failed["'] &&\s*deliveryMode !== ["']off["'] &&\s*canRetry/,
  );
  assert.match(componentSource, /Gửi lại/);
});

test("MOB-01.7 Batch 04B: provides mobile select-all and preserves bulk deletion", () => {
  assert.match(componentSource, /className=["'][^"']*email-mobile-select-all/);
  assert.match(componentSource, /Chọn tất cả/);
  assert.match(componentSource, /ConfirmSubmitButton/);
  assert.match(componentSource, /action=\{deleteSelectedEmailNotifications\}/);
  assert.match(componentSource, /Xóa đã chọn/);
});

test("MOB-01.7 Batch 04B: responsive CSS enforces touch targets, card layout, and delivery mode panel", () => {
  // Desktop defaults hide mobile elements
  assert.match(
    cssSource,
    /\.email-notification-mobile-row[\s\S]*?\.email-mobile-select-all[\s\S]*?display:\s*none;/,
  );

  // 920px breakpoint hides desktop rows and displays mobile cards
  assert.match(
    cssSource,
    /@media \(max-width:\s*920px\) \{[\s\S]*?\.email-notification-desktop-row\s*\{\s*display:\s*none;/,
  );
  assert.match(
    cssSource,
    /@media \(max-width:\s*920px\) \{[\s\S]*?\.email-notification-mobile-row\s*\{\s*display:\s*block;/,
  );

  // Touch target of at least 44x44px for chevron button
  assert.match(
    cssSource,
    /\.email-notification-chevron-button\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/,
  );

  // Delivery mode panel responsive layout
  assert.match(
    cssSource,
    /@media \(max-width:\s*920px\) \{[\s\S]*?\.email-delivery-mode-panel\s*\{[\s\S]*?flex-direction:\s*column;/,
  );
});
