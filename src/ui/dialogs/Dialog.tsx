import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { closeAllDialogs } from "./dialogService";
import { useDraggable } from "./useDraggable";
import "./dialog.css";

export interface DialogProps {
  isOpen: boolean;
  title?: React.ReactNode;
  onClose?: () => void;
  children: React.ReactNode;
  buttons?: Array<{ label: string; onClick: () => void; disabled?: boolean }>;
  /** Whether to show the titlebar control that closes every open dialog. */
  showCloseAllDialogsButton?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  title,
  onClose,
  children,
  buttons,
  showCloseAllDialogsButton = true,
  className = "",
  style
}) => {
  const { containerRef, resizeHandleRef, bringToFront } = useDraggable({ handleSelector: ".titlebar" });
  const [minimized, setMinimized] = useState(false);
  const [titlebarAnchored, setTitlebarAnchored] = useState(false);
  // Remembers a resize-handle-driven inline height across a minimize/restore
  // cycle (see handleMinimize below).
  const preMinimizeHeightRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      bringToFront();
      setMinimized(false);
    }
  }, [isOpen, bringToFront]);

  const handleMinimize = useCallback(() => {
    const container = containerRef.current;
    if (container && !titlebarAnchored) {
      const { top } = container.getBoundingClientRect();
      const offsetY = Number.parseFloat(getComputedStyle(container).getPropertyValue("--dialog-offset-y")) || 0;
      // The default vertical transform centers the dialog. Convert its current
      // visual position into a top-anchored one once, so later height changes
      // (minimize, restore, or content reflow) cannot move the titlebar.
      container.style.setProperty("--dialog-top", `${top - offsetY}px`);
      setTitlebarAnchored(true);
    }
    if (container && !minimized) {
      // Lock the width so the titlebar doesn't reflow when content is removed.
      const computedStyle = getComputedStyle(container);
      const { width } = container.getBoundingClientRect();
      const horizontalBorders =
        Number.parseFloat(computedStyle.borderLeftWidth) + Number.parseFloat(computedStyle.borderRightWidth);
      const cssWidth = computedStyle.boxSizing === "border-box" ? width : width - horizontalBorders;
      container.style.width = `${cssWidth}px`;

      // The resize handle (useDraggable) may have set an inline height while
      // the dialog was open. That inline height outlives the content unmount
      // below, so without clearing it the container keeps its resized height
      // — an empty frame with only a titlebar inside it — instead of
      // collapsing to fit the titlebar. Remember it so restoring can bring
      // the resized size back.
      preMinimizeHeightRef.current = container.style.height || null;
      container.style.height = "";
    } else if (container && minimized && preMinimizeHeightRef.current) {
      // Restoring: reapply the height that was active before minimizing.
      container.style.height = preMinimizeHeightRef.current;
    }
    setMinimized(currentMinimized => !currentMinimized);
  }, [containerRef, minimized, titlebarAnchored]);

  const dialogElement = (
    <div
      ref={containerRef}
      className={`fmg-dialog ${className}${minimized ? " minimized" : ""}${titlebarAnchored ? " titlebar-anchored" : ""}`}
      style={{ ...style, display: isOpen ? undefined : "none" }}
      onMouseDownCapture={bringToFront}
    >
      <div className="titlebar">
        <div className="fmg-dialog-title">{title}</div>
        <div className="titlebar-actions">
          {showCloseAllDialogsButton && (
            <button
              type="button"
              className="titlebar-btn"
              aria-label="Close all dialogs"
              title="Close all dialogs"
              onClick={() => closeAllDialogs()}
            >
              ✕✕
            </button>
          )}
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
                <button
                  type="button"
                  key={btn.label}
                  className="fmg-dialog-button"
                  onClick={btn.onClick}
                  disabled={btn.disabled}
                >
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
