import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const importsComponent = readFileSync(
  "components/import-history-table.tsx",
  "utf8",
);
const auditSource = readFileSync("app/admin/audit/page.tsx", "utf8");
const dashSource = readFileSync("app/dashboard/page.tsx", "utf8");
const confirmSource = readFileSync(
  "app/basic-medical/registrations/confirmations/[id]/page.tsx",
  "utf8",
);
const cssSource = readFileSync("app/globals.css", "utf8");

test("MOB-01.7 Batch 04C: /imports implements Strategy D summary and expandable detail", () => {
  assert.match(
    importsComponent,
    /className=["'][^"']*import-history-desktop-row/,
  );
  assert.match(
    importsComponent,
    /className=["'][^"']*import-history-mobile-row/,
  );
  assert.match(importsComponent, /className=["'][^"']*import-history-card/);
  assert.match(
    importsComponent,
    /className=["'][^"']*import-history-card-summary/,
  );
  assert.match(
    importsComponent,
    /className=["'][^"']*import-history-card-detail/,
  );

  // Chevron accessible contract
  assert.match(importsComponent, /aria-expanded=\{isExpanded\}/);
  assert.match(importsComponent, /Thu gọn chi tiết import/);
  assert.match(importsComponent, /Mở chi tiết import/);

  // Secondary counts
  assert.match(importsComponent, /Tổng số dòng/);
  assert.match(importsComponent, /Đã tạo thành công/);
  assert.match(importsComponent, /Cảnh báo/);
  assert.match(importsComponent, /Lỗi/);
  assert.match(importsComponent, /Dữ liệu trùng/);
  assert.match(importsComponent, /Xung đột lịch/);
  assert.match(importsComponent, /Mã phiên/);
});

test("MOB-01.7 Batch 04C: /admin/audit implements Strategy C compact cards", () => {
  assert.match(auditSource, /className=["'][^"']*audit-desktop-row/);
  assert.match(auditSource, /className=["'][^"']*audit-mobile-row/);
  assert.match(auditSource, /className=["'][^"']*audit-card/);
  assert.match(auditSource, /className=["'][^"']*audit-card-header/);
  assert.match(auditSource, /className=["'][^"']*audit-card-actor/);
  assert.match(auditSource, /className=["'][^"']*audit-card-footer/);
});

test("MOB-01.7 Batch 04C: /dashboard implements Strategy F dense schedule rows", () => {
  assert.match(dashSource, /className=["'][^"']*overview-schedule-desktop-row/);
  assert.match(dashSource, /className=["'][^"']*overview-schedule-mobile-row/);
  assert.match(dashSource, /className=["'][^"']*overview-schedule-item/);
  assert.match(dashSource, /className=["'][^"']*overview-schedule-date-time/);
  assert.match(dashSource, /className=["'][^"']*overview-schedule-course/);
  assert.match(dashSource, /className=["'][^"']*overview-schedule-lecturer/);
});

test("MOB-01.7 Batch 04C: Basic Medical confirmation implements compact condition comparison cards", () => {
  assert.match(confirmSource, /className=["'][^"']*condition-desktop-row/);
  assert.match(confirmSource, /className=["'][^"']*condition-mobile-row/);
  assert.match(confirmSource, /className=["'][^"']*condition-evidence-card/);
  assert.match(confirmSource, /className=["'][^"']*condition-comparison-grid/);
  assert.match(confirmSource, /Trước/);
  assert.match(confirmSource, /Hư mới/);
  assert.match(confirmSource, /Sau/);
});

test("MOB-01.7 Batch 04C: responsive CSS rules enforce touch targets and desktop table preservation", () => {
  // Desktop defaults hide mobile elements
  assert.match(cssSource, /\.import-history-mobile-row/);
  assert.match(cssSource, /\.audit-mobile-row/);
  assert.match(cssSource, /\.overview-schedule-mobile-row/);
  assert.match(cssSource, /\.condition-mobile-row/);

  // 920px breakpoint hides desktop rows and displays mobile cards
  assert.match(
    cssSource,
    /@media \(max-width:\s*920px\) \{[\s\S]*?\.import-history-desktop-row\s*\{\s*display:\s*none;/i,
  );
  assert.match(
    cssSource,
    /@media \(max-width:\s*920px\) \{[\s\S]*?\.audit-desktop-row\s*\{\s*display:\s*none;/i,
  );
  assert.match(
    cssSource,
    /@media \(max-width:\s*920px\) \{[\s\S]*?\.overview-schedule-desktop-row\s*\{\s*display:\s*none;/i,
  );
  assert.match(
    cssSource,
    /@media \(max-width:\s*920px\) \{[\s\S]*?\.condition-desktop-row\s*\{\s*display:\s*none;/i,
  );

  // 44x44px chevron touch target on imports
  assert.match(
    cssSource,
    /\.import-history-chevron-button\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/i,
  );

  // Technical IDs wrap safely
  assert.match(
    cssSource,
    /\.equipment-request-detail-grid dl dd\.mono\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/i,
  );
});
