import { BUILDING_APPEARANCE_PROFILES, type BuildingAppearanceProfile } from "../../../buildings/appearance/types";
import { BURIAL_CULTURE_PRESETS, getBurialCulturePreset } from "../../../data/burialCultures";
import { type EditorMessageKey, editorText } from "../../../i18n/editorMessages";
import { HISTORICAL_PERIODS } from "../../../types/historicalPeriod";
import type { VectorEditorGenerationInput } from "../../generators/vector/generation/editorInput";
import { vectorHousingCulture } from "../../generators/vector/generation/housingCulture";
import { matchesVectorUrbanFingerprint, vectorUrbanFingerprint } from "../../generators/vector/generation/urbanState";
import { VECTOR_WALL_SHAPES } from "../../generators/vector/generation/wallShape";
import type { EditorLifetime } from "../../services/editorLifetime";
import type { CoastShape, RiverShape } from "../../types/contracts/siteConfig";
import type { GenerationSettings } from "../../types/generation";
import type { VectorCityDocument } from "../../types/vector/document";

const text = (key: string) => editorText(`cityEditor.vector.settings.${key}` as EditorMessageKey);

/**
 * The city settings of the meshless editor: the generation settings it reads on Generate city (site, features,
 * walls, layout, period, burial, buildings, forest) and the housing culture, set here without the mesh editor's
 * panels. The settings are the editor input's, edited in place; the housing culture applies to the open city at
 * once, as it only changes the look of its houses, towers and gates.
 */
