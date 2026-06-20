import { worldContext } from "../context/worldContext";
import type { Burg } from "../modules/burgs-generator";
import type { PackedGraphFeature } from "../modules/features";
import type { Province } from "../modules/provinces-generator";
import type { State } from "../modules/states-generator";
import { type ChartData, ElevationProfileRenderer } from "../renderers/elevation-profile-renderer";
import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { ensureEl, getLatitude, getLongitude, rn } from "../utils";
import { getHeight, tip } from "../utils/uiHelpers";
import { downloadFile, getFileName } from "./editors";

declare global {
  var ElevationProfile: ElevationProfileModule;
}

class ElevationProfileModule {
  open(cells: number[], routeLen: number, isRiver: boolean): void {
    closeDialogs("#elevationProfile, .stable");
    ensureEl("epCurve").addEventListener("change", draw);
    ensureEl("epSave").addEventListener("click", downloadCSV);
    ensureEl("epSaveSVG").addEventListener("click", downloadSVG);
    ensureEl("epSavePNG").addEventListener("click", downloadPNG);

    const firstCell = cells[0];
    const lastCell = cells.at(-1);
    if (firstCell === undefined || lastCell === undefined) {
      tip("Elevation profile: no data", true, "error");
      return;
    }

    // For rivers, remember the general slope direction to prevent rendering uphill flow
    let slope = 0;
    if (isRiver) {
      const firstH = worldContext.pack.cells.h[firstCell];
      const lastH = worldContext.pack.cells.h[lastCell];
      if (firstH < lastH) slope = 1;
      else if (firstH > lastH) slope = -1;
    }

    const chartWidth = window.innerWidth - 400;
    const chartHeight = 300;
    const xOffset = 80;
    const yOffset = 2;
    const biomesHeight = 10;

    // Pre-process all cell data into chartData arrays
    const chartData: ChartData = {
      biome: [],
      burg: [],
      cell: [],
      height: [],
      mi: 1e6,
      ma: 0,
      mih: 100,
      mah: 0,
      points: []
    };

    let totalAscent = 0;
    let totalDescent = 0;
    let lastBurgIndex = 0;
    let lastBurgCell = 0;

    for (let i = 0, prevB = 0, prevH = -1; i < cells.length; i++) {
      const cell = cells[i];
      let h = worldContext.pack.cells.h[cell];

      if (h < 20) {
        const f = worldContext.pack.features[worldContext.pack.cells.f[cell]] as PackedGraphFeature;
        h = f.type === "lake" ? f.height : 20;
      }

      if (prevH !== -1 && isRiver) {
        if (slope === 1 && h < prevH) h = prevH;
        else if (slope === 0 && h !== prevH) h = prevH;
        else if (slope === -1 && h > prevH) h = prevH;
      }
      prevH = h;

      let b = worldContext.pack.cells.burg[cell];
      if (b === prevB) b = 0;
      else prevB = b;
      if (b) {
        lastBurgIndex = i;
        lastBurgCell = cell;
      }

      chartData.biome[i] = worldContext.pack.cells.biome[cell];
      chartData.burg[i] = b;
      chartData.cell[i] = cell;
      const sh = getHeight(h);
      chartData.height[i] = parseInt(sh, 10);
      chartData.mih = Math.min(chartData.mih, h);
      chartData.mah = Math.max(chartData.mah, h);
      chartData.mi = Math.min(chartData.mi, chartData.height[i]);
      chartData.ma = Math.max(chartData.ma, chartData.height[i]);
    }

    for (let i = 1; i < cells.length; i++) {
      const diff = chartData.height[i] - chartData.height[i - 1];
      if (diff > 0) totalAscent += diff;
      else totalDescent -= diff;
    }

    // Move last burg label to the final point if it falls right at the end
    if (lastBurgIndex !== 0 && lastBurgCell === chartData.cell[cells.length - 1] && lastBurgIndex < cells.length - 1) {
      chartData.burg[cells.length - 1] = chartData.burg[lastBurgIndex];
      chartData.burg[lastBurgIndex] = 0;
    }

    draw();

    openDialog("elevationProfile", {
      title: "Elevation profile",
      resizable: false,
      close: closeElevationProfile,
      position: {
        my: "center bottom",
        at: "center bottom-40px",
        of: "svg",
        collision: "fit"
      }
    });

    function draw(): void {
      const epCurve = ensureEl<HTMLSelectElement>("epCurve");
      ElevationProfileRenderer.render("elevationGraph", {
        chartData,
        cellsLength: cells.length,
        routeLen,
        chartWidth,
        chartHeight,
        xOffset,
        yOffset,
        biomesHeight,
        worldContext,
        heightUnit: heightUnit.value,
        distanceUnit: distanceUnitInput.value,
        curveIndex: epCurve.selectedIndex,
        totalAscent,
        totalDescent
      });
    }

    function downloadCSV(): void {
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
      const svgEl = ensureEl("elevationSVG");
      const svgStr = `<?xml version="1.0" encoding="utf-8"?>\n${new XMLSerializer().serializeToString(svgEl)}`;
      downloadFile(svgStr, `${getFileName("elevation profile")}.svg`);
    }

    function downloadPNG(): void {
      const svgEl = ensureEl("elevationSVG");
      const w = +svgEl.getAttribute("width")!;
      const h = +svgEl.getAttribute("height")!;
      const svgUrl = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(svgEl)], {
          type: "image/svg+xml;charset=utf-8"
        })
      );
      const canvas = Object.assign(document.createElement("canvas"), {
        width: w,
        height: h
      });
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

    function closeElevationProfile(): void {
      ensureEl("epCurve").removeEventListener("change", draw);
      ensureEl("epSave").removeEventListener("click", downloadCSV);
      ensureEl("epSaveSVG").removeEventListener("click", downloadSVG);
      ensureEl("epSavePNG").removeEventListener("click", downloadPNG);
      ensureEl("elevationGraph").innerHTML = "";
      modules.elevation = false;
    }
  }
}
