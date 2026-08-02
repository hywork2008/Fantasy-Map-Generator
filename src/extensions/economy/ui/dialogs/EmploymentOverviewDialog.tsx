import React from "react";

import { closeDialog, Dialog, TableDialogLayout, useDialogState, VirtualTableBody } from "../../../hostUi";

import { open as openEmploymentOverview, refreshEmploymentOverview } from "../../controllers/employment-overview";
import { type EmploymentOverviewRow, useEmploymentOverviewState } from "../../store/employmentOverviewState";

export const EmploymentOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("employmentOverview"));
  const rows = useEmploymentOverviewState(state => state.rows);

  const parentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openEmploymentOverview(), 0);
  }, [isOpen]);

  const totalEmploymentDemand = rows.reduce((sum, row) => sum + row.employmentDemand, 0);
  const totalResidual = rows.reduce((sum, row) => sum + Math.max(0, row.laborResidual), 0);
  const highUnemployment = rows.filter(row => row.marketUnemploymentPct >= 20).length;

  return (
    <Dialog
      isOpen={isOpen}
      title="Employment Overview"
      onClose={() => closeDialog("employmentOverview")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout
        bodyRef={parentRef}
        summary={
          <div className="totalLine">
            <span data-tip="Sum of every listed Burg's employmentDemand (basic + service)">
              Total demand: <span id="employmentOverviewTotal">{totalEmploymentDemand.toFixed(1)}</span>
            </span>
            {" · "}
            <span data-tip="Sum of positive labor residual (market adults still unassigned after household care)">
              Residual labor: <span id="employmentOverviewResidual">{totalResidual.toFixed(1)}</span>
            </span>
            {" · "}
            <span data-tip="Burgs with market unemployment ≥ 20%">
              High u (≥20%): <span id="employmentOverviewHighU">{highUnemployment}</span>
            </span>
          </div>
        }
        footer={
          <button
            type="button"
            id="employmentOverviewRefresh"
            data-tip="Refresh the Employment Overview"
            className="icon-cw"
            onClick={refreshEmploymentOverview}
          />
        }
      >
        <table className="fmg-table">
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
          <thead className="header">
            <tr>
              <th data-tip="Burg name">Burg</th>
              <th data-tip="Owning state">State</th>
              <th data-tip="Administration employment (state capitals only)">Admin</th>
              <th data-tip="Mining employment">Mining</th>
              <th data-tip="Smelting employment">Smelting</th>
              <th data-tip="Trade employment from this Burg's Market">Trade</th>
              <th data-tip="Strategic industry (forestry, sailmaking, rope, tar)">Industry</th>
              <th data-tip="Craft/manufacturing from recipe production">Craft</th>
              <th data-tip="Masonry/carpentry, quarrying, volcanic ash">Construction</th>
              <th data-tip="Built permanent dwellings">Dwellings</th>
              <th data-tip="Required dwellings (pop × rate / 4.5)">Need</th>
              <th data-tip="Housing gap % still unbuilt">Gap %</th>
              <th data-tip="Estimated new dwellings under construction (labor-limited)">Building</th>
              <th data-tip="Household care / domestic band (non-market adults, population points)">Care</th>
              <th data-tip="Market labor force after household care">Market</th>
              <th data-tip="Unassigned market adults (residual). Positive ⇒ room for more jobs">Residual</th>
              <th data-tip="Market unemployment % among market labor force (care excluded)">u %</th>
              <th data-tip="Suggested sector to expand when residual is high">Focus</th>
              <th data-tip="basicEmploymentDemand (assigned seats + trade/craft attribution)">Basic</th>
              <th data-tip="serviceEmploymentDemand ≈ basic × 1.5">Service</th>
              <th data-tip="basic + service demand (urban labor intake driver in Megacity mode)">Total</th>
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={21}>
                  <span>No Burg has recorded employment or demographics yet</span>
                </td>
              </tr>
            </tbody>
          ) : (
            <VirtualTableBody
              items={rows}
              scrollElementRef={parentRef}
              renderRow={(row: EmploymentOverviewRow) => <EmploymentRow key={row.id} row={row} />}
            />
          )}
        </table>
      </TableDialogLayout>
    </Dialog>
  );
};

const EmploymentRow: React.FC<{ row: EmploymentOverviewRow }> = ({ row }) => (
  <tr className="states" data-id={row.id} data-burg={row.burgName}>
    <td data-tip={row.burgName}>
      {row.isCapital && <i className="icon-star" data-tip="State capital" />} {row.burgName}
    </td>
    <td>{row.stateName}</td>
    <td>{row.administration || ""}</td>
    <td>{row.mining || ""}</td>
    <td>{row.smelting || ""}</td>
    <td>{row.trade || ""}</td>
    <td>{row.strategicIndustry || ""}</td>
    <td>{row.craft || ""}</td>
    <td>{row.construction || ""}</td>
    <td
      data-tip={
        row.requiredDwellings > 0
          ? `${row.dwellings} built / ${row.requiredDwellings} required dwellings`
          : "No housing operation for this burg"
      }
    >
      {row.requiredDwellings > 0 ? Math.round(row.dwellings) : ""}
    </td>
    <td data-tip={row.requiredDwellings > 0 ? "Required permanent dwellings" : ""}>{row.requiredDwellings || ""}</td>
    <td data-tip={row.requiredDwellings > 0 ? `${row.housingGapPct}% of required dwellings still unbuilt` : ""}>
      {row.requiredDwellings > 0 ? `${row.housingGapPct}%` : ""}
    </td>
    <td data-tip={row.underConstruction > 0 ? "Est. dwellings under construction this year" : ""}>
      {row.underConstruction > 0 ? row.underConstruction : ""}
    </td>
    <td data-tip={row.householdCare > 0 ? "Non-market household care band" : ""}>
      {row.householdCare > 0 ? row.householdCare : ""}
    </td>
    <td data-tip={row.marketLaborForce > 0 ? "Adults available for market work" : ""}>
      {row.marketLaborForce > 0 ? row.marketLaborForce : ""}
    </td>
    <td
      data-tip={
        row.marketLaborForce > 0
          ? `Residual ${row.laborResidual} of ${row.marketLaborForce} market adults`
          : "No labor ledger (missing demographics)"
      }
    >
      {row.marketLaborForce > 0 ? row.laborResidual : ""}
    </td>
    <td data-tip={row.marketLaborForce > 0 ? "Market unemployment (care excluded)" : ""}>
      {row.marketLaborForce > 0 ? `${row.marketUnemploymentPct}%` : ""}
    </td>
    <td data-tip={row.employmentFocus !== "—" ? row.employmentFocus : ""}>
      {row.employmentFocus !== "—" ? row.employmentFocus : ""}
    </td>
    <td>{row.basicEmploymentDemand || ""}</td>
    <td>{row.serviceEmploymentDemand || ""}</td>
    <td>
      <strong>{row.employmentDemand || ""}</strong>
    </td>
  </tr>
);
