export const CANONICAL_SEMESTERS = ["HK1", "HK2", "HK3", "HK4"] as const;

export type CanonicalSemester = (typeof CANONICAL_SEMESTERS)[number];

export function isCanonicalSemester(
  value: unknown,
): value is CanonicalSemester {
  return (
    typeof value === "string" &&
    (CANONICAL_SEMESTERS as readonly string[]).includes(value)
  );
}
