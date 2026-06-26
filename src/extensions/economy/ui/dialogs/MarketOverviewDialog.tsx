import React from "react";
import { useDialogState } from "../../../../store/dialogState";
import { Dialog } from "../../../../ui/dialogs/Dialog";
import { closeDialog } from "../../../../ui/dialogs/dialogService";
import { open as openMarketOverview } from "../../controllers/market-overview";

export const MarketOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("marketOverview"));
  const marketId = useDialogState(state => state.dialogConfigs.marketOverview?.marketId as number | undefined);

  React.useEffect(() => {
    if (isOpen && marketId != null) {
      setTimeout(() => openMarketOverview(marketId), 0);
    }
  }, [isOpen, marketId]);

  return (
    <Dialog isOpen={isOpen} title="Market Overview" onClose={() => closeDialog("marketOverview")}>
      <div id="marketOverviewContainer">
        <div id="marketOverviewNameLine" style={{ display: "flex", alignItems: "center", marginBottom: "0.4em" }}>
          <div className="label">Name:</div>
          <input
            id="marketOverviewName"
            data-tip="Type to rename the market. Clear the field to reset to the default name"
            autoCorrect="off"
            spellCheck={false}
            style={{ width: "11em", marginLeft: "0.3em" }}
          />
          <span
            id="marketOverviewNameReset"
            data-tip="Reset to the default name (center burg name)"
            className="icon-ccw pointer"
            style={{ marginLeft: "0.3em" }}
          />
        </div>

        <div id="marketOverviewHeader" className="header" style={{ gridTemplateColumns: "2.5em 9em 5.5em 3.2em" }}>
          <div />
          <div
            data-tip="Click to sort by good"
            className="sortable alphabetically"
            data-sortby="good"
            style={{ marginLeft: 0 }}
          >
            Good&nbsp;
          </div>
          <div data-tip="Click to sort by stock" className="sortable icon-sort-number-down" data-sortby="stock">
            Stock&nbsp;
          </div>
          <div data-tip="Click to sort by price" className="sortable" data-sortby="price">
            Price&nbsp;
          </div>
        </div>

        <div id="marketOverviewGoodsBody" className="table" style={{ maxHeight: "40em" }} />
        <div id="marketOverviewSummary" className="totalLine" />
        <div id="marketOverviewInfo" style={{ marginBottom: "0.3em" }} />

        <div id="marketOverviewBottom">
          <button type="button" id="marketOverviewRefresh" data-tip="Refresh the Overview screen" className="icon-cw" />
          <button
            type="button"
            id="marketOverviewOpenDeals"
            data-tip="View market deals"
            className="icon-list-bullet"
          />
          <button
            type="button"
            id="marketOverviewExport"
            data-tip="Save market deals data as a text file (.csv)"
            className="icon-download"
          />
        </div>
      </div>
    </Dialog>
  );
};
