import { mean } from "d3";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { viewContext } from "../../context/viewContext";
import { worldContext } from "../../context/worldContext";
import { getFileName, highlightElement } from "../../controllers/editors";
import { toggleRivers } from "../../controllers/layers";
import { createRiver } from "../../controllers/rivers-creator";
import { editRiver } from "../../controllers/rivers-editor";
import { toggleAddRiver } from "../../controllers/tools";
import { removeRivers } from "../../renderers/draw-rivers";
import { clearRivers, removeRiver } from "../../runtime/worldRuntime";
import { viewLayerService as view } from "../../services/viewLayerService";
import { useDialogState } from "../../store/dialogState";
import { useOptionsState } from "../../store/optionsState";
import { useRiversOverviewState } from "../../store/riversOverviewState";
import { rn } from "../../utils";
import { layerIsOn } from "../../utils/nodeUtils";
import { IconButton } from "../components/IconButton";
import { VirtualTableBody } from "../components/VirtualTableBody";
import { Dialog } from "./Dialog";
import { closeDialog, openConfirm } from "./dialogService";

function riverHighlightOn(id: number): void {
  if (!layerIsOn("toggleRivers")) toggleRivers();
  view.rivers.select(`#river${id}`).attr("stroke", "red").attr("stroke-width", 1);
}

function riverHighlightOff(id: number): void {
  view.rivers.select(`#river${id}`).attr("stroke", null).attr("stroke-width", null);
}

function zoomToRiver(id: number): void {
  const river = view.rivers.select(`#river${id}`).node() as Element;
  highlightElement(river, 3);
}

function triggerRiverRemove(id: number, refresh: () => void): void {
  openConfirm(`Are you sure you want to remove the river? All tributaries will be auto-removed`, {
    title: "Remove river",
    confirm: "Remove",
    onConfirm: () => {
      const commit = removeRiver({ riverId: id });
      if (commit) removeRivers(viewContext, [...commit.result.riverIds]);
      refresh();
    }
  });
}

function triggerAllRiversRemove(refresh: () => void): void {
  openConfirm(`Are you sure you want to remove all rivers?`, {
    title: "Remove all rivers",
    confirm: "Remove",
    onConfirm: () => {
      const commit = clearRivers();
      if (commit) removeRivers(viewContext, [...commit.result.riverIds]);
      refresh();
    }
  });
}

function toggleBasinsHightlight(): void {
  if (view.rivers.attr("data-basin") === "hightlighted") {
    view.rivers.selectAll("*").attr("fill", null);
    view.rivers.attr("data-basin", null);
  } else {
    view.rivers.attr("data-basin", "hightlighted");
    const basins = [...new Set(worldContext.pack.rivers.map(r => r.basin))];
    const colors = [
      "#1f77b4",
      "#ff7f0e",
      "#2ca02c",
      "#d62728",
      "#9467bd",
      "#8c564b",
      "#e377c2",
      "#7f7f7f",
      "#bcbd22",
      "#17becf"
    ];

    basins.forEach((b, i) => {
      const color = colors[i % colors.length];
      worldContext.pack.rivers
        .filter(r => r.basin === b)
        .forEach(r => {
          view.rivers.select(`#river${r.i}`).attr("fill", color);
        });
    });
  }
}

