import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../data/fixtures/gothengsfeld-20261012.json";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { defaultPopulationSettings } from "../../generators/populationPlan";
import { createVectorDocument } from "../../generators/vector/document";
import type { VectorEditorGenerationInput } from "../../generators/vector/generation/editorInput";
import { syntheticVectorInput } from "../../generators/vector/generation/input";
import { generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { generateVectorUrban } from "../../generators/vector/generation/urban";
import { VectorDocumentHistory } from "../../generators/vector/history";
import { renderVectorDocument } from "../../renderers/vector/documentSvg";
import { EditorLifetime } from "../../services/editorLifetime";
import type { startVectorGeneration } from "../../services/vectorGenerationWorkerClient";
import type { BurgSiteDescriptor } from "../../types/contracts/burgSiteDescriptor";
import { createVectorGenerationPanel } from "./VectorGenerationPanel";

let startOverride: typeof startVectorGeneration | undefined;
let root: HTMLElement,
  panel: HTMLElement,
  map: HTMLElement,
  scope: EditorLifetime,
  history: VectorDocumentHistory,
  ui: ReturnType<typeof createVectorGenerationPanel>;
function mount(
  initial = createVectorDocument(),
  linked?: BurgSiteDescriptor,
  editorInput?: VectorEditorGenerationInput
) {
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
    linked,
    undefined,
    startOverride ??
      ((source, task) => ({
        result: Promise.resolve().then(() =>
          task.kind === "city"
            ? {
                document: generateVectorUrban(generateVectorSkeleton(source, task.settings).document, task.urban),
                stages: []
              }
            : task.kind === "skeleton"
              ? generateVectorSkeleton(source, task.settings)
              : { document: generateVectorUrban(source, task.settings), stages: [] }
        ),
        cancel: vi.fn()
      })),
    () => history.currentEntryKey,
    editorInput
  );
  refresh();
}
beforeEach(() => {
  startOverride = undefined;
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
  it("generates and commits a default CE city with one action, retaining a typed seed and population", async () => {
    const settings = {
      ...defaultGenerationSettings(),
      population: defaultPopulationSettings(),
      historicalPeriod: "ageOfExploration" as const
    };
    mount(createVectorDocument(), undefined, {
      seed: "b5o620",
      settings,
      frame: { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 }
    });
    expect(field("seed").value).toBe("b5o620");
    expect(field("population").value).toBe("5000");
    // A typed seed is reproduced; an untouched seed is redrawn on every press (see the next case).
    fill("seed", "b5o620");
    click("city");
    await vi.waitFor(() => expect(history.index).toBe(1), { timeout: 60000 });
    const generated = history.document;
    expect(generated.format).toBe("fmg-vector-city");
    expect(generated.recipe.seed).toBe("b5o620");
    expect(generated.context.historicalPeriod).toBe("ageOfExploration");
    expect(generated.urban?.report.targetPopulation).toBe(5000);
    expect(generated.urban?.settings.mode).toBe("medieval");
    expect(generated.urban?.report.requiredFacilities).toBe(0);
    expect(generated.urban?.report.unplacedPopulation).toBe(0);
    expect(Object.keys(generated.paths).length).toBeGreaterThan(4);
    // Generated houses are fabric records (native v8), drawn as housing buildings.
    expect(generated.urban!.report.housingBuildings).toBeGreaterThan(0);
    expect(Object.keys(generated.fabric?.cells ?? {}).length).toBeGreaterThan(0);
    expect(map.querySelector('[data-vector-building-kind="housing"]')).not.toBeNull();
    expect(root.querySelector<HTMLButtonElement>('[data-generation-action="adopt"]')!.disabled).toBe(true);
    expect(history.undo()!.fabric).toBeUndefined();
    expect(history.redo()!.fabric).toBeDefined();
  }, 60000);

  it("plans the site for the panel's population and keeps the chosen wall when generating a city", async () => {
    mount(createVectorDocument(), undefined, {
      seed: "b5o620",
      settings: {
        ...defaultGenerationSettings(),
        population: defaultPopulationSettings(),
        historicalPeriod: "ageOfExploration" as const
      },
      frame: { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 }
    });
    expect(field("population").value).toBe("5000");
    fill("population", "50000");
    field("wall").value = "none";
    field("wall").dispatchEvent(new Event("change", { bubbles: true }));
    click("city");
    await vi.waitFor(() => expect(history.index).toBe(1), { timeout: 120000 });
    const report = history.document.urban!.report;
    expect(report.targetPopulation).toBe(50000);
    // The editor opened at 5,000 people; a 50,000-person city needs a site planned for 50,000.
    expect(report.capacityDwellings).toBeGreaterThanOrEqual(report.requiredDwellings);
    expect(report.unplacedPopulation).toBe(0);
    expect(history.document.generation!.settings.wall).toBe("none");
    expect(Object.values(history.document.paths).some(p => p.role === "wall")).toBe(false);
    expect(field("wall").value).toBe("none");
    // Generate city without a typed seed draws a new one and records it.
    expect(field("seed").value).not.toBe("b5o620");
    expect(history.document.recipe.seed).toBe(field("seed").value);
  }, 120000);
  it("previews input and generation without changing saved history, then adopts one transaction per operation", async () => {
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
    await vi.waitFor(() => expect(map.querySelector("[data-vector-block]")).not.toBeNull());
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
  it("shows blocked input errors without adopting partial output", async () => {
    mount();
    click("generate");
    await vi.waitFor(() =>
      expect(root.querySelector(".ce-vector-generation-status")!.textContent).not.toContain("Generating candidate")
    );
    expect(history.index).toBe(0);
    expect(root.querySelector(".ce-vector-generation-status")!.textContent).not.toBe("");
    expect(root.querySelector<HTMLButtonElement>('[data-generation-action="adopt"]')!.disabled).toBe(true);
  });
});

describe("M9 asynchronous generation ownership", () => {
  it("keeps a preview adoptable while using read-only presentation controls", () => {
    mount();
    click("synthetic");
    const preview = document.createElement("fieldset"),
      view = document.createElement("button");
    preview.dataset.vectorPresentation = "";
    preview.append(view);
    panel.append(preview);
    view.click();
    click("adopt");
    expect(history.document.site?.kind).toBe("synthetic");
    expect(history.index).toBe(1);
  });
  it("cancels a running job on settings changes and ignores delayed replies", async () => {
    const deferred = Promise.withResolvers<Awaited<ReturnType<typeof startVectorGeneration>["result"]>>(),
      cancel = vi.fn();
    startOverride = () => ({ result: deferred.promise, cancel });
    mount();
    click("generate");
    const running = root.querySelector(".ce-vector-generation-status")!.textContent;
    fill("seed", "edited");
    expect(root.querySelector(".ce-vector-generation-status")!.textContent).not.toBe(running);
    expect(cancel).toHaveBeenCalledOnce();
    deferred.resolve({ document: createVectorDocument(), stages: [] });
    await Promise.resolve();
    expect(history.index).toBe(0);
    expect(root.querySelector<HTMLButtonElement>('[data-generation-action="adopt"]')!.disabled).toBe(true);
  });
  it("compares history identity when different transactions contain identical JSON", async () => {
    const deferred = Promise.withResolvers<Awaited<ReturnType<typeof startVectorGeneration>["result"]>>();
    startOverride = () => ({ result: deferred.promise, cancel: vi.fn() });
    mount();
    click("generate");
    history.commit(history.document, "same JSON, new transaction");
    deferred.resolve({ document: syntheticVectorInput("late"), stages: [] });
    await Promise.resolve();
    expect(history.document.site).toBeUndefined();
    expect(root.querySelector<HTMLButtonElement>('[data-generation-action="adopt"]')!.disabled).toBe(true);
  });
});

describe("M5 adopted urban checkpoints", () => {
  it("previews, cancels and adopts one urban transaction with dynamic stages", async () => {
    mount();
    click("synthetic");
    click("adopt");
    click("generate");
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLButtonElement>('[data-generation-action="adopt"]')!.disabled).toBe(false)
    );
    click("adopt");
    fill("mode", "medieval-facilities");
    fill("population", "500");
    fill("maxLanes", "4");
    const index = history.index;
    click("develop");
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLButtonElement>('[data-generation-action="adopt"]')!.disabled).toBe(false)
    );
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
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLButtonElement>('[data-generation-action="adopt"]')!.disabled).toBe(false)
    );
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
    await vi.waitFor(() =>
      expect(root.querySelector<HTMLButtonElement>('[data-generation-action="adopt"]')!.disabled).toBe(false)
    );
    click("adopt");
    expect(history.document.urban!.report.placedFacilities).toBe(0);
    expect(field("stage").querySelectorAll("option")).toHaveLength(5);
  });
});

describe("settings meshless does not generate (feature parity P1)", () => {
  it("lists the requested settings meshless cannot generate yet, and nothing for a default city", () => {
    const settings = defaultGenerationSettings();
    settings.population = defaultPopulationSettings(3000);
    settings.config.features.citadel = true;
    settings.townWallRings = "double";
    mount(createVectorDocument(), undefined, {
      seed: "p1",
      settings,
      frame: { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 }
    });
    const box = panel.querySelector<HTMLElement>("[data-vector-setting-gaps]")!,
      ids = [...box.querySelectorAll<HTMLElement>("[data-setting-gap]")].map(li => li.dataset.settingGap);
    expect(box.hidden).toBe(false);
    expect(ids).toEqual(expect.arrayContaining(["config.features.citadel", "townWallRings"]));
    expect(box.textContent).not.toContain("{{");
    scope.dispose();
    panel.replaceChildren();
    mount();
    expect(panel.querySelector<HTMLElement>("[data-vector-setting-gaps]")!.hidden).toBe(true);
  });
});
