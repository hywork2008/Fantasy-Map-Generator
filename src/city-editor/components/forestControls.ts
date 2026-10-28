import { FOREST_3D_BUDGET } from "../../city3d/three/forestMeshes";
import { type EditorMessageKey, editorText } from "../../i18n/editorMessages";
import { withForestSettings } from "../generators/forestLandCover";
import { facePoints } from "../generators/mesh";
import { plotArea } from "../generators/parcelGeometry";
import type { EditorLifetime } from "../services/editorLifetime";
import {
  type ForestRepresentation,
  readForestViewPreferences,
  writeForestViewPreferences
} from "../services/forestViewPreferences";
import type { GenerationState } from "../state/editorSession";
import type { ForestQualityPreference, ForestSettings } from "../types/contracts/forest";
import type { CityDocument } from "../types/document";
import { div } from "./editorControls";

interface Context {
  scope: EditorLifetime;
  getDocument(): CityDocument;
  generation: GenerationState;
  select(values: string[], selected: string): HTMLSelectElement;
  label(value: string, control: HTMLElement): HTMLLabelElement;
  apply(next: CityDocument): void;
  viewChanged(): void;
}

export function buildForestControls(ctx: Context) {
  const root = div("ce-forest-controls");
  const view = div("ce-forest-view-controls");
  function choice(values: string[], selected: string, name: string, key: EditorMessageKey) {
    const control = ctx.select(values, selected);
    control.className = `ce-forest-${name}`;
    control.setAttribute("aria-label", editorText(key));
    for (const option of control.options)
      option.textContent = editorText(`cityEditor.forest.${option.value}` as EditorMessageKey);
    return control;
  }
  const mode = choice(["legacy", "farmland", "surroundings"], "legacy", "mode", "cityEditor.forest.mode");
  const density = choice(["sparse", "standard", "dense"], "standard", "density", "cityEditor.forest.density");
  const prefs = readForestViewPreferences();
  const representation = choice(
    ["edge-fill", "all-trees"],
    prefs.representation,
    "representation",
    "cityEditor.forest.representation"
  );
  const quality = choice(["auto", "light", "standard", "high"], prefs.quality, "quality", "cityEditor.forest.quality");
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "ce-forest-apply";
  apply.textContent = editorText("cityEditor.forest.apply");
  const summary = document.createElement("output");
  summary.className = "ce-forest-protected";
  summary.setAttribute("aria-live", "polite");
  const help = document.createElement("p");
  help.textContent = editorText("cityEditor.forest.help");
  root.append(
    ctx.label(editorText("cityEditor.forest.mode"), mode),
    ctx.label(editorText("cityEditor.forest.density"), density),
    apply,
    summary,
    help
  );
  const qualityHelp = document.createElement("p");
  qualityHelp.textContent = editorText("cityEditor.forest.autoHelp");
  view.append(
    ctx.label(editorText("cityEditor.forest.representation"), representation),
    ctx.label(editorText("cityEditor.forest.quality"), quality),
    qualityHelp
  );

  const limits = document.createElement("details");
  const limitsTitle = document.createElement("summary");
  limitsTitle.textContent = editorText("cityEditor.forest.limits");
  limits.append(limitsTitle);
  for (const tier of ["light", "standard", "high"] as const) {
    const budget = FOREST_3D_BUDGET[tier];
    const row = document.createElement("p");
    row.textContent = `${editorText(`cityEditor.forest.${tier}`)}: ${editorText("cityEditor.forest.budget", budget)}`;
    limits.append(row);
  }
  view.append(limits);

  function settings(): ForestSettings {
    return {
      version: 1,
      mode: mode.value as ForestSettings["mode"],
      density: density.value as ForestSettings["density"]
    };
  }
  function sync() {
    const selected = ctx.generation.generateSettings.forestSettings;
    mode.value = selected?.mode ?? "legacy";
    density.value = selected?.density ?? "standard";
    density.disabled = mode.value === "legacy";
    const city = ctx.getDocument();
    const current = city.forestSettings;
    apply.disabled =
      Boolean(ctx.generation.generationJob) ||
      (mode.value === (current?.mode ?? "legacy") && density.value === (current?.density ?? "standard"));
    mode.disabled = quality.disabled = representation.disabled = Boolean(ctx.generation.generationJob);
    if (ctx.generation.generationJob) density.disabled = true;
    const protectedIds = new Set(city.elements.flatMap(element => element.faceIds));
    const faces = Object.values(city.mesh.faces).filter(
      face =>
        face.properties.water === "land" &&
        face.properties.ward === "farm" &&
        (face.properties.locked || protectedIds.has(face.id))
    );
    const area = faces.reduce((sum, face) => sum + plotArea(facePoints(city.mesh, face)), 0);
    summary.hidden = (city.forestSettings?.mode ?? "legacy") === "legacy" || !faces.length;
    summary.textContent = editorText("cityEditor.forest.protected", {
      count: faces.length,
      area: (area / 10000).toFixed(2)
    });
  }
  for (const control of [mode, density])
    ctx.scope.listen(control, "change", () => {
      ctx.generation.generateSettings.forestSettings = settings();
      sync();
    });
  ctx.scope.listen(apply, "click", () => {
    if (ctx.generation.generationJob) return;
    ctx.apply(withForestSettings(ctx.getDocument(), settings()));
    sync();
  });
  for (const control of [quality, representation])
    ctx.scope.listen(control, "change", () => {
      writeForestViewPreferences({
        representation: representation.value as ForestRepresentation,
        quality: quality.value as ForestQualityPreference
      });
      ctx.viewChanged();
    });
  sync();
  return { root, view, sync };
}
