import React from "react";

import { closeDialog, Dialog, useDialogState, VirtualTableBody } from "../../../hostUi";
import { refreshMineralOverview } from "../../controllers/mineralOverview";
import {
  type MineralAccessStatus,
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

const ACCESS_LABEL: Record<MineralAccessStatus, string> = {
  domestic: "Domestic",
  importing: "Importing",
  embargoed: "Embargoed",
  noDomesticDeposit: "No domestic deposit",
  developing: "Not operating"
};

const ACCESS_TIP: Record<MineralAccessStatus, string> = {
  domestic: "At least one active mine in this State supplies the resource.",
  importing: "A State-funded military-material procurement order is awaiting delivery.",
  embargoed: "A military-material procurement order was blocked because only Enemy supply was available.",
  noDomesticDeposit: "This State has no generated deposit containing this resource.",
  developing: "The resource exists in this State, but no active mine currently supplies it."
};

export const MineralOverviewDialog: React.FC = () => {
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
        <div className="d-flex header" id="mineralOverviewFilters">
          <label
            htmlFor="mineralOverviewFilterState"
            data-tip="Filter deposits and resource totals by the State that contains each deposit"
          >
            State:
            <select
              id="mineralOverviewFilterState"
              value={selectedStateId ?? ""}
              onChange={event => setSelectedStateId(event.target.value === "" ? null : Number(event.target.value))}
            >
              <option value="">All states</option>
              {states.map(state => (
                <option key={state.id} value={state.id}>
                  {state.name}
                </option>
              ))}
            </select>
          </label>
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
                  <th data-tip="Domestic supply, import in transit, embargo, or local access state">Access</th>
                  <th className="numeric" data-tip="All generated deposits containing this resource">
                    Deposits
                  </th>
                  <th className="numeric" data-tip="Deposits found by prospecting or an established mine">
                    Known
                  </th>
                  <th className="numeric" data-tip="Mines currently supplying this resource">
                    Mines
                  </th>
                  <th className="numeric" data-tip="Recoverable material remaining across all deposits (tons)">
                    Reserves (t)
                  </th>
                  <th className="numeric" data-tip="Full potential annual extraction across all deposits (tons/year)">
                    Capacity (t/y)
                  </th>
                  <th className="numeric" data-tip="Last annualized output recorded by active mines (tons/year)">
                    Output (t/y)
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
          <h3 id="mineralDepositsHeading">Deposits</h3>
          <div ref={depositRef} id="mineralOverviewDeposits" className="table">
            <table className="fmg-table">
              <thead className="header">
                <tr>
                  <th className="numeric">ID</th>
                  <th>Primary resource</th>
                  <th>Resources</th>
                  <th>District</th>
                  <th>Mine status</th>
                  <th>State</th>
                  <th>Settlement</th>
                  <th className="numeric">Depth</th>
                  <th className="numeric">Richness</th>
                  <th className="numeric">Reserves (t)</th>
                  <th className="numeric">Capacity (t/y)</th>
                  <th className="numeric">Output (t/y)</th>
                </tr>
              </thead>
              {deposits.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={12}>No mineral deposits match this State</td>
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
            onClick={() => refreshMineralOverview(selectedStateId)}
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
    <td data-tip={row.accessStatus ? ACCESS_TIP[row.accessStatus] : "Choose a State to inspect national access."}>
      {row.accessStatus ? ACCESS_LABEL[row.accessStatus] : "—"}
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

function renderDepositRow(row: MineralDepositOverviewRow): React.ReactNode {
  return (
    <tr key={row.id} data-id={row.id} data-status={row.status} data-cell={row.cell} data-state-id={row.stateId}>
      <td className="numeric">{row.id}</td>
      <td>{row.primaryCommodity}</td>
      <td>{row.commodities}</td>
      <td>{row.districtType}</td>
      <td data-tip={STATUS_TIP[row.status]}>{STATUS_LABEL[row.status]}</td>
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
