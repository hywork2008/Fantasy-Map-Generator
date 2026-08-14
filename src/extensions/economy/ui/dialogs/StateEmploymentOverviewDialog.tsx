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
  open as openStateEmploymentOverview,
  refreshStateEmploymentOverview
} from "../../controllers/state-employment-overview";
import {
  type StateEmploymentOverviewRow,
  useStateEmploymentOverviewState
} from "../../store/stateEmploymentOverviewState";

type SortField = Exclude<keyof StateEmploymentOverviewRow, "stateId">;

const numberFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export const StateEmploymentOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("stateEmploymentOverview"));
  const rawRows = useStateEmploymentOverviewState(state => state.rows);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = React.useState<SortField>("unemploymentPct");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openStateEmploymentOverview(), 0);
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
      title={t("economy.stateEmploymentOverview.dialogTitle")}
      onClose={() => closeDialog("stateEmploymentOverview")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout
        bodyRef={bodyRef}
        summary={
          <div id="stateEmploymentOverviewSummary" className="totalLine">
            <span data-tip={t("economy.stateEmploymentOverview.summary.laborForceTip")}>
              {t("economy.stateEmploymentOverview.summary.laborForce")}: {format(totals.totalLaborForce)}
            </span>
            {" · "}
            <span data-tip={t("economy.stateEmploymentOverview.summary.surplusTip")}>
              {t("economy.stateEmploymentOverview.summary.surplus")}: {format(totals.totalSurplus)}
            </span>
            {" · "}
            <span data-tip={t("economy.stateEmploymentOverview.summary.craftTip")}>
              {t("economy.stateEmploymentOverview.summary.craft")}: {format(totals.craft)}
            </span>
          </div>
        }
        footer={
          <button
            type="button"
            id="stateEmploymentOverviewRefresh"
            data-tip={t("economy.stateEmploymentOverview.refreshTip")}
            className="icon-cw"
            onClick={refreshStateEmploymentOverview}
          />
        }
      >
        <p className="note" style={{ marginTop: 0 }}>
          {t("economy.stateEmploymentOverview.note")}
        </p>
        <table className="fmg-table">
          <thead className="header">
            <tr>
              <SortableHeader
                field="stateName"
                label={t("economy.stateEmploymentOverview.columns.state")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
              />
              <SortableHeader
                field="totalLaborForce"
                label={t("economy.stateEmploymentOverview.columns.totalLaborForce")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.totalLaborForceTip")}
              />
              <SortableHeader
                field="ruralPopulation"
                label={t("economy.stateEmploymentOverview.columns.ruralPopulation")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.ruralPopulationTip")}
              />
              <SortableHeader
                field="ruralEmployed"
                label={t("economy.stateEmploymentOverview.columns.ruralEmployed")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.ruralEmployedTip")}
              />
              <SortableHeader
                field="huntingWorkers"
                label={t("economy.stateEmploymentOverview.columns.hunting")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.huntingTip")}
              />
              <SortableHeader
                field="fishingWorkers"
                label={t("economy.stateEmploymentOverview.columns.fishing")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.fishingTip")}
              />
              <SortableHeader
                field="viticultureWorkers"
                label={t("economy.stateEmploymentOverview.columns.viticulture")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.viticultureTip")}
              />
              <SortableHeader
                field="husbandryWorkers"
                label={t("economy.stateEmploymentOverview.columns.husbandry")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.husbandryTip")}
              />
              <SortableHeader
                field="ruralSurplus"
                label={t("economy.stateEmploymentOverview.columns.ruralSurplus")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.ruralSurplusTip")}
              />
              <SortableHeader
                field="urbanPopulation"
                label={t("economy.stateEmploymentOverview.columns.urbanPopulation")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.urbanPopulationTip")}
              />
              <SortableHeader
                field="administration"
                label={t("economy.stateEmploymentOverview.columns.administration")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.administrationTip")}
              />
              <SortableHeader
                field="mining"
                label={t("economy.stateEmploymentOverview.columns.mining")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.miningTip")}
              />
              <SortableHeader
                field="smelting"
                label={t("economy.stateEmploymentOverview.columns.smelting")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.smeltingTip")}
              />
              <SortableHeader
                field="trade"
                label={t("economy.stateEmploymentOverview.columns.trade")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.tradeTip")}
              />
              <SortableHeader
                field="strategicIndustry"
                label={t("economy.stateEmploymentOverview.columns.strategicIndustry")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.strategicIndustryTip")}
              />
              <SortableHeader
                field="craft"
                label={t("economy.stateEmploymentOverview.columns.craft")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.craftTip")}
              />
              <SortableHeader
                field="construction"
                label={t("economy.stateEmploymentOverview.columns.construction")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.constructionTip")}
              />
              <SortableHeader
                field="urbanSurplus"
                label={t("economy.stateEmploymentOverview.columns.urbanSurplus")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.urbanSurplusTip")}
              />
              <SortableHeader
                field="totalSurplus"
                label={t("economy.stateEmploymentOverview.columns.totalSurplus")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.totalSurplusTip")}
              />
              <SortableHeader
                field="unemploymentPct"
                label={t("economy.stateEmploymentOverview.columns.unemploymentPct")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("economy.stateEmploymentOverview.columns.unemploymentPctTip")}
              />
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={19}>{t("economy.stateEmploymentOverview.emptyState")}</td>
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

function renderRow(row: StateEmploymentOverviewRow): React.ReactNode {
  return (
    <tr key={row.stateId} data-state-id={row.stateId}>
      <td>{row.stateName}</td>
      <td className="numeric">{format(row.totalLaborForce)}</td>
      <td className="numeric">{format(row.ruralPopulation)}</td>
      <td className="numeric">{format(row.ruralEmployed)}</td>
      <td className="numeric">{row.huntingWorkers > 0 ? format(row.huntingWorkers) : ""}</td>
      <td className="numeric">{row.fishingWorkers > 0 ? format(row.fishingWorkers) : ""}</td>
      <td className="numeric">{row.viticultureWorkers > 0 ? format(row.viticultureWorkers) : ""}</td>
      <td className="numeric">{row.husbandryWorkers > 0 ? format(row.husbandryWorkers) : ""}</td>
      <td className="numeric">{format(row.ruralSurplus)}</td>
      <td className="numeric">{format(row.urbanPopulation)}</td>
      <td className="numeric">{row.administration > 0 ? format(row.administration) : ""}</td>
      <td className="numeric">{row.mining > 0 ? format(row.mining) : ""}</td>
      <td className="numeric">{row.smelting > 0 ? format(row.smelting) : ""}</td>
      <td className="numeric">{row.trade > 0 ? format(row.trade) : ""}</td>
      <td className="numeric">{row.strategicIndustry > 0 ? format(row.strategicIndustry) : ""}</td>
      <td className="numeric">{row.craft > 0 ? format(row.craft) : ""}</td>
      <td className="numeric">{row.construction > 0 ? format(row.construction) : ""}</td>
      <td className="numeric">{format(row.urbanSurplus)}</td>
      <td className="numeric">
        <strong>{format(row.totalSurplus)}</strong>
      </td>
      <td className="numeric">{row.unemploymentPct}%</td>
    </tr>
  );
}

function sumRows(
  rows: readonly StateEmploymentOverviewRow[]
): Pick<StateEmploymentOverviewRow, "totalLaborForce" | "totalSurplus" | "craft"> {
  return rows.reduce(
    (totals, row) => ({
      totalLaborForce: totals.totalLaborForce + row.totalLaborForce,
      totalSurplus: totals.totalSurplus + row.totalSurplus,
      craft: totals.craft + row.craft
    }),
    { totalLaborForce: 0, totalSurplus: 0, craft: 0 }
  );
}

function format(value: number): string {
  return numberFormatter.format(value);
}
