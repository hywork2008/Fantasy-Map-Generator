import type React from "react";
import { useEffect, useMemo } from "react";
import { worldContext } from "../../context/worldContext";
import { type DeathWindow, deathWindowDays, getDeathsByState } from "../../generators/populationLossTracker";
import { collectLivingStatsByState } from "../../generators/populationOverviewStats";
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

function sortRows<T extends object>(rows: T[], sortBy: string, sortOrder: "asc" | "desc"): T[] {
  return [...rows].sort((a, b) => {
    const valA = (a as Record<string, unknown>)[sortBy];
    const valB = (b as Record<string, unknown>)[sortBy];
    if (typeof valA === "string" && typeof valB === "string") {
      return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    const nA = Number(valA) || 0;
    const nB = Number(valB) || 0;
    return sortOrder === "asc" ? nA - nB : nB - nA;
  });
}

/**
 * Ruler-facing vital statistics (living / dead tallies) so players — and designers —
 * can see how wars, famine, and demography shape each state.
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

  const livingRows = useMemo(() => {
    void refreshCounter;
    if (!isOpen || activeTab !== "living") return [];
    const pack = worldContext.pack;
    if (!pack?.states) return [];
    const rows = collectLivingStatsByState(pack, worldContext.populationRate, worldContext.urbanization);
    return sortRows(rows, sortBy, sortOrder);
  }, [isOpen, activeTab, sortBy, sortOrder, refreshCounter]);

  const livingTotals = useMemo(() => {
    return livingRows.reduce(
      (acc, r) => {
        acc.rural += r.rural;
        acc.urban += r.urban;
        acc.underArms += r.underArms;
        acc.total += r.total;
        acc.children += r.children;
        acc.civilianMale += r.civilianMale;
        acc.civilianFemale += r.civilianFemale;
        acc.elders += r.elders;
        return acc;
      },
      {
        rural: 0,
        urban: 0,
        underArms: 0,
        total: 0,
        children: 0,
        civilianMale: 0,
        civilianFemale: 0,
        elders: 0
      }
    );
  }, [livingRows]);

  const deathRows = useMemo(() => {
    void refreshCounter;
    if (!isOpen || activeTab !== "deaths") return [];

    const deaths = getDeathsByState(deathWindow);
    const states = worldContext.pack?.states ?? [];

    const rows = states
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

    return sortRows(rows, sortBy, sortOrder);
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
  const fmtPct = (n: number) => `${rn(n, 2)}%`;

  const worldAdultMalePct =
    livingTotals.civilianMale + livingTotals.underArms + livingTotals.civilianFemale > 0
      ? ((livingTotals.civilianMale + livingTotals.underArms) /
          (livingTotals.civilianMale + livingTotals.underArms + livingTotals.civilianFemale)) *
        100
      : 0;
  const worldMobilizationPct = livingTotals.total > 0 ? (livingTotals.underArms / livingTotals.total) * 100 : 0;

  return (
    <Dialog isOpen={isOpen} title="Population Overview" onClose={() => closeDialog("populationOverview")}>
      <div style={{ minWidth: "36em", maxWidth: "56em" }}>
        <p style={{ fontSize: "0.85em", opacity: 0.85, marginTop: 0 }}>
          Vital statistics a ruler might consult when setting policy — and a designer can use to judge which losses
          wars, famine, and demography actually inflict. Under arms are living men already drawn from the civilian male
          pool when the manpower ledger is on. Combat deaths also feed the <strong>Combat Deaths</strong> map layer
          (battlefield heatmap); its time window matches the Deaths tab selector below.
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
          <>
            <div style={{ maxHeight: "26em", overflow: "auto" }}>
              <table className="overviewDataTable" style={{ width: "100%", fontSize: "0.85em" }}>
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
                      label="Rural"
                      field="rural"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Rural civilian population (display people)"
                    />
                    <SortableHeader
                      label="Urban"
                      field="urban"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Urban civilian population (display people)"
                    />
                    <SortableHeader
                      label="Under arms"
                      field="underArms"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Land regiment headcount currently under arms"
                    />
                    <SortableHeader
                      label="Total"
                      field="total"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Rural + urban civilians + under arms"
                    />
                    <SortableHeader
                      label="Children"
                      field="children"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                    />
                    <SortableHeader
                      label="♂ Adults"
                      field="civilianMale"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Civilian adult males (not currently under arms)"
                    />
                    <SortableHeader
                      label="♀ Adults"
                      field="civilianFemale"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                    />
                    <SortableHeader
                      label="Elders"
                      field="elders"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                    />
                    <SortableHeader
                      label="Mobil.%"
                      field="mobilizationPct"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Under arms / total living × 100"
                    />
                    <SortableHeader
                      label="♂% adults"
                      field="adultMalePct"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Adult male share including under arms (low ≈ widow skew)"
                    />
                    <SortableHeader
                      label="Food"
                      field="foodStress"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Agricultural food stress 0–1.5 from spring/autumn war disruption"
                    />
                    <SortableHeader
                      label="Supply"
                      field="supplyStrain"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="0–1 wartime supply strain (Economy warIntensity when enabled)"
                    />
                    <SortableHeader
                      label="Draft%"
                      field="draftEfficiency"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="How well the state can equip/feed new levies (food + supply)"
                    />
                    <SortableHeader
                      label="Qual"
                      field="meanQuality"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Mean land regiment quality (1=veteran, green recruits lower this)"
                    />
                  </tr>
                </thead>
                <tbody>
                  {livingRows.map(r => (
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
                      <td className="total">{fmt(r.rural)}</td>
                      <td className="total">{fmt(r.urban)}</td>
                      <td className="total">{fmt(r.underArms)}</td>
                      <td className="total">
                        <strong>{fmt(r.total)}</strong>
                      </td>
                      <td className="total">{fmt(r.children)}</td>
                      <td className="total">{fmt(r.civilianMale)}</td>
                      <td className="total">{fmt(r.civilianFemale)}</td>
                      <td className="total">{fmt(r.elders)}</td>
                      <td className="total">{fmtPct(r.mobilizationPct)}</td>
                      <td className="total">{fmtPct(r.adultMalePct)}</td>
                      <td className="total">{rn(r.foodStress, 2)}</td>
                      <td className="total">{rn(r.supplyStrain, 2)}</td>
                      <td className="total">{fmtPct(r.draftEfficiency * 100)}</td>
                      <td className="total">{rn(r.meanQuality, 2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>
                      <strong>Total</strong>
                    </td>
                    <td className="total">
                      <strong>{fmt(livingTotals.rural)}</strong>
                    </td>
                    <td className="total">
                      <strong>{fmt(livingTotals.urban)}</strong>
                    </td>
                    <td className="total">
                      <strong>{fmt(livingTotals.underArms)}</strong>
                    </td>
                    <td className="total">
                      <strong>{fmt(livingTotals.total)}</strong>
                    </td>
                    <td className="total">
                      <strong>{fmt(livingTotals.children)}</strong>
                    </td>
                    <td className="total">
                      <strong>{fmt(livingTotals.civilianMale)}</strong>
                    </td>
                    <td className="total">
                      <strong>{fmt(livingTotals.civilianFemale)}</strong>
                    </td>
                    <td className="total">
                      <strong>{fmt(livingTotals.elders)}</strong>
                    </td>
                    <td className="total">
                      <strong>{fmtPct(worldMobilizationPct)}</strong>
                    </td>
                    <td className="total">
                      <strong>{fmtPct(worldAdultMalePct)}</strong>
                    </td>
                    <td className="total">—</td>
                    <td className="total">—</td>
                    <td className="total">—</td>
                    <td className="total">—</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {livingRows.length === 0 && (
              <p style={{ fontSize: "0.85em", opacity: 0.75, marginTop: "0.75em" }}>
                No states to show. Generate a map first.
              </p>
            )}
          </>
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
