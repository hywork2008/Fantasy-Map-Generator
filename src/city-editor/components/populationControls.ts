import { editorText } from "../../i18n/editorMessages";
import { clearGenerationPreviewCache } from "../generators/generation/previews";
import {
  DEFAULT_CITY_POPULATION,
  defaultPopulationSettings,
  MAX_CITY_POPULATION,
  POPULATION_MESH_CELLS,
  planPopulation
} from "../generators/populationPlan";
import type { PopulationGenerationSettings } from "../types/contracts/population";
import type { GenerationPanelContext } from "./generationPanel";

export function buildPopulationControls(ctx: GenerationPanelContext) {
  const panel = document.createElement("div");
  panel.className = "ce-population-controls";
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.className = "ce-population-enabled";
  const input = ctx.numberInput(String(DEFAULT_CITY_POPULATION), "1", "1");
  input.max = String(MAX_CITY_POPULATION);
  input.required = true;
  input.className = "ce-population-input";
  const source = ctx.select(["manual", "fmg", "ce-override"], "manual");
  source.className = "ce-population-source";
  const display = ctx.select(["auto", "detailed", "cluster-10", "cluster-20"], "auto");
  display.className = "ce-population-display";
  const frame = ctx.select(["auto", "manual"], "auto");
  frame.className = "ce-population-frame";
  const cell = ctx.select(POPULATION_MESH_CELLS.map(String), "50");
  cell.className = "ce-population-cell";
  const estimate = document.createElement("output");
  estimate.className = "ce-population-estimate";
  estimate.setAttribute("aria-live", "polite");
  for (const [select, keys] of [
    [source, ["populationManual", "populationFMG", "populationOverride"]],
    [display, ["populationAuto", "populationDetailed", "populationCluster10", "populationCluster20"]],
    [frame, ["populationFrameAuto", "populationFrameManual"]],
    [cell, ["populationCell50", "populationCell100", "populationCell150", "populationCell200"]]
  ] as const)
    [...select.options].forEach((o, i) => {
      o.textContent = editorText(`cityEditor.messages.${keys[i]}`);
    });
  panel.append(
    ctx.label(editorText("cityEditor.messages.populationEnabled"), enabled),
    ctx.label(editorText("cityEditor.messages.populationSource"), source),
    ctx.label(editorText("cityEditor.messages.population"), input),
    ctx.label(editorText("cityEditor.messages.populationDisplay"), display),
    ctx.label(editorText("cityEditor.messages.populationFrame"), frame),
    ctx.label(editorText("cityEditor.messages.populationCell"), cell),
    estimate
  );
  const settings = () => ctx.generation.generateSettings;
  // New standalone cities opt in; importing a legacy document later clears this setting.
  if (
    !settings().population &&
    !settings().descriptor &&
    !ctx.documents.documentState.fabric &&
    !ctx.documents.documentState.generationSeed
  ) {
    settings().population = defaultPopulationSettings();
    settings().historicalPeriod ??= ctx.documents.documentState.historicalPeriod ?? "ageOfExploration";
  }
  function preview() {
    input.setCustomValidity("");
    if (!enabled.checked) {
      estimate.textContent = "";
      return;
    }
    if (!input.validity.valid || !Number.isInteger(input.valueAsNumber)) {
      input.setCustomValidity(editorText("cityEditor.messages.populationInvalid"));
      estimate.textContent = input.validationMessage;
      return;
    }
    const candidate = {
      ...(settings().population ?? defaultPopulationSettings()),
      targetPopulation: input.valueAsNumber
    };
    try {
      const period = settings().historicalPeriod ?? settings().descriptor?.historicalPeriod ?? "lateMedieval";
      const p = planPopulation(candidate, period, ctx.documents.documentState.frame.extentMeters);
      if (
        (settings().generationMethod === "skeleton-first" && !settings().townFortification) ||
        ["bram", "circulade", "classic"].includes(settings().layout ?? settings().config.layout ?? "")
      )
        throw new Error("unsupported");
      estimate.textContent = editorText("cityEditor.messages.populationEstimate", {
        dwellings: p.requiredDwellings.toLocaleString(),
        buildings: p.estimatedBuildings.toLocaleString(),
        area: (p.targetAreaM2 / 1e6).toFixed(2),
        extent: (p.extentMeters / 1000).toFixed(1),
        cell: p.cellWidthMeters,
        cells: Math.ceil(p.targetAreaM2 / p.cellWidthMeters ** 2)
      });
    } catch {
      input.setCustomValidity(
        editorText(
          settings().population?.frameMode === "manual"
            ? "cityEditor.messages.populationFrameSmall"
            : "cityEditor.messages.populationUnsupported"
        )
      );
      estimate.textContent = input.validationMessage;
    }
  }
  function sync() {
    const p = settings().population;
    const descriptor = settings().descriptor;
    enabled.checked = !!p;
    source.value = p?.source ?? (descriptor ? "fmg" : "manual");
    source.options[0].disabled = !!descriptor;
    source.options[1].disabled = source.options[2].disabled = !descriptor;
    input.value = String(
      p?.source === "fmg"
        ? (descriptor?.burg.population ?? p.targetPopulation)
        : (p?.targetPopulation ?? descriptor?.burg.population ?? DEFAULT_CITY_POPULATION)
    );
    display.value = p?.housingDisplay ?? "auto";
    frame.value = p?.frameMode ?? "auto";
    cell.value = String(p?.meshCellMeters ?? 50);
    source.disabled = display.disabled = frame.disabled = cell.disabled = !p;
    input.disabled = !p || p.source === "fmg";
    preview();
    // Disabled FMG inputs still need to block unsupported populations, so the panel records validity too.
    panel.dataset.valid = String(
      !p ||
        (input.validity.valid && Number.isInteger(input.valueAsNumber) && input.valueAsNumber <= MAX_CITY_POPULATION)
    );
  }
  function change() {
    const previous = settings().population ?? defaultPopulationSettings();
    const target =
      source.value === "fmg" ? (settings().descriptor?.burg.population ?? input.valueAsNumber) : input.valueAsNumber;
    if (enabled.checked) {
      const { meshCellMeters: _previousCell, ...rest } = previous;
      // The default 50 m cell is left absent, as in settings saved before the choice existed.
      settings().population = {
        ...rest,
        source: source.value as PopulationGenerationSettings["source"],
        targetPopulation: target,
        housingDisplay: display.value as PopulationGenerationSettings["housingDisplay"],
        frameMode: frame.value as PopulationGenerationSettings["frameMode"],
        ...(cell.value === "50"
          ? {}
          : { meshCellMeters: Number(cell.value) as PopulationGenerationSettings["meshCellMeters"] })
      };
    } else delete settings().population;
    ctx.generation.generationJob?.cancel();
    ctx.generation.completeSource = null;
    ctx.generation.completeResult = null;
    ctx.generation.lastGeneratedStep = null;
    clearGenerationPreviewCache();
    if (enabled.checked && (!Number.isInteger(target) || target < 1 || target > MAX_CITY_POPULATION)) {
      preview();
      panel.dataset.valid = "false";
    } else sync();
  }
  const scope = ctx.panelEventContext().scope;
  for (const control of [enabled, source, display, frame, cell]) scope.listen(control, "change", change);
  scope.listen(input, "input", () => {
    input.setCustomValidity("");
    if (settings().population) settings().population!.targetPopulation = input.valueAsNumber;
    ctx.generation.generationJob?.cancel();
    ctx.generation.completeSource = null;
    ctx.generation.completeResult = null;
    clearGenerationPreviewCache();
    preview();
    panel.dataset.valid = String(input.validity.valid);
  });
  scope.listen(input, "change", change);
  sync();
  return { panel, sync };
}
