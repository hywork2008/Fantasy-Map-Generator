import { useToastStore } from "../../store/toastStore";

const tipBackgroundMap: Record<string, string> = {
  info: "linear-gradient(0.1turn, #ffffff00, #5e5c5c80, #ffffff00)",
  success: "linear-gradient(0.1turn, #ffffff00, #127912cc, #ffffff00)",
  warn: "linear-gradient(0.1turn, #ffffff00, #be5d08cc, #ffffff00)",
  error: "linear-gradient(0.1turn, #ffffff00, #e11d1dcc, #ffffff00)"
};

export function ToastContainer() {
  const toast = useToastStore(s => s.toast);
  const removeToast = useToastStore(s => s.removeToast);

  if (!toast) return null;

  return (
    <div
      id="toast-container"
      style={{ position: "fixed", bottom: "20px", left: "50%", zIndex: 10000, pointerEvents: "auto" }}
    >
      <div
        onClick={removeToast}
        style={{ background: tipBackgroundMap[toast.type], cursor: "pointer" }}
        title="Click to dismiss"
      >
        {toast.message}
      </div>
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
