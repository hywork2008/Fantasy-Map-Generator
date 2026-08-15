import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  regenerateFeatureDialogStore,
  useRegenerateFeatureDialogState
} from "../../store/regenerateFeatureDialogState";
import { useUiPreferencesState } from "../../store/uiPreferencesState";
import { Dialog } from "./Dialog";

export const RegenerateFeatureDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useRegenerateFeatureDialogState(s => s.isOpen);
  const featureName = useRegenerateFeatureDialogState(s => s.featureName);
  const feature = t(`dialogs.features.${featureName}`, { defaultValue: featureName });
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
      title={t("dialogs.regenerate.title", { feature })}
      onClose={close}
      buttons={[
        { label: t("common.proceed"), onClick: proceed },
        { label: t("common.cancel"), onClick: close }
      ]}
    >
      <p>
        {t("dialogs.regenerate.body", { feature })}
        <br />
        <br />
        {t("dialogs.regenerate.confirm")}
      </p>
      <div>
        <input id="dontAskAgain" type="checkbox" checked={dontAsk} onChange={e => setDontAsk(e.target.checked)} />
        <label htmlFor="dontAskAgain">
          <i>{t("dialogs.regenerate.dontAsk")}</i>
        </label>
      </div>
    </Dialog>
  );
};
