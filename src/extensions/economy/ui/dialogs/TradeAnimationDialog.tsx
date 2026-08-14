import React from "react";
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
import { formatSailDecisionReason, routeHasWater } from "../../generators/tradeSailSchedule";

/** Finite-fleet P2: label concrete hulls, or explain abstract / waiting water capacity. */
function formatCaravanVessels(caravan: Caravan): string {
  const allocations = caravan.transportAllocations ?? [];
  const hullParts: string[] = [];
  for (const allocation of allocations) {
    for (const hullId of allocation.shipHullIds ?? []) {
      const className = allocation.transportName || allocation.transportId || "Ship";
      hullParts.push(`Hull #${hullId} ${className}`);
    }
  }
  if (hullParts.length) return hullParts.join(", ");

  const needsSea =
    routeHasWater(caravan.routeSegments ?? []) &&
    (caravan.routeSegments ?? []).some(segment => segment.type === "water" || segment.type === "sea");
  if (needsSea) {
    if (caravan.state === "loading") return "Waiting for vessel";
    return "Abstract (no Shipbuilding)";
  }

  const land = allocations.filter(a => a.mode === "land" || a.mode === "river");
  if (land.length) {
    return land.map(a => `${a.unitCount}× ${a.transportName || a.transportId}`).join(", ");
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
  const isOpen = useDialogState(state => state.openDialogs.has("tradeAnimationEditor"));
  const [activeTab, setActiveTab] = React.useState<"caravans" | "flow" | "settings">("caravans");

  return (
    <Dialog
      isOpen={isOpen}
      title="Trade Animation"
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
            Active Caravans
          </button>
          <button type="button" style={tabButtonStyle(activeTab === "flow")} onClick={() => setActiveTab("flow")}>
            Flow report
          </button>
          <button
            type="button"
            style={tabButtonStyle(activeTab === "settings")}
            onClick={() => setActiveTab("settings")}
          >
            Settings
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
      let sourceBurgName = "Unknown";
      if (c.sellerType === "market") {
        const m = getMarketById(c.seller);
        if (m && burgs[m.centerBurgId]) sourceBurgName = burgs[m.centerBurgId].name ?? "Unknown";
      } else {
        if (burgs[c.seller]) sourceBurgName = burgs[c.seller].name ?? "Unknown";
      }

      let targetBurgName = "Unknown";
      if (c.buyerType === "market") {
        const m = getMarketById(c.buyer);
        if (m && burgs[m.centerBurgId]) targetBurgName = burgs[m.centerBurgId].name ?? "Unknown";
      } else {
        if (burgs[c.buyer]) targetBurgName = burgs[c.buyer].name ?? "Unknown";
      }

      let goodName = "Mixed";
      if (c.payload && c.payload.length === 1) {
        goodName = Goods.get(c.payload[0].goodId)?.name ?? "Unknown";
      } else if (c.payload && c.payload.length > 1) {
        goodName = `Mixed (${c.payload.length})`;
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
        state: c.state,
        statusLabel: c.state === "loading" ? "Loading" : "In transit",
        reasonLabel: formatSailDecisionReason(c.departReason),
        goodName,
        vesselsLabel: formatCaravanVessels(c),
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
  }, [caravans, world.distanceScale, world, burgs]);

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
                label="Status"
                tip="Loading = accumulating at origin; In transit = on the route"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader
                field="reasonLabel"
                label="Sail reason"
                tip="Why the shipment is waiting, left, or was cancelled"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader field="goodName" label="Good" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader
                field="vesselsLabel"
                label="Vessels"
                tip="Concrete Shipbuilding hulls when reserved; sea loads wait without a free vessel"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader
                field="sourceBurgName"
                label="From"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader
                field="targetBurgName"
                label="To"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader
                field="distance"
                label="Distance"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="progress"
                label="Progress"
                tip="In transit: route progress. Loading: hold fill percent."
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="remainingDays"
                label="ETA"
                tip="Estimated days remaining / total journey duration (transit only)"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="units"
                label="Units"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="value"
                label="Value"
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
                <td colSpan={11}>No loading or in-transit caravans</td>
              </tr>
            </tbody>
          ) : (
            <VirtualTableBody
              items={sortedRows}
              scrollElementRef={parentRef}
              renderRow={row => (
                <tr
                  key={row.i}
                  className="states"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    const targetCaravan = caravans.find(c => c.i === row.i);
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
                    {Number.isFinite(row.remainingDays) ? `${row.remainingDays} / ${row.totalDays} days` : "—"}
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
          Shipments: {sortedRows.length} ({sortedRows.filter(row => row.state === "loading").length} loading /{" "}
          {sortedRows.filter(row => row.state === "transit").length} in transit)
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
        <span data-tip="Production cycles recorded in the rolling year window (max 12)">
          Cycles: {summary.cyclesRecorded}/{summary.targetCycles}
        </span>
        <span data-tip="Mean hold fill of loading + transit caravans across recorded cycles">
          Mean util: {formatPct(summary.meanCaravanUtilization)}
        </span>
        <span data-tip="Median hold fill across recorded cycles">
          Median util: {formatPct(summary.medianCaravanUtilization)}
        </span>
        <span data-tip="Share of caravans under 20% fill">&lt;20% fill: {formatPct(summary.shareUnder20pct)}</span>
        <span data-tip="Sum of annualized export cargo slots from measured trade">
          Annual export slots: {formatNum(summary.totalAnnualExportSlots)}
        </span>
        <button type="button" onClick={refresh} data-tip="Reload report from the latest production cycles">
          Refresh
        </button>
        <button
          type="button"
          onClick={() => downloadFlowReportCsv()}
          data-tip="Download the full market×good flow table as CSV"
          disabled={summary.rows.length === 0}
        >
          Download CSV
        </button>
      </div>

      <div ref={parentRef} className="table">
        <table className="fmg-table">
          <thead>
            <tr className="header">
              <SortableHeader
                field="marketName"
                label="Market"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <SortableHeader field="goodName" label="Good" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
              <SortableHeader
                field="annualProd"
                label="Ann. prod"
                tip="Production scaled to 12 cycles from measured stock deltas + trade"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="annualDemand"
                label="Ann. demand"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="annualExport"
                label="Ann. export"
                tip="Units booked as market→market export deals, annualized"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="annualImport"
                label="Ann. import"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="endStock"
                label="Stock"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="monthsCover"
                label="Mo cover"
                tip="End stock ÷ mean cycle demand"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="exportSlots"
                label="Export slots"
                tip="Annual export units × cargo slots per unit"
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
                <td colSpan={9}>
                  No flow samples yet. Advance time through at least one production cycle (~30 sim days) with Economy
                  enabled.
                </td>
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
          Rows: {sortedRows.length} market×good · annualized from {summary.cyclesRecorded} cycle
          {summary.cyclesRecorded === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
};

const SettingsTab: React.FC = () => {
  return (
    <div id="tradeAnimationEditorContainer" style={{ padding: "0.5rem" }}>
      <div data-tip="Select which trade types to display">
        <label htmlFor="tradeAnimationDisplayType">Display:</label>
        <select id="tradeAnimationDisplayType">
          <option value="both">Both local and global</option>
          <option value="local">Local only</option>
          <option value="global">Global only</option>
        </select>
      </div>

      <div data-tip="Maximum number of trade markers animated simultaneously">
        <label htmlFor="tradeAnimationConcurrent">Concurrent:</label>
        <SliderInput id="tradeAnimationConcurrent" min="1" max="200" step="1" value="30" onChange={() => {}} />
      </div>

      <div data-tip="Duration of a single trade journey in milliseconds">
        <label htmlFor="tradeAnimationDuration">Duration (ms):</label>
        <SliderInput id="tradeAnimationDuration" min="50" max="2000" step="10" value="250" onChange={() => {}} />
      </div>

      <div data-tip="Multiplier applied to duration for overland segments (land is slower than sea)">
        <label htmlFor="tradeAnimationLandModifier">Land modifier:</label>
        <SliderInput id="tradeAnimationLandModifier" min="1" max="20" step="1" value="5" onChange={() => {}} />
      </div>

      <div data-tip="Pause duration at segment boundaries (ms)">
        <label htmlFor="tradeAnimationSegmentPause">Segment pause (ms):</label>
        <SliderInput id="tradeAnimationSegmentPause" min="0" max="5000" step="100" value="1000" onChange={() => {}} />
      </div>

      <div data-tip="Size of trade markers in pixels">
        <label htmlFor="tradeAnimationMarkerSize">Marker size:</label>
        <SliderInput id="tradeAnimationMarkerSize" min="1" max="20" step="1" value="4" onChange={() => {}} />
      </div>

      <div id="tradeAnimationBottom">
        <button type="button" id="tradeAnimationApply" data-tip="Apply settings and restart animation">
          Apply
        </button>
        <button type="button" id="tradeAnimationRestart" data-tip="Restart the animation" className="icon-cw" />
        <button
          type="button"
          id="tradeAnimationStop"
          data-tip="Stop the animation"
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
      <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>Logistics (loading &amp; sail)</div>

      <div data-tip="Hold fill share that lets a shipment leave without waiting for the calendar">
        <label htmlFor="logisticsTargetUtil">Target fill %:</label>
        <SliderInput
          id="logisticsTargetUtil"
          min="20"
          max="100"
          step="1"
          value={Math.round(logistics.targetUtilization * 100)}
          onChange={value => update({ targetUtilization: Number(value) / 100 })}
        />
      </div>

      <div data-tip="Minimum fill before a scheduled or overdue sail is allowed">
        <label htmlFor="logisticsMinUtil">Min sail fill %:</label>
        <SliderInput
          id="logisticsMinUtil"
          min="5"
          max="100"
          step="1"
          value={Math.round(logistics.minSailUtilization * 100)}
          onChange={value => update({ minSailUtilization: Number(value) / 100 })}
        />
      </div>

      <div data-tip="Days a land caravan may wait before overdue sail or cancel">
        <label htmlFor="logisticsWaitLand">Max wait land (days):</label>
        <SliderInput
          id="logisticsWaitLand"
          min="1"
          max="40"
          step="1"
          value={logistics.maxWaitDaysLand}
          onChange={value => update({ maxWaitDaysLand: Number(value) })}
        />
      </div>

      <div data-tip="Days a sea/river shipment may wait before overdue sail or cancel">
        <label htmlFor="logisticsWaitSea">Max wait sea (days):</label>
        <SliderInput
          id="logisticsWaitSea"
          min="1"
          max="40"
          step="1"
          value={logistics.maxWaitDaysSea}
          onChange={value => update({ maxWaitDaysSea: Number(value) })}
        />
      </div>

      <div data-tip="Short water-only hops (lakes / coasts) use this shorter muster">
        <label htmlFor="logisticsWaitShortSea">Max wait short sea (days):</label>
        <SliderInput
          id="logisticsWaitShortSea"
          min="1"
          max="14"
          step="1"
          value={logistics.maxWaitDaysShortSea}
          onChange={value => update({ maxWaitDaysShortSea: Number(value) })}
        />
      </div>

      <div data-tip="Water-only routes at or under this distance use the short-sea wait">
        <label htmlFor="logisticsShortSeaKm">Short sea distance (km):</label>
        <SliderInput
          id="logisticsShortSeaKm"
          min="20"
          max="300"
          step="5"
          value={logistics.shortSeaDistanceKm}
          onChange={value => update({ shortSeaDistanceKm: Number(value) })}
        />
      </div>

      <div data-tip="Comma-separated calendar days of the month for regular sailings (1–28)">
        <label htmlFor="logisticsSailDays">Sail days of month:</label>
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
        data-tip="Restore default fill targets, waits, and sail calendar"
        onClick={() => {
          TradeLogisticsSettings.reset();
          const next = TradeLogisticsSettings.getOptions();
          setLogistics({ ...next, sailDays: [...next.sailDays] });
          setSailDaysText(next.sailDays.join(", "));
        }}
      >
        Reset logistics defaults
      </button>
      <div style={{ opacity: 0.75, fontSize: "0.9em", marginTop: "0.35rem" }}>
        Defaults: target {Math.round(DEFAULT_TRADE_LOGISTICS_SETTINGS.targetUtilization * 100)}% · min{" "}
        {Math.round(DEFAULT_TRADE_LOGISTICS_SETTINGS.minSailUtilization * 100)}% · sail days{" "}
        {DEFAULT_TRADE_LOGISTICS_SETTINGS.sailDays.join("/")}
      </div>
    </div>
  );
};

const MovementSettingsSection: React.FC = () => {
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
      <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>Movement Speed</div>

      <div data-tip="Wagon/cart base pace on land, km per day">
        <label htmlFor="caravanLandSpeed">Land (wagon):</label>
        <SliderInput
          id="caravanLandSpeed"
          min="5"
          max="100"
          step="1"
          value={movement.landKmPerDay}
          onChange={value => update({ landKmPerDay: Number(value) })}
        />
      </div>

      <div data-tip="Ship base pace at sea, km per day">
        <label htmlFor="caravanSeaSpeed">Sea (ship):</label>
        <SliderInput
          id="caravanSeaSpeed"
          min="5"
          max="200"
          step="1"
          value={movement.seaKmPerDay}
          onChange={value => update({ seaKmPerDay: Number(value) })}
        />
      </div>

      <div data-tip="Seasonal tailwind/current speed swing applied to sea legs; 0% means no correction">
        <label htmlFor="caravanSeaCurrentStrength">Seasonal current (%):</label>
        <SliderInput
          id="caravanSeaCurrentStrength"
          min="0"
          max="80"
          step="5"
          value={Math.round(movement.seaCurrentStrength * 100)}
          onChange={value => update({ seaCurrentStrength: Number(value) / 100 })}
        />
      </div>

      <div style={{ fontWeight: "bold", margin: "0.75rem 0 0.25rem" }}>Elevation &amp; Passes</div>

      <div data-tip="How much slope slows land caravans. 0% = legacy flat-map travel time; 100% = full grade model">
        <label htmlFor="caravanGradeEffectStrength">Grade effect (%):</label>
        <SliderInput
          id="caravanGradeEffectStrength"
          min="0"
          max="100"
          step="5"
          value={Math.round(movement.gradeEffectStrength * 100)}
          onChange={value => update({ gradeEffectStrength: Number(value) / 100 })}
        />
      </div>

      <div data-tip="preferSpeed takes the fastest grade-aware path; avoidHardPass detours around horse-hard grades when a longer route exists">
        <label htmlFor="caravanMerchantRoutePreference">Land route preference:</label>
        <select
          id="caravanMerchantRoutePreference"
          value={movement.merchantRoutePreference}
          onChange={e => update({ merchantRoutePreference: e.target.value as MerchantRoutePreference })}
          style={{ marginLeft: "0.35em" }}
        >
          <option value="preferSpeed">Prefer speed (steep OK if shorter)</option>
          <option value="avoidHardPass">Avoid hard passes (detour)</option>
        </select>
      </div>
    </div>
  );
};
