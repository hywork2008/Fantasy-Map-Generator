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

const RAW_TIP =
  "Raw goods are produced by rural population in cells based on biome availability and in cells and burgs when bonus resource is assigned to cells";
const MFG_TIP = "Manufactured goods are produced in burgs";

const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const tip = type === "RAW" ? RAW_TIP : MFG_TIP;
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
    <Dialog isOpen={isOpen} title="Goods Editor" onClose={handleClose} className="fmg-dialog--table">
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
                      label="Name"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      tip="Click to sort by good name"
                    />
                    <SortableHeader
                      field="type"
                      label="Type"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      tip="Click to sort by type"
                    />
                  </>
                ) : (
                  <>
                    <th>
                      <input
                        type="checkbox"
                        data-tip="Show or hide all goods on the Goods map"
                        className="native"
                        id="goodsDisplayAll"
                        checked={goods.length > 0 && displayedCount === goods.length}
                        ref={el => {
                          if (el) el.indeterminate = displayedCount > 0 && displayedCount < goods.length;
                        }}
                        onChange={e => toggleAllDisplayed(e.target.checked)}
                      />
                    </th>
                    <SortableHeader
                      field="name"
                      label="Name"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      tip="Click to sort by good name"
                    />
                    <SortableHeader
                      field="type"
                      label="Type"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      tip="Click to sort by type"
                    />
                    <SortableHeader
                      field="produced"
                      label="Produced"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Total production units aggregated from cells and burgs. Click to sort"
                    />
                    <SortableHeader
                      field="stock"
                      label="Stock"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Total units in stock across all markets and burg inventories. Click to sort"
                    />
                    <SortableHeader
                      field="cumulativeMarketIntake"
                      label="Intake"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Cumulative market intake, not retail sales: burg craft output plus rural/biome harvest since generation or the last reset. Click to sort"
                    />
                    <SortableHeader
                      field="resourceCells"
                      label="Cells"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Cells assigned as this good's current resource location. These are not mineral reserves"
                    />
                    <SortableHeader
                      field="productionPerThousand"
                      label="/1k"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Production units per 1,000 actual residents; an initial supply diagnostic, not tonnes"
                    />
                    <SortableHeader
                      field="baseprice"
                      label="Price"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={toggleSortBy}
                      numeric
                      tip="Base (initial) price. Click to sort"
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
                    : "Base (initial) price. Click to compare prices across markets";

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
                          data-tip="Good icon"
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
                          data-tip="Toggle this good on the Goods map"
                          className="native goodDisplayed"
                          checked={good.isDisplayed}
                          onChange={e => {
                            e.stopPropagation();
                            toggleDisplayedGood(good.i, e.target.checked);
                          }}
                        />
                        <svg
                          aria-label={localizedName}
                          data-tip="Good icon"
                          width="2em"
                          height="2em"
                          className="goodIcon"
                        >
                          <circle cx="50%" cy="50%" r="42%" fill={good.color} stroke={good.strokeColor} />
                          <use href={`#${good.icon}`} x="10%" y="10%" width="80%" height="80%" />
                        </svg>
                      </td>
                    )}
                    <td data-tip="Good name" className="goodName">
                      {localizedName}
                    </td>
                    <td data-tip="Good types" className="goodType">
                      {good.types.map(t => (
                        <TypeBadge key={t} type={t} />
                      ))}
                    </td>
                    {!isAssignMode && (
                      <>
                        <td
                          data-tip={`${good.producedTip}. Click to see burgs producing this good`}
                          className="goodProduced pointer"
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
                          className="goodStock pointer"
                          onClick={e => {
                            e.stopPropagation();
                            openStockDialog(good.i);
                          }}
                        >
                          <div className="d-inline-block">{displayedStock}</div>
                          <div className="d-inline-block">⛁</div>
                        </td>
                        <td
                          data-tip="Cumulative market intake, not retail sales: burg craft output plus rural/biome harvest since generation or the last reset"
                          className="goodCumulativeSales"
                        >
                          {displayedCumulativeMarketIntake}
                        </td>
                        <td
                          data-tip="Current assigned resource cells. In Phase 0, this is a placement count, not a mineral deposit or reserve count"
                          className="goodResourceCells"
                        >
                          {good.resourceCells}
                        </td>
                        <td
                          data-tip="Current production per 1,000 actual residents. This is a diagnostic based on Economy units, not physical tonnes"
                          className="goodProductionPerThousand"
                        >
                          {good.productionPerThousand}
                        </td>
                        <td data-tip={priceTip} className="goodBasePrice pointer" onClick={e => e.stopPropagation()}>
                          {formatPrice(good.basePrice)}
                        </td>
                        <td>
                          <IconButton
                            data-tip="Edit good distribution"
                            className="icon-pencil goodEdit"
                            onClick={e => {
                              e.stopPropagation();
                              editGoodDistribution(good.i);
                            }}
                          />
                          <IconButton
                            data-tip="Remove good"
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
          <div data-tip="Number of goods (displayed / total)">
            Goods:<span id="goodsDisplayed">{displayedCount}</span> of <span id="goodsNumber">{goods.length}</span>
          </div>
          <div data-tip="Total amount of goods produced by all cells and burgs">
            Produced:<span id="goodsProduced">{totalProduced}</span>
          </div>
          <div data-tip="Total units in stock across all markets and burg inventories">
            Stock:<span id="goodsStock">{totalStock}</span>
          </div>
          <div data-tip="Total units placed into markets — burg craft output plus rural/biome harvest — since generation or the last reset">
            Market intake:<span id="goodsCumulativeMarketIntake">{totalCumulativeMarketIntake}</span>
          </div>
        </div>

        <div id="goodsBottom" className="footer">
          <button
            type="button"
            id="goodsEditorRefresh"
            data-tip="Refresh the Editor"
            className="icon-cw"
            onClick={goodsEditorAddLines}
          />
          <button
            type="button"
            id="goodsPercentage"
            data-tip="Toggle percentage / absolute values display mode"
            className="icon-percent"
            onClick={togglePercentageMode}
          />
          <button
            type="button"
            id="goodsTagsFilter"
            data-tip="Filter visible goods by tags"
            className={`icon-tags${hasTagFilter ? " active" : ""}`}
            onClick={openTagsVisibilityDialog}
          />
          <button
            type="button"
            id="goodsAssign"
            data-tip="Manually assign goods to cells"
            className={`icon-brush${isAssignMode ? " pressed" : ""}`}
            onClick={enterResourceAssignMode}
          />
          <button
            type="button"
            id="goodsAdd"
            data-tip="Add a new good"
            className={`icon-plus hide${isAssignMode ? " hidden" : ""}`}
            onClick={addGood}
          />
          <button
            type="button"
            id="goodsRegenerateGoods"
            data-tip="Regenerate bonus goods placement"
            className={`icon-arrows-cw hide${isAssignMode ? " hidden" : ""}`}
            onClick={requestGoodsRegeneration}
          />
          <button
            type="button"
            id="goodsRegenerateProduction"
            data-tip="Regenerate production and trade deals"
            className={`icon-retweet hide${isAssignMode ? " hidden" : ""}`}
            onClick={requestProductionRegeneration}
          />
          <button
            type="button"
            id="goodsChains"
            data-tip="Show production chains graph"
            className={`icon-chart-line hide${isAssignMode ? " hidden" : ""}`}
          />
          <button
            type="button"
            id="goodsRestore"
            data-tip="Restore default list and regenerate goods"
            className={`icon-history hide${isAssignMode ? " hidden" : ""}`}
            onClick={goodsRestoreDefaults}
          />
          <button
            type="button"
            id="goodsResetCumulativeMarketIntake"
            data-tip="Reset the cumulative market-intake counter for every good"
            className={`icon-ccw hide${isAssignMode ? " hidden" : ""}`}
            onClick={resetGoodsCumulativeMarketIntake}
          />
          <button
            type="button"
            id="goodsExport"
            data-tip="Download goods-related data"
            className={`icon-download hide${isAssignMode ? " hidden" : ""}`}
            onClick={downloadGoodsData}
          />
        </div>
      </div>
    </Dialog>
  );
};
