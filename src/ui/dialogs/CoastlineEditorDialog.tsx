import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const CoastlineEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("coastlineEditor"));

  return (
    <Dialog isOpen={isOpen} title="Coastline Editor" onClose={() => closeDialog("coastlineEditor")}>
      <button type="button" id="coastlineGroupsShow" data-tip="Show the group selection" className="icon-tags"></button>
      <div id="coastlineGroupsSelection" style={{ display: "none" }}>
        <button type="button" id="coastlineGroupsHide" data-tip="Hide the group section" className="icon-tags"></button>
        <select id="coastlineGroup" data-tip="Select a group for this coastline" style={{ width: "9em" }}></select>
        <input
          id="coastlineGroupName"
          placeholder="new group name"
          data-tip="Provide a name for the new group"
          style={{ display: "none", width: "9em" }}
        />
        <span
          id="coastlineGroupAdd"
          data-tip="Create a new group for this coastline"
          className="icon-plus pointer"
        ></span>
        <span id="coastlineGroupRemove" data-tip="Remove the group" className="icon-trash-empty pointer"></span>
      </div>

      <button
        id="coastlineEditStyle"
        data-tip="Edit coastline group style in Style Editor"
        className="icon-brush"
        type="button"
      ></button>
      <button type="button" id="coastlineArea" data-tip="Landmass area in selected units">
        0
      </button>
    </Dialog>
  );
};
