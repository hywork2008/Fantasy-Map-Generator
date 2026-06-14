import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const IceEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("iceEditor"));

  return (
    <Dialog isOpen={isOpen} title="Ice Editor" onClose={() => closeDialog("iceEditor")}>
      <button type="button" id="iceEditStyle" data-tip="Edit style in Style Editor" className="icon-brush"></button>
      <button type="button" id="iceRandomize" data-tip="Randomize Iceberg shape" className="icon-shuffle"></button>
      <input id="iceSize" data-tip="Change Iceberg size" type="range" min=".05" max="2" step=".01" />
      <button type="button" id="iceNew" data-tip="Add an Iceberg (click on map)" className="icon-plus"></button>
      <button
        id="iceRemove"
        data-tip="Remove the element"
        data-shortcut="Delete"
        className="icon-trash fastDelete"
        type="button"
      ></button>
    </Dialog>
  );
};
