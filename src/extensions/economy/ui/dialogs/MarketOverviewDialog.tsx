import React from "react";
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
import {
  type MarketOverviewBurgMerchantRow,
  type MarketOverviewRow,
  type MarketOverviewTransportAssetRow,
  type MarketOverviewTransportOrderRow,
  useMarketOverviewState
} from "../../store/marketOverviewState";

const TRANSPORT_ORDER_STATUS_LABELS: Record<MarketOverviewTransportOrderRow["status"], string> = {
  queued: "Queued",
  waitingMaterials: "Waiting",
  building: "Building",
  completed: "Completed",
  cancelled: "Cancelled"
};

const TRANSPORT_ORDER_BLOCKED_LABELS: Record<NonNullable<MarketOverviewTransportOrderRow["blockedReason"]>, string> = {
  insufficientTreasury: "Market treasury is too low",
  budgetLimit: "Material cost exceeds the order budget",
  missingMaterials: "Required materials are not in stock",
  missingCraftWorkers: "No matching craft workers are available"
};

const TRANSPORT_ASSET_BLUEPRINTS = getTransportAssetOrderBlueprints();

function formatTransportBlueprintName(blueprintId: TransportAssetOrder["blueprintId"]): string {
  if (blueprintId === "pack-train") return "Pack train";
  if (blueprintId === "river-barge") return "River barge";
  return `${blueprintId[0].toUpperCase()}${blueprintId.slice(1)}`;
}

