import type React from "react";
import { useMemo, useState } from "react";
import type { State } from "../../../hostTypes";
import { formatPrice, rn } from "../../../hostUtils";
import { getTradeSecurityLedgers, getWorldContext } from "../../economyContext";
import { TradeSecurity } from "../../generators/tradeSecurity";
import {
  clampDepartmentBudgetMultiplier,
  DEPARTMENT_BUDGET_MULTIPLIER_MAX,
  DEPARTMENT_BUDGET_MULTIPLIER_MIN,
  type NonMarshalcyDepartmentKey
} from "../../generators/treasuryAllocation";

/** PR-17f — maps each adjustable department to its council budget-cut line. */
const COUNCIL_CUT_LINE_BY_DEPARTMENT: Record<NonMarshalcyDepartmentKey, keyof NonNullable<State["councilApprovals"]>> =
  {
    chancery: "cutChancery",
    stewardship: "cutStewardship",
    spymastery: "cutSpymastery",
    ecclesiastica: "cutEcclesiastica"
  };

/**
 * PR-17c (docs/plan/department-budget-spending-effects.md §4) — one editable department-budget
 * multiplier cell. Below 100% is a deliberate cut: the freed share is not redistributed to other
 * departments (applyDepartmentBudgetOverride), so it stays in the treasury as real savings —
 * traded for a lower departmentServiceLevel (PR-17b) next cycle.
 *
 * PR-17f: a cut (below 100%) additionally needs its council budget line approved — an
 * unapproved cut is silently reverted to baseline inside applyDepartmentBudgetOverride() each
 * cycle, so this cell shows "(blocked)" rather than leaving that invisible to the player.
 */
const DepartmentBudgetCell: React.FC<{
  state: State;
  department: NonMarshalcyDepartmentKey;
  label: string;
  onChange: () => void;
}> = ({ state, department, label, onChange }) => {
  const current = state.departmentBudgetMultiplier?.[department] ?? 1;
  const isCut = current < 1;
  const cutLine = COUNCIL_CUT_LINE_BY_DEPARTMENT[department];
  // Undefined councilApprovals (no tax cycle run yet) is treated as permissive elsewhere
  // (isDepartmentCutApproved), so it is not flagged as blocked here either.
  const isBlocked = isCut && state.councilApprovals !== undefined && !state.councilApprovals[cutLine];
  return (
    <td>
      <input
        type="number"
        min={DEPARTMENT_BUDGET_MULTIPLIER_MIN * 100}
        max={DEPARTMENT_BUDGET_MULTIPLIER_MAX * 100}
        step="5"
        data-tip={
          isBlocked
            ? `${label} cut blocked — the assembly has not approved this cut. It stays at the baseline budget this cycle; edit the % and wait for support to shift, or try again next cycle.`
            : `${label} budget, as a % of this state's governance-form baseline. Below 100% frees that cash as real treasury savings instead of spending it — traded for a lower ${label.toLowerCase()} service level next cycle, and needs assembly approval to take effect.`
        }
        style={{ width: "4.5em", ...(isBlocked ? { borderColor: "#b33", color: "#b33" } : undefined) }}
        value={rn(current * 100, 0)}
        onChange={e => {
          const pct = Number(e.target.value);
          if (!Number.isFinite(pct)) return;
          state.departmentBudgetMultiplier = {
            ...state.departmentBudgetMultiplier,
            [department]: clampDepartmentBudgetMultiplier(pct / 100)
          };
          onChange();
        }}
      />{" "}
      %{isBlocked && <span style={{ color: "#b33" }}> (blocked)</span>}
    </td>
  );
};

export const StatesEditorTreasuryTab: React.FC = () => {
  const worldContext = getWorldContext();
  const pack = worldContext.pack;
  const states = pack.states.filter(s => s.i && !s.removed);
  const tradeSecurityLedgers = getTradeSecurityLedgers();

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
  const tradeSecurityByState = useMemo(
    () => new Map(tradeSecurityLedgers.map(ledger => [ledger.stateId, ledger])),
    [tradeSecurityLedgers]
  );

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
            <th data-tip="State-funded road and caravan security investment; paid monthly from the treasury">
              Trade Security
            </th>
            <th data-tip="Security upkeep paid during the current production month">Upkeep</th>
            <th data-tip="Caravans lost while travelling to this state during the current production month">Lost</th>
            <th data-tip="Chancery (diplomacy/law) budget as a % of baseline — a deliberate cut lever, not redistributed elsewhere">
              Chancery
            </th>
            <th data-tip="Stewardship (administration/tax collection) budget as a % of baseline — a deliberate cut lever, not redistributed elsewhere">
              Stewardship
            </th>
            <th data-tip="Spymastery (intelligence) budget as a % of baseline — a deliberate cut lever, not redistributed elsewhere">
              Spymastery
            </th>
            <th data-tip="Ecclesiastica (religious patronage) budget as a % of baseline — a deliberate cut lever, not redistributed elsewhere">
              Ecclesiastica
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedStates.length === 0 ? (
            <tr>
              <td colSpan={13}>No states found</td>
            </tr>
          ) : (
            sortedStates.map(s => {
              const tradeSecurity = tradeSecurityByState.get(s.i);
              return (
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
                  <td>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      data-tip="Investment reduces caravan bandit risk. Its configured level stays in place when the treasury cannot fully fund it."
                      style={{ width: "4.5em" }}
                      value={rn((tradeSecurity?.investmentLevel ?? 0) * 100, 1)}
                      onChange={e => {
                        const ledger = TradeSecurity.getLedger(s.i);
                        if (!ledger) return;
                        ledger.investmentLevel = Math.max(0, Math.min(1, Number(e.target.value) / 100));
                        rerender();
                      }}
                    />{" "}
                    %
                  </td>
                  <td>{formatPrice(tradeSecurity?.monthlyUpkeepPaid ?? 0)}</td>
                  <td>{tradeSecurity?.lastCaravansLost ?? 0}</td>
                  <DepartmentBudgetCell state={s} department="chancery" label="Chancery" onChange={rerender} />
                  <DepartmentBudgetCell state={s} department="stewardship" label="Stewardship" onChange={rerender} />
                  <DepartmentBudgetCell state={s} department="spymastery" label="Spymastery" onChange={rerender} />
                  <DepartmentBudgetCell
                    state={s}
                    department="ecclesiastica"
                    label="Ecclesiastica"
                    onChange={rerender}
                  />
                </tr>
              );
            })
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
