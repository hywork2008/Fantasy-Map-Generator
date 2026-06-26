import React from "react";
import { useDialogState } from "../../../../store/dialogState";
import { Dialog } from "../../../../ui/dialogs/Dialog";
import { closeDialog } from "../../../../ui/dialogs/dialogService";
import { open as openGoodsEditor } from "../../editors/goods-editor";

export const GoodsEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("goodsEditor"));

  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => openGoodsEditor(), 0); // ensure DOM is mounted
    }
  }, [isOpen]);

  return (
    <Dialog isOpen={isOpen} title="Goods Editor" onClose={() => closeDialog("goodsEditor")}>
      <div id="goodsEditorContainer">
        <div id="goodsHeader" className="header" style={{ gridTemplateColumns: "4em 7.4em 7em 6.8em 6em 4.6em 1.6em" }}>
          <input
            type="checkbox"
            data-tip="Show or hide all goods on the Goods map"
            className="native hide"
            id="goodsDisplayAll"
            style={{ margin: "0 .3em", verticalAlign: "middle", width: "1.2em" }}
          />
          <div data-tip="Click to sort by good name" className="sortable alphabetically" data-sortby="name">
            Name&nbsp;
          </div>
          <div data-tip="Click to sort by type" className="sortable alphabetically" data-sortby="type">
            Type&nbsp;
          </div>
          <div
            data-tip="Total production units aggregated from cells and burgs. Click to sort"
            className="sortable icon-sort-number-down hide"
            data-sortby="produced"
          >
            Produced&nbsp;
          </div>
          <div
            data-tip="Total units in stock across all markets and burg inventories. Click to sort"
            className="sortable hide"
            data-sortby="stock"
          >
            Stock&nbsp;
          </div>
          <div data-tip="Base (initial) price. Click to sort" className="sortable hide" data-sortby="baseprice">
            Price&nbsp;
          </div>
        </div>

        <div id="goodsBody" className="table" style={{ maxHeight: "50vh" }} data-type="absolute" />

        <div id="goodsFooter" className="totalLine hide">
          <div data-tip="Number of goods (displayed / total)" style={{ marginLeft: 5 }}>
            Goods:&nbsp;<span id="goodsDisplayed">0</span> of <span id="goodsNumber">0</span>
          </div>
          <div data-tip="Total amount of goods produced by all cells and burgs" style={{ marginLeft: 12 }}>
            Produced:&nbsp;<span id="goodsProduced">0</span>
          </div>
          <div data-tip="Total units in stock across all markets and burg inventories" style={{ marginLeft: 12 }}>
            Stock:&nbsp;<span id="goodsStock">0</span>
          </div>
        </div>

        <div id="goodsBottom">
          <button type="button" id="goodsEditorRefresh" data-tip="Refresh the Editor" className="icon-cw" />
          <button
            type="button"
            id="goodsPercentage"
            data-tip="Toggle percentage / absolute values display mode"
            className="icon-percent"
          />
          <button type="button" id="goodsTagsFilter" data-tip="Filter visible goods by tags" className="icon-tags" />
          <button type="button" id="goodsAssign" data-tip="Manually assign goods to cells" className="icon-brush" />
          <button type="button" id="goodsAdd" data-tip="Add a new good" className="icon-plus hide" />
          <button
            type="button"
            id="goodsRegenerateGoods"
            data-tip="Regenerate bonus goods placement"
            className="icon-arrows-cw hide"
          />
          <button
            type="button"
            id="goodsRegenerateProduction"
            data-tip="Regenerate production and trade deals"
            className="icon-retweet hide"
          />
          <button
            type="button"
            id="goodsChains"
            data-tip="Show production chains graph"
            className="icon-chart-line hide"
          />
          <button
            type="button"
            id="goodsRestore"
            data-tip="Restore default list and regenerate goods"
            className="icon-history hide"
          />
          <button
            type="button"
            id="goodsExport"
            data-tip="Download goods-related data"
            className="icon-download hide"
          />
        </div>
      </div>
    </Dialog>
  );
};
