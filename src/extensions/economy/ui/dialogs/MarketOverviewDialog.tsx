import React from "react";
import { useTranslation } from "react-i18next";
import { useCharactersUiState } from "../../../characters/ui/charactersUiState";
import {
  closeDialog,
  Dialog,
  IconButton,
  openDialog,
  SortableHeader,
  useDialogState,
  VirtualTableBody
} from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";

import {
  cancelTransportAssetOrder,
  createPlayerTransportOrder,
  downloadStockCsv,
  getTransportAssetOrderBlueprints,
  openActiveMarketDeals,
  open as openMarketOverview,
  openTradeOpportunities,
  refreshMarketOverview,
  renameActiveMarket,
  resetActiveMarketName
} from "../../controllers/market-overview";
import type { TransportAssetOrder } from "../../generators/marketTypes";
import { TradeLogisticsSettings } from "../../generators/tradeLogisticsSettings";
import {
  type MarketOverviewBurgMerchantRow,
  type MarketOverviewRow,
  type MarketOverviewTransportAssetRow,
  type MarketOverviewTransportOrderRow,
  useMarketOverviewState
} from "../../store/marketOverviewState";

const TRANSPORT_ORDER_STATUS_KEYS: Record<MarketOverviewTransportOrderRow["status"], string> = {
  queued: "extensions.marketOverview.statusQueued",
  waitingMaterials: "extensions.marketOverview.statusWaiting",
  building: "extensions.marketOverview.statusBuilding",
  completed: "extensions.marketOverview.statusCompleted",
  cancelled: "extensions.marketOverview.statusCancelled"
};

const TRANSPORT_ORDER_BLOCKED_KEYS: Record<NonNullable<MarketOverviewTransportOrderRow["blockedReason"]>, string> = {
  insufficientTreasury: "extensions.marketOverview.blockedTreasury",
  budgetLimit: "extensions.marketOverview.blockedBudget",
  missingMaterials: "extensions.marketOverview.blockedMaterials",
  missingCraftWorkers: "extensions.marketOverview.blockedWorkers"
};

const TRANSPORT_ASSET_NAME_KEYS: Record<string, string> = {
  "pack-train": "extensions.marketOverview.assetPackTrain",
  "Pack train": "extensions.marketOverview.assetPackTrain",
  cart: "extensions.marketOverview.assetCart",
  Cart: "extensions.marketOverview.assetCart",
  wagon: "extensions.marketOverview.assetWagon",
  Wagon: "extensions.marketOverview.assetWagon",
  "river-barge": "extensions.marketOverview.assetRiverBarge",
  "River barge": "extensions.marketOverview.assetRiverBarge"
};

const TRANSPORT_ASSET_BLUEPRINTS = getTransportAssetOrderBlueprints();

function transportAssetLabel(assetId: string, fallback: string, t: (key: string) => string): string {
  return TRANSPORT_ASSET_NAME_KEYS[assetId] ? t(TRANSPORT_ASSET_NAME_KEYS[assetId]) : fallback;
}

