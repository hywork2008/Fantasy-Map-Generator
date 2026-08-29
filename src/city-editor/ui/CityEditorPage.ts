import { createDocument, parseDocument } from "../core/document";
import {
  addElement,
  appendEdge,
  appendRiverVertex,
  createGroup,
  finishRiver,
  removeEdgeFromGroup,
  removeGroup
} from "../core/features";
import { DocumentHistory } from "../core/history";
import {
  clone,
  faceNeighbors,
  faceVertices,
  mergeFaces,
  moveVertex,
  scaleDocument,
  setFaceElevation,
  setFaceWater,
  splitFace,
  validate
} from "../core/mesh";
import type { CityDocument, ElementKind, Id, Tool, WardKind, WaterKind } from "../core/types";
import { type RenderSelection, renderEditorSvg } from "../render/svg";

const TOOLS: Array<[Tool, string]> = [
  ["select", "Select"],
  ["vertex", "Vertex"],
  ["road", "Road"],
  ["wall", "Wall"],
  ["river", "River"],
  ["face", "Face"]
];

export function mountCityEditor(root: HTMLElement): void {
  let documentState = createDocument();
  let history = new DocumentHistory(documentState);
  let tool: Tool = "select";
  let selection: RenderSelection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
  let activeGroupId: Id | null = null;
  let dragBefore: CityDocument | null = null;
  let isDragging = false;
  let halfView = documentState.frame.extentMeters / 2;

  const canvas = div("ce-canvas");
  const map = div("ce-map");
  canvas.appendChild(map);
  const toolbar = panel("ce-toolbar", "Tools");
  const inspector = panel("ce-inspector", "Inspector");
  const groups = panel("ce-groups", "Groups");
  const status = document.createElement("output");
  status.className = "ce-status";
  root.replaceChildren(canvas, toolbar, inspector, groups, status);

  const toolButtons = new Map<Tool, HTMLButtonElement>();
  for (const [id, label] of TOOLS) {
    const button = makeButton(label, () => {
      tool = id;
      refresh();
    });
    toolButtons.set(id, button);
    toolbar.appendChild(button);
  }
  const newButton = makeButton("New grid", () => {
    documentState = createDocument();
    history = new DocumentHistory(documentState);
    selection = emptySelection();
    activeGroupId = null;
    halfView = documentState.frame.extentMeters / 2;
    refresh();
  });
  const undoButton = makeButton("Undo", () => restore(history.undo(documentState)));
  const redoButton = makeButton("Redo", () => restore(history.redo(documentState)));
  const exportButton = makeButton("Export JSON", () => download(documentState));
  const importButton = makeButton("Import JSON", () => void importDocument());
  const scaleInput = numberInput("1", "0.1", "0.1");
  const scaleButton = makeButton("Scale all", () => {
    const next = scaleDocument(documentState, Number(scaleInput.value));
    if (next) commit(next);
  });
  const finishButton = makeButton("Finish river", () => {
    if (!activeGroupId) return;
    const next = finishRiver(documentState, activeGroupId);
    if (next) commit(next);
  });
  toolbar.append(
    divider(),
    newButton,
    undoButton,
    redoButton,
    exportButton,
    importButton,
    label("Scale", scaleInput),
    scaleButton,
    finishButton
  );

  map.addEventListener("pointerdown", event => {
    const vertexId = targetId(event, "vertex");
    if (tool !== "vertex" || !vertexId) return;
    event.preventDefault();
    dragBefore = clone(documentState);
    isDragging = true;
    selection.vertexId = vertexId;
    map.setPointerCapture(event.pointerId);
  });
  map.addEventListener("pointermove", event => {
    if (!isDragging || !selection.vertexId) return;
    const point = localPoint(event);
    const next = moveVertex(documentState, selection.vertexId, point);
    if (!next) return;
    documentState = next;
    redrawMap();
  });
  const finishDrag = (event: PointerEvent): void => {
    if (!isDragging) return;
    isDragging = false;
    if (map.hasPointerCapture(event.pointerId)) map.releasePointerCapture(event.pointerId);
    if (dragBefore && JSON.stringify(dragBefore) !== JSON.stringify(documentState)) history.commit(documentState);
    dragBefore = null;
    refresh();
  };
  map.addEventListener("pointerup", finishDrag);
  map.addEventListener("pointercancel", finishDrag);
  map.addEventListener("click", event => {
    if (isDragging) return;
    const vertexId = targetId(event, "vertex");
    const edgeId = targetId(event, "edge");
    const faceId = targetId(event, "face");
    const groupId = targetId(event, "group");
    if (groupId) {
      selection.groupId = groupId;
      activeGroupId = groupId;
      refresh();
      return;
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
  map.addEventListener(
    "wheel",
    event => {
      event.preventDefault();
      halfView = clamp(
        halfView * Math.exp(event.deltaY * 0.0012),
        documentState.frame.extentMeters / 12,
        documentState.frame.extentMeters * 1.5
      );
      redrawMap();
    },
    { passive: false }
  );
  window.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      restore(event.shiftKey ? history.redo(documentState) : history.undo(documentState));
    }
    if (event.key === "Enter") finishButton.click();
    if (event.key === "Escape") activeGroupId = null;
  });

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
    refresh();
  }

  function restore(next: CityDocument | null): void {
    if (!next) return;
    documentState = next;
    selection = emptySelection();
    activeGroupId = null;
    refresh();
  }

  function refresh(): void {
    redrawMap();
    for (const [id, button] of toolButtons) button.classList.toggle("is-active", id === tool);
    undoButton.disabled = !history.canUndo;
    redoButton.disabled = !history.canRedo;
    renderInspector();
    renderGroups();
    const errors = validate(documentState);
    status.textContent = `${Object.keys(documentState.mesh.faces).length} cells · ${documentState.featureGroups.length} groups${errors.length ? ` · ${errors.join(", ")}` : " · valid"}`;
  }

  function redrawMap(): void {
    const box = `${-halfView} ${-halfView} ${halfView * 2} ${halfView * 2}`;
    map.replaceChildren(renderEditorSvg(documentState, tool, selection, box));
  }

  function renderInspector(): void {
    inspector.replaceChildren(heading("Inspector"));
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
        refresh();
      });
      choose.classList.toggle("is-active", group.id === activeGroupId);
      row.append(
        choose,
        text(group.kind === "river" ? `${group.vertices.length} vertices` : `${group.segments.length} edges`)
      );
      row.appendChild(makeButton("×", () => commit(removeGroup(documentState, group.id))));
      groups.appendChild(row);
    }
  }

  function localPoint(event: PointerEvent): [number, number] {
    const svg = map.querySelector("svg");
    if (!svg) return [0, 0];
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM()?.inverse());
    return [point.x, -point.y];
  }

  async function importDocument(): Promise<void> {
    const text = await readFile();
    if (!text) return;
    const parsed = parseDocument(text);
    if (!parsed) {
      status.textContent = "Invalid City Editor JSON";
      return;
    }
    documentState = parsed;
    history = new DocumentHistory(parsed);
    selection = emptySelection();
    activeGroupId = null;
    halfView = parsed.frame.extentMeters / 2;
    refresh();
  }
}

function emptySelection(): RenderSelection {
  return { faceId: null, edgeId: null, vertexId: null, groupId: null };
}

function targetId(event: Event, kind: "vertex" | "edge" | "face" | "group"): Id | null {
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

function download(documentState: CityDocument): void {
  const blob = new Blob([JSON.stringify(documentState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "city.fmg-city-editor.json";
  link.click();
  URL.revokeObjectURL(url);
}

function readFile(): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(typeof reader.result === "string" ? reader.result : null));
      reader.addEventListener("error", () => resolve(null));
      reader.readAsText(file);
    });
    input.click();
  });
}
