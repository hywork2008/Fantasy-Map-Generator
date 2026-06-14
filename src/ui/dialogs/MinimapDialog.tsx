import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const MinimapDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("minimap"));

  return (
    <Dialog isOpen={isOpen} title="Minimap" onClose={() => closeDialog("minimap")}>
      <div id="minimapContainer">
        <div>
          <div id="minimapContent" />
        </div>
      </div>
    </Dialog>
  );
};
