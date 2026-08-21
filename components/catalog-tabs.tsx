import Link from "next/link";

const items = [
  ["/admin/courses", "Môn học"],
  ["/admin/rooms", "Phòng"],
  ["/admin/audit", "Lịch sử thay đổi"],
] as const;

export function CatalogTabs({ active }: { active?: string }) {
  return (
    <nav className="catalog-tabs" aria-label="Danh mục quản trị">
      {items.map(([href, label]) => (
        <Link
          aria-current={active === href ? "page" : undefined}
          className={active === href ? "active" : ""}
          href={href}
          key={href}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
