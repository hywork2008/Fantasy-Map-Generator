import React from "react";
import { useTranslation } from "react-i18next";
import type { MerchantRoutePreference } from "../../../../services/routeGrade";
import { useOptionsState } from "../../../hostCore";
import { closeDialog, Dialog, SliderInput, SortableHeader, useDialogState, VirtualTableBody } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";
import { getCaravans, getMarketById, getMarkets, getWorldContext } from "../../economyContext";
import { CaravanMovement, type CaravanMovementSettings } from "../../generators/caravanMovement";
import { getCaravanTravelTime } from "../../generators/caravans";
import { Goods } from "../../generators/goods-generator";
import { downloadFlowReportCsv, getFlowReport } from "../../generators/marketFlowDiagnostics";
import type { FlowReportSummary, MarketGoodFlowReportRow } from "../../generators/marketFlowReport";
import type { Caravan } from "../../generators/marketTypes";
import { TradeAnimation } from "../../generators/trade-animation";
import {
  DEFAULT_TRADE_LOGISTICS_SETTINGS,
  TradeLogisticsSettings,
  type TradeLogisticsSettings as TradeLogisticsSettingsType
} from "../../generators/tradeLogisticsSettings";
import { routeHasWater } from "../../generators/tradeSailSchedule";
import { getCaravanInstanceKey } from "../../renderers/draw-trade-animation";

type Translate = (key: string, options?: Record<string, unknown>) => string;

const TRANSPORT_NAME_KEYS: Record<string, string> = {
  "pack-train": "extensions.marketOverview.assetPackTrain",
  cart: "extensions.marketOverview.assetCart",
  wagon: "extensions.marketOverview.assetWagon",
  "river-barge": "extensions.marketOverview.assetRiverBarge"
};

const SAIL_REASON_KEYS: Record<string, string> = {
  "depart-full": "extensions.tradeAnimation.reasonFull",
  "depart-local": "extensions.tradeAnimation.reasonLocal",
  "depart-schedule": "extensions.tradeAnimation.reasonSchedule",
  "depart-overdue": "extensions.tradeAnimation.reasonOverdue",
  "cancelled-thin": "extensions.tradeAnimation.reasonCancelled",
  waiting: "extensions.tradeAnimation.reasonWaiting"
};

function localizeTransportName(id: string | undefined, fallback: string, t: Translate): string {
  return id && TRANSPORT_NAME_KEYS[id] ? t(TRANSPORT_NAME_KEYS[id]) : fallback;
}

function localizeSailReason(reason: string | undefined, t: Translate): string {
  return reason && SAIL_REASON_KEYS[reason] ? t(SAIL_REASON_KEYS[reason]) : "—";
}

/** Finite-fleet P2: label concrete hulls, or explain abstract / waiting water capacity. */
function formatCaravanVessels(caravan: Caravan, t: Translate): string {
  const allocations = caravan.transportAllocations ?? [];
  const hullParts: string[] = [];
  for (const allocation of allocations) {
    for (const hullId of allocation.shipHullIds ?? []) {
      const className = localizeTransportName(
        allocation.transportId,
        allocation.transportName || allocation.transportId || t("extensions.tradeAnimation.ship"),
        t
      );
      hullParts.push(t("extensions.tradeAnimation.hull", { id: hullId, className }));
    }
  }
  if (hullParts.length) return hullParts.join(", ");

  const needsSea =
    routeHasWater(caravan.routeSegments ?? []) &&
    (caravan.routeSegments ?? []).some(segment => segment.type === "water" || segment.type === "sea");
  if (needsSea) {
    if (caravan.state === "loading") return t("extensions.tradeAnimation.waitingVessel");
    return t("extensions.tradeAnimation.abstract");
  }

  const land = allocations.filter(a => a.mode === "land" || a.mode === "river");
  if (land.length) {
    return land
      .map(a =>
        t("extensions.tradeAnimation.landUnits", {
          count: a.unitCount,
          name: localizeTransportName(a.transportId, a.transportName || a.transportId, t)
        })
      )
      .join(", ");
  }
  return "—";
}

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "4px 12px",
  cursor: "pointer",
  background: "none",
  border: "none",
  borderBottom: active ? "2px solid #ddd" : "2px solid transparent",
  fontWeight: active ? "bold" : "normal",
  opacity: active ? 1 : 0.7,
  color: "inherit",
  font: "inherit"
});

