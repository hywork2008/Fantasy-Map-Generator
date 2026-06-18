import type React from "react";
import { useEffect } from "react";
import { addChart, changeViewColumns, handleClose } from "../../controllers/charts-overview";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";

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

export const ChartsOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("chartsOverview"));

  useEffect(() => {
    if (isOpen) changeViewColumns();
  }, [isOpen]);

  return (
    <Dialog
      isOpen={isOpen}
      title="Data Charts"
      onClose={handleClose}
      className="fmg-dialog--overflow-hidden"
      style={{ width: "min(90vw, 900px)", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
    >
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden", flex: 1, padding: "0.5em" }}>
        <form
          id="chartsOverview__form"
          onSubmit={e => {
            e.preventDefault();
            addChart();
          }}
          style={{
            fontSize: "1.1em",
            margin: "0.3em 0",
            display: "grid",
            gridTemplateColumns: "auto auto",
            gap: "0.3em",
            alignItems: "start",
            justifyItems: "end"
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4em", alignItems: "center" }}>
            <button data-tip="Add a chart" type="submit">
              Plot
            </button>
            <select data-tip="Select entity (y axis)" id="chartsOverview__entitiesSelect" defaultValue="states">
              {ENTITY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: "0.3em" }}>
              by
              <select
                data-tip="Select value to plot by (x axis)"
                id="chartsOverview__plotBySelect"
                defaultValue="total_population"
              >
                {PLOT_BY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.3em" }}>
              grouped by
              <select
                data-tip="Select entity to group by. If you don't need grouping, set it the same as the entity"
                id="chartsOverview__groupBySelect"
                defaultValue="cultures"
              >
                {ENTITY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label data-tip="Sorting type" style={{ display: "flex", alignItems: "center", gap: "0.3em" }}>
              sorted
              <select id="chartsOverview__sortingSelect" defaultValue="value">
                <option value="value">by value</option>
                <option value="name">by name</option>
                <option value="natural">naturally</option>
              </select>
            </label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4em", alignItems: "center" }}>
            <span data-tip="Chart type">Type</span>
            <select id="chartsOverview__chartType" defaultValue="stackedBar">
              <option value="stackedBar">Stacked Bar</option>
              <option value="normalizedStackedBar">Normalized Stacked Bar</option>
            </select>
            <span data-tip="Columns to display">Columns</span>
            <select id="chartsOverview__viewColumns" defaultValue="1" onChange={changeViewColumns}>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
            </select>
          </div>
        </form>

        <section id="chartsOverview__charts" style={{ overflow: "auto", scrollBehavior: "smooth", display: "grid" }} />
      </div>
    </Dialog>
  );
};
