import type React from "react";
import { useRef } from "react";
import { closeDialog, Dialog, TableDialogLayout, useDialogState, VirtualTableBody } from "../../../hostUi";
import { type ShipyardOverviewRow, useShipyardsOverviewState } from "../../store/shipyardsOverviewState";

export const ShipyardsOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("ShipyardsOverviewDialog"));
  const rows = useShipyardsOverviewState(s => s.rows);
  const onZoom = useShipyardsOverviewState(s => s.onZoom);
  const scrollElementRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog
      isOpen={isOpen}
      title="Shipyards Overview"
      onClose={() => closeDialog("ShipyardsOverviewDialog")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout bodyRef={scrollElementRef} className="shipyards-overview-dialog">
        {rows.length === 0 ? (
          <div>
            <i>No active shipyard queues found.</i>
          </div>
        ) : (
          <table className="fmg-table states-table">
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
            </colgroup>
            <thead>
              <tr>
                <th>Shipyard</th>
                <th>Owner</th>
                <th>Building</th>
                <th>Progress</th>
                <th data-tip="Construction consumes Wood, Sails, Ropes, and Tar from this shipyard's local market">
                  Materials
                </th>
                <th data-tip="Each material is shown as local stock / yearly construction demand / 365-day reserve target">
                  Strategic stock
                </th>
                <th data-tip="Strategic procurement orders and cargo tracking begin in Phase 9.2">Procurement</th>
                <th>Completed hulls</th>
                <th data-tip="Docked / port capacity, by size tier">Port (docked/capacity)</th>
                <th data-tip="Hulls out on a trade/training voyage, not occupying a berth">At sea</th>
              </tr>
            </thead>
            <VirtualTableBody
              items={rows}
              scrollElementRef={scrollElementRef}
              renderRow={(row: ShipyardOverviewRow) => (
                <tr
                  key={row.burgId}
                  data-tip="Click to zoom to shipyard"
                  className="states pointer"
                  onClick={() => onZoom(row.x, row.y)}
                >
                  <td>{row.burgName}</td>
                  <td>{row.ownerLabel}</td>
                  <td>{row.shipClassName}</td>
                  <td>{row.progressPct}%</td>
                  <td>{row.materialStatus}</td>
                  <td>{row.strategicMaterialSummary}</td>
                  <td>{row.procurementStatus}</td>
                  <td>{row.completedHulls}</td>
                  <td>{row.portOccupancyLabel}</td>
                  <td>{row.atSeaCount}</td>
                </tr>
              )}
            />
          </table>
        )}
      </TableDialogLayout>
    </Dialog>
  );
};
