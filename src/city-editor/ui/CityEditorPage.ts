import { CITY_SIZE_PRESETS, type CitySizePreset, createSizedDocument } from "../core/document";
import type { FaceRoutePreview } from "../core/features";
import {
  appendEdge,
  appendRiverVertex,
  createGroup,
  encloseCircleWithWalls,
  encloseWardComponentWithWalls,
  featureGroupVertices,
  finishRiver,
  gateOpeningCandidates,
  groupUsesEdge,
  placeGateOpening,
  previewRouteAcrossFace,
  removeEdgeFromGroup,
  removeGroup,
  rerouteGroupAcrossFace,
  smoothFeatureGroup,
  smoothFeatureGroups,
  toggleGate,
  vertexHasWall
} from "../core/features";
import { DocumentHistory } from "../core/history";
import {
  clone,
  edgeBetween,
  faceNeighbors,
  facePoints,
  faceVertices,
  mergeFaces,
  mergeVertices,
  moveVertex,
  optimizeJunctions,
  scaleDocument,
  setFaceElevation,
  setFaceWater,
  splitFace,
  validate
} from "../core/mesh";
import type { CityDocument, FeatureGroup, Id, Point, Tool, WardKind, WaterKind } from "../core/types";
import { exportCityMap, type ImportedCityMap, pickCityMap, readCityMap } from "../io/cityEditorFile";
import {
  faceClassName,
  type RenderSelection,
  renderEditorSvg,
  renderFaceWardLandmark,
  renderHoverOverlay,
  renderRoutePreview
} from "../render/svg";

const TOOLS: Array<[Tool, string, string]> = [
  ["select", "Select and move", "↖"],
  ["vertex", "Edit vertices", "⌘"],
  ["road", "Draw road", "╱"],
  ["wall", "Draw wall", "▥"],
  ["river", "Draw river", "〰"],
  ["wardWall", "Draw circular ward wall", "◯"],
  ["junction", "Clean short junctions", "⌬"],
  ["face", "Edit cell", "⬡"]
];

const PAINT_BRUSHES: Array<{ kind: WardKind | "sea" | "erase"; label: string }> = [
  { kind: "market", label: "💰" },
  { kind: "castle", label: "🏰" },
  { kind: "merchant", label: "⚖️" },
  { kind: "craftsmen", label: "🛠️" },
  { kind: "harbor", label: "⚓" },
  { kind: "park", label: "🌳" },
  { kind: "empty", label: "󠁪󠁪 " },
  { kind: "erase", label: "🧹" },
  { kind: "sea", label: "🌊" }
];

interface ContextMenuAction {
  label: string;
  run: () => void;
  highlight?: { vertexId: Id; edgeId: Id };
}

type RoutePaintKind = "river" | "road" | "wall";

interface RouteStroke {
  kind: RoutePaintKind;
  initialEdgeId: Id;
  groupId: Id | null;
  endpointId: Id | null;
  initialized: boolean;
  startPoint: Point;
  lastPoint: Point;
  changed: boolean;
  /** True once the stroke has pushed its single history entry; further steps
   * amend that entry in place so one drag is one undo. */
  committed: boolean;
}

interface CircularWallStroke {
  center: Point;
  centerClient: { clientX: number; clientY: number };
  radiusMeters: number;
}

interface FloatingWindow {
  root: HTMLDivElement;
  content: HTMLDivElement;
}

