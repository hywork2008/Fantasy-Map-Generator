import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const MarketsGoodCompareDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("marketsGoodCompare"));

  return (
    <Dialog isOpen={isOpen} title="Compare Good Stock" onClose={() => closeDialog("marketsGoodCompare")}>
      <div id="marketsGoodCompareContainer">
        <div style={{ display: "flex", alignItems: "center", gap: ".5em", padding: ".2em 0 .4em", fontSize: ".9em" }}>
          <label htmlFor="marketsGoodCompareSelect" data-tip="Select good to compare stock across markets">
            Good:
          </label>
          <select id="marketsGoodCompareSelect" style={{ flex: 1, minWidth: "8em" }} />
        </div>

        <div id="marketsGoodCompareHeader" className="header" style={{ gridTemplateColumns: "1.6em 9em 6em 7em" }}>
          <div />
          <div
            data-tip="Market center burg name. Click to sort"
            className="sortable alphabetically"
            data-sortby="market"
            style={{ marginLeft: 0 }}
          >
            Market&nbsp;
          </div>
          <div
            data-tip="Good stock in this market. Click to sort"
            className="sortable icon-sort-number-down"
            data-sortby="stock"
          >
            Stock&nbsp;
          </div>
          <div data-tip="Price for this good. Click to sort" className="sortable" data-sortby="price">
            Price&nbsp;
          </div>
        </div>

        <div id="marketsGoodCompareBody" className="table" data-type="absolute" style={{ maxHeight: "40em" }} />

        <div id="marketsGoodCompareFooter" className="totalLine">
          <div data-tip="Total stock of this good across all markets" style={{ marginLeft: 5 }}>
            Total Stock:&nbsp;<span id="marketsGoodCompareFooterStock">0</span>
          </div>
          <div data-tip="Average price of this good across markets" style={{ marginLeft: 12 }}>
            Avg Price:&nbsp;<span id="marketsGoodCompareFooterPrice">0</span>
          </div>
        </div>

        <div id="marketsGoodCompareBottom">
          <button type="button" id="marketsGoodCompareRefresh" data-tip="Refresh" className="icon-cw" />
          <button
            type="button"
            id="marketsGoodComparePercentage"
            data-tip="Toggle percentage / absolute values views"
            className="icon-percent"
          />
          <button
            type="button"
            id="marketsGoodCompareExport"
            data-tip="Save data as a CSV file"
            className="icon-download"
          />
        </div>
      </div>
    </Dialog>
  );
};
