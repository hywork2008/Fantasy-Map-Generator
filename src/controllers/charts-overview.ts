import * as d3 from "d3";
import { worldContext } from "../context/worldContext";
import {
  isTradeChartEntity,
  readTradeContributions,
  type TradeChartBasis
} from "../extensions/economy/generators/tradeChartSeries";
import { getHeight, getPrecipitation } from "../services/cellInfoService";
import { tip } from "../services/tooltipService";
import { openDialog } from "../ui/dialogs/dialogService";
import { capitalize, convertTemperature, rn, si } from "../utils";
import { getArea, getAreaUnit } from "../utils/domUtils";
import { isWater } from "../utils/graphUtils";

export interface ChartDataPoint {
  name: string;
  group: string;
  value: number;
}

export interface BuiltChart {
  svgElement: SVGElement;
  title: string;
  sortedData: ChartDataPoint[];
  /** Y-axis names in draw order. Index 0 is the bottom row. */
  entityNames: readonly string[];
  /** X axis, kept outside the scrolling plot. */
  axisElement: SVGElement;
  /** Legend, kept outside the scrolling plot. */
  legendElement: SVGElement;
  /** Bars and y-axis labels for entityNames.slice(start, end). */
  renderPlot: (start: number, end: number) => SVGElement;
}

interface ChartOptions {
  entity: string;
  plotBy: string;
  groupBy: string;
  sorting: string;
  type: string;
}

export const BURG_ENTITY_OPTION = { value: "burgs", label: "Burg" } as const;

export const TRADE_PLOT_OPTIONS = [
  { value: "trade_price", label: "Trade volume (price)" },
  { value: "trade_weight", label: "Trade volume (weight, kg)" },
  { value: "trade_tags", label: "Trade volume (trade heading)" }
] as const;

const TRADE_PLOT_BASIS: Record<(typeof TRADE_PLOT_OPTIONS)[number]["value"], TradeChartBasis> = {
  trade_price: "price",
  trade_weight: "weight",
  trade_tags: "tags"
};

export function isTradePlot(plotBy: string): plotBy is keyof typeof TRADE_PLOT_BASIS {
  return Object.hasOwn(TRADE_PLOT_BASIS, plotBy);
}

/** d3.stack で生成されるバーの各セグメントのデータポイント: [x0, x1] + インデックス i */
type BarDataPoint = [number, number] & { i: number; data: unknown };