export const MarketOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("marketOverview"));
  const marketId = useDialogState(state => state.dialogConfigs.marketOverview?.marketId as number | undefined);
  const name = useMarketOverviewState(state => state.name);
  const defaultName = useMarketOverviewState(state => state.defaultName);
  const owner = useMarketOverviewState(state => state.owner);
  const rows = useMarketOverviewState(state => state.rows);
  const burgMerchantRows = useMarketOverviewState(state => state.burgMerchantRows);
  const transportAssetRows = useMarketOverviewState(state => state.transportAssetRows);
  const transportOrderRows = useMarketOverviewState(state => state.transportOrderRows);
  const cellsCount = useMarketOverviewState(state => state.cellsCount);
  const burgsCount = useMarketOverviewState(state => state.burgsCount);
  const totalStock = useMarketOverviewState(state => state.totalStock);
  const agTechStockPercent = useMarketOverviewState(state => state.agTechStockPercent);
  const transportCargoCapacitySlots = useMarketOverviewState(state => state.transportCargoCapacitySlots);
  const transportReadyCapacitySlots = useMarketOverviewState(state => state.transportReadyCapacitySlots);
  const transportUtilizationPercent = useMarketOverviewState(state => state.transportUtilizationPercent);
  const tradeWorkingCapital = useMarketOverviewState(state => state.tradeWorkingCapital);
  const tradeCapitalLocked = useMarketOverviewState(state => state.tradeCapitalLocked);
  const tradeCapitalAvailable = useMarketOverviewState(state => state.tradeCapitalAvailable);
  const exportStagingLotCount = useMarketOverviewState(state => state.exportStagingLotCount);
  const exportStagingUnits = useMarketOverviewState(state => state.exportStagingUnits);
  const exportStagingValue = useMarketOverviewState(state => state.exportStagingValue);
  const merchantOrganizationName = useMarketOverviewState(state => state.merchantOrganizationName);
  const foodLedger = useMarketOverviewState(state => state.foodLedger);
  const headerRef = React.useRef<HTMLTableSectionElement | null>(null);
  const [activeTab, setActiveTab] = React.useState<"goods" | "burgMerchants" | "transportAssets">("goods");
  const [transportBlueprintId, setTransportBlueprintId] = React.useState<TransportAssetOrder["blueprintId"]>("cart");
  const [transportQuantity, setTransportQuantity] = React.useState("1");
  const [transportBudgetLimit, setTransportBudgetLimit] = React.useState("");

  const [goodsSortBy, setGoodsSortBy] = React.useState<keyof MarketOverviewRow>("stock");
  const [goodsSortOrder, setGoodsSortOrder] = React.useState<"asc" | "desc">("desc");

  const [merchantsSortBy, setMerchantsSortBy] = React.useState<keyof MarketOverviewBurgMerchantRow>("topRevenue");
  const [merchantsSortOrder, setMerchantsSortOrder] = React.useState<"asc" | "desc">("desc");

  const merchantsRef = React.useRef<HTMLDivElement | null>(null);
  const transportAssetsRef = React.useRef<HTMLDivElement | null>(null);

  const handleTransportOrderSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = Number(transportQuantity);
    const budgetLimit = Number(transportBudgetLimit);
    if (createPlayerTransportOrder({ blueprintId: transportBlueprintId, quantity, budgetLimit })) {
      setTransportQuantity("1");
      setTransportBudgetLimit("");
    }
  };

  const handleGoodsSort = (field: string) => {
    if (goodsSortBy === field) setGoodsSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    else {
      setGoodsSortBy(field as keyof MarketOverviewRow);
      setGoodsSortOrder(field === "goodName" ? "asc" : "desc");
    }
  };

  const handleMerchantsSort = (field: string) => {
    if (merchantsSortBy === field) setMerchantsSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    else {
      setMerchantsSortBy(field as keyof MarketOverviewBurgMerchantRow);
      setMerchantsSortOrder(field === "burgName" || field === "topMerchantName" || field === "rivals" ? "asc" : "desc");
    }
  };

  const sortedGoods = React.useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const aVal = a[goodsSortBy] ?? "";
      const bVal = b[goodsSortBy] ?? "";
      const dir = goodsSortOrder === "asc" ? 1 : -1;
      if (aVal > bVal) return 1 * dir;
      if (aVal < bVal) return -1 * dir;
      return 0;
    });
    return arr;
  }, [rows, goodsSortBy, goodsSortOrder]);

  const sortedMerchants = React.useMemo(() => {
    const arr = [...burgMerchantRows];
    arr.sort((a, b) => {
      const aVal = a[merchantsSortBy] ?? "";
      const bVal = b[merchantsSortBy] ?? "";
      const dir = merchantsSortOrder === "asc" ? 1 : -1;
      if (aVal > bVal) return 1 * dir;
      if (aVal < bVal) return -1 * dir;
      return 0;
    });
    return arr;
  }, [burgMerchantRows, merchantsSortBy, merchantsSortOrder]);

  function SortHeaderGoods({
    field,
    label,
    tip,
    numeric,
    width
  }: {
    field: string;
    label: string;
    tip: string;
    numeric?: boolean;
    width?: string;
  }) {
    return (
      <SortableHeader
        field={field}
        label={label}
        sortBy={goodsSortBy}
        sortOrder={goodsSortOrder}
        onSort={handleGoodsSort}
        tip={tip}
        numeric={numeric}
        style={width ? { width } : undefined}
      />
    );
  }

  function SortHeaderMerchants({
    field,
    label,
    tip,
    numeric,
    width
  }: {
    field: string;
    label: string;
    tip: string;
    numeric?: boolean;
    width?: string;
  }) {
    return (
      <SortableHeader
        field={field}
        label={label}
        sortBy={merchantsSortBy}
        sortOrder={merchantsSortOrder}
        onSort={handleMerchantsSort}
        tip={tip}
        numeric={numeric}
        style={width ? { width } : undefined}
      />
    );
  }

  React.useEffect(() => {
    if (isOpen && marketId != null) {
      setTimeout(() => openMarketOverview(marketId), 0);
    }
  }, [isOpen, marketId]);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.marketOverview")}
      onClose={() => closeDialog("marketOverview")}
      className="fmg-dialog--table"
    >
      <div id="marketOverviewContainer">
        <div id="marketOverviewNameLine" className="d-flex header">
          <div className="label">{t("extensions.marketOverview.name")}</div>
          <input
            id="marketOverviewName"
            data-tip={t("extensions.marketOverview.nameTip")}
            autoCorrect="off"
            spellCheck={false}
            value={name}
            placeholder={defaultName}
            onChange={e => renameActiveMarket(e.target.value)}
          />
          <IconButton
            id="marketOverviewNameReset"
            data-tip={t("extensions.marketOverview.nameResetTip")}
            className="icon-ccw pointer -3em"
            onClick={resetActiveMarketName}
          />
        </div>

        <div className="totalLine" id="marketOverviewTradeLogistics">
          {merchantOrganizationName ? (
            <div data-tip={t("extensions.marketOverview.companyTip")}>{merchantOrganizationName}</div>
          ) : null}
          <div data-tip={t("extensions.marketOverview.tradeCapitalTip")}>
            {t("extensions.marketOverview.tradeCapital", {
              free: formatPrice(tradeCapitalAvailable),
              total: formatPrice(tradeWorkingCapital)
            })}
            {tradeCapitalLocked > 0
              ? t("extensions.marketOverview.tradeCapitalLocked", { locked: formatPrice(tradeCapitalLocked) })
              : ""}
          </div>
          <div data-tip={t("extensions.marketOverview.exportWarehouseTip")}>
            {t("extensions.marketOverview.exportWarehouse", {
              lots: exportStagingLotCount,
              units: exportStagingUnits,
              value: formatPrice(exportStagingValue)
            })}
          </div>
          <div data-tip={t("extensions.marketOverview.sailScheduleTip")}>
            {t("extensions.marketOverview.sailSchedule", {
              days: TradeLogisticsSettings.getOptions().sailDays.join(" / ")
            })}
          </div>
        </div>

        {foodLedger && (
          <div className="totalLine" id="marketOverviewFoodLedger">
            <div data-tip={t("extensions.marketOverview.localGrainTip")}>
              {t("extensions.marketOverview.localGrain", { value: foodLedger.localProduction })}
            </div>
            <div data-tip={t("extensions.marketOverview.foodNeedTip")}>
              {t("extensions.marketOverview.foodNeed", { value: foodLedger.quarterlyNeed })}
            </div>
            <div data-tip={t("extensions.marketOverview.importedTip")}>
              {t("extensions.marketOverview.imported", {
                value: foodLedger.importedFood,
                pct: foodLedger.importSharePercent
              })}
            </div>
            <div data-tip={t("extensions.marketOverview.reserveGapTip")}>
              {t("extensions.marketOverview.reserveGap", { value: foodLedger.reserveGap })}
            </div>
            <div data-tip={t("extensions.marketOverview.foodStockTip")}>
              {t("extensions.marketOverview.foodStock", {
                value: foodLedger.stock,
                months: foodLedger.stockMonths
              })}
            </div>
          </div>
        )}

        <div className="tab d-flex">
          <button
            type="button"
            className={`options ${activeTab === "goods" ? "active" : ""}`}
            onClick={() => setActiveTab("goods")}
          >
            {t("extensions.marketOverview.tabGoods")}
          </button>
          <button
            type="button"
            className={`options ${activeTab === "burgMerchants" ? "active" : ""}`}
            onClick={() => setActiveTab("burgMerchants")}
          >
            {t("extensions.marketOverview.tabMerchants")}
          </button>
          <button
            type="button"
            className={`options ${activeTab === "transportAssets" ? "active" : ""}`}
            onClick={() => setActiveTab("transportAssets")}
          >
            {t("extensions.marketOverview.tabTransport")}
          </button>
        </div>

        {activeTab === "goods" && (
          <>
            <div ref={headerRef} id="marketOverviewGoodsBody" className="table">
              <table className="fmg-table">
                <colgroup>
                  <col />
                  <col />
                  <col />
                  <col />
                </colgroup>
                <thead id="marketOverviewHeader">
                  <tr className="header">
                    <th />
                    <SortHeaderGoods
                      field="goodName"
                      label={t("extensions.marketOverview.good")}
                      tip={t("extensions.marketOverview.goodTip")}
                    />
                    <SortHeaderGoods
                      field="stock"
                      label={t("extensions.marketOverview.stock")}
                      tip={t("extensions.marketOverview.stockTip")}
                      numeric
                    />
                    <SortHeaderGoods
                      field="price"
                      label={t("extensions.marketOverview.price")}
                      tip={t("extensions.marketOverview.priceTip")}
                      numeric
                    />
                  </tr>
                </thead>
                {rows.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={4}>
                        <span>{t("extensions.marketOverview.emptyGoods")}</span>
                      </td>
                    </tr>
                  </tbody>
                ) : (
                  <VirtualTableBody
                    items={sortedGoods}
                    scrollElementRef={headerRef}
                    renderRow={row => (
                      <tr
                        key={row.goodId}
                        className="states marketGood"
                        data-good={row.goodName}
                        data-stock={row.stock}
                        data-price={row.price}
                      >
                        <td>
                          <svg
                            aria-label={row.goodName}
                            data-tip={t("extensions.marketOverview.goodIcon")}
                            width="2em"
                            height="2em"
                            className="goodIcon"
                          >
                            <circle cx="50%" cy="50%" r="42%" fill={row.goodColor} stroke={row.goodStroke} />
                            <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
                          </svg>
                        </td>
                        <td data-tip={t("extensions.marketOverview.goodName")} className="goodName">
                          {row.goodName}
                        </td>
                        <td data-tip={t("extensions.marketOverview.goodStock")} className="marketGoodStock">
                          {row.stock}
                        </td>
                        <td data-tip={t("extensions.marketOverview.goodPrice")} className="marketGoodPrice">
                          {formatPrice(row.price)}
                        </td>
                      </tr>
                    )}
                  />
                )}
              </table>
            </div>

            <div id="marketOverviewSummary" className="totalLine">
              <div>{t("extensions.marketOverview.cells", { count: cellsCount })}</div>
              <div>{t("extensions.marketOverview.burgs", { count: burgsCount })}</div>
              <div>{t("extensions.marketOverview.stockTotal", { count: totalStock })}</div>
              <div data-tip={t("extensions.marketOverview.agTechTip")}>
                {t("extensions.marketOverview.agTech", { pct: agTechStockPercent })}
              </div>
            </div>
            <div id="marketOverviewInfo">
              {owner && (
                <>
                  <svg className="coaIcon" viewBox="0 0 200 200">
                    <title>{t("extensions.marketOverview.coaTitle", { name: owner.name })}</title>
                    <use href={`#${owner.coaId}`} />
                  </svg>
                  <b>{t("extensions.marketOverview.centerState")}</b> {owner.name}
                </>
              )}
            </div>
          </>
        )}

        {activeTab === "burgMerchants" && (
          <div ref={merchantsRef} id="marketOverviewBurgMerchants" className="table">
            <table className="fmg-table">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr className="header">
                  <SortHeaderMerchants
                    field="burgName"
                    label={t("extensions.marketOverview.burg")}
                    tip={t("extensions.marketOverview.burgTip")}
                  />
                  <SortHeaderMerchants
                    field="topMerchantName"
                    label={t("extensions.marketOverview.topMerchant")}
                    tip={t("extensions.marketOverview.topMerchantTip")}
                  />
                  <SortHeaderMerchants
                    field="topShare"
                    label={t("extensions.marketOverview.share")}
                    tip={t("extensions.marketOverview.shareTip")}
                    numeric
                  />
                  <SortHeaderMerchants
                    field="topRevenue"
                    label={t("extensions.marketOverview.revenue")}
                    tip={t("extensions.marketOverview.revenueTip")}
                    numeric
                  />
                  <SortHeaderMerchants
                    field="rivals"
                    label={t("extensions.marketOverview.rivals")}
                    tip={t("extensions.marketOverview.rivalsTip")}
                  />
                </tr>
              </thead>
              {burgMerchantRows.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={5}>{t("extensions.marketOverview.emptyMerchants")}</td>
                  </tr>
                </tbody>
              ) : (
                <VirtualTableBody
                  items={sortedMerchants}
                  scrollElementRef={merchantsRef}
                  renderRow={row => (
                    <tr key={row.burgId} className="states">
                      <td>{row.burgName}</td>
                      <td
                        className={row.topMerchantId !== undefined ? "pointer actionLink" : ""}
                        data-tip={
                          row.topMerchantId !== undefined
                            ? t("extensions.marketOverview.topMerchantClickTip")
                            : undefined
                        }
                        onClick={e => {
                          if (row.topMerchantId !== undefined) {
                            e.stopPropagation();
                            useCharactersUiState.getState().openCharacterDetails(row.topMerchantId);
                            openDialog("characterDetails");
                          }
                        }}
                      >
                        {row.topMerchantName}
                      </td>
                      <td className="numeric">{row.topShare.toFixed(1)}%</td>
                      <td className="numeric">{formatPrice(row.topRevenue)}</td>
                      <td>{row.rivals}</td>
                    </tr>
                  )}
                />
              )}
            </table>
          </div>
        )}

        {activeTab === "transportAssets" && (
          <>
            <div ref={transportAssetsRef} id="marketOverviewTransportAssets" className="table">
              <table className="fmg-table">
                <thead>
                  <tr className="header">
                    <th>{t("extensions.marketOverview.asset")}</th>
                    <th className="numeric" data-tip={t("extensions.marketOverview.slotsTip")}>
                      {t("extensions.marketOverview.slots")}
                    </th>
                    <th className="numeric" data-tip={t("extensions.marketOverview.availableTip")}>
                      {t("extensions.marketOverview.available")}
                    </th>
                    <th className="numeric" data-tip={t("extensions.marketOverview.reservedTip")}>
                      {t("extensions.marketOverview.reserved")}
                    </th>
                    <th className="numeric" data-tip={t("extensions.marketOverview.inTransitTip")}>
                      {t("extensions.marketOverview.inTransit")}
                    </th>
                    <th className="numeric" data-tip={t("extensions.marketOverview.maintenanceTip")}>
                      {t("extensions.marketOverview.maintenance")}
                    </th>
                    <th className="numeric">{t("extensions.marketOverview.total")}</th>
                    <th className="numeric" data-tip={t("extensions.marketOverview.readySlotsTip")}>
                      {t("extensions.marketOverview.readySlots")}
                    </th>
                  </tr>
                </thead>
                {transportAssetRows.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={8}>{t("extensions.marketOverview.emptyAssets")}</td>
                    </tr>
                  </tbody>
                ) : (
                  <VirtualTableBody
                    items={transportAssetRows}
                    scrollElementRef={transportAssetsRef}
                    renderRow={(row: MarketOverviewTransportAssetRow) => (
                      <tr key={row.assetId} className="states">
                        <td>{transportAssetLabel(row.assetId, row.assetName, t)}</td>
                        <td className="numeric">{row.cargoCapacitySlots}</td>
                        <td className="numeric">{row.available}</td>
                        <td className="numeric">{row.reserved}</td>
                        <td className="numeric">{row.inTransit}</td>
                        <td className="numeric">{row.maintenance}</td>
                        <td className="numeric">{row.total}</td>
                        <td className="numeric">{row.available * row.cargoCapacitySlots}</td>
                      </tr>
                    )}
                  />
                )}
              </table>
            </div>
            <div className="totalLine">
              <div data-tip={t("extensions.marketOverview.fleetCapacityTip")}>
                {t("extensions.marketOverview.fleetCapacity", { slots: transportCargoCapacitySlots })}
              </div>
              <div data-tip={t("extensions.marketOverview.readyCapacityTip")}>
                {t("extensions.marketOverview.readyCapacity", { slots: transportReadyCapacitySlots })}
              </div>
              <div data-tip={t("extensions.marketOverview.fleetUtilTip")}>
                {t("extensions.marketOverview.fleetUtil", { pct: transportUtilizationPercent })}
              </div>
            </div>
            <section id="marketOverviewTransportOrders" aria-labelledby="marketOverviewTransportOrdersHeading">
              <div className="header d-flex">
                <b id="marketOverviewTransportOrdersHeading">{t("extensions.marketOverview.orderLedger")}</b>
                <span data-tip={t("extensions.marketOverview.playerPriorityTip")}>
                  {t("extensions.marketOverview.playerPriority")}
                </span>
              </div>
              {transportOrderRows.length === 0 ? (
                <p>{t("extensions.marketOverview.emptyOrders")}</p>
              ) : (
                <div className="table">
                  <table className="fmg-table">
                    <thead>
                      <tr className="header">
                        <th>{t("extensions.marketOverview.order")}</th>
                        <th>{t("extensions.marketOverview.materials")}</th>
                        <th>{t("extensions.marketOverview.progress")}</th>
                        <th>{t("extensions.marketOverview.budget")}</th>
                        <th>{t("extensions.marketOverview.status")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {transportOrderRows.map((row: MarketOverviewTransportOrderRow) => (
                        <tr key={row.id} className="states">
                          <td>
                            {transportAssetLabel(row.blueprintName, row.blueprintName, t)} ×{row.quantity}
                            <small>
                              {row.requestedBy === "player"
                                ? t("extensions.marketOverview.playerOrder")
                                : t("extensions.marketOverview.autoReplacement")}
                            </small>
                          </td>
                          <td>{row.materials}</td>
                          <td
                            data-tip={t("extensions.marketOverview.progressTip", {
                              done: row.workPoints,
                              required: row.requiredWorkPoints
                            })}
                          >
                            {t("extensions.marketOverview.progressCell", {
                              done: row.completedQuantity,
                              qty: row.quantity,
                              pct: row.progressPercent
                            })}
                          </td>
                          <td>
                            {row.budgetLimit === undefined ? "—" : formatPrice(row.budgetLimit)}
                            {row.fundedAmount > 0 && (
                              <small>
                                {t("extensions.marketOverview.funded", { value: formatPrice(row.fundedAmount) })}
                              </small>
                            )}
                          </td>
                          <td
                            data-tip={
                              row.blockedReason ? t(TRANSPORT_ORDER_BLOCKED_KEYS[row.blockedReason]) : undefined
                            }
                          >
                            {t(TRANSPORT_ORDER_STATUS_KEYS[row.status])}
                            {row.blockedReason && <small>{t(TRANSPORT_ORDER_BLOCKED_KEYS[row.blockedReason])}</small>}
                          </td>
                          <td>
                            {row.requestedBy === "player" &&
                            row.status !== "completed" &&
                            row.status !== "cancelled" ? (
                              <button
                                type="button"
                                data-tip={t("extensions.marketOverview.cancelTip")}
                                onClick={() => cancelTransportAssetOrder(row.id)}
                              >
                                {t("extensions.marketOverview.cancel")}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <form id="marketOverviewTransportOrderForm" onSubmit={handleTransportOrderSubmit}>
                <div className="header">{t("extensions.marketOverview.orderForm")}</div>
                <label>
                  {t("extensions.marketOverview.market")}
                  <input
                    value={name || defaultName || t("extensions.marketOverview.selectedMarket")}
                    readOnly
                    aria-readonly="true"
                  />
                </label>
                <label>
                  {t("extensions.marketOverview.asset")}
                  <select
                    value={transportBlueprintId}
                    onChange={event =>
                      setTransportBlueprintId(event.target.value as TransportAssetOrder["blueprintId"])
                    }
                  >
                    {TRANSPORT_ASSET_BLUEPRINTS.map(blueprint => (
                      <option key={blueprint.id} value={blueprint.id}>
                        {t("extensions.marketOverview.blueprintSlots", {
                          name: transportAssetLabel(blueprint.id, blueprint.id, t),
                          slots: blueprint.cargoCapacitySlots
                        })}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("extensions.marketOverview.quantity")}
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={transportQuantity}
                    onChange={event => setTransportQuantity(event.target.value)}
                  />
                </label>
                <label>
                  {t("extensions.marketOverview.budgetLimit")}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    required
                    value={transportBudgetLimit}
                    onChange={event => setTransportBudgetLimit(event.target.value)}
                  />
                </label>
                <button type="submit" data-tip={t("extensions.marketOverview.placeOrderTip")}>
                  {t("extensions.marketOverview.placeOrder")}
                </button>
              </form>
            </section>
          </>
        )}

        <div id="marketOverviewBottom" className="footer">
          <button
            type="button"
            id="marketOverviewRefresh"
            data-tip={t("extensions.marketOverview.refreshTip")}
            className="icon-cw"
            onClick={refreshMarketOverview}
          />
          <button
            type="button"
            id="marketOverviewOpenDeals"
            data-tip={t("extensions.marketOverview.dealsTip")}
            className="icon-list-bullet"
            onClick={openActiveMarketDeals}
          />
          <button
            type="button"
            id="marketOverviewTradeOpportunities"
            data-tip={t("extensions.marketOverview.opportunitiesTip")}
            className="icon-exchange"
            onClick={openTradeOpportunities}
          />
          <button
            type="button"
            id="marketOverviewExport"
            data-tip={t("extensions.marketOverview.exportTip")}
            className="icon-download"
            onClick={downloadStockCsv}
          />
        </div>
      </div>
    </Dialog>
  );
};
