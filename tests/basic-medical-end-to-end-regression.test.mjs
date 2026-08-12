import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [registrationsPage, registrationList, confirmationAction, equipmentPage] =
  await Promise.all([
    readFile(
      new URL("../app/basic-medical/registrations/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../components/basic-medical-registration-list.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/basic-medical/registrations/actions.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/basic-medical/equipment/page.tsx", import.meta.url),
      "utf8",
    ),
  ]);

test("confirmation UI carries the canonical eligible snapshot through damage and signature", () => {
  assert.match(
    registrationsPage,
    /catalog:basic_medical_equipment_catalog!inner\([^)]*is_active\)/,
  );
  assert.match(registrationsPage, /\.eq\("is_active", true\)/);
  assert.match(registrationsPage, /\.eq\("catalog\.is_active", true\)/);
  assert.match(registrationList, /inventory\.good_quantity/);
  assert.match(registrationList, /inventory\.damaged_quantity/);
  assert.match(registrationList, /newlyDamagedQuantity/);
  assert.match(registrationList, /className="signature-canvas"/);
  assert.match(registrationList, /toDataURL\("image\/png"\)/);

  for (const field of [
    "expectedCatalogItemId",
    "expectedTotalQuantity",
    "expectedGoodQuantity",
    "expectedDamagedQuantity",
    "expectedItemName",
    "expectedCommercialName",
    "expectedUnit",
  ]) {
    assert.match(registrationList, new RegExp(field));
    assert.match(confirmationAction, new RegExp(field));
  }
  assert.match(confirmationAction, /confirm_basic_medical_session/);
});

test("confirmation UI derives session and registration completion and exposes evidence", () => {
  assert.match(registrationList, /activeSessionConfirmation\(session\)/);
  assert.match(
    registrationList,
    /sessions\.every\(\(session\) =>\s*confirmationBySession\.has\(session\.id\)/,
  );
  assert.match(registrationList, /onConfirmed=\{\(confirmation\) =>/);
  assert.match(
    registrationList,
    /\/basic-medical\/registrations\/confirmations\/\$\{confirmation\.id\}/,
  );
  assert.match(registrationList, /schedule_status === "cancelled"/);
  assert.match(
    registrationList,
    /createBasicMedicalConfirmationTimerLifecycle/,
  );
});

test("equipment UI routes Damaged and Log tabs through the database search contract", () => {
  assert.match(
    equipmentPage,
    /type Tab = "inventory" \| "rooms" \| "damaged" \| "logs"/,
  );
  assert.match(
    equipmentPage,
    /supabase\.rpc\("search_basic_medical_equipment"/,
  );
  assert.match(equipmentPage, /\["damaged", "Thiết bị hư"\]/);
  assert.match(equipmentPage, /\["logs", "Log thay đổi"\]/);
});
