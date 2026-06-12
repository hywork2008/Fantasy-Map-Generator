import * as d3 from "d3";
import { worldContext } from "../context/worldContext";
import { ensureEl, rn, si } from "../utils";

interface ChartOptions {
  id: number;
  entity: string;
  plotBy: string;
  groupBy: string;
  sorting: string;
  type: string;
}

interface ChartDataPoint {
  name: string;
  group: string;
  value: number;
}

// config
const NEUTRAL_COLOR = "#ccc";
const EMPTY_NAME = "no";
const WIDTH = 800;
const Y_PADDING = 0.2;
const RESERVED_PX_PER_CHAR = 7;
const LABEL_GAP = 10;

const entitiesMap: Record<
  string,
  {
    label: string;
    getCellsData: () => ArrayLike<number>;
    getName: (i: string | number) => string;
    getColors: () => Record<string, string>;
    landOnly: boolean;
  }
> = {
  states: {
    label: "State",
    getCellsData: () => worldContext.pack.cells.state,
    getName: nameGetter("states"),
    getColors: colorsGetter("states"),
    landOnly: true
  },
  cultures: {
    label: "Culture",
    getCellsData: () => worldContext.pack.cells.culture,
    getName: nameGetter("cultures"),
    getColors: colorsGetter("cultures"),
    landOnly: true
  },
  religions: {
    label: "Religion",
    getCellsData: () => worldContext.pack.cells.religion,
    getName: nameGetter("religions"),
    getColors: colorsGetter("religions"),
    landOnly: true
  },
  provinces: {
    label: "Province",
    getCellsData: () => worldContext.pack.cells.province,
    getName: nameGetter("provinces"),
    getColors: colorsGetter("provinces"),
    landOnly: true
  },
  biomes: {
    label: "Biome",
    getCellsData: () => worldContext.pack.cells.biome,
    getName: biomeNameGetter,
    getColors: biomeColorsGetter,
    landOnly: false
  }
};

const quantizationMap: Record<
  string,
  {
    label: string;
    quantize: (cellId: number) => number;
    aggregate: (values: number[]) => number;
    formatTicks: (value: number) => string | number;
    stringify: (value: number) => string;
    stackable: boolean;
    landOnly: boolean;
  }
