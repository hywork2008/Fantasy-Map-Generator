import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RegimentSelectorScreenDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("regimentSelectorScreen"));

  return (
    <Dialog isOpen={isOpen} title="Regiment Selector" onClose={() => closeDialog("regimentSelectorScreen")}>
      <div id="regimentSelectorHeader" className="header" style={{ gridTemplateColumns: "9em 13em 4em 6em" }}>
        <div data-tip="Click to sort by state name" className="sortable alphabetically" data-sortby="state">
          State&nbsp;
        </div>
        <div data-tip="Click to sort by regiment name" className="sortable alphabetically" data-sortby="regiment">
          Regiment&nbsp;
        </div>
        <div data-tip="Click to sort by total military forces" className="sortable" data-sortby="total">
          Total&nbsp;
        </div>
        <div
          data-tip="Click to sort by distance to the battlefield"
          className="sortable icon-sort-number-up"
          data-sortby="distance"
        >
          Distance&nbsp;
        </div>
      </div>
      <div id="regimentSelectorBody" className="table"></div>
    </Dialog>
  );
};
