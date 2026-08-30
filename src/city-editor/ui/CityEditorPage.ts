import { CITY_SIZE_PRESETS, type CitySizePreset, createSizedDocument } from "../core/document";
import type { FaceRoutePreview } from "../core/features";
import {
  addElement,
  appendEdge,
  appendRiverVertex,
  createGroup,
  featureGroupVertices,
  finishRiver,
  groupUsesEdge,
  previewRouteAcrossFace,
  removeEdgeFromGroup,
  removeGroup,
  rerouteGroupAcrossFace,
  smoothFeatureGroup,
  smoothFeatureGroups
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
  scaleDocument,
  setFaceElevation,
  setFaceWater,
  splitFace,
  validate
} from "../core/mesh";
import type { CityDocument, ElementKind, FeatureGroup, Id, Point, Tool, WardKind, WaterKind } from "../core/types";
import { exportCityMap, type ImportedCityMap, pickCityMap, readCityMap } from "../io/cityEditorFile";
import { type RenderSelection, renderEditorSvg, renderRoutePreview } from "../render/svg";

const TOOLS: Array<[Tool, string]> = [
  ["select", "Select"],
  ["vertex", "Vertex"],
  ["road", "Road"],
  ["wall", "Wall"],
  ["river", "River"],
  ["ward", "Ward"],
  ["face", "Face"]
];

interface ContextMenuAction {
  label: string;
  run: () => void;
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
}

