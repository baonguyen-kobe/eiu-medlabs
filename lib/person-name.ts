export function getNameInitials(fullName: string) {
  const initials = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toLocaleUpperCase("vi-VN");

  return initials || "ND";
}
