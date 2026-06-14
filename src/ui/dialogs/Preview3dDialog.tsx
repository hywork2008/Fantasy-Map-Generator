import type React from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const Preview3dDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("preview3d"));

  return (
    <Dialog isOpen={isOpen} title="Preview3d" onClose={() => closeDialog("preview3d")}>
      <div id="preview3d" style={{ padding: 0 }}></div>
    </Dialog>
  );
};
