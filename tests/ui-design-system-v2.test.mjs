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

test("UI V2 shared chrome and data primitives use canonical Master geometry", async () => {
  const css = await source("app/globals.css");
  const catalog = await source("components/equipment-catalog-manager.tsx");

  for (const token of [
    "width: 244px",
    "flex: 0 0 244px",
    "font-size: 14px",
    "min-height: 82px",
    "padding: 16px 30px",
    "background: rgb(255 255 255 / 94%)",
    "backdrop-filter: blur(14px)",
    "height: 44px",
    "padding: 14px 16px",
    "text-align: center",
    "width: 275px",
    "width: 145px",
    "width: 52px",
  ]) {
    assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(
    css,
    /\.workspace-topbar\.page-header \{[\s\S]*position: sticky[\s\S]*z-index: 35/,
  );
  assert.match(
    css,
    /\.workspace-sidebar \.nav-heading \{[\s\S]*font-size: 14px[\s\S]*letter-spacing: 0\.06em/,
  );
  assert.match(
    css,
    /\.equipment-catalog-col-name,[\s\S]*\.equipment-catalog-col-commercial-name \{[\s\S]*width: 275px/,
  );
  assert.match(catalog, /<colgroup>/);
  assert.match(catalog, /equipment-catalog-col-select/);
  assert.match(catalog, /equipment-catalog-col-commercial-name/);
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

test("final Master correction keeps table ownership, counters, and stable catalog slots", async () => {
  const css = await source("app/globals.css");
  const master = await source("docs/UI_DESIGN_SYSTEM_V2_MASTER.md");
  const catalog = await source("components/catalog-batch-manager.tsx");
  const personnel = await source("components/personnel-management-list.tsx");
  const personnelPage = await source("app/admin/personnel/page.tsx");
  const classList = await source("components/class-registration-list.tsx");
  const catalogImport = await source(
    "components/catalog-reconciliation-import.tsx",
  );

  assert.doesNotMatch(
    css,
    /\.responsive-table,\s*\.preview-table-wrap,\s*\.period-calendar\s*\{\s*scrollbar-gutter: stable/s,
  );
  assert.match(css, /\.responsive-table,[\s\S]*scrollbar-gutter: auto/);
  assert.match(css, /A direct child viewport only scrolls/);
  assert.match(
    css,
    /\.equipment-catalog-count,[\s\S]*height: 44px[\s\S]*display: inline-flex[\s\S]*justify-content: center/,
  );
  assert.match(
    css,
    /\.catalog-master-action-group \.button[\s\S]*width: 154px[\s\S]*min-height: 42px/,
  );
  assert.match(master, /Canonical Table Shell Ownership/);
  assert.match(master, /BUG-UI-TABLE-RIGHT-EDGE-001/);
  assert.match(catalog, /catalog-master-action-group/);
  assert.match(catalog, /selected\.length !== 1/);
  assert.match(catalog, /editing\.length \? "Lưu chỉnh sửa" : "Sửa"/);
  assert.match(personnel, /const emailCapabilityDirty/);
  assert.match(personnel, /const hasChanges = dirty \|\| emailCapabilityDirty/);
  assert.match(personnel, /function effectiveEmailCapability/);
  assert.match(
    personnelPage,
    /className="inline-toolbar-count-slot"[\s\S]*className="personnel-result-count inline-toolbar-count"/,
  );
  assert.match(
    classList,
    /className="inline-toolbar-count-slot class-result-count-slot"[\s\S]*className="class-result-count inline-toolbar-count"/,
  );
  assert.match(catalogImport, /const \[modalNotice, setModalNotice\]/);
  assert.match(catalogImport, /role="alert"/);
  assert.match(catalogImport, /stalePreviewMessage/);
});
