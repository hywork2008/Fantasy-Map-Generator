import React from "react";
import { useDialogState } from "../../../../store/dialogState";
import { Dialog } from "../../../../ui/dialogs/Dialog";
import { closeDialog } from "../../../../ui/dialogs/dialogService";
import { rn } from "../../../../utils";
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
          id="goodsHeader"
          className="header"
          style={{
            gridTemplateColumns: isAssignMode ? "7.5em 6em" : "4em 7.4em 7em 6.8em 6em 4.6em 1.6em",
            marginLeft: isAssignMode ? 22 : undefined
          }}
        >
          <input
            type="checkbox"
            data-tip="Show or hide all goods on the Goods map"
            className={`native hide${isAssignMode ? " hidden" : ""}`}
            id="goodsDisplayAll"
            style={{ margin: "0 .3em", verticalAlign: "middle", width: "1.2em" }}
            checked={goods.length > 0 && displayedCount === goods.length}
            ref={el => {
              if (el) el.indeterminate = displayedCount > 0 && displayedCount < goods.length;
            }}
            onChange={e => toggleAllDisplayed(e.target.checked)}
          />
          <div data-tip="Click to sort by good name" className="sortable alphabetically" data-sortby="name">
            Name&nbsp;
          </div>
          <div data-tip="Click to sort by type" className="sortable alphabetically" data-sortby="type">
            Type&nbsp;
          </div>
          <div
            data-tip="Total production units aggregated from cells and burgs. Click to sort"
            className={`sortable icon-sort-number-down hide${isAssignMode ? " hidden" : ""}`}
            data-sortby="produced"
          >
            Produced&nbsp;
          </div>
          <div
            data-tip="Total units in stock across all markets and burg inventories. Click to sort"
            className={`sortable hide${isAssignMode ? " hidden" : ""}`}
            data-sortby="stock"
          >
            Stock&nbsp;
          </div>
          <div
            data-tip="Base (initial) price. Click to sort"
            className={`sortable hide${isAssignMode ? " hidden" : ""}`}
            data-sortby="baseprice"
          >
            Price&nbsp;
          </div>
        </div>

        <div
          id="goodsBody"
          className="table"
          style={{ maxHeight: "50vh" }}
          data-type={isPercentageMode ? "percentage" : "absolute"}
        >
          {goods.map(good => {
            const displayedProduced = isPercentageMode
              ? `${rn(totalProduced ? (good.produced / totalProduced) * 100 : 0, 2)}%`
              : String(good.produced);
            const displayedStock = isPercentageMode
              ? `${rn(totalStock ? (good.stock / totalStock) * 100 : 0, 2)}%`
              : String(good.stock);

            return (
              <div
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
                <input
                  type="checkbox"
                  data-tip="Toggle this good on the Goods map"
                  className={`native goodDisplayed hide${isAssignMode ? " hidden" : ""}`}
                  style={{ padding: 0, margin: 0, verticalAlign: "middle", width: "1.2em" }}
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
                <div data-tip="Good name" className="goodName">
                  {good.name}
                </div>
                <div data-tip="Good types" className="goodType" style={{ width: "6em" }}>
                  {good.types.map(t => (
                    <TypeBadge key={t} type={t} />
                  ))}
                </div>
                <div
                  data-tip={`${good.producedTip}. Click to see burgs producing this good`}
                  className={`goodProduced pointer hide${isAssignMode ? " hidden" : ""}`}
                  style={{ verticalAlign: "middle" }}
                  onClick={e => {
                    e.stopPropagation();
                    openProducersDialog(good.i);
                  }}
                >
                  <div style={{ display: "inline-block" }}>{displayedProduced}</div>
                  <div style={{ display: "inline-block", width: "0.4em", fontSize: "1.5em" }}>⚒</div>
                </div>
                <div
                  data-tip={`${good.stockTip}. Click to see breakdown by location`}
                  className={`goodStock pointer hide${isAssignMode ? " hidden" : ""}`}
                  style={{ verticalAlign: "middle" }}
                  onClick={e => {
                    e.stopPropagation();
                    openStockDialog(good.i);
                  }}
                >
                  <div style={{ display: "inline-block" }}>{displayedStock}</div>
                  <div style={{ display: "inline-block", width: "0.4em", fontSize: "1.2em" }}>⛁</div>
                </div>
                <div
                  data-tip="Base (initial) price. Click to compare prices across markets"
                  className={`goodBasePrice pointer hide${isAssignMode ? " hidden" : ""}`}
                  onClick={e => e.stopPropagation()}
                >
                  🟡 {good.basePrice}
                </div>
                <span
                  data-tip="Edit good distribution"
                  className={`icon-pencil goodEdit hide${isAssignMode ? " hidden" : ""}`}
                  onClick={e => {
                    e.stopPropagation();
                    editGoodDistribution(good.i);
                  }}
                />
                <span
                  data-tip="Remove good"
                  className={`icon-trash-empty hide goodRemove${isAssignMode ? " hidden" : ""}`}
                  onClick={e => {
                    e.stopPropagation();
                    removeGood(good.i);
                  }}
                />
              </div>
            );
          })}
        </div>

        <div id="goodsFooter" className={`totalLine hide${isAssignMode ? " hidden" : ""}`}>
          <div data-tip="Number of goods (displayed / total)" style={{ marginLeft: 5 }}>
            Goods:&nbsp;<span id="goodsDisplayed">{displayedCount}</span> of{" "}
            <span id="goodsNumber">{goods.length}</span>
          </div>
          <div data-tip="Total amount of goods produced by all cells and burgs" style={{ marginLeft: 12 }}>
            Produced:&nbsp;<span id="goodsProduced">{totalProduced}</span>
          </div>
          <div data-tip="Total units in stock across all markets and burg inventories" style={{ marginLeft: 12 }}>
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
