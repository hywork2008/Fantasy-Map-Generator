import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { worldContext } from "../../context/worldContext";
import {
  BURG_ENTITY_OPTION,
  type BuiltChart,
  buildChart,
  CHART_BAR_SLOT,
  CHART_PLOT_WIDTH,
  CHART_VISIBLE_ROWS,
  type ChartDataPoint,
  isTradePlot,
  TRADE_PLOT_OPTIONS
} from "../../controllers/charts-overview";
import { downloadFile, getFileName } from "../../controllers/editors";
import { useDialogState } from "../../store/dialogState";
import { useExtensionState } from "../../store/extensionState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

const ENTITY_OPTIONS = [
  { value: "states", label: "State" },
  { value: "cultures", label: "Culture" },
  { value: "religions", label: "Religion" },
  { value: "provinces", label: "Province" },
  { value: "biomes", label: "Biome" }
];

const PLOT_BY_OPTIONS = [
  { value: "total_population", label: "Total population" },
  { value: "urban_population", label: "Urban population" },
  { value: "rural_population", label: "Rural population" },
  { value: "area", label: "Land area" },
  { value: "cells", label: "Number of cells" },
  { value: "burgs_number", label: "Number of burgs" },
  { value: "average_elevation", label: "Average elevation" },
  { value: "max_elevation", label: "Maximum mean elevation" },
  { value: "min_elevation", label: "Minimum mean elevation" },
  { value: "average_temperature", label: "Annual mean temperature" },
  { value: "max_temperature", label: "Mean annual maximum temperature" },
  { value: "min_temperature", label: "Mean annual minimum temperature" },
  { value: "average_precipitation", label: "Annual mean precipitation" },
  { value: "max_precipitation", label: "Mean annual maximum precipitation" },
  { value: "min_precipitation", label: "Mean annual minimum precipitation" },
  { value: "coastal_cells", label: "Number of coastal cells" },
  { value: "river_cells", label: "Number of river cells" }
];

interface ChartItem extends BuiltChart {
  id: number;
}

interface ChartFigureProps {
  chart: ChartItem;
  figureNo: number;
  onRemove: (id: number) => void;
}

interface PlotWindow {
  start: number;
  end: number;
  topPx: number;
  totalHeight: number;
}

/** Visible slice of a top-aligned bar chart. Index 0 of entityNames is the bottom row. */
function plotWindow(scrollTop: number, viewport: number, width: number, count: number): PlotWindow {
  const rowPx = (CHART_BAR_SLOT * Math.max(width, 1)) / CHART_PLOT_WIDTH;
  const viewPx = viewport > 0 ? viewport : CHART_VISIBLE_ROWS * rowPx;
  const viewRows = Math.max(1, Math.ceil(viewPx / rowPx));
  const overscan = 4;
  const rowsFromTop = Math.min(Math.max(count - 1, 0), Math.max(0, Math.floor(Math.max(scrollTop, 0) / rowPx)));
  const topIndex = count - 1 - rowsFromTop;
  const start = Math.max(0, topIndex - viewRows + 1 - overscan);
  const end = Math.min(count, topIndex + 1 + overscan);
  return { start, end, topPx: (count - end) * rowPx, totalHeight: count * rowPx };
}

const FullChart: React.FC<{ chart: BuiltChart }> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.replaceChildren(chart.svgElement);
  }, [chart]);

  return <div ref={containerRef} className="fmg-chart-figure__view" />;
};

/**
 * VirtualTableBody only mounts table rows. A stacked bar is one SVG, so the same
 * idea is applied here: a fixed plot viewport and a window of bar rows.
 */
const VirtualChart: React.FC<{ chart: BuiltChart }> = ({ chart }) => {
  const count = chart.entityNames.length;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [slice, setSlice] = useState<PlotWindow>(() => plotWindow(0, 0, CHART_PLOT_WIDTH, count));

  useEffect(() => {
    axisRef.current?.replaceChildren(chart.axisElement);
    legendRef.current?.replaceChildren(chart.legendElement);
  }, [chart]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const apply = () => {
      const next = plotWindow(el.scrollTop, el.clientHeight, el.clientWidth, count);
      setSlice(prev =>
        prev.start === next.start &&
        prev.end === next.end &&
        prev.topPx === next.topPx &&
        prev.totalHeight === next.totalHeight
          ? prev
          : next
      );
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => observer.disconnect();
  }, [count]);

  useEffect(() => {
    plotRef.current?.replaceChildren(chart.renderPlot(slice.start, slice.end));
  }, [chart, slice.start, slice.end]);

  return (
    <>
      <div ref={axisRef} className="fmg-chart-figure__axis" />
      <div
        ref={scrollerRef}
        className="fmg-chart-figure__plot"
        onScroll={event => {
          const el = event.currentTarget;
          const next = plotWindow(el.scrollTop, el.clientHeight, el.clientWidth, count);
          setSlice(prev =>
            prev.start === next.start && prev.end === next.end && prev.topPx === next.topPx ? prev : next
          );
        }}
      >
        <div className="fmg-chart-figure__spacer" style={{ height: slice.totalHeight }}>
          <div ref={plotRef} className="fmg-chart-figure__window" style={{ top: slice.topPx }} />
        </div>
      </div>
      <div ref={legendRef} className="fmg-chart-figure__legend" />
    </>
  );
};

