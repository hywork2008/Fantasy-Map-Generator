import React from "react";
import { SortableHeader } from "../../../../ui/components/tables/SortableHeader";
import { VirtualTableBody } from "../../../../ui/components/VirtualTableBody";
import { useOptionsState } from "../../../hostCore";
import { closeDialog, Dialog, SliderInput, useDialogState } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";
import { getWorldContext } from "../../economyContext";
import { CaravanMovement, type CaravanMovementSettings } from "../../generators/caravanMovement";
import { Goods } from "../../generators/goods-generator";
import type { Caravan } from "../../generators/marketTypes";

export const TradeAnimationDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("tradeAnimationEditor"));
  const [activeTab, setActiveTab] = React.useState<"caravans" | "settings">("caravans");

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
            style={{
              padding: "4px 12px",
              cursor: "pointer",
              background: "none",
              border: "none",
              borderBottom: activeTab === "caravans" ? "2px solid #ddd" : "2px solid transparent",
              fontWeight: activeTab === "caravans" ? "bold" : "normal",
              opacity: activeTab === "caravans" ? 1 : 0.7,
              color: "inherit",
              font: "inherit"
            }}
            onClick={() => setActiveTab("caravans")}
          >
            Active Caravans
          </button>
          <button
            type="button"
            style={{
              padding: "4px 12px",
              cursor: "pointer",
              background: "none",
              border: "none",
              borderBottom: activeTab === "settings" ? "2px solid #ddd" : "2px solid transparent",
              fontWeight: activeTab === "settings" ? "bold" : "normal",
              opacity: activeTab === "settings" ? 1 : 0.7,
              color: "inherit",
              font: "inherit"
            }}
            onClick={() => setActiveTab("settings")}
          >
            Settings
          </button>
        </div>

        {/* Keep both tabs mounted; hide the inactive one so VirtualTableBody isn't re-initialized on switch */}
        <ActiveCaravansTab hidden={activeTab !== "caravans"} />
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
      const world = getWorldContext();
      setCaravans(world?.pack?.caravans?.filter(c => c.state === "transit") ?? []);
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
      setSortOrder("asc");
    }
  };

  const world = getWorldContext();
  const burgs = world?.pack?.burgs ?? [];
  const markets = world?.pack?.markets ?? [];

  const rows = React.useMemo(() => {
    return caravans.map(c => {
      let sourceBurgName = "Unknown";
      if (c.sellerType === "market") {
        const m = markets[c.seller];
        if (m && burgs[m.centerBurgId]) sourceBurgName = burgs[m.centerBurgId].name ?? "Unknown";
      } else {
        if (burgs[c.seller]) sourceBurgName = burgs[c.seller].name ?? "Unknown";
      }

      let targetBurgName = "Unknown";
      if (c.buyerType === "market") {
        const m = markets[c.buyer];
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
      const progress = c.totalDistance > 0 ? (c.currentDistance / c.totalDistance) * 100 : 0;

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
        goodName,
        sourceBurgName,
        targetBurgName,
        distance: Math.round(c.totalDistance),
        landDistance: Math.round(landDistance),
        seaDistance: Math.round(seaDistance),
        transferCount,
        progress,
        units: c.units,
        value: c.value
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caravans, world.distanceScale, world, markets, burgs]);

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
              <SortableHeader field="goodName" label="Good" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
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
                field="landDistance"
                label="Land"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="seaDistance"
                label="Sea"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="transferCount"
                label="Transfers"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                numeric
              />
              <SortableHeader
                field="progress"
                label="Progress"
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
                <td colSpan={10}>No active trade caravans</td>
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
                  <td>{row.goodName}</td>
                  <td>{row.sourceBurgName}</td>
                  <td>{row.targetBurgName}</td>
                  <td style={{ textAlign: "right" }}>{`${row.distance} ${distanceUnit}`}</td>
                  <td style={{ textAlign: "right" }}>{`${row.landDistance} ${distanceUnit}`}</td>
                  <td style={{ textAlign: "right" }}>{`${row.seaDistance} ${distanceUnit}`}</td>
                  <td style={{ textAlign: "right" }}>{row.transferCount}</td>
                  <td style={{ textAlign: "right" }}>{`${row.progress.toFixed(0)}%`}</td>
                  <td style={{ textAlign: "right" }}>{row.units}</td>
                  <td style={{ textAlign: "right" }}>{formatPrice(row.value)}</td>
                </tr>
              )}
            />
          )}
        </table>
      </div>
      <div className="totalLine">
        <div>Active Caravans: {sortedRows.length}</div>
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

      <MovementSettingsSection />
    </div>
  );
};

const MovementSettingsSection: React.FC = () => {
  const [movement, setMovement] = React.useState<CaravanMovementSettings>(() => ({ ...CaravanMovement.getOptions() }));

  const update = (partial: Partial<CaravanMovementSettings>) => {
    setMovement(current => ({ ...current, ...partial }));
    CaravanMovement.configure(partial);
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
    </div>
  );
};
