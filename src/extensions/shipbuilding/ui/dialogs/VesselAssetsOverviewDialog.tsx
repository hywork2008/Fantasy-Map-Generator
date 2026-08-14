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

type SortField =
  | "hullId"
  | "ownerLabel"
  | "operatorLabel"
  | "homePort"
  | "shipClassName"
  | "statusLabel"
  | "locationLabel"
  | "nextPortLabel"
  | "cargoLabel"
  | "navalCrewCapacity";

function compareRows(
  left: VesselAssetsOverviewRow,
  right: VesselAssetsOverviewRow,
  sortBy: SortField,
  sortOrder: "asc" | "desc"
): number {
  let result = 0;
  if (sortBy === "statusLabel")
    result = left.statusSort - right.statusSort || left.statusLabel.localeCompare(right.statusLabel);
  else if (sortBy === "locationLabel") result = left.locationSort.localeCompare(right.locationSort);
  else if (sortBy === "nextPortLabel") result = left.nextPortSort.localeCompare(right.nextPortSort);
  else if (sortBy === "cargoLabel") result = left.cargoSort.localeCompare(right.cargoSort);
  else if (sortBy === "hullId" || sortBy === "navalCrewCapacity") result = left[sortBy] - right[sortBy];
  else result = String(left[sortBy]).localeCompare(String(right[sortBy]));
  return sortOrder === "asc" ? result : -result;
}

export const VesselAssetsOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("VesselAssetsOverviewDialog"));
  const rawRows = useVesselAssetsOverviewState(state => state.rows);
  const summary = useVesselAssetsOverviewState(state => state.summary);
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState<SortField>("hullId");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const rows = useMemo(
    () => [...rawRows].sort((left, right) => compareRows(left, right, sortBy, sortOrder)),
    [rawRows, sortBy, sortOrder]
  );
  const toggleSort = (field: string) => {
    if (field === sortBy) setSortOrder(order => (order === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field as SortField);
      setSortOrder(field === "hullId" || field === "navalCrewCapacity" ? "asc" : "desc");
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
          One row per physical hull. Location and next port come from finite-fleet itineraries; market ship Goods are
          separate saleable inventory.
        </p>
        {summary.total > 0 && (
          <p className="dialog-note" style={{ marginTop: 0 }}>
            Fleet: {summary.total} hulls · Idle/docked {summary.docked} · Patrol {summary.voyage} · Cargo{" "}
            {summary.cargo} · Maintenance {summary.maintenance}
            {summary.navalCrewCapacity > 0 ? ` · Naval crew capacity ${summary.navalCrewCapacity}` : ""}
          </p>
        )}
        {rows.length === 0 ? (
          <i>No completed vessels found.</i>
        ) : (
          <table className="fmg-table states-table">
            <thead>
              <tr>
                <SortableHeader
                  field="hullId"
                  label="Hull #"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                  numeric
                />
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
                  field="statusLabel"
                  label="Status"
                  tip="Idle = berthed waiting; Patrol = navy training voyage; At sea / Loading = cargo; Maintenance = repairing"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                />
                <SortableHeader
                  field="locationLabel"
                  label="Location"
                  tip="Current port, or sea progress toward the next port"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                />
                <SortableHeader
                  field="nextPortLabel"
                  label="Next port"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
                />
                <SortableHeader
                  field="cargoLabel"
                  label="Cargo / Caravan"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={toggleSort}
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
                  <td className="numeric">{row.hullId}</td>
                  <td>{row.ownerLabel}</td>
                  <td>{row.operatorLabel}</td>
                  <td>{row.homePort}</td>
                  <td>{row.shipClassName}</td>
                  <td>{row.statusLabel}</td>
                  <td>{row.locationLabel}</td>
                  <td>{row.nextPortLabel}</td>
                  <td>{row.cargoLabel}</td>
                  <td className="numeric">{row.navalCrewCapacity || "—"}</td>
                </tr>
              )}
            />
          </table>
        )}
      </TableDialogLayout>
    </Dialog>
  );
};
