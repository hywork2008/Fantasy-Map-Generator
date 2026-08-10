import React from "react";

import { closeDialog, Dialog, useDialogState, VirtualTableBody } from "../../../hostUi";
import {
  open as openMetallurgWorkOverview,
  refreshMetallurgWorkOverview
} from "../../controllers/metallurgWorkOverview";
import {
  type MetallurgMaterialForecastRow,
  type MetallurgWorkOrderRow,
  useMetallurgWorkOverviewState
} from "../../store/metallurgWorkOverviewState";

const KIND_LABEL: Record<MetallurgWorkOrderRow["kind"], string> = {
  newBuild: "NEW",
  replacement: "REPLACE",
  maintenance: "REPAIR",
  consumable: "SUPPLY"
};

const STATUS_LABEL: Record<MetallurgWorkOrderRow["status"], string> = {
  queued: "QUEUED",
  waitingMaterials: "MATERIALS",
  inProgress: "WORKING",
  completed: "DONE"
};

export const MetallurgWorkDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("metallurgWorkOverview"));
  const orders = useMetallurgWorkOverviewState(state => state.orders);
  const materials = useMetallurgWorkOverviewState(state => state.materials);
  const queuedWork = useMetallurgWorkOverviewState(state => state.queuedWork);
  const blockedWork = useMetallurgWorkOverviewState(state => state.blockedWork);
  const shortageCount = useMetallurgWorkOverviewState(state => state.shortageCount);
  const ordersRef = React.useRef<HTMLDivElement>(null);
  const materialsRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openMetallurgWorkOverview(), 0);
  }, [isOpen]);

  return (
    <Dialog
      isOpen={isOpen}
      title="Metallurg Work"
      onClose={() => closeDialog("metallurgWorkOverview")}
      className="fmg-dialog--table"
    >
      <div id="metallurgWorkOverviewSummary" className="totalLine">
        <span data-tip="Total unfinished work units in the Metallurg queue">Queued work: {queuedWork}</span>
        {" · "}
        <span data-tip="Work waiting on at least one predicted material shortage">Blocked work: {blockedWork}</span>
        {" · "}
        <span data-tip="Market-and-material combinations projected to run short">
          Material shortages: {shortageCount}
        </span>
      </div>

      <section aria-labelledby="metallurgWorkOrdersHeading">
        <h3 id="metallurgWorkOrdersHeading">Work queue</h3>
        <div ref={ordersRef} id="metallurgWorkOrders" className="table">
          <table className="fmg-table">
            <thead className="header">
              <tr>
                <th>Owner</th>
                <th>Work</th>
                <th>Type</th>
                <th>Status</th>
                <th>Units</th>
                <th>Work</th>
                <th>Materials</th>
              </tr>
            </thead>
            {orders.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={7}>No Metallurg work is planned yet</td>
                </tr>
              </tbody>
            ) : (
              <VirtualTableBody items={orders} scrollElementRef={ordersRef} renderRow={renderWorkOrderRow} />
            )}
          </table>
        </div>
      </section>

      <section aria-labelledby="metallurgMaterialForecastHeading">
        <h3 id="metallurgMaterialForecastHeading">Material forecast</h3>
        <div ref={materialsRef} id="metallurgMaterialForecast" className="table">
          <table className="fmg-table">
            <thead className="header">
              <tr>
                <th>Market</th>
                <th>Material</th>
                <th>Required</th>
                <th>Stock</th>
                <th>Inbound</th>
                <th>Shortage</th>
                <th>Orders</th>
              </tr>
            </thead>
            {materials.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={7}>No material requirements are queued</td>
                </tr>
              </tbody>
            ) : (
              <VirtualTableBody
                items={materials}
                scrollElementRef={materialsRef}
                renderRow={renderMaterialForecastRow}
              />
            )}
          </table>
        </div>
      </section>

      <div className="footer">
        <button
          type="button"
          id="metallurgWorkOverviewRefresh"
          data-tip="Refresh the Metallurg work and material forecasts"
          className="icon-cw"
          onClick={refreshMetallurgWorkOverview}
        />
      </div>
    </Dialog>
  );
};

function renderWorkOrderRow(order: MetallurgWorkOrderRow): React.ReactNode {
  return (
    <tr key={order.id} data-id={order.id} data-status={order.status}>
      <td>{order.ownerName}</td>
      <td>{order.productName}</td>
      <td>{KIND_LABEL[order.kind]}</td>
      <td>{STATUS_LABEL[order.status]}</td>
      <td>{order.remainingUnits}</td>
      <td>{order.remainingWork}</td>
      <td>
        <progress value={order.materialCoverage} max={1} aria-label={`${order.productName} material coverage`} />{" "}
        {Math.round(order.materialCoverage * 100)}%
      </td>
    </tr>
  );
}

function renderMaterialForecastRow(material: MetallurgMaterialForecastRow): React.ReactNode {
  return (
    <tr key={material.id} data-id={material.id} data-shortage={material.projectedShortage > 0 ? "true" : "false"}>
      <td>{material.marketName}</td>
      <td>{material.materialName}</td>
      <td>{material.requiredUnits}</td>
      <td>{material.availableMarketStock}</td>
      <td>{material.inboundUnits}</td>
      <td>{material.projectedShortage}</td>
      <td>{material.workOrderCount}</td>
    </tr>
  );
}
