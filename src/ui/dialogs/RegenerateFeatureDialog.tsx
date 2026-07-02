import type React from "react";
import { useState } from "react";
import {
  regenerateFeatureDialogStore,
  useRegenerateFeatureDialogState
} from "../../store/regenerateFeatureDialogState";
import { useUiPreferencesState } from "../../store/uiPreferencesState";
import { Dialog } from "./Dialog";

export const RegenerateFeatureDialog: React.FC = () => {
  const isOpen = useRegenerateFeatureDialogState(s => s.isOpen);
  const featureName = useRegenerateFeatureDialogState(s => s.featureName);
  const [dontAsk, setDontAsk] = useState(false);

  const close = () => {
    setDontAsk(false);
    regenerateFeatureDialogStore.getState().close();
  };

  const proceed = () => {
    if (dontAsk) useUiPreferencesState.getState().setDontAskRegenerateFeature(true);
    regenerateFeatureDialogStore.getState().onConfirm();
    close();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={`Regenerate ${featureName}`}
      onClose={close}
      buttons={[
        { label: "Proceed", onClick: proceed },
        { label: "Cancel", onClick: close }
      ]}
    >
      <p>
        Regenerate will remove all the custom changes for the {featureName}.
        <br />
        <br />
        Are you sure you want to proceed?
      </p>
      <div className="-regenerate-feature-dialog__margin-top-1em">
        <input id="dontAskAgain" type="checkbox" checked={dontAsk} onChange={e => setDontAsk(e.target.checked)} />
        <label htmlFor="dontAskAgain" className="-regenerate-feature-dialog__margin-left-0-4em">
          <i>do not ask again</i>
        </label>
      </div>
    </Dialog>
  );
};
