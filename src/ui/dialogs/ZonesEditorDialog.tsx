import type React from "react";
import { useRef, useState } from "react";
import { zonesEditorActions } from "../../controllers/zones-editor";
import { setZonesEditorState, useZonesEditorState, type ZoneRowData } from "../../store/zonesEditorState";
import { FillBox } from "../components/FillBox";
import { IconButton } from "../components/IconButton";
import { SliderInput } from "../components/SliderInput";
import { SortableHeader } from "../components/tables/SortableHeader";
import { VirtualTableBody } from "../components/VirtualTableBody";

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
      setSortDirection(-1);
    }
  };

  const pct = (val: number, total: number) => {
    if (!total) return "0%";
    return `${((val / total) * 100).toFixed(2)}%`;
  };

  const si = (n: number) => (n > 1000000 ? `${(n / 1000000).toFixed(2)}M` : n > 1000 ? `${(n / 1000).toFixed(2)}k` : n);

  const parentRef = useRef<HTMLDivElement>(null);
  const sortOrder = sortDirection === 1 ? "asc" : "desc";

  return (
    <div id="zonesEditor" className="stable">
      <div ref={parentRef} className="table" data-type={state.isPercentageMode ? "percentage" : "absolute"}>
        <table className="fmg-table">
          <thead>
            <tr>
              <SortableHeader
                label="Zone"
                field="name"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                style={{ width: "11em" }}
              />
              <SortableHeader
                label="Type"
                field="type"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
                style={{ width: "8em" }}
              />
              <SortableHeader
                label="Cells"
                field="cells"
                sortBy={sortBy}
                sortOrder={sortOrder}
                numeric
                className="hide"
                onSort={handleSort}
                style={{ width: "6em" }}
              />
              <SortableHeader
                label="Area"
                field="area"
                sortBy={sortBy}
                sortOrder={sortOrder}
                numeric
                className="hide"
                onSort={handleSort}
                style={{ width: "7em" }}
              />
              <SortableHeader
                label="Population"
                field="population"
                sortBy={sortBy}
                sortOrder={sortOrder}
                numeric
                className="hide"
                onSort={handleSort}
                style={{ width: "6em" }}
              />
              <th></th>
            </tr>
          </thead>
          <VirtualTableBody
            items={sortedZones}
            scrollElementRef={parentRef}
            renderRow={z => (
              <tr
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
                <td className="d-flex">
                  {/* @ts-ignore */}
                  <FillBox fill={z.color} onClick={() => zonesEditorActions.changeColor(z.i)} />
                  <input
                    className="zoneName"
                    value={z.name}
                    onChange={e => zonesEditorActions.changeName(z.i, e.target.value)}
                    autoCorrect="off"
                    spellCheck="false"
                  />
                </td>
                <td>
                  <input
                    className="zoneType"
                    value={z.type}
                    onChange={e => zonesEditorActions.changeType(z.i, e.target.value)}
                  />
                </td>
                <td className="hide numeric">
                  <span className="icon-check-empty"></span>
                  <div className="stateCells" style={{ display: "inline-block" }}>
                    {state.isPercentageMode ? pct(z.cells, state.totalCells) : z.cells}
                  </div>
                </td>
                <td className="hide numeric">
                  <span className="icon-map-o"></span>
                  <div className="biomeArea" style={{ display: "inline-block" }}>
                    {state.isPercentageMode ? pct(z.area, state.totalArea) : `${si(z.area)} sq`}
                  </div>
                </td>
                <td className="hide numeric pointer" onClick={() => zonesEditorActions.changePopulation(z.i)}>
                  <span className="icon-male"></span>
                  <div className="zonePopulation" style={{ display: "inline-block" }}>
                    {state.isPercentageMode ? pct(z.population, state.totalPopulation) : si(z.population)}
                  </div>
                </td>
                <td className="hide">
                  <span className="icon-resize-vertical"></span>
                  <IconButton
                    className={`zoneFog icon-pin ${z.focused ? "" : "inactive"} ${z.cells ? "" : "placeholder"}`}
                    onClick={() => zonesEditorActions.toggleFog(z.i)}
                  ></IconButton>
                  <IconButton
                    className={`zoneHide icon-eye ${z.cells ? "" : " placeholder"}`}
                    onClick={() => zonesEditorActions.toggleVisibility(z.i)}
                  ></IconButton>
                  <IconButton
                    className="zoneRemove icon-trash-empty"
                    onClick={() => zonesEditorActions.removeZone(z.i)}
                  ></IconButton>
                </td>
              </tr>
            )}
          />
        </table>
      </div>
      {state.customizationMode === 0 && (
        <div className="totalLine">
          <div>
            Zones: <span>{state.totalZones}</span>
          </div>
          <div>
            Cells: <span>{state.totalCells}</span>
          </div>
          <div>
            Land Area: <span>{si(state.totalArea)}</span>
          </div>
          <div>
            Population: <span>{si(state.totalPopulation)}</span>
          </div>
        </div>
      )}
      <div className="footer footer">
        {state.customizationMode === 0 ? (
          <>
            <select value={state.filterBy} onChange={e => setZonesEditorState({ filterBy: e.target.value })}>
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
          <div className="d-inline-flex">
            <div>
              <span>Brush size:</span>
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
            <div className="d-inline-block">
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
