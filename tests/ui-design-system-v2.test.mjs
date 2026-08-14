import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("UI V2 keeps the approved semantic visual foundation", async () => {
  const css = await source("app/globals.css");
  for (const token of [
    "--primary: #144069",
    "--secondary: #a78656",
    "--canvas: #f8f6f1",
    "--table-header: #f6f1e8",
    "--focus-ring:",
    "prefers-reduced-motion",
  ]) {
    assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /scrollbar-gutter: stable both-edges/);
});

test("UI V2 keeps equipment controls and wide request tables inside local viewports", async () => {
  const css = await source("app/globals.css");
  assert.match(
    css,
    /\.equipment-request-list-panel \.responsive-table \{[\s\S]*max-width: 100%/,
  );
  assert.match(
    css,
    /@media \(max-width: 1440px\) \{[\s\S]*\.equipment-catalog-import/,
  );
  assert.match(
    css,
    /@media \(max-width: 1080px\) \{[\s\S]*\.equipment-request-filters/,
  );
  assert.match(
    css,
    /@media \(max-width: 680px\) \{[\s\S]*\.equipment-catalog-filters/,
  );
});

test("UI V2 personnel structure follows the approved table and drawer order", async () => {
  const personnel = await source("components/personnel-management-list.tsx");
  const personnelPage = await source("app/admin/personnel/page.tsx");
  const dashboard = await source("app/dashboard/page.tsx");
  for (const heading of [
    "Mã",
    "Họ và tên",
    "Email",
    "Vai trò",
    "Quyền bổ sung",
    "Phạm vi",
    "Trạng thái",
    "Thao tác",
  ]) {
    assert.match(personnel, new RegExp(`<th>${heading}</th>`));
  }
  assert.match(personnel, /personnel-password-section/);
  assert.match(personnel, /employee_code\?\.trim\(\) \|\| "—"/);
  assert.doesNotMatch(personnel, /item\.id\.slice\(/);
  assert.match(
    personnelPage,
    /select\("employee_code,can_manage_email_notifications"\)/,
  );
  assert.doesNotMatch(dashboard, /Xin chào/);
});
