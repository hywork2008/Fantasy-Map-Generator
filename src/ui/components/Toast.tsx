import { useToastStore } from "../../store/toastStore";
import { IconButton } from "./IconButton";

const tipBackgroundMap: Record<string, string> = {
  info: "linear-gradient(0.1turn, #ffffff00, #5e5c5c80, #ffffff00)",
  success: "linear-gradient(0.1turn, #ffffff00, #127912cc, #ffffff00)",
  warn: "linear-gradient(0.1turn, #ffffff00, #be5d08cc, #ffffff00)",
  error: "linear-gradient(0.1turn, #ffffff00, #e11d1dcc, #ffffff00)"
};

export function ToastContainer() {
  const toast = useToastStore(s => s.toast);
  const hoverTooltip = useToastStore(s => s.hoverTooltip);
  const removeToast = useToastStore(s => s.removeToast);

  return (
    <>
      {toast && (
        <div
          id="toast-container"
          style={{ position: "fixed", bottom: "20px", left: "50%", zIndex: 10000, pointerEvents: "auto" }}
        >
          <IconButton
            onClick={removeToast}
            style={{ background: tipBackgroundMap[toast.type], cursor: "pointer" }}
            title="Click to dismiss"
          >
            {toast.message}
          </IconButton>
        </div>
      )}
      {hoverTooltip && <HoverTooltip message={hoverTooltip.message} x={hoverTooltip.x} y={hoverTooltip.y} />}
    </>
  );
}

function HoverTooltip({ message, x, y }: { message: string; x: number; y: number }) {
  const isNearRightEdge = x > window.innerWidth - 320;
  const isNearBottomEdge = y > window.innerHeight - 100;

  return (
    <div
      id="hover-tooltip"
      role="tooltip"
      style={
        isNearRightEdge
          ? isNearBottomEdge
            ? { right: `${window.innerWidth - x + 14}px`, bottom: `${window.innerHeight - y + 14}px` }
            : { right: `${window.innerWidth - x + 14}px`, top: `${y + 18}px` }
          : isNearBottomEdge
            ? { left: `${x + 14}px`, bottom: `${window.innerHeight - y + 14}px` }
            : { left: `${x + 14}px`, top: `${y + 18}px` }
      }
    >
      {message}
    </div>
  );
}
