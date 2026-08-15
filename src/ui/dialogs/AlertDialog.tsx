import type React from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type DialogConfig, dialogStore } from "../../store/dialogState";
import { Dialog } from "./Dialog";

export const AlertDialog: React.FC<{ config: DialogConfig | null }> = ({ config }) => {
  const { t } = useTranslation();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (config?.type === "rich" && config.onOpen && contentRef.current) {
      config.onOpen(contentRef.current);
    }
  }, [config]);

  if (!config) return null;

  const handleClose = () => {
    if (config.onClose) config.onClose();
    dialogStore.getState().setAlertConfig(null);
  };

  const handleConfirm = () => {
    if (config.onConfirm) config.onConfirm();
    dialogStore.getState().setAlertConfig(null);
  };

  const handleCancel = () => {
    if (config.onCancel) config.onCancel();
    dialogStore.getState().setAlertConfig(null);
  };

  let buttons: Array<{ label: string; onClick: () => void; keepOpen?: boolean }> = [];

  if (config.type === "alert") {
    buttons = [{ label: t("common.ok"), onClick: handleClose }];
  } else if (config.type === "confirm") {
    buttons = [
      { label: config.cancel || t("common.cancel"), onClick: handleCancel },
      { label: config.confirm || t("common.ok"), onClick: handleConfirm }
    ];
  } else if (config.type === "rich") {
    if (config.buttons) {
      const bArr = Array.isArray(config.buttons)
        ? config.buttons
        : Object.entries(config.buttons).map(([label, onClick]) => ({
            label,
            onClick: onClick as () => void,
            keepOpen: false
          }));
      buttons = bArr.map(b => ({
        label: b.label,
        onClick: () => {
          b.onClick();
          if (!b.keepOpen) {
            dialogStore.getState().setAlertConfig(null);
          }
        }
      }));
    } else {
      // Default to an OK button for rich dialogs if none specified
      buttons = [{ label: t("common.ok"), onClick: handleClose }];
    }
  }

  return (
    <Dialog
      isOpen={true}
      title={config.title || t("dialogs.alert.title")}
      onClose={handleClose}
      buttons={buttons}
      className="alert-dialog"
    >
      {config.type === "rich" ? (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: alert content is app-controlled
        <div ref={contentRef} dangerouslySetInnerHTML={{ __html: config.content || "" }} />
      ) : (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: alert content is app-controlled
        <div dangerouslySetInnerHTML={{ __html: config.message || "" }} />
      )}
    </Dialog>
  );
};
