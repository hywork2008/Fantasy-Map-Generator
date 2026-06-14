import { useViewState } from "../store";
import { OptionsContainer } from "./components/OptionsContainer";
import { ExitCustomization } from "./components/ExitCustomization";

export const App = () => {
  const openDialogs = useViewState((state) => state.openDialogs);
  
  return (
    <div id="react-ui-container" style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1000 }}>
      {/* The Options Menu */}
      <OptionsContainer />

      {/* Heightmap exit button - absolutely positioned, managed via custom events */}
      <ExitCustomization />

      {/* Development Overlay */}
      {import.meta.env.DEV && (
        <div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,0.7)', color: 'white', padding: '5px 10px', borderRadius: '4px', fontSize: '10px' }}>
          React + Zustand Active
          {openDialogs.length > 0 && ` | Open Dialogs: ${openDialogs.join(', ')}`}
        </div>
      )}
    </div>
  );
};
