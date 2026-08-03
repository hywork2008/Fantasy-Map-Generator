import React from "react";

import {
  closeDialog,
  Dialog,
  SortableHeader,
  TableDialogLayout,
  useDialogState,
  VirtualTableBody
} from "../../../hostUi";

import { open as openTreasuryOverview, refreshTreasuryOverview } from "../../controllers/treasury-overview";
import { type TreasuryOverviewRow, useTreasuryOverviewState } from "../../store/treasuryOverviewState";

type SortField = keyof Omit<TreasuryOverviewRow, "id">;

export const TreasuryOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("treasuryOverview"));
  const rawRows = useTreasuryOverviewState(state => state.rows);

  const parentRef = React.useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = React.useState<SortField>("publicTreasury");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");

  const toggleSortBy = (field: string) => {
    if (field === sortBy) {
      setSortOrder(order => (order === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field as SortField);
      setSortOrder("desc");
    }
  };

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openTreasuryOverview(), 0);
  }, [isOpen]);

  const rows = React.useMemo(() => {
    return [...rawRows].sort((a, b) => {
      const valA = a[sortBy];
      const valB = b[sortBy];
      const cmp =
        typeof valA === "string"
          ? valA.localeCompare(valB as string)
          : typeof valA === "boolean"
            ? Number(valA) - Number(valB)
            : (valA as number) - (valB as number);
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [rawRows, sortBy, sortOrder]);

  const totalPublic = rows.reduce((sum, row) => sum + row.publicTreasury, 0);
  const totalHouseholdPurse = rows.reduce((sum, row) => sum + row.householdPurse, 0);
  const totalDeptBalances = rows.reduce((sum, row) => sum + row.departmentBalancesStock, 0);
  const totalPersonal = rows.reduce((sum, row) => sum + row.rulerPersonal, 0);

  return (
    <Dialog
      isOpen={isOpen}
      title="Treasury Overview"
      onClose={() => closeDialog("treasuryOverview")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout
        bodyRef={parentRef}
        summary={
          <div className="totalLine">
            <div data-tip="Multi-ledger: Public (L2), Household purse (L1), Department balances (L3a), Ruler personal (L0).">
              Ledgers: Public (L2) <span id="treasuryOverviewTotalPublic">{totalPublic.toFixed(1)}</span>
              {" · "}
              Household (L1) <span id="treasuryOverviewTotalHouseholdPurse">{totalHouseholdPurse.toFixed(1)}</span>
              {" · "}
              Depts stock (L3a) <span id="treasuryOverviewTotalDeptBalances">{totalDeptBalances.toFixed(1)}</span>
              {" · "}
              Rulers L0 <span id="treasuryOverviewTotalPersonal">{totalPersonal.toFixed(1)}</span>
            </div>
            <div className="dim" style={{ fontSize: "0.9em", marginTop: "0.25em" }}>
              Personal cash is pocket money. Named department columns are this-cycle nominal intent;{" "}
              <strong>Depts bal</strong> is real L3a spendable stock (office stipends already drawn).
            </div>
          </div>
        }
        footer={
          <button
            type="button"
            id="treasuryOverviewRefresh"
            data-tip="Refresh the Treasury Overview"
            className="icon-cw"
            onClick={refreshTreasuryOverview}
          />
        }
      >
        <table className="fmg-table">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead className="header">
            <tr>
              <SortableHeader
                field="stateName"
                label="State"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip="State name"
              />
              <SortableHeader
                field="form"
                label="Form"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip="Governance form — determines the baseline department allocation table"
              />
              <SortableHeader
                field="publicTreasury"
                label="Public"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="L2 public treasury stock (state.treasury). Institutional cash for war and common government — not the ruler's personal purse"
              />
              <SortableHeader
                field="householdPurse"
                label="HH purse"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="L1 crown household purse (state.householdPurse) — court/institutional household cash. Credited each cycle from the form's household budget share"
              />
              <SortableHeader
                field="rulerPersonal"
                label="Ruler L0"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Living ruler's Character.wealth (personal pocket money). Paid from the household purse, capped — often much smaller than Public + HH purse"
              />
              <SortableHeader
                field="domesticIncome"
                label="Income"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="This cycle's domestic income the departments below are allocated from (poll tax + voyage income)"
              />
              <SortableHeader
                field="household"
                label="HH paid"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Personal household stipend paid this cycle from L1 household purse into the ruler's L0 wealth"
              />
              <SortableHeader
                field="officeStipendsPaid"
                label="Stipends"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Sum actually paid to central office holders this cycle (real deduction from public treasury)"
              />
              <SortableHeader
                field="departmentBalancesStock"
                label="Depts bal"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="L3a real departmentBalances stock (sum). Credited from this cycle's dept shares; vacant offices leave cash parked here"
              />
              <SortableHeader
                field="nominalDepartments"
                label="Depts Σ"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Sum of nominal non-household department budgets this cycle (intent, not stock)"
              />
              <SortableHeader
                field="marshalcy"
                label="Marshalcy"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Nominal military department Budget — office stipend is in Stipends; military upkeep Need is separate"
              />
              <SortableHeader
                field="militaryFundingRatio"
                label="Funding"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Marshalcy Budget ÷ Need — below ~0.5 accrues discontent quickly, at/above 0.8 is well-funded"
              />
              <SortableHeader
                field="militaryDiscontent"
                label="Discontent"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Accumulates while underfunded, decays while well-funded (0-200)"
              />
              <SortableHeader
                field="warFooting"
                label="War"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip="War footing policy (PR-6) — reweights department shares toward marshalcy when ON"
              />
              <SortableHeader
                field="militaryMobilizationBoost"
                label="Mob+"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Troop-target uplift while war footing is on and marshalcy Budget exceeds Need (case β)"
              />
              <SortableHeader
                field="publicDebt"
                label="Debt"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Public debt principal (PR-7) — funded by the credit pool (PR-9); interest returns to moneylenders"
              />
              <SortableHeader
                field="creditPoolBalance"
                label="Credit"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Credit pool (PR-9) — funds debt issues; interest/repay/tax-farm feed it; PR-10 named syndicate skims a personal share"
              />
              <SortableHeader
                field="primaryMoneylenderName"
                label="Banker"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip="Primary named moneylender (capital market manager or top rival) — PR-10"
              />
              <SortableHeader
                field="debtInterestRate"
                label="Rate"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Effective monthly interest on public debt (form × greed × assembly support × negotiation) — PR-10/11"
              />
              <SortableHeader
                field="debtInDefault"
                label="Default"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip="PR-11: missed interest streak — new borrowing frozen"
              />
              <SortableHeader
                field="debtCoupRisk"
                label="Coup"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip="PR-12: high military discontent while in default — merchant mutiny / coup risk"
              />
              <SortableHeader
                field="councilSupport"
                label="Council"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Assembly support 0–100 (PR-8) — scales wartime veto chance and gates voluntary debt"
              />
              <SortableHeader
                field="councilLastDebtVoteYes"
                label="Vote"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="PR-12 last debt-issue faction vote yes share"
              />
              <SortableHeader
                field="lastTaxFarmLeak"
                label="Farm"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Last-cycle tax-farm leak from L2 (PR-7/8)"
              />
              <SortableHeader
                field="domainPollTaxMultiplier"
                label="Poll×"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="PR-12 domain levy → poll-tax collection multiplier"
              />
              <SortableHeader
                field="chancery"
                label="Chancery"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Nominal department Budget this cycle"
              />
              <SortableHeader
                field="stewardship"
                label="Stewardship"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Nominal department Budget this cycle"
              />
              <SortableHeader
                field="spymastery"
                label="Spymastery"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Nominal department Budget this cycle"
              />
              <SortableHeader
                field="ecclesiastica"
                label="Ecclesiastica"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Nominal department Budget this cycle"
              />
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={29}>
                  <span>No state has an allocated treasury yet — run a generation cycle first</span>
                </td>
              </tr>
            </tbody>
          ) : (
            <VirtualTableBody
              items={rows}
              scrollElementRef={parentRef}
              renderRow={(row: TreasuryOverviewRow) => <TreasuryRow key={row.id} row={row} />}
            />
          )}
        </table>
      </TableDialogLayout>
    </Dialog>
  );
};

const TreasuryRow: React.FC<{ row: TreasuryOverviewRow }> = ({ row }) => (
  <tr className="states" data-id={row.id} data-state={row.stateName}>
    <td data-tip={row.stateName}>{row.stateName}</td>
    <td>{row.form}</td>
    <td data-tip="Public treasury (L2)">{row.publicTreasury.toFixed(2)}</td>
    <td data-tip="Household purse (L1)">{row.householdPurse.toFixed(2)}</td>
    <td data-tip="Ruler personal wealth (L0)">{row.rulerPersonal.toFixed(2)}</td>
    <td>{row.domesticIncome.toFixed(2)}</td>
    <td data-tip="Household stipend paid this cycle (L1→L0)">{row.household.toFixed(2)}</td>
    <td>{row.officeStipendsPaid.toFixed(2)}</td>
    <td data-tip="L3a department balances stock">{row.departmentBalancesStock.toFixed(2)}</td>
    <td data-tip="Nominal department budgets sum this cycle">{row.nominalDepartments.toFixed(2)}</td>
    <td>{row.marshalcy.toFixed(2)}</td>
    <td>{row.militaryFundingRatio.toFixed(2)}</td>
    <td>{row.militaryDiscontent.toFixed(1)}</td>
    <td data-tip={row.warFooting ? "War footing ON" : "War footing off"}>{row.warFooting ? "ON" : "—"}</td>
    <td>{row.militaryMobilizationBoost > 0 ? row.militaryMobilizationBoost.toFixed(3) : "—"}</td>
    <td data-tip="Public debt principal">{row.publicDebt > 0 ? row.publicDebt.toFixed(2) : "—"}</td>
    <td data-tip="Credit pool (moneylenders)">{row.creditPoolBalance > 0 ? row.creditPoolBalance.toFixed(2) : "—"}</td>
    <td data-tip="Primary moneylender">{row.primaryMoneylenderName || "—"}</td>
    <td data-tip="Debt interest rate">
      {row.debtInterestRate > 0 ? `${(row.debtInterestRate * 100).toFixed(2)}%` : "—"}
    </td>
    <td data-tip={row.debtInDefault ? "In default" : "Current"}>{row.debtInDefault ? "YES" : "—"}</td>
    <td data-tip={row.debtCoupRisk ? "Coup risk" : "No coup risk"}>{row.debtCoupRisk ? "YES" : "—"}</td>
    <td data-tip="Assembly support">{row.councilSupport > 0 ? row.councilSupport.toFixed(0) : "—"}</td>
    <td data-tip="Debt-issue vote yes">
      {row.councilLastDebtVoteYes > 0 ? `${(row.councilLastDebtVoteYes * 100).toFixed(0)}%` : "—"}
    </td>
    <td data-tip="Last tax-farm leak">{row.lastTaxFarmLeak > 0 ? row.lastTaxFarmLeak.toFixed(2) : "—"}</td>
    <td data-tip="Domain poll mult">
      {row.domainPollTaxMultiplier !== 1 ? `×${row.domainPollTaxMultiplier.toFixed(2)}` : "—"}
    </td>
    <td>{row.chancery.toFixed(2)}</td>
    <td>{row.stewardship.toFixed(2)}</td>
    <td>{row.spymastery.toFixed(2)}</td>
    <td>{row.ecclesiastica.toFixed(2)}</td>
  </tr>
);