export function mountCityEditor(root: HTMLElement): void {
  let documentState = createSizedDocument("small");
  let history = new DocumentHistory(documentState);
  let tool: Tool = "select";
  let selection: RenderSelection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
  let activeGroupId: Id | null = null;
  let dragBefore: CityDocument | null = null;
  let isVertexDragging = false;
  let isWardPainting = false;
  let wardPaintChanged = false;
  let paintedWardFaceIds = new Set<Id>();
  let routeDrag: { groupId: Id; edgeId: Id; startX: number; startY: number; moved: boolean } | null = null;
  let routeStroke: RouteStroke | null = null;
  let routePreview: FaceRoutePreview | null = null;
  let routePreviewFaceId: Id | null = null;
  let isPanning = false;
  let isSpacePressed = false;
  let showSelectionLabels = false;
  let wardBrush: WardKind | null = "market";
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
  let faceBucketSize = documentState.frame.blockSizeMeters * 2;

  const canvas = div("ce-canvas");
  const map = div("ce-map");
  canvas.appendChild(map);
  const toolbar = panel("ce-toolbar", "Tools");
  const inspector = panel("ce-inspector", "Inspector");
  const groups = panel("ce-groups", "Groups");
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
  root.replaceChildren(canvas, toolbar, inspector, groups, status, scaleBar, contextMenu);
  contextMenu.addEventListener("pointerdown", event => event.stopPropagation());
  contextMenu.addEventListener("contextmenu", event => event.preventDefault());

  const toolButtons = new Map<Tool, HTMLButtonElement>();
  for (const [id, label] of TOOLS) {
    const button = makeButton(label, () => {
      tool = id;
      refresh();
    });
    toolButtons.set(id, button);
    toolbar.appendChild(button);
  }
  const size = select(Object.keys(CITY_SIZE_PRESETS), "small");
  for (const option of [...size.options]) {
    const preset = CITY_SIZE_PRESETS[option.value as CitySizePreset];
    option.textContent = `${preset.label} · ${preset.extentMeters / 1000} km · ${preset.cellsAcross}×${preset.cellsAcross} · ~${preset.buildingTarget} buildings`;
  }
  const newButton = makeButton("Generate grid", () => {
    documentState = createSizedDocument(size.value as CitySizePreset);
    history = new DocumentHistory(documentState);
    selection = emptySelection();
    activeGroupId = null;
    halfView = documentState.frame.extentMeters / 2;
    viewCenter = [0, 0];
    rebuildEditorIndexes();
    refresh();
  });
  const sizeLabel = label("Map size", size);
  sizeLabel.className = "ce-size-choice";
  const undoButton = makeButton("Undo", () => restore(history.undo(documentState)));
  const redoButton = makeButton("Redo", () => restore(history.redo(documentState)));
  const exportButton = makeButton("Export map", () => {
    exportCityMap(documentState);
    showNotice("Map exported");
  });
  const importButton = makeButton("Import map", () => void importDocument());
  const scaleInput = numberInput("1", "0.1", "0.1");
  const showLabelsInput = document.createElement("input");
  showLabelsInput.type = "checkbox";
  showLabelsInput.addEventListener("change", () => {
    showSelectionLabels = showLabelsInput.checked;
    redrawMap();
  });
  const wardBrushInput = select(
    ["market", "castle", "merchant", "craftsmen", "harbor", "park", "empty", "erase"],
    "market"
  );
  wardBrushInput.addEventListener("change", () => {
    wardBrush = wardBrushInput.value === "erase" ? null : (wardBrushInput.value as WardKind);
  });
  const scaleButton = makeButton("Scale all", () => {
    const factor = Number(scaleInput.value);
    const next = scaleDocument(documentState, factor);
    if (next) {
      halfView *= factor;
      commit(next);
    }
  });
  const finishButton = makeButton("Finish river", () => {
    if (!activeGroupId) return;
    const next = finishRiver(documentState, activeGroupId);
    if (next) commit(next);
  });
  const smoothingModeInput = select(["safe", "include loops & shared"], "safe");
  const smoothGroupsButton = makeButton("Smooth groups", () => {
    const mode = smoothingModeInput.value === "include loops & shared" ? "includeSharedAndLoops" : "safe";
    const next = smoothFeatureGroups(documentState, mode);
    if (next) commit(next);
    else showNotice("No movable River, Road, or Wall vertices to smooth");
  });
  toolbar.append(
    divider(),
    sizeLabel,
    newButton,
    undoButton,
    redoButton,
    exportButton,
    importButton,
    label("Scale", scaleInput),
    scaleButton,
    label("Show cell IDs", showLabelsInput),
    label("Ward brush", wardBrushInput),
    finishButton,
    label("Smoothing", smoothingModeInput),
    smoothGroupsButton
  );

  map.addEventListener("pointerdown", event => {
    hideContextMenu();
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
    if (tool === "ward") {
      const faceId = faceAtPoint(point);
      if (!faceId) return;
      event.preventDefault();
      isWardPainting = true;
      wardPaintChanged = false;
      paintedWardFaceIds = new Set();
      paintWardFace(faceId);
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
          changed: false
        };
        suppressNextClick = true;
        map.setPointerCapture(event.pointerId);
        return;
      }
    }
    const vertexId = targetId(event, "vertex") ?? (tool === "select" ? closestVertexId(point) : null);
    if (vertexId && tool === "select") {
      event.preventDefault();
      dragBefore = clone(documentState);
      isVertexDragging = true;
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
    if (isWardPainting) {
      const faceId = faceAtPoint(localPoint(event));
      if (faceId) paintWardFace(faceId);
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
      redrawMap();
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
    redrawMap();
  });
  const finishDrag = (event: PointerEvent): void => {
    if (!isVertexDragging && !isWardPainting && !isPanning && !routeDrag && !routeStroke) return;
    const wasVertexDragging = isVertexDragging;
    const wasWardPainting = isWardPainting;
    const stroke = routeStroke;
    const draggedRoute = routeDrag;
    const preview = routePreview;
    const previewFaceId = routePreviewFaceId;
    isVertexDragging = false;
    isWardPainting = false;
    routeStroke = null;
    routeDrag = null;
    routePreview = null;
    routePreviewFaceId = null;
    updateRoutePreview();
    isPanning = false;
    hasPanned = false;
    map.classList.remove("ce-map--panning");
    if (map.hasPointerCapture(event.pointerId)) map.releasePointerCapture(event.pointerId);
    if (wasVertexDragging && dragBefore && JSON.stringify(dragBefore) !== JSON.stringify(documentState)) {
      history.commit(documentState);
      rebuildEditorIndexes();
    }
    if (wasWardPainting && wardPaintChanged) {
      history.commit(documentState);
      rebuildEditorIndexes();
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
        if (next) commit(next);
      }
      selection.vertexId = null;
      selection.edgeId = null;
    }
    if (event.type === "pointercancel") suppressNextClick = false;
    if (wasVertexDragging || wasWardPainting || stroke) refresh();
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
        if (next) commit(next);
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
    const faceId = targetId(event, "face");
    const vertexId = targetId(event, "vertex");
    const edgeId = targetId(event, "edge");
    const groupId = targetId(event, "group");
    const actions: ContextMenuAction[] = [];

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
          })
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
        run: () => runContextAction(() => mergeFaces(documentState, selection.faceId as Id, faceId))
      });
    }

    if (vertexId && selection.vertexId && vertexId !== selection.vertexId) {
      if (edgeBetween(documentState.mesh, selection.vertexId, vertexId)) {
        actions.push({
          label: `Merge ${vertexId} into ${selection.vertexId}`,
          run: () => runContextAction(() => mergeVertices(documentState, selection.vertexId as Id, vertexId))
        });
      } else {
        for (const face of Object.values(documentState.mesh.faces)) {
          const vertices = faceVertices(documentState.mesh, face);
          if (!vertices.includes(selection.vertexId) || !vertices.includes(vertexId)) continue;
          actions.push({
            label: `Split ${face.id} from ${selection.vertexId} to ${vertexId}`,
            run: () => runContextAction(() => splitFace(documentState, face.id, selection.vertexId as Id, vertexId))
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
      redrawMap();
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
      commit(appended);
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
      commit(appended);
    }
  }

  function commit(next: CityDocument): void {
    documentState = history.commit(next);
    rebuildEditorIndexes();
    refresh();
  }

  function runContextAction(operation: () => CityDocument | null): void {
    const next = operation();
    hideContextMenu();
    if (next) {
      commit(next);
      return;
    }
    showNotice("This operation cannot be applied to the selected geometry");
  }

  function showContextMenu(event: MouseEvent, actions: ContextMenuAction[]): void {
    contextMenu.replaceChildren();
    if (actions.length) {
      for (const action of actions) contextMenu.appendChild(makeButton(action.label, action.run));
    } else {
      contextMenu.appendChild(text("No action available here"));
    }
    closeContextMenuOnPointerMove = actions.length === 0;
    contextMenu.hidden = false;
    contextMenu.style.left = `${event.clientX}px`;
    contextMenu.style.top = `${event.clientY}px`;
    const bounds = contextMenu.getBoundingClientRect();
    contextMenu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - bounds.width - 8))}px`;
    contextMenu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - bounds.height - 8))}px`;
  }

  function hideContextMenu(): void {
    contextMenu.hidden = true;
    closeContextMenuOnPointerMove = false;
  }

  function restore(next: CityDocument | null): void {
    if (!next) return;
    documentState = next;
    rebuildEditorIndexes();
    selection = emptySelection();
    activeGroupId = null;
    refresh();
  }

  function refresh(): void {
    redrawMap();
    for (const [id, button] of toolButtons) button.classList.toggle("is-active", id === tool);
    undoButton.disabled = !history.canUndo;
    redoButton.disabled = !history.canRedo;
    wardBrushInput.disabled = tool !== "ward";
    renderInspector();
    renderGroups();
    const errors = validate(documentState);
    status.textContent = `${Object.keys(documentState.mesh.faces).length} blocks · ${documentState.featureGroups.length} groups${errors.length ? ` · ${errors.join(", ")}` : " · valid"}${notice ? ` · ${notice}` : ""}`;
    refreshScaleBar();
  }

  function redrawMap(): void {
    const box = `${viewCenter[0] - halfView} ${-viewCenter[1] - halfView} ${halfView * 2} ${halfView * 2}`;
    map.replaceChildren(renderEditorSvg(documentState, tool, selection, box, zoomFactor(), showSelectionLabels));
    updateRoutePreview();
  }

  function updateRoutePreview(): void {
    const layer = map.querySelector<SVGGElement>(".ce-route-preview-layer");
    if (!layer) return;
    layer.replaceChildren();
    if (!routePreview) return;
    const path = renderRoutePreview(documentState, routePreview.group, routePreview.replacementVertices);
    if (path) layer.appendChild(path);
  }

  function refreshScaleBar(): void {
    const width = map.getBoundingClientRect().width;
    if (width <= 0) return;
    const metersPerPixel = (halfView * 2) / width;
    const meters = niceScale(metersPerPixel * 120);
    scaleLine.style.width = `${meters / metersPerPixel}px`;
    const blockCount = Math.max(1, Math.round(meters / documentState.frame.blockSizeMeters));
    scaleLabel.textContent = `×${zoomFactor().toFixed(1)} · ${formatDistance(meters)} · ≈ ${blockCount} block${blockCount === 1 ? "" : "s"} (1 cell ≈ ${formatDistance(documentState.frame.blockSizeMeters)})`;
  }

  function zoomFactor(): number {
    return documentState.frame.extentMeters / 2 / halfView;
  }

  function renderInspector(): void {
    inspector.replaceChildren(heading("Inspector"));
    if (activeGroupId) {
      const group = documentState.featureGroups.find(candidate => candidate.id === activeGroupId);
      if (group) {
        inspector.appendChild(
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
        inspector.append(
          text(`Selected edge ${selection.edgeId} in ${group.name}`),
          makeButton("Delete selected edge", () => {
            const next = removeEdgeFromGroup(documentState, group.id, selection.edgeId as Id);
            if (next) {
              selection.edgeId = null;
              commit(next);
            }
          })
        );
        return;
      }
    }
    if (!selection.faceId) {
      inspector.appendChild(text("Select a cell to set water, a ward, or an urban element."));
      return;
    }
    const face = documentState.mesh.faces[selection.faceId];
    if (!face) return;
    const water = select(["land", "sea", "lake", "openWater"], face.properties.water);
    water.addEventListener("change", () => commit(setFaceWater(documentState, face.id, water.value as WaterKind)));
    const elevation = numberInput(String(face.properties.elevation), "-1000", "1");
    elevation.addEventListener("change", () =>
      commit(setFaceElevation(documentState, face.id, Number(elevation.value)))
    );
    const ward = select(
      ["", "market", "castle", "merchant", "craftsmen", "harbor", "park", "empty"],
      face.properties.ward ?? ""
    );
    ward.addEventListener("change", () => {
      const next = clone(documentState);
      next.mesh.faces[face.id].properties.ward = (ward.value || null) as WardKind | null;
      commit(next);
    });
    const elementKind = select(["plaza", "citadel", "temple", "harbor", "gate", "tower"], "plaza");
    const vertices = faceVertices(documentState.mesh, face);
    const splitFrom = select(vertices, vertices[0]);
    const splitTo = select(vertices, vertices[Math.floor(vertices.length / 2)]);
    const neighbors = faceNeighbors(documentState.mesh, face.id);
    const mergeWith = select(neighbors, neighbors[0] ?? "");
    inspector.append(
      label("Elevation", elevation),
      label("Water", water),
      label("Ward", ward),
      label("Element", elementKind),
      makeButton("Add element", () => commit(addElement(documentState, elementKind.value as ElementKind, face.id))),
      divider(),
      label("Split from", splitFrom),
      label("Split to", splitTo),
      makeButton("Split cell", () => {
        const next = splitFace(documentState, face.id, splitFrom.value, splitTo.value);
        if (next) commit(next);
      }),
      label("Merge with", mergeWith),
      makeButton("Merge cell", () => {
        if (!mergeWith.value) return;
        const next = mergeFaces(documentState, face.id, mergeWith.value);
        if (next) commit(next);
      })
    );
  }

  function renderGroups(): void {
    groups.replaceChildren(heading("Groups"));
    for (const group of documentState.featureGroups) {
      const row = div("ce-group-row");
      const choose = makeButton(group.name, () => {
        activeGroupId = group.id;
        selection.groupId = group.id;
        tool = "select";
        refresh();
      });
      choose.classList.toggle("is-active", group.id === activeGroupId);
      row.append(
        choose,
        text(group.kind === "river" ? `${group.vertices.length} vertices` : `${group.segments.length} edges`)
      );
      const smooth = makeButton("Smooth", () => {
        const next = smoothFeatureGroup(documentState, group.id);
        if (next) commit(next);
        else showNotice(`${group.name} has no movable vertices to smooth`);
      });
      smooth.disabled = group.locked || (group.kind !== "river" && group.kind !== "road" && group.kind !== "wall");
      smooth.title = "Smooth this group, including its shared vertices and closed loops";
      row.appendChild(smooth);
      row.appendChild(
        makeButton("×", () => {
          if (activeGroupId === group.id) {
            activeGroupId = null;
            selection.groupId = null;
          }
          commit(removeGroup(documentState, group.id));
        })
      );
      groups.appendChild(row);
    }
    if (activeGroupId)
      groups.appendChild(
        text(
          "In Select mode, left-drag a highlighted route edge through a cell to preview and replace that boundary span."
        )
      );
  }

  function localPoint(event: PointerEvent): [number, number] {
    return localPointAt(event.clientX, event.clientY);
  }

  function closestVertexId(point: [number, number]): Id | null {
    // Accept a roughly 12 px drop target regardless of the current zoom.
    const radius = (halfView * 24) / Math.max(map.getBoundingClientRect().width, 1);
    let nearest: Id | null = null;
    let nearestDistance = radius;
    for (const vertex of Object.values(documentState.mesh.vertices)) {
      const distance = Math.hypot(vertex.point[0] - point[0], vertex.point[1] - point[1]);
      if (distance <= nearestDistance) {
        nearest = vertex.id;
        nearestDistance = distance;
      }
    }
    return nearest;
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
  }

  function faceAtPoint(point: Point): Id | null {
    const key = `${Math.floor(point[0] / faceBucketSize)},${Math.floor(point[1] / faceBucketSize)}`;
    for (const faceId of faceBuckets.get(key) ?? []) {
      const face = documentState.mesh.faces[faceId];
      if (face && pointInPolygon(point, facePoints(documentState.mesh, face))) return face.id;
    }
    return null;
  }

  function updateHover(event: PointerEvent): void {
    const point = localPoint(event);
    const route = routeAtEvent(event, point, false);
    const vertexId = tool === "select" ? closestVertexId(point) : null;
    if (selection.hoverGroupId === route?.groupId && selection.hoverVertexId === vertexId) return;
    selection.hoverGroupId = route?.groupId ?? null;
    selection.hoverVertexId = vertexId;
    redrawMap();
  }

  function paintWardFace(faceId: Id): void {
    if (paintedWardFaceIds.has(faceId)) return;
    paintedWardFaceIds.add(faceId);
    const face = documentState.mesh.faces[faceId];
    if (!face || face.properties.ward === wardBrush) return;
    const next = clone(documentState);
    next.mesh.faces[faceId].properties.ward = wardBrush;
    documentState = next;
    wardPaintChanged = true;
    redrawMap();
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
        commitRouteStrokeStep();
      }
    }
    stroke.lastPoint = point;
    if (stroke.changed) redrawMap();
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
      commitRouteStrokeStep();
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
    commitRouteStrokeStep();
  }

  function finishRouteStroke(stroke: RouteStroke, point: Point): void {
    if (!stroke.initialized) initializeRouteStroke(stroke, point);
  }

  function commitRouteStrokeStep(): void {
    history.commit(documentState);
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
    documentState = parsed.document;
    history = new DocumentHistory(parsed.document);
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
  return { faceId: null, edgeId: null, vertexId: null, groupId: null, hoverGroupId: null, hoverVertexId: null };
}

function isRoutePaintTool(tool: Tool): tool is RoutePaintKind {
  return tool === "river" || tool === "road" || tool === "wall";
}

function targetId(event: Event, kind: "vertex" | "route-vertex" | "edge" | "face" | "group"): Id | null {
  const target = event.target instanceof Element ? event.target.closest(`[data-${kind}]`) : null;
  return target?.getAttribute(`data-${kind}`) ?? null;
}

function panel(className: string, title: string): HTMLDivElement {
  const panel = div(`ce-panel ${className}`);
  panel.appendChild(heading(title));
  return panel;
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

function numberInput(value: string, min: string, step: string): HTMLInputElement {
  const node = document.createElement("input");
  node.type = "number";
  node.value = value;
  node.min = min;
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

function vertexPairKey(a: Id, b: Id): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
