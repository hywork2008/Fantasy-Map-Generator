import type React from "react";
import { useEffect } from "react";
import { dialogStore } from "../../store/dialogState";
import { heightmapEditModeStore, useHeightmapEditModeState } from "../../store/heightmapDialogState";
import { Dialog } from "./Dialog";

export const HeightmapEditModeDialog: React.FC = () => {
  const isOpen = useHeightmapEditModeState(s => s.isOpen);
  const { onErase, onKeep, onRisk, onCancel } = heightmapEditModeStore.getState();

  const close = () => heightmapEditModeStore.getState().close();

  useEffect(() => {
    if (!isOpen) return;
    dialogStore.getState().openDialog("heightmapEditMode", {
      onClose: () => {
        const { onCancel: cancel } = heightmapEditModeStore.getState();
        heightmapEditModeStore.getState().close();
        cancel();
      }
    });
    return () => {
      dialogStore.getState().closeDialog("heightmapEditMode");
    };
  }, [isOpen]);

  const handle = (action: () => void) => {
    close();
    action();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Edit Heightmap"
      onClose={() => handle(onCancel)}
      buttons={[
        { label: "Erase", onClick: () => handle(onErase) },
        { label: "Keep", onClick: () => handle(onKeep) },
        { label: "Risk", onClick: () => handle(onRisk) },
        { label: "Cancel", onClick: () => handle(onCancel) }
      ]}
      className="-heightmap-edit-mode-dialog__max-width-28em"
    >
      <div>
        Heightmap is a core element on which all other data (rivers, burgs, states etc) is based. So the best edit
        approach is to <i>erase</i> the secondary data and let the system automatically regenerate it on edit
        completion.
        <p>
          <i>Erase</i> mode also allows you Convert an Image into a heightmap or use Template Editor.
        </p>
        <p>
          You can <i>keep</i> the data, but you won't be able to change the coastline.
        </p>
        <p>
          Try <i>risk</i> mode to change the coastline and keep the data. The data will be restored as much as possible,
          but it can cause unpredictable errors.
        </p>
        <p>
          Please{" "}
          <span
            className="pseudoLink"
            onClick={() => (window as unknown as Record<string, (arg: string) => void>).saveMap?.("machine")}
          >
            save the map
          </span>{" "}
          before editing the heightmap!
        </p>
        <p className="-heightmap-edit-mode-dialog__margin-bottom-0">
          Check out{" "}
          <a
            href="https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Heightmap-viewContext.customization"
            rel="noopener"
            target="_blank"
          >
            wiki
          </a>{" "}
          for guidance.
        </p>
      </div>
    </Dialog>
  );
};
