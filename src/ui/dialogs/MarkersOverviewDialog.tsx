import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const MarkersOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("markersOverview"));

  return (
    <Dialog isOpen={isOpen} title="Markers Overview" onClose={() => closeDialog("markersOverview")}>
      <div id="markersOverviewContainer">
        <div>
          <div id="markersHeader" className="header" style={{ gridTemplateColumns: "15em 1em 3em" }}>
            <div data-tip="Click to sort by marker type" className="sortable alphabetically" data-sortby="type">
              Type&nbsp;
            </div>
            <div
              id="markersInverPin"
              style={{ color: "#6e5e66" }}
              data-tip="Click to invert pin state for all markers"
              className="icon-pin pointer"
            />
            <div
              id="markersInverLock"
              style={{ color: "#6e5e66" }}
              data-tip="Click to invert lock state for all markers"
              className="icon-lock pointer"
            />
          </div>
          <div id="markersBody" className="table" />
          <div>
            <label htmlFor="markersSearch" data-tip="Filter by type">
              Search: <input id="markersSearch" type="search" />
            </label>
          </div>
          <div id="markersTotal" className="totalLine">
            <div data-tip="Markers number">
              Markers: <span id="markersFooterNumber">0</span> of <span id="markersFooterTotal">0</span>
            </div>
          </div>
          <div id="markersFooter">
            <button
              type="button"
              id="markersOverviewRefresh"
              data-tip="Refresh the Overview screen"
              className="icon-cw"
            />
            <input type="hidden" id="addedMarkerType" name="addedMarkerType" defaultValue="" />
            <span id="markerTypeSelectorWrapper">
              <button type="button" id="markerTypeSelector" data-tip="Select marker type for newly added markers.">
                ❓
              </button>
              <div id="markerTypeSelectMenu" />
            </span>
            <button
              type="button"
              id="markersAddFromOverview"
              data-tip="Add a new marker. Hold Shift to add multiple"
              className="icon-plus"
            />
            <button
              type="button"
              id="markersGenerationConfig"
              data-tip="Config markers generation options"
              className="icon-cog"
            />
            <button type="button" id="markersRemoveAll" data-tip="Remove all unlocked markers" className="icon-trash" />
            <button
              type="button"
              id="markersExport"
              data-tip="Save markers data as a text file (.csv)"
              className="icon-download"
            />
          </div>
          <div id="styleSaver" className="dialog stable textual" style={{ display: "none" }}>
            <div id="styleSaverHeader" style={{ padding: "2px 0" }}>
              <span>Preset name:</span>
              <input
                id="styleSaverName"
                data-tip="Enter style preset name"
                placeholder="Preset name"
                style={{ width: "12em" }}
                required
              />
              <span
                id="styleSaverTip"
                data-tip="Shows whether there is already a preset with this name"
                className="italic"
              />
            </div>
            <div id="styleSaverBody" style={{ padding: "2px 0", width: "100%" }}>
              <span>Style JSON:</span>
              <textarea
                id="styleSaverJSON"
                rows={18}
                data-tip="Style JSON is getting formed based the current settings, but can be entered manually"
                placeholder="Paste any valid style data in JSON format"
                autoCorrect="off"
                spellCheck="false"
                defaultValue={""}
              />
            </div>
            <div id="styleSaverFooter">
              <button
                type="button"
                id="styleSaverSave"
                data-tip="Save current JSON as a new style preset"
                className="icon-check"
              />
              <button
                type="button"
                id="styleSaverDownload"
                data-tip="Download the style as a .json file (can be opened in any text editor)"
                className="icon-download"
              />
              <button
                type="button"
                id="styleSaverLoad"
                data-tip="Open previously downloaded style file"
                className="icon-upload"
              />
              <button
                type="button"
                id="styleSaverCA"
                data-tip="Find or share custom style preset on Cartography Assets portal"
                className="icon-drafting-compass"
              />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
