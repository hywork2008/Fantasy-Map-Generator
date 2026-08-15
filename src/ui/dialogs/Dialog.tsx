import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { useTranslation } from "react-i18next";
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
  /** Keep the titlebar at its opening position when the dialog content changes height. */
  anchorTitlebarOnOpen?: boolean;
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
  anchorTitlebarOnOpen = false,
  className = "",
  style
}) => {
  const { t } = useTranslation();
  const { containerRef, resizeHandleRef, bringToFront } = useDraggable({ handleSelector: ".titlebar" });
  const [minimized, setMinimized] = useState(false);
  const [titlebarAnchored, setTitlebarAnchored] = useState(false);
  // Remembers a resize-handle-driven inline height across a minimize/restore
  // cycle (see handleMinimize below).
  const preMinimizeHeightRef = useRef<string | null>(null);

  const anchorTitlebar = useCallback(() => {
    const container = containerRef.current;
    if (!container || titlebarAnchored) return;

    const { top } = container.getBoundingClientRect();
    const offsetY = Number.parseFloat(getComputedStyle(container).getPropertyValue("--dialog-offset-y")) || 0;
    // The default transform centers the whole dialog. Preserve the titlebar's
    // current visual position before switching to the top-anchored transform.
    container.style.setProperty("--dialog-top", `${top - offsetY}px`);
    setTitlebarAnchored(true);
  }, [containerRef, titlebarAnchored]);

  useEffect(() => {
    if (isOpen) {
      bringToFront();
      setMinimized(false);
    }
  }, [isOpen, bringToFront]);

  // Some editors replace their body with tabs of very different heights. Anchor
  // before paint so changing tabs never moves their draggable titlebar.
  useLayoutEffect(() => {
    if (isOpen && anchorTitlebarOnOpen) anchorTitlebar();
  }, [anchorTitlebar, anchorTitlebarOnOpen, isOpen]);

  const handleMinimize = useCallback(() => {
    const container = containerRef.current;
    if (container && !titlebarAnchored) anchorTitlebar();
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
  }, [anchorTitlebar, containerRef, minimized, titlebarAnchored]);

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
              aria-label={t("dialogs.chrome.closeAll")}
              title={t("dialogs.chrome.closeAll")}
              onClick={() => closeAllDialogs()}
            >
              ✕✕
            </button>
          )}
          <button
            type="button"
            className="titlebar-btn"
            aria-label={minimized ? t("dialogs.chrome.restore") : t("dialogs.chrome.minimize")}
            title={minimized ? t("dialogs.chrome.restore") : t("dialogs.chrome.minimize")}
            onClick={handleMinimize}
          >
            {minimized ? "▲" : "▼"}
          </button>
          {onClose && (
            <button
              type="button"
              className="titlebar-btn"
              aria-label={t("dialogs.chrome.close")}
              title={t("dialogs.chrome.close")}
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
