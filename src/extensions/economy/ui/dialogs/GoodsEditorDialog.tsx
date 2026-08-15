import React from "react";
import { useTranslation } from "react-i18next";
import { closeDialog, Dialog, IconButton, SortableHeader, useDialogState, VirtualTableBody } from "../../../hostUi";
import { formatPrice, rn } from "../../../hostUtils";

import {
  addGood,
  closeGoodsEditor,
  downloadGoodsData,
  editGoodDistribution,
  enterResourceAssignMode,
  goodsEditorAddLines,
  goodsRestoreDefaults,
  handleGoodRowClick,
  open as openGoodsEditor,
  openProducersDialog,
  openStockDialog,
  openTagsVisibilityDialog,
  removeGood,
  requestGoodsRegeneration,
  requestProductionRegeneration,
  resetGoodsCumulativeMarketIntake,
  toggleAllDisplayed,
  toggleDisplayedGood,
  togglePercentageMode,
  toggleSortBy
} from "../../controllers/goods-editor";
import { useGoodsEditorTableState } from "../../store/goodsEditorTableState";

const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const { t } = useTranslation();
  const tip = type === "RAW" ? t("extensions.goodsEditor.rawTip") : t("extensions.goodsEditor.mfgTip");
  return <span data-tip={tip}>{type}</span>;
};

