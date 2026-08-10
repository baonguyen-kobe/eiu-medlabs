import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultResponsibleLecturerId,
  responsibleLecturerOptions,
} from "../lib/equipment-responsible-lecturer.ts";

test("non-Lecturer registrant is never preselected as equipment responsible lecturer", () => {
  const registrantId = "staff-id";
  const options = responsibleLecturerOptions(
    [
      { id: "lecturer-1", full_name: "Giảng viên Một" },
      { id: "lecturer-2", full_name: "Giảng viên Hai" },
    ],
    registrantId,
  );

  assert.ok(!options.some(({ id }) => id === registrantId));
  assert.equal(
    defaultResponsibleLecturerId(options, registrantId, registrantId),
    "lecturer-1",
  );
});

test("existing valid Lecturer selection is preserved", () => {
  const registrantId = "lecturer-1";
  const options = responsibleLecturerOptions(
    [
      { id: registrantId, full_name: "Giảng viên Một" },
      { id: "lecturer-2", full_name: "Giảng viên Hai" },
    ],
    registrantId,
  );

  assert.equal(options[0].full_name, "Giảng viên Một (Người đăng ký)");
  assert.equal(
    defaultResponsibleLecturerId(options, registrantId, "lecturer-2"),
    "lecturer-2",
  );
});
