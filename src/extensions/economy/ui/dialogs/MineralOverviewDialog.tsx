import React from "react";
import { useTranslation } from "react-i18next";

import { closeDialog, Dialog, useDialogState, VirtualTableBody } from "../../../hostUi";
import { refreshMineralOverview } from "../../controllers/mineralOverview";
import {
  type MineralCommodityOverviewRow,
  type MineralDepositOverviewRow,
  useMineralOverviewState
} from "../../store/mineralOverviewState";

export const MineralOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("mineralOverview"));
  const commodities = useMineralOverviewState(state => state.commodities);
  const deposits = useMineralOverviewState(state => state.deposits);
  const states = useMineralOverviewState(state => state.states);
  const commodityRef = React.useRef<HTMLDivElement>(null);
  const depositRef = React.useRef<HTMLDivElement>(null);
  const [selectedStateId, setSelectedStateId] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      setSelectedStateId(null);
      return;
    }

    const timer = window.setTimeout(() => refreshMineralOverview(selectedStateId), 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, selectedStateId]);

  const activeCount = commodities.filter(row => row.status === "active").length;
  const missingCount = commodities.filter(row => row.status === "absent" || row.status === "exhausted").length;
  const unprospectedCount = commodities.filter(row => row.status === "unprospected").length;

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.mineralsOverview")}
      onClose={() => closeDialog("mineralOverview")}
      className="fmg-dialog--table fmg-dialog--minerals-overview"
    >
      <div className="mineral-overview-dialog">
        <div className="totalLine" id="mineralOverviewSummary">
          <span data-tip={t("extensions.mineralsOverview.activeSupplyTip")}>
            {t("extensions.mineralsOverview.activeSupply", { count: activeCount })}
          </span>
          {" · "}
          <span data-tip={t("extensions.mineralsOverview.toProspectTip")}>
            {t("extensions.mineralsOverview.toProspect", { count: unprospectedCount })}
          </span>
          {" · "}
          <span data-tip={t("extensions.mineralsOverview.unavailableTip")}>
            {t("extensions.mineralsOverview.unavailable", { count: missingCount })}
          </span>
        </div>
        <div className="d-flex header" id="mineralOverviewFilters">
          <label htmlFor="mineralOverviewFilterState" data-tip={t("extensions.mineralsOverview.stateTip")}>
            {t("extensions.mineralsOverview.state")}
            <select
              id="mineralOverviewFilterState"
              value={selectedStateId ?? ""}
              onChange={event => setSelectedStateId(event.target.value === "" ? null : Number(event.target.value))}
            >
              <option value="">{t("extensions.mineralsOverview.allStates")}</option>
              {states.map(state => (
                <option key={state.id} value={state.id}>
                  {state.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <section className="mineral-overview-dialog__section" aria-labelledby="mineralCoverageHeading">
          <h3 id="mineralCoverageHeading">{t("extensions.mineralsOverview.coverage")}</h3>
          <p className="note">{t("extensions.mineralsOverview.coverageNote")}</p>
          <div ref={commodityRef} id="mineralOverviewCoverage" className="table">
            <table className="fmg-table">
              <thead className="header">
                <tr>
                  <th>{t("extensions.mineralsOverview.resource")}</th>
                  <th data-tip={t("extensions.mineralsOverview.supplyStatusTip")}>
                    {t("extensions.mineralsOverview.supplyStatus")}
                  </th>
                  <th data-tip={t("extensions.mineralsOverview.accessTip")}>
                    {t("extensions.mineralsOverview.access")}
                  </th>
                  <th className="numeric" data-tip={t("extensions.mineralsOverview.depositsTip")}>
                    {t("extensions.mineralsOverview.deposits")}
                  </th>
                  <th className="numeric" data-tip={t("extensions.mineralsOverview.knownTip")}>
                    {t("extensions.mineralsOverview.known")}
                  </th>
                  <th className="numeric" data-tip={t("extensions.mineralsOverview.minesTip")}>
                    {t("extensions.mineralsOverview.mines")}
                  </th>
                  <th className="numeric" data-tip={t("extensions.mineralsOverview.reservesTip")}>
                    {t("extensions.mineralsOverview.reserves")}
                  </th>
                  <th className="numeric" data-tip={t("extensions.mineralsOverview.capacityTip")}>
                    {t("extensions.mineralsOverview.capacity")}
                  </th>
                  <th className="numeric" data-tip={t("extensions.mineralsOverview.outputTip")}>
                    {t("extensions.mineralsOverview.output")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {commodities.map(row => (
                  <CommodityRow key={row.commodity} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="mineral-overview-dialog__section" aria-labelledby="mineralDepositsHeading">
          <h3 id="mineralDepositsHeading">{t("extensions.mineralsOverview.depositsHeading")}</h3>
          <div ref={depositRef} id="mineralOverviewDeposits" className="table">
            <table className="fmg-table">
              <thead className="header">
                <tr>
                  <th className="numeric">{t("extensions.mineralsOverview.id")}</th>
                  <th>{t("extensions.mineralsOverview.primary")}</th>
                  <th>{t("extensions.mineralsOverview.resources")}</th>
                  <th>{t("extensions.mineralsOverview.district")}</th>
                  <th>{t("extensions.mineralsOverview.mineStatus")}</th>
                  <th>{t("extensions.mineralsOverview.stateCol")}</th>
                  <th>{t("extensions.mineralsOverview.settlement")}</th>
                  <th className="numeric">{t("extensions.mineralsOverview.depth")}</th>
                  <th className="numeric">{t("extensions.mineralsOverview.richness")}</th>
                  <th className="numeric">{t("extensions.mineralsOverview.reserves")}</th>
                  <th className="numeric">{t("extensions.mineralsOverview.capacity")}</th>
                  <th className="numeric">{t("extensions.mineralsOverview.output")}</th>
                </tr>
              </thead>
              {deposits.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={12}>{t("extensions.mineralsOverview.emptyDeposits")}</td>
                  </tr>
                </tbody>
              ) : (
                <VirtualTableBody
                  items={deposits}
                  scrollElementRef={depositRef}
                  renderRow={row => <DepositRow row={row} />}
                />
              )}
            </table>
          </div>
        </section>
        <div className="footer">
          <button
            type="button"
            id="mineralOverviewRefresh"
            data-tip={t("extensions.mineralsOverview.refreshTip")}
            className="icon-cw"
            onClick={() => refreshMineralOverview(selectedStateId)}
          />
        </div>
      </div>
    </Dialog>
  );
};

const CommodityRow: React.FC<{ row: MineralCommodityOverviewRow }> = ({ row }) => {
  const { t } = useTranslation();
  return (
    <tr data-resource={row.commodity} data-status={row.status}>
      <td>{row.commodity}</td>
      <td data-tip={t(`extensions.mineralsOverview.statusTips.${row.status}`)}>
        {t(`extensions.mineralsOverview.status.${row.status}`)}
      </td>
      <td
        data-tip={
          row.accessStatus
            ? t(`extensions.mineralsOverview.accessTips.${row.accessStatus}`)
            : t("extensions.mineralsOverview.chooseState")
        }
      >
        {row.accessStatus ? t(`extensions.mineralsOverview.accessStatus.${row.accessStatus}`) : "—"}
        {row.incomingUnits ? ` (${row.incomingUnits})` : ""}
      </td>
      <td className="numeric">{row.depositCount}</td>
      <td className="numeric">{row.discoveredCount}</td>
      <td className="numeric">{row.activeMineCount}</td>
      <td className="numeric">{row.reserveTons}</td>
      <td className="numeric">{row.annualCapacityTons}</td>
      <td className="numeric">{row.annualOutputTons}</td>
    </tr>
  );
};

function DepositRow({ row }: { row: MineralDepositOverviewRow }): React.ReactNode {
  const { t } = useTranslation();
  return (
    <tr key={row.id} data-id={row.id} data-status={row.status} data-cell={row.cell} data-state-id={row.stateId}>
      <td className="numeric">{row.id}</td>
      <td>{row.primaryCommodity}</td>
      <td>{row.commodities}</td>
      <td>{row.districtType}</td>
      <td data-tip={t(`extensions.mineralsOverview.statusTips.${row.status}`)}>
        {t(`extensions.mineralsOverview.status.${row.status}`)}
      </td>
      <td>{row.stateName}</td>
      <td>{row.burgName}</td>
      <td className="numeric">{row.depth}</td>
      <td className="numeric">{row.richness}/5</td>
      <td className="numeric">{row.reserveTons}</td>
      <td className="numeric">{row.annualCapacityTons}</td>
      <td className="numeric">{row.annualOutputTons}</td>
    </tr>
  );
}