export function createVectorCitySettingsPanel(
  scope: EditorLifetime,
  parent: HTMLElement,
  input: VectorEditorGenerationInput,
  read: () => VectorCityDocument,
  commit: (doc: VectorCityDocument, label: string) => void,
  changed: () => void
) {
  const details = document.createElement("details"),
    summary = document.createElement("summary"),
    body = document.createElement("div");
  details.dataset.vectorCitySettings = "";
  summary.textContent = text("title");
  body.style.cssText = "display:flex;flex-direction:column;gap:6px;margin:10px 0";
  details.append(summary, body);
  parent.append(details);
  const s = (): GenerationSettings => input.settings;
  const row = (key: string, element: HTMLElement) => {
    const label = document.createElement("label");
    label.textContent = text(key);
    label.append(element);
    body.append(label);
    return element;
  };
  const select = <T extends string>(
    key: string,
    values: readonly T[],
    get: () => T,
    set: (value: T) => void,
    labelOf: (value: T) => string = value => value
  ) => {
    const element = document.createElement("select");
    element.dataset.citySetting = key;
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = labelOf(value);
      element.append(option);
    }
    element.value = get();
    scope.listen(element, "change", () => {
      set(element.value as T);
      changed();
      sync();
    });
    row(key, element);
    return { element, sync: () => (element.value = get()) };
  };
  const check = (key: string, get: () => boolean, set: (value: boolean) => void) => {
    const element = document.createElement("input");
    element.type = "checkbox";
    element.dataset.citySetting = key;
    element.checked = get();
    scope.listen(element, "change", () => {
      set(element.checked);
      changed();
      sync();
    });
    row(key, element);
    return { element, sync: () => (element.checked = get()) };
  };
  const auto = (value: string) => (value === "auto" || value === "" ? text("auto") : value);
  const linked = () => !!s().descriptor;
  const controls: { element: HTMLElement; sync: () => void }[] = [];
  const add = (c: { element: HTMLElement; sync: () => void }) => (controls.push(c), c);

  add(
    select(
      "historicalPeriod",
      HISTORICAL_PERIODS,
      () => s().historicalPeriod ?? "ageOfExploration",
      v => (s().historicalPeriod = v)
    )
  );
  // Geography: a standalone site only; an FMG city keeps its own coast and rivers.
  const coast = add(
    select<CoastShape>(
      "coast",
      ["none", "straight", "bay", "cape"],
      () => s().config.coast,
      v => (s().config = { ...s().config, coast: v })
    )
  );
  const riverValues = ["", "through", "beside", "toCoast", "straight", "meander", "greatBend"] as const;
  const riverAt = (i: number) =>
    select<(typeof riverValues)[number]>(
      `river${i + 1}`,
      riverValues,
      () => s().config.rivers[i] ?? "",
      v => {
        const rivers = [...s().config.rivers];
        if (v) rivers[i] = v as RiverShape;
        else rivers.splice(i, 1);
        s().config = { ...s().config, rivers: rivers.filter(Boolean).slice(0, 2) };
      },
      value => (value ? value : text("noRiver"))
    );
  const rivers = [add(riverAt(0)), add(riverAt(1))];
  for (const feature of ["walls", "citadel", "plaza", "temple", "port", "shanty"] as const)
    add(
      check(
        feature,
        () => s().config.features[feature] === true,
        v => (s().config = { ...s().config, features: { ...s().config.features, [feature]: v } })
      )
    );
  add(
    select(
      "wallMaterial",
      ["auto", "stone", "wood"] as const,
      () => s().config.wall.material ?? "auto",
      v => (s().config = { ...s().config, wall: { ...s().config.wall, material: v } }),
      auto
    )
  );
  add(
    select(
      "wallCoast",
      ["auto", "open", "seaWall", "opening"] as const,
      () => s().config.wall.coast,
      v => (s().config = { ...s().config, wall: { ...s().config.wall, coast: v } }),
      auto
    )
  );
  add(
    select(
      "wallShape",
      ["auto", ...VECTOR_WALL_SHAPES] as const,
      () => s().wallShape ?? "auto",
      v => (s().wallShape = v),
      auto
    )
  );
  const sides = document.createElement("input");
  sides.type = "number";
  sides.min = "3";
  sides.max = "12";
  sides.dataset.citySetting = "wallSides";
  sides.placeholder = text("auto");
  sides.value = s().wallSides === undefined ? "" : String(s().wallSides);
  scope.listen(sides, "change", () => {
    const n = Math.round(Number(sides.value));
    if (sides.value === "" || !Number.isFinite(n)) delete s().wallSides;
    else s().wallSides = Math.min(12, Math.max(3, n));
    changed();
  });
  row("wallSides", sides);
  controls.push({
    element: sides,
    sync: () => (sides.value = s().wallSides === undefined ? "" : String(s().wallSides))
  });
  add(
    select(
      "townWallRings",
      ["single", "double"] as const,
      () => s().townWallRings ?? "single",
      v => (s().townWallRings = v)
    )
  );
  add(
    select(
      "townWallBuildOrder",
      ["outer-first", "inner-first"] as const,
      () => s().townWallBuildOrder ?? "outer-first",
      v => (s().townWallBuildOrder = v)
    )
  );
  add(
    select(
      "innerWallState",
      ["standing", "razed"] as const,
      () => s().innerWallState ?? "standing",
      v => (s().innerWallState = v)
    )
  );
  add(
    check(
      "townMoat",
      () => s().moats?.town === true,
      v => (s().moats = { ...(s().moats ?? {}), town: v })
    )
  );
  add(
    select(
      "layout",
      ["auto", "organic", "circulade", "bram", "classic"] as const,
      () => s().layout ?? s().config.layout ?? "auto",
      v => {
        s().layout = v;
        s().config = { ...s().config, layout: v };
      },
      auto
    )
  );
  add(
    select(
      "burial",
      ["", ...Object.keys(BURIAL_CULTURE_PRESETS)],
      () => s().burialProfile?.id ?? "",
      v => {
        if (v) s().burialProfile = getBurialCulturePreset(v);
        else delete s().burialProfile;
      },
      v => (v ? (BURIAL_CULTURE_PRESETS[v]?.name ?? v) : text("auto"))
    )
  );
  add(
    select(
      "buildingPattern",
      ["medieval", "legacy"] as const,
      () => s().buildingPattern ?? "medieval",
      v => (s().buildingPattern = v)
    )
  );
  add(
    select(
      "forestMode",
      ["legacy", "farmland", "surroundings"] as const,
      () => s().forestSettings?.mode ?? "legacy",
      v => (s().forestSettings = { version: 1, density: s().forestSettings?.density ?? "standard", mode: v })
    )
  );
  add(
    select(
      "forestDensity",
      ["sparse", "standard", "dense"] as const,
      () => s().forestSettings?.density ?? "standard",
      v => (s().forestSettings = { version: 1, mode: s().forestSettings?.mode ?? "legacy", density: v })
    )
  );
  // The housing culture changes the look only: it applies to the open city at once and to the next one.
  const culture = document.createElement("select");
  culture.dataset.citySetting = "housingCulture";
  for (const value of ["", ...BUILDING_APPEARANCE_PROFILES]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value ? value : text("auto");
    culture.append(option);
  }
  const cultureOf = () =>
    (input.settings as GenerationSettings & { buildingAppearanceProfile?: string }).buildingAppearanceProfile ??
    vectorHousingCulture(read()) ??
    "";
  culture.value = cultureOf();
  scope.listen(culture, "change", () => {
    const value = culture.value as BuildingAppearanceProfile | "",
      settings = input.settings as GenerationSettings & { buildingAppearanceProfile?: BuildingAppearanceProfile };
    if (value) settings.buildingAppearanceProfile = value;
    else delete settings.buildingAppearanceProfile;
    const doc = read(),
      // A city generated before the culture was display-only carries it in its ownership evidence: re-stamp it.
      owned = !!doc.urban && matchesVectorUrbanFingerprint(doc, doc.urban.adoptedFingerprint),
      requested = { ...(doc.context.requestedSettings ?? { config: structuredClone(settings.config) }) } as NonNullable<
        VectorCityDocument["context"]["requestedSettings"]
      > & { buildingAppearanceProfile?: BuildingAppearanceProfile };
    if (value) requested.buildingAppearanceProfile = value;
    else delete requested.buildingAppearanceProfile;
    doc.context.requestedSettings = requested;
    if (owned && doc.urban) doc.urban.adoptedFingerprint = vectorUrbanFingerprint(doc);
    commit(doc, text("changeHousingCulture"));
    changed();
  });
  row("housingCulture", culture);
  controls.push({ element: culture, sync: () => (culture.value = cultureOf()) });

  function sync() {
    for (const c of controls) c.sync();
    const fixedSite = linked();
    for (const c of [coast, ...rivers]) (c.element as HTMLSelectElement).disabled = fixedSite;
  }
  sync();
  return { refresh: sync };
}
