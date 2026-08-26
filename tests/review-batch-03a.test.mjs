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

test("MOB-01.2 keeps one shared request expansion while narrowing the request summary", () => {
  assert.match(requestList, /const \[expandedIds, setExpandedIds\]/);
  assert.match(requestList, /function toggleExpanded\(requestId: string\)/);
  assert.match(
    requestList,
    /current\.has\(requestId\) \? new Set\(\) : new Set\(\[requestId\]\)/,
  );
  assert.match(
    requestList,
    /equipment-request-summary equipment-request-course-button/,
  );
  assert.match(requestList, /equipment-request-detail-row/);
  assert.match(
    styles,
    /@media \(max-width: 920px\)[\s\S]*\.equipment-request-table\s*\{[\s\S]*min-width:\s*0[\s\S]*display:\s*block/,
  );
  assert.match(
    styles,
    /\.equipment-request-table-row\s*\{[\s\S]*display:\s*grid/,
  );
});

test("MOB-01.2 provides mobile item cards without removing desktop item tables", () => {
  assert.match(requestList, /className="equipment-mobile-item-list"/);
  assert.match(requestList, /className="equipment-mobile-item-card"/);
  assert.match(requestList, /className="equipment-mobile-item-draft"/);
  assert.match(
    requestList,
    /<table className="data-table equipment-detail-table">/,
  );
  assert.match(
    styles,
    /\.equipment-modal-body > \.equipment-modal-skill > \.responsive-table\s*\{\s*display:\s*none/,
  );
  assert.match(styles, /\.equipment-mobile-item-list\s*\{\s*display:\s*grid/);
});