export const GoodsEditorDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("goodsEditor"));
  const {
    goods,
    totalProduced,
    totalStock,
    totalCumulativeMarketIntake,
    totalActualOutput,
    displayedCount,
    isPercentageMode,
    hasTagFilter,
    isAssignMode,
    selectedAssignGoodId,
    sortBy,
    sortOrder
  } = useGoodsEditorTableState();

  React.useEffect(() => {
    if (isOpen) openGoodsEditor();
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("fmg:gunpowder-era-changed", goodsEditorAddLines);
    return () => document.removeEventListener("fmg:gunpowder-era-changed", goodsEditorAddLines);
  }, [isOpen]);

  const handleClose = () => {
    closeGoodsEditor();
    closeDialog("goodsEditor");
  };

  const parentRef = React.useRef<HTMLDivElement>(null);
  // VirtualTableBody measures every supplied row. Supplying tag-filtered rows
  // with `display: none` makes their zero-height measurements persist across
  // filter changes, so the visible range depends on the order of tag choices.
  const visibleGoods = goods.filter(good => good.isTagVisible);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.goodsEditor")}
      onClose={handleClose}
      className="fmg-dialog--table"
    >
      <div id="goodsEditorContainer">
        <div ref={parentRef} id="goodsBody" className="table" data-type={isPercentageMode ? "percentage" : "absolute"}>
          <table className="fmg-table">
            <colgroup>
              {isAssignMode ? (
                <>
                  <col />
                  <col />
                  <col />
                </>
              ) : (
                <>
                  <col />
                  <col />
                  <col />
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
            <thead id="goodsHeader">
              <tr className="header">
                {isAssignMode ? (
                  <>
                    <th />
                    <SortableHeader
                      field="name"
                      label={t("extensions.goodsEditor.name")}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      tip={t("extensions.goodsEditor.nameTip")}
                    />
                    <SortableHeader
                      field="type"
                      label={t("extensions.goodsEditor.type")}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      tip={t("extensions.goodsEditor.typeTip")}
                    />
                  </>
                ) : (
                  <>
                    <SortableHeader
                      field="isDisplayed"
                      label={t("extensions.goodsEditor.display")}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip={t("extensions.goodsEditor.displayTip")}
                    />
                    <SortableHeader
                      field="name"
                      label={t("extensions.goodsEditor.name")}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      tip={t("extensions.goodsEditor.nameTip")}
                    />
                    <SortableHeader
                      field="type"
                      label={t("extensions.goodsEditor.type")}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      tip={t("extensions.goodsEditor.typeTip")}
                    />
                    <SortableHeader
                      field="produced"
                      label={t("extensions.goodsEditor.potential")}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip={t("extensions.goodsEditor.potentialTip")}
                    />
                    <SortableHeader
                      field="stock"
                      label={t("extensions.goodsEditor.stock")}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip={t("extensions.goodsEditor.stockTip")}
                    />
                    <SortableHeader
                      field="cumulativeMarketIntake"
                      label={t("extensions.goodsEditor.marketOutput")}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip={t("extensions.goodsEditor.marketOutputTip")}
                    />
                    <SortableHeader
                      field="actualOutput"
                      label={t("extensions.goodsEditor.actualOutput")}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip={t("extensions.goodsEditor.actualOutputTip")}
                    />
                    <th data-tip={t("extensions.goodsEditor.foodFlowTip")} className="sortable number">
                      {t("extensions.goodsEditor.foodFlow")}
                    </th>
                    <SortableHeader
                      field="resourceCells"
                      label={t("extensions.goodsEditor.cells")}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip={t("extensions.goodsEditor.cellsTip")}
                    />
                    <SortableHeader
                      field="productionPerThousand"
                      label={t("extensions.goodsEditor.perK")}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip={t("extensions.goodsEditor.perKTip")}
                    />
                    <SortableHeader
                      field="baseprice"
                      label={t("extensions.goodsEditor.price")}
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip={t("extensions.goodsEditor.priceTip")}
                    />
                    <th />
                  </>
                )}
              </tr>
            </thead>
            <VirtualTableBody
              items={visibleGoods}
              scrollElementRef={parentRef}
              renderRow={good => {
                const localizedName = t(`economy.goods.names.${good.name}`, { defaultValue: good.name });
                const displayedProduced = isPercentageMode
                  ? `${rn(totalProduced ? (good.produced / totalProduced) * 100 : 0, 2)}%`
                  : String(good.produced);
                const displayedStock = isPercentageMode
                  ? `${rn(totalStock ? (good.stock / totalStock) * 100 : 0, 2)}%`
                  : String(good.stock);
                const displayedCumulativeMarketIntake = isPercentageMode
                  ? `${rn(totalCumulativeMarketIntake ? (good.cumulativeMarketIntake / totalCumulativeMarketIntake) * 100 : 0, 2)}%`
                  : String(good.cumulativeMarketIntake);
                const displayedActualFoodOutput = isPercentageMode
                  ? `${rn(totalActualOutput ? (good.actualOutput / totalActualOutput) * 100 : 0, 2)}%`
                  : String(good.actualOutput);
                const priceTip = good.unitFlavor?.itemsPerUnit
                  ? t("economy.goodsUnitFlavor.batch", {
                      count: good.unitFlavor.itemsPerUnit,
                      noun: good.unitFlavor.itemNoun
                        ? t(`economy.goodsUnitFlavor.itemNoun.${good.unitFlavor.itemNoun}`)
                        : "",
                      price: formatPrice(good.basePrice / good.unitFlavor.itemsPerUnit)
                    })
                  : good.unitFlavor?.retailReference
                    ? t("economy.goodsUnitFlavor.retail", good.unitFlavor.retailReference)
                    : t("extensions.goodsEditor.priceCompareTip");

                return (
                  <tr
                    key={good.i}
                    className={`states goods${isAssignMode && selectedAssignGoodId === good.i ? " selected" : ""}`}
                    data-id={good.i}
                    data-name={good.name}
                    data-color={good.color}
                    data-baseprice={good.basePrice}
                    data-produced={good.produced}
                    data-stock={good.stock}
                    data-cumulative-market-intake={good.cumulativeMarketIntake}
                    data-actual-output={good.actualOutput}
                    data-resource-cells={good.resourceCells}
                    data-production-per-thousand={good.productionPerThousand}
                    data-type={good.types.join(",")}
                    data-tags={good.tags.join(",")}
                    onClick={() => handleGoodRowClick(good.i)}
                  >
                    {isAssignMode ? (
                      <td>
                        <svg
                          aria-label={localizedName}
                          data-tip={t("extensions.goodsEditor.goodIcon")}
                          width="2em"
                          height="2em"
                          className="goodIcon"
                        >
                          <circle cx="50%" cy="50%" r="42%" fill={good.color} stroke={good.strokeColor} />
                          <use href={`#${good.icon}`} x="10%" y="10%" width="80%" height="80%" />
                        </svg>
                      </td>
                    ) : (
                      <td>
                        <input
                          type="checkbox"
                          data-tip={t("extensions.goodsEditor.toggleMapTip")}
                          className="native goodDisplayed"
                          checked={good.isDisplayed}
                          onChange={e => {
                            e.stopPropagation();
                            toggleDisplayedGood(good.i, e.target.checked);
                          }}
                        />
                        <svg
                          aria-label={localizedName}
                          data-tip={t("extensions.goodsEditor.goodIcon")}
                          width="2em"
                          height="2em"
                          className="goodIcon"
                        >
                          <circle cx="50%" cy="50%" r="42%" fill={good.color} stroke={good.strokeColor} />
                          <use href={`#${good.icon}`} x="10%" y="10%" width="80%" height="80%" />
                        </svg>
                      </td>
                    )}
                    <td data-tip={t("extensions.goodsEditor.goodName")} className="goodName">
                      {localizedName}
                    </td>
                    <td data-tip={t("extensions.goodsEditor.goodTypes")} className="goodType">
                      {good.types.map(t => (
                        <TypeBadge key={t} type={t} />
                      ))}
                    </td>
                    {!isAssignMode && (
                      <>
                        <td
                          data-tip={`${good.producedTip}. Click to see burgs producing this good`}
                          className="goodProduced numeric pointer"
                          onClick={e => {
                            e.stopPropagation();
                            openProducersDialog(good.i);
                          }}
                        >
                          <div className="d-inline-block">{displayedProduced}</div>
                          <div className="d-inline-block">⚒</div>
                        </td>
                        <td
                          data-tip={`${good.stockTip}. Click to see breakdown by location`}
                          className="goodStock numeric pointer"
                          onClick={e => {
                            e.stopPropagation();
                            openStockDialog(good.i);
                          }}
                        >
                          <div className="d-inline-block">{displayedStock}</div>
                          <div className="d-inline-block">⛁</div>
                        </td>
                        <td
                          data-tip={t("extensions.goodsEditor.marketOutputCellTip")}
                          className="goodCumulativeSales numeric"
                        >
                          {displayedCumulativeMarketIntake}
                        </td>
                        <td
                          data-tip={t("extensions.goodsEditor.actualOutputCellTip")}
                          className="goodActualOutput numeric"
                        >
                          {displayedActualFoodOutput}
                        </td>
                        <td data-tip={good.foodFlowTip} className="goodFoodFlow numeric">
                          <div>H {good.freshHarvested}</div>
                          <div>P {good.foodProcessingInput}</div>
                        </td>
                        <td data-tip={t("extensions.goodsEditor.cellsCellTip")} className="goodResourceCells numeric">
                          {good.resourceCells}
                        </td>
                        <td
                          data-tip={t("extensions.goodsEditor.perKCellTip")}
                          className="goodProductionPerThousand numeric"
                        >
                          {good.productionPerThousand}
                        </td>
                        <td
                          data-tip={priceTip}
                          className="goodBasePrice numeric pointer"
                          onClick={e => e.stopPropagation()}
                        >
                          {formatPrice(good.basePrice)}
                        </td>
                        <td>
                          <IconButton
                            data-tip={t("extensions.goodsEditor.editDist")}
                            className="icon-pencil goodEdit"
                            onClick={e => {
                              e.stopPropagation();
                              editGoodDistribution(good.i);
                            }}
                          />
                          <IconButton
                            data-tip={t("extensions.goodsEditor.removeGood")}
                            className="icon-trash-empty goodRemove"
                            onClick={e => {
                              e.stopPropagation();
                              removeGood(good.i);
                            }}
                          />
                        </td>
                      </>
                    )}
                  </tr>
                );
              }}
            />
          </table>
        </div>

        <div id="goodsFooter" className={`totalLine hide${isAssignMode ? " hidden" : ""}`}>
          <div data-tip={t("extensions.goodsEditor.goodsCountTip")}>
            {t("extensions.goodsEditor.goodsCount")}
            <span id="goodsDisplayed">{displayedCount}</span> {t("extensions.goodsEditor.goodsCountOf")}{" "}
            <span id="goodsNumber">{goods.length}</span>
          </div>
          <div data-tip={t("extensions.goodsEditor.potentialTotalTip")}>
            {t("extensions.goodsEditor.potentialTotal")}
            <span id="goodsProduced">{totalProduced}</span>
          </div>
          <div data-tip={t("extensions.goodsEditor.stockTotalTip")}>
            {t("extensions.goodsEditor.stockTotal")}
            <span id="goodsStock">{totalStock}</span>
          </div>
          <div data-tip={t("extensions.goodsEditor.marketOutputTotalTip")}>
            {t("extensions.goodsEditor.marketOutputTotal")}
            <span id="goodsCumulativeMarketIntake">{totalCumulativeMarketIntake}</span>
          </div>
        </div>

        <div id="goodsBottom" className="footer">
          <input
            type="checkbox"
            data-tip={t("extensions.goodsEditor.toggleAllTip")}
            className={`native hide${isAssignMode ? " hidden" : ""}`}
            id="goodsDisplayAll"
            checked={goods.length > 0 && displayedCount === goods.length}
            ref={el => {
              if (el) el.indeterminate = displayedCount > 0 && displayedCount < goods.length;
            }}
            onChange={e => toggleAllDisplayed(e.target.checked)}
          />
          <button
            type="button"
            id="goodsEditorRefresh"
            data-tip={t("extensions.goodsEditor.refreshTip")}
            className="icon-cw"
            onClick={goodsEditorAddLines}
          />
          <button
            type="button"
            id="goodsPercentage"
            data-tip={t("extensions.goodsEditor.percentageTip")}
            className="icon-percent"
            onClick={togglePercentageMode}
          />
          <button
            type="button"
            id="goodsTagsFilter"
            data-tip={t("extensions.goodsEditor.filterTagsTip")}
            className={`icon-tags${hasTagFilter ? " active" : ""}`}
            onClick={openTagsVisibilityDialog}
          />
          <button
            type="button"
            id="goodsAssign"
            data-tip={t("extensions.goodsEditor.assignTip")}
            className={`icon-brush${isAssignMode ? " pressed" : ""}`}
            onClick={enterResourceAssignMode}
          />
          <button
            type="button"
            id="goodsAdd"
            data-tip={t("extensions.goodsEditor.addTip")}
            className={`icon-plus hide${isAssignMode ? " hidden" : ""}`}
            onClick={addGood}
          />
          <button
            type="button"
            id="goodsRegenerateGoods"
            data-tip={t("extensions.goodsEditor.regenGoodsTip")}
            className={`icon-arrows-cw hide${isAssignMode ? " hidden" : ""}`}
            onClick={requestGoodsRegeneration}
          />
          <button
            type="button"
            id="goodsRegenerateProduction"
            data-tip={t("extensions.goodsEditor.regenProductionTip")}
            className={`icon-retweet hide${isAssignMode ? " hidden" : ""}`}
            onClick={requestProductionRegeneration}
          />
          <button
            type="button"
            id="goodsChains"
            data-tip={t("extensions.goodsEditor.chainsTip")}
            className={`icon-chart-line hide${isAssignMode ? " hidden" : ""}`}
          />
          <button
            type="button"
            id="goodsRestore"
            data-tip={t("extensions.goodsEditor.restoreTip")}
            className={`icon-history hide${isAssignMode ? " hidden" : ""}`}
            onClick={goodsRestoreDefaults}
          />
          <button
            type="button"
            id="goodsResetCumulativeMarketIntake"
            data-tip={t("extensions.goodsEditor.resetIntakeTip")}
            className={`icon-ccw hide${isAssignMode ? " hidden" : ""}`}
            onClick={resetGoodsCumulativeMarketIntake}
          />
          <button
            type="button"
            id="goodsExport"
            data-tip={t("extensions.goodsEditor.exportTip")}
            className={`icon-download hide${isAssignMode ? " hidden" : ""}`}
            onClick={downloadGoodsData}
          />
        </div>
      </div>
    </Dialog>
  );
};
