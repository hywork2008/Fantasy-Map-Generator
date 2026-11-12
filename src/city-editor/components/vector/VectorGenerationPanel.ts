import { type EditorMessageKey, editorText } from "../../../i18n/editorMessages";
import { type FortressFailureReason, fortressFailureMessage } from "../../generators/bastionedTown/validate";
import { randomSeed } from "../../generators/generation/settings";
import {
  type VectorEditorGenerationInput,
  vectorInputFromEditor
} from "../../generators/vector/generation/editorInput";
import { siteDisk, syntheticVectorInput, vectorInputFromDescriptor } from "../../generators/vector/generation/input";
import { DEFAULT_VECTOR_GENERATION, type VectorGenerationResult } from "../../generators/vector/generation/pipeline";
import { meshlessSettingGaps } from "../../generators/vector/generation/settingSupport";
import { DEFAULT_VECTOR_URBAN, vectorUrbanMode } from "../../generators/vector/generation/urban";
import { VECTOR_WALL_SHAPES, vectorWallChoice } from "../../generators/vector/generation/wallShape";
import { assertVectorDocument, VECTOR_DOCUMENT_LIMITS } from "../../generators/vector/validation/document";
import { vectorUrbanStages } from "../../generators/vector/validation/urban";
import { renderVectorDocument } from "../../renderers/vector/documentSvg";
import type { EditorLifetime } from "../../services/editorLifetime";
import { parseIncomingPayload } from "../../services/io/incomingCity";
import { startVectorGeneration, type VectorGenerationTask } from "../../services/vectorGenerationWorkerClient";
import type { BurgSiteDescriptor } from "../../types/contracts/burgSiteDescriptor";
import type { GenerationSettings } from "../../types/generation";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorGenerationSettings } from "../../types/vector/generation";
import type { TanneryBends, VectorStage } from "../../types/vector/urban";

