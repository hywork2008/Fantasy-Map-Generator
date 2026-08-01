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
  const [sortBy, setSortBy] = React.useState<SortField>("marshalcy");
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

  const totalMarshalcy = rows.reduce((sum, row) => sum + row.marshalcy, 0);

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
          <div data-tip="Sum of every listed state's Marshalcy (military) budget this cycle" className="totalLine">
            Total Marshalcy budget: <span id="treasuryOverviewTotal">{totalMarshalcy.toFixed(1)}</span>
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
                label="Household"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Ruler's household stipend — a real deduction paid into the ruler's Character.wealth"
              />
              <SortableHeader
                field="officeStipendsPaid"
                label="Stipends"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Sum actually paid to the state's 5 central office holders (Chancellor/Marshal/Steward/Spymaster/Court Chaplain) this cycle — a real deduction; 0 for any currently-vacant office"
              />
              <SortableHeader
                field="marshalcy"
                label="Marshalcy"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Nominal military department Budget — the Marshal's actual stipend is included in Stipends, not deducted again here; the existing military upkeep charge (Need) is unchanged"
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
                tip="Accumulates while underfunded, decays while well-funded (0-200); crossing 100 fires an event with no consequence wired yet"
              />
              <SortableHeader
                field="chancery"
                label="Chancery"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Nominal department Budget — the office holder's actual stipend is included in Stipends, not deducted again here"
              />
              <SortableHeader
                field="stewardship"
                label="Stewardship"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Nominal department Budget — the office holder's actual stipend is included in Stipends, not deducted again here"
              />
              <SortableHeader
                field="spymastery"
                label="Spymastery"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Nominal department Budget — the office holder's actual stipend is included in Stipends, not deducted again here"
              />
              <SortableHeader
                field="ecclesiastica"
                label="Ecclesiastica"
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip="Nominal department Budget — the office holder's actual stipend is included in Stipends, not deducted again here"
              />
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={12}>
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
    <td>{row.domesticIncome.toFixed(2)}</td>
    <td>{row.household.toFixed(2)}</td>
    <td>{row.officeStipendsPaid.toFixed(2)}</td>
    <td>{row.marshalcy.toFixed(2)}</td>
    <td>{row.militaryFundingRatio.toFixed(2)}</td>
    <td>{row.militaryDiscontent.toFixed(1)}</td>
    <td>{row.chancery.toFixed(2)}</td>
    <td>{row.stewardship.toFixed(2)}</td>
    <td>{row.spymastery.toFixed(2)}</td>
    <td>{row.ecclesiastica.toFixed(2)}</td>
  </tr>
);
