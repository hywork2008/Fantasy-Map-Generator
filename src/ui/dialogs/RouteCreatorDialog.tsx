import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RouteCreatorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("routeCreator"));

  return (
    <Dialog isOpen={isOpen} title="Route Creator" onClose={() => closeDialog("routeCreator")}>
      <div>Click on map to add/remove route points</div>
      <div id="routeCreatorBody" className="table -route-creator-dialog__margin-0-3em-0"></div>
      <div id="routeCreatorFooter">
        <button
          type="button"
          id="routeCreatorComplete"
          data-tip="Complete route creation"
          className="icon-check"
        ></button>
        <button type="button" id="routeCreatorCancel" data-tip="Cancel the creation" className="icon-cancel"></button>
        <div className="d-inline-block">
          Group:
          <select id="routeCreatorGroupSelect"></select>
          <span id="routeCreatorGroupEdit" data-tip="Edit route groups" className="icon-pencil pointer"></span>
        </div>
      </div>
    </Dialog>
  );
};
