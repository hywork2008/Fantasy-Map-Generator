import { sum } from "d3";
import React, { useEffect, useMemo } from "react";
import { worldContext } from "../../context/worldContext";
import {
  addRegimentOnMap,
  clearAddRegimentClickHandler,
  downloadRegimentsData,
  regimentHighlightOff,
  regimentHighlightOn
} from "../../controllers/regiments-overview";
import { useDialogState } from "../../store/dialogState";
import { useRegimentsOverviewState } from "../../store/regimentsOverviewState";
import { capitalize, si } from "../../utils";
import { FillBox } from "../components/FillBox";
import { VirtualTableBody } from "../components/VirtualTableBody";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RegimentsOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("regimentsOverview"));
  const {
    sortBy,
    sortOrder,
    percentageMode,
    filterStateId,
    addMode,
    refreshCounter,
    toggleSortBy,
    togglePercentageMode,
    setFilterStateId,
    setAddMode,
    refresh
  } = useRegimentsOverviewState();

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshCounter intentionally triggers recompute of external worldContext data
  const unitTypes = useMemo(
    () => (worldContext.options?.military ?? []).filter(u => u.enabled !== false),
    [refreshCounter]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshCounter intentionally triggers recompute of external worldContext data
  const states = useMemo(() => (worldContext.pack?.states ?? []).filter(s => s.i && !s.removed), [refreshCounter]);

  const { rows, totals } = useMemo(() => {
    void refreshCounter;
    const military = unitTypes;
    type RowItem = {
      stateId: number;
      stateName: string;
      stateFullName: string;
      stateColor: string;
      regiment: NonNullable<(typeof worldContext.pack.states)[0]["military"]>[0];
    };
    const rawRows: RowItem[] = [];

    for (const s of worldContext.pack?.states ?? []) {
      if (!s.i || s.removed || !s.military?.length) continue;
      if (filterStateId !== -1 && s.i !== filterStateId) continue;
      for (const r of s.military) {
        rawRows.push({
          stateId: s.i,
          stateName: s.name,
          stateFullName: s.fullName ?? s.name,
          stateColor: s.color ?? "#999",
          regiment: r
        });
      }
    }

    const sorted = [...rawRows].sort((a, b) => {
      let valA: string | number = 0;
      let valB: string | number = 0;

      if (sortBy === "state") {
        valA = a.stateName;
        valB = b.stateName;
      } else if (sortBy === "name") {
        valA = a.regiment.name;
        valB = b.regiment.name;
      } else if (sortBy === "total") {
        valA = a.regiment.a;
        valB = b.regiment.a;
      } else {
        valA = a.regiment.u[sortBy] ?? 0;
        valB = b.regiment.u[sortBy] ?? 0;
      }

      const cmp = typeof valA === "string" ? valA.localeCompare(valB as string) : valA - (valB as number);
      return sortOrder === "asc" ? cmp : -cmp;
    });

    const sumUnits: Record<string, number> = {};
    for (const u of military) sumUnits[u.name] = 0;
    let sumTotal = 0;
    for (const { regiment: r } of sorted) {
      sumTotal += r.a;
      for (const u of military) sumUnits[u.name] = (sumUnits[u.name] ?? 0) + (r.u[u.name] ?? 0);
    }

    return { rows: sorted, totals: { units: sumUnits, total: sumTotal } };
  }, [refreshCounter, filterStateId, sortBy, sortOrder, unitTypes]);

  // Manage add-regiment map interaction
  useEffect(() => {
    if (!isOpen) return;
    if (addMode) {
      addRegimentOnMap(filterStateId, () => {
        setAddMode(false);
        refresh();
      });
    } else {
      clearAddRegimentClickHandler();
    }
    return () => clearAddRegimentClickHandler();
  }, [addMode, isOpen, filterStateId, setAddMode, refresh]);

  useEffect(() => {
    const handleRefresh = () => refresh();
    document.addEventListener("fmg:refresh-military", handleRefresh);
    return () => document.removeEventListener("fmg:refresh-military", handleRefresh);
  }, [refresh]);

  // Clean up add mode when dialog closes
  useEffect(() => {
    if (!isOpen && addMode) {
      setAddMode(false);
      clearAddRegimentClickHandler();
    }
  }, [isOpen, addMode, setAddMode]);

  const displayValue = (value: number, type: string): string => {
    if (!percentageMode) return String(value);
    const total = type === "total" ? totals.total : (totals.units[type] ?? 0);
    return total ? `${Math.round((value / total) * 100)}%` : "0%";
  };

  const SortHeader: React.FC<{ field: string; label: string; numeric?: boolean }> = ({ field, label, numeric }) => {
    let sortClass = "";
    if (sortBy === field) {
      sortClass =
        sortOrder === "asc"
          ? numeric
            ? "icon-sort-number-up"
            : "icon-sort-name-up"
          : numeric
            ? "icon-sort-number-down"
            : "icon-sort-name-down";
    }
    return (
      <th
        data-tip={`${label}. Click to sort`}
        className={`sortable ${numeric ? "" : "alphabetically"} ${sortClass}`}
        onClick={() => toggleSortBy(field)}
        data-sortby={field}
      >
        {label}
      </th>
    );
  };

  const sortedStates = useMemo(() => [...states].sort((a, b) => (a.name > b.name ? 1 : -1)), [states]);

  const parentRef = React.useRef<HTMLDivElement>(null);

  return (
    <Dialog
      isOpen={isOpen}
      title="Regiments Overview"
      className="overflow-hidden"
      onClose={() => closeDialog("regimentsOverview")}
    >
      <div id="regimentsOverviewContainer">
        <div
          ref={parentRef}
          id="regimentsBody"
          className="table"
          data-type={percentageMode ? "percentage" : "absolute"}
        >
          <table className="fmg-table states-table">
            <colgroup>
              <col />
              <col />
              {unitTypes.map(u => (
                <col key={u.name} />
              ))}
              <col />
            </colgroup>
            <thead id="regimentsHeader">
              <tr className="header">
                <SortHeader field="state" label="State" />
                <SortHeader field="name" label="Name" />
                {unitTypes.map(u => (
                  <SortHeader key={u.name} field={u.name} label={capitalize(u.name.replace(/_/g, " "))} numeric />
                ))}
                <th
                  id="regimentsTotal"
                  data-tip="Total military personnel (not considering crew). Click to sort"
                  className={`sortable ${sortBy === "total" ? (sortOrder === "asc" ? "icon-sort-number-up" : "icon-sort-number-down") : ""}`}
                  data-sortby="total"
                  onClick={() => toggleSortBy("total")}
                >
                  Total
                </th>
              </tr>
            </thead>
            <VirtualTableBody
              items={rows}
              scrollElementRef={parentRef}
              renderRow={({ stateId, stateName, stateFullName, stateColor, regiment: r }) => (
                <tr
                  key={`${stateId}-${r.i}`}
                  className="states"
                  data-id={r.i}
                  data-s={stateId}
                  data-state={stateName}
                  data-name={r.name}
                  data-total={r.a}
                  onMouseEnter={() => regimentHighlightOn(stateId, r.i)}
                  onMouseLeave={() => regimentHighlightOff(stateId, r.i)}
                  onClick={() =>
                    import("../../controllers/regiment-editor").then(m => m.editRegiment(`#regiment${stateId}-${r.i}`))
                  }
                >
                  <td>
                    <FillBox data-tip={stateFullName} fill={stateColor} disabled />
                    <input data-tip={stateFullName} value={stateName} readOnly />
                  </td>
                  <td>
                    {r.icon && (r.icon.startsWith("http") || r.icon.startsWith("data:image")) ? (
                      <img src={r.icon} data-tip="Regiment's emblem" alt="emblem" />
                    ) : (
                      <span data-tip="Regiment's emblem">{r.icon ?? ""}</span>
                    )}
                    <input data-tip="Regiment's name" value={r.name} readOnly />
                  </td>
                  {unitTypes.map(u => (
                    <td key={u.name} data-type={u.name} data-tip={`${capitalize(u.name)} units number`}>
                      {displayValue(r.u[u.name] ?? 0, u.name)}
                    </td>
                  ))}
                  <td data-type="total" data-tip="Total military personnel (not considering crew)">
                    {displayValue(r.a, "total")}
                  </td>
                </tr>
              )}
            />
            <tfoot>
              <tr id="regimentsTotalLine" className="totalLine" data-tip="Total of all displayed regiments">
                <td colSpan={2}>Regiments: {rows.length}</td>
                {unitTypes.map(u => (
                  <td key={u.name}>{si(sum(rows.map(({ regiment: r }) => r.u[u.name] ?? 0)))}</td>
                ))}
                <td>{si(totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div id="regimentsFooter" className="footer">
          <button type="button" data-tip="Refresh the overview screen" className="icon-cw" onClick={refresh} />
          <button
            type="button"
            data-tip="Toggle percentage / absolute values views"
            className={`icon-percent${percentageMode ? " pressed" : ""}`}
            onClick={togglePercentageMode}
          />
          <button
            type="button"
            data-tip="Add new Regiment"
            className={`icon-user-plus${addMode ? " pressed" : ""}`}
            onClick={() => setAddMode(!addMode)}
          />
          <div data-tip="Select state" className="d-inline-block">
            <span>State: </span>
            <select value={filterStateId} onChange={e => setFilterStateId(+e.target.value)}>
              <option value="-1">all</option>
              {sortedStates.map(s => (
                <option key={s.i} value={s.i}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            data-tip="Save military-related data as a text file (.csv)"
            className="icon-download"
            onClick={downloadRegimentsData}
          />
        </div>
      </div>
    </Dialog>
  );
};
