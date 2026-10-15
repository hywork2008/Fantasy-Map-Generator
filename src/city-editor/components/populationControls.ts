import { editorText } from "../../i18n/editorMessages";
import { clearGenerationPreviewCache } from "../generators/generation/previews";
import { defaultPopulationSettings, planPopulation } from "../generators/populationPlan";
import type { PopulationGenerationSettings } from "../types/contracts/population";
import type { GenerationPanelContext } from "./generationPanel";

export function buildPopulationControls(ctx: GenerationPanelContext) {
  const panel = document.createElement("div");
  panel.className = "ce-population-controls";
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.className = "ce-population-enabled";
  const input = ctx.numberInput("3000", "1", "1");
  input.max = "150000";
  input.required = true;
  input.className = "ce-population-input";
  const source = ctx.select(["manual", "fmg", "ce-override"], "manual");
  source.className = "ce-population-source";
  const display = ctx.select(["auto", "detailed", "cluster-10", "cluster-20"], "auto");
  display.className = "ce-population-display";
  const frame = ctx.select(["auto", "manual"], "auto");
  frame.className = "ce-population-frame";
  const estimate = document.createElement("output");
  estimate.className = "ce-population-estimate";
  estimate.setAttribute("aria-live", "polite");
  for (const [select, keys] of [
    [source, ["populationManual", "populationFMG", "populationOverride"]],
    [display, ["populationAuto", "populationDetailed", "populationCluster10", "populationCluster20"]],
    [frame, ["populationFrameAuto", "populationFrameManual"]]
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
        settings().generationMethod === "skeleton-first" ||
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
        : (p?.targetPopulation ?? descriptor?.burg.population ?? 3000)
    );
    display.value = p?.housingDisplay ?? "auto";
    frame.value = p?.frameMode ?? "auto";
    source.disabled = display.disabled = frame.disabled = !p;
    input.disabled = !p || p.source === "fmg";
    preview();
    // Disabled FMG inputs still need to block unsupported populations, so the panel records validity too.
    panel.dataset.valid = String(
      !p || (input.validity.valid && Number.isInteger(input.valueAsNumber) && input.valueAsNumber <= 150000)
    );
  }
  function change() {
    const previous = settings().population ?? defaultPopulationSettings();
    const target =
      source.value === "fmg" ? (settings().descriptor?.burg.population ?? input.valueAsNumber) : input.valueAsNumber;
    if (enabled.checked)
      settings().population = {
        ...previous,
        source: source.value as PopulationGenerationSettings["source"],
        targetPopulation: target,
        housingDisplay: display.value as PopulationGenerationSettings["housingDisplay"],
        frameMode: frame.value as PopulationGenerationSettings["frameMode"]
      };
    else delete settings().population;
    ctx.generation.generationJob?.cancel();
    ctx.generation.completeSource = null;
    ctx.generation.completeResult = null;
    ctx.generation.lastGeneratedStep = null;
    clearGenerationPreviewCache();
    if (enabled.checked && (!Number.isInteger(target) || target < 1 || target > 150000)) {
      preview();
      panel.dataset.valid = "false";
    } else sync();
  }
  const scope = ctx.panelEventContext().scope;
  for (const control of [enabled, source, display, frame]) scope.listen(control, "change", change);
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
