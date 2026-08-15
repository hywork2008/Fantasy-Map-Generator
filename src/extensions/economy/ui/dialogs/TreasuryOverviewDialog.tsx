import React from "react";
import { Trans, useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
      title={t("extensions.titles.treasuryOverview")}
      onClose={() => closeDialog("treasuryOverview")}
      className="fmg-dialog--table"
    >
      <TableDialogLayout
        bodyRef={parentRef}
        summary={
          <div className="totalLine">
            <div data-tip={t("extensions.treasuryOverview.ledgersTip")}>
              {t("extensions.treasuryOverview.ledgers", {
                public: totalPublic.toFixed(1),
                household: totalHouseholdPurse.toFixed(1),
                depts: totalDeptBalances.toFixed(1),
                rulers: totalPersonal.toFixed(1)
              })}
            </div>
            <div className="dim" style={{ fontSize: "0.9em", marginTop: "0.25em" }}>
              <Trans i18nKey="extensions.treasuryOverview.note" />
            </div>
          </div>
        }
        footer={
          <button
            type="button"
            id="treasuryOverviewRefresh"
            data-tip={t("extensions.treasuryOverview.refreshTip")}
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
                label={t("extensions.treasuryOverview.state")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("extensions.treasuryOverview.stateTip")}
              />
              <SortableHeader
                field="form"
                label={t("extensions.treasuryOverview.form")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("extensions.treasuryOverview.formTip")}
              />
              <SortableHeader
                field="publicTreasury"
                label={t("extensions.treasuryOverview.public")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.publicTip")}
              />
              <SortableHeader
                field="householdPurse"
                label={t("extensions.treasuryOverview.hhPurse")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.hhPurseTip")}
              />
              <SortableHeader
                field="rulerPersonal"
                label={t("extensions.treasuryOverview.rulerL0")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.rulerL0Tip")}
              />
              <SortableHeader
                field="domesticIncome"
                label={t("extensions.treasuryOverview.income")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.incomeTip")}
              />
              <SortableHeader
                field="household"
                label={t("extensions.treasuryOverview.hhPaid")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.hhPaidTip")}
              />
              <SortableHeader
                field="officeStipendsPaid"
                label={t("extensions.treasuryOverview.stipends")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.stipendsTip")}
              />
              <SortableHeader
                field="departmentBalancesStock"
                label={t("extensions.treasuryOverview.deptsBal")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.deptsBalTip")}
              />
              <SortableHeader
                field="nominalDepartments"
                label={t("extensions.treasuryOverview.deptsSum")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.deptsSumTip")}
              />
              <SortableHeader
                field="marshalcy"
                label={t("extensions.treasuryOverview.marshalcy")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.marshalcyTip")}
              />
              <SortableHeader
                field="militaryFundingRatio"
                label={t("extensions.treasuryOverview.funding")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.fundingTip")}
              />
              <SortableHeader
                field="militaryDiscontent"
                label={t("extensions.treasuryOverview.discontent")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.discontentTip")}
              />
              <SortableHeader
                field="warFooting"
                label={t("extensions.treasuryOverview.war")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("extensions.treasuryOverview.warTip")}
              />
              <SortableHeader
                field="militaryMobilizationBoost"
                label={t("extensions.treasuryOverview.mob")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.mobTip")}
              />
              <SortableHeader
                field="publicDebt"
                label={t("extensions.treasuryOverview.debt")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.debtTip")}
              />
              <SortableHeader
                field="creditPoolBalance"
                label={t("extensions.treasuryOverview.credit")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.creditTip")}
              />
              <SortableHeader
                field="primaryMoneylenderName"
                label={t("extensions.treasuryOverview.banker")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("extensions.treasuryOverview.bankerTip")}
              />
              <SortableHeader
                field="debtInterestRate"
                label={t("extensions.treasuryOverview.rate")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.rateTip")}
              />
              <SortableHeader
                field="debtInDefault"
                label={t("extensions.treasuryOverview.default")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("extensions.treasuryOverview.defaultTip")}
              />
              <SortableHeader
                field="debtCoupRisk"
                label={t("extensions.treasuryOverview.coup")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("extensions.treasuryOverview.coupTip")}
              />
              <SortableHeader
                field="councilSupport"
                label={t("extensions.treasuryOverview.council")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.councilTip")}
              />
              <SortableHeader
                field="councilLastDebtVoteYes"
                label={t("extensions.treasuryOverview.vote")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.voteTip")}
              />
              <SortableHeader
                field="lastTaxFarmLeak"
                label={t("extensions.treasuryOverview.farm")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.farmTip")}
              />
              <SortableHeader
                field="domainPollTaxMultiplier"
                label={t("extensions.treasuryOverview.poll")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.pollTip")}
              />
              <SortableHeader
                field="foreignDebt"
                label={t("extensions.treasuryOverview.fxDebt")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.fxDebtTip")}
              />
              <SortableHeader
                field="foreignDebtInDefault"
                label={t("extensions.treasuryOverview.fxDef")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("extensions.treasuryOverview.fxDefTip")}
              />
              <SortableHeader
                field="coupLegitimacy"
                label={t("extensions.treasuryOverview.legit")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.legitTip")}
              />
              <SortableHeader
                field="civilUnrest"
                label={t("extensions.treasuryOverview.unrest")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("extensions.treasuryOverview.unrestTip")}
              />
              <SortableHeader
                field="legitimacyWarActive"
                label={t("extensions.treasuryOverview.lwar")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("extensions.treasuryOverview.lwarTip")}
              />
              <SortableHeader
                field="creditRating"
                label={t("extensions.treasuryOverview.rating")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                tip={t("extensions.treasuryOverview.ratingTip")}
              />
              <SortableHeader
                field="tradeSanctionMult"
                label={t("extensions.treasuryOverview.tradeX")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.tradeXTip")}
              />
              <SortableHeader
                field="councilSessionNumber"
                label={t("extensions.treasuryOverview.sess")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.sessTip")}
              />
              <SortableHeader
                field="chancery"
                label={t("extensions.treasuryOverview.chancery")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.deptBudgetTip")}
              />
              <SortableHeader
                field="stewardship"
                label={t("extensions.treasuryOverview.stewardship")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.deptBudgetTip")}
              />
              <SortableHeader
                field="spymastery"
                label={t("extensions.treasuryOverview.spymastery")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.deptBudgetTip")}
              />
              <SortableHeader
                field="ecclesiastica"
                label={t("extensions.treasuryOverview.ecclesiastica")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.deptBudgetTip")}
              />
              <SortableHeader
                field="chanceryServiceLevel"
                label={t("extensions.treasuryOverview.chancerySvc")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.chancerySvcTip")}
              />
              <SortableHeader
                field="stewardshipServiceLevel"
                label={t("extensions.treasuryOverview.stewardshipSvc")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.stewardshipSvcTip")}
              />
              <SortableHeader
                field="spymasteryServiceLevel"
                label={t("extensions.treasuryOverview.spymasterySvc")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.spymasterySvcTip")}
              />
              <SortableHeader
                field="ecclesiasticaServiceLevel"
                label={t("extensions.treasuryOverview.ecclesiasticaSvc")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.ecclesiasticaSvcTip")}
              />
              <SortableHeader
                field="departmentBalanceRemit"
                label={t("extensions.treasuryOverview.deptRemit")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.deptRemitTip")}
              />
              <SortableHeader
                field="diplomaticReliability"
                label={t("extensions.treasuryOverview.diplo")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.diploTip")}
              />
              <SortableHeader
                field="religiousUnrest"
                label={t("extensions.treasuryOverview.religious")}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={toggleSortBy}
                numeric
                tip={t("extensions.treasuryOverview.religiousTip")}
              />
            </tr>
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={44}>
                  <span>{t("extensions.treasuryOverview.empty")}</span>
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

const TreasuryRow: React.FC<{ row: TreasuryOverviewRow }> = ({ row }) => {
  const { t } = useTranslation();
  return (
    <tr className="states" data-id={row.id} data-state={row.stateName}>
      <td data-tip={row.stateName}>{row.stateName}</td>
      <td>{row.form}</td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.publicCell")}>
        {row.publicTreasury.toFixed(2)}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.hhCell")}>
        {row.householdPurse.toFixed(2)}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.rulerCell")}>
        {row.rulerPersonal.toFixed(2)}
      </td>
      <td className="numeric">{row.domesticIncome.toFixed(2)}</td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.hhPaidCell")}>
        {row.household.toFixed(2)}
      </td>
      <td className="numeric">{row.officeStipendsPaid.toFixed(2)}</td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.deptsBalCell")}>
        {row.departmentBalancesStock.toFixed(2)}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.deptsSumCell")}>
        {row.nominalDepartments.toFixed(2)}
      </td>
      <td className="numeric">{row.marshalcy.toFixed(2)}</td>
      <td className="numeric">{row.militaryFundingRatio.toFixed(2)}</td>
      <td className="numeric">{row.militaryDiscontent.toFixed(1)}</td>
      <td data-tip={row.warFooting ? t("extensions.treasuryOverview.warOn") : t("extensions.treasuryOverview.warOff")}>
        {row.warFooting ? t("extensions.treasuryOverview.on") : "—"}
      </td>
      <td className="numeric">{row.militaryMobilizationBoost > 0 ? row.militaryMobilizationBoost.toFixed(3) : "—"}</td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.publicDebtCell")}>
        {row.publicDebt > 0 ? row.publicDebt.toFixed(2) : "—"}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.creditCell")}>
        {row.creditPoolBalance > 0 ? row.creditPoolBalance.toFixed(2) : "—"}
      </td>
      <td data-tip={t("extensions.treasuryOverview.bankerCell")}>{row.primaryMoneylenderName || "—"}</td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.rateCell")}>
        {row.debtInterestRate > 0 ? `${(row.debtInterestRate * 100).toFixed(2)}%` : "—"}
      </td>
      <td
        data-tip={
          row.debtInDefault ? t("extensions.treasuryOverview.inDefault") : t("extensions.treasuryOverview.current")
        }
      >
        {row.debtInDefault ? t("extensions.treasuryOverview.yes") : "—"}
      </td>
      <td
        data-tip={
          row.debtCoupRisk ? t("extensions.treasuryOverview.coupRisk") : t("extensions.treasuryOverview.noCoupRisk")
        }
      >
        {row.debtCoupRisk ? t("extensions.treasuryOverview.yes") : "—"}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.supportCell")}>
        {row.councilSupport > 0 ? row.councilSupport.toFixed(0) : "—"}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.voteCell")}>
        {row.councilLastDebtVoteYes > 0 ? `${(row.councilLastDebtVoteYes * 100).toFixed(0)}%` : "—"}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.farmCell")}>
        {row.lastTaxFarmLeak > 0 ? row.lastTaxFarmLeak.toFixed(2) : "—"}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.pollCell")}>
        {row.domainPollTaxMultiplier !== 1 ? `×${row.domainPollTaxMultiplier.toFixed(2)}` : "—"}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.fxCell")}>
        {row.foreignDebt > 0 ? row.foreignDebt.toFixed(2) : "—"}
      </td>
      <td
        data-tip={
          row.foreignDebtInDefault
            ? t("extensions.treasuryOverview.foreignDefault")
            : t("extensions.treasuryOverview.current")
        }
      >
        {row.foreignDebtInDefault ? t("extensions.treasuryOverview.yes") : "—"}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.legitCell")}>
        {row.coupLegitimacy > 0 ? row.coupLegitimacy.toFixed(0) : "—"}
      </td>
      <td
        data-tip={
          row.civilUnrest ? t("extensions.treasuryOverview.civilUnrest") : t("extensions.treasuryOverview.stable")
        }
      >
        {row.civilUnrest ? t("extensions.treasuryOverview.yes") : "—"}
      </td>
      <td data-tip={row.legitimacyWarActive ? t("extensions.treasuryOverview.legitimacyWar") : "—"}>
        {row.legitimacyWarActive ? t("extensions.treasuryOverview.yes") : "—"}
      </td>
      <td data-tip={t("extensions.treasuryOverview.ratingCell")}>
        {row.creditRating !== "—" ? row.creditRating : "—"}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.tradeCell")}>
        {row.tradeSanctionMult < 1 ? `×${row.tradeSanctionMult.toFixed(2)}` : "—"}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.sessCell")}>
        {row.councilSessionNumber > 0 ? row.councilSessionNumber : "—"}
      </td>
      <td className="numeric">{row.chancery.toFixed(2)}</td>
      <td className="numeric">{row.stewardship.toFixed(2)}</td>
      <td className="numeric">{row.spymastery.toFixed(2)}</td>
      <td className="numeric">{row.ecclesiastica.toFixed(2)}</td>
      <td
        className="numeric"
        data-tip={t("extensions.treasuryOverview.budgetMult", {
          value: row.chanceryBudgetMultiplier.toFixed(2)
        })}
      >
        {(row.chanceryServiceLevel * 100).toFixed(0)}%
      </td>
      <td
        className="numeric"
        data-tip={t("extensions.treasuryOverview.budgetMult", {
          value: row.stewardshipBudgetMultiplier.toFixed(2)
        })}
      >
        {(row.stewardshipServiceLevel * 100).toFixed(0)}%
      </td>
      <td
        className="numeric"
        data-tip={t("extensions.treasuryOverview.budgetMult", {
          value: row.spymasteryBudgetMultiplier.toFixed(2)
        })}
      >
        {(row.spymasteryServiceLevel * 100).toFixed(0)}%
      </td>
      <td
        className="numeric"
        data-tip={t("extensions.treasuryOverview.budgetMult", {
          value: row.ecclesiasticaBudgetMultiplier.toFixed(2)
        })}
      >
        {(row.ecclesiasticaServiceLevel * 100).toFixed(0)}%
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.remitCell")}>
        {row.departmentBalanceRemit > 0 ? row.departmentBalanceRemit.toFixed(2) : "—"}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.diploCell")}>
        {row.diplomaticReliability.toFixed(0)}
      </td>
      <td className="numeric" data-tip={t("extensions.treasuryOverview.religiousCell")}>
        {row.religiousUnrest.toFixed(0)}
      </td>
    </tr>
  );
};
