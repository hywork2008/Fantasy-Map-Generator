import React from "react";
import { useDialogState } from "../../../../store/dialogState";
import { Dialog } from "../../../../ui/dialogs/Dialog";
import { closeDialog } from "../../../../ui/dialogs/dialogService";
import { formatPrice } from "../../../../utils";
import { applySorting } from "../../../../utils/uiHelpers";
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
  const headerRef = React.useRef<HTMLDivElement | null>(null);

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
        <div id="marketOverviewNameLine" style={{ display: "flex", alignItems: "center", marginBottom: "0.4em" }}>
          <div className="label">Name:</div>
          <input
            id="marketOverviewName"
            data-tip="Type to rename the market. Clear the field to reset to the default name"
            autoCorrect="off"
            spellCheck={false}
            style={{ width: "11em", marginLeft: "0.3em" }}
            value={name}
            placeholder={defaultName}
            onChange={e => renameActiveMarket(e.target.value)}
          />
          <span
            id="marketOverviewNameReset"
            data-tip="Reset to the default name (center burg name)"
            className="icon-ccw pointer"
            style={{ marginLeft: "0.3em" }}
            onClick={resetActiveMarketName}
          />
        </div>

        <div
          id="marketOverviewHeader"
          ref={headerRef}
          className="header"
          style={{ gridTemplateColumns: "2.5em 9em 5.5em 3.2em" }}
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
          <div data-tip="Click to sort by stock" className="sortable icon-sort-number-down" data-sortby="stock">
            Stock&nbsp;
          </div>
          <div data-tip="Click to sort by price" className="sortable" data-sortby="price">
            Price&nbsp;
          </div>
        </div>

        <div id="marketOverviewGoodsBody" className="table" style={{ maxHeight: "40em" }}>
          {rows.length === 0 ? (
            <span>No market goods available</span>
          ) : (
            rows.map(row => (
              <div
                key={row.goodId}
                className="states marketGood"
                data-good={row.goodName}
                data-stock={row.stock}
                data-price={row.price}
              >
                <svg aria-label={row.goodName} data-tip="Good icon" width="2em" height="2em" className="goodIcon">
                  <circle cx="50%" cy="50%" r="42%" fill={row.goodColor} stroke={row.goodStroke} />
                  <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
                </svg>
                <div data-tip="Good name" className="goodName">
                  {row.goodName}
                </div>
                <div data-tip="Good stock" className="marketGoodStock">
                  {row.stock}
                </div>
                <div data-tip="Good price" className="marketGoodPrice">
                  {formatPrice(row.price)}
                </div>
              </div>
            ))
          )}
        </div>
        <div id="marketOverviewSummary" className="totalLine">
          <div style={{ marginLeft: 5 }}>Cells: {cellsCount}</div>
          <div style={{ marginLeft: 12 }}>Burgs: {burgsCount}</div>
          <div style={{ marginLeft: 12 }}>Stock: {totalStock}</div>
        </div>
        <div id="marketOverviewInfo" style={{ marginBottom: "0.3em" }}>
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
