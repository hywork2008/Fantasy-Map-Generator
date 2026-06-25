import type React from "react";
import { useDialogState } from "../../../../store/dialogState";
import { Dialog } from "../../../../ui/dialogs/Dialog";
import { closeDialog } from "../../../../ui/dialogs/dialogService";
import { closeTradeDetails } from "../../editors/trade-details";

export const TradeDetailsDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("tradeDetails"));

  return (
    <Dialog
      isOpen={isOpen}
      title="Trade Details"
      onClose={() => {
        closeDialog("tradeDetails");
        closeTradeDetails();
      }}
    >
      <div id="tradeDetailsContainer">
        <div id="tradeDetailsSummary" className="totalLine" />

        <div id="tradeDetailsHeader" className="header" style={{ gridTemplateColumns: "2.5em 10em 5em 5.5em 3.6em" }}>
          <div />
          <div
            data-tip="Click to sort by good"
            className="sortable alphabetically"
            data-sortby="good"
            style={{ marginLeft: 0 }}
          >
            Good&nbsp;
          </div>
          <div data-tip="Click to sort by units" className="sortable icon-sort-number-down" data-sortby="units">
            Units&nbsp;
          </div>
          <div data-tip="Click to sort by unit price" className="sortable" data-sortby="price">
            Price&nbsp;
          </div>
          <div data-tip="Click to sort by value" className="sortable" data-sortby="value">
            Value&nbsp;
          </div>
        </div>

        <div id="tradeDetailsBody" className="table" style={{ maxHeight: "30em" }} />

        <div id="tradeDetailsFooter" className="totalLine">
          <div style={{ marginLeft: 5 }}>
            Distance: <span id="tradeDetailsFooterDistance">0</span>
          </div>
          <div style={{ marginLeft: 12 }} data-tip="Total traded units">
            Units: <span id="tradeDetailsFooterUnits">0</span>
          </div>
          <div style={{ marginLeft: 12 }} data-tip="Total deal value">
            Value: <span id="tradeDetailsFooterValue">0</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
