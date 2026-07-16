import type React from "react";

export interface SortableHeaderProps {
  /** Sort key this header controls. Passed back to onSort and compared against sortBy. */
  field: string;
  label: React.ReactNode;
  /** Currently active sort field, e.g. from the table's sort state. */
  sortBy: string;
  /** Currently active sort direction. Only meaningful when this header is the active one. */
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
  /** Numeric columns use icon-sort-number-*; text columns use icon-sort-name-* and get the "alphabetically" class. */
  numeric?: boolean;
  tip?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Canonical sortable <th>: the direction icon (icon-sort-{name|number}-{up|down}) is only ever
 * applied to the active column — never a permanent class — since icons.css renders it unconditionally
 * via ::after with no gating on "sort-active".
 */
export const SortableHeader: React.FC<SortableHeaderProps> = ({
  field,
  label,
  sortBy,
  sortOrder,
  onSort,
  numeric = false,
  tip,
  className = "",
  style
}) => {
  const isActive = sortBy === field;
  const iconClass = isActive ? `icon-sort-${numeric ? "number" : "name"}-${sortOrder === "asc" ? "up" : "down"}` : "";

  return (
    <th
      data-tip={tip}
      data-sortby={field}
      className={`sortable ${numeric ? "" : "alphabetically"} ${isActive ? "sort-active" : ""} ${iconClass} ${className}`
        .replace(/\s+/g, " ")
        .trim()}
      onClick={() => onSort(field)}
      style={style}
    >
      {label}
    </th>
  );
};
