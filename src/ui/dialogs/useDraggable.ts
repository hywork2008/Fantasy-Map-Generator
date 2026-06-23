import { useCallback, useEffect, useRef } from "react";

export function useDraggable(options?: { handleSelector?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  const bringToFront = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Bring to front (check visible dialogs to avoid overflow)
    const allDialogs = document.querySelectorAll(".fmg-dialog, #optionsContainer") as NodeListOf<HTMLElement>;
    let maxZ = 100;
    allDialogs.forEach(d => {
      // Ignore closed dialogs so z-index resets when all are closed
      if (d.style.display === "none") return;
      if (d === container) return;

      const z = parseInt(window.getComputedStyle(d).zIndex || "0", 10);
      if (!Number.isNaN(z) && z > maxZ) maxZ = z;
    });
    container.style.zIndex = `${maxZ + 1}`;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const handle = options?.handleSelector
      ? (container.querySelector(options.handleSelector) as HTMLElement)
      : container;

    if (!handle) return;

    // Apply cursor style to handle
    handle.style.cursor = "move";

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // Only left click

      // Prevent drag if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      bringToFront();

      document.body.style.userSelect = "none";
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      container.style.left = `${initialLeft + dx}px`;
      container.style.top = `${initialTop + dy}px`;
      container.style.right = "auto";
      container.style.bottom = "auto";
      container.style.transform = "none";
    };

    const onMouseUp = () => {
      isDragging = false;
      document.body.style.userSelect = "";
    };

    handle.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      handle.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      handle.style.cursor = "";
    };
  }, [options?.handleSelector, bringToFront]);

  return { containerRef, bringToFront };
}
