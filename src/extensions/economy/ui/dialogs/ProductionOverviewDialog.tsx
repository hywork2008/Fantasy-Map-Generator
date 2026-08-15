import React from "react";
import { useTranslation } from "react-i18next";

import { closeDialog, Dialog, useDialogState, VirtualTableBody } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";

import { open as openProductionOverview, refreshProductionOverview } from "../../controllers/production-overview";
import { type ProductionOverviewRow, useProductionOverviewState } from "../../store/productionOverviewState";

const KIND_LABEL_KEY: Record<ProductionOverviewRow["kind"], string> = {
  manufactured: "extensions.productionOverview.kindMade",
  sold: "extensions.productionOverview.kindSold",
  bought: "extensions.productionOverview.kindBought"
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
                <th>{t("extensions.productionOverview.good")}</th>
                <th>{t("extensions.productionOverview.type")}</th>
                <th>{t("extensions.productionOverview.units")}</th>
                <th>{t("extensions.productionOverview.price")}</th>
                <th>{t("extensions.productionOverview.net")}</th>
              </tr>
            </thead>
            {rows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={6}>
                    <span>{t("extensions.productionOverview.empty")}</span>
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
          <div data-tip={t("extensions.productionOverview.productPerKTip")}>
            {t("extensions.productionOverview.productPerK")} <span id="productionOverviewFooterWealth">{wealth}</span>
          </div>
          <div data-tip={t("extensions.productionOverview.taxPaidTip")}>
            {t("extensions.productionOverview.taxPaid")} <span id="productionOverviewFooterTax">{taxPaid}</span>
          </div>
          <div data-tip={t("extensions.productionOverview.treasuryTip")}>
            {t("extensions.productionOverview.treasury")} <span id="productionOverviewFooterTreasury">{treasury}</span>
          </div>
        </div>

        <div id="productionOverviewBottom" className="footer">
          <button
            type="button"
            id="productionOverviewRefresh"
            data-tip={t("extensions.productionOverview.refreshTip")}
            className="icon-cw"
            onClick={refreshProductionOverview}
          />
        </div>
      </div>
    </Dialog>
  );
};

const ProductionRow: React.FC<{ row: ProductionOverviewRow }> = ({ row }) => {
  const { t } = useTranslation();
  return (
    <tr className="states" data-id={row.id} data-good={row.goodName} data-kind={row.kind}>
      <td>
        <svg
          aria-label={row.goodName}
          data-tip={t("extensions.productionOverview.iconTip")}
          width="1.3em"
          height="1.3em"
          className="goodIcon"
        >
          <circle cx="50%" cy="50%" r="42%" fill={row.goodColor} stroke={row.goodStroke} />
          <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
        </svg>
      </td>
      <td data-tip={t("extensions.productionOverview.goodNameTip")} className="goodName">
        {row.goodName}
      </td>
      <td>
        <span className="marketBadge" style={{ color: KIND_COLOR[row.kind] }}>
          {t(KIND_LABEL_KEY[row.kind])}
        </span>
      </td>
      <td>{row.units}</td>
      <td>{row.price ? formatPrice(row.price) : ""}</td>
      <td style={{ color: row.net > 0 ? "#2a6" : row.net < 0 ? "#c44" : undefined }}>
        {row.kind === "manufactured" ? "" : formatPrice(row.net)}
      </td>
    </tr>
  );
};
