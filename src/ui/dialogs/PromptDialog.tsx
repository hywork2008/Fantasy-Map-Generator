import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { dialogStore, useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";

export const PromptDialog: React.FC = () => {
  const { t } = useTranslation();
  const config = useDialogState(state => state.promptConfig);
  const [value, setValue] = useState<string | number>("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (config && config.default !== undefined) {
      setValue(config.default);
    } else {
      setValue("");
    }
  }, [config]);

  useEffect(() => {
    if (config && inputRef.current) {
      inputRef.current.focus();
    }
  }, [config]);

  if (!config) return null;

  const handleClose = () => {
    if (config.onCancel) config.onCancel();
    dialogStore.getState().setPromptConfig(null);
  };

  const handleConfirm = () => {
    config.onConfirm(value);
    dialogStore.getState().setPromptConfig(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirm();
    }
  };

  const isNumber =
    config.step !== undefined ||
    config.min !== undefined ||
    config.max !== undefined ||
    typeof config.default === "number";

  return (
    <Dialog
      isOpen={true}
      title={t("dialogs.prompt.title")}
      onClose={handleClose}
      buttons={[
        { label: t("common.cancel"), onClick: handleClose },
        { label: t("common.ok"), onClick: handleConfirm }
      ]}
    >
      <div>{config.message}</div>
      <input
        ref={inputRef}
        type={isNumber ? "number" : "text"}
        value={value}
        onChange={e => setValue(isNumber ? parseFloat(e.target.value) || 0 : e.target.value)}
        onKeyDown={handleKeyDown}
        step={config.step}
        min={config.min}
        max={config.max}
      />
    </Dialog>
  );
};