> = {
  total_population: {
    label: "Total population",
    quantize: cellId => getUrbanPopulation(cellId) + getRuralPopulation(cellId),
    aggregate: values => rn(d3.sum(values)),
    formatTicks: value => si(value),
    stringify: value => value.toLocaleString(),
    stackable: true,
    landOnly: true
  },
  urban_population: {
    label: "Urban population",
    quantize: getUrbanPopulation,
    aggregate: values => rn(d3.sum(values)),
    formatTicks: value => si(value),
    stringify: value => value.toLocaleString(),
    stackable: true,
    landOnly: true
  },
  rural_population: {
    label: "Rural population",
    quantize: getRuralPopulation,
    aggregate: values => rn(d3.sum(values)),
    formatTicks: value => si(value),
    stringify: value => value.toLocaleString(),
    stackable: true,
    landOnly: true
  },
  area: {
    label: "Land area",
    quantize: cellId => getArea(worldContext.pack.cells.area[cellId]),
    aggregate: values => rn(d3.sum(values)),
    formatTicks: value => `${si(value)} ${getAreaUnit()}`,
    stringify: value => `${value.toLocaleString()} ${getAreaUnit()}`,
    stackable: true,
    landOnly: true
  },
  cells: {
    label: "Number of cells",
    quantize: () => 1,
    aggregate: values => d3.sum(values),
    formatTicks: value => value,
    stringify: value => value.toLocaleString(),
    stackable: true,
    landOnly: true
  },
  burgs_number: {
    label: "Number of burgs",
    quantize: cellId => (worldContext.pack.cells.burg[cellId] ? 1 : 0),
    aggregate: values => d3.sum(values),
    formatTicks: value => value,
    stringify: value => value.toLocaleString(),
    stackable: true,
    landOnly: true
  },
  average_elevation: {
    label: "Average elevation",
    quantize: cellId => worldContext.pack.cells.h[cellId],
    aggregate: values => d3.mean(values) ?? 0,
    formatTicks: value => getHeight(value),
    stringify: value => getHeight(value),
    stackable: false,
    landOnly: false
  },
  max_elevation: {
    label: "Maximum mean elevation",
    quantize: cellId => worldContext.pack.cells.h[cellId],
    aggregate: values => d3.max(values) ?? 0,
    formatTicks: value => getHeight(value),
    stringify: value => getHeight(value),
    stackable: false,
    landOnly: false
  },
  min_elevation: {
    label: "Minimum mean elevation",
    quantize: cellId => worldContext.pack.cells.h[cellId],
    aggregate: values => d3.min(values) ?? 0,
    formatTicks: value => getHeight(value),
    stringify: value => getHeight(value),
    stackable: false,
    landOnly: false
  },
  average_temperature: {
    label: "Annual mean temperature",
    quantize: cellId => worldContext.grid.cells.temp[worldContext.pack.cells.g[cellId]],
    aggregate: values => d3.mean(values) ?? 0,
    formatTicks: value => convertTemperature(value),
    stringify: value => convertTemperature(value),
    stackable: false,
    landOnly: false
  },
  max_temperature: {
    label: "Mean annual maximum temperature",
    quantize: cellId => worldContext.grid.cells.temp[worldContext.pack.cells.g[cellId]],
    aggregate: values => d3.max(values) ?? 0,
    formatTicks: value => convertTemperature(value),
    stringify: value => convertTemperature(value),
    stackable: false,
    landOnly: false
  },
  min_temperature: {
    label: "Mean annual minimum temperature",
    quantize: cellId => worldContext.grid.cells.temp[worldContext.pack.cells.g[cellId]],
    aggregate: values => d3.min(values) ?? 0,
    formatTicks: value => convertTemperature(value),
    stringify: value => convertTemperature(value),
    stackable: false,
    landOnly: false
  },
  average_precipitation: {
    label: "Annual mean precipitation",
    quantize: cellId => worldContext.grid.cells.prec[worldContext.pack.cells.g[cellId]],
    aggregate: values => rn(d3.mean(values) ?? 0),
    formatTicks: value => getPrecipitation(rn(value)),
    stringify: value => getPrecipitation(rn(value)),
    stackable: false,
    landOnly: true
  },
  max_precipitation: {
    label: "Mean annual maximum precipitation",
    quantize: cellId => worldContext.grid.cells.prec[worldContext.pack.cells.g[cellId]],
    aggregate: values => rn(d3.max(values) ?? 0),
    formatTicks: value => getPrecipitation(rn(value)),
    stringify: value => getPrecipitation(rn(value)),
    stackable: false,
    landOnly: true
  },
  min_precipitation: {
    label: "Mean annual minimum precipitation",
    quantize: cellId => worldContext.grid.cells.prec[worldContext.pack.cells.g[cellId]],
    aggregate: values => rn(d3.min(values) ?? 0),
    formatTicks: value => getPrecipitation(rn(value)),
    stringify: value => getPrecipitation(rn(value)),
    stackable: false,
    landOnly: true
  },
  coastal_cells: {
    label: "Number of coastal cells",
    quantize: cellId => (worldContext.pack.cells.t[cellId] === 1 ? 1 : 0),
    aggregate: values => d3.sum(values),
    formatTicks: value => value,
    stringify: value => value.toLocaleString(),
    stackable: true,
    landOnly: true
  },
  river_cells: {
    label: "Number of river cells",
    quantize: cellId => (worldContext.pack.cells.r[cellId] ? 1 : 0),
    aggregate: values => d3.sum(values),
    formatTicks: value => value,
    stringify: value => value.toLocaleString(),
    stackable: true,
    landOnly: true
  }
};

const plotTypeMap: Record<
  string,
  { offset: (series: d3.Series<unknown, string>[], order: number[]) => void; formatX?: (value: number) => string }
> = {
  stackedBar: { offset: d3.stackOffsetDiverging },
  normalizedStackedBar: { offset: d3.stackOffsetExpand, formatX: value => `${rn(value * 100)}%` }
};

let charts: ChartOptions[] = [];
let prevMapId = -1;

appendStyleSheet();
insertHtml();
addListeners();
changeViewColumns();

export function open(): void {
  closeDialogs("#chartsOverview, .stable");

  if (prevMapId !== worldContext.mapId) {
    charts = [];
    prevMapId = worldContext.mapId;
  }

  if (!charts.length) addChart();
  else
    charts.forEach(chart => {
      renderChart(chart);
    });

  ($("#chartsOverview") as any).dialog({
    title: "Data Charts",
    position: { my: "center", at: "center", of: "svg" },
    close: handleClose
  });
}

