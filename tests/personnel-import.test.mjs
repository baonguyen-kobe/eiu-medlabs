import assert from "node:assert/strict";
import test from "node:test";
import {
  assertUniquePersonnelImportIdentities,
  normalizePersonnelPhone,
} from "../lib/personnel-import.ts";
import {
  buildPersonnelTemplateSamples,
  personnelRoleDisplayNames,
} from "../lib/admin-catalog-template.ts";

test("chuẩn hóa số điện thoại trước khi kiểm tra trùng", () => {
  assert.equal(normalizePersonnelPhone("+84 901 234 567"), "0901234567");
  assert.equal(normalizePersonnelPhone("0901.234.567"), "0901234567");
  assert.equal(normalizePersonnelPhone(null), "");
});

test("file nhân sự hợp lệ phải có email và số điện thoại riêng", () => {
  assert.doesNotThrow(() =>
    assertUniquePersonnelImportIdentities([
      { rowNumber: 2, email: "a@example.com", phone: "0901234567" },
      { rowNumber: 3, email: "b@example.com", phone: "0912345678" },
      { rowNumber: 4, email: "c@example.com", phone: null },
    ]),
  );
});

test("báo cùng lúc email và số điện thoại bị trùng trong file", () => {
  assert.throws(
    () =>
      assertUniquePersonnelImportIdentities([
        { rowNumber: 2, email: "a@example.com", phone: "0901234567" },
        { rowNumber: 3, email: "b@example.com", phone: "+84 901 234 567" },
        { rowNumber: 4, email: "a@example.com", phone: "0923456789" },
      ]),
    (error) => {
      assert.match(error.message, /Email "a@example\.com" ở các dòng 2, 4/);
      assert.match(error.message, /Số điện thoại "0901234567" ở các dòng 2, 3/);
      return true;
    },
  );
});

test("template nhân sự dùng tên hiển thị và ví dụ không trùng", () => {
  assert.deepEqual(personnelRoleDisplayNames, [
    "Quản trị viên",
    "Giảng viên",
    "Chuyên viên",
    "Trợ giảng",
    "Người xem",
  ]);
  const samples = buildPersonnelTemplateSamples([
    { code: "nursing_skills", name: "Kỹ năng Điều dưỡng" },
    { code: "basic_medical", name: "Y cơ sở" },
  ]);
  assert.doesNotThrow(() =>
    assertUniquePersonnelImportIdentities(
      samples.map((sample, index) => ({
        rowNumber: index + 2,
        email: sample["Email đăng nhập"],
        phone: sample["Số điện thoại"],
      })),
    ),
  );
});
