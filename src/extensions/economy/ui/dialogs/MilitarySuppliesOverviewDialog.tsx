import React from "react";

import {
  closeDialog,
  Dialog,
  SortableHeader,
  TableDialogLayout,
  useDialogState,
  VirtualTableBody
} from "../../../hostUi";
import {
  open as openMilitarySuppliesOverview,
  refreshMilitarySuppliesOverview
} from "../../controllers/militarySuppliesOverview";
import {
  type MilitarySuppliesOverviewRow,
  useMilitarySuppliesOverviewState
} from "../../store/militarySuppliesOverviewState";

type SortField = Exclude<keyof MilitarySuppliesOverviewRow, "stateId">;

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export const MilitarySuppliesOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("militarySuppliesOverview"));
  const rawRows = useMilitarySuppliesOverviewState(state => state.rows);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = React.useState<SortField>("stateName");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("asc");

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openMilitarySuppliesOverview(), 0);
  }, [isOpen]);

  const rows = React.useMemo(
    () =>
      rawRows.toSorted((left, right) => {
        const leftValue = left[sortBy];
        const rightValue = right[sortBy];
        const comparison =
          typeof leftValue === "string"
            ? leftValue.localeCompare(rightValue as string)
            : (leftValue as number) - (rightValue as number);
        return sortOrder === "asc" ? comparison : -comparison;
      }),
    [rawRows, sortBy, sortOrder]
  );
  const totals = React.useMemo(() => sumRows(rows), [rows]);

  const toggleSortBy = (field: string) => {
    const nextField = field as SortField;
    if (nextField === sortBy) {
      setSortOrder(order => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(nextField);
      setSortOrder(nextField === "stateName" ? "asc" : "desc");
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Military Supplies Overview"
      onClose={() => closeDialog("militarySuppliesOverview")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout
        bodyRef={bodyRef}
        summary={
          <div id="militarySuppliesOverviewSummary" className="totalLine">
            <span data-tip="Serviceable weapon sets held by all states">Arms: {format(totals.arms)}</span>
            {" · "}
            <span data-tip="Military mounts assigned to active mounted units">Mounts: {format(totals.mounts)}</span>
            {" · "}
            <span data-tip="Serviceable firearms held by all states">Muskets: {format(totals.muskets)}</span>
            {" · "}
            <span data-tip="Serviceable cannon held by all states">Artillery: {format(totals.artillery)}</span>
            <br />
            <span data-tip="Finished arrows held in all State military stockpiles">
              Arrows: {format(totals.arrows)}
            </span>
            {" · "}
            <span data-tip="Finished bullets held in all State military stockpiles">
              Bullets: {format(totals.bullets)}
            </span>
            {" · "}
            <span data-tip="Finished gunpowder held in all State military stockpiles">
              Gunpowder: {format(totals.gunpowder)}
            </span>
          </div>
        }
        footer={
          <button
            type="button"
            id="militarySuppliesOverviewRefresh"
            data-tip="Refresh national military supplies"
            className="icon-cw"
            onClick={refreshMilitarySuppliesOverview}
          />
        }
      >
        <p className="note" style={{ marginTop: 0 }}>
          Arms, muskets, and artillery are serviceable State equipment. Arrows, bullets, and gunpowder are stockpiled
          finished Goods available to the State's armies. Mounts are horses or camels assigned to active mounted units.
        </p>
        <table className="fmg-table">
          <thead className="header">
            <tr>
              <SortableHeader
                field="stateName"
                label="State"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
              />
              <SortableHeader
                field="arms"
                label="Arms"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Serviceable weapon sets held by the state"
              />
              <SortableHeader
                field="arrows"
                label="Arrows"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Finished arrows held in the State military stockpile"
              />
              <SortableHeader
                field="mounts"
                label="Mounts"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Horses or camels assigned to active mounted units"
              />
              <SortableHeader
                field="muskets"
                label="Muskets"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Serviceable firearms held by the state"
              />
              <SortableHeader
                field="bullets"
                label="Bullets"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Finished bullets held in the State military stockpile"
              />
              <SortableHeader
                field="artillery"
                label="Artillery"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Serviceable cannon held by the state"
              />
              <SortableHeader
                field="gunpowder"
                label="Gunpowder"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Finished gunpowder held in the State military stockpile"
              />
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={8}>No states or military supply records have been generated yet.</td>
              </tr>
            </tbody>
          ) : (
            <VirtualTableBody items={rows} scrollElementRef={bodyRef} renderRow={renderRow} />
          )}
        </table>
      </TableDialogLayout>
    </Dialog>
  );
};

function renderRow(row: MilitarySuppliesOverviewRow): React.ReactNode {
  return (
    <tr key={row.stateId} data-state-id={row.stateId}>
      <td>{row.stateName}</td>
      <td>{format(row.arms)}</td>
      <td>{format(row.arrows)}</td>
      <td>{format(row.mounts)}</td>
      <td>{format(row.muskets)}</td>
      <td>{format(row.bullets)}</td>
      <td>{format(row.artillery)}</td>
      <td>{format(row.gunpowder)}</td>
    </tr>
  );
}

function sumRows(
  rows: readonly MilitarySuppliesOverviewRow[]
): Omit<MilitarySuppliesOverviewRow, "stateId" | "stateName"> {
  return rows.reduce(
    (totals, row) => ({
      arms: totals.arms + row.arms,
      arrows: totals.arrows + row.arrows,
      mounts: totals.mounts + row.mounts,
      muskets: totals.muskets + row.muskets,
      bullets: totals.bullets + row.bullets,
      artillery: totals.artillery + row.artillery,
      gunpowder: totals.gunpowder + row.gunpowder
    }),
    { arms: 0, arrows: 0, mounts: 0, muskets: 0, bullets: 0, artillery: 0, gunpowder: 0 }
  );
}

function format(value: number): string {
  return numberFormatter.format(value);
}
