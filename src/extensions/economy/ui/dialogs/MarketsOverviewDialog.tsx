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
    openConfirm(t("extensions.marketsOverview.removeMessage", { name: market.centerName }), {
      title: t("extensions.marketsOverview.removeTitle"),
      confirm: t("extensions.marketsOverview.removeConfirm"),
      cancel: t("common.cancel"),
      onConfirm: () => marketsOverviewActions.removeMarket(marketId)
    });
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
                  data-tip={t("extensions.marketsOverview.marketTip")}
                  className={`sortable alphabetically ${getSortIcon("market", true)}`}
                  onClick={() => marketsOverviewActions.setSorting("market")}
                >
                  {t("extensions.marketsOverview.market")}
                </th>
                <th
                  data-tip={t("extensions.marketsOverview.managerTip")}
                  className={`sortable alphabetically ${getSortIcon("manager", true)}`}
                  onClick={() => marketsOverviewActions.setSorting("manager")}
                >
                  {t("extensions.marketsOverview.manager")}
                </th>
                <th
                  data-tip={t("extensions.marketsOverview.cellsTip")}
                  className={`sortable ${getSortIcon("cells")}`}
                  onClick={() => marketsOverviewActions.setSorting("cells")}
                >
                  {t("extensions.marketsOverview.cells")}
                </th>
                {!isManualMode && (
                  <>
                    <th
                      data-tip={t("extensions.marketsOverview.burgsTip")}
                      className={`sortable ${getSortIcon("burgs")}`}
                      onClick={() => marketsOverviewActions.setSorting("burgs")}
                    >
                      {t("extensions.marketsOverview.burgs")}
                    </th>
                    <th
                      data-tip={t("extensions.marketsOverview.populationTip")}
                      className={`sortable ${getSortIcon("population")}`}
                      onClick={() => marketsOverviewActions.setSorting("population")}
                    >
                      {t("extensions.marketsOverview.population")}
                    </th>
                    <th
                      data-tip={t("extensions.marketsOverview.stockTip")}
                      className={`sortable ${getSortIcon("stock")}`}
                      onClick={() => marketsOverviewActions.setSorting("stock")}
                    >
                      {t("extensions.marketsOverview.stock")}
                    </th>
                    <th
                      data-tip={t("extensions.marketsOverview.salesTip")}
                      className={`sortable ${getSortIcon("sales")}`}
                      onClick={() => marketsOverviewActions.setSorting("sales")}
                    >
                      {t("extensions.marketsOverview.sales")}
                    </th>
                    <th
                      data-tip={t("extensions.marketsOverview.buysTip")}
                      className={`sortable ${getSortIcon("buys")}`}
                      onClick={() => marketsOverviewActions.setSorting("buys")}
                    >
                      {t("extensions.marketsOverview.buys")}
                    </th>
                    <th
                      data-tip={t("extensions.marketsOverview.valueTip")}
                      className={`sortable ${getSortIcon("value")}`}
                      onClick={() => marketsOverviewActions.setSorting("value")}
                    >
                      {t("extensions.marketsOverview.value")}
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
                    <span>{t("extensions.marketsOverview.empty")}</span>
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
                        <td data-tip={t("extensions.marketsOverview.noMarketAssignedTip")}>
                          <FillBox fill="none" />
                        </td>
                        <td className="marketName" data-tip={t("extensions.marketsOverview.noMarketNameTip")}>
                          {m.centerName}
                        </td>
                        <td className="marketOwner" data-tip={t("extensions.marketsOverview.noMarketNameTip")}>
                          {m.managerName}
                        </td>
                        <td
                          className="marketCells numeric"
                          data-tip={t("extensions.marketsOverview.noMarketCellsTip")}
                          data-type="cells"
                        >
                          {displayVal(m.cells, totals.cells)}
                        </td>
                        {!isManualMode && (
                          <>
                            <td
                              className="marketBurgs numeric"
                              data-tip={t("extensions.marketsOverview.noMarketBurgsTip")}
                              data-type="burgs"
                            >
                              {displayVal(m.burgs, totals.burgs)}
                            </td>
                            <td
                              className="marketPopulation numeric"
                              data-tip={t("extensions.marketsOverview.noMarketPopTip")}
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
                      <td className="marketName" data-tip={t("extensions.marketsOverview.marketNameClickTip")}>
                        {m.centerName}
                      </td>
                      <td
                        className={`marketOwner ${m.managerId !== undefined ? "pointer actionLink" : ""}`}
                        data-tip={
                          m.managerId !== undefined
                            ? t("extensions.marketsOverview.managerClickTip")
                            : t("extensions.marketsOverview.managerNoClickTip")
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
                        data-tip={t("extensions.marketsOverview.cellsCountTip")}
                        data-type="cells"
                      >
                        {displayVal(m.cells, totals.cells)}
                      </td>
                      {!isManualMode && (
                        <>
                          <td
                            className="marketBurgs numeric"
                            data-tip={t("extensions.marketsOverview.burgsCountTip")}
                            data-type="burgs"
                          >
                            {displayVal(m.burgs, totals.burgs)}
                          </td>
                          <td
                            className="marketPopulation numeric"
                            data-tip={t("extensions.marketsOverview.popCountTip")}
                            data-type="population"
                          >
                            {displayPop(m.population, totals.population)}
                          </td>
                          <td
                            className="marketStock numeric"
                            data-tip={t("extensions.marketsOverview.stockCountTip")}
                            data-type="stock"
                          >
                            {displayVal(m.stock, totals.stock)}
                          </td>
                          <td
                            className="marketSales numeric"
                            data-tip={t("extensions.marketsOverview.salesCountTip")}
                            data-type="sales"
                          >
                            {displayPrice(m.sales, totals.sales)}
                          </td>
                          <td
                            className="marketBuysCol numeric"
                            data-tip={t("extensions.marketsOverview.buysCountTip")}
                            data-type="buys"
                          >
                            {displayPrice(m.buys, totals.buys)}
                          </td>
                          <td
                            className="marketValue numeric"
                            data-tip={t("extensions.marketsOverview.valueCountTip")}
                            data-type="value"
                          >
                            {displayPrice(m.value, totals.value)}
                          </td>
                          <td>
                            <IconButton
                              data-tip={t("extensions.marketsOverview.removeTip")}
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
          <div data-tip={t("extensions.marketsOverview.totalsMarketsTip")}>
            {t("extensions.marketsOverview.totalsMarkets")}
            <span id="marketsOverviewFooterMarkets">{totalMarkets}</span>
          </div>
          <div data-tip={t("extensions.marketsOverview.avgSalesTip")}>
            {t("extensions.marketsOverview.avgSales")}
            <span id="marketsOverviewFooterSales">{formatPrice(avgSales)}</span>
          </div>
          <div data-tip={t("extensions.marketsOverview.avgBuysTip")}>
            {t("extensions.marketsOverview.avgBuys")}
            <span id="marketsOverviewFooterBuys">{formatPrice(avgBuys)}</span>
          </div>
          <div data-tip={t("extensions.marketsOverview.avgValueTip")}>
            {t("extensions.marketsOverview.avgValue")}
            <span id="marketsOverviewFooterValue">{formatPrice(avgValue)}</span>
          </div>
        </div>

        <div id="marketsOverviewBottom" className="footer">
          {!isManualMode && (
            <>
              <button
                type="button"
                id="marketsOverviewRefresh"
                data-tip={t("extensions.marketsOverview.refreshTip")}
                className="icon-cw"
                onClick={marketsOverviewActions.marketsOverviewAddLines}
              />
              <button
                type="button"
                id="marketsOverviewPercentage"
                data-tip={t("extensions.marketsOverview.percentageTip")}
                className="icon-percent"
                onClick={marketsOverviewActions.togglePercentageMode}
              />
              <button
                type="button"
                id="marketsOverviewCompare"
                data-tip={t("extensions.marketsOverview.compareTip")}
                className="icon-chart-bar"
                onClick={marketsOverviewActions.openMarketCompare}
              />
              <button
                type="button"
                id="marketsOverviewTradeOpportunities"
                data-tip={t("extensions.marketsOverview.opportunitiesTip")}
                className="icon-exchange"
                onClick={marketsOverviewActions.openTradeOpportunities}
              />
              <button
                type="button"
                id="marketsOverviewExport"
                data-tip={t("extensions.marketsOverview.exportTip")}
                className="icon-download"
                onClick={marketsOverviewActions.downloadMarketsCsv}
              />
            </>
          )}
          <button
            type="button"
            id="marketsManually"
            data-tip={t("extensions.marketsOverview.manualTip")}
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
              data-tip={t("extensions.marketsOverview.brushSize")}
              className="d-inline-block"
              onChange={e => marketsOverviewActions.setBrushSize(parseInt(e.target.value, 10))}
            />
            <button
              type="button"
              id="marketsManuallyUndo"
              data-tip={t("extensions.marketsOverview.undoTip")}
              className="icon-ccw"
              onClick={marketsOverviewActions.undoMarketsManualStep}
            />
            <button
              type="button"
              id="marketsManuallyApply"
              data-tip={t("extensions.marketsOverview.applyTip")}
              className="icon-check"
              onClick={() => marketsOverviewActions.exitMarketsManualAssignment(true)}
            />
            <button
              type="button"
              id="marketsManuallyCancel"
              data-tip={t("extensions.marketsOverview.cancelTip")}
              className="icon-cancel"
              onClick={() => marketsOverviewActions.exitMarketsManualAssignment(false)}
            />
          </div>
          <button
            type="button"
            id="marketsAdd"
            data-tip={t("extensions.marketsOverview.addTip")}
            className={`icon-plus${isAddMode ? " pressed" : ""}`}
            onClick={marketsOverviewActions.toggleAddMarketMode}
          />
          <button
            type="button"
            id="marketsRegenerate"
            data-tip={t("extensions.marketsOverview.regenerateMarketsTip")}
            className="icon-arrows-cw"
            onClick={() => setIsRegenerateMarketsDialogOpen(true)}
          />
          <button
            type="button"
            id="marketsRegenerateProduction"
            data-tip={t("extensions.marketsOverview.regenerateProductionTip")}
            className="icon-retweet"
            onClick={() => setIsRegenerateProductionDialogOpen(true)}
          />
        </div>

        <Dialog
          isOpen={isRegenerateMarketsDialogOpen}
          title={t("extensions.marketsOverview.regenerateMarketsTitle")}
          onClose={() => setIsRegenerateMarketsDialogOpen(false)}
          buttons={[
            { label: t("common.cancel"), onClick: () => setIsRegenerateMarketsDialogOpen(false) },
            {
              label: t("extensions.marketsOverview.regenerate"),
              onClick: () => {
                marketsOverviewActions.regenerateMarkets(regenerateTradeAlongsideMarkets);
                setIsRegenerateMarketsDialogOpen(false);
                setRegenerateTradeAlongsideMarkets(true);
              }
            }
          ]}
        >
          <div className="d-grid">
            <div>{t("extensions.marketsOverview.regenerateMarketsBody")}</div>
            <label className="d-flex">
              <input
                type="checkbox"
                className="native"
                checked={regenerateTradeAlongsideMarkets}
                onChange={e => setRegenerateTradeAlongsideMarkets(e.target.checked)}
              />
              {t("extensions.marketsOverview.regenerateTradeToo")}
            </label>
          </div>
        </Dialog>

        <Dialog
          isOpen={isRegenerateProductionDialogOpen}
          title={t("extensions.marketsOverview.regenerateProductionTitle")}
          onClose={() => setIsRegenerateProductionDialogOpen(false)}
          buttons={[
            { label: t("common.cancel"), onClick: () => setIsRegenerateProductionDialogOpen(false) },
            {
              label: t("extensions.marketsOverview.regenerate"),
              onClick: () => {
                marketsOverviewActions.regenerateProduction();
                setIsRegenerateProductionDialogOpen(false);
              }
            }
          ]}
        >
          <div>{t("extensions.marketsOverview.regenerateProductionBody")}</div>
        </Dialog>
      </div>
    </Dialog>
  );
};
