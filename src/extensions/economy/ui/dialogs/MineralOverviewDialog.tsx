import React from "react";

import { closeDialog, Dialog, useDialogState, VirtualTableBody } from "../../../hostUi";
import { open as openMineralOverview, refreshMineralOverview } from "../../controllers/mineralOverview";
import {
  type MineralCommodityOverviewRow,
  type MineralDepositOverviewRow,
  type MineralSupplyStatus,
  useMineralOverviewState
} from "../../store/mineralOverviewState";

const STATUS_LABEL: Record<MineralSupplyStatus, string> = {
  active: "Active",
  idle: "Idle",
  unprospected: "Unprospected",
  exhausted: "Exhausted",
  absent: "Absent"
};

const STATUS_TIP: Record<MineralSupplyStatus, string> = {
  active: "At least one mine is actively supplying this resource.",
  idle: "The deposit is known, but no active mine currently supplies it.",
  unprospected: "The resource exists in the generated geology but has not been discovered by a mine operation.",
  exhausted: "Every generated deposit of this resource is exhausted.",
  absent: "This map generated no deposit containing this resource."
};

export const MineralOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("mineralOverview"));
  const commodities = useMineralOverviewState(state => state.commodities);
  const deposits = useMineralOverviewState(state => state.deposits);
  const commodityRef = React.useRef<HTMLDivElement>(null);
  const depositRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openMineralOverview(), 0);
  }, [isOpen]);

  const activeCount = commodities.filter(row => row.status === "active").length;
  const missingCount = commodities.filter(row => row.status === "absent" || row.status === "exhausted").length;
  const unprospectedCount = commodities.filter(row => row.status === "unprospected").length;

  return (
    <Dialog
      isOpen={isOpen}
      title="Minerals Overview"
      onClose={() => closeDialog("mineralOverview")}
      className="fmg-dialog--table fmg-dialog--minerals-overview"
    >
      <div className="mineral-overview-dialog">
        <div className="totalLine" id="mineralOverviewSummary">
          <span data-tip="Mineral types currently produced by one or more active mines">
            Active supply: {activeCount}
          </span>
          {" · "}
          <span data-tip="Mineral types generated in geology but not yet discovered">
            To prospect: {unprospectedCount}
          </span>
          {" · "}
          <span data-tip="Mineral types with no remaining source on this map">Unavailable: {missingCount}</span>
        </div>
        <section className="mineral-overview-dialog__section" aria-labelledby="mineralCoverageHeading">
          <h3 id="mineralCoverageHeading">Resource coverage</h3>
          <p className="note">
            Capacity and reserves include all generated deposits, including unprospected ones. Output reflects active
            mines.
          </p>
          <div ref={commodityRef} id="mineralOverviewCoverage" className="table">
            <table className="fmg-table">
              <thead className="header">
                <tr>
                  <th>Resource</th>
                  <th data-tip="Active, idle, unprospected, exhausted, or absent">Supply status</th>
                  <th data-tip="All generated deposits containing this resource">Deposits</th>
                  <th data-tip="Deposits found by prospecting or an established mine">Known</th>
                  <th data-tip="Mines currently supplying this resource">Mines</th>
                  <th data-tip="Recoverable material remaining across all deposits (tons)">Reserves (t)</th>
                  <th data-tip="Full potential annual extraction across all deposits (tons/year)">Capacity (t/y)</th>
                  <th data-tip="Last annualized output recorded by active mines (tons/year)">Output (t/y)</th>
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
          <h3 id="mineralDepositsHeading">Deposits</h3>
          <div ref={depositRef} id="mineralOverviewDeposits" className="table">
            <table className="fmg-table">
              <thead className="header">
                <tr>
                  <th>ID</th>
                  <th>Primary resource</th>
                  <th>Resources</th>
                  <th>District</th>
                  <th>Mine status</th>
                  <th>Settlement</th>
                  <th>Depth</th>
                  <th>Richness</th>
                  <th>Reserves (t)</th>
                  <th>Capacity (t/y)</th>
                  <th>Output (t/y)</th>
                </tr>
              </thead>
              {deposits.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={11}>No mineral deposits have been generated yet</td>
                  </tr>
                </tbody>
              ) : (
                <VirtualTableBody items={deposits} scrollElementRef={depositRef} renderRow={renderDepositRow} />
              )}
            </table>
          </div>
        </section>
        <div className="footer">
          <button
            type="button"
            id="mineralOverviewRefresh"
            data-tip="Refresh mineral deposits, reserves, and mine output"
            className="icon-cw"
            onClick={refreshMineralOverview}
          />
        </div>
      </div>
    </Dialog>
  );
};

const CommodityRow: React.FC<{ row: MineralCommodityOverviewRow }> = ({ row }) => (
  <tr data-resource={row.commodity} data-status={row.status}>
    <td>{row.commodity}</td>
    <td data-tip={STATUS_TIP[row.status]}>{STATUS_LABEL[row.status]}</td>
    <td>{row.depositCount}</td>
    <td>{row.discoveredCount}</td>
    <td>{row.activeMineCount}</td>
    <td>{row.reserveTons}</td>
    <td>{row.annualCapacityTons}</td>
    <td>{row.annualOutputTons}</td>
  </tr>
);

function renderDepositRow(row: MineralDepositOverviewRow): React.ReactNode {
  return (
    <tr key={row.id} data-id={row.id} data-status={row.status} data-cell={row.cell}>
      <td>{row.id}</td>
      <td>{row.primaryCommodity}</td>
      <td>{row.commodities}</td>
      <td>{row.districtType}</td>
      <td data-tip={STATUS_TIP[row.status]}>{STATUS_LABEL[row.status]}</td>
      <td>{row.burgName}</td>
      <td>{row.depth}</td>
      <td>{row.richness}/5</td>
      <td>{row.reserveTons}</td>
      <td>{row.annualCapacityTons}</td>
      <td>{row.annualOutputTons}</td>
    </tr>
  );
}
