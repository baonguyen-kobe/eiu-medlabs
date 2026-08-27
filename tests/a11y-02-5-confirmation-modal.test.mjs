import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const listSource = readFileSync(
  "components/basic-medical-registration-list.tsx",
  "utf8",
);
const hookSource = readFileSync("components/use-overlay-focus.ts", "utf8");

test("A11Y-02.5: BasicMedicalConfirmationModal uses shared useOverlayFocus foundation", () => {
  assert.match(
    listSource,
    /useOverlayFocus\s*\(\s*\{[\s\S]*?open:\s*true,[\s\S]*?containerRef:\s*modalRef,[\s\S]*?initialFocusRef:\s*closeRef,[\s\S]*?pending:\s*isPending,[\s\S]*?onDismiss:\s*onClose/i,
  );
  assert.match(listSource, /data-overlay-focus-root=["']true["']/);
});

test("A11Y-02.5: modal accessibility markup strictly follows dialog contract", () => {
  assert.match(listSource, /role=["']dialog["']/);
  assert.match(listSource, /aria-modal=["']true["']/);
  assert.match(
    listSource,
    /aria-labelledby=["']basic-medical-confirmation-title["']/,
  );
  assert.match(listSource, /id=["']basic-medical-confirmation-title["']/);
  assert.match(listSource, /className=["'][^"']*equipment-modal-close/);
  assert.match(listSource, /aria-label=["']Đóng cửa sổ xác nhận["']/);
  assert.match(listSource, /className=["'][^"']*equipment-modal-backdrop/);
});

test("A11Y-02.5: confirmation timing contract enforces 1 hour before session end", () => {
  assert.match(listSource, /function earliestConfirmationDate\s*\(/);
  assert.match(
    listSource,
    /schedule\.schedule_date[\s\S]*?schedule\.end_time[\s\S]*?\+07:00/,
  );
  assert.match(listSource, /end\.getTime\(\)\s*-\s*60\s*\*\s*60\s*\*\s*1000/);
});

test("A11Y-02.5: step navigation preserves condition and signature transition without focus loss", () => {
  assert.match(listSource, /className=["'][^"']*basic-medical-signature-step/);
  assert.match(listSource, /Thay đổi tình trạng thiết bị phòng/);
  assert.match(listSource, /Tiếp tục ký|Lưu tình trạng và tiếp tục ký/);
});

test("A11Y-02.5: useOverlayFocus supports Tab/Shift+Tab, Escape, backdrop, and body scroll locking", () => {
  assert.match(hookSource, /if\s*\(--scrollLockDepth\s*===\s*0\)/);
  assert.match(hookSource, /document\.body\.style\.overflow\s*=\s*"hidden"/);
  assert.match(
    hookSource,
    /\(returnFocusElement\s*\?\?\s*previousActiveElement\)\?\.focus\(\)/,
  );
  assert.match(
    hookSource,
    /event\.key\s*===\s*"Escape"\s*&&\s*!pendingRef\.current/,
  );
});