const text = (key: string) => editorText(`cityEditor.vector.generation.${key}` as EditorMessageKey);
export function createVectorGenerationPanel(
  scope: EditorLifetime,
  parent: HTMLElement,
  map: HTMLElement,
  read: () => VectorCityDocument,
  commit: (doc: VectorCityDocument, label: string) => void,
  restore: () => void,
  linked?: BurgSiteDescriptor,
  onRender?: (doc: VectorCityDocument, stage: VectorStage) => void,
  start = startVectorGeneration,
  readEntryKey?: () => object,
  editorInput?: VectorEditorGenerationInput,
  /** Read-only current document for display; never mutated. Defaults to a copy. */
  peek: () => Readonly<VectorCityDocument> = read
) {
  const details = document.createElement("details"),
    summary = document.createElement("summary"),
    body = document.createElement("div"),
    status = document.createElement("output");
  summary.textContent = text("title");
  details.append(summary, body);
  parent.append(details);
  status.className = "ce-vector-generation-status";
  status.setAttribute("aria-live", "polite");
  body.style.cssText = "display:flex;flex-direction:column;gap:6px;margin:10px 0";
  const diagnosticList = document.createElement("ul");
  diagnosticList.className = "ce-vector-generation-diagnostics";
  const showDiagnostics = (doc: VectorCityDocument) => {
    diagnosticList.replaceChildren(
      ...(doc.generation?.diagnostics ?? []).map(d => {
        const li = document.createElement("li"),
          key = `cityEditor.vector.generation.diagnostics.${d.code}` as EditorMessageKey;
        li.textContent = `${editorText(key)} (${d.entityId})`;
        return li;
      })
    );
  };
  // Settings the city was requested with that meshless does not generate yet (feature parity P1).
  const gapBox = document.createElement("div"),
    gapTitle = document.createElement("p"),
    gapList = document.createElement("ul");
  gapBox.dataset.vectorSettingGaps = "";
  gapTitle.textContent = text("settingGaps.title");
  gapTitle.style.cssText = "margin:4px 0 0;font-weight:bold";
  gapList.className = "ce-vector-generation-setting-gaps";
  gapBox.append(gapTitle, gapList);
  const showSettingGaps = (doc: Readonly<VectorCityDocument>) => {
    const requested = doc.context.requestedSettings ?? editorInput?.settings,
      gaps = requested ? meshlessSettingGaps(requested as GenerationSettings) : [];
    gapBox.hidden = !gaps.length;
    gapList.replaceChildren(
      ...gaps.map(g => {
        const li = document.createElement("li");
        li.dataset.settingGap = g.id;
        li.textContent = editorText("cityEditor.vector.generation.settingGaps.item" as EditorMessageKey, {
          value0: g.id,
          value1: text(`settingGaps.states.${g.state}`),
          value2: g.stage
        });
        return li;
      })
    );
  };
  let pending: VectorGenerationResult | undefined,
    label = "";
  let job: ReturnType<typeof start> | undefined,
    epoch = 0;
  const stop = () => {
    const had = !!job || !!pending;
    epoch++;
    job?.cancel();
    job = undefined;
    if (had && scope.active) status.textContent = text("cancelled");
  };
  scope.own(stop);
  const field = (key: string, element: HTMLElement) => {
    const row = document.createElement("label");
    row.textContent = text(key);
    row.append(element);
    body.append(row);
    return element;
  };
  const number = (key: string, value: number) => {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = String(value);
    input.dataset.generationField = key;
    field(key, input);
    return input;
  };
  const input = (key: string, value: string) => {
    const input = document.createElement("input");
    input.value = value;
    input.dataset.generationField = key;
    field(key, input);
    return input;
  };
  const button = (key: string, action: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text(key);
    b.dataset.generationAction = key;
    scope.listen(b, "click", () => {
      scope.invalidate("import");
      scope.invalidate("vector-generation-input");
      try {
        if (key !== "adopt") stop();
        action();
      } catch (error) {
        fail(error);
      }
    });
    body.append(b);
    return b;
  };
  const fail = (error: unknown) => {
    console.error("Meshless generation failed", error);
    pending = undefined;
    adopt.disabled = true;
    const message = error instanceof Error ? error.message : "invalid-input",
      fortress = message.match(/^fortress-[a-z-]+$/)?.[0] as FortressFailureReason | undefined,
      match =
        message.match(
          /urban-[a-z-]+|edited-urban|invalid-urban-settings|site-[a-z-]+|fixed-[a-z-]+|urban-generated|edited-generation|unbridged-road|bridge-[a-z-]+|generation-timeout|generation-worker|gate-access|region-[a-z-]+|route-budget|coastal-coverage-missing|invalid-generation-settings/
        )?.[0] ?? "invalid-input",
      key = `cityEditor.vector.generation.errors.${match}` as EditorMessageKey,
      translated = editorText(key);
    status.textContent = fortress
      ? fortressFailureMessage(fortress)
      : translated === key
        ? `${text("errors.invalid-input")} (${message.slice(0, 180)})`
        : translated;
    restore();
  };
  const seed = input("seed", editorInput?.seed ?? read().recipe.seed),
    radius = number("radius", 150),
    cx = number("centerX", 0),
    cy = number("centerY", 0),
    river = document.createElement("input");
  // A typed seed is reproduced once; otherwise every Generate city press draws a new one.
  let seedTyped = false;
  scope.listen(seed, "input", () => (seedTyped = true));
  river.type = "checkbox";
  river.checked = true;
  field("river", river);
  const width = number("roadWidth", 5),
    clearance = number("clearance", 0.5),
    branches = number("branches", 8),
    wall = document.createElement("select");
  wall.dataset.generationField = "wall";
  for (const value of ["none", "rectangle", "ellipse", ...VECTOR_WALL_SHAPES]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text(value);
    wall.append(option);
  }
  field("wall", wall);
  // A wall picked in the panel wins over the editor's wall settings until the next document change.
  let wallPicked = false;
  scope.listen(wall, "change", () => (wallPicked = true));
  const stage = document.createElement("select");
  stage.dataset.generationField = "stage";
  const updateStages = (doc: VectorCityDocument) => {
    const values: VectorStage[] = doc.urban
      ? vectorUrbanStages(doc.urban.settings.mode)
      : ["inputs", "skeleton", "regions"];
    stage.replaceChildren(
      ...values.map((value, i) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = `${i + 1}/${values.length} ${text(value)}`;
        return option;
      })
    );
    stage.value = doc.urban ? "housing" : "regions";
  };
  updateStages(read());
  field("stage", stage);
  const draw = (doc: VectorCityDocument) => {
    const svg = renderVectorDocument(doc, undefined, undefined, stage.value as VectorStage);
    svg.style.cssText = "width:100%;height:100%;min-height:300px";
    svg.dataset.generationPreview = String(!!pending);
    map.replaceChildren(svg);
    onRender?.(doc, stage.value as VectorStage);
  };
  const preview = (doc: VectorCityDocument, key: string, stages: VectorGenerationResult["stages"] = []) => {
    assertVectorDocument(doc);
    pending = { document: doc, stages };
    label = text(key);
    updateStages(doc);
    stage.disabled = false;
    adopt.disabled = false;
    draw(doc);
    showDiagnostics(doc);
    status.textContent = text("candidate");
  };
  button("synthetic", () =>
    preview(syntheticVectorInput(seed.value, Number(radius.value), river.checked), "synthetic")
  );
  button("current", () => {
    const doc = read();
    delete doc.generation;
    doc.site = {
      kind: "synthetic",
      id: "manual-site",
      revision: doc.revision,
      transform: { originMapUnits: [0, 0], metersPerMapUnit: 1, localAxes: "east-north" },
      center: [Number(cx.value), Number(cy.value)],
      domain: [siteDisk([Number(cx.value), Number(cy.value)], Number(radius.value))],
      water: [],
      fixedPaths: Object.values(doc.paths)
        .filter(p => p.origin === "imported" && p.editPolicy === "fixed")
        .map(p => structuredClone(p)),
      crossings: []
    };
    if (read().site) throw new Error("site-already-attached");
    doc.revision++;
    preview(doc, "current");
  });
  const fmg = button("linked", () => {
    const descriptor = read().site?.descriptor ?? linked;
    if (!descriptor) throw new Error("site-required");
    preview(vectorInputFromDescriptor(descriptor), "linked");
  });
  fmg.disabled = !linked;
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.className = "ce-vector-source-file";
  file.setAttribute("aria-label", text("openInput"));
  field("openInput", file);
  scope.listen(file, "change", async () => {
    const ticket = scope.ticket("vector-generation-input"),
      selected = file.files?.[0];
    file.value = "";
    if (!selected) return;
    if (selected.size > VECTOR_DOCUMENT_LIMITS.textLength) {
      fail(new Error("region-budget"));
      return;
    }
    try {
      const payload = parseIncomingPayload(await selected.text());
      if (!ticket()) return;
      if (!payload?.descriptor) throw new Error("invalid-input");
      preview(vectorInputFromDescriptor(payload.descriptor), "linked");
    } catch (error) {
      if (ticket()) fail(error);
    }
  });
  const run = (task: VectorGenerationTask, key: "generate" | "develop", sourceOverride?: VectorCityDocument) => {
    pending = undefined;
    adopt.disabled = true;
    status.textContent = text("running");
    const token = epoch,
      source = read(),
      entry = readEntryKey?.(),
      snapshot = JSON.stringify(source);
    const current = () =>
      scope.active &&
      token === epoch &&
      (readEntryKey ? readEntryKey() === entry : JSON.stringify(read()) === snapshot);
    job = start(sourceOverride ?? source, task, undefined, progress => {
      if (!current()) return;
      const count = progress.total === undefined ? "" : ` (${progress.completed ?? 0}/${progress.total})`;
      status.textContent = `${text("running")} ${text(`progress.${progress.phase}`)}${count}`;
    });
    void job.result
      .then(result => {
        if (!result || !current()) return;
        job = undefined;
        if (task.kind === "city") {
          commit(result.document, text("city"));
          updateStages(result.document);
          showDiagnostics(result.document);
          showUrban(result.document);
          return;
        }
        preview(result.document, key, result.stages);
        if (key === "develop") showUrban(result.document);
        else
          status.textContent = `${text("result")} ${Object.keys(result.document.paths).length} / ${result.document.generation!.blocks.length} / ${result.document.generation!.diagnostics.length}`;
      })
      .catch(error => {
        if (current()) {
          job = undefined;
          fail(error);
        }
      });
  };
  button("generate", () => {
    const settings: VectorGenerationSettings = {
      ...DEFAULT_VECTOR_GENERATION,
      seed: seed.value,
      roadWidthMeters: Number(width.value),
      clearanceMeters: Number(clearance.value),
      branches: Number(branches.value),
      wall: wall.value as VectorGenerationSettings["wall"]
    };
    run({ kind: "skeleton", settings }, "generate");
  });
  const mode = document.createElement("select");
  mode.dataset.generationField = "mode";
  for (const value of ["medieval", "medieval-facilities"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    mode.append(option);
  }
  mode.value = vectorUrbanMode(editorInput?.settings);
  field("mode", mode);
  // How the tanners' row meets the river's bends: one continuous row (default) or a tanners' leat.
  const tanneryBends = document.createElement("select");
  tanneryBends.dataset.generationField = "tanneryBends";
  for (const value of ["continuous", "leat"] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text(`tanneryBendsOptions.${value}`);
    tanneryBends.append(option);
  }
  tanneryBends.value = "continuous";
  field("tanneryBends", tanneryBends);
  const population = number(
      "population",
      editorInput?.settings.population?.targetPopulation ?? (read().context.targetPopulation || 1000)
    ),
    laneSpacing = number("laneSpacing", 36),
    laneWidth = number("laneWidth", 2.4),
    maxLanes = number("maxLanes", 32),
    occupancy = number("lotOccupancy", 100),
    expansion = document.createElement("input");
  expansion.type = "checkbox";
  expansion.checked = true;
  expansion.dataset.generationField = "allowExpansion";
  field("allowExpansion", expansion);
  const showUrban = (doc: VectorCityDocument) => {
    const u = doc.urban;
    if (!u) return;
    if (u.inputRevision !== doc.revision) return;
    const c = u.checkpoints.find(c => c.id === stage.value);
    const visibleFacilities = (c?.placementIds ?? Object.keys(doc.placements))
      .map(id => doc.placements[id])
      .filter(p => p.building?.kind === "facility");
    status.textContent = `${text("population")}: ${u.report.targetPopulation}; ${text("capacity")}: ${c?.capacityDwellings ?? u.report.capacityDwellings} / ${u.report.requiredDwellings}; ${text("unplaced")}: ${c?.unplacedPopulation ?? u.report.unplacedPopulation}; ${text("facilities")}: ${visibleFacilities.length} / ${u.report.requiredFacilities}; ${text("provisional")}: ${visibleFacilities.filter(p => p.building?.provenance === "provisional").length}${c ? `; ${text("stagePopulation")}: ${c.assignedPopulation}` : ""}`;
    for (const reason of u.report.reasons) {
      const li = document.createElement("li");
      li.textContent = text(`urbanDiagnostics.${reason}`);
      diagnosticList.append(li);
    }
    for (const f of u.report.unplacedFacilities) {
      const li = document.createElement("li");
      li.textContent = `${f.id}: ${text(`missing.${f.reason}`)}`;
      diagnosticList.append(li);
    }
  };
  /** Percent in the panel, a share in the settings. */
  const lotOccupancy = () => Math.min(1, Math.max(0.1, Number(occupancy.value) / 100 || 1));
  button("develop", () => {
    run(
      {
        kind: "urban",
        settings: {
          ...DEFAULT_VECTOR_URBAN,
          mode: mode.value as "medieval" | "medieval-facilities",
          population: Number(population.value),
          laneSpacingMeters: Number(laneSpacing.value),
          laneWidthMeters: Number(laneWidth.value),
          maxLanes: Number(maxLanes.value),
          allowExpansion: expansion.checked,
          lotOccupancy: lotOccupancy(),
          tanneryBends: tanneryBends.value as TanneryBends
        }
      },
      "develop"
    );
  });
  const adopt = button("adopt", () => {
    if (!pending) return;
    const doc = pending.document;
    pending = undefined;
    adopt.disabled = true;
    commit(doc, label);
  });
  adopt.disabled = true;
  button("cancel", () => {
    pending = undefined;
    adopt.disabled = true;
    restore();
    updateStages(read());
    status.textContent = text("cancelled");
  });
  const generateCity = document.createElement("button");
  generateCity.type = "button";
  generateCity.dataset.generationAction = "city";
  generateCity.textContent = text("city");
  scope.listen(generateCity, "click", () => {
    scope.invalidate("import");
    scope.invalidate("vector-generation-input");
    stop();
    if (!seedTyped) seed.value = randomSeed();
    seedTyped = false;
    try {
      const target = Number(population.value),
        // The building generation chosen in this panel, not the one the editor opened with: it sizes the site for the
        // facilities' land and lays them out.
        urbanMode = mode.value as "medieval" | "medieval-facilities",
        facilityLayout = urbanMode === "medieval-facilities" ? ("population" as const) : undefined;
      // The site is planned for the population in this panel, not the one the editor opened with.
      const source = editorInput
        ? vectorInputFromEditor({
            ...editorInput,
            seed: seed.value,
            lotOccupancy: lotOccupancy(),
            settings: {
              ...editorInput.settings,
              facilityLayout,
              population: {
                ...(editorInput.settings.population ?? {
                  version: 1,
                  source: "ce-override",
                  housingDisplay: "auto",
                  frameMode: "auto",
                  profileId: "medieval-v1",
                  profileVersion: 1
                }),
                targetPopulation: target
              }
            }
          })
        : linked
          ? vectorInputFromDescriptor(linked)
          : syntheticVectorInput(seed.value, Number(radius.value), river.checked, true);
      source.context.targetPopulation = target;
      // The editor's wall settings decide the wall, resolved on this seed (P4a).
      const editorWall =
        editorInput && !wallPicked
          ? vectorWallChoice(
              editorInput.settings,
              seed.value,
              source.context.historicalPeriod,
              editorInput.frame.extentMeters
            )
          : undefined;
      if (editorWall) wall.value = editorWall.wall;
      run(
        {
          kind: "city",
          settings: {
            ...DEFAULT_VECTOR_GENERATION,
            seed: seed.value,
            ...(editorWall ?? { wall: wall.value as VectorGenerationSettings["wall"] })
          },
          urban: {
            ...DEFAULT_VECTOR_URBAN,
            mode: urbanMode,
            population: target,
            lotOccupancy: lotOccupancy(),
            tanneryBends: tanneryBends.value as TanneryBends
          }
        },
        "develop",
        source
      );
    } catch (error) {
      fail(error);
    }
  });
  const firstAction = parent.querySelector(":scope > button") ?? details;
  generateCity.style.cssText = "display:block;width:100%;margin:8px 0";
  status.style.cssText = "display:block;margin:8px 0";
  parent.insertBefore(generateCity, firstAction);
  parent.insertBefore(status, firstAction);
  body.append(diagnosticList, gapBox);
  scope.listen(stage, "change", () => {
    const doc = pending?.stages.find(s => s.id === stage.value)?.document ?? pending?.document ?? read();
    draw(doc);
    showDiagnostics(doc);
    showUrban(doc);
  });
  scope.listen(body, "input", event => {
    if (event.target === stage) return;
    scope.invalidate("import");
    scope.invalidate("vector-generation-input");
    stop();
    pending = undefined;
    adopt.disabled = true;
    restore();
  });
  for (const eventName of ["click", "input"] as const)
    scope.listen(
      parent,
      eventName,
      event => {
        if (body.contains(event.target as Node) || (event.target as Element).closest?.("[data-vector-presentation]"))
          return;
        stop();
        pending = undefined;
        adopt.disabled = true;
      },
      { capture: true }
    );
  scope.listen(
    map,
    "pointerdown",
    () => {
      stop();
      pending = undefined;
      adopt.disabled = true;
    },
    { capture: true }
  );
  return {
    refresh() {
      stop();
      scope.invalidate("vector-generation-input");
      pending = undefined;
      adopt.disabled = true;
      const doc = peek();
      fmg.disabled = !linked && !doc.site?.descriptor;
      seed.value =
        doc.generation?.settings.seed ?? (doc.site ? doc.recipe.seed : (editorInput?.seed ?? doc.recipe.seed));
      width.value = String(doc.generation?.settings.roadWidthMeters ?? 5);
      clearance.value = String(doc.generation?.settings.clearanceMeters ?? 0.5);
      branches.value = String(doc.generation?.settings.branches ?? 8);
      // Before any generation, the wall follows the editor's settings, as Generate city used to.
      wall.value =
        doc.generation?.settings.wall ??
        (editorInput
          ? vectorWallChoice(
              editorInput.settings,
              seed.value,
              doc.context.historicalPeriod,
              editorInput.frame.extentMeters
            ).wall
          : "none");
      showDiagnostics(doc);
      showSettingGaps(doc);
      updateStages(doc);
      mode.value = doc.urban?.settings.mode ?? vectorUrbanMode(editorInput?.settings);
      population.value = String(
        doc.urban?.settings.population ??
          (doc.context.targetPopulation ||
            editorInput?.settings.population?.targetPopulation ||
            linked?.burg.population ||
            1000)
      );
      laneSpacing.value = String(doc.urban?.settings.laneSpacingMeters ?? 36);
      laneWidth.value = String(doc.urban?.settings.laneWidthMeters ?? 2.4);
      maxLanes.value = String(doc.urban?.settings.maxLanes ?? 32);
      expansion.checked = doc.urban?.settings.allowExpansion ?? true;
      occupancy.value = String(Math.round((doc.urban?.settings.lotOccupancy ?? 1) * 100));
      tanneryBends.value = doc.urban?.settings.tanneryBends ?? "continuous";
      stage.disabled = !!doc.generation && doc.generation.inputRevision !== doc.revision;
      status.textContent = doc.generation
        ? doc.generation.inputRevision === doc.revision
          ? text("adopted")
          : text("stale")
        : doc.site
          ? text("inputReady")
          : text("readyCity");
      showUrban(doc);
    }
  };
}