// config
const NEUTRAL_COLOR = "#ccc";
const EMPTY_NAME = "no";
const WIDTH = 800;
/** SVG plot width. The dialog uses this to turn bar slots into CSS pixels. */
export const CHART_PLOT_WIDTH = WIDTH;
/** One y-axis row, including the gap, in SVG units. */
export const CHART_BAR_SLOT = 25;
/** Rows kept on screen before the plot scrolls. */
export const CHART_VISIBLE_ROWS = 16;
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
    getCellsData: () => worldContext.pack.cells.biomeCode,
    getName: biomeNameGetter,
    getColors: biomeColorsGetter,
    landOnly: false
  },
  burgs: {
    label: "Burg",
    getCellsData: () => worldContext.pack.cells.burg,
    getName: burgNameGetter,
    getColors: burgColorsGetter,
    landOnly: true
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

export function openChartsOverview(): void {
  openDialog("chartsOverview");
}

export function buildChart({ entity, plotBy, groupBy, sorting, type }: ChartOptions): BuiltChart | null {
  if (isTradePlot(plotBy)) return renderTradeChart({ entity, plotBy, groupBy, sorting, type });
  const quantization = quantizationMap[plotBy];
  if (!quantization) return null;
  let resolvedGroupBy = groupBy;
  if (!quantization.stackable && groupBy !== entity) {
    tip(`Grouping is not supported for ${plotBy}`, false, "warn", 4000);
    resolvedGroupBy = entity;
  }

  return renderChart({ entity, plotBy, groupBy: resolvedGroupBy, sorting, type });
}

function renderTradeChart({ entity, plotBy, groupBy, sorting, type }: ChartOptions): BuiltChart | null {
  if (!isTradePlot(plotBy) || !isTradeChartEntity(entity)) return null;
  const basis = TRADE_PLOT_BASIS[plotBy];
  const resolvedGroup = basis === "tags" || !isTradeChartEntity(groupBy) ? entity : groupBy;
  const contributions = readTradeContributions({ basis, entity, groupBy: resolvedGroup });
  if (!contributions) {
    tip("Economy data is not available", false, "warn", 4000);
    return null;
  }
  if (!contributions.length) {
    tip("No recorded trade to plot", false, "warn", 4000);
    return null;
  }

  const plotByLabel = TRADE_PLOT_OPTIONS.find(option => option.value === plotBy)?.label ?? plotBy;
  const noGrouping = basis !== "tags" && resolvedGroup === entity;
  const { label: entityLabel, getName: getEntityName } = entitiesMap[entity];
  const { label: groupLabel, getName: getGroupName, getColors } = entitiesMap[resolvedGroup];
  // D3 uses labels as keys, so distinguish towns that share a name before aggregation.
  const burgLabels =
    entity === "burgs" || resolvedGroup === "burgs"
      ? uniqueBurgLabels(
          contributions.flatMap(row => [
            ...(entity === "burgs" ? [row.entityId] : []),
            ...(basis !== "tags" && resolvedGroup === "burgs" ? [Number(row.groupKey)] : [])
          ])
        )
      : new Map<number, string>();
  const chartData = mergePoints(
    contributions.map(row => ({
      name:
        burgLabels.get(row.entityId) && entity === "burgs"
          ? burgLabels.get(row.entityId)!
          : getEntityName(row.entityId),
      group:
        basis === "tags"
          ? row.groupKey
          : resolvedGroup === "burgs"
            ? burgLabels.get(Number(row.groupKey))!
            : getGroupName(row.groupKey),
      value: row.value
    }))
  );
  const sortedData = sortData(chartData, sorting);
  const colors =
    basis === "tags"
      ? Object.fromEntries([...new Set(chartData.map(point => point.group))].map(tag => [tag, tagColor(tag)]))
      : resolvedGroup === "burgs"
        ? Object.fromEntries([...burgLabels].map(([id, label]) => [label, burgColor(id)]))
        : getColors();
  const title = `${capitalize(entity)} by ${plotByLabel}${
    basis === "tags" ? " grouped by trade heading" : noGrouping ? "" : ` grouped by ${groupLabel}`
  }`;
  const tooltip = (entityName: string, group: string, value: number, percentage: number) => {
    const entityTip = `${entityLabel}: ${entityName}`;
    const groupTip = noGrouping ? "" : `${basis === "tags" ? "Trade heading" : groupLabel}: ${group}`;
    let valueTip = `${plotByLabel}: ${value.toLocaleString()}`;
    if (!noGrouping) valueTip += ` (${rn(percentage * 100)}%)`;
    return [entityTip, groupTip, valueTip].filter(Boolean);
  };
  const { offset, formatX = (value: number) => si(value) } = plotTypeMap[type] ?? plotTypeMap.stackedBar;
  const view = createStackedBarChart(sortedData, {
    colors,
    tooltip,
    offset,
    formatX: formatX as (value: number) => string
  });
  return { ...view, title, sortedData };
}

function uniqueBurgLabels(ids: number[]): Map<number, string> {
  const distinct = [...new Set(ids)];
  const names = distinct.map(id => burgNameGetter(id));
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const used = new Set(names.filter(name => counts.get(name) === 1));
  return new Map(
    distinct.map((id, index) => {
      const name = names[index];
      if (counts.get(name) === 1) return [id, name];
      let label = `${name} (Burg ${id})`;
      while (used.has(label)) label += ` (${id})`;
      used.add(label);
      return [id, label];
    })
  );
}

function mergePoints(points: ChartDataPoint[]): ChartDataPoint[] {
  const merged = new Map<string, ChartDataPoint>();
  for (const point of points) {
    const key = `${point.name}\0${point.group}`;
    const existing = merged.get(key);
    if (existing) existing.value += point.value;
    else merged.set(key, { ...point });
  }
  return [...merged.values()];
}

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360}, 55%, 42%)`;
}

function renderChart({ entity, plotBy, groupBy, sorting, type }: ChartOptions): BuiltChart {
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

  for (const cellId of worldContext.pack.cells.i) {
    if ((entityLandOnly || plotByLandOnly) && isWater(cellId, worldContext.pack)) continue;
    const entityId = entityCells[cellId];
    // A burg chart is one bar per town. Cell 0 is every cell that has no burg.
    if (entity === "burgs" && !entityId) continue;
    const groupId = groupCells[cellId];
    const value = quantize(cellId);

    if (!dataCollection[entityId]) dataCollection[entityId] = { [groupId]: [value] };
    else if (!dataCollection[entityId][groupId]) dataCollection[entityId][groupId] = [value];
    else dataCollection[entityId][groupId].push(value);
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

  const view = createStackedBarChart(sortedData, {
    colors,
    tooltip,
    offset,
    formatX: formatX as (v: number) => string
  });

  return { ...view, title, sortedData };
}

interface StackedSeries {
  key: string;
  data: BarDataPoint[];
}

interface StackedBarParts {
  svgElement: SVGElement;
  entityNames: readonly string[];
  axisElement: SVGElement;
  legendElement: SVGElement;
  renderPlot: (start: number, end: number) => SVGElement;
}

function chartSvg(height: number): d3.Selection<SVGSVGElement, undefined, null, undefined> {
  return d3
    .create("svg")
    .attr("version", "1.1")
    .attr("xmlns", "http://www.w3.org/2000/svg")
    .attr("viewBox", `0 0 ${WIDTH} ${height}`)
    .attr("style", "max-width: 100%; height: auto; height: intrinsic;");
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
): StackedBarParts {
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
  const height = yDomain.size * CHART_BAR_SLOT + margin.top + margin.bottom;
  const yRange: [number, number] = [height - margin.bottom, margin.top];

  const rolled = d3.rollups(
    I,
    ([i]: number[]) => i,
    (i: number) => Y[i],
    (i: number) => Z[i]
  ) as unknown as [string, Map<string, number[]>][];

  const series: StackedSeries[] = d3
    .stack<[string, Map<string, number[]>]>()
    .keys(groupsArr)
    .value(([, groupRows], z) => X[new Map(groupRows as unknown as [string, number][]).get(z)!])
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

  const totalZ: Record<string, number> = {};
  for (const i of I) totalZ[Y[i]] = (totalZ[Y[i]] || 0) + X[i];
  const getTooltip = (p: BarDataPoint) => {
    if (p.i == null) return [];
    return tooltip(Y[p.i], Z[p.i], X[p.i], X[p.i] / totalZ[Y[p.i]]);
  };

  const drawBars = (
    parent: d3.Selection<SVGSVGElement, undefined, null, undefined>,
    band: d3.ScaleBand<string>,
    visible: ReadonlySet<string> | null
  ) => {
    const bar = parent
      .append("g")
      .attr("stroke", "#666")
      .attr("stroke-width", 0.5)
      .selectAll("g")
      .data(series)
      .join("g")
      .attr("fill", d => colors[d.key])
      .selectAll("rect")
      .data(d => d.data.filter(p => p[0] !== p[1] && (visible === null || visible.has(Y[p.i]))))
      .join("rect")
      .attr("x", (p: BarDataPoint) => Math.min(xScale(p[0]), xScale(p[1])))
      .attr("y", (p: BarDataPoint) => band(Y[p.i]) ?? 0)
      .attr("width", (p: BarDataPoint) => Math.abs(xScale(p[0]) - xScale(p[1])))
      .attr("height", band.bandwidth());
    bar.append("title").text(d => getTooltip(d).join("\r\n"));
    bar.on("mouseover", d => tip(getTooltip(d).join(". ")));
  };

  const rowElements = Math.ceil(groupsArr.length / legendRows);
  const columnWidth = WIDTH / (rowElements + 0.5);
  const ROW_HEIGHT = 20;
  const getLegendX = (_d: unknown, i: number) => (i % rowElements) * columnWidth;
  const getLegendLabelX = (d: unknown, i: number) => getLegendX(d, i) + LABEL_GAP;
  const getLegendY = (_d: unknown, i: number) => Math.floor(i / rowElements) * ROW_HEIGHT;

  const drawLegend = (parent: d3.Selection<SVGSVGElement, undefined, null, undefined>, originY: number) => {
    const legend = parent
      .append("g")
      .attr("stroke", "#666")
      .attr("stroke-width", 0.5)
      .attr("dominant-baseline", "central")
      .attr("transform", `translate(${margin.left},${originY})`);
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
  };

  const svgNode = chartSvg(height);
  svgNode
    .append("g")
    .attr("transform", `translate(0,${margin.top})`)
    .call(d3.axisTop(xScale).ticks(WIDTH / 80, null))
    .call(g => g.select(".domain").remove())
    .call(g => g.selectAll("text").text((d: unknown) => formatX(d as number)))
    .call(g =>
      g
        .selectAll(".tick line")
        .clone()
        .attr("y2", height - margin.top - margin.bottom)
        .attr("stroke-opacity", 0.1)
    );
  drawBars(svgNode, yScale, null);
  svgNode
    .append("g")
    .attr("transform", `translate(${xScale(0)},0)`)
    .call(d3.axisLeft(yScale).tickSizeOuter(0));
  drawLegend(svgNode, height - margin.bottom + 15);

  const axisNode = chartSvg(margin.top);
  axisNode
    .append("g")
    .attr("transform", `translate(0,${margin.top})`)
    .call(d3.axisTop(xScale).ticks(WIDTH / 80, null))
    .call(g => g.select(".domain").remove())
    .call(g => g.selectAll("text").text((d: unknown) => formatX(d as number)));

  const legendNode = chartSvg(margin.bottom);
  drawLegend(legendNode, 15);

  const renderPlot = (start: number, end: number): SVGElement => {
    const from = Math.max(0, Math.min(start, entities.length));
    const to = Math.max(from, Math.min(end, entities.length));
    const names = entities.slice(from, to);
    const plotHeight = Math.max(names.length, 1) * CHART_BAR_SLOT;
    const node = chartSvg(names.length === 0 ? 0 : plotHeight);
    if (!names.length) return node.node()!;
    const band = d3.scaleBand(names, [plotHeight, 0]).paddingInner(Y_PADDING);
    node
      .append("g")
      .attr("stroke", "#000")
      .attr("stroke-opacity", 0.1)
      .selectAll("line")
      .data(xScale.ticks(WIDTH / 80))
      .join("line")
      .attr("x1", d => xScale(d))
      .attr("x2", d => xScale(d))
      .attr("y1", 0)
      .attr("y2", plotHeight);
    drawBars(node, band, new Set(names));
    node
      .append("g")
      .attr("transform", `translate(${xScale(0)},0)`)
      .call(d3.axisLeft(band).tickSizeOuter(0));
    return node.node()!;
  };

  return {
    svgElement: svgNode.node()!,
    entityNames: entities,
    axisElement: axisNode.node()!,
    legendElement: legendNode.node()!,
    renderPlot
  };
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

function burgNameGetter(i: string | number): string {
  const id = +i;
  const burg = worldContext.pack.burgs[id];
  if (!id || !burg || typeof burg !== "object") return EMPTY_NAME;
  return burg.name || `Burg ${id}`;
}

function burgColor(id: number): string {
  return `hsl(${(id * 137.508) % 360}, 55%, 42%)`;
}

function burgColorsGetter(): Record<string, string> {
  const colors: Record<string, string> = {};
  worldContext.pack.burgs.forEach((burg, id) => {
    if (!id || !burg || typeof burg !== "object") return;
    colors[burg.name || `Burg ${id}`] = burgColor(id);
  });
  return colors;
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
