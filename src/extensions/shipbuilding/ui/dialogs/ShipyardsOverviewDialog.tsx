import type React from "react";
import { Dialog } from "../../../hostUi";
import { closeShipyardsOverview } from "../../controllers/shipyards-overview";
import { useShipyardsOverviewState } from "../../store/shipyardsOverviewState";

export const ShipyardsOverviewDialog: React.FC = () => {
  const isOpen = useShipyardsOverviewState(s => s.isOpen);
  const rows = useShipyardsOverviewState(s => s.rows);
  const onZoom = useShipyardsOverviewState(s => s.onZoom);

  return (
    <Dialog isOpen={isOpen} title="Shipyards" onClose={closeShipyardsOverview}>
      <div id="shipyardsOverviewContainer">
        {rows.length === 0 ? (
          <i>No active shipyard queues found.</i>
        ) : (
          <div className="table">
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
              <tbody>
                {rows.map(row => (
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
};
