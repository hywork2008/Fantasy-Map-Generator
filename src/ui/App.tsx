import { useViewState } from "../store";
import { ExitCustomization } from "./components/ExitCustomization";
import { NotesBox } from "./components/NotesBox";
import { OptionsContainer } from "./components/OptionsContainer";
import { ToastContainer } from "./components/Toast";
import { DialogsContainer } from "./dialogs/DialogsContainer";

export const App = () => {
  const openDialogs = useViewState(state => state.openDialogs);

  return (
    <div id="react-ui-container" className="-app__pointer-events-none--position-absolute--top-0--lef">
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
