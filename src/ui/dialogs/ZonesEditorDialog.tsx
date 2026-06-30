import type React from "react";
import { useState } from "react";
import { zonesEditorActions } from "../../controllers/zones-editor";
import { setZonesEditorState, useZonesEditorState, type ZoneRowData } from "../../store/zonesEditorState";
import { FillBox } from "../components/FillBox";
import { SliderInput } from "../components/SliderInput";

const SortableHeader: React.FC<{
  label: string;
  field: string;
  sortBy: string;
  sortDirection: number;
  width?: string;
  hide?: boolean;
  onSort: (field: string) => void;
}> = ({ label, field, sortBy, sortDirection, width, hide, onSort }) => {
  let icon = "";
  if (sortBy === field) {
    icon = sortDirection === 1 ? " icon-sort-down" : " icon-sort-up";
  }
  return (
    <div className={`sortable ${hide ? "hide" : ""} ${icon}`} style={{ width }} onClick={() => onSort(field)}>
      {label}
    </div>
  );
};

export const ZonesEditorContent: React.FC = () => {
  const state = useZonesEditorState();
  const [sortBy, setSortBy] = useState<string>("area");
  const [sortDirection, setSortDirection] = useState<number>(-1);

  let sortedZones = [...state.zones];
  sortedZones.sort((a, b) => {
    let valA = a[sortBy as keyof ZoneRowData];
    let valB = b[sortBy as keyof ZoneRowData];
    if (typeof valA === "string" && typeof valB === "string") {
      return sortDirection === 1 ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    valA = valA ?? 0;
    valB = valB ?? 0;
    return sortDirection === 1 ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
  });

  if (state.filterBy !== "all") {
    sortedZones = sortedZones.filter(z => z.type === state.filterBy);
  }

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDirection(prev => (prev === 1 ? -1 : 1));
    } else {
      setSortBy(field);
      setSortDirection(1);
    }
  };

  const pct = (val: number, total: number) => {
    if (!total) return "0%";
    return `${((val / total) * 100).toFixed(2)}%`;
  };

  const si = (n: number) => (n > 1000000 ? `${(n / 1000000).toFixed(2)}M` : n > 1000 ? `${(n / 1000).toFixed(2)}k` : n);

  return (
    <div id="zonesEditor" className="stable">
      <div className="header" style={{ gridTemplateColumns: "11em 8em 6em 7em 6em 6em" }}>
        <SortableHeader label="Zone" field="name" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
        <SortableHeader label="Type" field="type" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
        <SortableHeader
          label="Cells"
          field="cells"
          sortBy={sortBy}
          sortDirection={sortDirection}
          hide
          onSort={handleSort}
        />
        <SortableHeader
          label="Area"
          field="area"
          sortBy={sortBy}
          sortDirection={sortDirection}
          hide
          onSort={handleSort}
        />
        <SortableHeader
          label="Population"
          field="population"
          sortBy={sortBy}
          sortDirection={sortDirection}
          hide
          onSort={handleSort}
        />
      </div>

      <div className="table" data-type={state.isPercentageMode ? "percentage" : "absolute"}>
        {sortedZones.map(z => (
          <div
            key={z.i}
            className={`states ${z.focused ? "focused" : ""}`}
            data-id={z.i}
            style={{ opacity: z.hidden ? 0.5 : 1 }}
            onMouseEnter={() => zonesEditorActions.highlightOn(z.i)}
            onMouseLeave={() => zonesEditorActions.highlightOff(z.i)}
            onClick={_e => {
              if (state.customizationMode) {
                zonesEditorActions.selectZone(z.i);
              }
            }}
          >
            {/* @ts-ignore */}
            <FillBox fill={z.color} onClick={() => zonesEditorActions.changeColor(z.i)} />
            <input
              className="zoneName"
              style={{ width: "11em" }}
              value={z.name}
              onChange={e => zonesEditorActions.changeName(z.i, e.target.value)}
              autoCorrect="off"
              spellCheck="false"
            />
            <input
              className="zoneType"
              value={z.type}
              onChange={e => zonesEditorActions.changeType(z.i, e.target.value)}
            />
            <span className="icon-check-empty hide"></span>
            <div className="stateCells hide">{state.isPercentageMode ? pct(z.cells, state.totalCells) : z.cells}</div>
            <span className="icon-map-o hide" style={{ paddingRight: 4 }}></span>
            <div className="biomeArea hide">
              {state.isPercentageMode ? pct(z.area, state.totalArea) : `${si(z.area)} sq`}
            </div>
            <span className="icon-male hide"></span>
            <div className="zonePopulation hide pointer" onClick={() => zonesEditorActions.changePopulation(z.i)}>
              {state.isPercentageMode ? pct(z.population, state.totalPopulation) : si(z.population)}
            </div>
            <span className="icon-resize-vertical hide"></span>
            <span
              className={`zoneFog icon-pin ${z.focused ? "" : "inactive"} hide ${z.cells ? "" : "placeholder"}`}
              onClick={() => zonesEditorActions.toggleFog(z.i)}
            ></span>
            <span
              className={`zoneHide icon-eye hide ${z.cells ? "" : " placeholder"}`}
              onClick={() => zonesEditorActions.toggleVisibility(z.i)}
            ></span>
            <span
              className="zoneRemove icon-trash-empty hide"
              onClick={() => zonesEditorActions.removeZone(z.i)}
            ></span>
          </div>
        ))}
      </div>

      {state.customizationMode === 0 && (
        <div className="totalLine">
          <div style={{ marginLeft: 5 }}>
            Zones: <span>{state.totalZones}</span>
          </div>
          <div style={{ marginLeft: 12 }}>
            Cells: <span>{state.totalCells}</span>
          </div>
          <div style={{ marginLeft: 12 }}>
            Land Area: <span>{si(state.totalArea)}</span>
          </div>
          <div style={{ marginLeft: 12 }}>
            Population: <span>{si(state.totalPopulation)}</span>
          </div>
        </div>
      )}

      <div className="footer fmg-dialog-footer">
        {state.customizationMode === 0 ? (
          <>
            <select
              value={state.filterBy}
              onChange={e => setZonesEditorState({ filterBy: e.target.value })}
              style={{ width: "auto" }}
            >
              <option value="all">All</option>
              {state.types.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              data-tip="Refresh the Editor"
              className="icon-cw"
              type="button"
              onClick={() => zonesEditorActions.refresh()}
            ></button>
            <button
              data-tip="Edit zones style in Style Editor"
              className="icon-adjust"
              type="button"
              onClick={() => zonesEditorActions.editStyle()}
            ></button>
            <button
              data-tip="Toggle Legend box"
              className="icon-list-bullet"
              type="button"
              onClick={() => zonesEditorActions.toggleLegend()}
            ></button>
            <button
              data-tip="Toggle percentage / absolute values views"
              className="icon-percent"
              type="button"
              onClick={() => setZonesEditorState({ isPercentageMode: !state.isPercentageMode })}
            ></button>

            <button
              data-tip="Manually re-assign zones"
              className="icon-brush"
              type="button"
              onClick={() => zonesEditorActions.enterManualAssignment()}
            ></button>

            <button
              data-tip="Add a new zone"
              className="icon-plus"
              type="button"
              onClick={() => zonesEditorActions.addZone()}
            ></button>
            <button
              data-tip="Save zone-related data as a text file (.csv)"
              className="icon-download"
              type="button"
              onClick={() => zonesEditorActions.downloadCsv()}
            ></button>
          </>
        ) : (
          <div style={{ display: "inline-flex", alignItems: "center" }}>
            <div style={{ marginRight: 8, marginTop: -4 }}>
              <span style={{ fontSize: "11px", marginRight: "4px" }}>Brush size:</span>
              <SliderInput
                min={1}
                max={100}
                value={state.brushSize}
                onChange={(val: string) => setZonesEditorState({ brushSize: parseInt(val, 10) })}
              />
            </div>
            <button
              data-tip="Apply assignment"
              className="icon-check"
              type="button"
              onClick={() => zonesEditorActions.applyManualAssignment()}
            ></button>
            <button
              data-tip="Cancel assignment"
              className="icon-cancel"
              type="button"
              onClick={() => zonesEditorActions.cancelManualAssignment()}
            ></button>
            <div style={{ display: "inline-block", marginLeft: 8 }}>
              <label>
                <input
                  type="checkbox"
                  checked={state.landOnlyBrush}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setZonesEditorState({ landOnlyBrush: e.target.checked })
                  }
                />
                {" land only"}
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
