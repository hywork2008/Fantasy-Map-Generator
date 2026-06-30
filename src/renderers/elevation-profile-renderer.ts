import {
  axisBottom,
  axisLeft,
  type CurveFactory,
  type CurveFactoryLineOnly,
  curveBundle,
  curveCatmullRom,
  curveLinear,
  curveMonotoneX,
  curveNatural,
  line,
  pointer,
  type Selection,
  scaleLinear,
  select
} from "d3";
import { zoomTo } from "../actions";
import type { WorldContext } from "../context/worldContext";
import { tip } from "../services/tooltipService";
import type { Burg, Province, State } from "../types/models";
import { rn } from "../utils";
import { getColor, getColorScheme } from "../utils/colorUtils";

export interface ChartData {
  biome: number[];
  burg: number[];
  cell: number[];
  height: number[];
  mi: number;
  ma: number;
  mih: number;
  mah: number;
  points: [number, number][];
}

export interface ElevationProfileRendererParams {
  chartData: ChartData;
  cellsLength: number;
  routeLen: number;
  chartWidth: number;
  chartHeight: number;
  xOffset: number;
  yOffset: number;
  biomesHeight: number;
  worldContext: WorldContext;
  heightUnit: string;
  distanceUnit: string;
  curveIndex: number;
  totalAscent: number;
  totalDescent: number;
}

