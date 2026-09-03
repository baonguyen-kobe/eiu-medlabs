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
const layoutSource = readFileSync(
  new URL("../app/layout.tsx", import.meta.url),
  "utf8",
);
const masterDoc = readFileSync(
  new URL("../docs/UI_DESIGN_SYSTEM_V2_MASTER.md", import.meta.url),
  "utf8",
);

test("MOB-01.2 mobile card shell uses consistent separate border context", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-table\s*\{[\s\S]*border-collapse:\s*separate/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-list-item\s*\{[\s\S]*border:\s*1px\s+solid\s+var\(--line\)/,
  );
});

test("MOB-01.2 mobile expanded detail restores pre-03D 2-column layout", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-detail-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-detail-grid\s*\{[\s\S]*gap:\s*8px\s+12px/,
  );
});

test("MOB-01.2 mobile item modal secondary line has 14px font size matching primary line", () => {
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-mobile-item-content\s+strong\s*\{[\s\S]*font-size:\s*14px/,
  );
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-mobile-item-content\s+p\s*\{[\s\S]*font-size:\s*14px/,
  );
});

test("MOB-01.2 desktop detail label column is widened to fit one-line labels", () => {
  assert.match(
    styles,
    /\.equipment-request-detail-grid\.detail-list\s*>\s*div\s*\{[\s\S]*grid-template-columns:\s*145px/,
  );
});

test("MOB-01.2 renames visible expanded detail label to Danh sách TTB while preserving modal title", () => {
  assert.match(requestList, /<dt>Danh sách TTB<\/dt>/);
  assert.match(requestList, /<span>Danh sách trang thiết bị<\/span>/);
  assert.match(
    requestList,
    /aria-label=\{`Danh sách trang thiết bị cho \$\{skillName\}`\}/,
  );
});

test("Global typography contract: Be Vietnam Pro is the only intentional UI font family", () => {
  assert.match(layoutSource, /@fontsource\/be-vietnam-pro\/400\.css/);
  assert.match(layoutSource, /@fontsource\/be-vietnam-pro\/700\.css/);
  assert.doesNotMatch(styles, /--font-mono:\s*["']SFMono/);
  assert.doesNotMatch(styles, /--font-mono:\s*["']Consolas/);
  assert.match(styles, /--font-mono:\s*["']Be Vietnam Pro["']/);
  assert.match(styles, /\.mono\s*\{[\s\S]*font-family:\s*var\(--font-body\)/);
  assert.match(
    styles,
    /code,\s*pre,\s*kbd,\s*samp\s*\{[\s\S]*font-family:\s*var\(--font-body\)/,
  );
  assert.match(
    styles,
    /button,\s*input,\s*select,\s*textarea\s*\{[\s\S]*font-family:\s*var\(--font-body\)/,
  );
  assert.match(
    masterDoc,
    /EIU MedLabs uses Be Vietnam Pro for all user-visible typography/,
  );
});
