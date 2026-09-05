import type React from "react";
import { Fragment, useMemo, useState } from "react";
import { useStateEditorState } from "../../../../store/stateEditorState";
import { formatPrice, rn } from "../../../hostUtils";
import { type StateFiscalReport, useStateFiscalReportState } from "../../store/stateFiscalReportState";

type ReportPeriod = "quarter" | "year" | "both";

interface ReportGroup {
  key: string;
  label: string;
  reports: StateFiscalReport[];
  openingTreasury: number;
  closingTreasury: number;
  income: Record<string, number>;
  expenses: Record<string, number>;
}

const INCOME_LABELS: Readonly<Record<string, string>> = {
  salesTax: "Sales tax",
  // docs/plan/economy-coupling-audit.md L10: duty this state charged on goods imported from
  // another state's markets — distinct from salesTax above, which the *exporting* state keeps.
  importDuty: "Import duty",
  pollTax: "Poll tax",
  voyageIncome: "Voyage income",
  wartimeSubsidy: "Wartime subsidy",
  publicDebtIssued: "Public debt issued",
  foreignDebtIssued: "Foreign debt issued",
  departmentBalanceRemit: "Department balance remit (over cap)",
  unclassifiedIncome: "Other treasury movement"
};

const EXPENSE_LABELS: Readonly<Record<string, string>> = {
  // civilAdministration.ts: former single "Civil administration" total, split into 5 named
  // components (docs/plan/civil-administration-burg-state-split.md). Local-flavored ones already
  // net out whatever this state's own burgs absorbed — this is what state.treasury actually paid.
  courts: "Civil administration — courts",
  scribesNotaries: "Civil administration — scribes & notaries",
  taxFarmers: "Civil administration — tax farmers",
  messengers: "Civil administration — messengers & couriers",
  routineLocalAdministration: "Civil administration — routine local administration",
  councilClawback: "Council revenue refusal",
  taxFarmLeak: "Tax farming",
  publicDebtInterest: "Public debt interest",
  publicDebtRepaid: "Public debt repayment",
  foreignDebtInterest: "Foreign debt interest",
  householdTransfer: "Household purse transfer",
  marshalcyTransfer: "Marshalcy funding transfer",
  chanceryTransfer: "Chancery funding transfer",
  stewardshipTransfer: "Stewardship funding transfer",
  spymasteryTransfer: "Spymastery funding transfer",
  ecclesiasticaTransfer: "Ecclesiastica funding transfer",
  // docs/plan/economy-coupling-audit.md L8 stage 2 — roads, harbours and public granaries.
  publicWorksTransfer: "Public works funding transfer",
  militaryUpkeep: "Military upkeep from treasury",
  strategicProcurement: "Strategic procurement",
  titheTransfer: "Ecclesiastical tithe transfer",
  plunderTransfer: "Ruler plunder transfer",
  unclassified: "Other treasury movement"
};

function addAmounts(target: Record<string, number>, values: Readonly<Record<string, number>>): void {
  for (const [key, value] of Object.entries(values)) target[key] = (target[key] ?? 0) + value;
}

function groupReports(reports: readonly StateFiscalReport[], period: Exclude<ReportPeriod, "both">): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const report of reports) {
    const quarter = Math.floor((report.month - 1) / 3) + 1;
    const key = period === "quarter" ? `${report.year}-Q${quarter}` : `${report.year}`;
    const label = period === "quarter" ? `Year ${report.year}, Q${quarter}` : `Year ${report.year}`;
    const existing = groups.get(key);
    if (existing) {
      existing.reports.push(report);
      existing.closingTreasury = report.closingTreasury;
      addAmounts(existing.income, report.income);
      addAmounts(existing.expenses, report.expenses);
      continue;
    }
    groups.set(key, {
      key,
      label,
      reports: [report],
      openingTreasury: report.openingTreasury,
      closingTreasury: report.closingTreasury,
      income: { ...report.income },
      expenses: { ...report.expenses }
    });
  }
  return [...groups.values()].reverse();
}

