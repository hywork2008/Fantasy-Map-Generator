import React from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
      title={t("extensions.titles.militarySupplies")}
      onClose={() => closeDialog("militarySuppliesOverview")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout
        bodyRef={bodyRef}
        summary={
          <div id="militarySuppliesOverviewSummary" className="totalLine">
            <span data-tip={t("extensions.militarySupplies.armsTip")}>
              {t("extensions.militarySupplies.arms", { value: format(totals.arms) })}
            </span>
            {" · "}
            <span data-tip={t("extensions.militarySupplies.mountsTip")}>
              {t("extensions.militarySupplies.mounts", { value: format(totals.mounts) })}
            </span>
            {" · "}
            <span data-tip={t("extensions.militarySupplies.musketsTip")}>
              {t("extensions.militarySupplies.muskets", { value: format(totals.muskets) })}
            </span>
            {" · "}
            <span data-tip={t("extensions.militarySupplies.artilleryTip")}>
              {t("extensions.militarySupplies.artillery", { value: format(totals.artillery) })}
            </span>
            <br />
            <span data-tip={t("extensions.militarySupplies.arrowsTip")}>
              {t("extensions.militarySupplies.arrows", { value: format(totals.arrows) })}
            </span>
            {" · "}
            <span data-tip={t("extensions.militarySupplies.bulletsTip")}>
              {t("extensions.militarySupplies.bullets", { value: format(totals.bullets) })}
            </span>
            {" · "}
            <span data-tip={t("extensions.militarySupplies.gunpowderTip")}>
              {t("extensions.militarySupplies.gunpowder", { value: format(totals.gunpowder) })}
            </span>
          </div>
        }
        footer={
          <button
            type="button"
            id="militarySuppliesOverviewRefresh"
            data-tip={t("extensions.militarySupplies.refreshTip")}
            className="icon-cw"
            onClick={refreshMilitarySuppliesOverview}
          />
        }
      >
        <p className="note" style={{ marginTop: 0 }}>
          {t("extensions.militarySupplies.note")}
        </p>
        <table className="fmg-table">
          <thead className="header">
            <tr>
              <SortableHeader
                field="stateName"
                label={t("extensions.militarySupplies.state")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
              />
              <SortableHeader
                field="arms"
                label={t("extensions.militarySupplies.armsCol")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.militarySupplies.armsColTip")}
              />
              <SortableHeader
                field="arrows"
                label={t("extensions.militarySupplies.arrowsCol")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.militarySupplies.arrowsColTip")}
              />
              <SortableHeader
                field="mounts"
                label={t("extensions.militarySupplies.mountsCol")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.militarySupplies.mountsColTip")}
              />
              <SortableHeader
                field="muskets"
                label={t("extensions.militarySupplies.musketsCol")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.militarySupplies.musketsColTip")}
              />
              <SortableHeader
                field="bullets"
                label={t("extensions.militarySupplies.bulletsCol")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.militarySupplies.bulletsColTip")}
              />
              <SortableHeader
                field="artillery"
                label={t("extensions.militarySupplies.artilleryCol")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.militarySupplies.artilleryColTip")}
              />
              <SortableHeader
                field="gunpowder"
                label={t("extensions.militarySupplies.gunpowderCol")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.militarySupplies.gunpowderColTip")}
              />
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={8}>{t("extensions.militarySupplies.empty")}</td>
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
      <td className="numeric">{format(row.arms)}</td>
      <td className="numeric">{format(row.arrows)}</td>
      <td className="numeric">{format(row.mounts)}</td>
      <td className="numeric">{format(row.muskets)}</td>
      <td className="numeric">{format(row.bullets)}</td>
      <td className="numeric">{format(row.artillery)}</td>
      <td className="numeric">{format(row.gunpowder)}</td>
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
