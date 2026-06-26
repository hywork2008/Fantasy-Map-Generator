import React from "react";
import { useDialogState } from "../../../../store/dialogState";
import { useMarketsOverviewState } from "../../../../store/marketsOverviewState";
import { FillBox } from "../../../../ui/components/FillBox";
import { Dialog } from "../../../../ui/dialogs/Dialog";
import { closeDialog } from "../../../../ui/dialogs/dialogService";
import { formatPrice } from "../../../../utils";
import {
  closeMarketsOverview,
  marketsOverviewActions,
  open as openMarketsOverview
} from "../../editors/markets-overview";

export const MarketsOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("marketsOverview"));
  const { markets, totalMarkets, avgSales, avgBuys, avgValue, isPercentageMode } = useMarketsOverviewState();

  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => openMarketsOverview(), 0); // ensure DOM is mounted
    }
    return () => {
      if (!isOpen) {
        closeMarketsOverview();
      }
    };
  }, [isOpen]);

  const handleRowClick = (marketId: number) => {
    if (marketId === 0) return; // 'No market' row
    // In legacy, clicking row didn't do much immediately besides select in custom mode, but we leave the hook here
    // as legacy code handles some of this manually during customization=15.
  };

  const handleMouseEnter = (marketId: number) => {
    if (marketId !== 0) marketsOverviewActions.highlightMarketOn(String(marketId));
  };

  const handleMouseLeave = (marketId: number) => {
    if (marketId !== 0) marketsOverviewActions.highlightMarketOff(String(marketId));
  };

  const handleColorClick = (e: React.MouseEvent, marketId: number) => {
    e.stopPropagation();
    if (marketId !== 0) marketsOverviewActions.marketChangeFill(e.target as HTMLElement, marketId);
  };

  const handleRemoveClick = (e: React.MouseEvent, marketId: number) => {
    e.stopPropagation();
    marketsOverviewActions.confirmRemoveMarket(marketId);
  };

  return (
    <Dialog isOpen={isOpen} title="Markets Overview" onClose={() => closeDialog("marketsOverview")}>
      <div id="marketsOverviewContainer">
        <div
          id="marketsOverviewHeader"
          className="header"
          style={{ gridTemplateColumns: "1.6em 7.2em 8em 3.5em 4.5em 6.5em 6.4em 6em 6em 1.2em" }}
        >
          <div />
          <div
            data-tip="Market center burg name. Click to sort"
            className="sortable alphabetically"
            data-sortby="market"
            style={{ marginLeft: 0 }}
          >
            Market&nbsp;
          </div>
          <div data-tip="Owning state. Click to sort" className="sortable alphabetically" data-sortby="owner">
            Owner&nbsp;
          </div>
          <div data-tip="Number of cells in market territory. Click to sort" className="sortable" data-sortby="cells">
            Cells&nbsp;
          </div>
          <div
            data-tip="Number of burgs in market territory. Click to sort"
            className="sortable hide"
            data-sortby="burgs"
          >
            Burgs&nbsp;
          </div>
          <div data-tip="Total stock of all goods. Click to sort" className="sortable hide" data-sortby="stock">
            Stock&nbsp;
          </div>
          <div data-tip="Total gross sales revenue. Click to sort" className="sortable hide" data-sortby="sales">
            Sales&nbsp;
          </div>
          <div data-tip="Total purchase spending. Click to sort" className="sortable hide" data-sortby="buys">
            Buys&nbsp;
          </div>
          <div
            data-tip="Market value: net trading flow plus unsold inventory value minus tax. Click to sort"
            className="sortable hide icon-sort-number-down"
            data-sortby="value"
          >
            Value&nbsp;
          </div>
          <div />
        </div>

        <div
          id="marketsOverviewBody"
          className="table"
          data-type={isPercentageMode ? "percentage" : "absolute"}
          style={{ maxHeight: "40em", cursor: "pointer" }}
        >
          {markets.length === 0
            ? "No markets available"
            : markets.map(m => {
                // Handle Percentage Display if needed
                const displayVal = (val: number, total: number) => {
                  if (!isPercentageMode) {
                    return val;
                  }
                  return total ? `${((val / total) * 100).toFixed(2)}%` : "0%";
                };
                const displayPrice = (val: number, total: number) => {
                  if (!isPercentageMode) {
                    return formatPrice(val);
                  }
                  return total ? `${((val / total) * 100).toFixed(2)}%` : "0%";
                };

                const totCells = markets.reduce((s, row) => s + row.cells, 0);
                const totBurgs = markets.reduce((s, row) => s + row.burgs, 0);
                const totStock = markets.reduce((s, row) => s + row.stock, 0);
                const totSales = markets.reduce((s, row) => s + row.sales, 0);
                const totBuys = markets.reduce((s, row) => s + row.buys, 0);
                const totValue = markets.reduce((s, row) => s + row.value, 0);

                if (m.isNoMarket) {
                  return (
                    <div
                      key={m.i}
                      className="states market"
                      data-id={m.i}
                      data-market={m.centerName}
                      data-owner={m.ownerName}
                      data-cells={m.cells}
                      data-burgs={m.burgs}
                      data-stock={m.stock}
                      data-sales={m.sales}
                      data-buys={m.buys}
                      data-value={m.value}
                      onClick={() => handleRowClick(m.i)}
                    >
                      <div data-tip="Cells assigned to no market">
                        <FillBox fill="none" />
                      </div>
                      <div
                        data-tip="Cells with no market; their burgs are excluded from production"
                        className="marketName"
                        style={{ width: "7em" }}
                      >
                        {m.centerName}
                      </div>
                      <div className="marketOwner" style={{ width: "8em" }}>
                        {m.ownerName}
                      </div>
                      <div
                        data-tip="Number of cells with no market"
                        data-type="cells"
                        className="marketCells"
                        style={{ width: "3.5em" }}
                      >
                        {displayVal(m.cells, totCells)}
                      </div>
                      <div
                        data-tip="Number of burgs with no market"
                        data-type="burgs"
                        className="marketBurgs hide"
                        style={{ width: "3.5em" }}
                      >
                        {displayVal(m.burgs, totBurgs)}
                      </div>
                      <div data-type="stock" className="marketStock hide" style={{ width: "5em" }}>
                        —
                      </div>
                      <div data-type="sales" className="marketSales hide" style={{ width: "6em" }}>
                        —
                      </div>
                      <div data-type="buys" className="marketBuysCol hide" style={{ width: "6em" }}>
                        —
                      </div>
                      <div data-type="value" className="marketValue hide" style={{ width: "6em" }}>
                        —
                      </div>
                      <span className="hide" style={{ width: "1.2em" }} />
                    </div>
                  );
                }

                return (
                  <div
                    key={m.i}
                    className="states market"
                    data-id={m.i}
                    data-market={m.centerName}
                    data-owner={m.ownerName}
                    data-cells={m.cells}
                    data-burgs={m.burgs}
                    data-stock={m.stock}
                    data-sales={m.sales}
                    data-buys={m.buys}
                    data-value={m.value}
                    onClick={() => handleRowClick(m.i)}
                    onMouseEnter={() => handleMouseEnter(m.i)}
                    onMouseLeave={() => handleMouseLeave(m.i)}
                  >
                    <div onClick={e => handleColorClick(e, m.i)}>
                      <FillBox fill={m.color} />
                    </div>
                    <div data-tip="Market name. Click to view details" className="marketName" style={{ width: "7em" }}>
                      {m.centerName}
                    </div>
                    <div data-tip="Owning state" className="marketOwner" style={{ width: "8em" }}>
                      {m.ownerName}
                    </div>
                    <div
                      data-tip="Number of cells in market territory"
                      data-type="cells"
                      className="marketCells"
                      style={{ width: "3.5em" }}
                    >
                      {displayVal(m.cells, totCells)}
                    </div>
                    <div
                      data-tip="Number of burgs in market territory"
                      data-type="burgs"
                      className="marketBurgs hide"
                      style={{ width: "3.5em" }}
                    >
                      {displayVal(m.burgs, totBurgs)}
                    </div>
                    <div
                      data-tip="Total stock of all goods in this market"
                      data-type="stock"
                      className="marketStock hide"
                      style={{ width: "5em" }}
                    >
                      {displayVal(m.stock, totStock)}
                    </div>
                    <div
                      data-tip="Total gross sales revenue"
                      data-type="sales"
                      className="marketSales hide"
                      style={{ width: "6em" }}
                    >
                      {displayPrice(m.sales, totSales)}
                    </div>
                    <div
                      data-tip="Total purchase spending"
                      data-type="buys"
                      className="marketBuysCol hide"
                      style={{ width: "6em" }}
                    >
                      {displayPrice(m.buys, totBuys)}
                    </div>
                    <div
                      data-tip="Market value: net trading flow plus unsold inventory value minus tax"
                      data-type="value"
                      className="marketValue hide"
                      style={{ width: "6em" }}
                    >
                      {displayPrice(m.value, totValue)}
                    </div>
                    <span
                      data-tip="Remove this market"
                      className="icon-trash-empty hiddenIcon hide"
                      style={{ visibility: "hidden" }}
                      onClick={e => handleRemoveClick(e, m.i)}
                    />
                  </div>
                );
              })}
        </div>

        <div id="marketsOverviewFooter" className="totalLine">
          <div data-tip="Total number of markets" style={{ marginLeft: 5 }}>
            Markets:&nbsp;<span id="marketsOverviewFooterMarkets">{totalMarkets}</span>
          </div>
          <div data-tip="Average gross sales revenue per market" style={{ marginLeft: 12 }}>
            Avg Sales:&nbsp;<span id="marketsOverviewFooterSales">{formatPrice(avgSales)}</span>
          </div>
          <div data-tip="Average purchase spending per market" style={{ marginLeft: 12 }}>
            Avg Buys:&nbsp;<span id="marketsOverviewFooterBuys">{formatPrice(avgBuys)}</span>
          </div>
          <div data-tip="Average market value per market" style={{ marginLeft: 12 }}>
            Avg Value:&nbsp;<span id="marketsOverviewFooterValue">{formatPrice(avgValue)}</span>
          </div>
        </div>

        <div id="marketsOverviewBottom">
          <button
            type="button"
            id="marketsOverviewRefresh"
            data-tip="Refresh the overview"
            className="icon-cw"
            onClick={marketsOverviewActions.marketsOverviewAddLines}
          />
          <button
            type="button"
            id="marketsOverviewPercentage"
            data-tip="Toggle percentage / absolute values views"
            className="icon-percent"
            onClick={marketsOverviewActions.togglePercentageMode}
          />
          <button
            type="button"
            id="marketsOverviewCompare"
            data-tip="Compare good stock across markets"
            className="icon-chart-bar"
          />
          <button
            type="button"
            id="marketsOverviewExport"
            data-tip="Save markets data as a CSV file"
            className="icon-download"
            onClick={marketsOverviewActions.downloadMarketsCsv}
          />
          <button
            type="button"
            id="marketsManually"
            data-tip="Manually re-assign market territories"
            className="icon-brush"
            onClick={() => {
              // Note: actual toggle handles state from within TS, but button calls it here.
              // In the original, it did if customization===15 exit else enter.
              marketsOverviewActions.enterMarketsManualAssignment();
            }}
          />
          <div id="marketsManuallyButtons" style={{ display: "none" }}>
            <button
              type="button"
              id="marketsManuallyUndo"
              data-tip="Undo last brush stroke"
              className="icon-ccw"
              onClick={marketsOverviewActions.undoMarketsManualStep}
            />
            <button
              type="button"
              id="marketsManuallyApply"
              data-tip="Apply assignment"
              className="icon-check"
              onClick={() => marketsOverviewActions.exitMarketsManualAssignment(true)}
            />
            <button
              type="button"
              id="marketsManuallyCancel"
              data-tip="Cancel assignment"
              className="icon-cancel"
              onClick={() => marketsOverviewActions.exitMarketsManualAssignment(false)}
            />
          </div>
          <button
            type="button"
            id="marketsAdd"
            data-tip="Add a new market. Click on a burg on the map. Hold Shift to add multiple"
            className="icon-plus"
            onClick={() => {
              marketsOverviewActions.enterAddMarketMode();
            }}
          />
          <button
            type="button"
            id="marketsRegenerate"
            data-tip="Regenerate markets and their territories"
            className="icon-arrows-cw"
            onClick={marketsOverviewActions.regenerateMarkets}
          />
          <button
            type="button"
            id="marketsRegenerateProduction"
            data-tip="Regenerate production and trade deals"
            className="icon-retweet"
            onClick={marketsOverviewActions.regenerateProduction}
          />
        </div>
      </div>
    </Dialog>
  );
};
