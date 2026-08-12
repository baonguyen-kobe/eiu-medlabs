import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const [helperSource, pageSource] = await Promise.all([
  readFile(
    new URL("../lib/basic-medical-registration-edit.ts", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL("../app/basic-medical/new/page.tsx", import.meta.url),
    "utf8",
  ),
]);
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const lookup = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

test("edit lookup reaches a normalized registration older than the bounded recent list", () => {
  const registrations = Array.from({ length: 201 }, (_, index) => ({
    id: `registration-${index}`,
    registration_code: `YC-260812-${String(201 - index).padStart(6, "0")}`,
  }));
  const recent = lookup.boundBasicMedicalEditOptions(registrations);
  const oldest = registrations.at(-1);

  assert.equal(recent.length, 200);
  assert.equal(recent.includes(oldest), false);
  assert.deepEqual(
    lookup.parseBasicMedicalRegistrationLookupKey(
      `  ${oldest.registration_code.toLowerCase()}  `,
    ),
    { kind: "code", value: oldest.registration_code },
  );
  assert.equal(
    lookup.buildBasicMedicalEditLookupHref(oldest.registration_code),
    `/basic-medical/new?mode=edit&registration=${oldest.registration_code}`,
  );
});

test("unauthorized and nonexistent edit lookups resolve identically", () => {
  const otherUsersRegistration = {
    id: "registration-older-than-200",
    created_by: "another-user",
  };

  assert.equal(
    lookup.resolveEditableBasicMedicalRegistration(
      otherUsersRegistration,
      "current-user",
      ["lecturer"],
    ),
    null,
  );
  assert.equal(
    lookup.resolveEditableBasicMedicalRegistration(null, "current-user", [
      "lecturer",
    ]),
    null,
  );
  assert.equal(
    lookup.resolveEditableBasicMedicalRegistration(
      otherUsersRegistration,
      "current-user",
      ["staff"],
    ),
    otherUsersRegistration,
  );
});

test("edit selection and code fallback both navigate through guarded edit mode", () => {
  assert.match(pageSource, /<select\s+name="registration"/);
  assert.match(
    pageSource,
    /Không thấy phiếu\? Nhập mã phiếu[\s\S]*?<input[\s\S]*?name="registration"/,
  );
  assert.match(pageSource, /<input type="hidden" name="mode" value="edit"/g);
  assert.match(
    pageSource,
    /canonicalEditLookupHref[\s\S]*?redirect\(canonicalEditLookupHref\)/,
  );
  assert.match(
    pageSource,
    /sourceQuery = sourceQuery\.eq\("created_by", userId\)/,
  );
  assert.match(
    pageSource,
    /\.limit\(BASIC_MEDICAL_EDIT_OPTION_LIMIT\)[\s\S]*?sourcePromise/,
  );
  assert.match(pageSource, /return sourceQuery\.limit\(1\)\.maybeSingle\(\)/);
});
