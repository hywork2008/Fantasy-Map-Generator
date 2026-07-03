import React from "react";

import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { applySorting, formatPrice } from "../../../hostUtils";

import {
  downloadDealsCsv,
  refreshMarketDeals,
  setActiveMarketDealsFilter
} from "../../controllers/market-deals-overview";
import { type MarketDealRow, useMarketDealsState } from "../../store/marketDealsState";

export const MarketDealsDialog: React.FC = () => {
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
    <Dialog isOpen={isOpen} title="Market Deals" onClose={() => closeDialog("marketDeals")}>
      <div id="marketDealsContainer">
        <div id="marketDealsBody" className="table">
          <table className="states-table">
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
                <th data-tip="Click to sort by good" className="sortable alphabetically" data-sortby="good">
                  Good&nbsp;
                </th>
                <th data-tip="Click to sort by deal type" className="sortable alphabetically" data-sortby="direction">
                  Type&nbsp;
                </th>
                <th
                  data-tip="Click to sort by counterparty"
                  className="sortable alphabetically"
                  data-sortby="counterparty"
                >
                  Counterparty&nbsp;
                </th>
                <th data-tip="Click to sort by units" className="sortable" data-sortby="units">
                  Units&nbsp;
                </th>
                <th data-tip="Click to sort by income" className="sortable" data-sortby="income">
                  Income&nbsp;
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <span>No market deals recorded</span>
                  </td>
                </tr>
              ) : (
                rows.map(row => <DealRow key={row.id} row={row} onRowClick={onRowClick} />)
              )}
            </tbody>
          </table>
        </div>

        <div id="marketDealsFooter" className="totalLine">
          <div data-tip="Deals count">
            Deals: <span id="marketDealsFooterDeals">{dealsCount}</span>
          </div>
          <div data-tip="Net flow for this market">
            Net Flow: <span id="marketDealsFooterNet">{formatPrice(netFlow)}</span>
          </div>
        </div>

        <div id="marketDealsBottom">
          <button
            type="button"
            id="marketDealsRefresh"
            data-tip="Refresh the Deals screen"
            className="icon-cw"
            onClick={refreshMarketDeals}
          />
          <button
            type="button"
            id="marketDealsExport"
            data-tip="Save market deals data as a text file (.csv)"
            className="icon-download"
            onClick={downloadDealsCsv}
          />
          <select
            id="marketDealsFilter"
            data-tip="Filter deals by scope"
            value={activeFilter}
            onChange={e => setActiveMarketDealsFilter(e.target.value as "all" | "local" | "global")}
          >
            <option value="all">All</option>
            <option value="local">Local</option>
            <option value="global">Global</option>
          </select>
        </div>
      </div>
    </Dialog>
  );
};

const DealRow: React.FC<{ row: MarketDealRow; onRowClick: (row: MarketDealRow) => void }> = ({ row, onRowClick }) => (
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
      <svg aria-label={row.goodName} data-tip="Good icon" width="1.3em" height="1.3em" className="goodIcon">
        <circle cx="50%" cy="50%" r="42%" fill={row.goodColor} stroke={row.goodStroke} />
        <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
      </svg>
    </td>
    <td data-tip="Good name" className="goodName">
      {row.goodName}
    </td>
    <td>
      <span className="marketBadge" style={{ background: row.backColor, color: row.incomeColor }}>
        {row.direction.toUpperCase()}
      </span>
    </td>
    <td className="marketDealParty pointer" data-tip="Click to zoom" onClick={() => onRowClick(row)}>
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
