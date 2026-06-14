import type React from "react";
import ReactDOM from "react-dom";
import { useDraggable } from "./useDraggable";
import "./dialog.css";

export interface DialogProps {
  isOpen: boolean;
  title?: React.ReactNode;
  onClose?: () => void;
  children: React.ReactNode;
  buttons?: Array<{ label: string; onClick: () => void }>;
  className?: string;
  style?: React.CSSProperties;
}

export const Dialog: React.FC<DialogProps> = ({ isOpen, title, onClose, children, buttons, className = "", style }) => {
  const { containerRef } = useDraggable({ handleSelector: ".fmg-dialog-titlebar" });

  const dialogElement = (
    <div
      ref={containerRef}
      className={`fmg-dialog ${className}`}
      style={{ ...style, display: isOpen ? undefined : "none" }}
    >
      <div className="fmg-dialog-titlebar">
        <div className="fmg-dialog-title">{title}</div>
        {onClose && (
          <button type="button" className="fmg-dialog-close" aria-label="Close">
            ✕
          </button>
        )}
      </div>
      <div className="fmg-dialog-content">{children}</div>
      {buttons && buttons.length > 0 && (
        <div className="fmg-dialog-buttonpane">
          {buttons.map(btn => (
            <button type="button" key={btn.label} className="fmg-dialog-button">
              {btn.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // Default portal root is dialogs if it exists, else body
  const root = document.getElementById("dialogs") || document.body;
  return ReactDOM.createPortal(dialogElement, root);
};
