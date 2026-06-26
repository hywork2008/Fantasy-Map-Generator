import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const RouteGroupsEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("routeGroupsEditor"));

  return (
    <Dialog isOpen={isOpen} title="Route Groups Editor" onClose={() => closeDialog("routeGroupsEditor")}>
      <div id="routeGroupsEditorBody" className="table" style={{ padding: "0.3em 0", width: "100%" }}></div>
      <div id="routeGroupsEditorFooter">
        <button type="button" id="routeGroupsEditorAdd" data-tip="Add route group" className="icon-plus"></button>
      </div>
    </Dialog>
  );
};
