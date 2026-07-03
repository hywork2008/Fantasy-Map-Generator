import type React from "react";
import { useEffect, useRef, useState } from "react";
import { worldContext } from "../../context/worldContext";
import { downloadFile, getFileName } from "../../controllers/editors";
import { ElevationProfileRenderer } from "../../renderers/elevation-profile-renderer";
import { getHeight } from "../../services/cellInfoService";
import { viewLayerService as view } from "../../services/viewLayerService";
import { useDialogState } from "../../store/dialogState";
import { useElevationProfileState } from "../../store/elevationProfileState";
import { useOptionsState } from "../../store/optionsState";
import type { Burg, Province, State } from "../../types/models";
import { getLatitude, getLongitude, rn } from "../../utils";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

const CHART_HEIGHT = 300;
const X_OFFSET = 80;
const Y_OFFSET = 2;
const BIOMES_HEIGHT = 10;

export const ElevationProfileDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("elevationProfile"));
  const { chartData, cells, routeLen, totalAscent, totalDescent, reset } = useElevationProfileState();
  const heightUnit = useOptionsState(s => s.heightUnit);
  const distanceUnit = useOptionsState(s => s.distanceUnit);

  const [curveIndex, setCurveIndex] = useState(3); // Monotone X default
  const graphRef = useRef<HTMLDivElement>(null);

  // Render chart whenever dialog opens or curve changes
  useEffect(() => {
    if (!isOpen || !chartData) return;

    ElevationProfileRenderer.render("elevationGraph", {
      chartData,
      cellsLength: cells.length,
      routeLen,
      chartWidth: view.svgWidth - 400,
      chartHeight: CHART_HEIGHT,
      xOffset: X_OFFSET,
      yOffset: Y_OFFSET,
      biomesHeight: BIOMES_HEIGHT,
      worldContext,
      heightUnit,
      distanceUnit,
      curveIndex,
      totalAscent,
      totalDescent
    });
  }, [isOpen, chartData, cells.length, routeLen, heightUnit, distanceUnit, curveIndex, totalAscent, totalDescent]);

  function handleClose(): void {
    reset();
    if (graphRef.current) graphRef.current.innerHTML = "";
    closeDialog("elevationProfile");
  }

  function getSvgEl(): SVGSVGElement | null {
    return document.getElementById("elevationSVG") as SVGSVGElement | null;
  }

  function downloadCSV(): void {
    if (!chartData) return;
    const headers =
      "Id,x,y,lat,lon,Cell,Height,Height value,Population,Burg,Burg population,Biome,Biome color,Culture,Culture color,Religion,Religion color,Province,Province color,State,State color\n";
    const rows = chartData.points.map((_, k) => {
      const cell = chartData.cell[k];
      const [x, y] = worldContext.pack.cells.p[cells[k]];
      const h = worldContext.pack.cells.h[cell];
      const burgId = worldContext.pack.cells.burg[cell];
      const pop = worldContext.pack.cells.pop[cell];
      const burg = burgId ? (worldContext.pack.burgs[burgId] as Burg) : null;
      const burgPop = burg ? (burg.population ?? 0) * worldContext.populationRate * worldContext.urbanization : 0;
      const culture = worldContext.pack.cultures[worldContext.pack.cells.culture[cell]] as {
        name: string;
        color: string;
      };
      const religion = worldContext.pack.religions[worldContext.pack.cells.religion[cell]] as {
        name: string;
        color: string;
      };
      const province = worldContext.pack.provinces[worldContext.pack.cells.province[cell]] as Province | 0;
      const state = worldContext.pack.states[worldContext.pack.cells.state[cell]] as State;
      return [
        k + 1,
        x,
        y,
        getLatitude(y, worldContext.mapCoordinates, worldContext.graphHeight, 2),
        getLongitude(x, worldContext.mapCoordinates, worldContext.graphWidth, 2),
        cell,
        getHeight(h),
        h,
        rn(pop * worldContext.populationRate),
        burg?.name ?? "",
        burgPop,
        worldContext.biomesData.name[worldContext.pack.cells.biome[cell]],
        worldContext.biomesData.color[worldContext.pack.cells.biome[cell]],
        culture.name,
        culture.color,
        religion.name,
        religion.color,
        province ? province.name : "",
        province ? province.color : "",
        state.name,
        (state as State & { color: string }).color
      ].join(",");
    });
    downloadFile(`${headers}${rows.join("\n")}`, `${getFileName("elevation profile")}.csv`);
  }

  function downloadSVG(): void {
    const svgEl = getSvgEl();
    if (!svgEl) return;
    const svgStr = `<?xml version="1.0" encoding="utf-8"?>\n${new XMLSerializer().serializeToString(svgEl)}`;
    downloadFile(svgStr, `${getFileName("elevation profile")}.svg`);
  }

  function downloadPNG(): void {
    const svgEl = getSvgEl();
    if (!svgEl) return;
    const w = +svgEl.getAttribute("width")!;
    const h = +svgEl.getAttribute("height")!;
    const svgUrl = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(svgEl)], { type: "image/svg+xml;charset=utf-8" })
    );
    const canvas = Object.assign(document.createElement("canvas"), { width: w, height: h });
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob(pngBlob => {
        const a = Object.assign(document.createElement("a"), {
          href: URL.createObjectURL(pngBlob!),
          download: `${getFileName("elevation profile")}.png`
        });
        a.click();
        URL.revokeObjectURL(a.href);
      });
    };
    img.src = svgUrl;
  }

  return (
    <Dialog isOpen={isOpen} title="Elevation Profile" onClose={handleClose}>
      <div id="elevationGraph" ref={graphRef} data-tip="Elevation profile" />
      <div>
        <div id="epControls">
          <span data-tip="Set curve profile">
            Curve:{" "}
            <select value={curveIndex} onChange={e => setCurveIndex(+e.target.value)}>
              <option value={0}>Linear</option>
              <option value={1}>Bundle</option>
              <option value={2}>Cubic Catmull-Rom</option>
              <option value={3}>Monotone X</option>
              <option value={4}>Natural</option>
            </select>
          </span>
          <span>
            <button
              type="button"
              data-tip="Download the chart data as a CSV file"
              className="icon-download"
              onClick={downloadCSV}
            />
          </span>
          <span>
            <button type="button" data-tip="Download the chart as an SVG image" onClick={downloadSVG}>
              SVG
            </button>
          </span>
          <span>
            <button type="button" data-tip="Download the chart as a PNG image" onClick={downloadPNG}>
              PNG
            </button>
          </span>
          <span id="epstats" />
        </div>
      </div>
    </Dialog>
  );
};
