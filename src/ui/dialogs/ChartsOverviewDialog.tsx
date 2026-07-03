import type React from "react";
import { useEffect, useRef, useState } from "react";
import { worldContext } from "../../context/worldContext";
import { type BuiltChart, buildChart, type ChartDataPoint } from "../../controllers/charts-overview";
import { downloadFile, getFileName } from "../../controllers/editors";
import { useDialogState } from "../../store/dialogState";
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

const ChartFigure: React.FC<ChartFigureProps> = ({ chart, figureNo, onRemove }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";
    el.appendChild(chart.svgElement);
  }, [chart.svgElement]);

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

  return (
    <figure className="d-flex">
      <div ref={containerRef} />
      <figcaption className="d-flex">
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
  const isOpen = useDialogState(state => state.openDialogs.has("chartsOverview"));

  const [entity, setEntity] = useState("states");
  const [plotBy, setPlotBy] = useState("total_population");
  const [groupBy, setGroupBy] = useState("cultures");
  const [sorting, setSorting] = useState("value");
  const [chartType, setChartType] = useState("stackedBar");
  const [viewColumns, setViewColumns] = useState("1");
  const [charts, setCharts] = useState<ChartItem[]>([]);
  const [prevMapId, setPrevMapId] = useState(-1);

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
    <Dialog isOpen={isOpen} title="Data Charts" onClose={handleClose} className="overflow-hidden d-flex">
      <div>
        <form
          onSubmit={e => {
            e.preventDefault();
            handleAddChart();
          }}
          className="d-grid"
        >
          <div className="d-flex">
            <button data-tip="Add a chart" type="submit">
              Plot
            </button>
            <select data-tip="Select entity (y axis)" value={entity} onChange={e => setEntity(e.target.value)}>
              {ENTITY_OPTIONS.map(o => (
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
                {PLOT_BY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="d-flex">
              grouped by
              <select
                data-tip="Select entity to group by. If you don't need grouping, set it the same as the entity"
                value={groupBy}
                onChange={e => setGroupBy(e.target.value)}
              >
                {ENTITY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
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

        <section style={{ overflow: "hidden", display: "grid", gridTemplateColumns: `repeat(${viewColumns}, 1fr)` }}>
          {charts.map((chart, i) => (
            <ChartFigure key={chart.id} chart={chart} figureNo={i + 1} onRemove={handleRemoveChart} />
          ))}
        </section>
      </div>
    </Dialog>
  );
};
