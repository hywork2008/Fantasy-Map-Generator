import type React from "react";

export interface TableDialogLayoutProps {
  /** Content kept above the scrolling table region, such as tabs or a description. */
  header?: React.ReactNode;
  /** Filters or other table controls. */
  controls?: React.ReactNode;
  /** Whether controls appear before the table or immediately above the footer. */
  controlsPlacement?: "afterHeader" | "beforeFooter";
  /** The table (or an empty-state message) displayed in the scrollable region. */
  children: React.ReactNode;
  /** Ref for virtualized tables that need the scrolling viewport. */
  bodyRef?: React.Ref<HTMLDivElement>;
  /** Totals or other read-only information kept visible below the table. */
  summary?: React.ReactNode;
  /** Persistent actions for the dialog. */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * Shared structural layout for data-table dialogs.
 *
 * It owns the fixed and scrolling regions so overview/editor modules only need
 * to supply their table and optional controls, summary, and actions.
 */
export const TableDialogLayout: React.FC<TableDialogLayoutProps> = ({
  header,
  controls,
  controlsPlacement = "afterHeader",
  children,
  bodyRef,
  summary,
  footer,
  className = ""
}) => {
  const controlsBeforeTable = controlsPlacement === "afterHeader" ? controls : undefined;
  const controlsBeforeFooter = controlsPlacement === "beforeFooter" ? controls : undefined;

  return (
    <div className={`fmg-table-dialog ${className}`.trim()}>
      {header && <div className="fmg-table-dialog__header">{header}</div>}
      {controlsBeforeTable && <div className="fmg-table-dialog__controls">{controlsBeforeTable}</div>}
      <div ref={bodyRef} className="fmg-table-dialog__body">
        {children}
      </div>
      {summary && <div className="fmg-table-dialog__summary">{summary}</div>}
      {controlsBeforeFooter && <div className="fmg-table-dialog__controls">{controlsBeforeFooter}</div>}
      {footer && <div className="fmg-table-dialog__footer">{footer}</div>}
    </div>
  );
};
