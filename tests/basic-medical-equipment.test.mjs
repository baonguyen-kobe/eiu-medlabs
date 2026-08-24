import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(
  new URL("../lib/basic-medical-equipment.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const equipment = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

function registration(confirmations) {
  return {
    basic_medical_registration_sessions: confirmations.map(
      (sessionConfirmations, index) => ({
        id: `session-${index}`,
        confirmations: sessionConfirmations,
      }),
    ),
  };
}

test("phiếu chỉ hoàn thành khi mọi buổi có xác nhận còn hiệu lực", () => {
  const active = { id: "active", invalidated_at: null };
  const invalid = { id: "invalid", invalidated_at: "2026-08-05T10:00:00Z" };
  assert.equal(
    equipment.isBasicMedicalRegistrationCompleted(
      registration([[active], [active]]),
    ),
    true,
  );
  assert.equal(
    equipment.isBasicMedicalRegistrationCompleted(
      registration([[active], [invalid]]),
    ),
    false,
  );
  assert.equal(
    equipment.isBasicMedicalRegistrationCompleted(registration([])),
    false,
  );
});

test("tiêu đề email báo Hư dùng số phòng và tên phòng đã chốt", () => {
  assert.equal(
    equipment.basicMedicalDamageEmailSubject("114", "Phòng Thực hành"),
    "[MedLabs Calendar][Y cơ sở][Alert] Thiết bị phòng 114 Phòng Thực hành được báo Hư",
  );
  assert.equal(
    equipment.basicMedicalDamageEmailSubject("114", null),
    "[MedLabs Calendar][Y cơ sở][Alert] Thiết bị phòng 114 được báo Hư",
  );
});