export const RiversOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("riversOverview"));
  const { search, sortBy, sortOrder, refreshCounter, setSearch, toggleSortBy, refresh } = useRiversOverviewState();
  const unit = useOptionsState(s => s.distanceUnit);

  // biome-ignore lint/correctness/useExhaustiveDependencies: We explicitly depend on refreshCounter to force a re-calculation when data mutates externally
  const { filteredRivers, riversById } = useMemo(() => {
    const rivers = worldContext.pack?.rivers || [];
    const riversById = new Map(rivers.map(river => [river.i, river]));
    let filteredRivers = rivers;
    const text = search.toLowerCase().trim();

    if (text) {
      filteredRivers = filteredRivers.filter(r => {
        const name = (r.name || "").toLowerCase();
        const type = (r.type || "").toLowerCase();
        const basin = riversById.get(r.basin);
        const basinName = basin ? (basin.name || "").toLowerCase() : "";
        return name.includes(text) || type.includes(text) || basinName.includes(text);
      });
    }

    filteredRivers = [...filteredRivers].sort((a, b) => {
      let valA: string | number = "";
      let valB: string | number = "";
      if (sortBy === "name") {
        valA = a.name || "";
        valB = b.name || "";
      } else if (sortBy === "type") {
        valA = a.type || "";
        valB = b.type || "";
      } else if (sortBy === "discharge") {
        valA = a.discharge || 0;
        valB = b.discharge || 0;
      } else if (sortBy === "length") {
        valA = a.length || 0;
        valB = b.length || 0;
      } else if (sortBy === "width") {
        valA = a.width || 0;
        valB = b.width || 0;
      } else if (sortBy === "basin") {
        valA = riversById.get(a.basin)?.name || "";
        valB = riversById.get(b.basin)?.name || "";
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return { filteredRivers, riversById };
  }, [search, sortBy, sortOrder, refreshCounter]);

  const averageDischarge = rn(mean(filteredRivers.map(r => r.discharge)) ?? 0) || 0;
  const averageLength = rn(mean(filteredRivers.map(r => r.length)) ?? 0) || 0;
  const averageWidth = rn(mean(filteredRivers.map(r => r.width)) ?? 0, 3) || 0;

  function downloadRiversData(): void {
    let data = "Id,River,Type,Discharge,Length,Width,Basin\n";
    filteredRivers.forEach(d => {
      const discharge = `${d.discharge} m³/s`;
      const length = `${rn((d.length || 0) * worldContext.distanceScale)} ${unit}`;
      const width = `${rn((d.width || 0) * worldContext.distanceScale, 3)} ${unit}`;
      const basin = riversById.get(d.basin)?.name || "";
      data += `${[d.i, d.name, d.type, discharge, length, width, basin].join(",")}\n`;
    });

    // Create link directly as downloadFile is in editors.ts and expects DOM
    const link = document.createElement("a");
    link.download = `${getFileName("Rivers")}.csv`;
    link.href = URL.createObjectURL(new Blob([data], { type: "text/plain" }));
    link.click();
  }

  const parentRef = React.useRef<HTMLDivElement>(null);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.riversOverview")}
      onClose={() => closeDialog("riversOverview")}
      className="fmg-dialog--table"
    >
      <div id="riversOverviewContainer">
        <div ref={parentRef} id="riversBody" className="table">
          <table className="fmg-table">
            <thead>
              <tr id="riversHeader">
                <th
                  data-tip="Click to sort by river name"
                  className={`sortable alphabetically ${sortBy === "name" ? (sortOrder === "asc" ? "icon-sort-name-up" : "icon-sort-name-down") : ""}`}
                  onClick={() => toggleSortBy("name")}
                >
                  River
                </th>
                <th
                  data-tip="Click to sort by river type name"
                  className={`sortable alphabetically ${sortBy === "type" ? (sortOrder === "asc" ? "icon-sort-name-up" : "icon-sort-name-down") : ""}`}
                  onClick={() => toggleSortBy("type")}
                >
                  Type
                </th>
                <th
                  data-tip="Click to sort by discharge (flux in m3/s)"
                  className={`sortable ${sortBy === "discharge" ? (sortOrder === "asc" ? "icon-sort-number-up" : "icon-sort-number-down") : ""}`}
                  onClick={() => toggleSortBy("discharge")}
                >
                  Discharge
                </th>
                <th
                  data-tip="Click to sort by river length"
                  className={`sortable ${sortBy === "length" ? (sortOrder === "asc" ? "icon-sort-number-up" : "icon-sort-number-down") : ""}`}
                  onClick={() => toggleSortBy("length")}
                >
                  Length
                </th>
                <th
                  data-tip="Click to sort by river mouth width"
                  className={`sortable ${sortBy === "width" ? (sortOrder === "asc" ? "icon-sort-number-up" : "icon-sort-number-down") : ""}`}
                  onClick={() => toggleSortBy("width")}
                >
                  Width
                </th>
                <th
                  data-tip="Click to sort by river basin"
                  className={`sortable alphabetically ${sortBy === "basin" ? (sortOrder === "asc" ? "icon-sort-name-up" : "icon-sort-name-down") : ""}`}
                  onClick={() => toggleSortBy("basin")}
                >
                  Basin
                </th>
                <th></th>
              </tr>
            </thead>
            <VirtualTableBody
              items={filteredRivers}
              scrollElementRef={parentRef}
              renderRow={r => {
                const basin = riversById.get(r.basin)?.name || "";
                return (
                  <tr
                    key={r.i}
                    className="states"
                    onMouseEnter={() => riverHighlightOn(r.i)}
                    onMouseLeave={() => riverHighlightOff(r.i)}
                  >
                    <td>
                      <div className="d-flex">
                        <IconButton
                          data-tip="Locate the river"
                          className="icon-target pointer"
                          onClick={() => zoomToRiver(r.i)}
                        />
                        <div data-tip="River name" className="riverName">
                          {r.name}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div data-tip="River type name" className="riverType">
                        {r.type}
                      </div>
                    </td>
                    <td className="numeric">
                      <div data-tip="River discharge (flux power)" className="biomeArea">
                        {`${r.discharge} m³/s`}
                      </div>
                    </td>
                    <td className="numeric">
                      <div data-tip="River length from source to mouth" className="biomeArea">
                        {`${rn(r.length * worldContext.distanceScale)} ${unit}`}
                      </div>
                    </td>
                    <td className="numeric">
                      <div data-tip="River mouth width" className="biomeArea">
                        {`${rn(r.width * worldContext.distanceScale, 3)} ${unit}`}
                      </div>
                    </td>
                    <td>
                      <input
                        data-tip="River basin (name of the main stem)"
                        className="stateName"
                        value={basin}
                        disabled
                      />
                    </td>
                    <td>
                      <div className="d-flex">
                        <IconButton
                          data-tip="Edit river"
                          className="icon-pencil pointer"
                          onClick={() => editRiver(`river${r.i}`)}
                        />
                        <IconButton
                          data-tip="Remove river"
                          className="icon-trash-empty pointer"
                          onClick={() => triggerRiverRemove(r.i, refresh)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              }}
            />
          </table>
        </div>
        <div id="riversTotal" className="totalLine">
          <div data-tip="Rivers number">
            Rivers:
            <span id="riversFooterNumber">{`${filteredRivers.length} of ${worldContext.pack?.rivers?.length || 0}`}</span>
          </div>
          <div data-tip="Average discharge">
            Average discharge:<span id="riversFooterDischarge">{`${averageDischarge} m³/s`}</span>
          </div>
          <div data-tip="Average length">
            Length:
            <span id="riversFooterLength">{`${averageLength * worldContext.distanceScale} ${unit}`}</span>
          </div>
          <div data-tip="Average mouth width">
            Width:
            <span id="riversFooterWidth">{`${rn(averageWidth * worldContext.distanceScale, 3)} ${unit}`}</span>
          </div>
        </div>
        <div id="riversFooter" className="footer">
          <button type="button" data-tip="Refresh the Editor" className="icon-cw" onClick={refresh} />
          <button
            type="button"
            data-tip="Automatically add river starting from clicked cell. Hold Shift to add multiple"
            className="icon-plus"
            onClick={toggleAddRiver}
          />
          <button
            type="button"
            data-tip="Create a new river selecting river cells"
            className="icon-map-pin"
            onClick={createRiver}
          />
          <button
            type="button"
            data-tip="Toggle basin highlight mode"
            className="icon-sitemap"
            onClick={toggleBasinsHightlight}
          />
          <button
            type="button"
            data-tip="Save rivers-related data as a text file (.csv)"
            className="icon-download"
            onClick={downloadRiversData}
          />
          <button
            type="button"
            data-tip="Remove all rivers"
            className="icon-trash"
            onClick={() => triggerAllRiversRemove(refresh)}
          />
          <label htmlFor="riversSearch" data-tip="Filter by name, type or basin">
            Search: <input id="riversSearch" type="search" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
        </div>
      </div>
    </Dialog>
  );
};
