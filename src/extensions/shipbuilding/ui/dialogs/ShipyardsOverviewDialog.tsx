import type React from "react";
import { useRef } from "react";
import { closeDialog, Dialog, useDialogState, VirtualTableBody } from "../../../hostUi";
import { type ShipyardOverviewRow, useShipyardsOverviewState } from "../../store/shipyardsOverviewState";

export const ShipyardsOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("ShipyardsOverviewDialog"));
  const rows = useShipyardsOverviewState(s => s.rows);
  const onZoom = useShipyardsOverviewState(s => s.onZoom);
  const scrollElementRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog isOpen={isOpen} title="Shipyards" onClose={() => closeDialog("ShipyardsOverviewDialog")}>
      <div id="shipyardsOverviewContainer" className="fmg-dialog-content overflow-hidden">
        {rows.length === 0 ? (
          <div className="header">
            <i>No active shipyard queues found.</i>
          </div>
        ) : (
          <div className="table" ref={scrollElementRef}>
            <table className="states-table">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr className="header">
                  <th>Shipyard</th>
                  <th>Owner</th>
                  <th>Building</th>
                  <th>Progress</th>
                  <th>Completed hulls</th>
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
                    <td>{row.completedHulls}</td>
                  </tr>
                )}
              />
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
};
