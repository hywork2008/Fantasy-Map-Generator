import * as d3 from "d3";
import { Routes } from "@fmg/core/modules/routes-generator";
import { getIsolines, getVertexPath } from "@fmg/shared/pathUtils";
import { drawBurgLabelsRenderer } from "@fmg/burgs/renderer";
import { stateLabelsRenderer } from "#renderers/draw-state-labels";

export function drawBiomesRenderer() {
  TIME && console.time("drawBiomes");

  const cells = pack.cells;
  const bodyPaths = new Array(biomesData.i.length - 1);
  const isolines = getIsolines(pack, cellId => cells.biome[cellId], {fill: true, waterGap: true}) as Record<
    string,
    {fill: unknown; waterGap: unknown}
  >;

  Object.entries(isolines).forEach(([index, {fill, waterGap}]) => {
    const color = biomesData.color[index];
    bodyPaths.push(getGappedFillPaths("biome", fill, waterGap, color, index));
  });

  ensureEl("biomes").innerHTML = bodyPaths.join("");
  TIME && console.timeEnd("drawBiomes");
}

export function drawCulturesRenderer() {
  TIME && console.time("drawCultures");
  const {cells, cultures} = pack;

  const bodyPaths = new Array(cultures.length - 1);
  const isolines = getIsolines(pack, cellId => cells.culture[cellId], {fill: true, waterGap: true}) as Record<
    string,
    {fill: unknown; waterGap: unknown}
  >;

  Object.entries(isolines).forEach(([index, {fill, waterGap}]) => {
    const color = cultures[index].color;
    bodyPaths.push(getGappedFillPaths("culture", fill, waterGap, color, index));
  });

  ensureEl("cults").innerHTML = bodyPaths.join("");

  TIME && console.timeEnd("drawCultures");
}

export function drawReligionsRenderer() {
  TIME && console.time("drawReligions");
  const {cells, religions} = pack;

  const bodyPaths = new Array(religions.length - 1);
  const isolines = getIsolines(pack, cellId => cells.religion[cellId], {fill: true, waterGap: true}) as Record<
    string,
    {fill: unknown; waterGap: unknown}
  >;

  Object.entries(isolines).forEach(([index, {fill, waterGap}]) => {
    const color = religions[index].color;
    bodyPaths.push(getGappedFillPaths("religion", fill, waterGap, color, index));
  });

  ensureEl("relig").innerHTML = bodyPaths.join("");

  TIME && console.timeEnd("drawReligions");
}

export function drawPrecipitationRenderer() {
  TIME && console.time("drawPrecipitation");

  prec.selectAll("circle").remove();
  const {cells, points} = grid;

  const show = d3.transition().duration(800).ease(d3.easeSinIn);
  prec.selectAll("text").attr("opacity", 0).transition(show).attr("opacity", 1);

  const cellsNumberModifier = ((+pointsInput.dataset.cells || 10000) / 10000) ** 0.25;
  const data = cells.i.filter(i => cells.h[i] >= 20 && cells.prec[i]);
  const getRadius = prec => rn(Math.sqrt(prec / 4) / cellsNumberModifier, 2);

  prec
    .style("display", "block")
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", d => points[d][0])
    .attr("cy", d => points[d][1])
    .attr("r", 0)
    .transition(show)
    .attr("r", d => getRadius(cells.prec[d]));

  TIME && console.timeEnd("drawPrecipitation");
}

export function drawPopulationRenderer() {
  population.selectAll("line").remove();

  const {cells, burgs} = pack;
  const show = d3.transition().duration(2000).ease(d3.easeSinIn);

  const rural = Array.from(cells.i.filter((i: number) => cells.pop[i] > 0), (i: number) => [
    ...cells.p[i],
    cells.p[i][1] - cells.pop[i] / 5
  ]);

  population
    .select("#rural")
    .selectAll("line")
    .data(rural)
    .enter()
    .append("line")
    .attr("x1", d => d[0])
    .attr("y1", d => d[1])
    .attr("x2", d => d[0])
    .attr("y2", d => d[1])
    .transition(show)
    .attr("y2", d => d[2]);

  const urban = burgs.filter(b => b.i && !b.removed).map(b => [b.x, b.y, b.y - (b.population / 5) * urbanization]);
  population
    .select("#urban")
    .selectAll("line")
    .data(urban)
    .enter()
    .append("line")
    .attr("x1", d => d[0])
    .attr("y1", d => d[1])
    .attr("x2", d => d[0])
    .attr("y2", d => d[1])
    .transition(show)
    .delay(500)
    .attr("y2", d => d[2]);
}

export function drawGridRenderer() {
  gridOverlay.selectAll("*").remove();
  const pattern = "#pattern_" + (gridOverlay.attr("type") || "pointyHex");
  const stroke = gridOverlay.attr("stroke") || "#808080";
  const width = gridOverlay.attr("stroke-width") || 0.5;
  const dasharray = gridOverlay.attr("stroke-dasharray") || null;
  const linecap = gridOverlay.attr("stroke-linecap") || null;
  const scale = gridOverlay.attr("scale") || 1;
  const dx = gridOverlay.attr("dx") || 0;
  const dy = gridOverlay.attr("dy") || 0;
  const tr = `scale(${scale}) translate(${dx} ${dy})`;

  const maxWidth = Math.max(+mapWidthInput.value, graphWidth);
  const maxHeight = Math.max(+mapHeightInput.value, graphHeight);

  d3.select(pattern)
    .attr("stroke", stroke)
    .attr("stroke-width", width)
    .attr("stroke-dasharray", dasharray)
    .attr("stroke-linecap", linecap)
    .attr("patternTransform", tr);
  gridOverlay
    .append("rect")
    .attr("width", maxWidth)
    .attr("height", maxHeight)
    .attr("fill", "url(" + pattern + ")")
    .attr("stroke", "none");
}

