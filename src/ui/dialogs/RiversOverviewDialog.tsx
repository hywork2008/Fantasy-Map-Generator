import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RiversOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("riversOverview"));

  return (
    <Dialog isOpen={isOpen} title="Rivers Overview" onClose={() => closeDialog("riversOverview")}>
      <div id="riversOverviewContainer">
        <div>
          <div id="riversHeader" className="header" style={{ gridTemplateColumns: "9em 4em 7em 5em 5em 9em" }}>
            <div data-tip="Click to sort by river name" className="sortable alphabetically" data-sortby="name">
              River&nbsp;
            </div>
            <div data-tip="Click to sort by river type name" className="sortable alphabetically" data-sortby="type">
              Type&nbsp;
            </div>
            <div
              data-tip="Click to sort by discharge (flux in m3/s)"
              className="sortable icon-sort-number-down"
              data-sortby="discharge"
            >
              Discharge&nbsp;
            </div>
            <div data-tip="Click to sort by river length" className="sortable" data-sortby="length">
              Length&nbsp;
            </div>
            <div data-tip="Click to sort by river mouth width" className="sortable" data-sortby="width">
              Width&nbsp;
            </div>
            <div data-tip="Click to sort by river basin" className="sortable alphabetically" data-sortby="basin">
              Basin&nbsp;
            </div>
          </div>
          <div id="riversBody" className="table" />
          <div id="riversTotal" className="totalLine">
            <div data-tip="Rivers number" style={{ marginLeft: 4 }}>
              Rivers:&nbsp;<span id="riversFooterNumber">0</span>
            </div>
            <div data-tip="Average discharge" style={{ marginLeft: 12 }}>
              Average discharge:&nbsp;<span id="riversFooterDischarge">0</span>
            </div>
            <div data-tip="Average length" style={{ marginLeft: 12 }}>
              Length:&nbsp;<span id="riversFooterLength">0</span>
            </div>
            <div data-tip="Average mouth width" style={{ marginLeft: 12 }}>
              Width:&nbsp;<span id="riversFooterWidth">0</span>
            </div>
          </div>
          <div id="riversFooter">
            <button type="button" id="riversOverviewRefresh" data-tip="Refresh the Editor" className="icon-cw" />
            <button
              type="button"
              id="addNewRiver"
              data-tip="Automatically add river starting from clicked cell. Hold Shift to add multiple"
              className="icon-plus"
            />
            <button
              type="button"
              id="riverCreateNew"
              data-tip="Create a new river selecting river cells"
              className="icon-map-pin"
            />
            <button
              type="button"
              id="riversBasinHighlight"
              data-tip="Toggle basin highlight mode"
              className="icon-sitemap"
            />
            <button
              type="button"
              id="riversExport"
              data-tip="Save rivers-related data as a text file (.csv)"
              className="icon-download"
            />
            <button type="button" id="riversRemoveAll" data-tip="Remove all rivers" className="icon-trash" />
            <label htmlFor="riversSearch" data-tip="Filter by name, type or basin" style={{ marginLeft: "0.2em" }}>
              Search: <input id="riversSearch" type="search" />
            </label>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
