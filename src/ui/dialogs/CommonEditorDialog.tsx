import type React from "react";
import { useEffect } from "react";
import { modules } from "../../store/editorState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";
import type { EditorConfig } from "./editorRegistry";

function layerIsOn(el: string): boolean {
  const e = document.getElementById(el);
  if (!e) return false;
  return e.classList.contains("pressed");
}

export const CommonEditorDialog: React.FC<{ id: string; config: EditorConfig }> = ({ id, config }) => {
  const { title, component: Component, moduleFlag, layerId, onClose, tableLayout, dialogHeight } = config;

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
    if (layerId && layerIsOn(layerId)) {
      document.getElementById(layerId)?.click();
    }
    closeDialog(id);
  };

  return (
    <Dialog
      isOpen={true}
      title={title}
      onClose={handleClose}
      className={tableLayout ? "fmg-dialog--overflow-hidden" : undefined}
      style={dialogHeight ? { height: dialogHeight } : undefined}
    >
      <Component />
    </Dialog>
  );
};
