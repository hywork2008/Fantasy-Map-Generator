import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RiverCreatorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("riverCreator"));

  return (
    <Dialog isOpen={isOpen} title="River Creator" onClose={() => closeDialog("riverCreator")}>
      <div id="riverCreatorBody" className="table"></div>
      <div id="riverCreatorFooter">
        <button
          type="button"
          id="riverCreatorComplete"
          data-tip="Complete river creation"
          className="icon-check"
        ></button>
        <button type="button" id="riverCreatorCancel" data-tip="Cancel the creation" className="icon-cancel"></button>
      </div>
    </Dialog>
  );
};
