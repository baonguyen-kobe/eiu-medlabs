export type CommercialNamed = {
  commercial_name: string | null;
};

export type ExistingCatalogRow = CommercialNamed & {
  id: string;
  is_active: boolean;
};

export function cleanCommercialName(value: unknown) {
  const commercialName = String(value ?? "").trim();
  return commercialName || null;
}

export function normalizedCommercialName(value: unknown) {
  const commercialName = cleanCommercialName(value);
  return commercialName?.toLowerCase() ?? "";
}

export function findDuplicateCommercialName(
  rows: CommercialNamed[],
): string | null {
  const names = new Set<string>();
  for (const row of rows) {
    const normalized = normalizedCommercialName(row.commercial_name);
    if (names.has(normalized)) return row.commercial_name;
    names.add(normalized);
  }
  return null;
}

export function matchCatalogImportRows<T extends CommercialNamed>(
  rows: T[],
  existingRows: ExistingCatalogRow[],
  mode: "all" | "new",
) {
  const existingByCommercialName = new Map(
    existingRows.map((row) => [
      normalizedCommercialName(row.commercial_name),
      row,
    ]),
  );

  return rows.flatMap((row) => {
    const matched = existingByCommercialName.get(
      normalizedCommercialName(row.commercial_name),
    );
    if (mode === "new" && matched) return [];
    return [
      {
        ...row,
        ...(matched ? { id: matched.id, is_active: matched.is_active } : {}),
      },
    ];
  });
}
