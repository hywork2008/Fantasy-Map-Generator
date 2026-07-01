import type React from "react";
import { closeDialog, Dialog, useDialogState } from "../../../hostUi";

export const ProductionChainsDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("productionChains"));

  return (
    <Dialog isOpen={isOpen} title="Production Chains" onClose={() => closeDialog("productionChains")}>
      <div id="productionChainsContent" className="-production-chains-dialog__overflow-auto" />
    </Dialog>
  );
};
