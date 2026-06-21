import React from "react";
import { open as openMarketsOverview } from "../../editors/markets-overview";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const MarketsOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("marketsOverview"));

  React.useEffect(() => {
    if (isOpen) {
      setTimeout(() => openMarketsOverview(), 0); // ensure DOM is mounted
    }
  }, [isOpen]);

  return (
    <Dialog isOpen={isOpen} title="Markets Overview" onClose={() => closeDialog("marketsOverview")}>
      <div id="marketsOverviewContainer">
        <div
          id="marketsOverviewHeader"
          className="header"
          style={{ gridTemplateColumns: "1.6em 7.2em 8em 3.5em 4.5em 6.5em 6.4em 6em 6em 1.2em" }}
        >
          <div />
          <div
            data-tip="Market center burg name. Click to sort"
            className="sortable alphabetically"
            data-sortby="market"
            style={{ marginLeft: 0 }}
          >
            Market&nbsp;
          </div>
          <div data-tip="Owning state. Click to sort" className="sortable alphabetically" data-sortby="owner">
            Owner&nbsp;
          </div>
          <div data-tip="Number of cells in market territory. Click to sort" className="sortable" data-sortby="cells">
            Cells&nbsp;
          </div>
          <div
            data-tip="Number of burgs in market territory. Click to sort"
            className="sortable hide"
            data-sortby="burgs"
          >
            Burgs&nbsp;
          </div>
          <div data-tip="Total stock of all goods. Click to sort" className="sortable hide" data-sortby="stock">
            Stock&nbsp;
          </div>
          <div data-tip="Total gross sales revenue. Click to sort" className="sortable hide" data-sortby="sales">
            Sales&nbsp;
          </div>
          <div data-tip="Total purchase spending. Click to sort" className="sortable hide" data-sortby="buys">
            Buys&nbsp;
          </div>
          <div
            data-tip="Market value: net trading flow plus unsold inventory value minus tax. Click to sort"
            className="sortable hide icon-sort-number-down"
            data-sortby="value"
          >
            Value&nbsp;
          </div>
          <div />
        </div>

        <div
          id="marketsOverviewBody"
          className="table"
          data-type="absolute"
          style={{ maxHeight: "40em", cursor: "pointer" }}
        />

        <div id="marketsOverviewFooter" className="totalLine">
          <div data-tip="Total number of markets" style={{ marginLeft: 5 }}>
            Markets:&nbsp;<span id="marketsOverviewFooterMarkets">0</span>
          </div>
          <div data-tip="Average gross sales revenue per market" style={{ marginLeft: 12 }}>
            Avg Sales:&nbsp;<span id="marketsOverviewFooterSales">0</span>
          </div>
          <div data-tip="Average purchase spending per market" style={{ marginLeft: 12 }}>
            Avg Buys:&nbsp;<span id="marketsOverviewFooterBuys">0</span>
          </div>
          <div data-tip="Average market value per market" style={{ marginLeft: 12 }}>
            Avg Value:&nbsp;<span id="marketsOverviewFooterValue">0</span>
          </div>
        </div>

        <div id="marketsOverviewBottom">
          <button type="button" id="marketsOverviewRefresh" data-tip="Refresh the overview" className="icon-cw" />
          <button
            type="button"
            id="marketsOverviewPercentage"
            data-tip="Toggle percentage / absolute values views"
            className="icon-percent"
          />
          <button
            type="button"
            id="marketsOverviewCompare"
            data-tip="Compare good stock across markets"
            className="icon-chart-bar"
          />
          <button
            type="button"
            id="marketsOverviewExport"
            data-tip="Save markets data as a CSV file"
            className="icon-download"
          />
          <button
            type="button"
            id="marketsManually"
            data-tip="Manually re-assign market territories"
            className="icon-brush"
          />
          <div id="marketsManuallyButtons" style={{ display: "none" }}>
            <button type="button" id="marketsManuallyUndo" data-tip="Undo last brush stroke" className="icon-ccw" />
            <button type="button" id="marketsManuallyApply" data-tip="Apply assignment" className="icon-check" />
            <button type="button" id="marketsManuallyCancel" data-tip="Cancel assignment" className="icon-cancel" />
          </div>
          <button
            type="button"
            id="marketsAdd"
            data-tip="Add a new market. Click on a burg on the map. Hold Shift to add multiple"
            className="icon-plus"
          />
          <button
            type="button"
            id="marketsRegenerate"
            data-tip="Regenerate markets and their territories"
            className="icon-arrows-cw"
          />
          <button
            type="button"
            id="marketsRegenerateProduction"
            data-tip="Regenerate production and trade deals"
            className="icon-retweet"
          />
        </div>
      </div>
    </Dialog>
  );
};
