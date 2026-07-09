import React from "react";
import { IconButton } from "../../../../ui/components/IconButton";
import { SortableHeader } from "../../../../ui/components/tables/SortableHeader";
import { VirtualTableBody } from "../../../../ui/components/VirtualTableBody";
import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { rn } from "../../../hostUtils";

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
  const isOpen = useDialogState(state => state.openDialogs.has("goodsEditor"));
  const {
    goods,
    totalProduced,
    totalStock,
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

  const handleClose = () => {
    closeGoodsEditor();
    closeDialog("goodsEditor");
  };

  const parentRef = React.useRef<HTMLDivElement>(null);

  return (
    <Dialog isOpen={isOpen} title="Goods Editor" onClose={handleClose} className="overflow-hidden">
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
              items={goods}
              scrollElementRef={parentRef}
              renderRow={good => {
                const displayedProduced = isPercentageMode
                  ? `${rn(totalProduced ? (good.produced / totalProduced) * 100 : 0, 2)}%`
                  : String(good.produced);
                const displayedStock = isPercentageMode
                  ? `${rn(totalStock ? (good.stock / totalStock) * 100 : 0, 2)}%`
                  : String(good.stock);

                return (
                  <tr
                    key={good.i}
                    className={`states goods${good.isTagVisible ? "" : " hidden"}${isAssignMode && selectedAssignGoodId === good.i ? " selected" : ""}`}
                    data-id={good.i}
                    data-name={good.name}
                    data-color={good.color}
                    data-baseprice={good.basePrice}
                    data-produced={good.produced}
                    data-stock={good.stock}
                    data-type={good.types.join(",")}
                    data-tags={good.tags.join(",")}
                    onClick={() => handleGoodRowClick(good.i)}
                  >
                    {isAssignMode ? (
                      <td>
                        <svg aria-label={good.name} data-tip="Good icon" width="2em" height="2em" className="goodIcon">
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
                        <svg aria-label={good.name} data-tip="Good icon" width="2em" height="2em" className="goodIcon">
                          <circle cx="50%" cy="50%" r="42%" fill={good.color} stroke={good.strokeColor} />
                          <use href={`#${good.icon}`} x="10%" y="10%" width="80%" height="80%" />
                        </svg>
                      </td>
                    )}
                    <td data-tip="Good name" className="goodName">
                      {good.name}
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
                          data-tip="Base (initial) price. Click to compare prices across markets"
                          className="goodBasePrice pointer"
                          onClick={e => e.stopPropagation()}
                        >
                          🟡 {good.basePrice}
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
