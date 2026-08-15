import type React from "react";
import { useEffect, useMemo } from "react";
import { Trans, useTranslation } from "react-i18next";
import { worldContext } from "../../context/worldContext";
import { type DeathWindow, deathWindowDays, getDeathsByState } from "../../generators/populationLossTracker";
import { collectLivingStatsByState } from "../../generators/populationOverviewStats";
import { collectSettlementOverviewStats } from "../../generators/settlementOverviewStats";
import { useDialogState } from "../../store/dialogState";
import { usePopulationOverviewState } from "../../store/populationOverviewState";
import { rn, si } from "../../utils";
import { SortableHeader } from "../components/tables/SortableHeader";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";
import { TableDialogLayout } from "./TableDialogLayout";

const WINDOW_OPTIONS: { id: DeathWindow }[] = [{ id: "day" }, { id: "week" }, { id: "month" }];

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
  const { t } = useTranslation();
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

  const settlementTotals = useMemo(() => {
    void refreshCounter;
    if (!isOpen || activeTab !== "living" || !worldContext.pack?.cells) {
      return { unclaimedCapacity: 0, unsettledCapacity: 0, governedPopulation: 0 };
    }
    return collectSettlementOverviewStats(worldContext.pack, worldContext.populationRate, worldContext.urbanization);
  }, [activeTab, isOpen, refreshCounter]);

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
    <Dialog
      isOpen={isOpen}
      title={t("dialogs.titles.populationOverview")}
      onClose={() => closeDialog("populationOverview")}
      className="fmg-dialog--table population-overview-dialog"
    >
      <TableDialogLayout
        header={
          <>
            <p className="population-overview-dialog__description">
              <Trans i18nKey="dialogs.population.description" />
            </p>
            <div className="population-overview-dialog__tabs">
              <button
                type="button"
                className={activeTab === "living" ? "buttonpressed" : undefined}
                onClick={() => setActiveTab("living")}
              >
                {t("dialogs.population.living")}
              </button>
              <button
                type="button"
                className={activeTab === "deaths" ? "buttonpressed" : undefined}
                onClick={() => setActiveTab("deaths")}
              >
                {t("dialogs.population.deaths")}
              </button>
            </div>
          </>
        }
        controls={
          activeTab === "deaths" ? (
            <div className="population-overview-dialog__period-controls">
              <span>{t("dialogs.population.period")}</span>
              {WINDOW_OPTIONS.map(opt => (
                <label key={opt.id}>
                  <input
                    type="radio"
                    name="popDeathWindow"
                    checked={deathWindow === opt.id}
                    onChange={() => setDeathWindow(opt.id)}
                  />
                  {t(`dialogs.population.${opt.id}`)}
                </label>
              ))}
              <span className="population-overview-dialog__period-note">
                {t("dialogs.population.periodNote", {
                  count: deathWindowDays(deathWindow),
                  days: deathWindowDays(deathWindow)
                })}
              </span>
            </div>
          ) : undefined
        }
        summary={
          activeTab === "living" ? (
            <div className="population-overview-dialog__summary">
              <strong>{t("common.total")}</strong>
              <span>
                {t("dialogs.population.rural")}: {fmt(livingTotals.rural)}
              </span>
              <span>
                {t("dialogs.population.urban")}: {fmt(livingTotals.urban)}
              </span>
              <span>
                {t("dialogs.population.underArms")}: {fmt(livingTotals.underArms)}
              </span>
              <span>
                {t("dialogs.population.population")}: {fmt(livingTotals.total)}
              </span>
              <span>
                {t("dialogs.population.governed")}: {fmt(settlementTotals.governedPopulation)}
              </span>
              <span>
                {t("dialogs.population.unclaimed")}: {fmt(settlementTotals.unclaimedCapacity)}
              </span>
              <span>
                {t("dialogs.population.unsettled")}: {fmt(settlementTotals.unsettledCapacity)}
              </span>
              <span>
                {t("dialogs.population.mobilization")}: {fmtPct(worldMobilizationPct)}
              </span>
              <span>
                {t("dialogs.population.adultMale")}: {fmtPct(worldAdultMalePct)}
              </span>
            </div>
          ) : (
            <div className="population-overview-dialog__summary">
              <strong>{t("common.total")}</strong>
              <span>
                {t("dialogs.population.combat")}: {fmt(deathTotals.combat)}
              </span>
              <span>
                {t("dialogs.population.famine")}: {fmt(deathTotals.famine)}
              </span>
              <span>
                {t("dialogs.population.natural")}: {fmt(deathTotals.natural)}
              </span>
              <span>
                {t("dialogs.population.other")}: {fmt(deathTotals.other)}
              </span>
              <span>
                {t("dialogs.population.deathsTotal")}: {fmt(deathTotals.total)}
              </span>
            </div>
          )
        }
      >
        {activeTab === "living" && (
          <>
            <table className="fmg-table overviewDataTable population-overview-dialog__table">
              <thead>
                <tr>
                  <SortableHeader
                    label={t("dialogs.population.state")}
                    field="name"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                  />
                  <SortableHeader
                    label={t("dialogs.population.rural")}
                    field="rural"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                    tip={t("dialogs.population.ruralTip")}
                  />
                  <SortableHeader
                    label={t("dialogs.population.urban")}
                    field="urban"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                    tip={t("dialogs.population.urbanTip")}
                  />
                  <SortableHeader
                    label={t("dialogs.population.underArms")}
                    field="underArms"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                    tip={t("dialogs.population.underArmsTip")}
                  />
                  <SortableHeader
                    label={t("common.total")}
                    field="total"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                    tip={t("dialogs.population.populationTip")}
                  />
                  <SortableHeader
                    label={t("dialogs.population.children")}
                    field="children"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                  />
                  <SortableHeader
                    label={t("dialogs.population.maleAdults")}
                    field="civilianMale"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                    tip={t("dialogs.population.maleAdultsTip")}
                  />
                  <SortableHeader
                    label={t("dialogs.population.femaleAdults")}
                    field="civilianFemale"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                  />
                  <SortableHeader
                    label={t("dialogs.population.elders")}
                    field="elders"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                  />
                  <SortableHeader
                    label={t("dialogs.population.mobilPct")}
                    field="mobilizationPct"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                    tip={t("dialogs.population.mobilPctTip")}
                  />
                  <SortableHeader
                    label={t("dialogs.population.malePct")}
                    field="adultMalePct"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                    tip={t("dialogs.population.malePctTip")}
                  />
                  <SortableHeader
                    label={t("dialogs.population.supply")}
                    field="supplyStrain"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                    tip={t("dialogs.population.supplyTip")}
                  />
                  <SortableHeader
                    label={t("dialogs.population.draft")}
                    field="draftEfficiency"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                    tip={t("dialogs.population.draftTip")}
                  />
                  <SortableHeader
                    label={t("dialogs.population.quality")}
                    field="meanQuality"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                    tip={t("dialogs.population.qualityTip")}
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
                    <td className="total numeric">{fmt(r.rural)}</td>
                    <td className="total numeric">{fmt(r.urban)}</td>
                    <td className="total numeric">{fmt(r.underArms)}</td>
                    <td className="total numeric">
                      <strong>{fmt(r.total)}</strong>
                    </td>
                    <td className="total numeric">{fmt(r.children)}</td>
                    <td className="total numeric">{fmt(r.civilianMale)}</td>
                    <td className="total numeric">{fmt(r.civilianFemale)}</td>
                    <td className="total numeric">{fmt(r.elders)}</td>
                    <td className="total numeric">{fmtPct(r.mobilizationPct)}</td>
                    <td className="total numeric">{fmtPct(r.adultMalePct)}</td>
                    <td className="total numeric">{rn(r.supplyStrain, 2)}</td>
                    <td className="total numeric">{fmtPct(r.draftEfficiency * 100)}</td>
                    <td className="total numeric">{rn(r.meanQuality, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {livingRows.length === 0 && (
              <p style={{ fontSize: "0.85em", opacity: 0.75, marginTop: "0.75em" }}>{t("dialogs.population.empty")}</p>
            )}
          </>
        )}

        {activeTab === "deaths" && (
          <>
            <table className="fmg-table overviewDataTable population-overview-dialog__table">
              <thead>
                <tr>
                  <SortableHeader
                    label={t("dialogs.population.state")}
                    field="name"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                  />
                  <SortableHeader
                    label={t("dialogs.population.combat")}
                    field="combat"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                  />
                  <SortableHeader
                    label={t("dialogs.population.famine")}
                    field="famine"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                  />
                  <SortableHeader
                    label={t("dialogs.population.natural")}
                    field="natural"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                  />
                  <SortableHeader
                    label={t("dialogs.population.other")}
                    field="other"
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={toggleSortBy}
                    numeric
                  />
                  <SortableHeader
                    label={t("common.total")}
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
                    <td className="total numeric">{fmt(r.combat)}</td>
                    <td className="total numeric">{fmt(r.famine)}</td>
                    <td className="total numeric">{fmt(r.natural)}</td>
                    <td className="total numeric">{fmt(r.other)}</td>
                    <td className="total numeric">
                      <strong>{fmt(r.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {deathRows.every(r => r.total === 0) && (
              <p style={{ fontSize: "0.85em", opacity: 0.75, marginTop: "0.75em" }}>
                No deaths recorded in this window yet. Advance time (day/week/month) with demographics or wars active to
                accumulate casualties.
              </p>
            )}
          </>
        )}
      </TableDialogLayout>
    </Dialog>
  );
};
