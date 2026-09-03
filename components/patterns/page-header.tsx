import type { ReactNode } from "react";

/**
 * Shared workspace page heading. Every authenticated route receives the same
 * compact title, contextual description, and action rhythm through this
 * pattern rather than recreating a page-specific header shell.
 */
export function PageHeader({
  menu,
  title,
  description,
  utility,
  actions,
}: {
  menu?: ReactNode;
  title: string;
  description?: string;
  utility?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-topbar page-header">
      {menu ? <div className="page-header-menu">{menu}</div> : null}
      <div className="page-header-copy">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {utility ? <div className="page-header-utility">{utility}</div> : null}
      {actions ? <div className="workspace-actions">{actions}</div> : null}
    </header>
  );
}
