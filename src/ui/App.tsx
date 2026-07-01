import type React from "react";
import { useMemo } from "react";
import { showDataTip } from "../services/tooltipService";
import { useViewState } from "../store";
import { debounce } from "../utils";
import { ExitCustomization } from "./components/ExitCustomization";
import { NotesBox } from "./components/NotesBox";
import { OptionsContainer } from "./components/OptionsContainer";
import { ToastContainer } from "./components/Toast";
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
    <div
      id="react-ui-container"
      className="-app__pointer-events-none--position-absolute--top-0--lef"
      onMouseMove={handleMouseMove}
    >
      <ToastContainer />

      <DialogsContainer />
      {/* The Options Menu */}
      <OptionsContainer />

      {/* Heightmap exit button - absolutely positioned, managed via custom events */}
      <ExitCustomization />

      {/* Floating UI */}
      <NotesBox />

      {/* Development Overlay */}
      {import.meta.env.DEV && (
        <div className="-app__position-absolute--bottom-10--right-10--padding-5p">
          {openDialogs.length > 0 && ` | Open Dialogs: ${openDialogs.join(", ")}`}
        </div>
      )}
    </div>
  );
};
