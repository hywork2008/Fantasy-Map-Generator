import type React from "react";
import { imageConverterCloseStore, useImageConverterCloseState } from "../../store/heightmapDialogState";
import { Dialog } from "./Dialog";

export const ImageConverterCloseDialog: React.FC = () => {
  const isOpen = useImageConverterCloseState(s => s.isOpen);
  const { onComplete, onClose } = imageConverterCloseStore.getState();

  const close = () => imageConverterCloseStore.getState().close();

  return (
    <Dialog
      isOpen={isOpen}
      title="Close Image Converter"
      onClose={close}
      buttons={[
        { label: "Cancel", onClick: close },
        {
          label: "Complete",
          onClick: () => {
            close();
            onComplete();
          }
        },
        {
          label: "Close",
          onClick: () => {
            close();
            onClose();
          }
        }
      ]}
    >
      <p>
        Are you sure you want to close the Image Converter?
        <br />
        Click <b>Cancel</b> to keep editing.
        <br />
        Click <b>Complete</b> to apply the conversion and close the tool.
        <br />
        Click <b>Close</b> to discard the conversion and restore the previous heightmap.
      </p>
    </Dialog>
  );
};