export function mountCityEditor(root: HTMLElement): void {
  let documentState = createSizedDocument("small");
  let history = new DocumentHistory(documentState);
  // An imported MFCG SVG backdrop can be a multi-megabyte data URL. Keep it out
  // of `documentState` so it is never cloned into a history snapshot or an
  // undo/redo step; it is re-attached only for export and passed to the
  // renderer separately.
  let referenceImage: CityDocument["referenceImage"] | null = null;
  let tool: Tool = "select";
  let selection: RenderSelection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
  let activeGroupId: Id | null = null;
  let dragBefore: CityDocument | null = null;
  let dragMergeCandidateId: Id | null = null;
  let isVertexDragging = false;
  let isWardPainting = false;
  let wardPaintChanged = false;
  let paintedWardFaceIds = new Set<Id>();
  let isJunctionPainting = false;
  let junctionPaintChanged = false;
  let circularWallStroke: CircularWallStroke | null = null;
  let routeDrag: { groupId: Id; edgeId: Id; startX: number; startY: number; moved: boolean } | null = null;
  let routeStroke: RouteStroke | null = null;
  let routePreview: FaceRoutePreview | null = null;
  let routePreviewFaceId: Id | null = null;
  let isPanning = false;
  let isSpacePressed = false;
  let showSelectionLabels = false;
  let wardBrush: WardKind | null = "market";
  // The brush is expressed in macro cells, so its size stays meaningful when
  // switching between city presets or changing the map scale.
  let brushSizeCells = 1;
  let junctionMaxGapMeters = 8;
  let wardBrushPointer: { clientX: number; clientY: number } | null = null;
  let circularWallPointer: { clientX: number; clientY: number } | null = null;
  let hasPanned = false;
  let suppressNextClick = false;
  let lastPanX = 0;
  let lastPanY = 0;
  let viewCenter: [number, number] = [0, 0];
  let closeContextMenuOnPointerMove = false;
  let notice = "";
  let halfView = documentState.frame.extentMeters / 2;
  let routeEdgesByGroup = new Map<Id, Id[]>();
  let routeGroupsByEdge = new Map<Id, Id[]>();
  let edgeIdsByVertex = new Map<Id, Id[]>();
  let faceBuckets = new Map<string, Id[]>();
  let vertexBuckets = new Map<string, Id[]>();
  let faceBucketSize = documentState.frame.blockSizeMeters * 2;
  // Coalesce the map redraws that fire on every pointermove (pan, vertex drag,
  // paint, route stroke) into one repaint per animation frame. A full
  // renderEditorSvg() pass rebuilds thousands of nodes on a Medium/Large grid.
  let redrawHandle = 0;
  // renderHistory() reuses these row nodes across calls instead of rebuilding
  // the whole list every edit (see renderHistory for why).
  let historyListEl: HTMLDivElement | null = null;
  let historySummaryEl: HTMLElement | null = null;
  let historyClearButton: HTMLButtonElement | null = null;
  let historyRows: HTMLButtonElement[] = [];
  // Rebuilt every full redrawMap() pass; patchFaceRender() uses these to
  // update one face's <path>/landmark in place after a ward/sea paint,
  // instead of a full renderEditorSvg() pass over the whole mesh.
  let faceElementsById = new Map<Id, SVGPathElement>();
  let wardLandmarkElementsById = new Map<Id, SVGGElement>();
  let wardLandmarksGroup: SVGGElement | null = null;

  const canvas = div("ce-canvas");
  const map = div("ce-map");
  const wardBrushPreview = div("ce-ward-brush-preview");
  wardBrushPreview.hidden = true;
  const circularWallPreview = div("ce-wall-circle-preview");
  circularWallPreview.hidden = true;
  const circularWallCenter = div("ce-wall-center-marker");
  circularWallCenter.textContent = "+";
  circularWallCenter.hidden = true;
  canvas.appendChild(map);
  canvas.appendChild(wardBrushPreview);
  canvas.append(circularWallPreview, circularWallCenter);
  const toolbar = floatingWindow("ce-toolbar", "Tools");
  const documentPanel = floatingWindow("ce-document", "Document");
  const inspector = floatingWindow("ce-inspector", "Inspector");
  const groups = floatingWindow("ce-groups", "Objects");
  const historyPanel = floatingWindow("ce-history", "History");
  const status = document.createElement("output");
  status.className = "ce-status";
  const scaleBar = div("ce-scale-bar");
  const scaleLine = div("ce-scale-bar-line");
  const scaleLabel = document.createElement("output");
  scaleLabel.className = "ce-scale-bar-label";
  scaleBar.append(scaleLine, scaleLabel);
  const contextMenu = div("ce-context-menu");
  contextMenu.hidden = true;
  contextMenu.setAttribute("role", "menu");
  root.replaceChildren(
    canvas,
    toolbar.root,
    documentPanel.root,
    inspector.root,
    groups.root,
    historyPanel.root,
    status,
    scaleBar,
    contextMenu
  );
  contextMenu.addEventListener("pointerdown", event => event.stopPropagation());
  contextMenu.addEventListener("contextmenu", event => event.preventDefault());

  const toolButtons = new Map<Tool, HTMLButtonElement>();
  const toolGrid = div("ce-icon-row");
  for (const [id, label, icon] of TOOLS) {
    const button = makeIconButton(icon, label, () => {
      tool = id;
      refresh();
    });
    toolButtons.set(id, button);
    toolGrid.appendChild(button);
  }
  toolbar.content.appendChild(toolGrid);
  const paintButtons = new Map<WardKind | "sea" | "erase", HTMLButtonElement>();
  const paintGrid = div("ce-icon-row");
  for (const { kind, label: paintLabel } of PAINT_BRUSHES) {
    const paintButton = makeButton(paintLabel, () => {
      if (kind === "sea") tool = "sea";
      else {
        wardBrush = kind === "erase" ? null : kind;
        tool = "ward";
      }
      refresh();
    });
    paintButton.title = kind === "erase" ? "Erase ward assignments" : `Paint ${kind.toLowerCase()} cells`;
    paintButton.className = "ce-icon-button";
    paintButtons.set(kind, paintButton);
    paintGrid.appendChild(paintButton);
  }
  const size = select(Object.keys(CITY_SIZE_PRESETS), "small");
  for (const option of [...size.options]) {
    const preset = CITY_SIZE_PRESETS[option.value as CitySizePreset];
    option.textContent = `${preset.label} · ${preset.extentMeters / 1000} km · ${preset.cellsAcross}×${preset.cellsAcross} · ~${preset.buildingTarget} buildings`;
  }
  const newButton = makeIconButton("✦", "Generate a new Voronoi grid", () => {
    documentState = createSizedDocument(size.value as CitySizePreset);
    history = new DocumentHistory(documentState, "New grid");
    referenceImage = null;
    selection = emptySelection();
    activeGroupId = null;
    halfView = documentState.frame.extentMeters / 2;
    viewCenter = [0, 0];
    rebuildEditorIndexes();
    refresh();
  });
  const sizeLabel = label("Map size", size);
  sizeLabel.className = "ce-size-choice";
  const undoButton = makeIconButton("↶", "Undo", () => restore(history.undo(documentState)));
  const redoButton = makeIconButton("↷", "Redo", () => restore(history.redo(documentState)));
  const exportButton = makeIconButton("⇩", "Export editable city map", () => {
    exportCityMap(referenceImage ? { ...documentState, referenceImage } : documentState);
    showNotice("Map exported");
  });
  const importButton = makeIconButton("⇧", "Import city map or SVG reference", () => void importDocument());
  const scaleInput = numberInput("1", "0.1", "0.1");
  const showLabelsInput = document.createElement("input");
  showLabelsInput.type = "checkbox";
  showLabelsInput.addEventListener("change", () => {
    showSelectionLabels = showLabelsInput.checked;
    redrawMap();
  });
  const brushSizeInput = rangeInput("1", "1", "8", "1");
  const brushSizeValue = text(brushSizeText());
  const brushSizeControl = div("ce-brush-size-control");
  brushSizeControl.append(brushSizeInput, brushSizeValue);
  const brushSizeLabel = label("Brush size", brushSizeControl);
  brushSizeInput.addEventListener("input", () => {
    brushSizeCells = Number(brushSizeInput.value);
    brushSizeValue.textContent = brushSizeText();
    updateWardBrushPreview();
  });
  const junctionMaxGapInput = rangeInput("8", "1", "50", "1");
  const junctionMaxGapValue = text(formatDistance(junctionMaxGapMeters));
  const junctionMaxGapSliderRow = div("ce-brush-size-control");
  junctionMaxGapSliderRow.append(junctionMaxGapInput, junctionMaxGapValue);
  const junctionGapScale = div("ce-junction-gap-scale");
  const junctionGapLine = div("ce-junction-gap-line");
  const junctionGapLength = text("");
  junctionGapScale.append(junctionGapLine, junctionGapLength);
  const junctionMaxGapControl = div("ce-junction-gap-control");
  junctionMaxGapControl.append(junctionMaxGapSliderRow, junctionGapScale);
  const junctionMaxGapLabel = label("Max junction gap", junctionMaxGapControl);
  junctionMaxGapInput.addEventListener("input", () => {
    junctionMaxGapMeters = Number(junctionMaxGapInput.value);
    junctionMaxGapValue.textContent = formatDistance(junctionMaxGapMeters);
    refreshJunctionGapScale();
  });
  const scaleButton = makeIconButton("⤢", "Scale all map geometry", () => {
    const factor = Number(scaleInput.value);
    const next = scaleDocument(documentState, factor);
    if (next) {
      halfView *= factor;
      commit(next, `Scale geometry ×${factor}`);
    }
  });
  const finishButton = makeIconButton("✓", "Finish active river", () => {
    if (!activeGroupId) return;
    const next = finishRiver(documentState, activeGroupId);
    if (next) commit(next, "Finish river");
  });
  const smoothingModeInput = select(["safe", "include loops & shared"], "safe");
  const smoothGroupsButton = makeIconButton("⌁", "Smooth all routes", () => {
    const mode = smoothingModeInput.value === "include loops & shared" ? "includeSharedAndLoops" : "safe";
    const next = smoothFeatureGroups(documentState, mode);
    if (next) commit(next, "Smooth all routes");
    else showNotice("No movable River, Road, or Wall vertices to smooth");
  });
  const actions = div("ce-icon-row");
  actions.append(undoButton, redoButton, importButton, exportButton);
  toolbar.content.append(
    divider(),
    actions,
    text("Paint cells"),
    paintGrid,
    brushSizeLabel,
    junctionMaxGapLabel,
    label("Cell IDs", showLabelsInput)
  );
  const documentActions = div("ce-icon-row");
  documentActions.append(newButton, scaleButton, finishButton, smoothGroupsButton);
  documentPanel.content.append(
    sizeLabel,
    documentActions,
    label("Scale", scaleInput),
    label("Smoothing", smoothingModeInput),
    text(
      "Create and tune a Voronoi / Delaunay block mesh. Draw on cells and shared edges; this is vector geometry, not a pixel canvas."
    )
  );

  map.addEventListener("pointerdown", event => {
    hideContextMenu();
    // A wheel-zoom just before this click may still be waiting on its frame;
    // hit-testing below reads the SVG, so settle it first.
    flushRedraw();
    if (event.button === 1 || (event.button === 0 && isSpacePressed)) {
      event.preventDefault();
      isPanning = true;
      hasPanned = false;
      lastPanX = event.clientX;
      lastPanY = event.clientY;
      map.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const point = localPoint(event);
    if (tool === "wardWall") {
      event.preventDefault();
      circularWallStroke = {
        center: point,
        centerClient: { clientX: event.clientX, clientY: event.clientY },
        radiusMeters: 0
      };
      updateCircularWallPreview(event);
      suppressNextClick = true;
      map.setPointerCapture(event.pointerId);
      return;
    }
    if (isPaintBrushTool(tool)) {
      if (!faceIdsWithinWardBrush(point).length) return;
      event.preventDefault();
      isWardPainting = true;
      wardPaintChanged = false;
      paintedWardFaceIds = new Set();
      paintCellsAtPoint(point);
      suppressNextClick = true;
      map.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "junction") {
      event.preventDefault();
      isJunctionPainting = true;
      junctionPaintChanged = false;
      optimizeJunctionsAtPoint(point);
      suppressNextClick = true;
      map.setPointerCapture(event.pointerId);
      return;
    }
    if (isRoutePaintTool(tool)) {
      const edgeId = closestMeshEdgeId(point, 18);
      if (edgeId) {
        const connection = routeEndpointOnEdge(tool, edgeId, point);
        event.preventDefault();
        routeStroke = {
          kind: tool,
          initialEdgeId: edgeId,
          groupId: connection?.groupId ?? null,
          endpointId: connection?.vertexId ?? null,
          initialized: false,
          startPoint: point,
          lastPoint: point,
          changed: false,
          committed: false
        };
        suppressNextClick = true;
        map.setPointerCapture(event.pointerId);
        return;
      }
    }
    const vertexId = targetId(event, "vertex") ?? (tool === "select" ? closestVertexId(point) : null);
    if (vertexId && tool === "vertex") {
      event.preventDefault();
      selection = { ...selection, vertexId, faceId: null, edgeId: null, groupId: null };
      activeGroupId = null;
      suppressNextClick = true;
      refresh();
      return;
    }
    if (vertexId && tool === "select") {
      event.preventDefault();
      dragBefore = clone(documentState);
      isVertexDragging = true;
      dragMergeCandidateId = null;
      selection.vertexId = vertexId;
      map.setPointerCapture(event.pointerId);
      return;
    }
    const route = tool === "select" ? routeAtEvent(event, point, true) : null;
    if (route) {
      event.preventDefault();
      routeDrag = { ...route, startX: event.clientX, startY: event.clientY, moved: false };
      selection.groupId = route.groupId;
      selection.edgeId = route.edgeId;
      activeGroupId = route.groupId;
      tool = "select";
      map.setPointerCapture(event.pointerId);
      return;
    }
  });
  map.addEventListener("dragover", event => {
    event.preventDefault();
    map.classList.add("ce-map--drop-target");
  });
  map.addEventListener("dragleave", () => map.classList.remove("ce-map--drop-target"));
  map.addEventListener("drop", event => {
    event.preventDefault();
    map.classList.remove("ce-map--drop-target");
    void importMapFile(event.dataTransfer?.files[0]);
  });
  map.addEventListener("pointermove", event => {
    if (tool === "wardWall" || circularWallStroke) updateCircularWallPreview(event);
    if (circularWallStroke) return;
    if (isBrushTool(tool)) updateWardBrushPreview(event);
    if (isWardPainting) {
      paintCellsAtPoint(localPoint(event));
      return;
    }
    if (isJunctionPainting) {
      optimizeJunctionsAtPoint(localPoint(event));
      return;
    }
    if (routeStroke) {
      extendRouteStroke(localPoint(event));
      return;
    }
    if (routeDrag) {
      if (Math.abs(event.clientX - routeDrag.startX) > 2 || Math.abs(event.clientY - routeDrag.startY) > 2)
        routeDrag.moved = true;
      const faceId = faceAtPoint(localPoint(event));
      if (faceId !== routePreviewFaceId) {
        routePreviewFaceId = faceId;
        routePreview = faceId
          ? previewRouteAcrossFace(documentState, routeDrag.groupId, faceId, { edgeId: routeDrag.edgeId })
          : null;
        updateRoutePreview();
      }
      return;
    }
    if (isVertexDragging && selection.vertexId) {
      const point = localPoint(event);
      const next = moveVertex(documentState, selection.vertexId, point);
      if (!next) return;
      documentState = next;
      dragMergeCandidateId = closestMergeCandidate(selection.vertexId);
      selection.hoverVertexId = dragMergeCandidateId;
      scheduleRedraw();
      suppressNextClick = true;
      return;
    }
    if (!isPanning) updateHover(event);
    if (!isPanning) return;
    const dx = event.clientX - lastPanX;
    const dy = event.clientY - lastPanY;
    if (!hasPanned && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      hasPanned = true;
      suppressNextClick = true;
      map.classList.add("ce-map--panning");
      map.setPointerCapture(event.pointerId);
    }
    if (!hasPanned) return;
    const point = localPoint(event);
    const previous = localPointAt(lastPanX, lastPanY);
    viewCenter = [viewCenter[0] - (point[0] - previous[0]), viewCenter[1] - (point[1] - previous[1])];
    lastPanX = event.clientX;
    lastPanY = event.clientY;
    scheduleRedraw();
  });
  map.addEventListener("pointerleave", () => {
    if (!isWardPainting && !isJunctionPainting) hideWardBrushPreview();
    if (!circularWallStroke) hideCircularWallPreview();
  });
  const finishDrag = (event: PointerEvent): void => {
    if (
      !isVertexDragging &&
      !isWardPainting &&
      !isJunctionPainting &&
      !circularWallStroke &&
      !isPanning &&
      !routeDrag &&
      !routeStroke
    )
      return;
    const wasVertexDragging = isVertexDragging;
    const wasWardPainting = isWardPainting;
    const wasJunctionPainting = isJunctionPainting;
    const circle = circularWallStroke;
    const mergeCandidateId = dragMergeCandidateId;
    const stroke = routeStroke;
    const draggedRoute = routeDrag;
    const preview = routePreview;
    const previewFaceId = routePreviewFaceId;
    isVertexDragging = false;
    isWardPainting = false;
    isJunctionPainting = false;
    circularWallStroke = null;
    routeStroke = null;
    routeDrag = null;
    routePreview = null;
    routePreviewFaceId = null;
    updateRoutePreview();
    isPanning = false;
    hasPanned = false;
    dragMergeCandidateId = null;
    map.classList.remove("ce-map--panning");
    if (map.hasPointerCapture(event.pointerId)) map.releasePointerCapture(event.pointerId);
    if (event.type !== "pointercancel" && wasVertexDragging && selection.vertexId && mergeCandidateId) {
      const merged = mergeVertices(documentState, selection.vertexId, mergeCandidateId);
      if (merged) documentState = merged;
    }
    if (wasVertexDragging && dragBefore && JSON.stringify(dragBefore) !== JSON.stringify(documentState)) {
      history.commit(documentState, mergeCandidateId ? "Merge vertices" : "Move vertex");
      rebuildEditorIndexes();
    }
    selection.hoverVertexId = null;
    if (wasWardPainting && wardPaintChanged) {
      history.commit(
        documentState,
        tool === "sea" ? "Paint sea" : wardBrush ? `Paint ${wardBrush} ward` : "Erase wards"
      );
      // Ward/sea painting only ever touches face.properties — it never adds,
      // removes, or moves a vertex/edge, and never touches featureGroups — so
      // the bucket/adjacency indexes rebuildEditorIndexes() computes from
      // exactly those inputs are still valid. Skipping it turns a single-cell
      // paint on a Large mesh from an O(mesh) rebuild into effectively free.
    }
    if (wasJunctionPainting && junctionPaintChanged) {
      history.commit(documentState, "Clean junctions");
      rebuildEditorIndexes();
    }
    if (circle && event.type !== "pointercancel") {
      const next = encloseCircleWithWalls(documentState, circle.center, circle.radiusMeters);
      if (next) commit(next, "Circular ward wall");
      else showNotice("Draw a circle over at least one city cell to create a wall");
    }
    if (stroke) {
      if (event.type !== "pointercancel") finishRouteStroke(stroke, localPoint(event));
    }
    dragBefore = null;
    paintedWardFaceIds.clear();
    if (draggedRoute) {
      suppressNextClick = draggedRoute.moved;
      if (event.type !== "pointercancel" && draggedRoute.moved && preview && previewFaceId) {
        selection.vertexId = null;
        selection.edgeId = null;
        const next = rerouteGroupAcrossFace(documentState, draggedRoute.groupId, previewFaceId, {
          edgeId: draggedRoute.edgeId
        });
        if (next) commit(next, "Reroute across cell");
      }
      selection.vertexId = null;
      selection.edgeId = null;
    }
    if (event.type === "pointercancel") suppressNextClick = false;
    // Ward/sea painting already patched its own touched faces live (see
    // paintCellsAtPoint/patchFaceRender) — the SVG is already current, so
    // only the non-map UI (undo/redo state, history panel, status text...)
    // needs to catch up here. Every other gesture still needs a full redraw.
    if (wasWardPainting) refreshUiOnly();
    else if (wasVertexDragging || wasJunctionPainting || circle || stroke) refresh();
  };
  map.addEventListener("pointerup", finishDrag);
  map.addEventListener("pointercancel", finishDrag);
  map.addEventListener(
    "click",
    event => {
      if (!suppressNextClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressNextClick = false;
    },
    true
  );
  map.addEventListener("click", event => {
    const vertexId = targetId(event, "vertex");
    const edgeId = targetId(event, "edge");
    const faceId = targetId(event, "face");
    const groupId = targetId(event, "group");
    if (groupId) {
      selection.groupId = groupId;
      activeGroupId = groupId;
      tool = "select";
      refresh();
      return;
    }
    const activeGroup = activeGroupId ? documentState.featureGroups.find(group => group.id === activeGroupId) : null;
    if (
      edgeId &&
      activeGroup &&
      !activeGroup.locked &&
      (tool === "select" || (activeGroup.kind !== "plank" && tool === activeGroup.kind))
    ) {
      if (groupUsesEdge(documentState, activeGroup, edgeId)) {
        selection = { ...selection, edgeId, faceId: null, vertexId: null };
        refresh();
        return;
      }
      if (activeGroup.kind !== "river") {
        const next = appendEdge(documentState, activeGroup.id, edgeId);
        if (next) commit(next, `Extend ${activeGroup.name}`);
        else showNotice("Choose an unused edge beside a route endpoint");
        return;
      }
    }
    if (tool === "river" && vertexId) {
      appendSelectedRiverVertex(vertexId);
      return;
    }
    if ((tool === "road" || tool === "wall") && edgeId) {
      appendSelectedEdge(edgeId, tool);
      return;
    }
    if (faceId) selection = { ...selection, faceId, edgeId: null, vertexId: null };
    else if (edgeId) selection = { ...selection, edgeId, faceId: null, vertexId: null };
    else if (vertexId) selection = { ...selection, vertexId, faceId: null, edgeId: null };
    refresh();
  });
  map.addEventListener("contextmenu", event => {
    event.preventDefault();
    flushRedraw();
    const faceId = targetId(event, "face") ?? faceAtPoint(localPoint(event));
    const vertexId = targetId(event, "vertex");
    const edgeId = targetId(event, "edge");
    const groupId = targetId(event, "group");
    const actions: ContextMenuAction[] = [];

    // A vertex context click is also an explicit vertex selection. Without
    // this, the Inspector keeps a previous face or route selection and cannot
    // offer the wall-gate action for the vertex under the pointer.
    if (vertexId) {
      selection = { ...selection, vertexId, faceId: null, edgeId: null, groupId: null };
      activeGroupId = null;
      tool = "vertex";
      refresh();
    }

    const activeGroup = activeGroupId ? documentState.featureGroups.find(group => group.id === activeGroupId) : null;
    const routeGroup = groupId ? documentState.featureGroups.find(group => group.id === groupId) : activeGroup;
    const routeEdgeId =
      routeGroup && edgeId && groupUsesEdge(documentState, routeGroup, edgeId)
        ? edgeId
        : routeGroup && groupId
          ? closestGroupEdgeId(routeGroup, localPointAt(event.clientX, event.clientY))
          : null;
    if (routeGroup) {
      activeGroupId = routeGroup.id;
      selection.groupId = routeGroup.id;
      selection.edgeId = routeEdgeId;
      tool = "select";
    }
    if (routeEdgeId && routeGroup && !routeGroup.locked) {
      actions.push({
        label: `Delete ${routeGroup.name} edge`,
        run: () =>
          runContextAction(() => {
            const next = removeEdgeFromGroup(documentState, routeGroup.id, routeEdgeId);
            if (next && !next.featureGroups.some(group => group.id === routeGroup.id)) {
              activeGroupId = null;
              selection.groupId = null;
            }
            selection.edgeId = null;
            return next;
          }, `Delete ${routeGroup.name} edge`)
      });
    }

    const wardFace = faceId ? documentState.mesh.faces[faceId] : null;
    if (wardFace?.properties.ward) {
      actions.push({
        label: `Enclose connected ${wardFace.properties.ward} ward with walls`,
        run: () =>
          runContextAction(
            () => encloseWardComponentWithWalls(documentState, wardFace.id),
            `Enclose ${wardFace.properties.ward} ward`
          )
      });
    }

    if (
      faceId &&
      selection.faceId &&
      faceId !== selection.faceId &&
      faceNeighbors(documentState.mesh, selection.faceId).includes(faceId)
    ) {
      actions.push({
        label: `Merge ${selection.faceId} with ${faceId}`,
        run: () => runContextAction(() => mergeFaces(documentState, selection.faceId as Id, faceId), "Merge cells")
      });
    }

    if (vertexId && selection.vertexId && vertexId !== selection.vertexId) {
      if (edgeBetween(documentState.mesh, selection.vertexId, vertexId)) {
        actions.push({
          label: `Merge ${vertexId} into ${selection.vertexId}`,
          run: () =>
            runContextAction(() => mergeVertices(documentState, selection.vertexId as Id, vertexId), "Merge vertices"),
          highlight: { vertexId, edgeId: edgeBetween(documentState.mesh, selection.vertexId, vertexId)?.id ?? "" }
        });
      } else {
        for (const face of Object.values(documentState.mesh.faces)) {
          const vertices = faceVertices(documentState.mesh, face);
          if (!vertices.includes(selection.vertexId) || !vertices.includes(vertexId)) continue;
          actions.push({
            label: `Split ${face.id} from ${selection.vertexId} to ${vertexId}`,
            run: () =>
              runContextAction(
                () => splitFace(documentState, face.id, selection.vertexId as Id, vertexId),
                "Split cell"
              )
          });
        }
      }
    }

    showContextMenu(event, actions);
  });
  map.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      halfView = clamp(
        halfView * Math.exp(event.deltaY * 0.0012),
        documentState.frame.extentMeters / 40,
        documentState.frame.extentMeters / 2
      );
      scheduleRedraw();
      updateWardBrushPreview();
      updateCircularWallPreview();
      refreshScaleBar();
    },
    { passive: false }
  );
  window.addEventListener("keydown", event => {
    if (event.code === "Space") isSpacePressed = true;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      restore(event.shiftKey ? history.redo(documentState) : history.undo(documentState));
    }
    if (event.key === "Enter") finishButton.click();
    if (event.key === "Escape") {
      routeStroke = null;
      selection = emptySelection();
      activeGroupId = null;
      hideContextMenu();
      refresh();
    }
  });
  window.addEventListener("keyup", event => {
    if (event.code === "Space") isSpacePressed = false;
  });
  window.addEventListener("blur", () => {
    isSpacePressed = false;
  });
  window.addEventListener("pointerdown", event => {
    if (event.target instanceof Node && !contextMenu.contains(event.target)) hideContextMenu();
  });
  window.addEventListener("pointermove", () => {
    if (closeContextMenuOnPointerMove) hideContextMenu();
  });
  window.addEventListener("resize", refreshScaleBar);

  rebuildEditorIndexes();
  refresh();

  function appendSelectedEdge(edgeId: Id, kind: "road" | "wall"): void {
    let next = documentState;
    let groupId = activeGroupId;
    const active = groupId ? next.featureGroups.find(group => group.id === groupId) : null;
    if (!active || active.kind !== kind) {
      next = createGroup(next, kind);
      groupId = next.featureGroups.at(-1)?.id ?? null;
    }
    if (!groupId) return;
    const appended = appendEdge(next, groupId, edgeId);
    if (appended) {
      activeGroupId = groupId;
      selection.groupId = groupId;
      commit(appended, kind === "wall" ? "Draw wall" : "Draw road");
    }
  }

  function appendSelectedRiverVertex(vertexId: Id): void {
    let next = documentState;
    let groupId = activeGroupId;
    const active = groupId ? next.featureGroups.find(group => group.id === groupId) : null;
    if (active?.kind !== "river" || active.mouth) {
      next = createGroup(next, "river");
      groupId = next.featureGroups.at(-1)?.id ?? null;
    }
    if (!groupId) return;
    const appended = appendRiverVertex(next, groupId, vertexId);
    if (appended) {
      activeGroupId = groupId;
      selection = { ...selection, vertexId, groupId };
      commit(appended, "Draw river");
    }
  }

  function commit(next: CityDocument, label = "Edit"): void {
    // A no-op edit (re-selecting the same ward, scale ×1, re-applying "sea" to a
    // sea cell) returns the document unchanged. Skip the snapshot so it does not
    // add an empty undo step or a History-panel row.
    if (next === documentState) {
      refresh();
      return;
    }
    documentState = history.commit(next, label);
    rebuildEditorIndexes();
    refresh();
  }

  function runContextAction(operation: () => CityDocument | null, label = "Edit"): void {
    const next = operation();
    hideContextMenu();
    if (next) {
      commit(next, label);
      return;
    }
    showNotice("This operation cannot be applied to the selected geometry");
  }

  function showContextMenu(event: MouseEvent, actions: ContextMenuAction[]): void {
    showContextMenuAt(event.clientX, event.clientY, actions);
  }

  function showContextMenuAt(clientX: number, clientY: number, actions: ContextMenuAction[]): void {
    contextMenu.replaceChildren();
    if (actions.length) {
      for (const action of actions) {
        const button = makeButton(action.label, action.run);
        const highlight = action.highlight;
        if (highlight) {
          button.addEventListener("pointerenter", () => setContextHighlight(highlight));
          button.addEventListener("pointerleave", clearContextHighlight);
        }
        contextMenu.appendChild(button);
      }
    } else {
      contextMenu.appendChild(text("No action available here"));
    }
    closeContextMenuOnPointerMove = actions.length === 0;
    contextMenu.hidden = false;
    contextMenu.style.left = `${clientX}px`;
    contextMenu.style.top = `${clientY}px`;
    const bounds = contextMenu.getBoundingClientRect();
    contextMenu.style.left = `${Math.max(8, Math.min(clientX, window.innerWidth - bounds.width - 8))}px`;
    contextMenu.style.top = `${Math.max(8, Math.min(clientY, window.innerHeight - bounds.height - 8))}px`;
  }

  function hideContextMenu(): void {
    contextMenu.hidden = true;
    closeContextMenuOnPointerMove = false;
    clearContextHighlight();
  }

  function setContextHighlight(highlight: { vertexId: Id; edgeId: Id }): void {
    selection.hoverVertexId = highlight.vertexId;
    selection.hoverEdgeId = highlight.edgeId;
    updateHoverOverlay();
  }

  function clearContextHighlight(): void {
    if (!selection.hoverVertexId && !selection.hoverEdgeId) return;
    selection.hoverVertexId = null;
    selection.hoverEdgeId = null;
    updateHoverOverlay();
  }

  function restore(next: CityDocument | null): void {
    if (!next) return;
    documentState = next;
    rebuildEditorIndexes();
    selection = emptySelection();
    activeGroupId = null;
    refresh();
  }

  function jumpToHistory(index: number): void {
    restore(history.jumpTo(index));
  }

  function refresh(): void {
    redrawMap();
    refreshUiOnly();
  }

  /**
   * Everything refresh() does except the map redraw. Ward/sea painting calls
   * this directly after finishing a stroke, since it already kept the SVG
   * current itself (patchFaceRender) and a redrawMap() pass here would just
   * redo, over the whole mesh, work already done for the touched cells.
   */
  function refreshUiOnly(): void {
    map.classList.toggle("ce-map--select", tool === "select");
    map.classList.toggle("ce-map--brush", isBrushTool(tool) || tool === "wardWall");
    for (const [id, button] of toolButtons) button.classList.toggle("is-active", id === tool);
    undoButton.disabled = !history.canUndo;
    redoButton.disabled = !history.canRedo;
    for (const [kind, button] of paintButtons) {
      button.classList.toggle(
        "is-active",
        kind === "sea"
          ? tool === "sea"
          : tool === "ward" && (kind === "erase" ? wardBrush === null : wardBrush === kind)
      );
    }
    brushSizeInput.disabled = !isBrushTool(tool);
    brushSizeLabel.classList.toggle("is-disabled", !isBrushTool(tool));
    brushSizeValue.textContent = brushSizeText();
    junctionMaxGapInput.disabled = tool !== "junction";
    junctionMaxGapLabel.classList.toggle("is-disabled", tool !== "junction");
    junctionMaxGapValue.textContent = formatDistance(junctionMaxGapMeters);
    if (!isBrushTool(tool)) hideWardBrushPreview();
    else updateWardBrushPreview();
    if (tool !== "wardWall") hideCircularWallPreview();
    else updateCircularWallPreview();
    renderInspector();
    renderGroups();
    renderHistory();
    const errors = validate(documentState);
    status.textContent = `${Object.keys(documentState.mesh.faces).length} blocks · ${documentState.featureGroups.length} groups${errors.length ? ` · ${errors.join(", ")}` : " · valid"}${notice ? ` · ${notice}` : ""}`;
    refreshScaleBar();
  }

  /** Repaint on the next frame, collapsing bursts of pointermove events. */
  function scheduleRedraw(): void {
    if (redrawHandle) return;
    redrawHandle = requestAnimationFrame(() => {
      redrawHandle = 0;
      redrawMap();
    });
  }

  /** Force a pending frame-deferred repaint now, before code reads the SVG
   *  (hit-testing, getScreenCTM) and would otherwise see stale geometry. */
  function flushRedraw(): void {
    if (redrawHandle) redrawMap();
  }

  function redrawMap(): void {
    if (redrawHandle) {
      cancelAnimationFrame(redrawHandle);
      redrawHandle = 0;
    }
    const box = `${viewCenter[0] - halfView} ${-viewCenter[1] - halfView} ${halfView * 2} ${halfView * 2}`;
    const svg = renderEditorSvg(documentState, tool, selection, box, zoomFactor(), showSelectionLabels, referenceImage);
    map.replaceChildren(svg);
    // Index the per-face nodes this pass just built so a later ward/sea paint
    // can patch just the touched faces (patchFaceRender) instead of forcing
    // another full pass over the whole mesh.
    faceElementsById = new Map(
      Array.from(svg.querySelectorAll<SVGPathElement>(".ce-face"), el => [el.getAttribute("data-face") as Id, el])
    );
    wardLandmarksGroup = svg.querySelector<SVGGElement>(".ce-ward-landmarks");
    wardLandmarkElementsById = new Map(
      Array.from(wardLandmarksGroup?.children ?? [], el => [
        (el.getAttribute("data-element") as string).slice("ward-".length),
        el as SVGGElement
      ])
    );
    updateRoutePreview();
    updateHoverOverlay();
  }

  /**
   * Patch one face's rendered fill and Ward-landmark marker in place, without
   * a full redrawMap() pass. Only ward/sea painting may call this: it never
   * adds, removes, or moves a vertex/edge and never touches featureGroups,
   * gates, or elements, so nothing else the SVG renders can be affected.
   */
  function patchFaceRender(faceId: Id): void {
    const face = documentState.mesh.faces[faceId];
    if (!face) return;
    const path = faceElementsById.get(faceId);
    if (path) path.setAttribute("class", faceClassName(face, selection.faceId === faceId));
    wardLandmarkElementsById.get(faceId)?.remove();
    wardLandmarkElementsById.delete(faceId);
    const landmark = renderFaceWardLandmark(documentState.mesh, face);
    if (landmark && wardLandmarksGroup) {
      wardLandmarksGroup.appendChild(landmark);
      wardLandmarkElementsById.set(faceId, landmark as SVGGElement);
    }
  }

  function updateRoutePreview(): void {
    const layer = map.querySelector<SVGGElement>(".ce-route-preview-layer");
    if (!layer) return;
    layer.replaceChildren();
    if (!routePreview) return;
    const path = renderRoutePreview(documentState, routePreview.group, routePreview.replacementVertices);
    if (path) layer.appendChild(path);
  }

  /** Repaint only the hover marks (glowing route, edge, nearest vertex). */
  function updateHoverOverlay(): void {
    const layer = map.querySelector<SVGGElement>(".ce-hover-layer");
    if (!layer) return;
    layer.replaceChildren(...renderHoverOverlay(documentState, selection, zoomFactor()));
  }

  function refreshScaleBar(): void {
    const width = map.getBoundingClientRect().width;
    if (width <= 0) return;
    const metersPerPixel = (halfView * 2) / width;
    const meters = niceScale(metersPerPixel * 120);
    scaleLine.style.width = `${meters / metersPerPixel}px`;
    const blockCount = Math.max(1, Math.round(meters / documentState.frame.blockSizeMeters));
    scaleLabel.textContent = `×${zoomFactor().toFixed(1)} · ${formatDistance(meters)} · ≈ ${blockCount} block${blockCount === 1 ? "" : "s"} (1 cell ≈ ${formatDistance(documentState.frame.blockSizeMeters)})`;
    refreshJunctionGapScale();
  }

  function refreshJunctionGapScale(): void {
    const width = map.getBoundingClientRect().width;
    if (width <= 0) return;
    const metersPerPixel = (halfView * 2) / width;
    const pixelLength = Math.max(1, junctionMaxGapMeters / metersPerPixel);
    junctionGapLine.style.width = `${pixelLength}px`;
    junctionGapLength.textContent = `${formatDistance(junctionMaxGapMeters)} edge threshold`;
  }

  function zoomFactor(): number {
    return documentState.frame.extentMeters / 2 / halfView;
  }

  function renderInspector(): void {
    inspector.content.replaceChildren();
    if (activeGroupId) {
      const group = documentState.featureGroups.find(candidate => candidate.id === activeGroupId);
      if (group) {
        inspector.content.appendChild(
          text(
            group.locked
              ? `${group.name} is locked`
              : "Route drawing: in River, Road, or Wall mode, left-drag from a nearby edge to lay a connected route. In Select mode, left-drag a highlighted route edge through a cell to reroute it; right-click to delete; click an unused edge at an endpoint to extend it."
          )
        );
        return;
      }
    }
    if (selection.edgeId && activeGroupId) {
      const group = documentState.featureGroups.find(candidate => candidate.id === activeGroupId);
      if (group) {
        inspector.content.append(
          text(`Selected edge ${selection.edgeId} in ${group.name}`),
          makeIconButton("×", "Delete selected edge", () => {
            const next = removeEdgeFromGroup(documentState, group.id, selection.edgeId as Id);
            if (next) {
              selection.edgeId = null;
              commit(next, `Delete edge in ${group.name}`);
            }
          })
        );
        return;
      }
    }
    if (selection.vertexId) {
      const vertex = documentState.mesh.vertices[selection.vertexId];
      if (!vertex) return;
      const gate = documentState.gates.find(candidate => candidate.vertexId === vertex.id);
      const wallVertex = vertexHasWall(documentState, vertex.id);
      const gateButton = makeIconButton(
        gate ? "⌑" : "＋",
        gate ? "Remove gate" : "Place gate on this wall vertex",
        () => {
          if (gate) {
            const next = toggleGate(documentState, vertex.id);
            if (next) commit(next, "Remove gate");
            return;
          }
          const candidates = gateOpeningCandidates(documentState, vertex.id);
          if (candidates.length === 1) {
            const next = placeGateOpening(documentState, vertex.id, candidates[0].vertexId);
            if (next) commit(next, "Place gate");
            else showNotice("Cannot create a through-road at this wall vertex");
            return;
          }
          if (!candidates.length) {
            showNotice("This wall vertex has no edge that can become a gate passage");
            return;
          }
          const bounds = gateButton.getBoundingClientRect();
          showContextMenuAt(
            bounds.right + 6,
            bounds.top,
            candidates.map(candidate => ({
              label: `Open via ${candidate.edgeId} → ${candidate.vertexId}`,
              run: () =>
                runContextAction(() => placeGateOpening(documentState, vertex.id, candidate.vertexId), "Place gate"),
              highlight: { vertexId: candidate.vertexId, edgeId: candidate.edgeId }
            }))
          );
        }
      );
      gateButton.disabled = !wallVertex;
      inspector.content.append(
        text(`Vertex ${vertex.id}`),
        text(
          wallVertex
            ? "Place a gate to merge a neighboring wall vertex and create a road through the wall."
            : "Draw an outer wall through this vertex before placing a gate."
        ),
        gateButton
      );
      return;
    }
    if (!selection.faceId) {
      inspector.content.appendChild(text("Select a cell to set water, a ward, or an urban element."));
      return;
    }
    const face = documentState.mesh.faces[selection.faceId];
    if (!face) return;
    const water = select(["land", "sea", "lake", "openWater"], face.properties.water);
    water.addEventListener("change", () =>
      commit(setFaceWater(documentState, face.id, water.value as WaterKind), `Set water ${water.value}`)
    );
    const elevation = numberInput(String(face.properties.elevation), "-1000", "1");
    elevation.addEventListener("change", () =>
      commit(setFaceElevation(documentState, face.id, Number(elevation.value)), "Set elevation")
    );
    const ward = select(
      ["", "market", "castle", "merchant", "craftsmen", "harbor", "park", "empty"],
      face.properties.ward ?? ""
    );
    ward.addEventListener("change", () => {
      const next = clone(documentState);
      next.mesh.faces[face.id].properties.ward = (ward.value || null) as WardKind | null;
      commit(next, ward.value ? `Set ${ward.value} ward` : "Clear ward");
    });
    const vertices = faceVertices(documentState.mesh, face);
    const splitFrom = select(vertices, vertices[0]);
    const splitTo = select(vertices, vertices[Math.floor(vertices.length / 2)]);
    const neighbors = faceNeighbors(documentState.mesh, face.id);
    const mergeWith = select(neighbors, neighbors[0] ?? "");
    inspector.content.append(
      label("Elevation", elevation),
      label("Water", water),
      label("Ward", ward),
      text("Ward automatically controls the landmark drawn in this cell."),
      divider(),
      label("Split from", splitFrom),
      label("Split to", splitTo),
      makeIconButton("✂", "Split cell", () => {
        const next = splitFace(documentState, face.id, splitFrom.value, splitTo.value);
        if (next) commit(next, "Split cell");
      }),
      label("Merge with", mergeWith),
      makeIconButton("⊕", "Merge cell", () => {
        if (!mergeWith.value) return;
        const next = mergeFaces(documentState, face.id, mergeWith.value);
        if (next) commit(next, "Merge cells");
      })
    );
  }

  function renderGroups(): void {
    groups.content.replaceChildren();
    for (const group of documentState.featureGroups) {
      const row = div("ce-group-row");
      const choose = makeIconButton(
        group.kind === "river" ? "〰" : group.kind === "road" ? "╱" : "▥",
        `Select ${group.name}`,
        () => {
          activeGroupId = group.id;
          selection.groupId = group.id;
          tool = "select";
          refresh();
        }
      );
      choose.classList.toggle("is-active", group.id === activeGroupId);
      row.append(
        choose,
        text(group.kind === "river" ? `${group.vertices.length} vertices` : `${group.segments.length} edges`)
      );
      const smooth = makeIconButton("⌁", `Smooth ${group.name}`, () => {
        const next = smoothFeatureGroup(documentState, group.id);
        if (next) commit(next, `Smooth ${group.name}`);
        else showNotice(`${group.name} has no movable vertices to smooth`);
      });
      smooth.disabled = group.locked || (group.kind !== "river" && group.kind !== "road" && group.kind !== "wall");
      smooth.title = "Smooth this group, including its shared vertices and closed loops";
      row.appendChild(smooth);
      row.appendChild(
        makeIconButton("×", `Delete ${group.name}`, () => {
          const name = group.name;
          if (activeGroupId === group.id) {
            activeGroupId = null;
            selection.groupId = null;
          }
          commit(removeGroup(documentState, group.id), `Delete ${name}`);
        })
      );
      groups.content.appendChild(row);
    }
    if (activeGroupId)
      groups.content.appendChild(
        text(
          "In Select mode, left-drag a highlighted route edge through a cell to preview and replace that boundary span."
        )
      );
  }

  function renderHistory(): void {
    const entries = history.entries;
    const current = history.index;
    // A brush stroke commits one entry per edit, so painting a Large mesh one
    // cell at a time can push this into the hundreds within a session.
    // Rebuilding every row's DOM on every single commit made this panel cost
    // O(entries) per edit — O(entries²) over a session — even though only the
    // newest row (or the current one, via amendTop) actually changed. Reuse
    // existing row nodes and only patch what changed; fall back to a full
    // rebuild only when the list actually shrinks (undo-then-branch, or a
    // fresh document/history).
    if (!historyListEl || historyRows.length > entries.length) {
      historyPanel.content.replaceChildren();
      historyListEl = div("ce-history-list");
      const actions = div("ce-history-actions");
      historyClearButton = makeButton("Clear all history", () => {
        if (!history.canUndo && !history.canRedo) return;
        history.reset(documentState, "History cleared");
        showNotice("History cleared");
        refreshUiOnly();
      });
      historyClearButton.className = "ce-history-clear";
      actions.appendChild(historyClearButton);
      historySummaryEl = text("");
      historyPanel.content.append(historyListEl, actions, historySummaryEl);
      historyRows = [];
    }
    const list = historyListEl;
    entries.forEach((entry, index) => {
      let row = historyRows[index];
      if (!row) {
        row = makeButton("", () => jumpToHistory(index));
        row.className = "ce-history-row";
        const step = text(String(index));
        step.className = "ce-history-index";
        row.append(step, text(""), text(""));
        (row.children[1] as HTMLElement).className = "ce-history-label";
        (row.children[2] as HTMLElement).className = "ce-history-time";
        list.appendChild(row);
        historyRows[index] = row;
      }
      const label = row.children[1] as HTMLElement;
      const time = row.children[2] as HTMLElement;
      if (label.textContent !== entry.label) label.textContent = entry.label;
      const clock = formatClock(entry.time);
      if (time.textContent !== clock) time.textContent = clock;
      row.title = `Restore state ${index}: ${entry.label}`;
      row.classList.toggle("is-current", index === current);
      row.classList.toggle("is-future", index > current);
    });
    historyClearButton!.disabled = entries.length <= 1;
    historySummaryEl!.textContent = `Step ${current} of ${entries.length - 1} · click a step to restore it`;
    // Keep the active step visible as the timeline grows past the panel height.
    historyRows[current]?.scrollIntoView({ block: "nearest" });
  }

  function localPoint(event: PointerEvent): [number, number] {
    return localPointAt(event.clientX, event.clientY);
  }

  function closestVertexId(point: [number, number]): Id | null {
    // Accept a roughly 12 px drop target regardless of the current zoom.
    const radius = (halfView * 24) / Math.max(map.getBoundingClientRect().width, 1);
    const span = Math.max(1, Math.ceil(radius / faceBucketSize));
    const originX = Math.floor(point[0] / faceBucketSize);
    const originY = Math.floor(point[1] / faceBucketSize);
    let nearest: Id | null = null;
    let nearestDistance = radius;
    for (let x = originX - span; x <= originX + span; x++) {
      for (let y = originY - span; y <= originY + span; y++) {
        for (const vertexId of vertexBuckets.get(`${x},${y}`) ?? []) {
          const vertex = documentState.mesh.vertices[vertexId];
          if (!vertex) continue;
          const distance = Math.hypot(vertex.point[0] - point[0], vertex.point[1] - point[1]);
          if (distance <= nearestDistance) {
            nearest = vertex.id;
            nearestDistance = distance;
          }
        }
      }
    }
    return nearest;
  }

  function closestMergeCandidate(vertexId: Id): Id | null {
    const vertex = documentState.mesh.vertices[vertexId];
    if (!vertex) return null;
    const radius = (halfView * 26) / Math.max(map.getBoundingClientRect().width, 1);
    let candidate: Id | null = null;
    let distance = radius;
    for (const edgeId of edgeIdsByVertex.get(vertexId) ?? []) {
      const edge = documentState.mesh.edges[edgeId];
      if (!edge) continue;
      const otherId = edge.a === vertexId ? edge.b : edge.a;
      const other = documentState.mesh.vertices[otherId];
      if (!other) continue;
      const candidateDistance = Math.hypot(vertex.point[0] - other.point[0], vertex.point[1] - other.point[1]);
      if (candidateDistance <= distance) {
        candidate = otherId;
        distance = candidateDistance;
      }
    }
    return candidate;
  }

  function rebuildEditorIndexes(): void {
    const edgeByVertices = new Map<string, Id>();
    edgeIdsByVertex = new Map();
    for (const edge of Object.values(documentState.mesh.edges)) {
      edgeByVertices.set(vertexPairKey(edge.a, edge.b), edge.id);
      edgeIdsByVertex.set(edge.a, [...(edgeIdsByVertex.get(edge.a) ?? []), edge.id]);
      edgeIdsByVertex.set(edge.b, [...(edgeIdsByVertex.get(edge.b) ?? []), edge.id]);
    }

    routeEdgesByGroup = new Map();
    routeGroupsByEdge = new Map();
    for (const group of documentState.featureGroups) {
      const edgeIds =
        group.kind === "river"
          ? group.vertices.slice(1).flatMap((vertexId, index) => {
              const edgeId = edgeByVertices.get(vertexPairKey(group.vertices[index], vertexId));
              return edgeId ? [edgeId] : [];
            })
          : group.segments.map(segment => segment.edgeId);
      routeEdgesByGroup.set(group.id, edgeIds);
      for (const edgeId of edgeIds) routeGroupsByEdge.set(edgeId, [...(routeGroupsByEdge.get(edgeId) ?? []), group.id]);
    }

    faceBucketSize = Math.max(documentState.frame.blockSizeMeters * 2, documentState.frame.extentMeters / 32);
    faceBuckets = new Map();
    for (const face of Object.values(documentState.mesh.faces)) {
      const points = facePoints(documentState.mesh, face);
      const minX = Math.min(...points.map(point => point[0]));
      const maxX = Math.max(...points.map(point => point[0]));
      const minY = Math.min(...points.map(point => point[1]));
      const maxY = Math.max(...points.map(point => point[1]));
      for (let x = Math.floor(minX / faceBucketSize); x <= Math.floor(maxX / faceBucketSize); x++) {
        for (let y = Math.floor(minY / faceBucketSize); y <= Math.floor(maxY / faceBucketSize); y++) {
          const key = `${x},${y}`;
          faceBuckets.set(key, [...(faceBuckets.get(key) ?? []), face.id]);
        }
      }
    }

    // Same grid, keyed by vertex position, so closestVertexId() can scan a
    // handful of nearby buckets instead of every vertex on each hover move.
    vertexBuckets = new Map();
    for (const vertex of Object.values(documentState.mesh.vertices)) {
      const key = `${Math.floor(vertex.point[0] / faceBucketSize)},${Math.floor(vertex.point[1] / faceBucketSize)}`;
      vertexBuckets.set(key, [...(vertexBuckets.get(key) ?? []), vertex.id]);
    }
  }

  function faceAtPoint(point: Point): Id | null {
    const key = `${Math.floor(point[0] / faceBucketSize)},${Math.floor(point[1] / faceBucketSize)}`;
    for (const faceId of faceBuckets.get(key) ?? []) {
      const face = documentState.mesh.faces[faceId];
      if (face && pointInPolygon(point, facePoints(documentState.mesh, face))) return face.id;
    }
    return null;
  }

  function faceIdsWithinWardBrush(center: Point): Id[] {
    const radius = paintBrushRadiusMeters();
    if (radius <= 0) {
      const faceId = faceAtPoint(center);
      return faceId ? [faceId] : [];
    }
    const faceIds = new Set<Id>();
    const minX = Math.floor((center[0] - radius) / faceBucketSize);
    const maxX = Math.floor((center[0] + radius) / faceBucketSize);
    const minY = Math.floor((center[1] - radius) / faceBucketSize);
    const maxY = Math.floor((center[1] + radius) / faceBucketSize);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (const faceId of faceBuckets.get(`${x},${y}`) ?? []) faceIds.add(faceId);
      }
    }
    return [...faceIds].filter(faceId => {
      const face = documentState.mesh.faces[faceId];
      return !!face && circleIntersectsPolygon(center, radius, facePoints(documentState.mesh, face));
    });
  }

  function updateHover(event: PointerEvent): void {
    // Only Select, Edit-vertices, and the route tools show a hover highlight
    // (route glow / nearest-vertex handle). The brush tools (ward, sea,
    // junction, circular wall) track the cursor with a lightweight CSS ring, so
    // recomputing hover for them here is pure waste.
    const usesHover = tool === "select" || tool === "vertex" || isRoutePaintTool(tool);
    const point = usesHover ? localPoint(event) : null;
    const route = point ? routeAtEvent(event, point, false) : null;
    const nextGroupId = route?.groupId ?? null;
    const nextVertexId = point && tool === "select" ? closestVertexId(point) : null;
    // Compare against the normalised value: without this, an idle pointer over
    // empty canvas (route === null → groupId undefined) never matches the
    // stored null and forces a repaint on every move.
    if (selection.hoverGroupId === nextGroupId && selection.hoverVertexId === nextVertexId) return;
    selection.hoverGroupId = nextGroupId;
    selection.hoverVertexId = nextVertexId;
    // Hover marks live in their own layer now, so this never rebuilds the mesh.
    updateHoverOverlay();
  }

  function paintCellsAtPoint(point: Point): void {
    const faceIds = faceIdsWithinWardBrush(point);
    if (!faceIds.length) return;
    // Copy-on-write: a stroke fires this on every pointermove, so cloning the
    // whole document (all vertices/edges plus every face's boundary) here
    // would scale with total mesh size instead of the handful of cells the
    // brush actually touches — on a Large mesh that's ~16x the work of Small
    // for the same brush. Only the faces map is shallow-copied, and only the
    // faces the brush actually changes get a fresh object; every untouched
    // face keeps its original reference.
    let faces: CityDocument["mesh"]["faces"] | null = null;
    const touched: Id[] = [];
    for (const faceId of faceIds) {
      if (paintedWardFaceIds.has(faceId)) continue;
      paintedWardFaceIds.add(faceId);
      const face = documentState.mesh.faces[faceId];
      if (!face) continue;
      if (tool === "sea") {
        if (face.properties.water === "sea" && face.properties.elevation === 0) continue;
      } else if (face.properties.ward === wardBrush) continue;
      if (!faces) faces = { ...documentState.mesh.faces };
      const properties = { ...face.properties };
      if (tool === "sea") {
        // Match the Inspector's Water = sea operation exactly.
        properties.water = "sea";
        properties.elevation = 0;
      } else {
        properties.ward = wardBrush;
      }
      faces[faceId] = { ...face, properties };
      touched.push(faceId);
    }
    if (!faces) return;
    documentState = { ...documentState, mesh: { ...documentState.mesh, faces } };
    wardPaintChanged = true;
    // Patch just the touched faces' <path>/landmark directly, rather than
    // scheduling a full redrawMap() pass over the whole mesh next frame — on
    // a Large mesh a 1-cell brush touches one face out of ~9,000.
    for (const faceId of touched) patchFaceRender(faceId);
  }

  /**
   * The control expresses the visible painted diameter, not a geometric radius.
   * A point brush already covers the cell under the pointer, so subtract that
   * first cell before expanding into neighbouring cells.
   */
  function paintBrushRadiusMeters(): number {
    return Math.max(0, (brushSizeMeters() - documentState.frame.blockSizeMeters) / 2);
  }

  function brushSizeMeters(): number {
    return brushSizeCells * documentState.frame.blockSizeMeters;
  }

  function brushSizeText(): string {
    const unit = brushSizeCells === 1 ? "cell" : "cells";
    return `${brushSizeCells} ${unit} · ${formatDistance(brushSizeMeters())}`;
  }

  function optimizeJunctionsAtPoint(point: Point): void {
    const next = optimizeJunctions(documentState, point, brushSizeMeters() / 2, junctionMaxGapMeters);
    if (!next) return;
    documentState = next;
    junctionPaintChanged = true;
    scheduleRedraw();
  }

  function updateWardBrushPreview(event?: PointerEvent): void {
    if (event) wardBrushPointer = { clientX: event.clientX, clientY: event.clientY };
    if (!isBrushTool(tool) || !wardBrushPointer) {
      hideWardBrushPreview();
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const metersPerPixel = (halfView * 2) / Math.max(map.getBoundingClientRect().width, 1);
    const radiusPixels = Math.max(5, brushSizeMeters() / 2 / metersPerPixel);
    wardBrushPreview.style.width = `${radiusPixels * 2}px`;
    wardBrushPreview.style.height = `${radiusPixels * 2}px`;
    wardBrushPreview.style.left = `${wardBrushPointer.clientX - bounds.left}px`;
    wardBrushPreview.style.top = `${wardBrushPointer.clientY - bounds.top}px`;
    wardBrushPreview.hidden = false;
  }

  function hideWardBrushPreview(): void {
    wardBrushPreview.hidden = true;
    wardBrushPointer = null;
  }

  function updateCircularWallPreview(event?: PointerEvent): void {
    if (event) circularWallPointer = { clientX: event.clientX, clientY: event.clientY };
    if (tool !== "wardWall" || !circularWallPointer) {
      hideCircularWallPreview();
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const stroke = circularWallStroke;
    const centerClient = stroke?.centerClient ?? circularWallPointer;
    circularWallCenter.style.left = `${centerClient.clientX - bounds.left}px`;
    circularWallCenter.style.top = `${centerClient.clientY - bounds.top}px`;
    circularWallCenter.hidden = false;
    if (!stroke) {
      circularWallPreview.hidden = true;
      return;
    }
    const pointer = event ? localPoint(event) : stroke.center;
    stroke.radiusMeters = Math.hypot(pointer[0] - stroke.center[0], pointer[1] - stroke.center[1]);
    const metersPerPixel = (halfView * 2) / Math.max(map.getBoundingClientRect().width, 1);
    const radiusPixels = stroke.radiusMeters / metersPerPixel;
    circularWallPreview.style.width = `${radiusPixels * 2}px`;
    circularWallPreview.style.height = `${radiusPixels * 2}px`;
    circularWallPreview.style.left = `${centerClient.clientX - bounds.left}px`;
    circularWallPreview.style.top = `${centerClient.clientY - bounds.top}px`;
    circularWallPreview.hidden = radiusPixels < 1;
  }

  function hideCircularWallPreview(): void {
    circularWallPreview.hidden = true;
    circularWallCenter.hidden = true;
    circularWallPointer = null;
  }

  function extendRouteStroke(point: Point): void {
    const stroke = routeStroke;
    if (!stroke) return;
    if (!stroke.initialized) initializeRouteStroke(stroke, point);
    if (!stroke.groupId || !stroke.endpointId) return;

    const edgeId = closestStrokeContinuation(stroke, point);
    const edge = edgeId ? documentState.mesh.edges[edgeId] : null;
    if (edge && edgeId) {
      const nextEndpointId: Id = edge.a === stroke.endpointId ? edge.b : edge.a;
      const next =
        stroke.kind === "river"
          ? appendRiverVertex(documentState, stroke.groupId, nextEndpointId)
          : appendEdge(documentState, stroke.groupId, edgeId);
      if (next) {
        documentState = next;
        stroke.endpointId = nextEndpointId;
        stroke.changed = true;
        selection.groupId = stroke.groupId;
        activeGroupId = stroke.groupId;
        commitRouteStrokeStep(stroke);
      }
    }
    stroke.lastPoint = point;
    if (stroke.changed) scheduleRedraw();
  }

  function initializeRouteStroke(stroke: RouteStroke, point: Point): void {
    const edge = documentState.mesh.edges[stroke.initialEdgeId];
    if (!edge) return;
    if (stroke.groupId && stroke.endpointId) {
      const group = documentState.featureGroups.find(candidate => candidate.id === stroke.groupId);
      if (!group || group.locked || group.kind !== stroke.kind || (group.kind === "river" && group.mouth)) return;
      stroke.initialized = true;
      if (groupUsesEdge(documentState, group, stroke.initialEdgeId)) return;
      const nextEndpointId = edge.a === stroke.endpointId ? edge.b : edge.a;
      const next =
        stroke.kind === "river"
          ? appendRiverVertex(documentState, stroke.groupId, nextEndpointId)
          : appendEdge(documentState, stroke.groupId, stroke.initialEdgeId);
      if (!next) return;
      documentState = next;
      stroke.endpointId = nextEndpointId;
      stroke.changed = true;
      selection.groupId = stroke.groupId;
      activeGroupId = stroke.groupId;
      commitRouteStrokeStep(stroke);
      return;
    }
    const a = documentState.mesh.vertices[edge.a]?.point;
    const b = documentState.mesh.vertices[edge.b]?.point;
    if (!a || !b) return;
    const movement: Point = [point[0] - stroke.startPoint[0], point[1] - stroke.startPoint[1]];
    const startsAtA = (b[0] - a[0]) * movement[0] + (b[1] - a[1]) * movement[1] >= 0;
    const startVertexId = startsAtA ? edge.a : edge.b;
    const endVertexId = startsAtA ? edge.b : edge.a;
    let next = createGroup(documentState, stroke.kind);
    const groupId = next.featureGroups.at(-1)?.id;
    if (!groupId) return;

    if (stroke.kind === "river") {
      next = appendRiverVertex(next, groupId, startVertexId) ?? next;
      next = appendRiverVertex(next, groupId, endVertexId) ?? next;
    } else {
      next = appendEdge(next, groupId, stroke.initialEdgeId) ?? next;
      const group = next.featureGroups.find(candidate => candidate.id === groupId);
      if (group && group.kind !== "river" && group.segments[0]) group.segments[0].forward = startsAtA;
    }
    documentState = next;
    stroke.groupId = groupId;
    stroke.endpointId = endVertexId;
    stroke.initialized = true;
    stroke.changed = true;
    selection.groupId = groupId;
    activeGroupId = groupId;
    commitRouteStrokeStep(stroke);
  }

  function finishRouteStroke(stroke: RouteStroke, point: Point): void {
    if (!stroke.initialized) initializeRouteStroke(stroke, point);
  }

  function commitRouteStrokeStep(stroke: RouteStroke): void {
    // One drag = one undo entry. The first step of the stroke pushes it; every
    // later step rewrites that same entry so the History panel and memory only
    // ever see a single "Draw wall/road/river" per gesture.
    if (!stroke.committed) {
      history.commit(documentState, `Draw ${stroke.kind}`);
      stroke.committed = true;
    } else {
      history.amendTop(documentState, `Draw ${stroke.kind}`);
    }
    rebuildEditorIndexes();
  }

  function closestStrokeContinuation(stroke: RouteStroke, point: Point): Id | null {
    const endpointId = stroke.endpointId;
    if (!endpointId) return null;
    const endpoint = documentState.mesh.vertices[endpointId]?.point;
    if (!endpoint || Math.hypot(point[0] - endpoint[0], point[1] - endpoint[1]) < routeHitRadius() * 0.35) return null;
    const group = documentState.featureGroups.find(candidate => candidate.id === stroke.groupId);
    if (!group || (group.kind === "river" && group.mouth)) return null;
    const direction: Point = [point[0] - stroke.lastPoint[0], point[1] - stroke.lastPoint[1]];
    const directionLength = Math.hypot(direction[0], direction[1]) || 1;
    let nearest: Id | null = null;
    let nearestScore = Number.POSITIVE_INFINITY;
    for (const edgeId of edgeIdsByVertex.get(endpointId) ?? []) {
      const edge = documentState.mesh.edges[edgeId];
      if (!edge || groupUsesEdge(documentState, group, edgeId)) continue;
      const otherId = edge.a === endpointId ? edge.b : edge.a;
      const other = documentState.mesh.vertices[otherId]?.point;
      if (!other) continue;
      const distance = pointToSegmentDistance(point, endpoint, other);
      if (distance > routeHitRadius() * 1.75) continue;
      const edgeLength = Math.hypot(other[0] - endpoint[0], other[1] - endpoint[1]) || 1;
      const alignment =
        ((other[0] - endpoint[0]) * direction[0] + (other[1] - endpoint[1]) * direction[1]) /
        (edgeLength * directionLength);
      // The pointer trajectory is the user's branch choice. Never take a
      // backward or sideward edge just because it happens to pass closer to
      // the cursor than the intended forward edge.
      if (alignment < 0.15) continue;
      const score = distance + (1 - alignment) * routeHitRadius() * 4;
      if (score < nearestScore) {
        nearest = edgeId;
        nearestScore = score;
      }
    }
    return nearest;
  }

  function closestMeshEdgeId(point: Point, radiusPixels: number): Id | null {
    const radius = routeHitRadius(radiusPixels);
    let nearest: Id | null = null;
    let nearestDistance = radius;
    for (const edge of Object.values(documentState.mesh.edges)) {
      const a = documentState.mesh.vertices[edge.a]?.point;
      const b = documentState.mesh.vertices[edge.b]?.point;
      if (!a || !b) continue;
      const distance = pointToSegmentDistance(point, a, b);
      if (distance <= nearestDistance) {
        nearest = edge.id;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function routeEndpointOnEdge(kind: RoutePaintKind, edgeId: Id, point: Point): { groupId: Id; vertexId: Id } | null {
    const edge = documentState.mesh.edges[edgeId];
    if (!edge) return null;
    let closest: { groupId: Id; vertexId: Id; distance: number } | null = null;
    for (const group of documentState.featureGroups) {
      if (group.kind !== kind || group.locked || (group.kind === "river" && group.mouth)) continue;
      const vertices = featureGroupVertices(documentState, group);
      const endpoints = group.kind === "river" ? [vertices.at(-1)] : [vertices[0], vertices.at(-1)];
      for (const vertexId of new Set(endpoints)) {
        if (!vertexId || (vertexId !== edge.a && vertexId !== edge.b)) continue;
        const vertex = documentState.mesh.vertices[vertexId];
        if (!vertex) continue;
        const distance = Math.hypot(point[0] - vertex.point[0], point[1] - vertex.point[1]);
        const activeBonus = group.id === activeGroupId ? routeHitRadius() : 0;
        if (!closest || distance - activeBonus < closest.distance) {
          closest = { groupId: group.id, vertexId, distance: distance - activeBonus };
        }
      }
    }
    return closest;
  }

  function routeHitRadius(pixels = 18): number {
    return ((halfView * 2) / Math.max(map.getBoundingClientRect().width, 1)) * pixels;
  }

  function routeAtEvent(event: Event, point: Point, allowNearby: boolean): { groupId: Id; edgeId: Id } | null {
    const directGroupId = targetId(event, "group");
    const directEdgeId = targetId(event, "edge");
    const activeGroup = activeGroupId ? documentState.featureGroups.find(group => group.id === activeGroupId) : null;
    const directEdgeGroups = directEdgeId ? (routeGroupsByEdge.get(directEdgeId) ?? []) : [];
    const group = directGroupId
      ? documentState.featureGroups.find(candidate => candidate.id === directGroupId)
      : directEdgeId && activeGroup && routeEdgesByGroup.get(activeGroup.id)?.includes(directEdgeId)
        ? activeGroup
        : directEdgeId
          ? documentState.featureGroups.find(candidate => candidate.id === directEdgeGroups[0])
          : null;
    if (!group) return allowNearby ? closestRouteAtPoint(point) : null;
    if (group.locked) return null;
    const edgeId =
      directEdgeId && routeEdgesByGroup.get(group.id)?.includes(directEdgeId)
        ? directEdgeId
        : closestGroupEdgeId(group, point);
    return edgeId ? { groupId: group.id, edgeId } : null;
  }

  function closestRouteAtPoint(point: Point): { groupId: Id; edgeId: Id } | null {
    const metersPerPixel = (halfView * 2) / Math.max(map.getBoundingClientRect().width, 1);
    let closest: { groupId: Id; edgeId: Id } | null = null;
    let nearestRatio = Number.POSITIVE_INFINITY;
    for (const group of documentState.featureGroups) {
      if (group.locked) continue;
      const hitRadius = group.style.widthMeters / 2 + metersPerPixel * 8;
      for (const edgeId of routeEdgesByGroup.get(group.id) ?? []) {
        const edge = documentState.mesh.edges[edgeId];
        if (!edge) continue;
        const a = documentState.mesh.vertices[edge.a]?.point;
        const b = documentState.mesh.vertices[edge.b]?.point;
        if (!a || !b) continue;
        const ratio = pointToSegmentDistance(point, a, b) / hitRadius;
        if (ratio > 1 || ratio >= nearestRatio) continue;
        closest = { groupId: group.id, edgeId };
        nearestRatio = ratio;
      }
    }
    return closest;
  }

  function closestGroupEdgeId(group: FeatureGroup, point: Point): Id | null {
    let nearest: Id | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const edgeId of routeEdgesByGroup.get(group.id) ?? []) {
      const edge = documentState.mesh.edges[edgeId];
      if (!edge) continue;
      const a = documentState.mesh.vertices[edge.a]?.point;
      const b = documentState.mesh.vertices[edge.b]?.point;
      if (!a || !b) continue;
      const distance = pointToSegmentDistance(point, a, b);
      if (distance < nearestDistance) {
        nearest = edgeId;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function localPointAt(clientX: number, clientY: number): [number, number] {
    const svg = map.querySelector("svg");
    if (!svg) return [0, 0];
    const point = new DOMPoint(clientX, clientY).matrixTransform(svg.getScreenCTM()?.inverse());
    return [point.x, -point.y];
  }

  async function importDocument(): Promise<void> {
    const parsed = await pickCityMap();
    applyImportedMap(parsed);
  }

  async function importMapFile(file: File | undefined): Promise<void> {
    applyImportedMap(await readCityMap(file));
  }

  function applyImportedMap(parsed: ImportedCityMap | null): void {
    if (!parsed) {
      showNotice("Import failed: select a City Editor, MFCG JSON, or SVG file");
      return;
    }
    // Lift the (possibly multi-MB) backdrop out of the edited document before it
    // seeds the history, then keep it only in the closure for render + export.
    referenceImage = parsed.document.referenceImage ?? null;
    delete parsed.document.referenceImage;
    documentState = parsed.document;
    history = new DocumentHistory(parsed.document, "Imported map");
    rebuildEditorIndexes();
    selection = emptySelection();
    activeGroupId = null;
    halfView = parsed.document.frame.extentMeters / 2;
    viewCenter = [0, 0];
    showNotice(
      parsed.source === "mfcg-svg"
        ? "SVG imported as a reference image"
        : parsed.source === "mfcg-json"
          ? "MFCG map imported"
          : "Map imported"
    );
  }

  function showNotice(value: string): void {
    notice = value;
    refresh();
    window.setTimeout(() => {
      if (notice !== value) return;
      notice = "";
      refresh();
    }, 1800);
  }
}

function emptySelection(): RenderSelection {
  return {
    faceId: null,
    edgeId: null,
    vertexId: null,
    groupId: null,
    hoverGroupId: null,
    hoverVertexId: null,
    hoverEdgeId: null
  };
}

function isRoutePaintTool(tool: Tool): tool is RoutePaintKind {
  return tool === "river" || tool === "road" || tool === "wall";
}

function isBrushTool(tool: Tool): tool is "ward" | "sea" | "junction" {
  return isPaintBrushTool(tool) || tool === "junction";
}

function isPaintBrushTool(tool: Tool): tool is "ward" | "sea" {
  return tool === "ward" || tool === "sea";
}

function targetId(event: Event, kind: "vertex" | "route-vertex" | "edge" | "face" | "group"): Id | null {
  const target = event.target instanceof Element ? event.target.closest(`[data-${kind}]`) : null;
  return target?.getAttribute(`data-${kind}`) ?? null;
}

function floatingWindow(className: string, title: string): FloatingWindow {
  const root = div(`ce-panel ${className}`);
  const titlebar = div("ce-panel-titlebar");
  titlebar.append(heading(title), text("⠿"));
  const content = div("ce-panel-content");
  root.append(titlebar, content);
  makeWindowDraggable(root, titlebar);
  return { root, content };
}

function div(className = ""): HTMLDivElement {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

function heading(value: string): HTMLHeadingElement {
  const node = document.createElement("h1");
  node.textContent = value;
  return node;
}

function text(value: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.textContent = value;
  return node;
}

function makeButton(value: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = value;
  node.addEventListener("click", onClick);
  return node;
}

function makeIconButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const node = makeButton(icon, onClick);
  node.className = "ce-icon-button";
  node.title = label;
  node.setAttribute("aria-label", label);
  return node;
}

function makeWindowDraggable(windowNode: HTMLElement, handle: HTMLElement): void {
  let startX = 0;
  let startY = 0;
  let left = 0;
  let top = 0;
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    const bounds = windowNode.getBoundingClientRect();
    startX = event.clientX;
    startY = event.clientY;
    left = bounds.left;
    top = bounds.top;
    windowNode.classList.add("ce-panel--dragging");
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", event => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    const bounds = windowNode.getBoundingClientRect();
    const nextLeft = clamp(left + event.clientX - startX, 8, Math.max(8, window.innerWidth - bounds.width - 8));
    const nextTop = clamp(top + event.clientY - startY, 8, Math.max(8, window.innerHeight - bounds.height - 8));
    windowNode.style.left = `${nextLeft}px`;
    windowNode.style.top = `${nextTop}px`;
    windowNode.style.right = "auto";
    windowNode.style.bottom = "auto";
  });
  const finish = (event: PointerEvent): void => {
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    windowNode.classList.remove("ce-panel--dragging");
  };
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
}

function numberInput(value: string, min: string, step: string): HTMLInputElement {
  const node = document.createElement("input");
  node.type = "number";
  node.value = value;
  node.min = min;
  node.step = step;
  return node;
}

function rangeInput(value: string, min: string, max: string, step: string): HTMLInputElement {
  const node = document.createElement("input");
  node.type = "range";
  node.value = value;
  node.min = min;
  node.max = max;
  node.step = step;
  return node;
}

function select(values: string[], selected: string): HTMLSelectElement {
  const node = document.createElement("select");
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value || "none";
    option.selected = value === selected;
    node.appendChild(option);
  }
  return node;
}

function label(value: string, control: HTMLElement): HTMLLabelElement {
  const node = document.createElement("label");
  node.textContent = `${value} `;
  node.appendChild(control);
  return node;
}

function divider(): HTMLHRElement {
  return document.createElement("hr");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function niceScale(targetMeters: number): number {
  const exponent = 10 ** Math.floor(Math.log10(Math.max(targetMeters, 1)));
  const normalized = targetMeters / exponent;
  const unit = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return unit * exponent;
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;
}

function formatClock(time: number): string {
  return new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function pointToSegmentDistance(point: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  const ratio = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (a[0] + ratio * dx), point[1] - (a[1] + ratio * dy));
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [x, y] = polygon[current];
    const [previousX, previousY] = polygon[previous];
    if (y > point[1] === previousY > point[1]) continue;
    const crossingX = ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
    if (point[0] < crossingX) inside = !inside;
  }
  return inside;
}

/** Whether a circular Ward brush reaches any part of a cell polygon. */
function circleIntersectsPolygon(center: Point, radius: number, polygon: Point[]): boolean {
  if (pointInPolygon(center, polygon)) return true;
  for (let index = 0; index < polygon.length; index++) {
    if (pointToSegmentDistance(center, polygon[index], polygon[(index + 1) % polygon.length]) <= radius) return true;
  }
  return false;
}

function vertexPairKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
