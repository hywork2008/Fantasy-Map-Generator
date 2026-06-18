import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RegimentsOverviewDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("regimentsOverview"));

  return (
    <Dialog isOpen={isOpen} title="Regiments Overview" onClose={() => closeDialog("regimentsOverview")}>
      <div id="regimentsOverviewContainer">
        <div>
          <div id="regimentsHeader" className="header">
            <div data-tip="State name. Click to sort" className="sortable alphabetically" data-sortby="state">
              State&nbsp;
            </div>
            <div
              data-tip="Regiment emblem and name. Click to sort by name"
              className="sortable alphabetically"
              data-sortby="name"
            >
              Name&nbsp;
            </div>
            <div
              data-tip="Total military personnel (not considering crew). Click to sort"
              id="regimentsTotal"
              className="sortable icon-sort-number-down"
              data-sortby="total"
            >
              Total&nbsp;
            </div>
          </div>
          <div id="regimentsBody" className="table" data-type="absolute" />
          <div id="regimentsFooter">
            <button
              type="button"
              id="regimentsOverviewRefresh"
              data-tip="Refresh the overview screen"
              className="icon-cw"
            />
            <button
              type="button"
              id="regimentsPercentage"
              data-tip="Toggle percentage / absolute values views"
              className="icon-percent"
            />
            <button type="button" id="regimentsAddNew" data-tip="Add new Regiment" className="icon-user-plus" />
            <div data-tip="Select state" style={{ display: "inline-block" }}>
              <span>State: </span>
              <select id="regimentsFilter" />
            </div>
            <button
              type="button"
              id="regimentsExport"
              data-tip="Save military-related data as a text file (.csv)"
              className="icon-download"
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
};
