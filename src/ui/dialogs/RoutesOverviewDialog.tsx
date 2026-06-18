import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RoutesOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("routesOverview"));

  return (
    <Dialog isOpen={isOpen} title="Routes Overview" onClose={() => closeDialog("routesOverview")}>
      <div id="routesOverviewContainer">
        <div>
          <div id="routesHeader" className="header" style={{ gridTemplateColumns: "17em 8em 8em" }}>
            <div data-tip="Click to sort by route name" className="sortable alphabetically" data-sortby="name">
              Route&nbsp;
            </div>
            <div data-tip="Click to sort by route group" className="sortable alphabetically" data-sortby="group">
              Group&nbsp;
            </div>
            <div
              data-tip="Click to sort by route length"
              className="sortable icon-sort-number-down"
              data-sortby="length"
            >
              Length&nbsp;
            </div>
          </div>
          <div id="routesBody" className="table" />
          <div id="routesTotal" className="totalLine">
            <div data-tip="Routes number" style={{ marginLeft: 4 }}>
              Routes:&nbsp;<span id="routesFooterNumber">0</span>
            </div>
            <div data-tip="Average length" style={{ marginLeft: 12 }}>
              Average length:&nbsp;<span id="routesFooterLength">0</span>
            </div>
          </div>
          <div id="routesFooter">
            <button type="button" id="routesOverviewRefresh" data-tip="Refresh the Editor" className="icon-cw" />
            <button
              type="button"
              id="routesCreateNew"
              data-tip="Create a new route selecting route cells"
              className="icon-map-pin"
            />
            <button
              type="button"
              id="routesExport"
              data-tip="Save routes-related data as a text file (.csv)"
              className="icon-download"
            />
            <button type="button" id="routesLockAll" data-tip="Lock or unlock all routes" className="icon-lock" />
            <button
              type="button"
              id="routesRemoveAll"
              data-tip="Remove all unlocked routes (locked routes are kept)"
              className="icon-trash"
            />
            <label htmlFor="routesSearch" data-tip="Filter by name or group" style={{ marginLeft: "0.2em" }}>
              Search: <input id="routesSearch" type="search" />
            </label>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
