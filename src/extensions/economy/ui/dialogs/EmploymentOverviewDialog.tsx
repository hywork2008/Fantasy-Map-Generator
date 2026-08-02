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
          <div
            data-tip="Sum of every listed Burg's employmentDemand (basicEmploymentDemand + serviceEmploymentDemand)"
            className="totalLine"
          >
            Total employment demand: <span id="employmentOverviewTotal">{totalEmploymentDemand.toFixed(1)}</span>
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
          </colgroup>
          <thead className="header">
            <tr>
              <th data-tip="Burg name">Burg</th>
              <th data-tip="Owning state">State</th>
              <th data-tip="Administration employment (state capitals only, §3.4)">Admin</th>
              <th data-tip="Mining employment (§3.2)">Mining</th>
              <th data-tip="Smelting employment (§3.2)">Smelting</th>
              <th data-tip="Trade employment attributed from this Burg's Market (§3.3)">Trade</th>
              <th data-tip="Strategic-industry employment (forestry/sailmaking/ropeMaking/tarBurning — shipbuilding and general Wood supply, §3.8)">
                Industry
              </th>
              <th data-tip="Craft/manufacturing employment observed from recipe-based Goods production, e.g. Cloth/Garments (§3.7)">
                Craft
              </th>
              <th data-tip="Masonry/carpentry (housing backlog), quarrying, and Volcanic Ash — every market Burg gets construction demand when dwellings lag population (urban-housing-system + urban-construction-industry).">
                Construction
              </th>
              <th data-tip="Built permanent dwellings (housing ledger). Households ≈ people / 4.5; people = population × populationRate.">
                Dwellings
              </th>
              <th data-tip="Required dwellings = ceil(population × populationRate / 4.5). Forts and burgs without a market have no housing op.">
                Need
              </th>
              <th data-tip="Housing gap % = share of required dwellings still unbuilt. Raises mason/carpenter demand (size-aware) and material buys.">
                Gap %
              </th>
              <th data-tip="basicEmploymentDemand = Admin + Mining + Smelting + Trade + Industry + Craft + Construction">
                Basic
              </th>
              <th data-tip="serviceEmploymentDemand = basicEmploymentDemand × serviceMultiplier (§3.5)">Service</th>
              <th data-tip="employmentDemand = basicEmploymentDemand + serviceEmploymentDemand — drives urbanLaborIntake in Megacity mode (§3.6)">
                Total
              </th>
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={15}>
                  <span>No Burg has recorded employment demand yet</span>
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
    <td>{row.basicEmploymentDemand}</td>
    <td>{row.serviceEmploymentDemand}</td>
    <td>
      <strong>{row.employmentDemand}</strong>
    </td>
  </tr>
);