function appendStyleSheet(): void {
  const style = document.createElement("style");
  style.textContent = /* css */ `
    #chartsOverview { max-width: 90vw !important; max-height: 90vh !important; overflow: hidden; display: grid; grid-template-rows: auto 1fr; }
    #chartsOverview__form { font-size: 1.1em; margin: 0.3em 0; display: grid; grid-template-columns: auto auto; grid-gap: 0.3em; align-items: start; justify-items: end; }
    @media (max-width: 600px) { #chartsOverview__form { font-size: 1em; grid-template-columns: 1fr; justify-items: normal; } }
    #chartsOverview__charts { overflow: auto; scroll-behavior: smooth; display: grid; }
    #chartsOverview__charts figure { margin: 0; }
    #chartsOverview__charts figcaption { font-size: 1.2em; margin: 0 1% 0 4%; display: grid; grid-template-columns: 1fr auto; }
  `;
  document.head.appendChild(style);
}

function insertHtml(): void {
  const entities = Object.entries(entitiesMap).map(([entity, { label }]) => [entity, label]);
  const plotBy = Object.entries(quantizationMap).map(([key, { label }]) => [key, label]);

  const createOption = ([value, label]: string[]) => `<option value="${value}">${label}</option>`;
  const createOptions = (values: string[][]) => values.map(createOption).join("");

  const html = /* html */ `<div id="chartsOverview" class="dialog stable">
    <form id="chartsOverview__form">
      <div>
        <button data-tip="Add a chart" type="submit">Plot</button>
        <select data-tip="Select entity (y axis)" id="chartsOverview__entitiesSelect">${createOptions(entities)}</select>
        <label>by
          <select data-tip="Select value to plot by (x axis)" id="chartsOverview__plotBySelect">${createOptions(plotBy)}</select>
        </label>
        <label>grouped by
          <select data-tip="Select entity to group by. If you don't need grouping, set it the same as the entity" id="chartsOverview__groupBySelect">${createOptions(entities)}</select>
        </label>
        <label data-tip="Sorting type">sorted
          <select id="chartsOverview__sortingSelect">
            <option value="value">by value</option>
            <option value="name">by name</option>
            <option value="natural">naturally</option>
          </select>
        </label>
      </div>
      <div>
        <span data-tip="Chart type">Type</span>
        <select id="chartsOverview__chartType">
          <option value="stackedBar" selected>Stacked Bar</option>
          <option value="normalizedStackedBar">Normalized Stacked Bar</option>
        </select>
        <span data-tip="Columns to display">Columns</span>
        <select id="chartsOverview__viewColumns">
          <option value="1" selected>1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
      </div>
    </form>
    <section id="chartsOverview__charts"></section>
  </div>`;

  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);

  (ensureEl("chartsOverview__entitiesSelect") as HTMLSelectElement).value = "states";
  (ensureEl("chartsOverview__plotBySelect") as HTMLSelectElement).value = "total_population";
  (ensureEl("chartsOverview__groupBySelect") as HTMLSelectElement).value = "cultures";
}

function addListeners(): void {
  (ensureEl("chartsOverview__form") as HTMLFormElement).addEventListener("submit", e => {
    e.preventDefault();
    addChart();
  });
  ensureEl("chartsOverview__viewColumns").addEventListener("change", changeViewColumns);
}

function addChart(): void {
  const entity = (ensureEl("chartsOverview__entitiesSelect") as HTMLSelectElement).value;
  const plotBy = (ensureEl("chartsOverview__plotBySelect") as HTMLSelectElement).value;
  let groupBy = (ensureEl("chartsOverview__groupBySelect") as HTMLSelectElement).value;
  const sorting = (ensureEl("chartsOverview__sortingSelect") as HTMLSelectElement).value;
  const type = (ensureEl("chartsOverview__chartType") as HTMLSelectElement).value;

  const { stackable } = quantizationMap[plotBy];
  if (!stackable && groupBy !== entity) {
    tip(`Grouping is not supported for ${plotBy}`, false, "warn", 4000);
    groupBy = entity;
  }

  const chartOptions: ChartOptions = { id: Date.now(), entity, plotBy, groupBy, sorting, type };
  charts.push(chartOptions);
  renderChart(chartOptions);
  updateDialogPosition();
}