export const ElevationProfileRenderer = {
  render(containerId: string, params: ElevationProfileRendererParams): void {
    const {
      chartData,
      cellsLength,
      routeLen,
      chartWidth,
      chartHeight,
      xOffset,
      yOffset,
      biomesHeight,
      worldContext,
      heightUnit,
      distanceUnit,
      curveIndex,
      totalAscent,
      totalDescent
    } = params;

    chartData.points = [];

    const xscale = scaleLinear()
      .domain([0, cellsLength - 1])
      .range([0, chartWidth]);
    const yscale = scaleLinear()
      .domain([0, chartData.ma * 1.1])
      .range([chartHeight, 0]);

    for (let i = 0; i < cellsLength; i++) {
      chartData.points.push([xscale(i) + xOffset, yscale(chartData.height[i]) + yOffset]);
    }

    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    const chart = select(`#${containerId}`)
      .append("svg")
      .attr("width", chartWidth + 120)
      .attr("height", chartHeight + yOffset + biomesHeight)
      .attr("id", "elevationSVG")
      .attr("class", "epbackground");

    const defs = chart.append("defs");

    // Arrowhead marker for burg label lines
    defs
      .append("marker")
      .attr("id", "arrowhead")
      .attr("orient", "auto")
      .attr("markerWidth", "2")
      .attr("markerHeight", "4")
      .attr("refX", "0.1")
      .attr("refY", "2")
      .append("path")
      .attr("d", "M0,0 V4 L2,2 Z")
      .attr("fill", "darkgray");

    // Terrain elevation gradient (top = peak colour, bottom = valley colour)
    const scheme = getColorScheme("natural");
    const landGrad = defs
      .append("linearGradient")
      .attr("id", "landdef")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    if (chartData.mah === chartData.mih) {
      const c = getColor(chartData.mih, scheme);
      landGrad.append("stop").attr("offset", "0%").attr("style", `stop-color:${c};stop-opacity:1`);
      landGrad.append("stop").attr("offset", "100%").attr("style", `stop-color:${c};stop-opacity:1`);
    } else {
      const steps = Math.min(20, chartData.mah - chartData.mih);
      for (let s = 0; s <= steps; s++) {
        const h = Math.round(chartData.mah - (s / steps) * (chartData.mah - chartData.mih));
        landGrad
          .append("stop")
          .attr("offset", `${(s / steps) * 100}%`)
          .attr("style", `stop-color:${getColor(h, scheme)};stop-opacity:1`);
      }
    }

    // Clip biome bar to chart bounds
    defs
      .append("clipPath")
      .attr("id", "epBiomesClip")
      .append("rect")
      .attr("x", xOffset)
      .attr("y", yOffset + chartHeight)
      .attr("width", chartWidth)
      .attr("height", biomesHeight);

    // Build the elevation curve using the selected interpolation
    const curveTypes: (CurveFactory | CurveFactoryLineOnly)[] = [
      curveLinear,
      curveBundle.beta(1),
      curveCatmullRom.alpha(0.5),
      curveMonotoneX,
      curveNatural
    ];
    const safeCurveIndex = Math.min(Math.max(0, curveIndex), curveTypes.length - 1);
    const lineFn = line<[number, number]>().curve(curveTypes[safeCurveIndex] as CurveFactory);

    // Land fill: curve + straight close along the bottom edge
    const pts = chartData.points;
    if (pts.length === 0) return;
    const lastX = pts[pts.length - 1][0];
    const baseY = yscale(0) + yOffset;
    const landPath =
      (lineFn(pts) ?? "") +
      ` L${lastX},${pts[pts.length - 1][1]}` +
      ` L${lastX},${baseY}` +
      ` L${xscale(0) + xOffset},${baseY}Z`;

    chart
      .append("g")
      .attr("id", "epland")
      .append("path")
      .attr("d", landPath)
      .attr("stroke", "none")
      .attr("fill", "url(#landdef)");

    // Profile outline stroke
    chart
      .append("g")
      .attr("id", "epline")
      .append("path")
      .attr("d", lineFn(pts.slice()) ?? "")
      .attr("stroke", "#5a3e28")
      .attr("stroke-width", 1.5)
      .attr("fill", "none");

    // Biome colour bar
    const biomesG = chart.append("g").attr("id", "epbiomes").attr("clip-path", "url(#epBiomesClip)");
    const tileWidth = xscale(1);

    for (let k = 0; k < pts.length; k++) {
      const cell = chartData.cell[k];
      const biome = chartData.biome[k];
      const province = worldContext.pack.cells.province[cell];
      const burgId = chartData.burg[k];
      const pop =
        worldContext.pack.cells.pop[cell] +
        (burgId ? ((worldContext.pack.burgs[burgId] as Burg).population ?? 0) * worldContext.urbanization : 0);
      const provinceName = province ? (worldContext.pack.provinces[province] as Province).name : null;
      const stateName = (worldContext.pack.states[worldContext.pack.cells.state[cell]] as State).name;
      const religionName = (worldContext.pack.religions[worldContext.pack.cells.religion[cell]] as { name: string })
        .name;
      const cultureName = (worldContext.pack.cultures[worldContext.pack.cells.culture[cell]] as { name: string }).name;
      const dataTip = [
        worldContext.biomesData.name[biome],
        provinceName,
        stateName,
        religionName,
        cultureName,
        `height: ${chartData.height[k]} ${heightUnit}`,
        `population ${rn(pop * worldContext.populationRate)}`
      ]
        .filter(Boolean)
        .join(", ");

      biomesG
        .append("rect")
        .attr("x", pts[k][0])
        .attr("y", yOffset + chartHeight)
        .attr("width", tileWidth)
        .attr("height", biomesHeight)
        .attr("fill", worldContext.biomesData.color[biome])
        .attr("stroke", worldContext.biomesData.color[biome])
        .attr("data-tip", dataTip);
    }

    // Axes
    const xAxis = axisBottom(xscale)
      .ticks(10)
      .tickFormat(d => `${rn((Number(d) / (pts.length - 1)) * routeLen)} ${distanceUnit}`);
    const yAxis = axisLeft(yscale)
      .ticks(5)
      .tickFormat(d => `${d} ${heightUnit}`);

    chart
      .append("g")
      .attr("id", "epxaxis")
      .attr("transform", `translate(${xOffset},${chartHeight + yOffset + 20})`)
      .call(xAxis)
      .selectAll("text")
      .style("text-anchor", "center");

    chart
      .append("g")
      .attr("id", "epyaxis")
      .attr("transform", `translate(${xOffset - 10},${yOffset})`)
      .call(yAxis);

    // Grid lines
    const gridStyle = (g: Selection<SVGGElement, unknown, HTMLElement, unknown>): void => {
      g.attr("stroke", "lightgrey").attr("stroke-opacity", "0.2").attr("stroke-width", "0.5");
      g.selectAll("path").attr("stroke-width", "0");
    };

    chart
      .append("g")
      .attr("id", "epxgrid")
      .attr("class", "epgrid")
      .attr("stroke-dasharray", "4 1")
      .attr("transform", `translate(${xOffset},${chartHeight + yOffset})`)
      .call(gridStyle);

    chart
      .append("g")
      .attr("id", "epygrid")
      .attr("class", "epgrid")
      .attr("stroke-dasharray", "4 1")
      .attr("transform", `translate(${xOffset},${yOffset})`)
      .call(gridStyle);

    // Burg labels anchored above their curve point with all-pairs overlap avoidance
    const labelsG = chart.append("g").attr("id", "epburglabels");
    const LABEL_GAP = 18; // px above the dot for the label baseline
    const MIN_LABEL_Y = 12; // topmost allowed y
    const LINE_HEIGHT = 14; // stacking increment
    const X_PROXIMITY = 70; // horizontal proximity threshold for stacking
    const placed: { lx: number; ly: number }[] = [];

    for (let k = 0; k < pts.length; k++) {
      if (!chartData.burg[k]) continue;
      const b = chartData.burg[k];
      const burg = worldContext.pack.burgs[b] as Burg;
      const lx = pts[k][0];
      const ptY = pts[k][1];
      let ly = ptY - LABEL_GAP;

      // Push up until no vertical overlap with any nearby placed label
      let changed = true;
      while (changed) {
        changed = false;
        for (const p of placed) {
          if (Math.abs(lx - p.lx) < X_PROXIMITY && Math.abs(ly - p.ly) < LINE_HEIGHT) {
            const candidate = p.ly - LINE_HEIGHT;
            if (candidate < MIN_LABEL_Y) break;
            ly = candidate;
            changed = true;
            break;
          }
        }
      }
      ly = Math.max(MIN_LABEL_Y, ly);
      placed.push({ lx, ly });

      labelsG
        .append("text")
        .attr("id", `ep${b}`)
        .attr("class", "epburglabel")
        .attr("x", lx)
        .attr("y", ly)
        .attr("text-anchor", "middle")
        .attr("data-tip", `Focus on ${burg.name}`)
        .style("cursor", "pointer")
        .on("click", () => zoomTo(burg.x, burg.y, 8, 2000))
        .text(burg.name ?? "");

      if (ly + 4 < ptY - 4) {
        labelsG
          .append("path")
          .attr("d", `M${lx},${ly + 3}L${lx},${ptY - 3}`)
          .attr("stroke", "darkgray")
          .attr("stroke-width", "1")
          .attr("fill", "none")
          .attr("marker-end", "url(#arrowhead)");
      }
    }

    // Burg dots on the curve
    const dotsG = chart.append("g").attr("id", "epburgdots");
    for (let k = 0; k < pts.length; k++) {
      if (!chartData.burg[k]) continue;
      dotsG
        .append("circle")
        .attr("cx", pts[k][0])
        .attr("cy", pts[k][1])
        .attr("r", 4)
        .attr("fill", "white")
        .attr("stroke", "#333")
        .attr("stroke-width", 1.5);
    }

    // Stats line in the controls bar
    const epstats = document.getElementById("epstats");
    if (epstats) {
      epstats.textContent = `Elev: ${chartData.mi}\u2013${chartData.ma} ${heightUnit}\u2002\u2191\u202f${totalAscent}\u2002\u2193\u202f${totalDescent} ${heightUnit}`;
    }

    // Crosshair + FMG tooltip on hover
    const crosshairG = chart.append("g").attr("id", "epcrosshair").style("pointer-events", "none");
    const vLine = crosshairG
      .append("line")
      .attr("x1", -200)
      .attr("x2", -200)
      .attr("y1", yOffset)
      .attr("y2", yOffset + chartHeight)
      .attr("stroke", "rgba(60,60,60,0.6)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4 2");
    const hDot = crosshairG
      .append("circle")
      .attr("r", 4)
      .attr("cx", -200)
      .attr("cy", -200)
      .attr("fill", "white")
      .attr("stroke", "#333")
      .attr("stroke-width", 1.5);

    chart
      .append("rect")
      .attr("id", "epoverlay")
      .attr("x", xOffset)
      .attr("y", yOffset)
      .attr("width", chartWidth)
      .attr("height", chartHeight)
      .attr("fill", "transparent")
      .style("cursor", "crosshair")
      .on("mousemove", (event: MouseEvent) => {
        const [mx] = pointer(event);
        const idx = Math.max(
          0,
          Math.min(cellsLength - 1, Math.round(((mx - xOffset) / chartWidth) * (cellsLength - 1)))
        );
        const pt = pts[idx];
        if (!pt) return;
        vLine.attr("x1", pt[0]).attr("x2", pt[0]);
        hDot.attr("cx", pt[0]).attr("cy", pt[1]);
        const dist = rn((idx / Math.max(1, cellsLength - 1)) * routeLen);
        const burgId = chartData.burg[idx];
        tip(
          [
            `${dist} ${distanceUnit} from start`,
            `Elevation: ${chartData.height[idx]} ${heightUnit}`,
            worldContext.biomesData.name[chartData.biome[idx]],
            burgId ? ((worldContext.pack.burgs[burgId] as Burg).name ?? null) : null
          ]
            .filter(Boolean)
            .join(". ")
        );
      })
      .on("mouseleave", () => {
        vLine.attr("x1", -200).attr("x2", -200);
        hDot.attr("cx", -200).attr("cy", -200);
        tip("");
      });
  }
};
