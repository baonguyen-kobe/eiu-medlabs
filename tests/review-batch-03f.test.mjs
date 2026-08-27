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

test("MOB-01.2 Batch 03F: mobile summary contains visible 4-column header strip", () => {
  assert.match(
    requestList,
    /<span className="mobile-col-course">Môn học<\/span>/,
  );
  assert.match(requestList, /<span className="mobile-col-date">Ngày<\/span>/);
  assert.match(
    requestList,
    /<span className="mobile-col-room">Phòng\/Lab<\/span>/,
  );
  assert.match(
    requestList,
    /<span className="mobile-col-status">Trạng thái<\/span>/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-mobile-header\s*\{[\s\S]*background:\s*var\(--eiu-cream\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-mobile-header\s*\{[\s\S]*color:\s*var\(--eiu-blue\)/,
  );
});

test("MOB-01.2 Batch 03F: mobile summary combines date and time in the same column", () => {
  assert.match(
    requestList,
    /<div className="mobile-col-date">[\s\S]*formatScheduleDate\(schedule\?\.schedule_date\)[\s\S]*<small className="mobile-time-range">/,
  );
});

test("MOB-01.2 Batch 03F: desktop columns remain intact while mobile card hides Domain and Count", () => {
  // Desktop header has all 8 columns
  assert.match(requestList, /<th>Phạm vi<\/th>/);
  assert.match(requestList, /<th>Môn học<\/th>/);
  assert.match(requestList, /<th>Ngày<\/th>/);
  assert.match(requestList, /<th>Thời gian<\/th>/);
  assert.match(requestList, /<th>Phòng\/Lab<\/th>/);
  assert.match(requestList, /<th>Thiết bị<\/th>/);

  // Mobile data row does not contain Domain or Count cells
  assert.doesNotMatch(
    requestList.slice(
      requestList.indexOf('className="equipment-request-mobile-data"'),
    ),
    /<div className="mobile-col-domain">/,
  );
  assert.doesNotMatch(
    requestList.slice(
      requestList.indexOf('className="equipment-request-mobile-data"'),
    ),
    /<div className="mobile-col-count">/,
  );
});

test("MOB-01.2 Batch 03F: preserves TOUCH-01 44x44px chevron touch target", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-mobile-data\s+\.equipment-request-chevron\s*\{[\s\S]*(?:width|min-width):\s*44px/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-mobile-data\s+\.equipment-request-chevron\s*\{[\s\S]*(?:height|min-height):\s*44px/,
  );
});

test("MOB-01.2 Batch 03F: preserves desktop 145px label width, Danh sách TTB, and Be Vietnam Pro", () => {
  assert.match(
    styles,
    /\.equipment-request-detail-grid\.detail-list\s*>\s*div\s*\{[\s\S]*grid-template-columns:\s*145px/,
  );
  assert.match(requestList, /<dt>Danh sách TTB<\/dt>/);
  assert.match(
    masterDoc,
    /EIU MedLabs uses Be Vietnam Pro for all user-visible typography/,
  );
  assert.match(
    minePage,
    /\.or\(`registrant_id\.eq\.\$\{userId\},responsible_lecturer_id\.eq\.\$\{userId\}`\)/,
  );
});
