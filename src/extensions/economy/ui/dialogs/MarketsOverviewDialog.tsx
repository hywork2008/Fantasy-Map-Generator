import React from "react";
import { useTranslation } from "react-i18next";
import { useCharactersUiState } from "../../../characters/ui/charactersUiState";
import {
  closeDialog,
  Dialog,
  FillBox,
  IconButton,
  openConfirm,
  openDialog,
  useDialogState,
  VirtualTableBody
} from "../../../hostUi";
import { formatPrice, si } from "../../../hostUtils";

import {
  closeMarketsOverview,
  marketsOverviewActions,
  open as openMarketsOverview
} from "../../controllers/markets-overview";
import { useMarketsOverviewState } from "../../store/marketsOverviewState";

export const MarketsOverviewDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("marketsOverview"));
  const {
    markets,
    totalMarkets,
    avgSales,
    avgBuys,
    avgValue,
    totalPopulation,
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
      value: markets.reduce((sum, row) => sum + row.value, 0),
      population: totalPopulation
    }),
    [markets, totalPopulation]
  );

  const sortedMarkets = React.useMemo(() => {
    const rows = [...markets];
    rows.sort((left, right) => {
      const leftValue =
        sortBy === "market"
          ? left.centerName.toLowerCase()
          : sortBy === "manager"
            ? left.managerName.toLowerCase()
            : (left[sortBy as keyof typeof left] ?? "");
      const rightValue =
        sortBy === "market"
          ? right.centerName.toLowerCase()
          : sortBy === "manager"
            ? right.managerName.toLowerCase()
            : (right[sortBy as keyof typeof right] ?? "");

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

  const parentRef = React.useRef<HTMLDivElement>(null);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.marketsOverview")}
      onClose={() => closeDialog("marketsOverview")}
      className="fmg-dialog--table"
    >
      <div id="marketsOverviewContainer">
        <div
          ref={parentRef}
          id="marketsOverviewBody"
          className="table"
          data-type={isPercentageMode ? "percentage" : "absolute"}
        >
          <table className="fmg-table">
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              {!isManualMode && (
                <>
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                </>
              )}
            </colgroup>
            <thead id="marketsOverviewHeader">
              <tr className="header">
                <th />
                <th
                  data-tip="Market center burg name. Click to sort"
                  className={`sortable alphabetically ${getSortIcon("market", true)}`}
                  onClick={() => marketsOverviewActions.setSorting("market")}
                >
                  Market
                </th>
                <th
                  data-tip="Responsible market manager character. Click to sort"
                  className={`sortable alphabetically ${getSortIcon("manager", true)}`}
                  onClick={() => marketsOverviewActions.setSorting("manager")}
                >
                  Manager
                </th>
                <th
                  data-tip="Number of cells in market territory. Click to sort"
                  className={`sortable ${getSortIcon("cells")}`}
                  onClick={() => marketsOverviewActions.setSorting("cells")}
                >
                  Cells
                </th>
                {!isManualMode && (
                  <>
                    <th
                      data-tip="Number of burgs in market territory. Click to sort"
                      className={`sortable ${getSortIcon("burgs")}`}
                      onClick={() => marketsOverviewActions.setSorting("burgs")}
                    >
                      Burgs
                    </th>
                    <th
                      data-tip="Total population of all burgs in market territory. Click to sort"
                      className={`sortable ${getSortIcon("population")}`}
                      onClick={() => marketsOverviewActions.setSorting("population")}
                    >
                      Population
                    </th>
                    <th
                      data-tip="Total stock of all goods. Click to sort"
                      className={`sortable ${getSortIcon("stock")}`}
                      onClick={() => marketsOverviewActions.setSorting("stock")}
                    >
                      Stock
                    </th>
                    <th
                      data-tip="Total gross sales revenue. Click to sort"
                      className={`sortable ${getSortIcon("sales")}`}
                      onClick={() => marketsOverviewActions.setSorting("sales")}
                    >
                      Sales
                    </th>
                    <th
                      data-tip="Total purchase spending. Click to sort"
                      className={`sortable ${getSortIcon("buys")}`}
                      onClick={() => marketsOverviewActions.setSorting("buys")}
                    >
                      Buys
                    </th>
                    <th
                      data-tip="Market value: net trading flow plus unsold inventory value minus tax. Click to sort"
                      className={`sortable ${getSortIcon("value")}`}
                      onClick={() => marketsOverviewActions.setSorting("value")}
                    >
                      Value
                    </th>
                    <th />
                  </>
                )}
              </tr>
            </thead>
            {markets.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={isManualMode ? 4 : 10}>
                    <span>No markets available</span>
                  </td>
                </tr>
              </tbody>
            ) : (
              <VirtualTableBody
                items={sortedMarkets}
                scrollElementRef={parentRef}
                renderRow={m => {
                  const displayVal = (val: number, total: number) => {
                    if (!isPercentageMode) return val;
                    return total ? `${((val / total) * 100).toFixed(2)}%` : "0%";
                  };
                  const displayPrice = (val: number, total: number) => {
                    if (!isPercentageMode) return formatPrice(val);
                    return total ? `${((val / total) * 100).toFixed(2)}%` : "0%";
                  };
                  const displayPop = (val: number, total: number) => {
                    if (!isPercentageMode) return si(val);
                    return total ? `${((val / total) * 100).toFixed(2)}%` : "0%";
                  };

                  const commonRowProps = {
                    className: `states market${selectedMarketId === m.i ? " selected" : ""}`,
                    "data-id": m.i,
                    "data-market": m.centerName,
                    "data-manager": m.managerName,
                    "data-cells": m.cells,
                    "data-burgs": m.burgs,
                    "data-population": m.population,
                    "data-stock": m.stock,
                    "data-sales": m.sales,
                    "data-buys": m.buys,
                    "data-value": m.value
                  };

                  if (m.isNoMarket) {
                    return (
                      <tr key={m.i} {...commonRowProps} onClick={() => handleRowClick(m.i)}>
                        <td data-tip="Cells assigned to no market">
                          <FillBox fill="none" />
                        </td>
                        <td
                          className="marketName"
                          data-tip="Cells with no market; their burgs are excluded from production"
                        >
                          {m.centerName}
                        </td>
                        <td
                          className="marketOwner"
                          data-tip="Cells with no market; their burgs are excluded from production"
                        >
                          {m.managerName}
                        </td>
                        <td className="marketCells numeric" data-tip="Number of cells with no market" data-type="cells">
                          {displayVal(m.cells, totals.cells)}
                        </td>
                        {!isManualMode && (
                          <>
                            <td
                              className="marketBurgs numeric"
                              data-tip="Number of burgs with no market"
                              data-type="burgs"
                            >
                              {displayVal(m.burgs, totals.burgs)}
                            </td>
                            <td
                              className="marketPopulation numeric"
                              data-tip="Total population with no market"
                              data-type="population"
                            >
                              {displayPop(m.population, totals.population)}
                            </td>
                            <td className="marketStock numeric" data-type="stock">
                              —
                            </td>
                            <td className="marketSales numeric" data-type="sales">
                              —
                            </td>
                            <td className="marketBuysCol numeric" data-type="buys">
                              —
                            </td>
                            <td className="marketValue numeric" data-type="value">
                              —
                            </td>
                            <td />
                          </>
                        )}
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={m.i}
                      {...commonRowProps}
                      onClick={() => handleRowClick(m.i)}
                      onMouseEnter={() => handleMouseEnter(m.i)}
                      onMouseLeave={() => handleMouseLeave(m.i)}
                    >
                      <td onClick={e => handleColorClick(e, m.i)}>
                        <FillBox fill={m.color} />
                        <input
                          ref={el => {
                            colorInputRefs.current[m.i] = el;
                          }}
                          type="color"
                          value={m.color}
                          tabIndex={-1}
                          aria-hidden="true"
                          className="d-none"
                          onClick={event => event.stopPropagation()}
                          onChange={event => handleColorChange(m.i, event.target.value)}
                        />
                      </td>
                      <td className="marketName" data-tip="Market name. Click to view details">
                        {m.centerName}
                      </td>
                      <td
                        className={`marketOwner ${m.managerId !== undefined ? "pointer actionLink" : ""}`}
                        data-tip={
                          m.managerId !== undefined
                            ? "Responsible market manager character. Click to view details"
                            : "Responsible market manager character"
                        }
                        onClick={e => {
                          if (m.managerId !== undefined) {
                            e.stopPropagation();
                            useCharactersUiState.getState().openCharacterDetails(m.managerId);
                            openDialog("characterDetails");
                          }
                        }}
                      >
                        {m.managerName}
                      </td>
                      <td
                        className="marketCells numeric"
                        data-tip="Number of cells in market territory"
                        data-type="cells"
                      >
                        {displayVal(m.cells, totals.cells)}
                      </td>
                      {!isManualMode && (
                        <>
                          <td
                            className="marketBurgs numeric"
                            data-tip="Number of burgs in market territory"
                            data-type="burgs"
                          >
                            {displayVal(m.burgs, totals.burgs)}
                          </td>
                          <td
                            className="marketPopulation numeric"
                            data-tip="Total population in market territory"
                            data-type="population"
                          >
                            {displayPop(m.population, totals.population)}
                          </td>
                          <td
                            className="marketStock numeric"
                            data-tip="Total stock of all goods in this market"
                            data-type="stock"
                          >
                            {displayVal(m.stock, totals.stock)}
                          </td>
                          <td className="marketSales numeric" data-tip="Total gross sales revenue" data-type="sales">
                            {displayPrice(m.sales, totals.sales)}
                          </td>
                          <td className="marketBuysCol numeric" data-tip="Total purchase spending" data-type="buys">
                            {displayPrice(m.buys, totals.buys)}
                          </td>
                          <td
                            className="marketValue numeric"
                            data-tip="Market value: net trading flow plus unsold inventory value minus tax"
                            data-type="value"
                          >
                            {displayPrice(m.value, totals.value)}
                          </td>
                          <td>
                            <IconButton
                              data-tip="Remove this market"
                              className="icon-trash-empty hiddenIcon"
                              onClick={e => handleRemoveClick(e, m.i)}
                            />
                          </td>
                        </>
                      )}
                    </tr>
                  );
                }}
              />
            )}
          </table>
        </div>

        <div id="marketsOverviewFooter" className="totalLine" style={{ display: isManualMode ? "none" : "block" }}>
          <div data-tip="Total number of markets">
            Markets:<span id="marketsOverviewFooterMarkets">{totalMarkets}</span>
          </div>
          <div data-tip="Average gross sales revenue per market">
            Avg Sales:<span id="marketsOverviewFooterSales">{formatPrice(avgSales)}</span>
          </div>
          <div data-tip="Average purchase spending per market">
            Avg Buys:<span id="marketsOverviewFooterBuys">{formatPrice(avgBuys)}</span>
          </div>
          <div data-tip="Average market value per market">
            Avg Value:<span id="marketsOverviewFooterValue">{formatPrice(avgValue)}</span>
          </div>
        </div>

        <div id="marketsOverviewBottom" className="footer">
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
                id="marketsOverviewTradeOpportunities"
                data-tip="Find buy-low / sell-high routes across markets"
                className="icon-exchange"
                onClick={marketsOverviewActions.openTradeOpportunities}
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
              className="d-inline-block"
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
          <div className="d-grid">
            <div>Are you sure you want to regenerate markets and their territories?</div>
            <label className="d-flex">
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
