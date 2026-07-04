import { exitFocus } from "../../controllers/focus-view";
import { useFocusViewState } from "../../store/focusViewState";
import { IconButton } from "./IconButton";

export const FocusBanner = () => {
  const { isActive, kind, label } = useFocusViewState();

  if (!isActive) return null;

  return (
    <div
      id="focus-banner"
      style={{
        position: "fixed",
        top: "10px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        gap: "0.5em",
        padding: "0.4em 0.8em",
        borderRadius: "6px",
        background: "rgba(30, 30, 30, 0.85)",
        color: "#fff"
      }}
    >
      <span>
        Focused on {kind}: {label}
      </span>
      <IconButton data-tip="Exit focus and show the whole map" className="icon-cancel pointer" onClick={exitFocus} />
    </div>
  );
};
