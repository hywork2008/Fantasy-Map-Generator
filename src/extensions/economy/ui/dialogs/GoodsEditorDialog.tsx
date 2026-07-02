import React from "react";

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
  togglePercentageMode
} from "../../controllers/goods-editor";
import { useGoodsEditorTableState } from "../../store/goodsEditorTableState";

const TYPE_BADGE_STYLES = {
  common: "display:inline-block;border-radius:3px;padding:0 .4em;font-size:0.8em;font-weight:bold;line-height:1.35",
  RAW: "background:#d0e7f5;color:#036",
  MFG: "background:#f8e7bf;color:#b67a00"
} as const;

const RAW_TIP =
  "Raw goods are produced by rural population in cells based on biome availability and in cells and burgs when bonus resource is assigned to cells";
const MFG_TIP = "Manufactured goods are produced in burgs";

const TypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const extraStyle = type === "RAW" ? TYPE_BADGE_STYLES.RAW : TYPE_BADGE_STYLES.MFG;
  const tip = type === "RAW" ? RAW_TIP : MFG_TIP;
  return (
    <span style={{ cssText: `${TYPE_BADGE_STYLES.common};${extraStyle}` } as React.CSSProperties} data-tip={tip}>
      {type}
    </span>
  );
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
    selectedAssignGoodId
  } = useGoodsEditorTableState();

  React.useEffect(() => {
    if (isOpen) openGoodsEditor();
  }, [isOpen]);

  const handleClose = () => {
    closeGoodsEditor();
    closeDialog("goodsEditor");
  };

  return (
    <Dialog isOpen={isOpen} title="Goods Editor" onClose={handleClose}>
      <div id="goodsEditorContainer">
        <div
          id="goodsBody"
          className="table -goods-editor-dialog__max-height-50vh"
          data-type={isPercentageMode ? "percentage" : "absolute"}
        >
          <table className="states-table">
            <colgroup>
              {isAssignMode ? (
                <>
                  <col style={{ width: "2em" }} />
                  <col style={{ width: "7.5em" }} />
                  <col style={{ width: "6em" }} />
                </>
              ) : (
                <>
                  <col style={{ width: "4em" }} />
                  <col style={{ width: "7.4em" }} />
                  <col style={{ width: "7em" }} />
                  <col style={{ width: "6.8em" }} />
                  <col style={{ width: "6em" }} />
                  <col style={{ width: "4.6em" }} />
                  <col style={{ width: "1.6em" }} />
                </>
              )}
            </colgroup>
            <thead id="goodsHeader">
              <tr className="header">
                {isAssignMode ? (
                  <>
                    <th />
                    <th data-tip="Click to sort by good name" className="sortable alphabetically" data-sortby="name">
                      Name&nbsp;
                    </th>
                    <th data-tip="Click to sort by type" className="sortable alphabetically" data-sortby="type">
                      Type&nbsp;
                    </th>
                  </>
                ) : (
                  <>
                    <th>
                      <input
                        type="checkbox"
                        data-tip="Show or hide all goods on the Goods map"
                        className="native -goods-editor-dialog__margin-0-3em--vertical-align-middle--width-1-2em"
                        id="goodsDisplayAll"
                        checked={goods.length > 0 && displayedCount === goods.length}
                        ref={el => {
                          if (el) el.indeterminate = displayedCount > 0 && displayedCount < goods.length;
                        }}
                        onChange={e => toggleAllDisplayed(e.target.checked)}
                      />
                    </th>
                    <th data-tip="Click to sort by good name" className="sortable alphabetically" data-sortby="name">
                      Name&nbsp;
                    </th>
                    <th data-tip="Click to sort by type" className="sortable alphabetically" data-sortby="type">
                      Type&nbsp;
                    </th>
                    <th
                      data-tip="Total production units aggregated from cells and burgs. Click to sort"
                      className="sortable icon-sort-number-down"
                      data-sortby="produced"
                    >
                      Produced&nbsp;
                    </th>
                    <th
                      data-tip="Total units in stock across all markets and burg inventories. Click to sort"
                      className="sortable"
                      data-sortby="stock"
                    >
                      Stock&nbsp;
                    </th>
                    <th data-tip="Base (initial) price. Click to sort" className="sortable" data-sortby="baseprice">
                      Price&nbsp;
                    </th>
                    <th />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {goods.map(good => {
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
                          className="native goodDisplayed -goods-editor-dialog__padding-0--margin-0--vertical-align-middle--width-1-2em"
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
                          className="goodProduced pointer -goods-editor-dialog__vertical-align-middle"
                          onClick={e => {
                            e.stopPropagation();
                            openProducersDialog(good.i);
                          }}
                        >
                          <div className="-goods-editor-dialog__display-inline-block">{displayedProduced}</div>
                          <div className="-goods-editor-dialog__display-inline-block--width-0-4em--font-size-1-5em">
                            ⚒
                          </div>
                        </td>
                        <td
                          data-tip={`${good.stockTip}. Click to see breakdown by location`}
                          className="goodStock pointer -goods-editor-dialog__vertical-align-middle"
                          onClick={e => {
                            e.stopPropagation();
                            openStockDialog(good.i);
                          }}
                        >
                          <div className="-goods-editor-dialog__display-inline-block">{displayedStock}</div>
                          <div className="-goods-editor-dialog__display-inline-block--width-0-4em--font-size-1-2em">
                            ⛁
                          </div>
                        </td>
                        <td
                          data-tip="Base (initial) price. Click to compare prices across markets"
                          className="goodBasePrice pointer"
                          onClick={e => e.stopPropagation()}
                        >
                          🟡 {good.basePrice}
                        </td>
                        <td>
                          <span
                            data-tip="Edit good distribution"
                            className="icon-pencil goodEdit"
                            onClick={e => {
                              e.stopPropagation();
                              editGoodDistribution(good.i);
                            }}
                          />
                          <span
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
              })}
            </tbody>
          </table>
        </div>

        <div id="goodsFooter" className={`totalLine hide${isAssignMode ? " hidden" : ""}`}>
          <div data-tip="Number of goods (displayed / total)" className="-goods-editor-dialog__margin-left-5">
            Goods:&nbsp;<span id="goodsDisplayed">{displayedCount}</span> of{" "}
            <span id="goodsNumber">{goods.length}</span>
          </div>
          <div
            data-tip="Total amount of goods produced by all cells and burgs"
            className="-goods-editor-dialog__margin-left-12"
          >
            Produced:&nbsp;<span id="goodsProduced">{totalProduced}</span>
          </div>
          <div
            data-tip="Total units in stock across all markets and burg inventories"
            className="-goods-editor-dialog__margin-left-12"
          >
            Stock:&nbsp;<span id="goodsStock">{totalStock}</span>
          </div>
        </div>

        <div id="goodsBottom">
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