function renderChart({ id, entity, plotBy, groupBy, sorting, type }: ChartOptions): void {
  const {
    label: plotByLabel,
    stringify,
    quantize,
    aggregate,
    formatTicks,
    landOnly: plotByLandOnly
  } = quantizationMap[plotBy];
  const noGrouping = groupBy === entity;
  const {
    label: entityLabel,
    getName: getEntityName,
    getCellsData: getEntityCellsData,
    landOnly: entityLandOnly
  } = entitiesMap[entity];
  const { label: groupLabel, getName: getGroupName, getCellsData: getGroupCellsData, getColors } = entitiesMap[groupBy];

  const entityCells = getEntityCellsData();
  const groupCells = getGroupCellsData();

  const title = `${capitalize(entity)} by ${plotByLabel}${noGrouping ? "" : ` grouped by ${groupLabel}`}`;

  const tooltip = (entityName: string, group: string, value: number, percentage: number) => {
    const entityTip = `${entityLabel}: ${entityName}`;
    const groupTip = noGrouping ? "" : `${groupLabel}: ${group}`;
    let valueTip = `${plotByLabel}: ${stringify(value)}`;
    if (!noGrouping) valueTip += ` (${rn(percentage * 100)}%)`;
    return [entityTip, groupTip, valueTip].filter(Boolean);
  };

  const dataCollection: Record<number, Record<number, number[]>> = {};
  const groups = new Set<number>();

  for (const cellId of worldContext.pack.cells.i) {
    if ((entityLandOnly || plotByLandOnly) && isWater(cellId)) continue;
    const entityId = entityCells[cellId];
    const groupId = groupCells[cellId];
    const value = quantize(cellId);

    if (!dataCollection[entityId]) dataCollection[entityId] = { [groupId]: [value] };
    else if (!dataCollection[entityId][groupId]) dataCollection[entityId][groupId] = [value];
    else dataCollection[entityId][groupId].push(value);

    groups.add(groupId);
  }

  const chartData: ChartDataPoint[] = Object.entries(dataCollection).flatMap(([entityId, groupData]) => {
    const name = getEntityName(entityId);
    return Object.entries(groupData).map(([groupIdStr, values]) => {
      const group = getGroupName(groupIdStr);
      const value = aggregate(values);
      return { name, group, value };
    });
  }) as unknown as ChartDataPoint[];

  const sortedData = sortData(chartData, sorting);
  const colors = getColors();
  const { offset, formatX = formatTicks } = plotTypeMap[type];

  const $chart = createStackedBarChart(sortedData, {
    colors,
    tooltip,
    offset,
    formatX: formatX as (v: number) => string
  });
  insertChart(id, sortedData, $chart, title);

  ensureEl("chartsOverview__charts").lastElementChild?.scrollIntoView();
}