export const MarketOverviewDialog: React.FC = () => {
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
      title="Market Overview"
      onClose={() => closeDialog("marketOverview")}
      className="fmg-dialog--table"
    >
      <div id="marketOverviewContainer">
        <div id="marketOverviewNameLine" className="d-flex header">
          <div className="label">Name:</div>
          <input
            id="marketOverviewName"
            data-tip="Type to rename the market. Clear the field to reset to the default name"
            autoCorrect="off"
            spellCheck={false}
            value={name}
            placeholder={defaultName}
            onChange={e => renameActiveMarket(e.target.value)}
          />
          <IconButton
            id="marketOverviewNameReset"
            data-tip="Reset to the default name (center burg name)"
            className="icon-ccw pointer -3em"
            onClick={resetActiveMarketName}
          />
        </div>

        <div className="tab d-flex">
          <button
            type="button"
            className={`options ${activeTab === "goods" ? "active" : ""}`}
            onClick={() => setActiveTab("goods")}
          >
            Goods
          </button>
          <button
            type="button"
            className={`options ${activeTab === "burgMerchants" ? "active" : ""}`}
            onClick={() => setActiveTab("burgMerchants")}
          >
            Burg merchants
          </button>
          <button
            type="button"
            className={`options ${activeTab === "transportAssets" ? "active" : ""}`}
            onClick={() => setActiveTab("transportAssets")}
          >
            Transport assets
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
                    <SortHeaderGoods field="goodName" label="Good" tip="Click to sort by good" />
                    <SortHeaderGoods field="stock" label="Stock" tip="Click to sort by stock" numeric />
                    <SortHeaderGoods field="price" label="Price" tip="Click to sort by price" numeric />
                  </tr>
                </thead>
                {rows.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={4}>
                        <span>No market goods available</span>
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
                            data-tip="Good icon"
                            width="2em"
                            height="2em"
                            className="goodIcon"
                          >
                            <circle cx="50%" cy="50%" r="42%" fill={row.goodColor} stroke={row.goodStroke} />
                            <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
                          </svg>
                        </td>
                        <td data-tip="Good name" className="goodName">
                          {row.goodName}
                        </td>
                        <td data-tip="Good stock" className="marketGoodStock">
                          {row.stock}
                        </td>
                        <td data-tip="Good price" className="marketGoodPrice">
                          {formatPrice(row.price)}
                        </td>
                      </tr>
                    )}
                  />
                )}
              </table>
            </div>

            <div id="marketOverviewSummary" className="totalLine">
              <div>Cells: {cellsCount}</div>
              <div>Burgs: {burgsCount}</div>
              <div>Stock: {totalStock}</div>
              <div data-tip="Rural iron-tool/plow adoption funded from this market's treasury (docs/plan/rural-agtech-investment.md)">
                Ag Tech: {agTechStockPercent}%
              </div>
            </div>
            <div id="marketOverviewInfo">
              {owner && (
                <>
                  <svg className="coaIcon" viewBox="0 0 200 200">
                    <title>{`Coat of arms of ${owner.name}`}</title>
                    <use href={`#${owner.coaId}`} />
                  </svg>
                  <b>Center State:</b> {owner.name}
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
                  <SortHeaderMerchants field="burgName" label="Burg" tip="Burg inside this market territory" />
                  <SortHeaderMerchants
                    field="topMerchantName"
                    label="Top Merchant"
                    tip="Merchant with the largest revenue share in this burg"
                  />
                  <SortHeaderMerchants
                    field="topShare"
                    label="Share"
                    tip="Top merchant's share of this burg's market revenue"
                    numeric
                  />
                  <SortHeaderMerchants
                    field="topRevenue"
                    label="Revenue"
                    tip="Top merchant's revenue in this burg"
                    numeric
                  />
                  <SortHeaderMerchants field="rivals" label="Rivals" tip="Other merchants competing in this burg" />
                </tr>
              </thead>
              {burgMerchantRows.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={5}>No burg merchants available</td>
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
                            ? "Merchant with the largest revenue share in this burg. Click to view details"
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
                      <td style={{ textAlign: "right" }}>{row.topShare.toFixed(1)}%</td>
                      <td style={{ textAlign: "right" }}>{formatPrice(row.topRevenue)}</td>
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
                    <th>Asset</th>
                    <th data-tip="Cargo slots carried by one asset">Slots</th>
                    <th data-tip="Assets ready for a new shipment">Available</th>
                    <th data-tip="Assets allocated before departure">Reserved</th>
                    <th data-tip="Assets currently travelling with cargo">In transit</th>
                    <th data-tip="Assets recovering after a lost caravan">Maintenance</th>
                    <th>Total</th>
                    <th data-tip="Cargo slots ready for a new shipment">Ready slots</th>
                  </tr>
                </thead>
                {transportAssetRows.length === 0 ? (
                  <tbody>
                    <tr>
                      <td colSpan={8}>No transport assets available</td>
                    </tr>
                  </tbody>
                ) : (
                  <VirtualTableBody
                    items={transportAssetRows}
                    scrollElementRef={transportAssetsRef}
                    renderRow={(row: MarketOverviewTransportAssetRow) => (
                      <tr key={row.assetId} className="states">
                        <td>{row.assetName}</td>
                        <td style={{ textAlign: "right" }}>{row.cargoCapacitySlots}</td>
                        <td style={{ textAlign: "right" }}>{row.available}</td>
                        <td style={{ textAlign: "right" }}>{row.reserved}</td>
                        <td style={{ textAlign: "right" }}>{row.inTransit}</td>
                        <td style={{ textAlign: "right" }}>{row.maintenance}</td>
                        <td style={{ textAlign: "right" }}>{row.total}</td>
                        <td style={{ textAlign: "right" }}>{row.available * row.cargoCapacitySlots}</td>
                      </tr>
                    )}
                  />
                )}
              </table>
            </div>
            <div className="totalLine">
              <div data-tip="Total cargo capacity of this market's durable transport assets">
                Fleet capacity: {transportCargoCapacitySlots} slots
              </div>
              <div data-tip="Cargo slots ready for the next shipment">
                Ready capacity: {transportReadyCapacitySlots} slots
              </div>
              <div data-tip="Reserved or travelling capacity as a share of the durable transport fleet">
                Fleet utilization: {transportUtilizationPercent}%
              </div>
            </div>
            <section id="marketOverviewTransportOrders" aria-labelledby="marketOverviewTransportOrdersHeading">
              <div className="header d-flex">
                <b id="marketOverviewTransportOrdersHeading">Transport order ledger</b>
                <span data-tip="Player orders are funded from this market's treasury and are scheduled before automatic replacements">
                  Player orders take priority
                </span>
              </div>
              {transportOrderRows.length === 0 ? (
                <p>No transport orders are open for this market.</p>
              ) : (
                <div className="table">
                  <table className="fmg-table">
                    <thead>
                      <tr className="header">
                        <th>Order</th>
                        <th>Materials</th>
                        <th>Progress</th>
                        <th>Budget</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {transportOrderRows.map((row: MarketOverviewTransportOrderRow) => (
                        <tr key={row.id} className="states">
                          <td>
                            {row.blueprintName} ×{row.quantity}
                            <small>{row.requestedBy === "player" ? "Player order" : "Automatic replacement"}</small>
                          </td>
                          <td>{row.materials}</td>
                          <td data-tip={`${row.workPoints} of ${row.requiredWorkPoints} work points completed`}>
                            {row.completedQuantity}/{row.quantity} complete · {row.progressPercent}%
                          </td>
                          <td>
                            {row.budgetLimit === undefined ? "—" : formatPrice(row.budgetLimit)}
                            {row.fundedAmount > 0 && <small>Funded: {formatPrice(row.fundedAmount)}</small>}
                          </td>
                          <td
                            data-tip={row.blockedReason ? TRANSPORT_ORDER_BLOCKED_LABELS[row.blockedReason] : undefined}
                          >
                            {TRANSPORT_ORDER_STATUS_LABELS[row.status]}
                            {row.blockedReason && <small>{TRANSPORT_ORDER_BLOCKED_LABELS[row.blockedReason]}</small>}
                          </td>
                          <td>
                            {row.requestedBy === "player" &&
                            row.status !== "completed" &&
                            row.status !== "cancelled" ? (
                              <button
                                type="button"
                                data-tip="Cancel this order and return unconsumed materials to market stock"
                                onClick={() => cancelTransportAssetOrder(row.id)}
                              >
                                Cancel
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
                <div className="header">Order transport assets</div>
                <label>
                  Market
                  <input value={name || defaultName || "Selected market"} readOnly aria-readonly="true" />
                </label>
                <label>
                  Asset
                  <select
                    value={transportBlueprintId}
                    onChange={event =>
                      setTransportBlueprintId(event.target.value as TransportAssetOrder["blueprintId"])
                    }
                  >
                    {TRANSPORT_ASSET_BLUEPRINTS.map(blueprint => (
                      <option key={blueprint.id} value={blueprint.id}>
                        {formatTransportBlueprintName(blueprint.id)} · {blueprint.cargoCapacitySlots} slots
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
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
                  Budget limit
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
                <button
                  type="submit"
                  data-tip="Reserve this market's materials and funds when the next production cycle begins"
                >
                  Place order
                </button>
              </form>
            </section>
          </>
        )}

        <div id="marketOverviewBottom" className="footer">
          <button
            type="button"
            id="marketOverviewRefresh"
            data-tip="Refresh the Overview screen"
            className="icon-cw"
            onClick={refreshMarketOverview}
          />
          <button
            type="button"
            id="marketOverviewOpenDeals"
            data-tip="View market deals"
            className="icon-list-bullet"
            onClick={openActiveMarketDeals}
          />
          <button
            type="button"
            id="marketOverviewTradeOpportunities"
            data-tip="Find buy-low / sell-high routes across markets"
            className="icon-exchange"
            onClick={openTradeOpportunities}
          />
          <button
            type="button"
            id="marketOverviewExport"
            data-tip="Save market deals data as a text file (.csv)"
            className="icon-download"
            onClick={downloadStockCsv}
          />
        </div>
      </div>
    </Dialog>
  );
};
