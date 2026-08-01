import type React from "react";
import { useMemo, useRef, useState } from "react";
import {
  closeDialog,
  Dialog,
  SortableHeader,
  TableDialogLayout,
  useDialogState,
  VirtualTableBody
} from "../../../hostUi";
import { type ShipyardOverviewRow, useShipyardsOverviewState } from "../../store/shipyardsOverviewState";

type SortField = keyof Pick<
  ShipyardOverviewRow,
  | "burgName"
  | "ownerLabel"
  | "shipClassName"
  | "progressPct"
  | "materialStatus"
  | "strategicMaterialSummary"
  | "procurementStatus"
  | "completedHulls"
  | "portOccupancyLabel"
  | "atSeaCount"
>;

export const ShipyardsOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("ShipyardsOverviewDialog"));
  const rawRows = useShipyardsOverviewState(s => s.rows);
  const onZoom = useShipyardsOverviewState(s => s.onZoom);
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState<SortField>("burgName");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const toggleSortBy = (field: string) => {
    if (field === sortBy) {
      setSortOrder(order => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field as SortField);
      setSortOrder("desc");
    }
  };

  const rows = useMemo(() => {
    const sorted = [...rawRows].sort((a, b) => {
      const valA = a[sortBy];
      const valB = b[sortBy];
      const cmp = typeof valA === "string" ? valA.localeCompare(valB as string) : (valA as number) - (valB as number);
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rawRows, sortBy, sortOrder]);

  return (
    <Dialog
      isOpen={isOpen}
      title="Shipyards Overview"
      onClose={() => closeDialog("ShipyardsOverviewDialog")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout bodyRef={scrollElementRef} className="shipyards-overview-dialog">
        {rows.length === 0 ? (
          <div>
            <i>No active shipyard queues found.</i>
          </div>
        ) : (
          <table className="fmg-table states-table">
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <SortableHeader
                  field="burgName"
                  label="Shipyard"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSortBy}
                />
                <SortableHeader
                  field="ownerLabel"
                  label="Owner"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSortBy}
                />
                <SortableHeader
                  field="shipClassName"
                  label="Building"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSortBy}
                />
                <SortableHeader
                  field="progressPct"
                  label="Progress"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSortBy}
                  numeric
                />
                <SortableHeader
                  field="materialStatus"
                  label="Materials"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSortBy}
                  tip="Construction consumes Wood, Sails, Ropes, and Tar from this shipyard's local market"
                />
                <SortableHeader
                  field="strategicMaterialSummary"
                  label="Strategic stock"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSortBy}
                  tip="Each material is shown as local stock / yearly construction demand / 365-day reserve target"
                />
                <SortableHeader
                  field="procurementStatus"
                  label="Procurement"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSortBy}
                  tip="Strategic procurement orders and cargo tracking begin in Phase 9.2"
                />
                <SortableHeader
                  field="completedHulls"
                  label="Completed hulls"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSortBy}
                  numeric
                />
                <SortableHeader
                  field="portOccupancyLabel"
                  label="Port (docked/capacity)"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSortBy}
                  tip="Docked / port capacity, by size tier"
                />
                <SortableHeader
                  field="atSeaCount"
                  label="At sea"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSortBy}
                  numeric
                  tip="Hulls out on a trade/training voyage, not occupying a berth"
                />
              </tr>
            </thead>
            <VirtualTableBody
              items={rows}
              scrollElementRef={scrollElementRef}
              renderRow={(row: ShipyardOverviewRow) => (
                <tr
                  key={row.burgId}
                  data-tip="Click to zoom to shipyard"
                  className="states pointer"
                  onClick={() => onZoom(row.x, row.y)}
                >
                  <td>{row.burgName}</td>
                  <td>{row.ownerLabel}</td>
                  <td>{row.shipClassName}</td>
                  <td>{row.progressPct}%</td>
                  <td>{row.materialStatus}</td>
                  <td>{row.strategicMaterialSummary}</td>
                  <td>{row.procurementStatus}</td>
                  <td>{row.completedHulls}</td>
                  <td>{row.portOccupancyLabel}</td>
                  <td>{row.atSeaCount}</td>
                </tr>
              )}
            />
          </table>
        )}
      </TableDialogLayout>
    </Dialog>
  );
};
