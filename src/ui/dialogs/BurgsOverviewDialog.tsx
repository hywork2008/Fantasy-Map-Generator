import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const BurgsOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("burgsOverview"));

  return (
    <Dialog isOpen={isOpen} title="Burgs Overview" onClose={() => closeDialog("burgsOverview")}>
      <div id="burgsOverviewContainer">
        <div>
          <div id="burgsHeader" className="header" style={{ gridTemplateColumns: "9em 7em 7.5em 7.2em 6.5em 7em 6em" }}>
            <div data-tip="Click to sort by burg name" className="sortable alphabetically" data-sortby="name">
              Burg
            </div>
            <div data-tip="Click to sort by province name" className="sortable alphabetically" data-sortby="province">
              Province
            </div>
            <div data-tip="Click to sort by state name" className="sortable alphabetically" data-sortby="state">
              State
            </div>
            <div data-tip="Click to sort by culture name" className="sortable alphabetically" data-sortby="culture">
              Culture
            </div>
            <div data-tip="Click to sort by culture group" className="sortable alphabetically" data-sortby="group">
              Group
            </div>
            <div
              data-tip="Click to sort by burg population"
              className="sortable icon-sort-number-down"
              data-sortby="population"
            >
              Population
            </div>
            <div data-tip="Click to sort by burg features" className="sortable alphabetically" data-sortby="features">
              Features&nbsp;
            </div>
          </div>
          <div id="burgsBody" className="table" />
          <div
            id="burgsFilters"
            data-tip="Apply a filter"
            style={{ paddingBlock: "0.1em", display: "flex", gap: "0.5em", width: "100%" }}
          >
            <label htmlFor="burgsSearch" data-tip="Filter by name, province, state, culture, or group">
              Search: <input id="burgsSearch" type="search" />
            </label>
            <label htmlFor="burgsFilterState">
              State:
              <select id="burgsFilterState" />
            </label>
            <label htmlFor="burgsFilterCulture">
              Culture:
              <select id="burgsFilterCulture" />
            </label>
          </div>
          <div id="burgsTotal" className="totalLine">
            <div data-tip="Burgs displayed" style={{ marginLeft: 4 }}>
              Burgs:&nbsp;<span id="burgsFooterBurgs">0 of 0</span>
            </div>
            <div data-tip="Average population" style={{ marginLeft: 14 }}>
              Average population:&nbsp;<span id="burgsFooterPopulation">0</span>
            </div>
          </div>
          <div id="burgsFooter">
            <button type="button" id="burgsOverviewRefresh" data-tip="Refresh the Editor" className="icon-cw" />
            <button type="button" id="burgsGroupsEditorButton" data-tip="Edit burg groups" className="icon-cog" />
            <button type="button" id="burgsChart" data-tip="Show burgs bubble chart" className="icon-chart-area" />
            <button
              type="button"
              id="regenerateBurgNames"
              data-tip="Regenerate burg names based on assigned culture"
              className="icon-retweet"
            />
            <button
              type="button"
              id="addNewBurg"
              data-tip="Add a new burg. Hold Shift to add multiple"
              className="icon-plus"
            />
            <button
              type="button"
              id="burgsExport"
              data-tip="Save burgs-related data as a text file (.csv)"
              className="icon-download"
            />
            <button type="button" id="burgNamesImport" data-tip="Rename burgs in bulk" className="icon-upload" />
            <button type="button" id="burgsLockAll" data-tip="Lock or unlock all burgs" className="icon-lock" />
            <button
              type="button"
              id="burgsRemoveAll"
              data-tip="Remove all unlocked burgs except for capitals. To remove a capital remove its state first"
              className="icon-trash"
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
