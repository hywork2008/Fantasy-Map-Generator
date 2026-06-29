import React from "react";
import { useDialogState } from "../../../../store/dialogState";
import { Dialog } from "../../../../ui/dialogs/Dialog";
import { closeDialog } from "../../../../ui/dialogs/dialogService";
import { formatPrice } from "../../../../utils";
import { applySorting } from "../../../../utils/uiHelpers";
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
  const headerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (isOpen && headerRef.current) applySorting(headerRef.current);
  }, [isOpen]);

  return (
    <Dialog isOpen={isOpen} title="Market Deals" onClose={() => closeDialog("marketDeals")}>
      <div id="marketDealsContainer">
        <div
          id="marketDealsHeader"
          ref={headerRef}
          className="header"
          style={{ gridTemplateColumns: "2em 6.8em 4em 10em 4em 4em" }}
        >
          <div />
          <div
            data-tip="Click to sort by good"
            className="sortable alphabetically"
            data-sortby="good"
            style={{ marginLeft: 0 }}
          >
            Good&nbsp;
          </div>
          <div data-tip="Click to sort by deal type" className="sortable alphabetically" data-sortby="direction">
            Type&nbsp;
          </div>
          <div data-tip="Click to sort by counterparty" className="sortable alphabetically" data-sortby="counterparty">
            Counterparty&nbsp;
          </div>
          <div data-tip="Click to sort by units" className="sortable" data-sortby="units">
            Units&nbsp;
          </div>
          <div data-tip="Click to sort by income" className="sortable" data-sortby="income">
            Income&nbsp;
          </div>
        </div>

        <div id="marketDealsBody" className="table" style={{ maxHeight: "30em" }}>
          {rows.length === 0 ? (
            <span>No market deals recorded</span>
          ) : (
            rows.map(row => <DealRow key={row.id} row={row} onRowClick={onRowClick} />)
          )}
        </div>

        <div id="marketDealsFooter" className="totalLine">
          <div style={{ marginLeft: 5 }} data-tip="Deals count">
            Deals: <span id="marketDealsFooterDeals">{dealsCount}</span>
          </div>
          <div style={{ marginLeft: 12 }} data-tip="Net flow for this market">
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
            style={{ marginLeft: 8 }}
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
  <div
    className="states marketDeal"
    data-id={row.id}
    data-good={row.goodName}
    data-direction={row.direction}
    data-units={row.units}
    data-counterparty={`${row.counterpartyType}_${row.partyName}`}
    data-income={row.income}
  >
    <svg aria-label={row.goodName} data-tip="Good icon" width="1.3em" height="1.3em" className="goodIcon">
      <circle cx="50%" cy="50%" r="42%" fill={row.goodColor} stroke={row.goodStroke} />
      <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
    </svg>
    <div data-tip="Good name" className="goodName">
      {row.goodName}
    </div>
    <div>
      <span className="marketBadge" style={{ background: row.backColor, color: row.incomeColor }}>
        {row.direction.toUpperCase()}
      </span>
    </div>
    <div className="marketDealParty pointer" data-tip="Click to zoom" onClick={() => onRowClick(row)}>
      <div
        className={row.counterpartyType === "burg" ? "icon-dot-circled" : "icon-store"}
        style={{
          display: "inline-block",
          width: "0.8em",
          ...(row.counterpartyType === "market" ? { fontSize: "0.85em" } : {})
        }}
      />
      <div style={{ display: "inline-block", width: "6.8em" }}>{row.partyName}</div>
    </div>
    <div className="marketDealUnits">{row.units}</div>
    <div className="marketDealIncome" style={{ color: row.incomeColor }}>
      {formatPrice(row.income)}
    </div>
  </div>
);
