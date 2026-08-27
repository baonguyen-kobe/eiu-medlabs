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
const masterDoc = readFileSync(
  new URL("../docs/UI_DESIGN_SYSTEM_V2_MASTER.md", import.meta.url),
  "utf8",
);

test("MOB-01.2 Batch 03G: shared statusStack structure remains shared between desktop and mobile rows", () => {
  assert.match(
    requestList,
    /const statusStack =\s*\(\s*<div className="equipment-request-status-stack">/,
  );
  assert.match(
    requestList,
    /<td className="equipment-request-status-cell">\s*\{statusStack\}\s*<\/td>/,
  );
  assert.match(
    requestList,
    /<div className="mobile-col-status">\s*\{statusStack\}\s*<\/div>/,
  );
});

test("MOB-01.2 Batch 03G: 768 summary grid rebalances Date and Room with stable track allocation", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-mobile-header\s*\{[\s\S]*minmax\(0,\s*1\.25fr\)\s+minmax\(0,\s*0\.75fr\)\s+minmax\(0,\s*0\.9fr\)\s+minmax\(0,\s*1\.05fr\)\s+44px/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-mobile-data\s*\{[\s\S]*minmax\(0,\s*1\.25fr\)\s+minmax\(0,\s*0\.75fr\)\s+minmax\(0,\s*0\.9fr\)\s+minmax\(0,\s*1\.05fr\)\s+44px/,
  );
});

test("MOB-01.2 Batch 03G: mobile summary status pill hugs content with fit-content and 999px radius", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.mobile-col-status\s+\.request-status[\s\S]*width:\s*fit-content\s*!important/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.mobile-col-status\s+\.request-status[\s\S]*min-width:\s*0\s*!important/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.mobile-col-status\s+\.request-late-approval[\s\S]*width:\s*fit-content\s*!important/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.mobile-col-status\s+\.request-late-approval[\s\S]*min-width:\s*0\s*!important/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.mobile-col-status\s+\.request-late-approval[\s\S]*max-width:\s*100%\s*!important/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.mobile-col-status\s+\.request-late-approval[\s\S]*border-radius:\s*999px\s*!important/,
  );
  assert.match(
    requestList,
    /<span className="late-approval-short" aria-hidden="true">\s*Chờ duyệt ĐK trễ\s*<\/span>/,
  );
});

test("MOB-01.2 Batch 03G: expanded status actions use 2 equal columns and hide PDF export on mobile", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-status-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-status-actions\s+\.request-status-button[\s\S]*width:\s*100%\s*!important/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-status-actions\s+\.request-status-button[\s\S]*min-width:\s*0\s*!important/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-status-actions\s+\.equipment-request-delete[\s\S]*width:\s*100%\s*!important/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-status-actions\s+\.equipment-request-delete[\s\S]*min-width:\s*0\s*!important/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-handover-export\s*\{\s*display:\s*none\s*!important;\s*\}/,
  );
  // Desktop PDF export source remains present
  assert.match(
    requestList,
    /className="button button-secondary equipment-handover-export"/,
  );
});

test("MOB-01.2 Batch 03G: hides confirmation progress only at <=920px while preserving desktop source", () => {
  assert.match(
    requestList,
    /<div className="equipment-confirmation-progress">/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-confirmation-progress\s*\{\s*display:\s*none;\s*\}/,
  );
});

test("MOB-01.2 Batch 03G: <=480px narrow breakpoint provides summary density and stacks inner detail fields", () => {
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(
    styles,
    /@media \(max-width: 480px\)[\s\S]*\.equipment-request-detail-grid\.detail-list\s*>\s*div\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column/,
  );
  assert.match(
    styles,
    /@media \(max-width: 480px\)[\s\S]*\.equipment-request-detail-grid\.detail-list\s+dt\s*\{[\s\S]*white-space:\s*normal/,
  );
});

test("MOB-01.2 Batch 03G: preserves 44x44px chevron, desktop 145px labels, and Global Font Contract", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-mobile-data\s+\.equipment-request-chevron\s*\{[\s\S]*(?:width|min-width):\s*44px/,
  );
  assert.match(
    styles,
    /@media \(max-width: 480px\)[\s\S]*\.equipment-request-mobile-data\s+\.equipment-request-chevron\s*\{[\s\S]*(?:width|min-width):\s*44px/,
  );
  assert.match(
    styles,
    /\.equipment-request-detail-grid\.detail-list\s*>\s*div\s*\{[\s\S]*grid-template-columns:\s*145px/,
  );
  assert.match(
    masterDoc,
    /EIU MedLabs uses Be Vietnam Pro for all user-visible typography/,
  );
  assert.match(
    minePage,
    /\.or\(`registrant_id\.eq\.\$\{userId\},responsible_lecturer_id\.eq\.\$\{userId\}`\)/,
  );
});
