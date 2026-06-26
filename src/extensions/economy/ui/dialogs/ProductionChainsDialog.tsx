import type React from "react";
import { useDialogState } from "../../../../store/dialogState";
import { Dialog } from "../../../../ui/dialogs/Dialog";
import { closeDialog } from "../../../../ui/dialogs/dialogService";

export const ProductionChainsDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("productionChainsDialog"));

  return (
    <Dialog isOpen={isOpen} title="Production Chains" onClose={() => closeDialog("productionChainsDialog")}>
      <div id="productionChainsContent" style={{ overflow: "auto" }} />
    </Dialog>
  );
};
