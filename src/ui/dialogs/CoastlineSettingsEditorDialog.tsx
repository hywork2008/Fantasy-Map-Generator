import type React from "react";
import { useEffect, useRef } from "react";
import { useDialogState } from "../../store/dialogState";
import { Dialog } from "./Dialog";
import { closeDialog } from "./dialogService";

export const CoastlineSettingsEditorDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("coastlineSettingsDialog"));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const el = document.getElementById("coastlineSettingsDialog");
    if (!el) return;
    containerRef.current.appendChild(el);
    el.style.display = "";
  }, [isOpen]);

  return (
    <Dialog isOpen={isOpen} title="Coastline Settings Editor" onClose={() => closeDialog("coastlineSettingsDialog")}>
      <div ref={containerRef} />
    </Dialog>
  );
};
