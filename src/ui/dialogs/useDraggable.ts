import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";

// ────────────────────────────────────────────────────────────────────────────
// CSS transform + React Hooks implementation
// ────────────────────────────────────────────────────────────────────────────

interface DragState {
  offsetX: number;
  offsetY: number;
  isDragging: boolean;
  width: string | null;
  startOffsetX?: number;
  startOffsetY?: number;
}

type DragAction =
  | { type: "DRAG_START"; payload: { startX: number; startY: number } }
  | { type: "DRAG_MOVE"; payload: { offsetX: number; offsetY: number } }
  | { type: "DRAG_END" }
  | { type: "SET_WIDTH"; payload: string };

function dragReducer(state: DragState, action: DragAction): DragState {
  switch (action.type) {
    case "DRAG_START":
      return { ...state, isDragging: true, startOffsetX: state.offsetX, startOffsetY: state.offsetY };
    case "DRAG_MOVE":
      return state.isDragging ? { ...state, offsetX: action.payload.offsetX, offsetY: action.payload.offsetY } : state;
    case "DRAG_END":
      return { ...state, isDragging: false, startOffsetX: undefined, startOffsetY: undefined };
    case "SET_WIDTH":
      return { ...state, width: action.payload };
    default:
      return state;
  }
}

interface ResizeState {
  width: number;
  height: number;
  isResizing: boolean;
  startWidth?: number;
  startHeight?: number;
}

// All draggable UI, including dialogs and the options panel, may be placed
// flush against the viewport edge.
const VIEWPORT_PADDING = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

type ResizeAction =
  | { type: "RESIZE_START"; payload: { initialWidth: number; initialHeight: number } }
  | { type: "RESIZE_MOVE"; payload: { newWidth: number; newHeight: number } }
  | { type: "RESIZE_END" };

function resizeReducer(state: ResizeState, action: ResizeAction): ResizeState {
  switch (action.type) {
    case "RESIZE_START":
      return {
        ...state,
        isResizing: true,
        width: action.payload.initialWidth,
        height: action.payload.initialHeight,
        startWidth: action.payload.initialWidth,
        startHeight: action.payload.initialHeight
      };
    case "RESIZE_MOVE":
      return state.isResizing ? { ...state, width: action.payload.newWidth, height: action.payload.newHeight } : state;
    case "RESIZE_END":
      return { ...state, isResizing: false, startWidth: undefined, startHeight: undefined };
    default:
      return state;
  }
}

