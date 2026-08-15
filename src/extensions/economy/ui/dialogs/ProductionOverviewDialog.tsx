import React from "react";
import { useTranslation } from "react-i18next";

import { closeDialog, Dialog, useDialogState, VirtualTableBody } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";

import { open as openProductionOverview, refreshProductionOverview } from "../../controllers/production-overview";
import { type ProductionOverviewRow, useProductionOverviewState } from "../../store/productionOverviewState";

const KIND_LABEL: Record<ProductionOverviewRow["kind"], string> = {
  manufactured: "MADE",
  sold: "SOLD",
  bought: "BOUGHT"
};

const KIND_COLOR: Record<ProductionOverviewRow["kind"], string> = {
  manufactured: "#5a8dee",
  sold: "#2a6",
  bought: "#c44"
};

export const ProductionOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("productionOverview"));
  const burgId = useDialogState(state => state.dialogConfigs.productionOverview?.burgId as number | undefined);
  const burgName = useProductionOverviewState(state => state.burgName);
  const rows = useProductionOverviewState(state => state.rows);
  const wealth = useProductionOverviewState(state => state.wealth);
  const treasury = useProductionOverviewState(state => state.treasury);
  const taxPaid = useProductionOverviewState(state => state.taxPaid);

  const parentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen && burgId != null) {
      setTimeout(() => openProductionOverview(burgId), 0);
    }
  }, [isOpen, burgId]);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.productionOverview")}
      onClose={() => closeDialog("productionOverview")}
      className="fmg-dialog--table"
    >
      <div id="productionOverviewContainer">
        <div id="productionOverviewName" className="header">
          <b>{burgName}</b>
        </div>

        <div ref={parentRef} id="productionOverviewBody" className="table">
          <table className="fmg-table">
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead className="header">
              <tr>
                <th />
                <th>Good</th>
                <th>Type</th>
                <th>Units</th>
                <th>Price</th>
                <th>Net</th>
              </tr>
            </thead>
            {rows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={6}>
                    <span>No production recorded for this burg</span>
                  </td>
                </tr>
              </tbody>
            ) : (
              <VirtualTableBody
                items={rows}
                scrollElementRef={parentRef}
                renderRow={(row: ProductionOverviewRow) => <ProductionRow key={row.id} row={row} />}
              />
            )}
          </table>
        </div>

        <div id="productionOverviewFooter" className="totalLine">
          <div data-tip="Gross product per 1,000 actual residents for the current production run">
            Product / 1k: <span id="productionOverviewFooterWealth">{wealth}</span>
          </div>
          <div data-tip="Total sales tax paid to the state on this burg's sell deals this cycle">
            Tax paid: <span id="productionOverviewFooterTax">{taxPaid}</span>
          </div>
          <div data-tip="Burg's cumulative cash balance after all production, purchases, and sales">
            Treasury: <span id="productionOverviewFooterTreasury">{treasury}</span>
          </div>
        </div>

        <div id="productionOverviewBottom" className="footer">
          <button
            type="button"
            id="productionOverviewRefresh"
            data-tip="Refresh the Production Overview"
            className="icon-cw"
            onClick={refreshProductionOverview}
          />
        </div>
      </div>
    </Dialog>
  );
};

const ProductionRow: React.FC<{ row: ProductionOverviewRow }> = ({ row }) => (
  <tr className="states" data-id={row.id} data-good={row.goodName} data-kind={row.kind}>
    <td>
      <svg aria-label={row.goodName} data-tip="Good icon" width="1.3em" height="1.3em" className="goodIcon">
        <circle cx="50%" cy="50%" r="42%" fill={row.goodColor} stroke={row.goodStroke} />
        <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
      </svg>
    </td>
    <td data-tip="Good name" className="goodName">
      {row.goodName}
    </td>
    <td>
      <span className="marketBadge" style={{ color: KIND_COLOR[row.kind] }}>
        {KIND_LABEL[row.kind]}
      </span>
    </td>
    <td>{row.units}</td>
    <td>{row.price ? formatPrice(row.price) : ""}</td>
    <td style={{ color: row.net > 0 ? "#2a6" : row.net < 0 ? "#c44" : undefined }}>
      {row.kind === "manufactured" ? "" : formatPrice(row.net)}
    </td>
  </tr>
);