function createStackedBarChart(
  sortedData: ChartDataPoint[],
  {
    colors,
    tooltip,
    offset,
    formatX
  }: {
    colors: Record<string, string>;
    tooltip: (name: string, group: string, value: number, percentage: number) => string[];
    offset: (series: d3.Series<unknown, string>[], order: number[]) => void;
    formatX: (value: number) => string | number;
  }
): SVGElement {
  const X = sortedData.map(d => d.value);
  const Y = sortedData.map(d => d.name);
  const Z = sortedData.map(d => d.group);

  const yDomain = new Set(Y);
  const zDomain = new Set(Z);
  const I = d3.range(X.length).filter(i => yDomain.has(Y[i]) && zDomain.has(Z[i]));

  const entities = Array.from(yDomain);
  const groupsArr = Array.from(zDomain);

  const yScaleMinWidth = getTextMinWidth(entities);
  const legendRows = calculateLegendRows(groupsArr, WIDTH - yScaleMinWidth - 15);

  const margin = { top: 30, right: 15, bottom: legendRows * 20 + 10, left: yScaleMinWidth };
  const xRange: [number, number] = [margin.left, WIDTH - margin.right];
  const height = yDomain.size * 25 + margin.top + margin.bottom;
  const yRange: [number, number] = [height - margin.bottom, margin.top];

  const rolled = d3.rollups(
    I,
    ([i]: number[]) => i,
    (i: number) => Y[i],
    (i: number) => Z[i]
  ) as unknown as [string, Map<string, number[]>][];

  const series = d3
    .stack<[string, Map<string, number[]>]>()
    .keys(groupsArr)
    .value(([, I], z) => X[new Map(I as unknown as [string, number][]).get(z)!])
    .order(d3.stackOrderNone)
    .offset(offset)(rolled)
    .map(s => {
      const defined = s.filter(d => !Number.isNaN(d[1]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = defined.map((d: any) => Object.assign(d, { i: new Map(d.data[1]).get(s.key) }));
      return { key: s.key, data };
    });

  const xDomain = d3.extent(series.flatMap(d => d.data as number[])) as [number, number];

  const xScale = d3.scaleLinear(xDomain, xRange);
  const yScale = d3.scaleBand(entities, yRange).paddingInner(Y_PADDING);

  const xAxis = d3.axisTop(xScale).ticks(WIDTH / 80, null);
  const yAxis = d3.axisLeft(yScale).tickSizeOuter(0);

  const svgNode = d3
    .create("svg")
    .attr("version", "1.1")
    .attr("xmlns", "http://www.w3.org/2000/svg")
    .attr("viewBox", `0 0 ${WIDTH} ${height}`)
    .attr("style", "max-width: 100%; height: auto; height: intrinsic;");

  svgNode
    .append("g")
    .attr("transform", `translate(0,${margin.top})`)
    .call(xAxis)
    .call(g => g.select(".domain").remove())
    .call(g => g.selectAll("text").text((d: unknown) => formatX(d as number)))
    .call(g =>
      g
        .selectAll(".tick line")
        .clone()
        .attr("y2", height - margin.top - margin.bottom)
        .attr("stroke-opacity", 0.1)
    );

  const bar = svgNode
    .append("g")
    .attr("stroke", "#666")
    .attr("stroke-width", 0.5)
    .selectAll("g")
    .data(series)
    .join("g")
    .attr("fill", d => colors[d.key])
    .selectAll("rect")
    .data(d => d.data.filter(([x1, x2]: number[]) => x1 !== x2))
    .join("rect")
    .attr("x", ([x1, x2]) => Math.min(xScale(x1), xScale(x2)))
    .attr("y", ({ i }) => yScale(Y[i]) ?? 0)
    .attr("width", ([x1, x2]) => Math.abs(xScale(x1) - xScale(x2)))
    .attr("height", yScale.bandwidth());

  const totalZ = Object.fromEntries(
    d3
      .rollups(
        I,
        ([i]: number[]) => i,
        (i: number) => Y[i],
        (i: number) => X[i]
      )
      .map(([y, yz]) => [y, d3.sum(yz, ([, val]) => val)])
  );
  const getTooltip = ({ i }: { i: number }) => tooltip(Y[i], Z[i], X[i], X[i] / totalZ[Y[i]]);

  bar.append("title").text(d => getTooltip(d).join("\r\n"));
  bar.on("mouseover", d => tip(getTooltip(d).join(". ")));

  svgNode
    .append("g")
    .attr("transform", `translate(${xScale(0)},0)`)
    .call(yAxis);

  const rowElements = Math.ceil(groupsArr.length / legendRows);
  const columnWidth = WIDTH / (rowElements + 0.5);
  const ROW_HEIGHT = 20;

  const getLegendX = (_d: unknown, i: number) => (i % rowElements) * columnWidth;
  const getLegendLabelX = (d: unknown, i: number) => getLegendX(d, i) + LABEL_GAP;
  const getLegendY = (_d: unknown, i: number) => Math.floor(i / rowElements) * ROW_HEIGHT;

  const legend = svgNode
    .append("g")
    .attr("stroke", "#666")
    .attr("stroke-width", 0.5)
    .attr("dominant-baseline", "central")
    .attr("transform", `translate(${margin.left},${height - margin.bottom + 15})`);

  legend
    .selectAll("circle")
    .data(groupsArr)
    .join("rect")
    .attr("x", getLegendX)
    .attr("y", getLegendY)
    .attr("width", 10)
    .attr("height", 10)
    .attr("transform", "translate(-5, -5)")
    .attr("fill", d => colors[d]);

  legend
    .selectAll("text")
    .data(groupsArr)
    .join("text")
    .attr("x", getLegendLabelX)
    .attr("y", getLegendY)
    .text(d => d);

  return svgNode.node()!;
}

function insertChart(id: number, sortedData: ChartDataPoint[], $chart: SVGElement, title: string): void {
  const $chartContainer = ensureEl("chartsOverview__charts");
  const $figure = document.createElement("figure");
  const $caption = document.createElement("figcaption");

  const figureNo = $chartContainer.childElementCount + 1;
  $caption.innerHTML = /* html */ `
    <div><strong>Figure ${figureNo}</strong>. ${title}</div>
    <div>
      <button data-tip="Download chart data as a text file (.csv)" class="icon-download"></button>
      <button data-tip="Download the chart in svg format (can open in browser or Inkscape)" class="icon-chart-bar"></button>
      <button data-tip="Remove the chart" class="icon-trash"></button>
    </div>`;

  $figure.appendChild($chart);
  $figure.appendChild($caption);
  $chartContainer.appendChild($figure);

  const downloadChartData = () => {
    const name = `${getFileName(title)}.csv`;
    const headers = "Name,Group,Value\n";
    const values = sortedData.map(({ name, group, value }) => `${name},${group},${value}`).join("\n");
    downloadFile(headers + values, name);
  };

  const downloadChartSvg = () => {
    downloadFile($chart.outerHTML, `${getFileName(title)}.svg`);
  };

  const removeChart = () => {
    $figure.remove();
    charts = charts.filter(chart => chart.id !== id);
    updateDialogPosition();
  };

  $figure.querySelector<HTMLButtonElement>("button.icon-download")!.addEventListener("click", downloadChartData);
  $figure.querySelector<HTMLButtonElement>("button.icon-chart-bar")!.addEventListener("click", downloadChartSvg);
  $figure.querySelector<HTMLButtonElement>("button.icon-trash")!.addEventListener("click", removeChart);
}

function changeViewColumns(): void {
  const columns = (ensureEl("chartsOverview__viewColumns") as HTMLSelectElement).value;
  const $charts = ensureEl("chartsOverview__charts");
  $charts.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  updateDialogPosition();
}

function updateDialogPosition(): void {
  const $el = ($ as any)("#chartsOverview");
  if (!$el.hasClass("ui-dialog-content")) return;
  $el.dialog({ position: { my: "center", at: "center", of: "svg" } });
}

function handleClose(): void {
  ensureEl("chartsOverview__charts").innerHTML = "";
  ($("#chartsOverview") as any).dialog("destroy");
}

function getTextMinWidth(entities: string[]): number {
  return (d3.max(entities.map(name => name.length)) ?? 0) * RESERVED_PX_PER_CHAR;
}

function calculateLegendRows(groups: string[], availableWidth: number): number {
  const minWidth = LABEL_GAP + getTextMinWidth(groups);
  const maxInRow = Math.floor(availableWidth / minWidth);
  return Math.ceil(groups.length / maxInRow);
}

type PackNamedEntity = Array<{ name?: string; color?: string }>;

function packAsNamedEntityMap() {
  return worldContext.pack as unknown as Record<string, PackNamedEntity>;
}

function nameGetter(entity: string) {
  return (i: string | number): string => packAsNamedEntityMap()[entity]?.[+i]?.name || EMPTY_NAME;
}

function colorsGetter(entity: string) {
  return (): Record<string, string> =>
    Object.fromEntries(
      packAsNamedEntityMap()[entity].map(({ name, color }) => [name || EMPTY_NAME, color || NEUTRAL_COLOR])
    );
}

function biomeNameGetter(i: string | number): string {
  return worldContext.biomesData.name[+i] || EMPTY_NAME;
}

function biomeColorsGetter(): Record<string, string> {
  return Object.fromEntries(
    worldContext.biomesData.i.map(i => [worldContext.biomesData.name[i], worldContext.biomesData.color[i]])
  );
}

function getUrbanPopulation(cellId: number): number {
  const burgId = worldContext.pack.cells.burg[cellId];
  if (!burgId) return 0;
  const populationPoints = worldContext.pack.burgs[burgId]?.population ?? 0;
  return populationPoints * worldContext.populationRate * worldContext.urbanization;
}

function getRuralPopulation(cellId: number): number {
  return worldContext.pack.cells.pop[cellId] * worldContext.populationRate;
}

function sortData(data: ChartDataPoint[], sorting: string): ChartDataPoint[] {
  if (sorting === "natural") return data;

  if (sorting === "name") {
    return data.sort((a, b) => {
      if (a.name !== b.name) return b.name.localeCompare(a.name);
      return a.group.localeCompare(b.group);
    });
  }

  if (sorting === "value") {
    const entitySum: Record<string, number> = {};
    const groupSum: Record<string, number> = {};
    for (const { name, group, value } of data) {
      entitySum[name] = (entitySum[name] || 0) + value;
      groupSum[group] = (groupSum[group] || 0) + value;
    }
    return data.sort((a, b) => {
      if (a.name !== b.name) return entitySum[a.name] - entitySum[b.name];
      return groupSum[b.group] - groupSum[a.group];
    });
  }

  return data;
}

declare global {
  var convertTemperature: (temp: number, scale?: string) => string;
  var getPrecipitation: (prec: number) => string;
  var isWater: (i: number) => boolean;
  var capitalize: (str: string) => string;
}
