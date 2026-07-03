import React from "react";

import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { applySorting, formatPrice } from "../../../hostUtils";

import {
  downloadStockCsv,
  openActiveMarketDeals,
  open as openMarketOverview,
  refreshMarketOverview,
  renameActiveMarket,
  resetActiveMarketName
} from "../../controllers/market-overview";
import { useMarketOverviewState } from "../../store/marketOverviewState";

export const MarketOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("marketOverview"));
  const marketId = useDialogState(state => state.dialogConfigs.marketOverview?.marketId as number | undefined);
  const name = useMarketOverviewState(state => state.name);
  const defaultName = useMarketOverviewState(state => state.defaultName);
  const owner = useMarketOverviewState(state => state.owner);
  const rows = useMarketOverviewState(state => state.rows);
  const cellsCount = useMarketOverviewState(state => state.cellsCount);
  const burgsCount = useMarketOverviewState(state => state.burgsCount);
  const totalStock = useMarketOverviewState(state => state.totalStock);
  const headerRef = React.useRef<HTMLTableSectionElement | null>(null);

  React.useEffect(() => {
    if (isOpen && marketId != null) {
      setTimeout(() => openMarketOverview(marketId), 0);
    }
  }, [isOpen, marketId]);

  React.useEffect(() => {
    if (isOpen && headerRef.current) applySorting(headerRef.current);
  }, [isOpen]);

  return (
    <Dialog isOpen={isOpen} title="Market Overview" onClose={() => closeDialog("marketOverview")}>
      <div id="marketOverviewContainer">
        <div id="marketOverviewNameLine" className="d-flex">
          <div className="label">Name:</div>
          <input
            id="marketOverviewName"
            data-tip="Type to rename the market. Clear the field to reset to the default name"
            autoCorrect="off"
            spellCheck={false}
            value={name}
            placeholder={defaultName}
            onChange={e => renameActiveMarket(e.target.value)}
          />
          <span
            id="marketOverviewNameReset"
            data-tip="Reset to the default name (center burg name)"
            className="icon-ccw pointer -3em"
            onClick={resetActiveMarketName}
          />
        </div>

        <div id="marketOverviewGoodsBody" className="table">
          <table className="states-table">
            <colgroup>
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead id="marketOverviewHeader" ref={headerRef}>
              <tr className="header">
                <th />
                <th data-tip="Click to sort by good" className="sortable alphabetically" data-sortby="good">
                  Good&nbsp;
                </th>
                <th data-tip="Click to sort by stock" className="sortable icon-sort-number-down" data-sortby="stock">
                  Stock&nbsp;
                </th>
                <th data-tip="Click to sort by price" className="sortable" data-sortby="price">
                  Price&nbsp;
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <span>No market goods available</span>
                  </td>
                </tr>
              ) : (
                rows.map(row => (
                  <tr
                    key={row.goodId}
                    className="states marketGood"
                    data-good={row.goodName}
                    data-stock={row.stock}
                    data-price={row.price}
                  >
                    <td>
                      <svg aria-label={row.goodName} data-tip="Good icon" width="2em" height="2em" className="goodIcon">
                        <circle cx="50%" cy="50%" r="42%" fill={row.goodColor} stroke={row.goodStroke} />
                        <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
                      </svg>
                    </td>
                    <td data-tip="Good name" className="goodName">
                      {row.goodName}
                    </td>
                    <td data-tip="Good stock" className="marketGoodStock">
                      {row.stock}
                    </td>
                    <td data-tip="Good price" className="marketGoodPrice">
                      {formatPrice(row.price)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div id="marketOverviewSummary" className="totalLine">
          <div>Cells: {cellsCount}</div>
          <div>Burgs: {burgsCount}</div>
          <div>Stock: {totalStock}</div>
        </div>
        <div id="marketOverviewInfo">
          {owner && (
            <>
              <svg className="coaIcon" viewBox="0 0 200 200">
                <title>{`Coat of arms of ${owner.name}`}</title>
                <use href={`#${owner.coaId}`} />
              </svg>
              <b>Owner:</b> {owner.name}
            </>
          )}
        </div>

        <div id="marketOverviewBottom">
          <button
            type="button"
            id="marketOverviewRefresh"
            data-tip="Refresh the Overview screen"
            className="icon-cw"
            onClick={refreshMarketOverview}
          />
          <button
            type="button"
            id="marketOverviewOpenDeals"
            data-tip="View market deals"
            className="icon-list-bullet"
            onClick={openActiveMarketDeals}
          />
          <button
            type="button"
            id="marketOverviewExport"
            data-tip="Save market deals data as a text file (.csv)"
            className="icon-download"
            onClick={downloadStockCsv}
          />
        </div>
      </div>
    </Dialog>
  );
};
