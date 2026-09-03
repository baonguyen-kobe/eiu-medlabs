import type { ComponentPropsWithoutRef, ReactNode } from "react";

type TableScrollViewportProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "aria-label" | "children" | "role" | "tabIndex"
> & {
  children: ReactNode;
  label: string;
};

export function TableScrollViewport({
  children,
  className,
  label,
  ...props
}: TableScrollViewportProps) {
  return (
    <div
      {...props}
      aria-label={label}
      className={["responsive-table", className].filter(Boolean).join(" ")}
      role="region"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
