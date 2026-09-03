import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const requestList = readFileSync(
  new URL("../components/equipment-request-list.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const minePage = readFileSync(
  new URL("../app/equipment/mine/page.tsx", import.meta.url),
  "utf8",
);

test("MOB-01.2 Batch 03E: summary and detail share single continuous card shell and divider", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-list-item\s*\{[\s\S]*border:\s*1px\s+solid\s+var\(--line\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-detail-row\s*\{[\s\S]*border-top:\s*1px\s+solid\s+var\(--line\)/,
  );
  assert.doesNotMatch(
    styles,
    /\.equipment-request-detail-grid[^{]*\{[^}]*text-transform:\s*uppercase/,
  );
});

test("MOB-01.2 Batch 03E: mobile expanded detail uses restored pre-03D grid layout", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-detail-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-detail-grid > \.equipment-detail-phone\s*\{\s*display:\s*none;\s*\}/,
  );
});

test("MOB-01.2 Batch 03E: preserves TOUCH-01 44x44px chevron touch target", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-chevron\s*\{[\s\S]*(?:width|min-width):\s*44px/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-chevron\s*\{[\s\S]*(?:height|min-height):\s*44px/,
  );
});

test("MOB-01.2 Batch 03E: preserves desktop 145px label width and Danh sách TTB", () => {
  assert.match(
    styles,
    /\.equipment-request-detail-grid\.detail-list\s*>\s*div\s*\{[\s\S]*grid-template-columns:\s*145px/,
  );
  assert.match(requestList, /<dt>Danh sách TTB<\/dt>/);
});

test("MOB-01.2 Batch 03E: preserves mobile item modal 14px typography and current user query", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-mobile-item-content\s+strong\s*\{[\s\S]*font-size:\s*14px/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-mobile-item-content\s+p\s*\{[\s\S]*font-size:\s*14px/,
  );
  assert.match(
    minePage,
    /\.or\(`registrant_id\.eq\.\$\{userId\},responsible_lecturer_id\.eq\.\$\{userId\}`\)/,
  );
});
