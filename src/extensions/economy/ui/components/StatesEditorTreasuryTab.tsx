import type React from "react";
import { useMemo, useState } from "react";
import { formatPrice, rn } from "../../../hostUtils";
import { getWorldContext } from "../../economyContext";

export const StatesEditorTreasuryTab: React.FC = () => {
  const worldContext = getWorldContext();
  const pack = worldContext.pack;
  const states = pack.states.filter(s => s.i && !s.removed);

  const [sortBy, setSortBy] = useState("treasury");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [, setRenderTick] = useState(0);
  const rerender = () => setRenderTick(tick => tick + 1);

  const sortedStates = useMemo(() => {
    return [...states].sort((a, b) => {
      const valA = a[sortBy as keyof typeof a];
      const valB = b[sortBy as keyof typeof b];
      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      const numA = Number(valA) || 0;
      const numB = Number(valB) || 0;
      return sortOrder === "asc" ? numA - numB : numB - numA;
    });
  }, [states, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const totalTreasury = states.reduce((sum, s) => sum + (s.treasury || 0), 0);

  function SortHeader({ field, label, tip }: { field: string; label: string; tip: string }) {
    const isActive = sortBy === field;
    const directionIcon = sortOrder === "asc" ? "icon-sort-number-up" : "icon-sort-number-down";
    return (
      <th
        data-tip={`Click to sort by ${tip}`}
        className={`sortable ${isActive ? "sort-active" : ""}`}
        onClick={() => handleSort(field)}
      >
        {label}
        {isActive && <span className={directionIcon} />}
      </th>
    );
  }

  return (
    <div className="table" style={{ overflow: "auto" }}>
      <table className="fmg-table">
        <thead>
          <tr>
            <th
              data-tip="Click to sort by name"
              className={`sortable alphabetically ${sortBy === "name" ? "sort-active" : ""}`}
              onClick={() => handleSort("name")}
            >
              State
              {sortBy === "name" && (
                <span className={sortOrder === "asc" ? "icon-sort-name-up" : "icon-sort-name-down"} />
              )}
            </th>
            <th
              data-tip="Click to sort by form"
              className={`sortable alphabetically ${sortBy === "formName" ? "sort-active" : ""}`}
              onClick={() => handleSort("formName")}
            >
              Form
              {sortBy === "formName" && (
                <span className={sortOrder === "asc" ? "icon-sort-name-up" : "icon-sort-name-down"} />
              )}
            </th>
            <SortHeader field="salesTax" label="Sales Tax" tip="sales tax rate" />
            <SortHeader field="pollTax" label="Poll Tax" tip="poll tax rate" />
            <SortHeader field="treasury" label="Treasury" tip="state treasury" />
            <th data-tip="Share of the total treasury held by all states">Share</th>
          </tr>
        </thead>
        <tbody>
          {sortedStates.length === 0 ? (
            <tr>
              <td colSpan={6}>No states found</td>
            </tr>
          ) : (
            sortedStates.map(s => (
              <tr key={s.i} className="states">
                <td>{s.name}</td>
                <td>{s.formName || s.form || ""}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    data-tip="Sales tax rate, charged on the seller for every local and inter-market trade deal"
                    style={{ width: "4.5em" }}
                    value={rn((s.salesTax || 0) * 100, 1)}
                    onChange={e => {
                      s.salesTax = rn(Math.max(0, Number(e.target.value)) / 100, 4);
                      rerender();
                    }}
                  />{" "}
                  %
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    data-tip="Poll tax rate, a flat levy per head of population collected once per production cycle"
                    style={{ width: "4.5em" }}
                    value={rn((s.pollTax || 0) * 100, 1)}
                    onChange={e => {
                      s.pollTax = rn(Math.max(0, Number(e.target.value)) / 100, 4);
                      rerender();
                    }}
                  />{" "}
                  %
                </td>
                <td>
                  <input
                    type="number"
                    step="1"
                    data-tip="Accumulated treasury. Recomputed from sales and poll tax on the next production regeneration; edit to override"
                    style={{ width: "6em" }}
                    value={rn(s.treasury || 0, 2)}
                    onChange={e => {
                      s.treasury = rn(Number(e.target.value), 2);
                      rerender();
                    }}
                  />
                </td>
                <td>{totalTreasury ? `${rn(((s.treasury || 0) / totalTreasury) * 100, 1)}%` : "0%"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="totalLine">
        <div data-tip="Combined treasury of all states">
          Total Treasury:<span>{formatPrice(totalTreasury)}</span>
        </div>
      </div>
    </div>
  );
};
