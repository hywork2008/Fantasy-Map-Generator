import { useViewState } from "../store";
import { ExitCustomization } from "./components/ExitCustomization";
import { NotesBox } from "./components/NotesBox";
import { OptionsContainer } from "./components/OptionsContainer";
import { DialogsContainer } from "./dialogs/DialogsContainer";

export const App = () => {
  const openDialogs = useViewState(state => state.openDialogs);

  return (
    <div
      id="react-ui-container"
      style={{
        pointerEvents: "none",
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 1000
      }}
    >
      <DialogsContainer />
      {/* The Options Menu */}
      <OptionsContainer />

      {/* Heightmap exit button - absolutely positioned, managed via custom events */}
      <ExitCustomization />

      {/* Floating UI */}
      <NotesBox />

      {/* Development Overlay */}
      {import.meta.env.DEV && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            right: 10,
            padding: "5px 10px",
            borderRadius: "4px",
            fontSize: "10px"
          }}
        >
          {openDialogs.length > 0 && ` | Open Dialogs: ${openDialogs.join(", ")}`}
        </div>
      )}
    </div>
  );
};