export function drawCoordinatesRenderer() {
  coordinates.selectAll("*").remove();

  const steps = [0.5, 1, 2, 5, 10, 15, 30];
  const goal = mapCoordinates.lonT / scale / 10;
  const step = steps.reduce((p, c) => (Math.abs(c - goal) < Math.abs(p - goal) ? c : p));

  const desired = +coordinates.attr("data-size");
  coordinates.attr("font-size", Math.max(rn(desired / scale ** 0.8, 2), 0.1));

  const graticule = d3
    .geoGraticule()
    .extent([
      [mapCoordinates.lonW, mapCoordinates.latN],
      [mapCoordinates.lonE + 0.1, mapCoordinates.latS + 0.1]
    ])
    .stepMajor([400, 400])
    .stepMinor([step, step]);
  const projection = d3.geoEquirectangular().fitSize([graphWidth, graphHeight], graticule());

  const grid = coordinates.append("g").attr("id", "coordinateGrid");
  const labels = coordinates.append("g").attr("id", "coordinateLabels");

  const point = new DOMPoint(scale + desired + 2, scale + desired / 2);
  const screenMatrix = ensureEl("viewbox").getScreenCTM();
  const p = point.matrixTransform((screenMatrix ?? new DOMMatrix()).inverse());

  const data = graticule.lines().map(d => {
    const isLatitude = d.coordinates[0][1] === d.coordinates[1][1];
    const coordinate = d.coordinates[0] as [number, number];
    const position = projection(coordinate) || [0, 0];
    const [x, y] = isLatitude ? [rn(p.x, 2), rn(position[1], 2)] : [rn(position[0], 2), rn(p.y, 2)];
    const value = isLatitude ? coordinate[1] : coordinate[0];

    let text = "";
    if (!value) text = "0";
    else if (Number.isInteger(value)) {
      if (isLatitude) text = coordinate[1] < 0 ? -coordinate[1] + "°S" : coordinate[1] + "°N";
      else text = coordinate[0] < 0 ? -coordinate[0] + "°W" : coordinate[0] + "°E";
    }

    return {x, y, text};
  });

  const path = round(d3.geoPath(projection)(graticule()));
  grid.append("path").attr("d", path).attr("vector-effect", "non-scaling-stroke");
  labels
    .selectAll("text")
    .data(data)
    .enter()
    .append("text")
    .attr("text-rendering", "optimizeSpeed")
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .text(d => d.text);
}

export function drawRoutesRenderer() {
  TIME && console.time("drawRoutes");
  const routePaths = {};

  for (const route of pack.routes) {
    const {i, group, points} = route;
    if (!points || points.length < 2) continue;
    if (!routePaths[group]) routePaths[group] = [];
    routePaths[group].push(`<path id="route${i}" d="${Routes.getPath(route)}"/>`);
  }

  routes.attr("fill", "none").selectAll("path").remove();
  for (const group in routePaths) {
    routes.select("#" + group).html(routePaths[group].join(""));
  }

  TIME && console.timeEnd("drawRoutes");
}

export function drawRouteRenderer(route) {
  routes
    .select("#" + route.group)
    .append("path")
    .attr("d", Routes.getPath(route))
    .attr("id", "route" + route.i);
}

export function drawZonesRenderer() {
  const filterBy = ensureEl("zonesFilterType").value;
  const isFiltered = filterBy && filterBy !== "all";
  const visibleZones = pack.zones.filter(
    ({hidden, cells, type}) => !hidden && cells.length && (!isFiltered || type === filterBy)
  );

  ensureEl("zones").innerHTML = visibleZones.map(drawZone).join("");
}

export function drawLabelsRenderer() {
  stateLabelsRenderer();
  drawBurgLabelsRenderer();
  (window as any).fmg?.invokeActiveZooming?.();
}

export function drawTextureRenderer() {
  const x = Number(texture.attr("data-x") || 0);
  const y = Number(texture.attr("data-y") || 0);
  const href = texture.attr("data-href");

  texture
    .append("image")
    .attr("preserveAspectRatio", "xMidYMid slice")
    .attr("x", x)
    .attr("y", y)
    .attr("width", graphWidth - x)
    .attr("height", graphHeight - y)
    .attr("href", href);
}

function drawZone({i, cells, type, color}) {
  const path = getVertexPath(cells);
  return `<path id="zone${i}" data-id="${i}" data-type="${type}" d="${path}" fill="${color}" />`;
}

function getGappedFillPaths(elementName, fill, waterGap, color, index) {
  let html = "";
  if (fill) html += /* html */ `<path d="${fill}" fill="${color}" id="${elementName}${index}" />`;
  if (waterGap)
    html += /* html */ `<path d="${waterGap}" fill="none" stroke="${color}" stroke-width="3" id="${elementName}-gap${index}" />`;
  return html;
}
