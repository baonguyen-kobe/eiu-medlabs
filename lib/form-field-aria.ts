type FieldAriaOptions = {
  describedBy?: string;
  errorId?: string;
  invalid?: boolean;
};

export function getFieldAria({
  describedBy,
  errorId,
  invalid = false,
}: FieldAriaOptions) {
  const descriptionIds = [...new Set([describedBy, errorId].filter(Boolean))];

  return {
    "aria-describedby": descriptionIds.length
      ? descriptionIds.join(" ")
      : undefined,
    "aria-invalid": invalid || undefined,
  };
}
