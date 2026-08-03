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
      const cmp = typeof valA === "string" ? valA.localeCompare(valB as string) : (valA as number) - (valB as number);
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [rawRows, sortBy, sortOrder]);

  const totalPublic = rows.reduce((sum, row) => sum + row.publicTreasury, 0);
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
            <div data-tip="Multi-ledger PR-1: Public is state.treasury (institutional). Ruler personal is Character.wealth only — not the same purse. Household purse and real department balances are not implemented yet.">
              Ledgers: Public (L2) total <span id="treasuryOverviewTotalPublic">{totalPublic.toFixed(1)}</span>
              {" · "}
              Rulers&apos; personal (L0) total{" "}
              <span id="treasuryOverviewTotalPersonal">{totalPersonal.toFixed(1)}</span>
            </div>
            <div className="dim" style={{ fontSize: "0.9em", marginTop: "0.25em" }}>
              Personal cash is pocket money. Governance capacity is the public treasury (and, later, household /
              department purses). Department columns below are nominal allocation this cycle, not spendable department
              balances yet.
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
                field="rulerPersonal"
                label="Ruler L0"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Living ruler's Character.wealth (personal pocket money). Often much smaller than Public; that is intentional"
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
                tip="Household stipend paid this cycle into the ruler's personal wealth (L0) — not a separate household purse yet (PR-2)"
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
                field="nominalDepartments"
                label="Depts Σ"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Sum of nominal non-household department budgets this cycle. Not real department balances until PR-3"
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
                <td colSpan={15}>
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
    <td data-tip="Ruler personal wealth (L0)">{row.rulerPersonal.toFixed(2)}</td>
    <td>{row.domesticIncome.toFixed(2)}</td>
    <td data-tip="Household stipend paid this cycle (to L0)">{row.household.toFixed(2)}</td>
    <td>{row.officeStipendsPaid.toFixed(2)}</td>
    <td data-tip="Nominal department budgets sum (not real balances yet)">{row.nominalDepartments.toFixed(2)}</td>
    <td>{row.marshalcy.toFixed(2)}</td>
    <td>{row.militaryFundingRatio.toFixed(2)}</td>
    <td>{row.militaryDiscontent.toFixed(1)}</td>
    <td>{row.chancery.toFixed(2)}</td>
    <td>{row.stewardship.toFixed(2)}</td>
    <td>{row.spymastery.toFixed(2)}</td>
    <td>{row.ecclesiastica.toFixed(2)}</td>
  </tr>
);
