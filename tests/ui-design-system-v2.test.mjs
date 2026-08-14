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
  assert.doesNotMatch(css, /scrollbar-gutter: stable both-edges/);
  assert.match(
    css,
    /linear-gradient\(180deg, #173f64 0%, #102f4d 62%, #0c2944 100%\)/,
  );
  assert.match(css, /color: #d9c49e/);
  assert.match(css, /inset 4px 0 #a78656/);
  assert.match(css, /font-size: clamp\(27px, 2vw, 32px\)/);
  assert.match(css, /background: #e5edf5/);
  assert.match(css, /border-radius: 9px/);
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
  assert.doesNotMatch(personnel, /window\.confirm/);
  assert.match(personnel, /<ConfirmDialog/);
  assert.match(
    personnel,
    /action === "grant-admin" && requiresDeactivationConfirmation\(\)/,
  );
  const confirmationDialog = await source("components/confirm-dialog.tsx");
  assert.match(confirmationDialog, /event\.key !== "Tab"/);
  assert.match(confirmationDialog, /last\.focus\(\)/);
  assert.match(confirmationDialog, /first\.focus\(\)/);
  assert.match(personnel, /employee_code\?\.trim\(\) \|\| "—"/);
  assert.doesNotMatch(personnel, /item\.id\.slice\(/);
  assert.match(
    personnelPage,
    /select\("employee_code,can_manage_email_notifications"\)/,
  );
  assert.doesNotMatch(dashboard, /Xin chào/);
});

test("catalog import keeps the one-button file-to-preview flow and a circle stepper", async () => {
  const catalogImport = await source(
    "components/catalog-reconciliation-import.tsx",
  );
  const importWizard = await source("components/import-wizard.tsx");
  const capture = await source("tests/e2e/ui-v2-visual-capture.spec.ts");

  assert.match(catalogImport, /Import tất cả/);
  assert.doesNotMatch(catalogImport, /Chọn file đối soát|Preview đối soát/);
  assert.doesNotMatch(catalogImport, /Cập nhật.*Thêm mới.*Kích hoạt lại/s);
  assert.match(catalogImport, /previewPageSize/);
  assert.match(importWizard, /<ol className="stepper">/);
  assert.match(capture, /reports\/ui-v2\/after/);
  assert.match(capture, /basic-medical-calendar/);
});
