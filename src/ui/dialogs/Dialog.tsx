import type React from "react";
import { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { closeAllDialogs } from "./dialogService";
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
  const { containerRef, resizeHandleRef, bringToFront } = useDraggable({ handleSelector: ".fmg-dialog-titlebar" });
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (isOpen) {
      bringToFront();
      setMinimized(false);
    }
  }, [isOpen, bringToFront]);

  const handleMinimize = useCallback(() => {
    const container = containerRef.current;
    if (container && !minimized) {
      // Lock the current rendered position and width before hiding content so
      // the titlebar doesn't jump. Without this, the CSS transform / % values
      // recompute against the collapsed (titlebar-only) size and shift the dialog.
      const rect = container.getBoundingClientRect();
      container.style.left = `${rect.left}px`;
      container.style.top = `${rect.top}px`;
      container.style.width = `${rect.width}px`;
      container.style.transform = "none";
      container.style.right = "auto";
      container.style.bottom = "auto";
    }
    setMinimized(m => !m);
  }, [minimized, containerRef]);

  const dialogElement = (
    <div
      ref={containerRef}
      className={`fmg-dialog ${className}${minimized ? " fmg-dialog--minimized" : ""}`}
      style={{ ...style, display: isOpen ? undefined : "none" }}
    >
      <div className="fmg-dialog-titlebar">
        <div className="fmg-dialog-title">{title}</div>
        <div className="fmg-dialog-titlebar-actions">
          <button
            type="button"
            className="fmg-dialog-titlebar-btn"
            aria-label="Close all dialogs"
            title="Close all dialogs"
            onClick={() => closeAllDialogs()}
          >
            ✕✕
          </button>
          <button
            type="button"
            className="fmg-dialog-titlebar-btn"
            aria-label={minimized ? "Restore" : "Minimize"}
            title={minimized ? "Restore" : "Minimize"}
            onClick={handleMinimize}
          >
            {minimized ? "▲" : "▼"}
          </button>
          {onClose && (
            <button
              type="button"
              className="fmg-dialog-titlebar-btn"
              aria-label="Close"
              title="Close"
              onClick={onClose}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {!minimized && (
        <>
          <div className="fmg-dialog-content">{children}</div>
          {buttons && buttons.length > 0 && (
            <div className="fmg-dialog-buttonpane">
              {buttons.map(btn => (
                <button type="button" key={btn.label} className="fmg-dialog-button" onClick={btn.onClick}>
                  {btn.label}
                </button>
              ))}
            </div>
          )}
          <div className="fmg-dialog-resize" ref={resizeHandleRef} aria-hidden="true" />
        </>
      )}
    </div>
  );

  // Default portal root is dialogs-root if it exists, else body
  const root = document.getElementById("dialogs-root") || document.body;
  return ReactDOM.createPortal(dialogElement, root);
};
