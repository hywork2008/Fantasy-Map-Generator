import type React from "react";
import { useEffect, useMemo } from "react";
import { worldContext } from "../../context/worldContext";
import { type DeathWindow, deathWindowDays, getDeathsByState } from "../../generators/populationLossTracker";
import { useDialogState } from "../../store/dialogState";
import { usePopulationOverviewState } from "../../store/populationOverviewState";
import { rn, si } from "../../utils";
import { SortableHeader } from "../components/tables/SortableHeader";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

const WINDOW_OPTIONS: { id: DeathWindow; label: string }[] = [
  { id: "day", label: "1 day" },
  { id: "week", label: "1 week" },
  { id: "month", label: "1 month" }
];

/**
 * Ruler-facing vital statistics (living / dead tallies) so players — and designers —
 * can see how wars, famine, and demography shape each state. Tab 1 (living) is a
 * stub for now; tab 2 shows rolling death totals from the lightweight loss tracker.
 */
export const PopulationOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("populationOverview"));
  const {
    activeTab,
    deathWindow,
    sortBy,
    sortOrder,
    refreshCounter,
    setActiveTab,
    setDeathWindow,
    toggleSortBy,
    refresh
  } = usePopulationOverviewState();

  useEffect(() => {
    if (!isOpen) return;
    const onAdvanced = () => refresh();
    document.addEventListener("fmg:time-advanced", onAdvanced);
    return () => document.removeEventListener("fmg:time-advanced", onAdvanced);
  }, [isOpen, refresh]);

  const deathRows = useMemo(() => {
    void refreshCounter;
    if (!isOpen || activeTab !== "deaths") return [];

    const deaths = getDeathsByState(deathWindow);
    const states = worldContext.pack?.states ?? [];

    let rows = states
      .filter(s => s.i && !s.removed)
      .map(s => {
        const d = deaths.get(s.i) ?? { combat: 0, famine: 0, natural: 0, other: 0, total: 0 };
        return {
          id: s.i,
          name: s.name,
          fullName: s.fullName || s.name,
          color: s.color || "#999",
          combat: d.combat,
          famine: d.famine,
          natural: d.natural,
          other: d.other,
          total: d.total
        };
      });

    rows = [...rows].sort((a, b) => {
      const key = sortBy as keyof (typeof rows)[0];
      const valA = a[key];
      const valB = b[key];
      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      const nA = Number(valA) || 0;
      const nB = Number(valB) || 0;
      return sortOrder === "asc" ? nA - nB : nB - nA;
    });

    return rows;
  }, [isOpen, activeTab, deathWindow, sortBy, sortOrder, refreshCounter]);

  const deathTotals = useMemo(() => {
    return deathRows.reduce(
      (acc, r) => {
        acc.combat += r.combat;
        acc.famine += r.famine;
        acc.natural += r.natural;
        acc.other += r.other;
        acc.total += r.total;
        return acc;
      },
      { combat: 0, famine: 0, natural: 0, other: 0, total: 0 }
    );
  }, [deathRows]);

  if (!isOpen) return null;

  const fmt = (n: number) => si(rn(n));

  return (
    <Dialog isOpen={isOpen} title="Population Overview" onClose={() => closeDialog("populationOverview")}>
      <div style={{ minWidth: "32em", maxWidth: "48em" }}>
        <p style={{ fontSize: "0.85em", opacity: 0.85, marginTop: 0 }}>
          Vital statistics a ruler might consult when setting policy — and a designer can use to judge which losses
          wars, famine, and demography actually inflict.
        </p>

        <div style={{ display: "flex", gap: "0.5em", marginBottom: "0.75em" }}>
          <button
            type="button"
            className={activeTab === "living" ? "buttonpressed" : undefined}
            onClick={() => setActiveTab("living")}
          >
            Living
          </button>
          <button
            type="button"
            className={activeTab === "deaths" ? "buttonpressed" : undefined}
            onClick={() => setActiveTab("deaths")}
          >
            Deaths
          </button>
        </div>

        {activeTab === "living" && (
          <div style={{ padding: "1.5em", opacity: 0.7, textAlign: "center" }}>
            Living population by state will appear here in a later pass.
          </div>
        )}

        {activeTab === "deaths" && (
          <>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.75em", marginBottom: "0.5em", flexWrap: "wrap" }}
            >
              <span style={{ fontSize: "0.9em" }}>Period:</span>
              {WINDOW_OPTIONS.map(opt => (
                <label key={opt.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.25em" }}>
                  <input
                    type="radio"
                    name="popDeathWindow"
                    checked={deathWindow === opt.id}
                    onChange={() => setDeathWindow(opt.id)}
                  />
                  {opt.label}
                </label>
              ))}
              <span style={{ fontSize: "0.8em", opacity: 0.7 }}>
                (last {deathWindowDays(deathWindow)} day{deathWindowDays(deathWindow) === 1 ? "" : "s"} of simulation
                time)
              </span>
            </div>

            <div style={{ maxHeight: "24em", overflow: "auto" }}>
              <table className="overviewDataTable" style={{ width: "100%", fontSize: "0.9em" }}>
                <thead>
                  <tr>
                    <SortableHeader
                      label="State"
                      field="name"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                    />
                    <SortableHeader
                      label="Combat"
                      field="combat"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                    />
                    <SortableHeader
                      label="Famine"
                      field="famine"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                    />
                    <SortableHeader
                      label="Natural"
                      field="natural"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                    />
                    <SortableHeader
                      label="Other"
                      field="other"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                    />
                    <SortableHeader
                      label="Total"
                      field="total"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                    />
                  </tr>
                </thead>
                <tbody>
                  {deathRows.map(r => (
                    <tr key={r.id}>
                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            width: "0.75em",
                            height: "0.75em",
                            background: r.color,
                            marginRight: "0.4em",
                            verticalAlign: "middle"
                          }}
                        />
                        {r.name}
                      </td>
                      <td className="total">{fmt(r.combat)}</td>
                      <td className="total">{fmt(r.famine)}</td>
                      <td className="total">{fmt(r.natural)}</td>
                      <td className="total">{fmt(r.other)}</td>
                      <td className="total">
                        <strong>{fmt(r.total)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td className="total">
                      <strong>{fmt(deathTotals.combat)}</strong>
                    </td>
                    <td className="total">
                      <strong>{fmt(deathTotals.famine)}</strong>
                    </td>
                    <td className="total">
                      <strong>{fmt(deathTotals.natural)}</strong>
                    </td>
                    <td className="total">
                      <strong>{fmt(deathTotals.other)}</strong>
                    </td>
                    <td className="total">
                      <strong>{fmt(deathTotals.total)}</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {deathRows.every(r => r.total === 0) && (
              <p style={{ fontSize: "0.85em", opacity: 0.75, marginTop: "0.75em" }}>
                No deaths recorded in this window yet. Advance time (day/week/month) with demographics or wars active to
                accumulate casualties.
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
};
