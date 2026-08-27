import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const requestList = readFileSync(
  new URL("../components/equipment-request-list.tsx", import.meta.url),
  "utf8",
);
const minePage = readFileSync(
  new URL("../app/equipment/mine/page.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("MOB-01.2 preserves desktop table structure while isolating mobile card row", () => {
  assert.match(
    requestList,
    /<tr\s+className="equipment-request-table-row equipment-request-desktop-row"/,
  );
  assert.match(requestList, /<tr className="equipment-request-mobile-row">/);
  assert.match(
    styles,
    /\.equipment-request-mobile-row\s*\{[\s\S]*display:\s*none\s*!important/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-desktop-row\s*\{[\s\S]*display:\s*none\s*!important/,
  );
});

test("MOB-01.2 hides phone on mobile while preserving desktop detail phone field", () => {
  assert.match(
    requestList,
    /<div className="equipment-detail-phone">[\s\S]*Số điện thoại[\s\S]*<\/div>/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-detail-grid > \.equipment-detail-phone\s*\{\s*display:\s*none;\s*\}/,
  );
});

test("MOB-01.2 mobile item cards display commercial name on line 1 and quantity/unit/note on line 2", () => {
  assert.match(requestList, /<div className="equipment-mobile-item-content">/);
  assert.match(
    requestList,
    /const commercialName =\s*catalogItem\?\.commercial_name \|\| catalogItem\?\.item_name;/,
  );
  assert.match(
    requestList,
    /<strong>\s*\{commercialName \|\|\s*"Danh mục thiết bị không còn khả dụng"\}\s*<\/strong>/,
  );
  assert.match(
    requestList,
    /<p>\s*SL \{item\.quantity\} · \{catalogItem\?\.unit \|\| "—"\} ·\{" "\}\s*\{item\.note\s*\? `Ghi chú: \$\{item\.note\}`\s*: "Không có ghi chú"\}\s*<\/p>/,
  );
});

test("/equipment/mine preserves user-scoped query for legitimate review data", () => {
  assert.match(
    minePage,
    /\.or\(`registrant_id\.eq\.\$\{userId\},responsible_lecturer_id\.eq\.\$\{userId\}`\)/,
  );
});

test("MOB-01.2 mobile request chevron restores approved touch target of at least 40px", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-chevron\s*\{[\s\S]*(?:width|min-width):\s*(?:4[0-9]|5[0-9])px/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-chevron\s*\{[\s\S]*(?:height|min-height):\s*(?:4[0-9]|5[0-9])px/,
  );
});
