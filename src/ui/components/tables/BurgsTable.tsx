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
import { VirtualTableBody } from "../VirtualTableBody";
import { SortableHeader } from "./SortableHeader";

export interface BurgsTableProps {
  rows: BurgRowData[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (field: string) => void;
  onRemoveBurg: (burgId: number) => void;
  onToggleLock: (burgId: number) => void;
  /** When false, the Province column is omitted (Burgs Overview). Default true for embedded editors. */
  showProvinceColumn?: boolean;
  /** When false, the Culture column is omitted (Burgs Overview). Default true for embedded editors. */
  showCultureColumn?: boolean;
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
  onToggleLock,
  showProvinceColumn = true,
  showCultureColumn = true
}) => {
  const overviewColumns = useExtensionState(state => state.burgOverviewColumns);
  const parentRef = useRef<HTMLDivElement>(null);

  const header = (field: string, label: string, numeric?: boolean, width?: string) => (
    <SortableHeader
      field={field}
      label={label}
      sortBy={sortBy}
      sortOrder={sortOrder}
      onSort={onSort}
      numeric={numeric}
      tip={`Click to sort by ${label.toLowerCase()}`}
      style={{ width, minWidth: width }}
    />
  );

  return (
    <div className="table" ref={parentRef} style={{ overflow: "auto" }}>
      <table className="fmg-table">
        <thead style={{ zIndex: 3 }}>
          <tr>
            {header("name", "Burg", false, "14em")}
            {showProvinceColumn && header("province", "Province", false, "7em")}
            {header("state", "State", false, "7.5em")}
            {showCultureColumn && header("culture", "Culture", false, "7.2em")}
            {header("group", "Group", false, "6.5em")}
            {header("population", "Pops", true, "5em")}
            {overviewColumns.map(column => (
              <SortableHeader
                key={column.id}
                field={column.id}
                label={column.label}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={onSort}
                numeric
                tip={column.tip}
                style={{ width: "4.5em", minWidth: "4.5em" }}
              />
            ))}
            {header("features", "Feat", false, "3.5em")}
            <th></th>
          </tr>
        </thead>
        <VirtualTableBody
          items={rows}
          scrollElementRef={parentRef}
          renderRow={row => {
            const { b, population, province, stateName, cultureName } = row;
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
                <td>
                  <div className="d-flex">
                    <IconButton
                      data-tip="Click to zoom into view"
                      className="icon-dot-circled pointer"
                      onClick={() => zoomIntoBurg(b.i!)}
                    />
                    <input data-tip="Burg name" className="burgName" value={b.name ?? ""} disabled readOnly />
                  </div>
                </td>
                {showProvinceColumn && (
                  <td>
                    <input data-tip="Burg province" value={province} disabled readOnly />
                  </td>
                )}
                <td>
                  <input data-tip="Burg state" value={stateName} disabled readOnly />
                </td>
                {showCultureColumn && (
                  <td>
                    <input data-tip="Dominant culture" value={cultureName} disabled readOnly />
                  </td>
                )}
                <td>
                  <input data-tip="Burg group" value={b.group ?? ""} disabled readOnly />
                </td>
                <td className="numeric">
                  <div className="d-flex">
                    <span data-tip="Burg population" className="icon-male" />
                    <input data-tip="Burg population" value={si(population)} disabled readOnly />
                  </div>
                </td>
                {overviewColumns.map(column => (
                  <td key={column.id} className={`numeric ${column.onClick ? "pointer" : ""}`.trim()}>
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
          }}
        />
      </table>
    </div>
  );
};
