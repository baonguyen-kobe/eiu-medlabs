type CatalogItem = {
  id: string;
  commercial_name: string | null;
};

function normalizedCommercialName(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

type EquipmentRow = {
  activityId: string;
  catalogItemId: string;
};

/**
 * The catalog commercial name is the durable equipment identity. A request may
 * use that identity once per practical activity, but may reuse it in another
 * activity in the same request.
 */
export function hasDuplicateCommercialNameWithinActivity(
  rows: EquipmentRow[],
  catalogById: Map<string, CatalogItem>,
) {
  const identities = new Set<string>();

  for (const row of rows) {
    const commercialName = normalizedCommercialName(
      catalogById.get(row.catalogItemId)?.commercial_name,
    );
    if (!commercialName) continue;

    const activityId = row.activityId.trim().toLocaleLowerCase("vi");
    const identity = `${activityId}|${commercialName}`;
    if (identities.has(identity)) return true;
    identities.add(identity);
  }

  return false;
}
