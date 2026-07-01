import React from "react";

import { closeDialog, Dialog, FillBox, openConfirm, useDialogState } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";

import {
  closeMarketsOverview,
  marketsOverviewActions,
  open as openMarketsOverview
} from "../../controllers/markets-overview";
import { useMarketsOverviewState } from "../../store/marketsOverviewState";

export const MarketsOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("marketsOverview"));
  const {
    markets,
    totalMarkets,
    avgSales,
    avgBuys,
    avgValue,
    isPercentageMode,
    mode,
    selectedMarketId,
    brushSize,
    sortBy,
    sortDirection
  } = useMarketsOverviewState();

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

  const isManualMode = mode === "manual";
  const isAddMode = mode === "add";
  const colorInputRefs = React.useRef<Record<number, HTMLInputElement | null>>({});
  const [isRegenerateMarketsDialogOpen, setIsRegenerateMarketsDialogOpen] = React.useState(false);
  const [isRegenerateProductionDialogOpen, setIsRegenerateProductionDialogOpen] = React.useState(false);
  const [regenerateTradeAlongsideMarkets, setRegenerateTradeAlongsideMarkets] = React.useState(true);

  React.useEffect(() => {
    if (!isOpen) {
      setIsRegenerateMarketsDialogOpen(false);
      setIsRegenerateProductionDialogOpen(false);
      setRegenerateTradeAlongsideMarkets(true);
    }
  }, [isOpen]);

  const totals = React.useMemo(
    () => ({
      cells: markets.reduce((sum, row) => sum + row.cells, 0),
      burgs: markets.reduce((sum, row) => sum + row.burgs, 0),
      stock: markets.reduce((sum, row) => sum + row.stock, 0),
      sales: markets.reduce((sum, row) => sum + row.sales, 0),
      buys: markets.reduce((sum, row) => sum + row.buys, 0),
      value: markets.reduce((sum, row) => sum + row.value, 0)
    }),
    [markets]
  );

  const sortedMarkets = React.useMemo(() => {
    const rows = [...markets];
    rows.sort((left, right) => {
      const leftValue =
        sortBy === "market"
          ? left.centerName.toLowerCase()
          : sortBy === "owner"
            ? left.ownerName.toLowerCase()
            : left[sortBy as keyof typeof left];
      const rightValue =
        sortBy === "market"
          ? right.centerName.toLowerCase()
          : sortBy === "owner"
            ? right.ownerName.toLowerCase()
            : right[sortBy as keyof typeof right];

      if (leftValue < rightValue) return -1 * sortDirection;
      if (leftValue > rightValue) return 1 * sortDirection;
      return 0;
    });
    return rows;
  }, [markets, sortBy, sortDirection]);

  const getSortIcon = (field: string, alphabetical = false) => {
    if (sortBy !== field) return "";
    if (alphabetical) return sortDirection === 1 ? "icon-sort-name-up" : "icon-sort-name-down";
    return sortDirection === 1 ? "icon-sort-number-up" : "icon-sort-number-down";
  };

  const handleRowClick = (marketId: number) => {
    marketsOverviewActions.selectMarket(marketId);
    if (!isManualMode && marketId !== 0) marketsOverviewActions.openMarketOverview(marketId);
  };

  const handleMouseEnter = (marketId: number) => {
    if (marketId !== 0) marketsOverviewActions.highlightMarketOn(String(marketId));
  };

  const handleMouseLeave = (marketId: number) => {
    if (marketId !== 0) marketsOverviewActions.highlightMarketOff(String(marketId));
  };

  const handleColorClick = (e: React.MouseEvent, marketId: number) => {
    e.stopPropagation();
    if (marketId !== 0) colorInputRefs.current[marketId]?.click();
  };

  const handleColorChange = (marketId: number, color: string) => {
    marketsOverviewActions.updateMarketColor(marketId, color);
  };

  const handleRemoveClick = (e: React.MouseEvent, marketId: number) => {
    e.stopPropagation();
    const market = markets.find(row => row.i === marketId);
    if (!market) return;
    openConfirm(
      `Are you sure you want to remove the market "${market.centerName}"?<br>This action cannot be reverted`,
      {
        title: "Remove Market",
        confirm: "Remove",
        cancel: "Cancel",
        onConfirm: () => marketsOverviewActions.removeMarket(marketId)
      }
    );
  };

  return (
    <Dialog isOpen={isOpen} title="Markets Overview" onClose={() => closeDialog("marketsOverview")}>
      <div id="marketsOverviewContainer">
        <div
          id="marketsOverviewHeader"
          className="header"
          style={{
            gridTemplateColumns: isManualMode
              ? "1.6em 7.2em 8em 3.5em"
              : "1.6em 7.2em 8em 3.5em 4.5em 6.5em 6.4em 6em 6em 1.2em"
          }}
        >
          <div />
          <div
            data-tip="Market center burg name. Click to sort"
            className={`sortable alphabetically ${getSortIcon("market", true)} -markets-overview-dialog__margin-left-0`}
            onClick={() => marketsOverviewActions.setSorting("market")}
          >
            Market&nbsp;
          </div>
          <div
            data-tip="Owning state. Click to sort"
            className={`sortable alphabetically ${getSortIcon("owner", true)}`}
            onClick={() => marketsOverviewActions.setSorting("owner")}
          >
            Owner&nbsp;
          </div>
          <div
            data-tip="Number of cells in market territory. Click to sort"
            className={`sortable ${getSortIcon("cells")}`}
            onClick={() => marketsOverviewActions.setSorting("cells")}
          >
            Cells&nbsp;
          </div>
          <div
            data-tip="Number of burgs in market territory. Click to sort"
            className={`sortable hide${isManualMode ? " hidden" : ""} ${getSortIcon("burgs")}`}
            onClick={() => marketsOverviewActions.setSorting("burgs")}
          >
            Burgs&nbsp;
          </div>
          <div
            data-tip="Total stock of all goods. Click to sort"
            className={`sortable hide${isManualMode ? " hidden" : ""} ${getSortIcon("stock")}`}
            onClick={() => marketsOverviewActions.setSorting("stock")}
          >
            Stock&nbsp;
          </div>
          <div
            data-tip="Total gross sales revenue. Click to sort"
            className={`sortable hide${isManualMode ? " hidden" : ""} ${getSortIcon("sales")}`}
            onClick={() => marketsOverviewActions.setSorting("sales")}
          >
            Sales&nbsp;
          </div>
          <div
            data-tip="Total purchase spending. Click to sort"
            className={`sortable hide${isManualMode ? " hidden" : ""} ${getSortIcon("buys")}`}
            onClick={() => marketsOverviewActions.setSorting("buys")}
          >
            Buys&nbsp;
          </div>
          <div
            data-tip="Market value: net trading flow plus unsold inventory value minus tax. Click to sort"
            className={`sortable hide${isManualMode ? " hidden" : ""} ${getSortIcon("value")}`}
            onClick={() => marketsOverviewActions.setSorting("value")}
          >
            Value&nbsp;
          </div>
          <div />
        </div>

        <div
          id="marketsOverviewBody"
          className="table -markets-overview-dialog__max-height-40em--cursor-pointer"
          data-type={isPercentageMode ? "percentage" : "absolute"}
        >
          {markets.length === 0
            ? "No markets available"
            : sortedMarkets.map(m => {
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

                if (m.isNoMarket) {
                  return (
                    <div
                      key={m.i}
                      className={`states market${selectedMarketId === m.i ? " selected" : ""}`}
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
                        className="marketName -markets-overview-dialog__width-7em"
                      >
                        {m.centerName}
                      </div>
                      <div className="marketOwner -markets-overview-dialog__width-8em">{m.ownerName}</div>
                      <div
                        data-tip="Number of cells with no market"
                        data-type="cells"
                        className="marketCells"
                        style={{ width: "3.5em" }}
                      >
                        {displayVal(m.cells, totals.cells)}
                      </div>
                      <div
                        data-tip="Number of burgs with no market"
                        data-type="burgs"
                        className={`marketBurgs hide${isManualMode ? " hidden" : ""}`}
                        style={{ width: "3.5em" }}
                      >
                        {displayVal(m.burgs, totals.burgs)}
                      </div>
                      <div
                        data-type="stock"
                        className={`marketStock hide${isManualMode ? " hidden" : ""} -markets-overview-dialog__width-5em`}
                      >
                        —
                      </div>
                      <div
                        data-type="sales"
                        className={`marketSales hide${isManualMode ? " hidden" : ""} -markets-overview-dialog__width-6em`}
                      >
                        —
                      </div>
                      <div
                        data-type="buys"
                        className={`marketBuysCol hide${isManualMode ? " hidden" : ""} -markets-overview-dialog__width-6em`}
                      >
                        —
                      </div>
                      <div
                        data-type="value"
                        className={`marketValue hide${isManualMode ? " hidden" : ""} -markets-overview-dialog__width-6em`}
                      >
                        —
                      </div>
                      <span className={`hide${isManualMode ? " hidden" : ""}`} style={{ width: "1.2em" }} />
                    </div>
                  );
                }

                return (
                  <div
                    key={m.i}
                    className={`states market${selectedMarketId === m.i ? " selected" : ""}`}
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
                      <input
                        ref={el => {
                          colorInputRefs.current[m.i] = el;
                        }}
                        type="color"
                        value={m.color}
                        tabIndex={-1}
                        aria-hidden="true"
                        className="-markets-overview-dialog__display-none"
                        onClick={event => event.stopPropagation()}
                        onChange={event => handleColorChange(m.i, event.target.value)}
                      />
                    </div>
                    <div
                      data-tip="Market name. Click to view details"
                      className="marketName -markets-overview-dialog__width-7em"
                    >
                      {m.centerName}
                    </div>
                    <div data-tip="Owning state" className="marketOwner -markets-overview-dialog__width-8em">
                      {m.ownerName}
                    </div>
                    <div
                      data-tip="Number of cells in market territory"
                      data-type="cells"
                      className="marketCells"
                      style={{ width: "3.5em" }}
                    >
                      {displayVal(m.cells, totals.cells)}
                    </div>
                    <div
                      data-tip="Number of burgs in market territory"
                      data-type="burgs"
                      className={`marketBurgs hide${isManualMode ? " hidden" : ""}`}
                      style={{ width: "3.5em" }}
                    >
                      {displayVal(m.burgs, totals.burgs)}
                    </div>
                    <div
                      data-tip="Total stock of all goods in this market"
                      data-type="stock"
                      className={`marketStock hide${isManualMode ? " hidden" : ""} -markets-overview-dialog__width-5em`}
                    >
                      {displayVal(m.stock, totals.stock)}
                    </div>
                    <div
                      data-tip="Total gross sales revenue"
                      data-type="sales"
                      className={`marketSales hide${isManualMode ? " hidden" : ""} -markets-overview-dialog__width-6em`}
                    >
                      {displayPrice(m.sales, totals.sales)}
                    </div>
                    <div
                      data-tip="Total purchase spending"
                      data-type="buys"
                      className={`marketBuysCol hide${isManualMode ? " hidden" : ""} -markets-overview-dialog__width-6em`}
                    >
                      {displayPrice(m.buys, totals.buys)}
                    </div>
                    <div
                      data-tip="Market value: net trading flow plus unsold inventory value minus tax"
                      data-type="value"
                      className={`marketValue hide${isManualMode ? " hidden" : ""} -markets-overview-dialog__width-6em`}
                    >
                      {displayPrice(m.value, totals.value)}
                    </div>
                    <span
                      data-tip="Remove this market"
                      className={`icon-trash-empty hiddenIcon hide${isManualMode ? " hidden" : ""} -markets-overview-dialog__visibility-hidden`}
                      onClick={e => handleRemoveClick(e, m.i)}
                    />
                  </div>
                );
              })}
        </div>

        <div id="marketsOverviewFooter" className="totalLine" style={{ display: isManualMode ? "none" : "block" }}>
          <div data-tip="Total number of markets" className="-markets-overview-dialog__margin-left-5">
            Markets:&nbsp;<span id="marketsOverviewFooterMarkets">{totalMarkets}</span>
          </div>
          <div data-tip="Average gross sales revenue per market" className="-markets-overview-dialog__margin-left-12">
            Avg Sales:&nbsp;<span id="marketsOverviewFooterSales">{formatPrice(avgSales)}</span>
          </div>
          <div data-tip="Average purchase spending per market" className="-markets-overview-dialog__margin-left-12">
            Avg Buys:&nbsp;<span id="marketsOverviewFooterBuys">{formatPrice(avgBuys)}</span>
          </div>
          <div data-tip="Average market value per market" className="-markets-overview-dialog__margin-left-12">
            Avg Value:&nbsp;<span id="marketsOverviewFooterValue">{formatPrice(avgValue)}</span>
          </div>
        </div>

        <div id="marketsOverviewBottom">
          {!isManualMode && (
            <>
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
                onClick={marketsOverviewActions.openMarketCompare}
              />
              <button
                type="button"
                id="marketsOverviewExport"
                data-tip="Save markets data as a CSV file"
                className="icon-download"
                onClick={marketsOverviewActions.downloadMarketsCsv}
              />
            </>
          )}
          <button
            type="button"
            id="marketsManually"
            data-tip="Manually re-assign market territories"
            className={`icon-brush${isManualMode ? " pressed" : ""}`}
            onClick={marketsOverviewActions.toggleManualAssignment}
          />
          <div id="marketsManuallyButtons" style={{ display: isManualMode ? "inline-block" : "none" }}>
            <input
              type="range"
              id="marketsBrush"
              min="5"
              max="100"
              step="1"
              value={brushSize}
              data-tip="Brush size"
              className="-markets-overview-dialog__display-inline-block--width-6em--vertical-align-mi"
              onChange={e => marketsOverviewActions.setBrushSize(parseInt(e.target.value, 10))}
            />
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
            className={`icon-plus${isAddMode ? " pressed" : ""}`}
            onClick={marketsOverviewActions.toggleAddMarketMode}
          />
          <button
            type="button"
            id="marketsRegenerate"
            data-tip="Regenerate markets and their territories"
            className="icon-arrows-cw"
            onClick={() => setIsRegenerateMarketsDialogOpen(true)}
          />
          <button
            type="button"
            id="marketsRegenerateProduction"
            data-tip="Regenerate production and trade deals"
            className="icon-retweet"
            onClick={() => setIsRegenerateProductionDialogOpen(true)}
          />
        </div>

        <Dialog
          isOpen={isRegenerateMarketsDialogOpen}
          title="Regenerate markets"
          onClose={() => setIsRegenerateMarketsDialogOpen(false)}
          buttons={[
            { label: "Cancel", onClick: () => setIsRegenerateMarketsDialogOpen(false) },
            {
              label: "Regenerate",
              onClick: () => {
                marketsOverviewActions.regenerateMarkets(regenerateTradeAlongsideMarkets);
                setIsRegenerateMarketsDialogOpen(false);
                setRegenerateTradeAlongsideMarkets(true);
              }
            }
          ]}
        >
          <div style={{ display: "grid", gap: "0.8em" }}>
            <div>Are you sure you want to regenerate markets and their territories?</div>
            <label style={{ display: "flex", alignItems: "center", gap: ".4em" }}>
              <input
                type="checkbox"
                className="native"
                checked={regenerateTradeAlongsideMarkets}
                onChange={e => setRegenerateTradeAlongsideMarkets(e.target.checked)}
              />
              Regenerate production and trade
            </label>
          </div>
        </Dialog>

        <Dialog
          isOpen={isRegenerateProductionDialogOpen}
          title="Regenerate production"
          onClose={() => setIsRegenerateProductionDialogOpen(false)}
          buttons={[
            { label: "Cancel", onClick: () => setIsRegenerateProductionDialogOpen(false) },
            {
              label: "Regenerate",
              onClick: () => {
                marketsOverviewActions.regenerateProduction();
                setIsRegenerateProductionDialogOpen(false);
              }
            }
          ]}
        >
          <div>
            Are you sure you want to regenerate production and trade for all goods? Generation will be based on the
            current Goods settings and bonus goods placement.
          </div>
        </Dialog>
      </div>
    </Dialog>
  );
};