const ChartFigure: React.FC<ChartFigureProps> = ({ chart, figureNo, onRemove }) => {
  function downloadCsv(): void {
    const name = `${getFileName(chart.title)}.csv`;
    const headers = "Name,Group,Value\n";
    const values = chart.sortedData
      .map(({ name, group, value }: ChartDataPoint) => `${name},${group},${value}`)
      .join("\n");
    downloadFile(headers + values, name);
  }

  function downloadSvg(): void {
    downloadFile(chart.svgElement.outerHTML, `${getFileName(chart.title)}.svg`);
  }

  const tall = chart.entityNames.length > CHART_VISIBLE_ROWS;

  return (
    <figure className="fmg-chart-figure">
      {tall ? <VirtualChart chart={chart} /> : <FullChart chart={chart} />}
      <figcaption className="d-flex fmg-chart-figure__caption">
        <div>
          <strong>Figure {figureNo}</strong>. {chart.title}
        </div>
        <div className="d-flex">
          <button
            type="button"
            data-tip="Download chart data as a text file (.csv)"
            className="icon-download"
            onClick={downloadCsv}
          />
          <button
            type="button"
            data-tip="Download the chart in svg format"
            className="icon-chart-bar"
            onClick={downloadSvg}
          />
          <button type="button" data-tip="Remove the chart" className="icon-trash" onClick={() => onRemove(chart.id)} />
        </div>
      </figcaption>
    </figure>
  );
};

export const ChartsOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("chartsOverview"));
  const economyOn = useExtensionState(state => state.enabledExtensions.economy === true);

  const [entity, setEntity] = useState("states");
  const [plotBy, setPlotBy] = useState("total_population");
  const [groupBy, setGroupBy] = useState("cultures");
  const [sorting, setSorting] = useState("value");
  const [chartType, setChartType] = useState("stackedBar");
  const [viewColumns, setViewColumns] = useState("1");
  const [charts, setCharts] = useState<ChartItem[]>([]);
  const [prevMapId, setPrevMapId] = useState(-1);

  const entityOptions = economyOn ? [...ENTITY_OPTIONS, BURG_ENTITY_OPTION] : ENTITY_OPTIONS;
  const plotOptions = economyOn ? [...PLOT_BY_OPTIONS, ...TRADE_PLOT_OPTIONS] : PLOT_BY_OPTIONS;
  const tradeByTag = isTradePlot(plotBy) && plotBy === "trade_tags";

  useEffect(() => {
    if (economyOn) return;
    if (entity === "burgs") setEntity("states");
    if (isTradePlot(plotBy)) setPlotBy("total_population");
  }, [economyOn, entity, plotBy]);

  // Reset charts when map changes or dialog opens
  useEffect(() => {
    if (!isOpen) return;
    const currentMapId = worldContext.mapId;
    if (currentMapId !== prevMapId) {
      setCharts([]);
      setPrevMapId(currentMapId);
    }
  }, [isOpen, prevMapId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fires only on dialog open, not on chart list changes
  useEffect(() => {
    if (isOpen && charts.length === 0) handleAddChart();
  }, [isOpen]);

  // Clear charts on close
  function handleClose(): void {
    setCharts([]);
    closeDialog("chartsOverview");
  }

  function handleAddChart(): void {
    const result = buildChart({ entity, plotBy, groupBy, sorting, type: chartType });
    if (result) {
      setCharts(prev => [...prev, { ...result, id: Date.now() }]);
    }
  }

  function handleRemoveChart(id: number): void {
    setCharts(prev => prev.filter(c => c.id !== id));
  }

  return (
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.dataCharts")}
      onClose={handleClose}
      className="overflow-hidden d-flex"
    >
      <div className="fmg-charts-dialog">
        <form
          onSubmit={e => {
            e.preventDefault();
            handleAddChart();
          }}
          className="d-grid fmg-charts-dialog__form"
        >
          <div className="d-flex">
            <button data-tip="Add a chart" type="submit">
              Plot
            </button>
            <select data-tip="Select entity (y axis)" value={entity} onChange={e => setEntity(e.target.value)}>
              {entityOptions.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label className="d-flex">
              by
              <select
                data-tip="Select value to plot by (x axis)"
                value={plotBy}
                onChange={e => setPlotBy(e.target.value)}
              >
                {plotOptions.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="d-flex">
              grouped by
              <select
                data-tip={
                  tradeByTag
                    ? "Trade volume is stacked by each good's trade heading"
                    : "Select entity to group by. If you don't need grouping, set it the same as the entity"
                }
                value={tradeByTag ? "tags" : groupBy}
                disabled={tradeByTag}
                onChange={e => setGroupBy(e.target.value)}
              >
                {tradeByTag ? (
                  <option value="tags">Trade heading</option>
                ) : (
                  ENTITY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label data-tip="Sorting type" className="d-flex">
              sorted
              <select value={sorting} onChange={e => setSorting(e.target.value)}>
                <option value="value">by value</option>
                <option value="name">by name</option>
                <option value="natural">naturally</option>
              </select>
            </label>
          </div>
          <div className="d-flex">
            <span data-tip="Chart type">Type</span>
            <select value={chartType} onChange={e => setChartType(e.target.value)}>
              <option value="stackedBar">Stacked Bar</option>
              <option value="normalizedStackedBar">Normalized Stacked Bar</option>
            </select>
            <span data-tip="Columns to display">Columns</span>
            <select value={viewColumns} onChange={e => setViewColumns(e.target.value)}>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </div>
        </form>

        <section className="fmg-chart-board" style={{ gridTemplateColumns: `repeat(${viewColumns}, minmax(0, 1fr))` }}>
          {charts.map((chart, i) => (
            <ChartFigure key={chart.id} chart={chart} figureNo={i + 1} onRemove={handleRemoveChart} />
          ))}
        </section>
      </div>
    </Dialog>
  );
};
