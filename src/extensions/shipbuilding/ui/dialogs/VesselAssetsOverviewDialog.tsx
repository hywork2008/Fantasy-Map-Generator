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
import { useVesselAssetsOverviewState, type VesselAssetsOverviewRow } from "../../store/vesselAssetsOverviewState";

type SortField = keyof Pick<
  VesselAssetsOverviewRow,
  | "ownerLabel"
  | "operatorLabel"
  | "homePort"
  | "shipClassName"
  | "docked"
  | "voyage"
  | "cargo"
  | "maintenance"
  | "total"
  | "navalCrewCapacity"
>;

export const VesselAssetsOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("VesselAssetsOverviewDialog"));
  const rawRows = useVesselAssetsOverviewState(state => state.rows);
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState<SortField>("ownerLabel");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const rows = useMemo(
    () =>
      [...rawRows].sort((left, right) => {
        const a = left[sortBy];
        const b = right[sortBy];
        const result = typeof a === "string" ? a.localeCompare(b as string) : a - (b as number);
        return sortOrder === "asc" ? result : -result;
      }),
    [rawRows, sortBy, sortOrder]
  );
  const toggleSort = (field: string) => {
    if (field === sortBy) setSortOrder(order => (order === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field as SortField);
      setSortOrder("desc");
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Vessel assets"
      onClose={() => closeDialog("VesselAssetsOverviewDialog")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout bodyRef={scrollElementRef} className="vessel-assets-overview-dialog">
        <p className="dialog-note">
          Physical hulls only. Market ship Goods are saleable inventory, not completed vessels.
        </p>
        {rows.length === 0 ? (
          <i>No completed vessels found.</i>
        ) : (
          <table className="fmg-table states-table">
            <thead>
              <tr>
                <SortableHeader
                  field="ownerLabel"
                  label="Owner"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                />
                <SortableHeader
                  field="operatorLabel"
                  label="Merchant organization / merchants"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                />
                <SortableHeader
                  field="homePort"
                  label="Home port"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                />
                <SortableHeader
                  field="shipClassName"
                  label="Class"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                />
                <SortableHeader
                  field="docked"
                  label="Docked"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                  numeric
                />
                <SortableHeader
                  field="voyage"
                  label="Voyage"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                  numeric
                />
                <SortableHeader
                  field="cargo"
                  label="Cargo"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                  numeric
                />
                <SortableHeader
                  field="maintenance"
                  label="Maintenance"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                  numeric
                />
                <SortableHeader
                  field="total"
                  label="Hull count"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                  numeric
                />
                <SortableHeader
                  field="navalCrewCapacity"
                  label="Naval crew"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                  numeric
                />
              </tr>
            </thead>
            <VirtualTableBody
              items={rows}
              scrollElementRef={scrollElementRef}
              renderRow={(row: VesselAssetsOverviewRow) => (
                <tr key={row.key}>
                  <td>{row.ownerLabel}</td>
                  <td>{row.operatorLabel}</td>
                  <td>{row.homePort}</td>
                  <td>{row.shipClassName}</td>
                  <td className="numeric">{row.docked}</td>
                  <td className="numeric">{row.voyage}</td>
                  <td className="numeric">{row.cargo}</td>
                  <td className="numeric">{row.maintenance}</td>
                  <td className="numeric">{row.total}</td>
                  <td className="numeric">{row.navalCrewCapacity}</td>
                </tr>
              )}
            />
          </table>
        )}
      </TableDialogLayout>
    </Dialog>
  );
};