function total(amounts: Readonly<Record<string, number>>): number {
  return Object.values(amounts).reduce((sum, value) => sum + value, 0);
}

const FiscalReportTable: React.FC<{ groups: readonly ReportGroup[]; title: string }> = ({ groups, title }) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(groups[0]?.key ?? null);

  return (
    <section aria-label={title}>
      <h4 style={{ margin: "0.6em 0 0.3em" }}>{title}</h4>
      <table className="fmg-table" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th>Period</th>
            <th>Opening</th>
            <th>Income</th>
            <th>Outflows</th>
            <th>Net</th>
            <th>Closing</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr>
              <td colSpan={6}>No completed fiscal settlements yet. Advance Time by at least one month.</td>
            </tr>
          ) : (
            groups.map(group => {
              const income = total(group.income);
              const expenses = total(group.expenses);
              const net = group.closingTreasury - group.openingTreasury;
              const expanded = expandedKey === group.key;
              return (
                <Fragment key={group.key}>
                  <tr>
                    <th scope="row">
                      <button
                        type="button"
                        className="icon-list"
                        onClick={() => setExpandedKey(expanded ? null : group.key)}
                      >
                        {group.label}
                      </button>
                    </th>
                    <td>{formatPrice(group.openingTreasury)}</td>
                    <td>{formatPrice(income)}</td>
                    <td>{formatPrice(expenses)}</td>
                    <td style={{ color: net < 0 ? "#b33" : net > 0 ? "#187a3d" : undefined }}>{formatPrice(net)}</td>
                    <td>{formatPrice(group.closingTreasury)}</td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={6}>
                        <div className="d-flex" style={{ gap: "2em", alignItems: "flex-start" }}>
                          <Breakdown title="Income" amounts={group.income} labels={INCOME_LABELS} />
                          <Breakdown title="Treasury outflows" amounts={group.expenses} labels={EXPENSE_LABELS} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </section>
  );
};

const Breakdown: React.FC<{
  title: string;
  amounts: Readonly<Record<string, number>>;
  labels: Readonly<Record<string, string>>;
}> = ({ title, amounts, labels }) => {
  const entries = Object.entries(amounts).filter(([, value]) => Math.abs(value) > 0.0001);
  return (
    <div>
      <strong>{title}</strong>
      {entries.length === 0 ? (
        <div>None</div>
      ) : (
        entries.map(([key, value]) => (
          <div key={key}>
            {labels[key] ?? key}: {formatPrice(rn(value, 2))}
          </div>
        ))
      )}
    </div>
  );
};

export const StateFiscalReportTab: React.FC = () => {
  const stateId = useStateEditorState(state => state.stateId);
  const reports = useStateFiscalReportState(state => state.reports);
  const [period, setPeriod] = useState<ReportPeriod>("quarter");
  const stateReports = useMemo(
    () => reports.filter(report => report.stateId === stateId).sort((a, b) => a.id - b.id),
    [reports, stateId]
  );
  const quarterly = useMemo(() => groupReports(stateReports, "quarter"), [stateReports]);
  const yearly = useMemo(() => groupReports(stateReports, "year"), [stateReports]);

  return (
    <div id="stateFiscalReport" style={{ overflow: "auto" }}>
      <p style={{ marginTop: 0 }}>
        Public treasury settlements only. Department and household transfers leave the public treasury even when they
        remain in another ledger.
      </p>
      <div className="tab-row d-flex" role="tablist" aria-label="Fiscal report period">
        {(["quarter", "year", "both"] as const).map(value => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={period === value}
            className={period === value ? "pressed" : ""}
            onClick={() => setPeriod(value)}
          >
            {value === "quarter" ? "Quarterly" : value === "year" ? "Annual" : "Both"}
          </button>
        ))}
      </div>
      {(period === "quarter" || period === "both") && <FiscalReportTable title="Quarterly report" groups={quarterly} />}
      {(period === "year" || period === "both") && <FiscalReportTable title="Annual report" groups={yearly} />}
    </div>
  );
};
