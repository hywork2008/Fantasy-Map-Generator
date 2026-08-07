import type React from "react";
import { useRef } from "react";
import { closeDialog, Dialog, TableDialogLayout, useDialogState, VirtualTableBody } from "../../../hostUi";
import { clearBalanceHistory, downloadBalanceHistoryCsv } from "../../controllers/balance-history";
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
  const isOpen = useDialogState(state => state.openDialogs.has("balanceHistory"));
  const snapshots = useBalanceHistoryState(state => state.snapshots);

  const parentRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog
      isOpen={isOpen}
      title="Balance History"
      onClose={() => closeDialog("balanceHistory")}
      className="fmg-dialog--table"
      buttons={[
        { label: "Download CSV", onClick: downloadBalanceHistoryCsv, disabled: snapshots.length === 0 },
        { label: "Clear History", onClick: clearBalanceHistory, disabled: snapshots.length === 0 }
      ]}
    >
      <TableDialogLayout
        bodyRef={parentRef}
        summary={
          <div className="dim" style={{ fontSize: "0.9em" }}>
            One row per map generation and per completed Advance Day/Month/Year action. "Download CSV" includes every
            tracked Good's stock and Fauna species' headcount as extra columns — this table only shows the headline
            totals.
          </div>
        }
      >
        {snapshots.length === 0 ? (
          <i>No snapshots yet. Generate a map or advance time to start tracking balance history.</i>
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
                  <th>Label</th>
                  <th>Date</th>
                  <th data-tip="Real (post-populationRate/urbanization) world population">Population</th>
                  <th data-tip="Urban population share of total">Urban %</th>
                  <th data-tip="Sum of current stock across every enabled Good">Goods Stock</th>
                  <th data-tip="Wild (Game) world headcount">Fauna Wild</th>
                  <th data-tip="Domesticated (liveAnimal) world headcount">Fauna Domesticated</th>
                  <th data-tip="Species whose world headcount is critically low — see FAUNA_AT_RISK_HEADCOUNT_THRESHOLD">
                    Fauna At-Risk
                  </th>
                  <th data-tip="Sum of every State's public treasury">Treasury</th>
                </tr>
              </thead>
              <VirtualTableBody
                items={snapshots}
                scrollElementRef={parentRef}
                renderRow={snapshot => (
                  <tr key={snapshot.id}>
                    <td>{snapshot.label}</td>
                    <td>
                      Y{snapshot.year} M{snapshot.month} D{snapshot.day}
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