export function useDraggable(options?: { handleSelector?: string; allowInteractiveHandle?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [resizeHandle, setResizeHandle] = useState<HTMLDivElement | null>(null);
  const resizeHandleRef = useCallback((node: HTMLDivElement | null) => {
    setResizeHandle(node);
  }, []);

  // Drag state management
  const [dragState, dispatchDrag] = useReducer(dragReducer, {
    offsetX: 0,
    offsetY: 0,
    isDragging: false,
    width: null
  });

  // Resize state management
  const [resizeState, dispatchResize] = useReducer(resizeReducer, {
    width: 0,
    height: 0,
    isResizing: false
  });

  // Reference data for drag calculations (not causing re-renders)
  const dragStartRef = useRef({ x: 0, y: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0 });
  const dragStateRef = useRef(dragState);
  const resizeStateRef = useRef(resizeState);

  // Keep refs in sync with state
  useLayoutEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useLayoutEffect(() => {
    resizeStateRef.current = resizeState;
  }, [resizeState]);

  // The CSS transform preserves the initial centered position; only its offset
  // variables are owned by the drag state.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.style.setProperty("--dialog-offset-x", `${dragState.offsetX}px`);
    container.style.setProperty("--dialog-offset-y", `${dragState.offsetY}px`);
  }, [dragState.offsetX, dragState.offsetY]);

  // Apply size changes based on React state
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || resizeState.isResizing === false) return;

    container.style.width = `${resizeState.width}px`;
    container.style.height = `${resizeState.height}px`;
  }, [resizeState.width, resizeState.height, resizeState.isResizing]);

  const bringToFront = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Bring to front (check visible dialogs to avoid overflow)
    const allDialogs = document.querySelectorAll(".fmg-dialog, #optionsContainer, #options") as NodeListOf<HTMLElement>;
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

  // Drag handler
  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (e.button !== 0) return; // Only left click

      // Prevent drag if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (!options?.allowInteractiveHandle && ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) {
        return;
      }

      dragStartRef.current = { x: e.clientX, y: e.clientY };
      // Mouse movement can arrive before React commits the reducer update.
      // Keep the event handler's ref current immediately so the first movement
      // is not lost.
      dragStateRef.current = {
        ...dragStateRef.current,
        isDragging: true,
        startOffsetX: dragStateRef.current.offsetX,
        startOffsetY: dragStateRef.current.offsetY
      };
      dispatchDrag({
        type: "DRAG_START",
        payload: { startX: e.clientX, startY: e.clientY }
      });

      // Lock the current rendered width so viewport-relative max-width can't
      // cause the dialog to expand when transform is cleared during drag.
      if (!container.style.width) {
        const width = `${container.offsetWidth}px`;
        container.style.width = width;
        dispatchDrag({ type: "SET_WIDTH", payload: width });
      }

      bringToFront();

      document.body.style.userSelect = "none";
      container.classList.add("dragging");
    },
    [bringToFront, options?.allowInteractiveHandle]
  );

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStateRef.current.isDragging) return;

    const container = containerRef.current;
    if (!container) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // Calculate absolute offset: start offset + relative movement
    const desiredOffsetX = (dragStateRef.current.startOffsetX ?? 0) + dx;
    const desiredOffsetY = (dragStateRef.current.startOffsetY ?? 0) + dy;
    const rect = container.getBoundingClientRect();
    const baseLeft = rect.left - dragStateRef.current.offsetX;
    const baseTop = rect.top - dragStateRef.current.offsetY;
    const offsetX = clamp(
      desiredOffsetX,
      VIEWPORT_PADDING - baseLeft,
      window.innerWidth - VIEWPORT_PADDING - (baseLeft + rect.width)
    );
    const offsetY = clamp(
      desiredOffsetY,
      VIEWPORT_PADDING - baseTop,
      window.innerHeight - VIEWPORT_PADDING - (baseTop + rect.height)
    );

    dispatchDrag({ type: "DRAG_MOVE", payload: { offsetX, offsetY } });
  }, []);

  const onMouseUp = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!dragStateRef.current.isDragging) return;

    dragStateRef.current = { ...dragStateRef.current, isDragging: false };
    dispatchDrag({ type: "DRAG_END" });
    document.body.style.userSelect = "";
    container.classList.remove("dragging");
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handle = options?.handleSelector
      ? (container.querySelector(options.handleSelector) as HTMLElement)
      : container;

    if (!handle) return;

    handle.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      handle.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      container.classList.remove("dragging");
    };
  }, [options?.handleSelector, onMouseDown, onMouseMove, onMouseUp]);

  // Resize handler
  const onResizeMouseDown = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      e.preventDefault();
      e.stopPropagation();

      resizeStartRef.current = { x: e.clientX, y: e.clientY };
      // As with dragging, make the active state available synchronously to a
      // mousemove that follows this native event without waiting for a render.
      resizeStateRef.current = {
        ...resizeStateRef.current,
        isResizing: true,
        width: container.offsetWidth,
        height: container.offsetHeight,
        startWidth: container.offsetWidth,
        startHeight: container.offsetHeight
      };
      dispatchResize({
        type: "RESIZE_START",
        payload: { initialWidth: container.offsetWidth, initialHeight: container.offsetHeight }
      });

      bringToFront();
      document.body.style.userSelect = "none";
      document.body.style.cursor = "se-resize";
    },
    [bringToFront]
  );

  const onResizeMouseMove = useCallback((e: MouseEvent) => {
    const container = containerRef.current;
    if (!container || !resizeStateRef.current.isResizing) return;

    const dx = e.clientX - resizeStartRef.current.x;
    const dy = e.clientY - resizeStartRef.current.y;

    // Calculate absolute size: start size + relative movement
    const maxWidth = Math.max(280, window.innerWidth - container.getBoundingClientRect().left - VIEWPORT_PADDING);
    const maxHeight = Math.max(200, window.innerHeight - container.getBoundingClientRect().top - VIEWPORT_PADDING);
    const newWidth = clamp((resizeStateRef.current.startWidth ?? 0) + dx, 280, maxWidth);
    const newHeight = clamp((resizeStateRef.current.startHeight ?? 0) + dy, 200, maxHeight);

    dispatchResize({ type: "RESIZE_MOVE", payload: { newWidth, newHeight } });
  }, []);

  const onResizeMouseUp = useCallback(() => {
    if (!resizeStateRef.current.isResizing) return;

    resizeStateRef.current = { ...resizeStateRef.current, isResizing: false };
    dispatchResize({ type: "RESIZE_END" });
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }, []);

  useEffect(() => {
    if (!resizeHandle) return;

    resizeHandle.addEventListener("mousedown", onResizeMouseDown);
    document.addEventListener("mousemove", onResizeMouseMove);
    document.addEventListener("mouseup", onResizeMouseUp);

    return () => {
      resizeHandle.removeEventListener("mousedown", onResizeMouseDown);
      document.removeEventListener("mousemove", onResizeMouseMove);
      document.removeEventListener("mouseup", onResizeMouseUp);
    };
  }, [onResizeMouseDown, onResizeMouseMove, onResizeMouseUp, resizeHandle]);

  return { containerRef, resizeHandleRef, bringToFront };
}
