import { useVirtualizer } from "@tanstack/react-virtual";
import type React from "react";
import { useRef } from "react";
import { zoomIntoBurg } from "../../../actions";
import { editBurg } from "../../../controllers/burg-editor";
import { burgHighlightOff, burgHighlightOn } from "../../../controllers/burg-highlight";
import type { BurgRowData } from "../../../controllers/burgs-overview";
import { showElementLockTip } from "../../../services/tooltipService";
import { useExtensionState } from "../../../store/extensionState";
import { si } from "../../../utils";
import { IconButton } from "../IconButton";

export interface BurgsTableProps {
  rows: BurgRowData[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
  onRemoveBurg: (burgId: number) => void;
  onToggleLock: (burgId: number) => void;
}

/**
 * Presentational burgs table shared by the standalone Burgs Overview dialog and the embedded
 * Burgs tab of the State/Province Editor. Row data and sort state are passed as props — the
 * component never reads burgsOverviewState itself — so an embedded caller (scoped to one
 * state/province) never fights the standalone dialog's own filters if both are open at once.
 */
export const BurgsTable: React.FC<BurgsTableProps> = ({
  rows,
  sortBy,
  sortOrder,
  onSort,
  onRemoveBurg,
  onToggleLock
}) => {
  const overviewColumns = useExtensionState(state => state.burgOverviewColumns);
  const columnCount = 8 + overviewColumns.length;
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 5
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  function SortHeader({
    field,
    label,
    numeric,
    width
  }: {
    field: string;
    label: string;
    numeric?: boolean;
    width?: string;
  }) {
    const isActive = sortBy === field;
    const directionIcon = numeric
      ? sortOrder === "asc"
        ? "icon-sort-number-up"
        : "icon-sort-number-down"
      : sortOrder === "asc"
        ? "icon-sort-name-up"
        : "icon-sort-name-down";
    return (
      <th
        data-tip={`Click to sort by ${label.toLowerCase()}`}
        className={`sortable ${numeric ? "icon-sort-number-down" : "alphabetically"} ${isActive ? "sort-active" : ""}`}
        onClick={() => onSort(field)}
        style={{ width, minWidth: width }}
      >
        {label}
        {isActive && <span className={directionIcon} />}
      </th>
    );
  }

  return (
    <div className="table" ref={parentRef} style={{ overflow: "auto" }}>
      <table className="fmg-table">
        <thead style={{ zIndex: 3 }}>
          <tr>
            <SortHeader field="name" label="Burg" width="14em" />
            <SortHeader field="province" label="Province" width="7em" />
            <SortHeader field="state" label="State" width="7.5em" />
            <SortHeader field="culture" label="Culture" width="7.2em" />
            <SortHeader field="group" label="Group" width="6.5em" />
            <SortHeader field="population" label="Population" numeric width="7em" />
            {overviewColumns.map(column => (
              <th
                key={column.id}
                data-tip={column.tip}
                className={`sortable icon-sort-number-down ${sortBy === column.id ? "sort-active" : ""}`}
                onClick={() => onSort(column.id)}
                style={{ width: "5.5em", minWidth: "5.5em" }}
              >
                {column.label}
                {sortBy === column.id && (
                  <span className={sortOrder === "asc" ? "icon-sort-number-up" : "icon-sort-number-down"} />
                )}
              </th>
            ))}
            <SortHeader field="features" label="Feat." width="3.5em" />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columnCount}>No burgs found</td>
            </tr>
          ) : (
            <>
              {paddingTop > 0 && (
                <tr>
                  <td colSpan={columnCount} style={{ height: `${paddingTop}px` }} />
                </tr>
              )}
              {virtualItems.map(virtualRow => {
                const { b, population, province, stateName, cultureName } = rows[virtualRow.index];
                return (
                  <tr
                    key={b.i}
                    className="states"
                    data-id={b.i}
                    data-name={b.name}
                    data-state={stateName}
                    data-province={province}
                    data-culture={cultureName}
                    data-group={b.group}
                    data-population={population}
                    onMouseEnter={() => burgHighlightOn(b.i!)}
                    onMouseLeave={() => burgHighlightOff()}
                  >
                    <td className="d-flex">
                      <IconButton
                        data-tip="Click to zoom into view"
                        className="icon-dot-circled pointer"
                        onClick={() => zoomIntoBurg(b.i!)}
                      />
                      <input data-tip="Burg name" className="burgName" value={b.name ?? ""} disabled readOnly />
                    </td>
                    <td>
                      <input data-tip="Burg province" value={province} disabled readOnly />
                    </td>
                    <td>
                      <input data-tip="Burg state" value={stateName} disabled readOnly />
                    </td>
                    <td>
                      <input data-tip="Dominant culture" value={cultureName} disabled readOnly />
                    </td>
                    <td>
                      <input data-tip="Burg group" value={b.group ?? ""} disabled readOnly />
                    </td>
                    <td className="d-flex">
                      <span data-tip="Burg population" className="icon-male" />
                      <input data-tip="Burg population" value={si(population)} disabled readOnly />
                    </td>
                    {overviewColumns.map(column => (
                      <td key={column.id} className={column.onClick ? "pointer" : undefined}>
                        <input
                          data-tip={column.tip}
                          value={column.format(column.getValue(b))}
                          disabled
                          readOnly
                          onClick={column.onClick ? () => column.onClick?.(b) : undefined}
                        />
                      </td>
                    ))}
                    <td>
                      <div style={{ display: "inline-block" }}>
                        <span
                          data-tip={b.capital ? "This burg is a state capital" : "This burg is NOT a state capital"}
                          className={`icon-star-empty${b.capital ? "" : " inactive"}`}
                        />
                        <span
                          data-tip={b.port ? "This burg is a port" : "This burg is NOT a port"}
                          className={`icon-anchor${b.port ? "" : " inactive"}`}
                        />
                      </div>
                    </td>
                    <td>
                      <IconButton data-tip="Edit burg" className="icon-pencil pointer" onClick={() => editBurg(b.i!)} />
                      <IconButton
                        className={`locks pointer${b.lock ? " icon-lock" : " icon-lock-open inactive"}`}
                        onMouseOver={e => showElementLockTip(e.nativeEvent)}
                        onClick={() => onToggleLock(b.i!)}
                      />
                      <IconButton
                        data-tip="Remove burg"
                        className="icon-trash-empty pointer"
                        onClick={() => onRemoveBurg(b.i!)}
                      />
                    </td>
                  </tr>
                );
              })}
              {paddingBottom > 0 && (
                <tr>
                  <td colSpan={columnCount} style={{ height: `${paddingBottom}px` }} />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};
