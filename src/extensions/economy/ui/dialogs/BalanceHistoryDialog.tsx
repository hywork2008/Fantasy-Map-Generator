import type React from "react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { closeDialog, Dialog, TableDialogLayout, useDialogState, VirtualTableBody } from "../../../hostUi";
import {
  clearBalanceHistory,
  downloadBalanceHistoryCsv,
  downloadGoodsBalanceHistoryCsv,
  downloadGoodsFlowAttributionCsv
} from "../../controllers/balance-history";
import { useBalanceHistoryState } from "../../store/balanceHistoryState";

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/**
 * Population/Goods/Fauna time series for balance tuning — one row per map generation and per
 * completed Advance Time action (see `controllers/balance-history.ts`'s doc-comment for capture
 * points). The in-app table shows the headline figures; "Download CSV" exports the full history
 * with a column per tracked Good and Fauna species so shortages/surpluses can be eyeballed over
 * time in a spreadsheet.
 */
export const BalanceHistoryDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("balanceHistory"));
  const snapshots = useBalanceHistoryState(state => state.snapshots);
  const intervalCount = useBalanceHistoryState(state => state.intervals.length);

  const parentRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.balanceHistory")}
      onClose={() => closeDialog("balanceHistory")}
      className="fmg-dialog--table"
      buttons={[
        {
          label: t("extensions.balanceHistory.downloadCsv"),
          onClick: downloadBalanceHistoryCsv,
          disabled: snapshots.length === 0
        },
        {
          label: t("extensions.balanceHistory.downloadGoodsCsv"),
          onClick: downloadGoodsBalanceHistoryCsv,
          disabled: intervalCount === 0
        },
        {
          label: t("extensions.balanceHistory.downloadFlowCsv"),
          onClick: downloadGoodsFlowAttributionCsv,
          disabled: intervalCount === 0
        },
        { label: t("extensions.balanceHistory.clear"), onClick: clearBalanceHistory, disabled: snapshots.length === 0 }
      ]}
    >
      <TableDialogLayout
        bodyRef={parentRef}
        summary={
          <div className="dim" style={{ fontSize: "0.9em" }}>
            {t("extensions.balanceHistory.note")}
          </div>
        }
      >
        {snapshots.length === 0 ? (
          <i>{t("extensions.balanceHistory.empty")}</i>
        ) : (
          <div ref={parentRef} className="table">
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
              </colgroup>
              <thead className="header">
                <tr>
                  <th>{t("extensions.balanceHistory.label")}</th>
                  <th>{t("extensions.balanceHistory.date")}</th>
                  <th data-tip={t("extensions.balanceHistory.populationTip")}>
                    {t("extensions.balanceHistory.population")}
                  </th>
                  <th data-tip={t("extensions.balanceHistory.urbanTip")}>{t("extensions.balanceHistory.urban")}</th>
                  <th data-tip={t("extensions.balanceHistory.goodsStockTip")}>
                    {t("extensions.balanceHistory.goodsStock")}
                  </th>
                  <th data-tip={t("extensions.balanceHistory.faunaWildTip")}>
                    {t("extensions.balanceHistory.faunaWild")}
                  </th>
                  <th data-tip={t("extensions.balanceHistory.faunaDomTip")}>
                    {t("extensions.balanceHistory.faunaDom")}
                  </th>
                  <th data-tip={t("extensions.balanceHistory.faunaRiskTip")}>
                    {t("extensions.balanceHistory.faunaRisk")}
                  </th>
                  <th data-tip={t("extensions.balanceHistory.treasuryTip")}>
                    {t("extensions.balanceHistory.treasury")}
                  </th>
                </tr>
              </thead>
              <VirtualTableBody
                items={snapshots}
                scrollElementRef={parentRef}
                renderRow={snapshot => (
                  <tr key={snapshot.id}>
                    <td>{formatSnapshotLabel(snapshot.label, t)}</td>
                    <td>
                      {t("extensions.balanceHistory.dateFmt", {
                        year: snapshot.year,
                        month: snapshot.month,
                        day: snapshot.day
                      })}
                    </td>
                    <td>{formatNumber(snapshot.population.total)}</td>
                    <td>{formatPercent(snapshot.population.urbanizationRate)}</td>
                    <td>{formatNumber(snapshot.goods.totalStock)}</td>
                    <td>{formatNumber(snapshot.fauna.wildTotal)}</td>
                    <td>{formatNumber(snapshot.fauna.domesticatedTotal)}</td>
                    <td>{snapshot.fauna.atRiskSpeciesCount}</td>
                    <td>{formatNumber(snapshot.totalStateTreasury)}</td>
                  </tr>
                )}
              />
            </table>
          </div>
        )}
      </TableDialogLayout>
    </Dialog>
  );
};

function formatSnapshotLabel(label: string, t: (key: string) => string): string {
  if (label === "Initial Generation") return t("extensions.balanceHistory.initialGeneration");
  if (label === "Advance Time") return t("extensions.balanceHistory.advanceTime");
  return label;
}
