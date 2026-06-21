import type React from "react";
import { useMemo } from "react";
import { worldContext } from "../../context/worldContext";
import { downloadFile, getFileName } from "../../controllers/editors";
import {
  militaryRecalculate,
  militaryStateHighlightOff,
  militaryStateHighlightOn,
  updateStateWarAlert
} from "../../controllers/military-overview";
import { overviewRegiments } from "../../controllers/regiments-overview";
import { dialogStore, useDialogState } from "../../store/dialogState";
import { useMilitaryOverviewState } from "../../store/militaryOverviewState";
import { capitalize, rn, si, wiki } from "../../utils";
import { FillBox } from "../components/FillBox";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const MilitaryOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("militaryOverview"));
  const { sortBy, sortOrder, percentageMode, refreshCounter, toggleSortBy, togglePercentageMode, refresh } =
    useMilitaryOverviewState();

  const { militaryOptions, lines, totals } = useMemo(() => {
    void refreshCounter;
    const options = worldContext.options?.military || [];

    let processedLines = (worldContext.pack?.states || [])
      .filter(s => s.i && !s.removed)
      .map(s => {
        const population = rn(
          ((s.rural ?? 0) + (s.urban ?? 0) * worldContext.urbanization) * worldContext.populationRate
        );

        const getForces = (u: { name: string }) => s.military?.reduce((acc, r) => acc + (r.u[u.name] || 0), 0) || 0;
        const total = options.reduce((acc, u) => acc + getForces(u) * u.crew, 0);
        const rate = population > 0 ? (total / population) * 100 : 0;

        const unitsData: Record<string, number> = {};
        for (const u of options) {
          unitsData[u.name] = getForces(u);
        }

        return {
          id: s.i,
          name: s.name,
          fullName: s.fullName,
          color: s.color,
          alert: s.alert || 0,
          population,
          total,
          rate,
          unitsData
        };
      });

    // Calculate totals across all states for percentage mode
    const statesNumber = processedLines.length || 1;
    let sumTotal = 0;
    let sumPopulation = 0;
    let sumRate = 0;
    let sumAlert = 0;
    const sumUnits: Record<string, number> = {};

    for (const u of options) sumUnits[u.name] = 0;

    for (const l of processedLines) {
      sumTotal += l.total;
      sumPopulation += l.population;
      sumRate += l.rate;
      sumAlert += l.alert;
      for (const u of options) {
        sumUnits[u.name] += l.unitsData[u.name];
      }
    }

    // sort
    processedLines = [...processedLines].sort((a, b) => {
      let valA: string | number;
      let valB: string | number;

      if (sortBy === "state") {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortBy === "total") {
        valA = a.total;
        valB = b.total;
      } else if (sortBy === "population") {
        valA = a.population;
        valB = b.population;
      } else if (sortBy === "rate") {
        valA = a.rate;
        valB = b.rate;
      } else if (sortBy === "alert") {
        valA = a.alert;
        valB = b.alert;
      } else {
        // unit sorting
        valA = a.unitsData[sortBy] || 0;
        valB = b.unitsData[sortBy] || 0;
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return {
      militaryOptions: options,
      lines: processedLines,
      totals: {
        statesNumber: processedLines.length,
        total: sumTotal,
        averageForces: sumTotal / statesNumber,
        averageRate: sumRate / statesNumber,
        averageAlert: sumAlert / statesNumber,
        sumUnits,
        sumPopulation
      }
    };
  }, [sortBy, sortOrder, refreshCounter]);

  const handleExport = () => {
    const units = militaryOptions.map(u => u.name);
    let data = `Id,State,${units.map(u => capitalize(u)).join(",")},Total,Population,Rate,War Alert\n`;

    lines.forEach(l => {
      data += `${l.id},`;
      data += `${l.name},`;
      data += `${units.map(u => l.unitsData[u]).join(",")},`;
      data += `${l.total},`;
      data += `${l.population},`;
      data += `${rn(l.rate, 2)}%,`;
      data += `${l.alert}\n`;
    });

    downloadFile(data, `${getFileName("Military")}.csv`);
  };

  const getDisplayValue = (val: number, total: number) => {
    if (percentageMode) {
      if (total === 0) return "0%";
      return `${rn((val / total) * 100)}%`;
    }
    return val;
  };

  const getDisplayValueSi = (val: number, total: number) => {
    if (percentageMode) {
      if (total === 0) return "0%";
      return `${rn((val / total) * 100)}%`;
    }
    return si(val);
  };

  return (
    <Dialog isOpen={isOpen} title="Military Overview" onClose={() => closeDialog("militaryOverview")}>
      <div id="militaryOverviewContainer">
        <div>
          <div
            id="militaryHeader"
            className="header"
            style={{ gridTemplateColumns: `8em repeat(${militaryOptions.length}, 5.2em) 4em 7em 5em 6em` }}
          >
            <div
              data-tip="State name. Click to sort"
              className={`sortable alphabetically ${sortBy === "state" ? (sortOrder === "asc" ? "icon-sort-name-up" : "icon-sort-name-down") : ""}`}
              onClick={() => toggleSortBy("state")}
            >
              State&nbsp;
            </div>
            {militaryOptions.map(u => (
              <div
                key={u.name}
                data-tip={`State ${u.name} units number. Click to sort`}
                className={`sortable ${sortBy === u.name ? (sortOrder === "asc" ? "icon-sort-number-up" : "icon-sort-number-down") : ""}`}
                onClick={() => toggleSortBy(u.name)}
              >
                {capitalize(u.name.replace(/_/g, " "))}&nbsp;
              </div>
            ))}
            <div
              data-tip="Total military personnel (considering crew). Click to sort"
              className={`sortable ${sortBy === "total" ? (sortOrder === "asc" ? "icon-sort-number-up" : "icon-sort-number-down") : "icon-sort-number-down"}`}
              onClick={() => toggleSortBy("total")}
            >
              Total&nbsp;
            </div>
            <div
              data-tip="State population. Click to sort"
              className={`sortable ${sortBy === "population" ? (sortOrder === "asc" ? "icon-sort-number-up" : "icon-sort-number-down") : ""}`}
              onClick={() => toggleSortBy("population")}
            >
              Population&nbsp;
            </div>
            <div
              data-tip="Military personnel rate (% of state population). Depends on war alert. Click to sort"
              className={`sortable ${sortBy === "rate" ? (sortOrder === "asc" ? "icon-sort-number-up" : "icon-sort-number-down") : ""}`}
              onClick={() => toggleSortBy("rate")}
            >
              Rate&nbsp;
            </div>
            <div
              data-tip="War Alert. Modifier to military forces number, depends of political situation. Click to sort"
              className={`sortable ${sortBy === "alert" ? (sortOrder === "asc" ? "icon-sort-number-up" : "icon-sort-number-down") : ""}`}
              onClick={() => toggleSortBy("alert")}
            >
              War Alert&nbsp;
            </div>
          </div>
          <div id="militaryBody" className="table" data-type={percentageMode ? "percentage" : "absolute"}>
            {lines.map(l => (
              <div
                key={l.id}
                className="states"
                data-id={l.id}
                onMouseEnter={() => militaryStateHighlightOn(l.id)}
                onMouseLeave={() => militaryStateHighlightOff(l.id)}
              >
                <FillBox data-tip={l.fullName} fill={l.color} disabled />
                <input data-tip={l.fullName} style={{ width: "6em" }} value={l.name} readOnly />
                {militaryOptions.map(u => (
                  <div key={u.name} data-tip={`State ${u.name} units number`}>
                    {getDisplayValue(l.unitsData[u.name], totals.sumUnits[u.name])}
                  </div>
                ))}
                <div data-tip="Total state military personnel (considering crew)" style={{ fontWeight: "bold" }}>
                  {getDisplayValueSi(l.total, totals.total)}
                </div>
                <div data-tip="State population">{getDisplayValueSi(l.population, totals.sumPopulation)}</div>
                <div data-tip="Military personnel rate (% of state population). Depends on war alert">
                  {rn(l.rate, 2)}%
                </div>
                <input
                  data-tip="War Alert. Editable modifier to military forces number, depends of political situation"
                  style={{ width: "4.1em" }}
                  type="number"
                  min="0"
                  step=".01"
                  value={l.alert}
                  onChange={e => updateStateWarAlert(l.id, Number(e.target.value))}
                />
                <span
                  data-tip="Show regiments list"
                  className="icon-list-bullet pointer"
                  onClick={() => overviewRegiments(l.id)}
                />
              </div>
            ))}
          </div>
          <div id="militaryTotal" className="totalLine">
            <div data-tip="States number" style={{ marginLeft: 4 }}>
              States:&nbsp;<span>{totals.statesNumber}</span>
            </div>
            <div data-tip="Total military forces" style={{ marginLeft: 14 }}>
              Total forces:&nbsp;<span>{si(totals.total)}</span>
            </div>
            <div data-tip="Average military forces per state" style={{ marginLeft: 14 }}>
              Average forces:&nbsp;<span>{si(totals.averageForces)}</span>
            </div>
            <div data-tip="Average forces rate per state" style={{ marginLeft: 14 }}>
              Average rate:&nbsp;<span>{rn(totals.averageRate, 2)}%</span>
            </div>
            <div data-tip="Average War Alert" style={{ marginLeft: 14 }}>
              Average alert:&nbsp;<span>{rn(totals.averageAlert, 2)}</span>
            </div>
          </div>
          <div id="militaryFooter">
            <button
              type="button"
              id="militaryOverviewRefresh"
              data-tip="Refresh the overview screen"
              className="icon-cw"
              onClick={refresh}
            />
            <button
              type="button"
              id="militaryOptionsButton"
              data-tip="Edit Military units"
              className="icon-cog"
              onClick={() => dialogStore.getState().openDialog("militaryOptions")}
            />
            <button
              type="button"
              id="militaryRegimentsList"
              data-tip="Show regiments list"
              className="icon-list-bullet"
              onClick={() => overviewRegiments(-1)}
            />
            <button
              type="button"
              id="militaryPercentage"
              data-tip="Toggle percentage / absolute values views"
              className="icon-percent"
              onClick={togglePercentageMode}
            />
            <button
              type="button"
              id="militaryOverviewRecalculate"
              data-tip="Recalculate military forces based on current options"
              className="icon-retweet"
              onClick={militaryRecalculate}
            />
            <button
              type="button"
              id="militaryExport"
              data-tip="Save military-related data as a text file (.csv)"
              className="icon-download"
              onClick={handleExport}
            />
            <button
              type="button"
              id="militaryWiki"
              data-tip="Open Military Forces Tutorial"
              className="icon-info"
              onClick={() => wiki("Military-Forces")}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
