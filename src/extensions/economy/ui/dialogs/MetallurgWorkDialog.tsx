import React from "react";
import { useTranslation } from "react-i18next";

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

const KIND_LABEL_KEY: Record<MetallurgWorkOrderRow["kind"], string> = {
  newBuild: "extensions.metallurgWork.kindNew",
  replacement: "extensions.metallurgWork.kindReplace",
  maintenance: "extensions.metallurgWork.kindRepair",
  consumable: "extensions.metallurgWork.kindSupply"
};

const STATUS_LABEL_KEY: Record<MetallurgWorkOrderRow["status"], string> = {
  queued: "extensions.metallurgWork.statusQueued",
  waitingMaterials: "extensions.metallurgWork.statusMaterials",
  inProgress: "extensions.metallurgWork.statusWorking",
  completed: "extensions.metallurgWork.statusDone"
};

export const MetallurgWorkDialog: React.FC = () => {
  const { t } = useTranslation();
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
      title={t("extensions.titles.metallurgWork")}
      onClose={() => closeDialog("metallurgWorkOverview")}
      className="fmg-dialog--table fmg-dialog--metallurg-work"
    >
      <div className="metallurg-work-dialog">
        <div id="metallurgWorkOverviewSummary" className="totalLine">
          <span data-tip={t("extensions.metallurgWork.queuedTip")}>
            {t("extensions.metallurgWork.queued", { value: queuedWork })}
          </span>
          {" · "}
          <span data-tip={t("extensions.metallurgWork.blockedTip")}>
            {t("extensions.metallurgWork.blocked", { value: blockedWork })}
          </span>
          {" · "}
          <span data-tip={t("extensions.metallurgWork.shortagesTip")}>
            {t("extensions.metallurgWork.shortages", { value: shortageCount })}
          </span>
        </div>

        <section className="metallurg-work-dialog__section" aria-labelledby="metallurgWorkOrdersHeading">
          <h3 id="metallurgWorkOrdersHeading">{t("extensions.metallurgWork.queue")}</h3>
          <div ref={ordersRef} id="metallurgWorkOrders" className="table">
            <table className="fmg-table">
              <thead className="header">
                <tr>
                  <th>{t("extensions.metallurgWork.owner")}</th>
                  <th>{t("extensions.metallurgWork.work")}</th>
                  <th>{t("extensions.metallurgWork.type")}</th>
                  <th>{t("extensions.metallurgWork.status")}</th>
                  <th>{t("extensions.metallurgWork.units")}</th>
                  <th>{t("extensions.metallurgWork.work")}</th>
                  <th>{t("extensions.metallurgWork.materials")}</th>
                </tr>
              </thead>
              {orders.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={7}>{t("extensions.metallurgWork.emptyOrders")}</td>
                  </tr>
                </tbody>
              ) : (
                <VirtualTableBody items={orders} scrollElementRef={ordersRef} renderRow={renderWorkOrderRow} />
              )}
            </table>
          </div>
        </section>

        <section className="metallurg-work-dialog__section" aria-labelledby="metallurgMaterialForecastHeading">
          <h3 id="metallurgMaterialForecastHeading">{t("extensions.metallurgWork.forecast")}</h3>
          <div ref={materialsRef} id="metallurgMaterialForecast" className="table">
            <table className="fmg-table">
              <thead className="header">
                <tr>
                  <th>{t("extensions.metallurgWork.market")}</th>
                  <th>{t("extensions.metallurgWork.material")}</th>
                  <th>{t("extensions.metallurgWork.required")}</th>
                  <th>{t("extensions.metallurgWork.stock")}</th>
                  <th data-tip={t("extensions.metallurgWork.inboundTip")}>{t("extensions.metallurgWork.inbound")}</th>
                  <th data-tip={t("extensions.metallurgWork.procureTip")}>{t("extensions.metallurgWork.procure")}</th>
                  <th>{t("extensions.metallurgWork.orders")}</th>
                </tr>
              </thead>
              {materials.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={7}>{t("extensions.metallurgWork.emptyMaterials")}</td>
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
            data-tip={t("extensions.metallurgWork.refreshTip")}
            className="icon-cw"
            onClick={refreshMetallurgWorkOverview}
          />
        </div>
      </div>
    </Dialog>
  );
};

function renderWorkOrderRow(order: MetallurgWorkOrderRow): React.ReactNode {
  return <WorkOrderRow key={order.id} order={order} />;
}

const WorkOrderRow: React.FC<{ order: MetallurgWorkOrderRow }> = ({ order }) => {
  const { t } = useTranslation();
  return (
    <tr data-id={order.id} data-status={order.status}>
      <td>{order.ownerName}</td>
      <td>{order.productName}</td>
      <td>{t(KIND_LABEL_KEY[order.kind])}</td>
      <td>{t(STATUS_LABEL_KEY[order.status])}</td>
      <td>{order.remainingUnits}</td>
      <td>{order.remainingWork}</td>
      <td>
        <progress
          value={order.materialCoverage}
          max={1}
          aria-label={t("extensions.metallurgWork.coverageAria", { name: order.productName })}
        />{" "}
        {Math.round(order.materialCoverage * 100)}%
      </td>
    </tr>
  );
};

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
