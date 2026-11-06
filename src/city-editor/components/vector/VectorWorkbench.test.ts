import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVectorDocument } from "../../generators/vector/document";
import { VectorDocumentHistory } from "../../generators/vector/history";
import { EditorLifetime } from "../../services/editorLifetime";
import { parseVectorDocument, serializeVectorDocument } from "../../services/io/vector/documentCodec";
import { createVectorWorkbench } from "./VectorWorkbench";

let root: HTMLElement,
  panel: HTMLElement,
  map: HTMLElement,
  status: HTMLElement,
  history: VectorDocumentHistory,
  scope: EditorLifetime,
  workbench: ReturnType<typeof createVectorWorkbench>;
beforeEach(() => {
  root = document.createElement("div");
  panel = document.createElement("aside");
  map = document.createElement("main");
  status = document.createElement("output");
  root.append(panel, map, status);
  document.body.append(root);
  scope = new EditorLifetime(root);
  history = new VectorDocumentHistory(createVectorDocument());
  workbench = createVectorWorkbench(
    scope,
    panel,
    map,
    status,
    () => history.document,
    (doc, label) => {
      history.commit(doc, label);
      workbench.refresh();
    }
  );
  workbench.refresh();
  vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 400,
    width: 400,
    height: 400,
    toJSON: () => ({})
  });
});
afterEach(() => {
  scope.dispose();
  root.remove();
  vi.restoreAllMocks();
});
const field = (name: string, inspector = false) =>
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`[data-field="${name}"]`)[inspector ? 1 : 0];
const click = (action: string) => root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
const change = (name: string, value: string) => {
  const input = field(name);
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
};
const pointer = (type: string, x: number, y: number, target: Element = map) =>
  target.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
const tap = (x: number, y: number) => {
  pointer("pointerdown", x, y, map.querySelector("svg")!);
  pointer("pointerup", x, y);
};

describe("M2 workbench gestures", () => {
  it("draws and cancels polylines, then confirms a single undoable transaction with native round trip", () => {
    change("tool", "polyline");
    tap(100, 200);
    tap(250, 200);
    expect(history.index).toBe(0);
    expect(map.querySelector("[data-vector-draft]")).not.toBeNull();
    map.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(map.querySelector("[data-vector-draft]")).toBeNull();
    tap(100, 200);
    tap(250, 200);
    map.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(history.index).toBe(1);
    const path = Object.values(history.document.paths)[0];
    expect(path.source).toMatchObject({ segments: [{ from: [-100, 0], to: [50, 0] }] });
    expect(map.querySelector("[data-vector-surface]")).not.toBeNull();
    expect(parseVectorDocument(serializeVectorDocument(history.document))).toEqual(history.document);
    history.undo();
    workbench.refresh();
    expect(map.querySelector("[data-vector-path]")).toBeNull();
    history.redo();
    workbench.refresh();
    expect(map.querySelector("[data-vector-path]")).not.toBeNull();
  });
  it("draws freehand in meters and creates Bézier handles by dragging", () => {
    change("tool", "freehand");
    pointer("pointerdown", 80, 200);
    pointer("pointermove", 150, 200);
    pointer("pointermove", 220, 201);
    pointer("pointerup", 220, 201);
    expect(history.index).toBe(1);
    expect(Object.values(history.document.paths)[0].source).toMatchObject({ freehandToleranceMeters: 0.5 });
    change("tool", "bezier");
    pointer("pointerdown", 80, 100);
    pointer("pointermove", 110, 90);
    pointer("pointerup", 110, 90);
    tap(250, 100);
    click("finish");
    expect(history.index).toBe(2);
    const paths = Object.values(history.document.paths),
      bezier = paths[1];
    expect(bezier.source).toMatchObject({ segments: [{ kind: "cubic", startMode: "symmetric" }] });
    expect(map.querySelector('[data-handle="control1"]')).not.toBeNull();
  });
  it("previews and applies preset dimensions and area, edits widths and locks a path", () => {
    change("preset", "rectangle");
    click("addPreset");
    expect(history.index).toBe(1);
    field("width").value = "220";
    field("height").value = "140";
    field("radius").value = "12";
    click("preview");
    expect(history.index).toBe(1);
    click("applyPreset");
    expect(history.index).toBe(2);
    expect(Object.values(history.document.paths)[0].source).toMatchObject({
      widthMeters: 220,
      heightMeters: 140,
      cornerRadiusMeters: 12
    });
    field("area").value = "30000";
    field("ratio").value = "2";
    click("applyArea");
    expect(history.index).toBe(3);
    field("left", true).value = "4";
    click("applyWidth");
    expect(Object.values(history.document.paths)[0].width.leftMeters).toBe(4);
    click("addStation");
    expect(Object.values(history.document.paths)[0].width.stations).toHaveLength(1);
    click("lock");
    expect(map.querySelector("[data-handle]")).toBeNull();
    expect(root.querySelector('[data-action="convert"]')).toBeNull();
    click("unlock");
    click("convert");
    expect(Object.values(history.document.paths)[0].source.kind).toBe("curve");
  });
  it("previews vertex drags, cancels them and commits one history step on pointer release", () => {
    change("tool", "polyline");
    tap(100, 200);
    tap(250, 200);
    click("finish");
    change("tool", "select");
    const before = history.document,
      index = history.index;
    pointer("pointerdown", 100, 200, map.querySelector('[data-handle="from"]')!);
    pointer("pointermove", 100, 180);
    expect(history.document).toEqual(before);
    map.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(history.document).toEqual(before);
    pointer("pointerdown", 100, 200, map.querySelector('[data-handle="from"]')!);
    pointer("pointermove", 100, 180);
    pointer("pointerup", 100, 180);
    expect(history.index).toBe(index + 1);
    expect(history.document).not.toEqual(before);
    expect(history.undo()).toEqual(before);
  });
  it("rejects self intersections without changing the saved document, and cleans up after disposal", () => {
    change("tool", "polyline");
    tap(100, 100);
    tap(300, 300);
    tap(100, 300);
    tap(300, 100);
    click("finish");
    expect(history.index).toBe(0);
    expect(status.textContent).not.toBe("");
    expect(map.querySelector("[data-vector-draft]")).not.toBeNull();
    const stale = root.querySelector<HTMLButtonElement>('[data-action="addPreset"]')!;
    scope.dispose();
    stale.click();
    expect(history.index).toBe(0);
  });
});
