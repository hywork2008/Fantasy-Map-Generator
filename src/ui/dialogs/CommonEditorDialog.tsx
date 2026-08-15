import type React from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { modules } from "../../store/editorState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";
import type { EditorConfig } from "./editorRegistry";

export const CommonEditorDialog: React.FC<{ id: string; config: EditorConfig }> = ({ id, config }) => {
  const { t } = useTranslation();
  const { title, component: Component, moduleFlag, onClose, tableLayout, dialogHeight, dialogClassName } = config;

  // Cleanup when dialog is closed (either via X button or programmatic toggle)
  useEffect(() => {
    return () => {
      if (onClose) onClose();

      if (moduleFlag) {
        modules[moduleFlag] = false;
      }
    };
  }, [onClose, moduleFlag]);

  const handleClose = () => {
    // tools.ts restores the exact before-open layer snapshot for editor dialogs.
    // Toggling the configured layer here would race that restoration and can leave
    // a layer that the editor changed indirectly (such as toggleStates) enabled.
    closeDialog(id);
  };

  return (
    <Dialog
      isOpen={true}
      title={t(`dialogs.editors.${id}`, { defaultValue: title })}
      onClose={handleClose}
      className={[tableLayout ? "fmg-dialog--table" : "", dialogClassName].filter(Boolean).join(" ")}
      style={dialogHeight ? { height: dialogHeight } : undefined}
    >
      <Component />
    </Dialog>
  );
};
