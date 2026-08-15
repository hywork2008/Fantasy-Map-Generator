import React from "react";
import { useTranslation } from "react-i18next";
import { closeDialog, Dialog, useDialogState, VirtualTableBody } from "../../../hostUi";
import { applySorting, formatPrice } from "../../../hostUtils";

import {
  downloadDealsCsv,
  refreshMarketDeals,
  setActiveMarketDealsFilter
} from "../../controllers/market-deals-overview";
import { type MarketDealRow, useMarketDealsState } from "../../store/marketDealsState";

export const MarketDealsDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("marketDeals"));
  const rows = useMarketDealsState(state => state.rows);
  const dealsCount = useMarketDealsState(state => state.dealsCount);
  const netFlow = useMarketDealsState(state => state.netFlow);
  const activeFilter = useMarketDealsState(state => state.activeFilter);
  const onRowClick = useMarketDealsState(state => state.onRowClick);
  const headerRef = React.useRef<HTMLTableSectionElement | null>(null);

  React.useEffect(() => {
    if (isOpen && headerRef.current) applySorting(headerRef.current);
  }, [isOpen]);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.marketDeals")}
      onClose={() => closeDialog("marketDeals")}
      className="fmg-dialog--table"
    >
      <div id="marketDealsContainer">
        <div id="marketDealsBody" className="table">
          <table className="fmg-table">
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead id="marketDealsHeader" ref={headerRef}>
              <tr className="header">
                <th />
                <th
                  data-tip={t("extensions.marketDeals.goodTip")}
                  className="sortable alphabetically"
                  data-sortby="good"
                >
                  {t("extensions.marketDeals.good")}
                </th>
                <th
                  data-tip={t("extensions.marketDeals.typeTip")}
                  className="sortable alphabetically"
                  data-sortby="direction"
                >
                  {t("extensions.marketDeals.type")}
                </th>
                <th
                  data-tip={t("extensions.marketDeals.counterpartyTip")}
                  className="sortable alphabetically"
                  data-sortby="counterparty"
                >
                  {t("extensions.marketDeals.counterparty")}
                </th>
                <th data-tip={t("extensions.marketDeals.unitsTip")} className="sortable" data-sortby="units">
                  {t("extensions.marketDeals.units")}
                </th>
                <th data-tip={t("extensions.marketDeals.incomeTip")} className="sortable" data-sortby="income">
                  {t("extensions.marketDeals.income")}
                </th>
              </tr>
            </thead>
            {rows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={6}>
                    <span>{t("extensions.marketDeals.empty")}</span>
                  </td>
                </tr>
              </tbody>
            ) : (
              <VirtualTableBody
                items={rows}
                scrollElementRef={headerRef}
                renderRow={row => <DealRow key={row.id} row={row} onRowClick={onRowClick} />}
              />
            )}
          </table>
        </div>

        <div id="marketDealsFooter" className="totalLine">
          <div data-tip={t("extensions.marketDeals.dealsTip")}>
            {t("extensions.marketDeals.deals")} <span id="marketDealsFooterDeals">{dealsCount}</span>
          </div>
          <div data-tip={t("extensions.marketDeals.netFlowTip")}>
            {t("extensions.marketDeals.netFlow")} <span id="marketDealsFooterNet">{formatPrice(netFlow)}</span>
          </div>
        </div>

        <div id="marketDealsBottom" className="footer">
          <button
            type="button"
            id="marketDealsRefresh"
            data-tip={t("extensions.marketDeals.refreshTip")}
            className="icon-cw"
            onClick={refreshMarketDeals}
          />
          <button
            type="button"
            id="marketDealsExport"
            data-tip={t("extensions.marketDeals.exportTip")}
            className="icon-download"
            onClick={downloadDealsCsv}
          />
          <select
            id="marketDealsFilter"
            data-tip={t("extensions.marketDeals.filterTip")}
            value={activeFilter}
            onChange={e => setActiveMarketDealsFilter(e.target.value as "all" | "local" | "global")}
          >
            <option value="all">{t("extensions.marketDeals.all")}</option>
            <option value="local">{t("extensions.marketDeals.local")}</option>
            <option value="global">{t("extensions.marketDeals.global")}</option>
          </select>
        </div>
      </div>
    </Dialog>
  );
};

const DealRow: React.FC<{ row: MarketDealRow; onRowClick: (row: MarketDealRow) => void }> = ({ row, onRowClick }) => {
  const { t } = useTranslation();
  return (
    <tr
      className="states marketDeal"
      data-id={row.id}
      data-good={row.goodName}
      data-direction={row.direction}
      data-units={row.units}
      data-counterparty={`${row.counterpartyType}_${row.partyName}`}
      data-income={row.income}
    >
      <td>
        <svg
          aria-label={row.goodName}
          data-tip={t("extensions.marketDeals.goodIcon")}
          width="1.3em"
          height="1.3em"
          className="goodIcon"
        >
          <circle cx="50%" cy="50%" r="42%" fill={row.goodColor} stroke={row.goodStroke} />
          <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
        </svg>
      </td>
      <td data-tip={t("extensions.marketDeals.goodName")} className="goodName">
        {row.goodName}
      </td>
      <td>
        <span className="marketBadge" style={{ background: row.backColor, color: row.incomeColor }}>
          {t(`extensions.marketDeals.${row.direction}`)}
        </span>
      </td>
      <td
        className="marketDealParty pointer"
        data-tip={t("extensions.marketDeals.zoomTip")}
        onClick={() => onRowClick(row)}
      >
        <span
          className={row.counterpartyType === "burg" ? "icon-dot-circled" : "icon-store"}
          style={{ display: "inline-block", ...(row.counterpartyType === "market" ? { fontSize: "0.85em" } : {}) }}
        />
        {row.partyName}
      </td>
      <td className="marketDealUnits">{row.units}</td>
      <td className="marketDealIncome" style={{ color: row.incomeColor }}>
        {formatPrice(row.income)}
      </td>
    </tr>
  );
};
