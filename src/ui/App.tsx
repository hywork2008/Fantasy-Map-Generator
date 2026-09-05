import type React from "react";
import { useMemo } from "react";
import { hideDataTip, showDataTip } from "../services/tooltipService";
import { useViewState } from "../store";
import { debounce } from "../utils";
import { ExitCustomization } from "./components/ExitCustomization";
import { FocusBanner } from "./components/FocusBanner";
import { MapContextMenu } from "./components/MapContextMenu";
import { MapReadyTaskStatus } from "./components/MapReadyTaskStatus";
import { NotesBox } from "./components/NotesBox";
import { OptionsContainer } from "./components/OptionsContainer";
import { ToastContainer } from "./components/Toast";
import { ZoomLevelIndicator } from "./components/ZoomLevelIndicator";
import { DebugSnapshotDialog } from "./dialogs/DebugSnapshotDialog";
import { DialogsContainer } from "./dialogs/DialogsContainer";

export const App = () => {
  const openDialogs = useViewState(state => state.openDialogs);

  const handleMouseMove = useMemo(
    () =>
      debounce((e: React.MouseEvent) => {
        showDataTip(e.nativeEvent as MouseEvent);
      }, 50),
    []
  );

  return (
    <div id="react-ui-container" onMouseMove={handleMouseMove} onMouseOut={e => hideDataTip(e.nativeEvent)}>
      <ToastContainer />
      <MapContextMenu />
      <ZoomLevelIndicator />
      <MapReadyTaskStatus />

      {import.meta.env.DEV && <DebugSnapshotDialog />}

      <DialogsContainer />
      {/* The Options Menu */}
      <OptionsContainer />

      {/* Heightmap exit button - absolutely positioned, managed via custom events */}
      <ExitCustomization />

      {/* Focus view banner - shown when rendering is narrowed to one state/province */}
      <FocusBanner />

      {/* Floating UI */}
      <NotesBox />

      {/* Development Overlay */}
      {import.meta.env.DEV && <div>{openDialogs.length > 0 && ` | Open Dialogs: ${openDialogs.join(", ")}`}</div>}
    </div>
  );
};
