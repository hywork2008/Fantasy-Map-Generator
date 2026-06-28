import type React from "react";
import { generationErrorDialogStore, useGenerationErrorDialogState } from "../../store/generationErrorDialogState";
import { Dialog } from "./Dialog";

export const GenerationErrorDialog: React.FC = () => {
  const isOpen = useGenerationErrorDialogState(s => s.isOpen);
  const errorText = useGenerationErrorDialogState(s => s.errorText);
  const { onCleanup, onRegenerate } = generationErrorDialogStore.getState();

  const close = () => generationErrorDialogStore.getState().close();

  return (
    <Dialog
      isOpen={isOpen}
      title="Generation error"
      onClose={close}
      style={{ maxWidth: "32em" }}
      buttons={[
        {
          label: "Cleanup data",
          onClick: () => {
            close();
            onCleanup();
          }
        },
        {
          label: "Regenerate",
          onClick: () => {
            close();
            onRegenerate();
          }
        },
        { label: "Ignore", onClick: close }
      ]}
    >
      <div>
        <p>An error has occurred on map generation. Please retry.</p>
        <p>If error is critical, clear the stored data and try again.</p>
        <p id="errorBox" style={{ fontFamily: "monospace", fontSize: "0.85em", wordBreak: "break-all" }}>
          {errorText}
        </p>
      </div>
    </Dialog>
  );
};
