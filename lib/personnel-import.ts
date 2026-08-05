export type PersonnelImportIdentity = {
  rowNumber: number;
  email: string;
  phone: string | null;
};

export function normalizePersonnelPhone(value: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("84") && digits.length === 11
    ? `0${digits.slice(2)}`
    : digits;
}

export function assertUniquePersonnelImportIdentities(
  rows: PersonnelImportIdentity[],
) {
  const emails = new Map<string, PersonnelImportIdentity[]>();
  const phones = new Map<string, PersonnelImportIdentity[]>();

  for (const row of rows) {
    emails.set(row.email, [...(emails.get(row.email) ?? []), row]);

    const normalizedPhone = normalizePersonnelPhone(row.phone);
    if (!normalizedPhone) continue;
    phones.set(normalizedPhone, [...(phones.get(normalizedPhone) ?? []), row]);
  }

  const formatRows = (duplicates: PersonnelImportIdentity[]) => {
    const rowNumbers = duplicates.map(({ rowNumber }) => rowNumber);
    return `${rowNumbers.slice(0, 10).join(", ")}${rowNumbers.length > 10 ? ", …" : ""}`;
  };
  const issues = [
    ...[...emails.entries()]
      .filter(([, duplicates]) => duplicates.length > 1)
      .map(
        ([email, duplicates]) =>
          `Email "${email}" ở các dòng ${formatRows(duplicates)}`,
      ),
    ...[...phones.entries()]
      .filter(([, duplicates]) => duplicates.length > 1)
      .map(
        ([phone, duplicates]) =>
          `Số điện thoại "${phone}" ở các dòng ${formatRows(duplicates)}`,
      ),
  ];
  if (issues.length > 0) {
    throw new Error(
      `File có dữ liệu trùng: ${issues.slice(0, 5).join("; ")}${issues.length > 5 ? "; …" : ""}. Hãy dùng email và số điện thoại riêng cho từng nhân sự.`,
    );
  }
}