export const TradeAnimationDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("tradeAnimationEditor"));
  const [activeTab, setActiveTab] = React.useState<"caravans" | "flow" | "settings">("caravans");

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.tradeAnimation")}
      onClose={() => closeDialog("tradeAnimationEditor")}
      className="fmg-dialog--table"
    >
      <div id="tradeAnimationContainer">
        {/* Tab bar sits outside .table so it's excluded from virtual scroll */}
        <div className="header" style={{ display: "flex", borderBottom: "1px solid #555", gap: 0 }}>
          <button
            type="button"
            style={tabButtonStyle(activeTab === "caravans")}
            onClick={() => setActiveTab("caravans")}
          >
            {t("extensions.tradeAnimation.tabCaravans")}
          </button>
          <button type="button" style={tabButtonStyle(activeTab === "flow")} onClick={() => setActiveTab("flow")}>
            {t("extensions.tradeAnimation.tabFlow")}
          </button>
          <button
            type="button"
            style={tabButtonStyle(activeTab === "settings")}
            onClick={() => setActiveTab("settings")}
          >
            {t("extensions.tradeAnimation.tabSettings")}
          </button>
        </div>

        {/* Keep both tabs mounted; hide the inactive one so VirtualTableBody isn't re-initialized on switch */}
        <ActiveCaravansTab hidden={activeTab !== "caravans"} />
        {activeTab === "flow" && <FlowReportTab />}
        {activeTab === "settings" && <SettingsTab />}
      </div>
    </Dialog>
  );
};

interface ActiveCaravansTabProps {
  hidden?: boolean;
}

