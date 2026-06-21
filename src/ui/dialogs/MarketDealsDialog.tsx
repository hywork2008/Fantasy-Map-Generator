import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const MarketDealsDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("marketDeals"));

  return (
    <Dialog isOpen={isOpen} title="Market Deals" onClose={() => closeDialog("marketDeals")}>
      <div id="marketDealsContainer">
        <div id="marketDealsHeader" className="header" style={{ gridTemplateColumns: "2em 6.8em 4em 10em 4em 4em" }}>
          <div />
          <div
            data-tip="Click to sort by good"
            className="sortable alphabetically"
            data-sortby="good"
            style={{ marginLeft: 0 }}
          >
            Good&nbsp;
          </div>
          <div data-tip="Click to sort by deal type" className="sortable alphabetically" data-sortby="direction">
            Type&nbsp;
          </div>
          <div data-tip="Click to sort by counterparty" className="sortable alphabetically" data-sortby="counterparty">
            Counterparty&nbsp;
          </div>
          <div data-tip="Click to sort by units" className="sortable" data-sortby="units">
            Units&nbsp;
          </div>
          <div data-tip="Click to sort by income" className="sortable" data-sortby="income">
            Income&nbsp;
          </div>
        </div>

        <div id="marketDealsBody" className="table" style={{ maxHeight: "30em" }} />

        <div id="marketDealsFooter" className="totalLine">
          <div style={{ marginLeft: 5 }} data-tip="Deals count">
            Deals: <span id="marketDealsFooterDeals">0</span>
          </div>
          <div style={{ marginLeft: 12 }} data-tip="Net flow for this market">
            Net Flow: <span id="marketDealsFooterNet">🟡 0</span>
          </div>
        </div>

        <div id="marketDealsBottom">
          <button type="button" id="marketDealsRefresh" data-tip="Refresh the Deals screen" className="icon-cw" />
          <button
            type="button"
            id="marketDealsExport"
            data-tip="Save market deals data as a text file (.csv)"
            className="icon-download"
          />
          <select id="marketDealsFilter" data-tip="Filter deals by scope" style={{ marginLeft: 8 }}>
            <option value="all">All</option>
            <option value="local">Local</option>
            <option value="global">Global</option>
          </select>
        </div>
      </div>
    </Dialog>
  );
};
