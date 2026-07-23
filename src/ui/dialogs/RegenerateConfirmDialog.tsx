import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDialogState } from "../../store/dialogState";
import type { SeaRouteGenerationMode } from "../../types/models";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export interface RegenerateConfirmConfig {
  [key: string]: unknown;
  featureName: string;
  showDontAskAgain?: boolean;
  seaRouteGenerationMode?: SeaRouteGenerationMode;
  onProceed: (dontAskAgain: boolean, seaRouteGenerationMode?: SeaRouteGenerationMode) => void;
}

const DIALOG_ID = "regenerateConfirm";

export const RegenerateConfirmDialog: React.FC = () => {
  const config = useDialogState(s => s.dialogConfigs[DIALOG_ID]) as unknown as RegenerateConfirmConfig | undefined;
  const checkboxRef = useRef<HTMLInputElement>(null);
  const [seaRouteGenerationMode, setSeaRouteGenerationMode] = useState<SeaRouteGenerationMode>("augmented");

  useEffect(() => {
    setSeaRouteGenerationMode(config?.seaRouteGenerationMode ?? "augmented");
  }, [config?.seaRouteGenerationMode]);

  const handleProceed = useCallback(() => {
    const dontAsk = checkboxRef.current?.checked ?? false;
    closeDialog(DIALOG_ID);
    config?.onProceed(dontAsk, seaRouteGenerationMode);
  }, [config, seaRouteGenerationMode]);

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
        {config.seaRouteGenerationMode && (
          <div>
            <label htmlFor="seaRouteGenerationMode">Sea route connections </label>
            <select
              id="seaRouteGenerationMode"
              value={seaRouteGenerationMode}
              onChange={event => setSeaRouteGenerationMode(event.target.value === "augmented" ? "augmented" : "legacy")}
            >
              <option value="augmented">Improved coastal and nearby-port connections</option>
              <option value="legacy">Previous sparse network (Urquhart)</option>
            </select>
            <p>The improved mode restores nearby Delaunay connections and keeps a separate coastal port backbone.</p>
          </div>
        )}
        {config.showDontAskAgain !== false && (
          <div>
            <input ref={checkboxRef} id="dontAskAgain" className="checkbox" type="checkbox" />
            <label htmlFor="dontAskAgain" className="checkbox-label dontAsk">
              <i>do not ask again</i>
            </label>
          </div>
        )}
      </div>
    </Dialog>
  );
};
