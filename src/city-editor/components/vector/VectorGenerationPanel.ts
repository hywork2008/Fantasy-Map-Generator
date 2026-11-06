import { type EditorMessageKey, editorText } from "../../../i18n/editorMessages";
import { siteDisk, syntheticVectorInput, vectorInputFromDescriptor } from "../../generators/vector/generation/input";
import {
  DEFAULT_VECTOR_GENERATION,
  generateVectorSkeleton,
  type VectorGenerationResult
} from "../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../generators/vector/generation/urban";
import { assertVectorDocument, VECTOR_DOCUMENT_LIMITS } from "../../generators/vector/validation/document";
import { vectorUrbanStages } from "../../generators/vector/validation/urban";
import { renderVectorDocument } from "../../renderers/vector/documentSvg";
import type { EditorLifetime } from "../../services/editorLifetime";
import { parseIncomingPayload } from "../../services/io/incomingCity";
import type { BurgSiteDescriptor } from "../../types/contracts/burgSiteDescriptor";
import type { VectorCityDocument } from "../../types/vector/document";
import type { VectorGenerationSettings } from "../../types/vector/generation";
import type { VectorStage } from "../../types/vector/urban";

const text = (key: string) => editorText(`cityEditor.vector.generation.${key}` as EditorMessageKey);
export function createVectorGenerationPanel(
  scope: EditorLifetime,
  parent: HTMLElement,
  map: HTMLElement,
  read: () => VectorCityDocument,
  commit: (doc: VectorCityDocument, label: string) => void,
  restore: () => void,
  linked?: BurgSiteDescriptor
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
  let pending: VectorGenerationResult | undefined,
    label = "";
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
        action();
      } catch (error) {
        fail(error);
      }
    });
    body.append(b);
    return b;
  };
  const fail = (error: unknown) => {
    pending = undefined;
    adopt.disabled = true;
    const message = error instanceof Error ? error.message : "invalid-input",
      match =
        message.match(
          /urban-[a-z-]+|edited-urban|invalid-urban-settings|site-[a-z-]+|fixed-[a-z-]+|urban-generated|edited-generation|unbridged-road|bridge-[a-z-]+|gate-access|region-[a-z-]+|route-budget|coastal-coverage-missing|invalid-generation-settings/
        )?.[0] ?? "invalid-input",
      key = `cityEditor.vector.generation.errors.${match}` as EditorMessageKey,
      translated = editorText(key);
    status.textContent = translated === key ? text("errors.invalid-input") : translated;
    restore();
  };
  const seed = input("seed", read().recipe.seed),
    radius = number("radius", 150),
    cx = number("centerX", 0),
    cy = number("centerY", 0),
    river = document.createElement("input");
  river.type = "checkbox";
  river.checked = true;
  field("river", river);
  const width = number("roadWidth", 5),
    clearance = number("clearance", 0.5),
    branches = number("branches", 8),
    wall = document.createElement("select");
  wall.dataset.generationField = "wall";
  for (const value of ["none", "rectangle", "ellipse"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text(value);
    wall.append(option);
  }
  field("wall", wall);
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
  button("generate", () => {
    const settings: VectorGenerationSettings = {
      ...DEFAULT_VECTOR_GENERATION,
      seed: seed.value,
      roadWidthMeters: Number(width.value),
      clearanceMeters: Number(clearance.value),
      branches: Number(branches.value),
      wall: wall.value as VectorGenerationSettings["wall"]
    };
    const result = generateVectorSkeleton(read(), settings);
    preview(result.document, "generate", result.stages);
    status.textContent = `${text("result")} ${Object.keys(result.document.paths).length} / ${result.document.generation!.blocks.length} / ${result.document.generation!.diagnostics.length}`;
  });
  const mode = document.createElement("select");
  mode.dataset.generationField = "mode";
  for (const value of ["medieval", "medieval-facilities"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    mode.append(option);
  }
  mode.value = "medieval-facilities";
  field("mode", mode);
  const population = number("population", read().context.targetPopulation || 1000),
    laneSpacing = number("laneSpacing", 36),
    laneWidth = number("laneWidth", 2.4),
    maxLanes = number("maxLanes", 32),
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
  button("develop", () => {
    const doc = generateVectorUrban(read(), {
      ...DEFAULT_VECTOR_URBAN,
      mode: mode.value as "medieval" | "medieval-facilities",
      population: Number(population.value),
      laneSpacingMeters: Number(laneSpacing.value),
      laneWidthMeters: Number(laneWidth.value),
      maxLanes: Number(maxLanes.value),
      allowExpansion: expansion.checked
    });
    preview(doc, "develop");
    showUrban(doc);
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
  body.append(status, diagnosticList);
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
    pending = undefined;
    adopt.disabled = true;
    restore();
  });
  return {
    refresh() {
      scope.invalidate("vector-generation-input");
      pending = undefined;
      adopt.disabled = true;
      const doc = read();
      fmg.disabled = !linked && !doc.site?.descriptor;
      seed.value = doc.generation?.settings.seed ?? doc.recipe.seed;
      width.value = String(doc.generation?.settings.roadWidthMeters ?? 5);
      clearance.value = String(doc.generation?.settings.clearanceMeters ?? 0.5);
      branches.value = String(doc.generation?.settings.branches ?? 8);
      wall.value = doc.generation?.settings.wall ?? "none";
      showDiagnostics(doc);
      updateStages(doc);
      mode.value = doc.urban?.settings.mode ?? "medieval-facilities";
      population.value = String(doc.urban?.settings.population ?? (doc.context.targetPopulation || 1000));
      laneSpacing.value = String(doc.urban?.settings.laneSpacingMeters ?? 36);
      laneWidth.value = String(doc.urban?.settings.laneWidthMeters ?? 2.4);
      maxLanes.value = String(doc.urban?.settings.maxLanes ?? 32);
      expansion.checked = doc.urban?.settings.allowExpansion ?? true;
      stage.disabled = !!doc.generation && doc.generation.inputRevision !== doc.revision;
      status.textContent = doc.generation
        ? doc.generation.inputRevision === doc.revision
          ? text("adopted")
          : text("stale")
        : doc.site
          ? text("inputReady")
          : text("noInput");
      showUrban(doc);
    }
  };
}
