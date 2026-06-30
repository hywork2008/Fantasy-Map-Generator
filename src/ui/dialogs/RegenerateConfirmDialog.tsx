import type React from "react";
import { useCallback, useRef } from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export interface RegenerateConfirmConfig {
  [key: string]: unknown;
  featureName: string;
  onProceed: (dontAskAgain: boolean) => void;
}

const DIALOG_ID = "regenerateConfirm";

export const RegenerateConfirmDialog: React.FC = () => {
  const config = useDialogState(s => s.dialogConfigs[DIALOG_ID]) as unknown as RegenerateConfirmConfig | undefined;
  const checkboxRef = useRef<HTMLInputElement>(null);

  const handleProceed = useCallback(() => {
    const dontAsk = checkboxRef.current?.checked ?? false;
    closeDialog(DIALOG_ID);
    config?.onProceed(dontAsk);
  }, [config]);

  const handleCancel = useCallback(() => closeDialog(DIALOG_ID), []);

  if (!config) return null;

  return (
    <Dialog
      isOpen={true}
      title={`Regenerate ${config.featureName}`}
      onClose={handleCancel}
      buttons={[
        { label: "Proceed", onClick: handleProceed },
        { label: "Cancel", onClick: handleCancel }
      ]}
    >
      <div>
        <p>
          Regenerate will remove all the custom changes for the {config.featureName}.
          <br />
          <br />
          Are you sure you want to proceed?
        </p>
        <div style={{ marginTop: "1em" }}>
          <input ref={checkboxRef} id="dontAskAgain" className="checkbox" type="checkbox" />
          <label htmlFor="dontAskAgain" className="checkbox-label dontAsk">
            <i>do not ask again</i>
          </label>
        </div>
      </div>
    </Dialog>
  );
};
