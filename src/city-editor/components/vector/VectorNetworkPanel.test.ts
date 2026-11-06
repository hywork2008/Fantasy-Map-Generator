import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVectorDocument, createVectorExample } from "../../generators/vector/document";
import { createInnerWall, setWallCircuit } from "../../generators/vector/editing/network";
import { curveSource } from "../../generators/vector/editing/paths";
import { VectorDocumentHistory } from "../../generators/vector/history";
import { renderVectorDocument } from "../../renderers/vector/documentSvg";
import { EditorLifetime } from "../../services/editorLifetime";
import { createVectorNetworkPanel } from "./VectorNetworkPanel";

let root: HTMLElement,
  panel: HTMLElement,
  map: HTMLElement,
  status: HTMLElement,
  scope: EditorLifetime,
  history: VectorDocumentHistory,
  ui: ReturnType<typeof createVectorNetworkPanel>;
function mount(initial = createVectorExample(), selected = "outer") {
  history = new VectorDocumentHistory(initial);
  scope = new EditorLifetime(root);
  const refresh = () => {
    map.replaceChildren(renderVectorDocument(history.document));
    ui.refresh();
  };
  ui = createVectorNetworkPanel(
    scope,
    panel,
    map,
    status,
    () => history.document,
    () => selected,
    (doc, label) => {
      history.commit(doc, label);
      refresh();
    }
  );
  refresh();
}
beforeEach(() => {
  root = document.createElement("div");
  panel = document.createElement("aside");
  map = document.createElement("main");
  status = document.createElement("output");
  root.append(panel, map, status);
  document.body.append(root);
});
afterEach(() => {
  scope?.dispose();
  root.remove();
  vi.restoreAllMocks();
});
const input = (key: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-network-field="${key}"]`)!;
const value = (key: string, value: string) => {
  const field = input(key);
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
};
const click = (key: string) => root.querySelector<HTMLButtonElement>(`[data-network-action="${key}"]`)!.click();

describe("M3 connection panel", () => {
  it("previews gate changes, cancels without history, then adopts one undoable transaction", () => {
    mount();
    value("gate", "east");
    value("targetT", "0");
    value("gateWidth", "6");
    click("previewGate");
    expect(history.index).toBe(0);
    click("cancel");
    click("adopt");
    expect(history.index).toBe(0);
    click("previewGate");
    click("adopt");
    expect(history.index).toBe(1);
    expect(history.document.connections.gates.east.widthMeters).toBe(6);
    expect(history.undo()!.connections.gates.east.widthMeters).toBe(4);
  });
  it("renders a square bridge only after adoption, and invalidates a candidate when fields change", () => {
    const doc = createVectorDocument();
    doc.paths.river = {
      id: "river",
      role: "river",
      origin: "manual",
      editPolicy: "editable",
      revision: 0,
      source: curveSource(
        [
          [-100, 0],
          [100, 0]
        ],
        "polyline",
        false
      ),
      width: { leftMeters: 10, rightMeters: 10, stations: [] }
    };
    mount(doc, "river");
    click("previewSquare");
    expect(map.querySelector("[data-network-draft]")).not.toBeNull();
    expect(map.querySelector("[data-vector-bridge]")).toBeNull();
    expect(history.index).toBe(0);
    value("landing", "3");
    click("adopt");
    expect(history.index).toBe(0);
    click("previewSquare");
    click("adopt");
    expect(history.index).toBe(1);
    expect(map.querySelector("[data-vector-bridge]")).not.toBeNull();
    value("bridge", Object.keys(history.document.connections.bridges)[0]);
    click("toggleBridgeLock");
    const fixed = history.document;
    click("deleteBridge");
    expect(history.document).toEqual(fixed);
    expect(status.textContent).not.toBe("");
  });
  it("previews and adopts a full-width route between independently registered walls", () => {
    let doc = createVectorDocument();
    doc.paths.wall = {
      id: "wall",
      role: "wall",
      origin: "manual",
      editPolicy: "editable",
      revision: 0,
      source: curveSource(
        [
          [-60, -30],
          [60, -30],
          [60, 30],
          [-60, 30]
        ],
        "polyline",
        true
      ),
      width: { leftMeters: 1, rightMeters: 1, stations: [] }
    };
    doc = setWallCircuit(doc, "wall");
    doc = createInnerWall(doc, "circuit:1", 8);
    mount(doc, "wall");
    click("previewRoute");
    expect(history.index).toBe(0);
    expect(map.querySelector("[data-network-draft]")).not.toBeNull();
    click("adopt");
    expect(history.index).toBe(1);
    expect(Object.values(history.document.connections.wallRoads)).toHaveLength(1);
    value("roadWidth", "12");
    click("previewRoute");
    click("adopt");
    expect(history.index).toBe(1);
  });
  it("does not retain handlers when the editor is disposed", () => {
    mount();
    const button = root.querySelector<HTMLButtonElement>('[data-network-action="registerCircuit"]')!;
    scope.dispose();
    button.click();
    expect(history.index).toBe(0);
  });
});
