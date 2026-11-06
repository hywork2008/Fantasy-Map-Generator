import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../data/fixtures/gothengsfeld-20261012.json";
import { createVectorDocument } from "../../generators/vector/document";
import { syntheticVectorInput } from "../../generators/vector/generation/input";
import { VectorDocumentHistory } from "../../generators/vector/history";
import { renderVectorDocument } from "../../renderers/vector/documentSvg";
import { EditorLifetime } from "../../services/editorLifetime";
import type { BurgSiteDescriptor } from "../../types/contracts/burgSiteDescriptor";
import { createVectorGenerationPanel } from "./VectorGenerationPanel";

let root: HTMLElement,
  panel: HTMLElement,
  map: HTMLElement,
  scope: EditorLifetime,
  history: VectorDocumentHistory,
  ui: ReturnType<typeof createVectorGenerationPanel>;
function mount(initial = createVectorDocument(), linked?: BurgSiteDescriptor) {
  history = new VectorDocumentHistory(initial);
  scope = new EditorLifetime(root);
  const refresh = () => {
    map.replaceChildren(renderVectorDocument(history.document));
    ui.refresh();
  };
  ui = createVectorGenerationPanel(
    scope,
    panel,
    map,
    () => history.document,
    (doc, label) => {
      history.commit(doc, label);
      refresh();
    },
    () => map.replaceChildren(renderVectorDocument(history.document)),
    linked
  );
  refresh();
}
beforeEach(() => {
  root = document.createElement("div");
  panel = document.createElement("aside");
  map = document.createElement("main");
  root.append(panel, map);
  document.body.append(root);
});
afterEach(() => {
  scope.dispose();
  root.remove();
  vi.restoreAllMocks();
});
const click = (key: string) => root.querySelector<HTMLButtonElement>(`[data-generation-action="${key}"]`)!.click();
const field = (key: string) =>
  root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-generation-field="${key}"]`)!;
const fill = (key: string, value: string) => {
  field(key).value = value;
  field(key).dispatchEvent(new Event("input", { bubbles: true }));
};

describe("M4 input, generation and adopted stages", () => {
  it("previews input and generation without changing saved history, then adopts one transaction per operation", () => {
    mount();
    click("synthetic");
    expect(history.index).toBe(0);
    expect(map.querySelectorAll("[data-vector-path]").length).toBeGreaterThan(0);
    click("cancel");
    expect(map.querySelector("[data-vector-path]")).toBeNull();
    click("synthetic");
    click("adopt");
    expect(history.index).toBe(1);
    expect(history.document.site?.kind).toBe("synthetic");
    click("generate");
    expect(history.index).toBe(1);
    expect(map.querySelector("[data-vector-block]")).not.toBeNull();
    field("stage").value = "inputs";
    field("stage").dispatchEvent(new Event("change"));
    expect(map.querySelector("[data-vector-block]")).toBeNull();
    click("adopt");
    expect(history.index).toBe(2);
    expect(history.document.generation?.blocks.length).toBeGreaterThan(0);
    expect(history.undo()!.generation).toBeUndefined();
    expect(history.redo()!.generation).toBeDefined();
  });
  it("retains linked FMG geometry on a dedicated input path and invalidates a candidate when settings change", () => {
    mount(createVectorDocument(), fixture.descriptor as unknown as BurgSiteDescriptor);
    click("linked");
    expect(history.index).toBe(0);
    expect(map.querySelector("[data-vector-surveyed-water]")).not.toBeNull();
    fill("seed", "changed");
    click("adopt");
    expect(history.index).toBe(0);
    click("linked");
    click("adopt");
    expect(history.document.site!.crossings[0].id).toBe(113);
    expect(history.document.site!.descriptor).toEqual(fixture.descriptor);
  });
  it("ignores a stale FMG file read after another history transaction or disposal", async () => {
    mount();
    const deferred = Promise.withResolvers<string>(),
      file = new File([""], "fmg.json");
    vi.spyOn(file, "text").mockReturnValue(deferred.promise);
    const input = root.querySelector<HTMLInputElement>(".ce-vector-source-file")!;
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change"));
    history.commit(syntheticVectorInput("current"));
    ui.refresh();
    deferred.resolve(JSON.stringify(fixture));
    await deferred.promise;
    await Promise.resolve();
    expect(history.document.recipe.seed).toBe("current");
    expect(history.document.site!.kind).toBe("synthetic");
    const stale = root.querySelector<HTMLButtonElement>('[data-generation-action="generate"]')!;
    scope.dispose();
    stale.click();
    expect(history.index).toBe(1);
  });
  it("shows blocked input errors without adopting partial output", () => {
    mount();
    click("generate");
    expect(history.index).toBe(0);
    expect(root.querySelector(".ce-vector-generation-status")!.textContent).not.toBe("");
    expect(root.querySelector<HTMLButtonElement>('[data-generation-action="adopt"]')!.disabled).toBe(true);
  });
});

describe("M5 adopted urban checkpoints", () => {
  it("previews, cancels and adopts one urban transaction with dynamic stages", () => {
    mount();
    click("synthetic");
    click("adopt");
    click("generate");
    click("adopt");
    fill("population", "500");
    fill("maxLanes", "4");
    const index = history.index;
    click("develop");
    expect(history.index).toBe(index);
    expect(map.querySelector('[data-vector-building-kind="housing"]')).not.toBeNull();
    field("stage").value = "facilities";
    field("stage").dispatchEvent(new Event("change"));
    expect(map.querySelector('[data-vector-building-kind="housing"]')).toBeNull();
    expect(map.querySelector('[data-vector-building-kind="facility"]')).not.toBeNull();
    expect(root.querySelector(".ce-vector-generation-status")!.textContent).toContain("13 / 112");
    click("cancel");
    expect(map.querySelector("[data-vector-placement]")).toBeNull();
    click("develop");
    click("adopt");
    expect(history.index).toBe(index + 1);
    expect(history.document.urban).toBeDefined();
    expect(field("stage").querySelectorAll("option")).toHaveLength(6);
    history.undo();
    ui.refresh();
    expect(history.document.urban).toBeUndefined();
    history.redo();
    ui.refresh();
    expect(history.document.urban).toBeDefined();
    fill("mode", "medieval");
    click("develop");
    click("adopt");
    expect(history.document.urban!.report.placedFacilities).toBe(0);
    expect(field("stage").querySelectorAll("option")).toHaveLength(5);
  });
});
