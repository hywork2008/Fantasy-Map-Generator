import * as d3 from "d3";
import type { WorldContext } from "../context/worldContext";
import { closeDialog, closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { capitalize, convertTemperature, ensureEl, rn, si } from "../utils";
import { isWater } from "../utils/graphUtils";
import { getArea, getAreaUnit, getHeight, tip } from "../utils/uiHelpers";
import { downloadFile, getFileName } from "./editors";

let worldContext: WorldContext;

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

/** d3.stack で生成されるバーの各セグメントのデータポイント: [x0, x1] + インデックス i */
type BarDataPoint = [number, number] & { i: number; data: unknown };

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

export function open(): void {
  closeDialogs("#chartsOverview, .stable");

  if (prevMapId !== worldContext.mapId) {
    charts = [];
    prevMapId = worldContext.mapId;
  }

  if (!charts.length) addChart();
  else for (const chart of charts) renderChart(chart);

  openDialog("chartsOverview", {
    onClose: () => {
      ensureEl("chartsOverview__charts").innerHTML = "";
    }
  });
}

export function addChart(): void {
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
    if ((entityLandOnly || plotByLandOnly) && isWater(cellId, worldContext.pack)) continue;
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
  });

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
      const data = defined.map((d: unknown) => {
        const point = d as { data: [string, [string, number[]][]] };
        return Object.assign(point, { i: new Map(point.data[1]).get(s.key) });
      });
      return { key: s.key, data };
    });

  const xDomain = d3.extent(series.flatMap(d => (d.data as unknown as number[]).flat())) as [number, number];

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
    .data(d => (d as unknown as { key: string; data: BarDataPoint[] }).data.filter((p: BarDataPoint) => p[0] !== p[1]))
    .join("rect")
    .attr("x", (p: BarDataPoint) => Math.min(xScale(p[0]), xScale(p[1])))
    .attr("y", (p: BarDataPoint) => yScale(Y[p.i]) ?? 0)
    .attr("width", (p: BarDataPoint) => Math.abs(xScale(p[0]) - xScale(p[1])))
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
  const getTooltip = (p: BarDataPoint) => {
    if (p.i == null) return [];
    return tooltip(Y[p.i], Z[p.i], X[p.i], X[p.i] / totalZ[Y[p.i]]);
  };

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
  };

  $figure.querySelector<HTMLButtonElement>("button.icon-download")!.addEventListener("click", downloadChartData);
  $figure.querySelector<HTMLButtonElement>("button.icon-chart-bar")!.addEventListener("click", downloadChartSvg);
  $figure.querySelector<HTMLButtonElement>("button.icon-trash")!.addEventListener("click", removeChart);
}

export function changeViewColumns(): void {
  const columns = (ensureEl("chartsOverview__viewColumns") as HTMLSelectElement).value;
  const $charts = ensureEl("chartsOverview__charts");
  $charts.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
}

export function handleClose(): void {
  closeDialog("chartsOverview");
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
  var getPrecipitation: (prec: number) => string;
}

export function initChartsOverview(wc: WorldContext) {
  worldContext = wc;
}