const ActiveCaravansTab: React.FC<ActiveCaravansTabProps> = ({ hidden = false }) => {
  const { t } = useTranslation();
  const [caravans, setCaravans] = React.useState<Caravan[]>([]);
  const distanceUnit = useOptionsState(state => state.distanceUnit);
  const parentRef = React.useRef<HTMLDivElement>(null);

  const [sortBy, setSortBy] = React.useState<string>("progress");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");

  React.useEffect(() => {
    const update = () => {
      // Include loading shipments so players can inspect accumulation and sail reasons.
      setCaravans(getCaravans().filter(c => c.state === "transit" || c.state === "loading"));
    };
    update();
    const intervalId = setInterval(update, 500);
    return () => clearInterval(intervalId);
  }, []);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(o => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const world = getWorldContext();
  const burgs = world?.pack?.burgs ?? [];
  const rows = React.useMemo(() => {
    return caravans.map(c => {
      const unknown = t("extensions.tradeAnimation.unknown");
      let sourceBurgName = unknown;
      if (c.sellerType === "market") {
        const m = getMarketById(c.seller);
        if (m && burgs[m.centerBurgId]) sourceBurgName = burgs[m.centerBurgId].name ?? unknown;
      } else {
        if (burgs[c.seller]) sourceBurgName = burgs[c.seller].name ?? unknown;
      }

      let targetBurgName = unknown;
      if (c.buyerType === "market") {
        const m = getMarketById(c.buyer);
        if (m && burgs[m.centerBurgId]) targetBurgName = burgs[m.centerBurgId].name ?? unknown;
      } else {
        if (burgs[c.buyer]) targetBurgName = burgs[c.buyer].name ?? unknown;
      }

      let goodName = t("extensions.tradeAnimation.mixed");
      if (c.payload && c.payload.length === 1) {
        goodName = Goods.get(c.payload[0].goodId)?.name ?? unknown;
      } else if (c.payload && c.payload.length > 1) {
        goodName = t("extensions.tradeAnimation.mixedCount", { count: c.payload.length });
      }
      const progress =
        c.state === "loading" && c.loading
          ? (() => {
              const used = (c.payload ?? []).reduce((sum, item) => sum + item.units * (item.cargoSlotsPerUnit ?? 1), 0);
              return c.loading.plannedCapacitySlots > 0 ? (used / c.loading.plannedCapacitySlots) * 100 : 0;
            })()
          : c.totalDistance > 0
            ? (c.currentDistance / c.totalDistance) * 100
            : 0;
      const travelTime = c.state === "transit" ? getCaravanTravelTime(c) : null;

      let landDistance = 0;
      let seaDistance = 0;
      const transferCount = Math.max(0, (c.routeSegments?.length ?? 1) - 1);

      if (c.routeSegments && world) {
        for (const seg of c.routeSegments) {
          let segDist = 0;
          for (let i = 0; i < seg.points.length - 1; i++) {
            const [x1, y1] = seg.points[i];
            const [x2, y2] = seg.points[i + 1];
            segDist += Math.hypot(x2 - x1, y2 - y1);
          }
          segDist *= world.distanceScale;
          if (seg.type === "land") landDistance += segDist;
          else seaDistance += segDist;
        }
      }

      return {
        i: c.i,
        instanceKey: getCaravanInstanceKey(c),
        state: c.state,
        statusLabel:
          c.state === "loading" ? t("extensions.tradeAnimation.loading") : t("extensions.tradeAnimation.inTransit"),
        reasonLabel: localizeSailReason(c.departReason, t),
        goodName,
        vesselsLabel: formatCaravanVessels(c, t),
        sourceBurgName,
        targetBurgName,
        distance: Math.round(c.totalDistance),
        landDistance: Math.round(landDistance),
        seaDistance: Math.round(seaDistance),
        transferCount,
        progress,
        remainingDays: travelTime?.remainingDays ?? Number.POSITIVE_INFINITY,
        totalDays: travelTime?.totalDays ?? Number.POSITIVE_INFINITY,
        units: c.units,
        value: c.value
      };
    });
  }, [caravans, world.distanceScale, world, burgs, t]);

  const sortedRows = React.useMemo(() => {
    return [...rows].sort((a, b) => {
      let valA = a[sortBy as keyof typeof a];
      let valB = b[sortBy as keyof typeof b];
      if (typeof valA === "string") valA = (valA as string).toLowerCase();
      if (typeof valB === "string") valB = (valB as string).toLowerCase();
      const dir = sortOrder === "asc" ? 1 : -1;
      if (valA < valB) return -dir;
      if (valA > valB) return dir;
      return 0;
    });
  }, [rows, sortBy, sortOrder]);

  return (
    <div style={{ display: hidden ? "none" : "contents" }}>
      <div ref={parentRef} className="table">
        <table className="fmg-table">
          <thead>
            <tr className="header">
              <SortableHeader
                field="statusLabel"
                label={t("extensions.tradeAnimation.status")}
                tip={t("extensions.tradeAnimation.statusTip")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader
                field="reasonLabel"
                label={t("extensions.tradeAnimation.sailReason")}
                tip={t("extensions.tradeAnimation.sailReasonTip")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader
                field="goodName"
                label={t("extensions.tradeAnimation.good")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader
                field="vesselsLabel"
                label={t("extensions.tradeAnimation.vessels")}
                tip={t("extensions.tradeAnimation.vesselsTip")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader
                field="sourceBurgName"
                label={t("extensions.tradeAnimation.from")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader
                field="targetBurgName"
                label={t("extensions.tradeAnimation.to")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader
                field="distance"
                label={t("extensions.tradeAnimation.distance")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="progress"
                label={t("extensions.tradeAnimation.progress")}
                tip={t("extensions.tradeAnimation.progressTip")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="remainingDays"
                label={t("extensions.tradeAnimation.eta")}
                tip={t("extensions.tradeAnimation.etaTip")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="units"
                label={t("extensions.tradeAnimation.units")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="value"
                label={t("extensions.tradeAnimation.value")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
            </tr>
          </thead>
          {sortedRows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={11}>{t("extensions.tradeAnimation.empty")}</td>
              </tr>
            </tbody>
          ) : (
            <VirtualTableBody
              items={sortedRows}
              scrollElementRef={parentRef}
              renderRow={row => (
                <tr
                  key={row.instanceKey}
                  className="states"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    const targetCaravan = caravans.find(c => getCaravanInstanceKey(c) === row.instanceKey);
                    if (targetCaravan) {
                      document.dispatchEvent(
                        new CustomEvent("trade:showDetails", { detail: { caravan: targetCaravan } })
                      );
                    }
                  }}
                >
                  <td>{row.statusLabel}</td>
                  <td>{row.reasonLabel}</td>
                  <td>{row.goodName}</td>
                  <td>{row.vesselsLabel}</td>
                  <td>{row.sourceBurgName}</td>
                  <td>{row.targetBurgName}</td>
                  <td className="numeric">{`${row.distance} ${distanceUnit}`}</td>
                  <td className="numeric">{`${row.progress.toFixed(0)}%`}</td>
                  <td className="numeric">
                    {Number.isFinite(row.remainingDays)
                      ? t("extensions.tradeAnimation.etaDays", {
                          remaining: row.remainingDays,
                          total: row.totalDays
                        })
                      : "—"}
                  </td>
                  <td className="numeric">{row.units}</td>
                  <td className="numeric">{formatPrice(row.value)}</td>
                </tr>
              )}
            />
          )}
        </table>
      </div>
      <div className="totalLine">
        <div>
          {t("extensions.tradeAnimation.shipments", {
            total: sortedRows.length,
            loading: sortedRows.filter(row => row.state === "loading").length,
            transit: sortedRows.filter(row => row.state === "transit").length
          })}
        </div>
      </div>
    </div>
  );
};

function formatPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

function formatNum(value: number): string {
  if (!Number.isFinite(value)) return value === Number.POSITIVE_INFINITY ? "∞" : "—";
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

const FlowReportTab: React.FC = () => {
  const { t } = useTranslation();
  const [summary, setSummary] = React.useState<FlowReportSummary>(() => getFlowReport());
  const [sortBy, setSortBy] = React.useState<keyof MarketGoodFlowReportRow>("exportSlots");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");
  const parentRef = React.useRef<HTMLDivElement>(null);
  const world = getWorldContext();
  const markets = getMarkets();

  const refresh = React.useCallback(() => {
    setSummary(getFlowReport());
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const marketLabel = React.useCallback(
    (marketId: number) => {
      const market = markets.find(candidate => candidate.i === marketId);
      if (!market) return `Market ${marketId}`;
      if (market.name) return market.name;
      return world.pack.burgs[market.centerBurgId]?.name ?? `Market ${marketId}`;
    },
    [markets, world.pack.burgs]
  );

  const rows = React.useMemo(() => {
    return summary.rows.map(row => ({
      ...row,
      marketName: marketLabel(row.marketId),
      goodName: Goods.get(row.goodId)?.name ?? `Good ${row.goodId}`
    }));
  }, [summary.rows, marketLabel]);

  const sortedRows = React.useMemo(() => {
    return [...rows].sort((a, b) => {
      let valA = a[sortBy as keyof typeof a];
      let valB = b[sortBy as keyof typeof b];
      if (typeof valA === "string") valA = (valA as string).toLowerCase();
      if (typeof valB === "string") valB = (valB as string).toLowerCase();
      const dir = sortOrder === "asc" ? 1 : -1;
      if (valA < valB) return -dir;
      if (valA > valB) return dir;
      return 0;
    });
  }, [rows, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(order => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field as keyof MarketGoodFlowReportRow);
      setSortOrder("desc");
    }
  };

  return (
    <div style={{ display: "contents" }}>
      <div
        style={{
          padding: "0.4rem 0.6rem",
          borderBottom: "1px solid #555",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          fontSize: "0.9em"
        }}
      >
        <span data-tip={t("extensions.tradeAnimation.cyclesTip")}>
          {t("extensions.tradeAnimation.cycles", {
            recorded: summary.cyclesRecorded,
            target: summary.targetCycles
          })}
        </span>
        <span data-tip={t("extensions.tradeAnimation.meanUtilTip")}>
          {t("extensions.tradeAnimation.meanUtil", { value: formatPct(summary.meanCaravanUtilization) })}
        </span>
        <span data-tip={t("extensions.tradeAnimation.medianUtilTip")}>
          {t("extensions.tradeAnimation.medianUtil", { value: formatPct(summary.medianCaravanUtilization) })}
        </span>
        <span data-tip={t("extensions.tradeAnimation.under20Tip")}>
          {t("extensions.tradeAnimation.under20", { value: formatPct(summary.shareUnder20pct) })}
        </span>
        <span data-tip={t("extensions.tradeAnimation.annualSlotsTip")}>
          {t("extensions.tradeAnimation.annualSlots", { value: formatNum(summary.totalAnnualExportSlots) })}
        </span>
        <button type="button" onClick={refresh} data-tip={t("extensions.tradeAnimation.refreshTip")}>
          {t("extensions.tradeAnimation.refresh")}
        </button>
        <button
          type="button"
          onClick={() => downloadFlowReportCsv()}
          data-tip={t("extensions.tradeAnimation.downloadCsvTip")}
          disabled={summary.rows.length === 0}
        >
          {t("extensions.tradeAnimation.downloadCsv")}
        </button>
      </div>

      <div ref={parentRef} className="table">
        <table className="fmg-table">
          <thead>
            <tr className="header">
              <SortableHeader
                field="marketName"
                label={t("extensions.tradeAnimation.market")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader
                field="goodName"
                label={t("extensions.tradeAnimation.good")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader
                field="annualProd"
                label={t("extensions.tradeAnimation.annProd")}
                tip={t("extensions.tradeAnimation.annProdTip")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="annualDemand"
                label={t("extensions.tradeAnimation.annDemand")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="annualExport"
                label={t("extensions.tradeAnimation.annExport")}
                tip={t("extensions.tradeAnimation.annExportTip")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="annualImport"
                label={t("extensions.tradeAnimation.annImport")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="endStock"
                label={t("extensions.tradeAnimation.stock")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="monthsCover"
                label={t("extensions.tradeAnimation.moCover")}
                tip={t("extensions.tradeAnimation.moCoverTip")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="exportSlots"
                label={t("extensions.tradeAnimation.exportSlots")}
                tip={t("extensions.tradeAnimation.exportSlotsTip")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
            </tr>
          </thead>
          {sortedRows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={9}>{t("extensions.tradeAnimation.emptyFlow")}</td>
              </tr>
            </tbody>
          ) : (
            <VirtualTableBody
              items={sortedRows}
              scrollElementRef={parentRef}
              renderRow={row => (
                <tr key={`${row.marketId}-${row.goodId}`} className="states">
                  <td>{row.marketName}</td>
                  <td>{row.goodName}</td>
                  <td className="numeric">{formatNum(row.annualProd)}</td>
                  <td className="numeric">{formatNum(row.annualDemand)}</td>
                  <td className="numeric">{formatNum(row.annualExport)}</td>
                  <td className="numeric">{formatNum(row.annualImport)}</td>
                  <td className="numeric">{formatNum(row.endStock)}</td>
                  <td className="numeric">{formatNum(row.monthsCover)}</td>
                  <td className="numeric">{formatNum(row.exportSlots)}</td>
                </tr>
              )}
            />
          )}
        </table>
      </div>
      <div className="totalLine">
        <div>
          {t("extensions.tradeAnimation.rows", {
            count: sortedRows.length,
            cycles: summary.cyclesRecorded,
            cycleWord:
              summary.cyclesRecorded === 1
                ? t("extensions.tradeAnimation.cycle")
                : t("extensions.tradeAnimation.cyclesWord")
          })}
        </div>
      </div>
    </div>
  );
};

const SettingsTab: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div id="tradeAnimationEditorContainer" style={{ padding: "0.5rem" }}>
      <div data-tip={t("extensions.tradeAnimation.displayTip")}>
        <label htmlFor="tradeAnimationDisplayType">{t("extensions.tradeAnimation.display")}</label>
        <select id="tradeAnimationDisplayType">
          <option value="both">{t("extensions.tradeAnimation.both")}</option>
          <option value="local">{t("extensions.tradeAnimation.localOnly")}</option>
          <option value="global">{t("extensions.tradeAnimation.globalOnly")}</option>
        </select>
      </div>

      <div data-tip={t("extensions.tradeAnimation.concurrentTip")}>
        <label htmlFor="tradeAnimationConcurrent">{t("extensions.tradeAnimation.concurrent")}</label>
        <SliderInput id="tradeAnimationConcurrent" min="1" max="200" step="1" value="30" onChange={() => {}} />
      </div>

      <div data-tip={t("extensions.tradeAnimation.durationTip")}>
        <label htmlFor="tradeAnimationDuration">{t("extensions.tradeAnimation.duration")}</label>
        <SliderInput id="tradeAnimationDuration" min="50" max="2000" step="10" value="250" onChange={() => {}} />
      </div>

      <div data-tip={t("extensions.tradeAnimation.landModTip")}>
        <label htmlFor="tradeAnimationLandModifier">{t("extensions.tradeAnimation.landMod")}</label>
        <SliderInput id="tradeAnimationLandModifier" min="1" max="20" step="1" value="5" onChange={() => {}} />
      </div>

      <div data-tip={t("extensions.tradeAnimation.pauseTip")}>
        <label htmlFor="tradeAnimationSegmentPause">{t("extensions.tradeAnimation.pause")}</label>
        <SliderInput id="tradeAnimationSegmentPause" min="0" max="5000" step="100" value="1000" onChange={() => {}} />
      </div>

      <div data-tip={t("extensions.tradeAnimation.markerTip")}>
        <label htmlFor="tradeAnimationMarkerSize">{t("extensions.tradeAnimation.marker")}</label>
        <SliderInput id="tradeAnimationMarkerSize" min="1" max="20" step="1" value="4" onChange={() => {}} />
      </div>

      <div id="tradeAnimationBottom">
        <button type="button" id="tradeAnimationApply" data-tip={t("extensions.tradeAnimation.applyTip")}>
          {t("extensions.tradeAnimation.apply")}
        </button>
        <button
          type="button"
          id="tradeAnimationRestart"
          data-tip={t("extensions.tradeAnimation.restartTip")}
          className="icon-cw"
        />
        <button
          type="button"
          id="tradeAnimationStop"
          data-tip={t("extensions.tradeAnimation.stopTip")}
          className="icon-stop"
          style={{ marginLeft: "0.3em" }}
        />
      </div>

      <LogisticsSettingsSection />
      <MovementSettingsSection />
    </div>
  );
};

const LogisticsSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const [logistics, setLogistics] = React.useState<TradeLogisticsSettingsType>(() => ({
    ...TradeLogisticsSettings.getOptions(),
    sailDays: [...TradeLogisticsSettings.getOptions().sailDays]
  }));
  const [sailDaysText, setSailDaysText] = React.useState(() => logistics.sailDays.join(", "));

  const update = (partial: Partial<TradeLogisticsSettingsType>) => {
    TradeLogisticsSettings.configure(partial);
    const next = TradeLogisticsSettings.getOptions();
    setLogistics({ ...next, sailDays: [...next.sailDays] });
    if (partial.sailDays) setSailDaysText(next.sailDays.join(", "));
  };

  return (
    <div
      id="tradeLogisticsSettings"
      style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #555" }}
    >
      <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>{t("extensions.tradeAnimation.logistics")}</div>

      <div data-tip={t("extensions.tradeAnimation.targetFillTip")}>
        <label htmlFor="logisticsTargetUtil">{t("extensions.tradeAnimation.targetFill")}</label>
        <SliderInput
          id="logisticsTargetUtil"
          min="20"
          max="100"
          step="1"
          value={Math.round(logistics.targetUtilization * 100)}
          onChange={value => update({ targetUtilization: Number(value) / 100 })}
        />
      </div>

      <div data-tip={t("extensions.tradeAnimation.minFillTip")}>
        <label htmlFor="logisticsMinUtil">{t("extensions.tradeAnimation.minFill")}</label>
        <SliderInput
          id="logisticsMinUtil"
          min="5"
          max="100"
          step="1"
          value={Math.round(logistics.minSailUtilization * 100)}
          onChange={value => update({ minSailUtilization: Number(value) / 100 })}
        />
      </div>

      <div data-tip={t("extensions.tradeAnimation.waitLandTip")}>
        <label htmlFor="logisticsWaitLand">{t("extensions.tradeAnimation.waitLand")}</label>
        <SliderInput
          id="logisticsWaitLand"
          min="1"
          max="40"
          step="1"
          value={logistics.maxWaitDaysLand}
          onChange={value => update({ maxWaitDaysLand: Number(value) })}
        />
      </div>

      <div data-tip={t("extensions.tradeAnimation.waitSeaTip")}>
        <label htmlFor="logisticsWaitSea">{t("extensions.tradeAnimation.waitSea")}</label>
        <SliderInput
          id="logisticsWaitSea"
          min="1"
          max="40"
          step="1"
          value={logistics.maxWaitDaysSea}
          onChange={value => update({ maxWaitDaysSea: Number(value) })}
        />
      </div>

      <div data-tip={t("extensions.tradeAnimation.waitShortTip")}>
        <label htmlFor="logisticsWaitShortSea">{t("extensions.tradeAnimation.waitShort")}</label>
        <SliderInput
          id="logisticsWaitShortSea"
          min="1"
          max="14"
          step="1"
          value={logistics.maxWaitDaysShortSea}
          onChange={value => update({ maxWaitDaysShortSea: Number(value) })}
        />
      </div>

      <div data-tip={t("extensions.tradeAnimation.shortKmTip")}>
        <label htmlFor="logisticsShortSeaKm">{t("extensions.tradeAnimation.shortKm")}</label>
        <SliderInput
          id="logisticsShortSeaKm"
          min="20"
          max="300"
          step="5"
          value={logistics.shortSeaDistanceKm}
          onChange={value => update({ shortSeaDistanceKm: Number(value) })}
        />
      </div>

      <div data-tip={t("extensions.tradeAnimation.sailDaysTip")}>
        <label htmlFor="logisticsSailDays">{t("extensions.tradeAnimation.sailDays")}</label>
        <input
          id="logisticsSailDays"
          type="text"
          value={sailDaysText}
          onChange={e => setSailDaysText(e.target.value)}
          onBlur={() => {
            const days = sailDaysText
              .split(/[,\s]+/)
              .map(part => Number(part))
              .filter(day => Number.isFinite(day));
            update({ sailDays: days });
            setSailDaysText(TradeLogisticsSettings.getOptions().sailDays.join(", "));
          }}
          style={{ width: "8em", marginLeft: "0.4em" }}
        />
      </div>

      <button
        type="button"
        data-tip={t("extensions.tradeAnimation.resetLogisticsTip")}
        onClick={() => {
          TradeLogisticsSettings.reset();
          const next = TradeLogisticsSettings.getOptions();
          setLogistics({ ...next, sailDays: [...next.sailDays] });
          setSailDaysText(next.sailDays.join(", "));
        }}
      >
        {t("extensions.tradeAnimation.resetLogistics")}
      </button>
      <div style={{ opacity: 0.75, fontSize: "0.9em", marginTop: "0.35rem" }}>
        {t("extensions.tradeAnimation.defaults", {
          target: Math.round(DEFAULT_TRADE_LOGISTICS_SETTINGS.targetUtilization * 100),
          min: Math.round(DEFAULT_TRADE_LOGISTICS_SETTINGS.minSailUtilization * 100),
          days: DEFAULT_TRADE_LOGISTICS_SETTINGS.sailDays.join("/")
        })}
      </div>
    </div>
  );
};

const MovementSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const [movement, setMovement] = React.useState<CaravanMovementSettings>(() => ({ ...CaravanMovement.getOptions() }));

  const update = (partial: Partial<CaravanMovementSettings>) => {
    setMovement(current => ({ ...current, ...partial }));
    CaravanMovement.configure(partial);
    // Land/sea speed, grade strength, and route preference feed pathfinding edge costs —
    // cached results from before this change are no longer valid.
    TradeAnimation.clearRouteCache();
  };

  return (
    <div
      id="caravanMovementSettings"
      style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #555" }}
    >
      <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>{t("extensions.tradeAnimation.movement")}</div>

      <div data-tip={t("extensions.tradeAnimation.landSpeedTip")}>
        <label htmlFor="caravanLandSpeed">{t("extensions.tradeAnimation.landSpeed")}</label>
        <SliderInput
          id="caravanLandSpeed"
          min="5"
          max="100"
          step="1"
          value={movement.landKmPerDay}
          onChange={value => update({ landKmPerDay: Number(value) })}
        />
      </div>

      <div data-tip={t("extensions.tradeAnimation.seaSpeedTip")}>
        <label htmlFor="caravanSeaSpeed">{t("extensions.tradeAnimation.seaSpeed")}</label>
        <SliderInput
          id="caravanSeaSpeed"
          min="5"
          max="200"
          step="1"
          value={movement.seaKmPerDay}
          onChange={value => update({ seaKmPerDay: Number(value) })}
        />
      </div>

      <div data-tip={t("extensions.tradeAnimation.currentTip")}>
        <label htmlFor="caravanSeaCurrentStrength">{t("extensions.tradeAnimation.current")}</label>
        <SliderInput
          id="caravanSeaCurrentStrength"
          min="0"
          max="80"
          step="5"
          value={Math.round(movement.seaCurrentStrength * 100)}
          onChange={value => update({ seaCurrentStrength: Number(value) / 100 })}
        />
      </div>

      <div style={{ fontWeight: "bold", margin: "0.75rem 0 0.25rem" }}>{t("extensions.tradeAnimation.elevation")}</div>

      <div data-tip={t("extensions.tradeAnimation.gradeTip")}>
        <label htmlFor="caravanGradeEffectStrength">{t("extensions.tradeAnimation.grade")}</label>
        <SliderInput
          id="caravanGradeEffectStrength"
          min="0"
          max="100"
          step="5"
          value={Math.round(movement.gradeEffectStrength * 100)}
          onChange={value => update({ gradeEffectStrength: Number(value) / 100 })}
        />
      </div>

      <div data-tip={t("extensions.tradeAnimation.preferenceTip")}>
        <label htmlFor="caravanMerchantRoutePreference">{t("extensions.tradeAnimation.preference")}</label>
        <select
          id="caravanMerchantRoutePreference"
          value={movement.merchantRoutePreference}
          onChange={e => update({ merchantRoutePreference: e.target.value as MerchantRoutePreference })}
          style={{ marginLeft: "0.35em" }}
        >
          <option value="preferSpeed">{t("extensions.tradeAnimation.preferSpeed")}</option>
          <option value="avoidHardPass">{t("extensions.tradeAnimation.avoidHardPass")}</option>
        </select>
      </div>
    </div>
  );
};
