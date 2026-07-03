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
  const { containerRef, resizeHandleRef, bringToFront } = useDraggable({ handleSelector: ".titlebar" });
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
      // Lock the width so the titlebar doesn't reflow to a different size
      // when the content is removed. Position (CSS vars + inline transform)
      // is intentionally left untouched — the dialog's top-left corner stays
      // exactly where it is, keeping the titlebar in place.
      container.style.width = `${container.getBoundingClientRect().width}px`;
    }
    setMinimized(m => !m);
  }, [minimized, containerRef]);

  const dialogElement = (
    <div
      ref={containerRef}
      className={`fmg-dialog ${className}${minimized ? " minimized" : ""}`}
      style={{ ...style, display: isOpen ? undefined : "none" }}
      onMouseDownCapture={bringToFront}
    >
      <div className="titlebar">
        <div className="fmg-dialog-title">{title}</div>
        <div className="titlebar-actions">
          <button
            type="button"
            className="titlebar-btn"
            aria-label="Close all dialogs"
            title="Close all dialogs"
            onClick={() => closeAllDialogs()}
          >
            ✕✕
          </button>
          <button
            type="button"
            className="titlebar-btn"
            aria-label={minimized ? "Restore" : "Minimize"}
            title={minimized ? "Restore" : "Minimize"}
            onClick={handleMinimize}
          >
            {minimized ? "▲" : "▼"}
          </button>
          {onClose && (
            <button type="button" className="titlebar-btn" aria-label="Close" title="Close" onClick={onClose}>
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
