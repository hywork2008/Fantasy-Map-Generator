// City Generator — vanilla DOM shell.
//
// Two site sources feed the identical S0–S3 pipeline:
//   • standalone — a composable SiteConfig (coast shape × 0..2 rivers × relief) +
//     size preset + seed drive a synthetic BurgSiteDescriptor (site/synthSite.ts).
//   • imported (M3) — a real BurgSiteDescriptor handed off from the FMG world map
//     via sessionStorage, or carried in a `city/#…` link (site/incomingSite.ts).
//     Geography is then fixed; only the seed re-rolls the street layout.
//
// Two sliders: "Drawing process" (S0 grid → S3 urban) with First/Prev/Next/Last,
// and "Grid evolution" over the S0 Lloyd passes. See docs/city-generator/design.md.

import { generateCity } from "../core/pipeline";
import { makeRng } from "../core/prng";
import {
  type CityGeography,
  type CityParams,
  type CityProgram,
  DEFAULT_WALL_PLAN,
  type GenerationResult
} from "../core/types";
import {
  bindCityInspector,
  renderCity,
  type SvgPickInfo,
  showFamily,
  showGridStage,
  showStep,
  showUrbanStage
} from "../render/svg";
import type { BurgSiteDescriptor } from "../site/burgSiteDescriptor";
import { buildCityExport, type CityExport, cityExportFilename } from "../site/cityExport";
import { parseCityExport } from "../site/cityImport";
import { CITY_SITE_KEY, type IncomingOrigin, readIncomingSite, siteLinkFor } from "../site/incomingSite";
import { PRESETS, type PresetId } from "../site/presets";
import {
  type CityFeatureSet,
  type CoastShape,
  DEFAULT_SITE_CONFIG,
  FEATURE_KEYS,
  type RiverShape,
  randomSiteConfig,
  type SiteConfig,
  WALL_COAST_CHOICES,
  WALL_ENVELOPE_CHOICES,
  WALL_LINE_CHOICES,
  type WallChoice
} from "../site/siteConfig";
import { resolveWallPlan, siteToGeography, siteToParams, siteToProgram } from "../site/siteInput";
import { synthSite } from "../site/synthSite";

interface View {
  tx: number;
  ty: number;
  scale: number;
}

/** Where the generation window's geography comes from. */
type Mode =
  | { kind: "synth" }
  | { kind: "imported"; descriptor: BurgSiteDescriptor; origin: IncomingOrigin }
  /** A validated Export for AI JSON file. Its resolved inputs are authoritative. */
  | { kind: "export"; data: CityExport };

/** One generation: the result plus the exact inputs that produced it, so the
 * "Export for AI" file can carry a faithful reproduction key. */
interface Built {
  result: GenerationResult;
  descriptor: BurgSiteDescriptor;
  params: CityParams;
  geo: CityGeography;
  program: CityProgram;
}

const COASTS: { id: CoastShape; label: string }[] = [
  { id: "none", label: "None" },
  { id: "straight", label: "Straight" },
  { id: "bay", label: "Bay" },
  { id: "cape", label: "Cape" }
];
const RIVER_SHAPE_LABELS: { id: RiverShape; label: string }[] = [
  { id: "through", label: "Through" },
  { id: "beside", label: "Beside" },
  { id: "toCoast", label: "To coast" },
  { id: "straight", label: "Straight" },
  { id: "meander", label: "Meander" },
  { id: "greatBend", label: "Great bend" }
];

export function mountCityGenerator(root: HTMLElement): void {
  root.replaceChildren();

  const incoming = readIncomingSite();
  let mode: Mode = incoming
    ? { kind: "imported", descriptor: incoming.descriptor, origin: incoming.origin }
    : { kind: "synth" };

  let preset: PresetId = "smallCity";
  let config: SiteConfig = { ...DEFAULT_SITE_CONFIG };
  let seed = incoming ? incoming.descriptor.burg.seed : randomSeed();
  // S3 urban-core debug override (towngen-comparison.md §2.1): unset = the
  // normal radius cutoff; set = TownGeneratorTS-style "first nPatches" count
  // cutoff, tunable live from the Drawing-process panel.
  let urbanNPatches: number | null = null;
  let built: Built = build();
  let result: GenerationResult = built.result;
  let family: "grid" | "step" | "urban" = "step";
  let stepIndex = result.steps.length - 1;
  let gridIndex = result.gridStages.length - 1;
  let urbanIndex = -1;
  const view: View = { tx: 0, ty: 0, scale: 1 };

  const canvas = div("cg-canvas");
  const viewport = div("cg-viewport-host");
  canvas.appendChild(viewport);

  const options = buildOptionsPanel({
    getMode: () => mode,
    getPreset: () => preset,
    getConfig: () => config,
    getSeed: () => seed,
    onPreset: id => {
      preset = id;
      seed = randomSeed();
      regenerate();
    },
    onConfig: next => {
      config = next;
      seed = randomSeed();
      regenerate();
    },
    onRandomize: () => {
      seed = randomSeed();
      config = randomSiteConfig(makeRng(`site:${seed}:${randomSeed()}`));
      regenerate();
    },
    onSeedInput: value => {
      seed = value;
    },
    onGenerate: () => {
      if (!seed.trim()) seed = randomSeed();
      regenerate();
    },
    onUseStandalone: () => {
      forgetImportedSite();
      mode = { kind: "synth" };
      seed = randomSeed();
      regenerate();
    },
    onCopyLink: async btn => {
      if (mode.kind !== "imported") return;
      try {
        await navigator.clipboard.writeText(siteLinkFor(mode.descriptor));
        flash(btn, "Link copied");
      } catch {
        flash(btn, "Copy failed");
      }
    },
    onImport: async btn => {
      const data = await pickCityExport();
      if (!data) {
        flash(btn, "Import failed");
        return;
      }
      forgetImportedSite();
      mode = { kind: "export", data };
      seed = data.settings.seed;
      if (data.settings.mode === "standalone") {
        preset = data.settings.preset?.id ?? preset;
        config = data.settings.siteConfig ?? config;
      }
      regenerate();
      flash(btn, "Imported");
    },
    onExport: btn => {
      const sourceMode = exportSourceMode(mode, preset, config);
      const data = buildCityExport({
        mode: sourceMode,
        seed,
        descriptor: built.descriptor,
        params: built.params,
        geography: built.geo,
        program: built.program,
        result: built.result,
        link: exportLink(mode)
      });
      downloadJson(cityExportFilename(data), data);
      flash(btn, "Exported");
    }
  });

  const inspector = buildInspectorPanel();

  const process = buildProcessPanel({
    getResult: () => result,
    getStepIndex: () => stepIndex,
    getGridIndex: () => gridIndex,
    getUrbanIndex: () => urbanIndex,
    getNPatches: () => urbanNPatches,
    onStep: index => {
      stepIndex = index;
      family = "step";
      showFamily(svg(), "step");
      showStep(svg(), index);
      inspector.clear();
    },
    onGrid: index => {
      gridIndex = index;
      if (index < 0) {
        family = "step";
        showFamily(svg(), "step");
        showStep(svg(), stepIndex);
      } else {
        family = "grid";
        showFamily(svg(), "grid");
        showGridStage(svg(), index);
      }
      inspector.clear();
    },
    onUrban: index => {
      urbanIndex = index;
      if (index < 0) {
        family = "step";
        showFamily(svg(), "step");
        showStep(svg(), stepIndex);
      } else {
        family = "urban";
        showFamily(svg(), "urban");
        showUrbanStage(svg(), index);
      }
      inspector.clear();
    },
    onNPatches: value => {
      urbanNPatches = value;
      regenerate();
    },
    onToggleSites: () => draw()
  });

  root.append(canvas, options.root, process.root, inspector.root);
  attachPanZoom(canvas, view, applyView);
  draw();

  /** The S3 debug override on top of whatever params a mode branch derives. */
  function withNPatches(params: CityParams): CityParams {
    return urbanNPatches != null ? { ...params, urbanNPatches } : params;
  }

  function build(): Built {
    if (mode.kind === "export") {
      const { descriptor, resolved } = mode.data.settings;
      const { geography: geo, program } = resolved;
      const params = withNPatches(resolved.params);
      return { result: generateCity(params, geo, program), descriptor, params, geo, program };
    }
    if (mode.kind === "imported") {
      // Geography + programme are the real descriptor; the seed still drives grid
      // + street RNG so "Generate" re-rolls the layout for the same burg.
      const descriptor = mode.descriptor;
      const params = withNPatches({ ...siteToParams(descriptor), seed });
      const geo = siteToGeography(descriptor);
      const program = siteToProgram(descriptor);
      return { result: generateCity(params, geo, program), descriptor, params, geo, program };
    }
    const descriptor = synthSite(preset, config, seed);
    const geo = siteToGeography(descriptor);
    const base = siteToProgram(descriptor);
    // Apply the standalone Wall row on top of the matrix plan (wall-patterns.md).
    const program: CityProgram = {
      ...base,
      wallPlan: resolveWallPlan(base.wallPlan ?? DEFAULT_WALL_PLAN, config.wall)
    };
    const params = withNPatches(siteToParams(descriptor));
    return { result: generateCity(params, geo, program), descriptor, params, geo, program };
  }

  function regenerate(): void {
    built = build();
    result = built.result;
    stepIndex = result.steps.length - 1;
    gridIndex = result.gridStages.length - 1;
    urbanIndex = -1;
    family = "step";
    options.sync();
    process.sync();
    draw();
  }

  function draw(): void {
    inspector.clear();
    const map = renderCity(result, {
      family,
      gridIndex,
      stepIndex,
      urbanIndex,
      showSites: process.showSites(),
      showRadius: true
    });
    bindCityInspector(map, (info, element) => inspector.show(info, element));
    viewport.replaceChildren(map);
    applyView();
  }

  function svg(): SVGSVGElement {
    return viewport.querySelector("svg") as SVGSVGElement;
  }

  function applyView(): void {
    const g = viewport.querySelector<SVGGElement>(".cg-viewport");
    if (g) g.setAttribute("transform", `translate(${view.tx} ${view.ty}) scale(${view.scale})`);
  }
}

interface InspectorPanel {
  root: HTMLElement;
  show(info: SvgPickInfo | null, element: Element | null): void;
  clear(): void;
}

function buildInspectorPanel(): InspectorPanel {
  const root = div("cg-panel cg-panel--inspector");
  root.hidden = true;
  root.setAttribute("aria-live", "polite");
  const title = heading("Inspector");
  const kind = document.createElement("strong");
  kind.className = "cg-inspector-kind";
  const content = document.createElement("pre");
  content.className = "cg-inspector-content";
  const clearButton = button("Clear selection", () => clear());
  root.append(title, kind, content, clearButton);
  let selected: Element | null = null;

  const clear = (): void => {
    selected?.classList.remove("cg-is-selected");
    selected = null;
    root.hidden = true;
    kind.textContent = "";
    content.textContent = "";
  };
  const show = (info: SvgPickInfo | null, element: Element | null): void => {
    if (!info) {
      clear();
      return;
    }
    selected = element;
    root.hidden = false;
    kind.textContent = info.label;
    content.textContent = JSON.stringify(info, null, 2);
  };
  return { root, show, clear };
}

/** Drop the hand-off so a reload of this tab stays standalone. */
function forgetImportedSite(): void {
  try {
    sessionStorage.removeItem(CITY_SITE_KEY);
  } catch {
    /* storage blocked — nothing to clear */
  }
  if (typeof location !== "undefined" && location.hash) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

// --- options panel ---------------------------------------------------------------

interface OptionsHandlers {
  getMode(): Mode;
  getPreset(): PresetId;
  getConfig(): SiteConfig;
  getSeed(): string;
  onPreset(id: PresetId): void;
  onConfig(next: SiteConfig): void;
  onRandomize(): void;
  onSeedInput(value: string): void;
  onGenerate(): void;
  onUseStandalone(): void;
  onCopyLink(btn: HTMLButtonElement): void;
  onImport(btn: HTMLButtonElement): Promise<void>;
  onExport(btn: HTMLButtonElement): void;
}

function buildOptionsPanel(h: OptionsHandlers): { root: HTMLElement; sync(): void } {
  const root = div("cg-panel cg-panel--options");
  root.appendChild(heading("Generation options"));

  // Imported-site readout (M3) — shown only when a real descriptor drove the run.
  const imported = div("cg-imported");
  const importedText = div("cg-imported-body");
  const copyLink = button("Copy shareable link", () => h.onCopyLink(copyLink));
  const useStandalone = button("Use standalone site", h.onUseStandalone);
  imported.append(subheading("Imported site"), importedText, copyLink, useStandalone);
  root.appendChild(imported);

  const presetRow = div("cg-choices");
  const presetButtons = PRESETS.map(p => choice(p.label, () => h.onPreset(p.id), p.id));
  for (const c of presetButtons) presetRow.appendChild(c.el);
  const presetHead = subheading("Size");
  root.append(presetHead, presetRow);

  const patch = (delta: Partial<SiteConfig>): void => h.onConfig({ ...h.getConfig(), ...delta });

  // Coast shape. Picking a coast raises the Port toggle (a harbour needs water);
  // it is not lowered again — the Port button just disables when coast is None.
  const selectCoast = (coast: CoastShape): void => {
    const cfg = h.getConfig();
    const features = coast !== "none" && !cfg.features.port ? { ...cfg.features, port: true } : cfg.features;
    h.onConfig({ ...cfg, coast, features });
  };
  const coastRow = div("cg-choices");
  const coastButtons = COASTS.map(c => choice(c.label, () => selectCoast(c.id), c.id));
  for (const c of coastButtons) coastRow.appendChild(c.el);
  const coastHead = subheading("Coast");
  root.append(coastHead, coastRow);

  // River count.
  const countRow = div("cg-choices");
  const countButtons = ([0, 1, 2] as const).map(n =>
    choice(String(n), () => patch({ rivers: riversOfLength(h.getConfig().rivers, n) }), String(n))
  );
  for (const c of countButtons) countRow.appendChild(c.el);
  const countHead = subheading("Rivers");
  root.append(countHead, countRow);

  // Shape of the first river.
  const shapeRow = div("cg-choices");
  const shapeButtons = RIVER_SHAPE_LABELS.map(s =>
    choice(s.label, () => patch({ rivers: withFirstShape(h.getConfig().rivers, s.id) }), s.id)
  );
  for (const c of shapeButtons) shapeRow.appendChild(c.el);
  const shapeHead = subheading("River shape");
  root.append(shapeHead, shapeRow);

  // Relief + randomize.
  const reliefRow = div("cg-check-row");
  const reliefLabel = document.createElement("label");
  const relief = document.createElement("input");
  relief.type = "checkbox";
  relief.addEventListener("change", () => patch({ relief: relief.checked }));
  reliefLabel.append(relief, document.createTextNode(" Hilltop relief"));
  reliefRow.appendChild(reliefLabel);
  root.appendChild(reliefRow);

  // Features — the Burg-editor Feature toggles, standalone-editable (design §3.4).
  // Port needs water, so it disables when Coast is None.
  const featureRow = div("cg-choices");
  const featureButtons = FEATURE_KEYS.map(key =>
    choice(
      featureLabel(key),
      () => {
        const cur = h.getConfig().features;
        patch({ features: { ...cur, [key]: !cur[key] } });
      },
      key
    )
  );
  for (const c of featureButtons) featureRow.appendChild(c.el);
  const featureHead = subheading("Features");
  root.append(featureHead, featureRow);

  // Wall pattern (wall-patterns.md). "Auto" = the §8 matrix; the rest override it.
  const patchWall = (delta: Partial<WallChoice>): void => patch({ wall: { ...h.getConfig().wall, ...delta } });
  const wallRow = <K extends keyof WallChoice>(
    label: string,
    key: K,
    values: readonly WallChoice[K][]
  ): { head: HTMLElement; row: HTMLElement; buttons: { el: HTMLButtonElement; key: string }[] } => {
    const row = div("cg-choices");
    const buttons = values.map(v =>
      choice(
        v === "auto" ? "Auto" : titleCase(String(v)),
        () => patchWall({ [key]: v } as Partial<WallChoice>),
        String(v)
      )
    );
    for (const c of buttons) row.appendChild(c.el);
    return { head: subheading(label), row, buttons };
  };
  const wallEnvelope = wallRow("Wall shape", "envelope", WALL_ENVELOPE_CHOICES);
  const wallCoast = wallRow("Wall coast", "coast", WALL_COAST_CHOICES);
  const wallLine = wallRow("Wall line", "line", WALL_LINE_CHOICES);
  root.append(wallEnvelope.head, wallEnvelope.row, wallCoast.head, wallCoast.row, wallLine.head, wallLine.row);

  const randomize = button("Randomize site", h.onRandomize);
  root.appendChild(randomize);

  // Everything above that only makes sense for the synthetic path.
  const synthOnly = [
    presetHead,
    presetRow,
    coastHead,
    coastRow,
    countHead,
    countRow,
    shapeHead,
    shapeRow,
    reliefRow,
    featureHead,
    featureRow,
    wallEnvelope.head,
    wallEnvelope.row,
    wallCoast.head,
    wallCoast.row,
    wallLine.head,
    wallLine.row,
    randomize
  ];

  const seedField = div("cg-field");
  const seedLabel = document.createElement("label");
  seedLabel.textContent = "Seed";
  const seedInput = document.createElement("input");
  seedInput.type = "text";
  seedInput.spellcheck = false;
  seedInput.value = h.getSeed();
  seedInput.addEventListener("input", () => h.onSeedInput(seedInput.value));
  seedInput.addEventListener("keydown", e => {
    if (e.key === "Enter") h.onGenerate();
  });
  seedLabel.appendChild(seedInput);
  seedField.appendChild(seedLabel);
  root.appendChild(seedField);

  const generate = button("Generate", h.onGenerate);
  generate.className = "cg-generate";
  root.appendChild(generate);

  // The file picker is created on demand, so it never needs to be part of the
  // visual layout or the form tab order.
  const importBtn = button("Import city (JSON)", () => void h.onImport(importBtn));
  root.appendChild(importBtn);

  // Works in both modes — the JSON keeps the AI/reproduction data and embeds
  // a native City Editor document, so the same file can be opened there.
  const exportBtn = button("Export for AI / City Editor (JSON)", () => h.onExport(exportBtn));
  root.appendChild(exportBtn);

  const sync = (): void => {
    const mode = h.getMode();
    const cfg = h.getConfig();
    seedInput.value = h.getSeed();
    for (const c of presetButtons) c.el.classList.toggle("is-active", c.key === h.getPreset());
    for (const c of coastButtons) c.el.classList.toggle("is-active", c.key === cfg.coast);
    for (const c of countButtons) c.el.classList.toggle("is-active", c.key === String(cfg.rivers.length));
    const shapeActive = cfg.rivers[0] ?? null;
    for (const c of shapeButtons) {
      c.el.classList.toggle("is-active", c.key === shapeActive);
      c.el.disabled = cfg.rivers.length === 0;
    }
    relief.checked = cfg.relief;
    for (const c of featureButtons) {
      c.el.classList.toggle("is-active", cfg.features[c.key]);
      if (c.key === "port") c.el.disabled = cfg.coast === "none";
    }
    for (const c of wallEnvelope.buttons) c.el.classList.toggle("is-active", c.key === cfg.wall.envelope);
    for (const c of wallLine.buttons) c.el.classList.toggle("is-active", c.key === cfg.wall.line);
    for (const c of wallCoast.buttons) {
      c.el.classList.toggle("is-active", c.key === cfg.wall.coast);
      c.el.disabled = cfg.coast === "none"; // a coast wall needs a coast
    }

    const isImported = mode.kind !== "synth";
    const isExport = mode.kind === "export";
    imported.style.display = isImported ? "grid" : "none";
    for (const node of synthOnly) node.style.display = isImported ? "none" : "";
    seedField.style.display = isExport ? "none" : "";
    generate.style.display = isExport ? "none" : "";
    copyLink.style.display = mode.kind === "imported" ? "" : "none";
    if (mode.kind === "imported") importedText.replaceChildren(...describeDescriptor(mode.descriptor, mode.origin));
    else if (mode.kind === "export") importedText.replaceChildren(...describeExport(mode.data));
  };
  sync();
  return { root, sync };
}

/** Read-only summary of an imported Export for AI file. */
function describeExport(data: CityExport): Node[] {
  const descriptor = data.settings.descriptor;
  const source = data.settings.mode === "standalone" ? "standalone generator" : "FMG world-map site";
  const rows: [string, string][] = [
    ["Imported JSON", descriptor.burg.name || "(unnamed city)"],
    ["Original source", source],
    ["Seed", data.settings.seed],
    ["Reproduction", "Exact resolved inputs"]
  ];
  return rows.map(([k, v]) => {
    const line = div("cg-imported-row");
    const key = document.createElement("span");
    key.textContent = k;
    const val = document.createElement("strong");
    val.textContent = v;
    line.append(key, val);
    return line;
  });
}

/** Compact lines summarising what was imported — for the "does it fit the map?" check.
 * Features are read-only here: imported geography (and its programme) is fixed. */
function describeDescriptor(d: BurgSiteDescriptor, origin: IncomingOrigin): Node[] {
  const water = d.waterbody ? `${d.waterbody.kind}${d.waterbody.isPort ? " · port" : ""}` : "none";
  const yesNo = (b: boolean): string => (b ? "Yes" : "No");
  const downstream = d.rivers
    .filter(r => r.downstream.terminal === "ocean" || r.downstream.terminal === "lake")
    .sort((a, b) => a.downstream.distanceMeters - b.downstream.distanceMeters)[0]?.downstream;
  const rows: [string, string][] = [
    [origin === "world" ? "From world map" : "From shared link", d.burg.name || "(unnamed burg)"],
    ["Population", d.burg.population.toLocaleString()],
    ["Radius", `${Math.round(d.frame.cityRadiusMeters)} m`],
    ["Coast", water],
    ["Rivers", String(d.rivers.length)],
    [
      "Downstream water",
      downstream
        ? `${downstream.terminal} · ${(downstream.distanceMeters / 1000).toFixed(1)} km · ${Math.round(downstream.bearingDeg)}°`
        : "none in river data"
    ],
    ["Gates", String(d.suggestedGates)],
    ["Walls", yesNo(d.burg.walls)],
    ["Citadel", yesNo(d.burg.citadel)],
    ["Plaza / Temple", `${yesNo(d.burg.plaza)} · ${yesNo(d.burg.temple)}`],
    ["Port", d.burg.port ? (d.waterbody ? "Yes" : "Yes (no waterbody)") : "No"],
    ["Shanty", yesNo(d.burg.shanty)]
  ];
  return rows.map(([k, v]) => {
    const line = div("cg-imported-row");
    const key = document.createElement("span");
    key.textContent = k;
    const val = document.createElement("strong");
    val.textContent = v;
    line.append(key, val);
    return line;
  });
}

/** Grow / shrink the river list to `n`, keeping existing shapes; new slots = "through". */
function riversOfLength(current: RiverShape[], n: number): RiverShape[] {
  return Array.from({ length: n }, (_, i) => current[i] ?? "through");
}

function withFirstShape(current: RiverShape[], shape: RiverShape): RiverShape[] {
  if (current.length === 0) return [shape];
  return [shape, ...current.slice(1)];
}

/** "port" → "Port". */
function featureLabel(key: keyof CityFeatureSet): string {
  return titleCase(key);
}

/** "notchFilled" → "Notch filled". */
function titleCase(s: string): string {
  const spaced = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// --- drawing-process panel -----------------------------------------------------

interface ProcessHandlers {
  getResult(): GenerationResult;
  getStepIndex(): number;
  getGridIndex(): number;
  getUrbanIndex(): number;
  /** The live `urbanNPatches` debug override, or null when unset (radius cutoff). */
  getNPatches(): number | null;
  onStep(index: number): void;
  onGrid(index: number): void;
  onUrban(index: number): void;
  /** Changes the S3 count cutoff and regenerates the town. */
  onNPatches(value: number | null): void;
  onToggleSites(): void;
}

function buildProcessPanel(h: ProcessHandlers): { root: HTMLElement; sync(): void; showSites(): boolean } {
  const root = div("cg-panel cg-panel--process");
  root.appendChild(heading("Drawing process"));

  const stepSlider = rangeInput();
  const gridSlider = rangeInput();
  const urbanSlider = rangeInput();
  const stepStatus = document.createElement("output");
  const gridStatus = document.createElement("output");
  const urbanStatus = document.createElement("output");

  const setStepStatus = (): void => {
    stepStatus.textContent = h.getResult().steps[h.getStepIndex()]?.label ?? "";
  };
  const setGridStatus = (): void => {
    const idx = h.getGridIndex();
    const stages = h.getResult().gridStages;
    gridStatus.textContent =
      gridSlider.value === "0" || idx < 0 ? "off" : `${stages[idx].label}  (${stages[idx].cells.length} cells)`;
  };
  const setUrbanStatus = (): void => {
    const idx = h.getUrbanIndex();
    const stages = h.getResult().urbanStages;
    urbanStatus.textContent =
      urbanSlider.value === "0" || idx < 0
        ? "off"
        : `step ${idx + 1}/${stages.length}  (${stages[idx].urban.length} cells, #${stages[idx].cellId} added)`;
  };

  stepSlider.addEventListener("input", () => {
    gridSlider.value = "0";
    urbanSlider.value = "0";
    h.onStep(Number(stepSlider.value));
    setStepStatus();
    setGridStatus();
    setUrbanStatus();
  });
  gridSlider.addEventListener("input", () => {
    urbanSlider.value = "0";
    const value = Number(gridSlider.value);
    h.onGrid(value === 0 ? -1 : value - 1);
    setGridStatus();
    setUrbanStatus();
  });
  urbanSlider.addEventListener("input", () => {
    gridSlider.value = "0";
    const value = Number(urbanSlider.value);
    h.onUrban(value === 0 ? -1 : value - 1);
    setUrbanStatus();
    setGridStatus();
  });

  const stepRow = div("cg-slider-row");
  const stepLabel = document.createElement("label");
  stepLabel.textContent = "Stage";
  stepRow.append(stepLabel, stepStatus, stepSlider);
  root.appendChild(stepRow);

  // First / Prev / Next / Last.
  const nav = div("cg-nav");
  const jump = (fn: (i: number, last: number) => number): void => {
    const last = h.getResult().steps.length - 1;
    stepSlider.value = String(clamp(fn(h.getStepIndex(), last), 0, last));
    stepSlider.dispatchEvent(new Event("input"));
  };
  for (const [text, fn] of [
    ["First", () => 0],
    ["Prev", (i: number) => i - 1],
    ["Next", (i: number) => i + 1],
    ["Last", (_i: number, last: number) => last]
  ] as [string, (i: number, last: number) => number][]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.addEventListener("click", () => jump(fn));
    nav.appendChild(b);
  }
  root.appendChild(nav);

  const gridRow = div("cg-slider-row");
  const gridLabel = document.createElement("label");
  gridLabel.textContent = "Grid evolution";
  gridRow.append(gridLabel, gridStatus, gridSlider);
  root.appendChild(gridRow);

  // S3 urban-core debug tool (towngen-comparison.md §2.1): a count cutoff to try
  // in place of the radius cutoff, and a per-cell step-through of the flood-fill
  // so a tweak to the cost function / the cutoff can be checked by eye.
  const nPatchesField = div("cg-field");
  const nPatchesLabel = document.createElement("label");
  nPatchesLabel.textContent = "Urban nPatches (blank = radius cutoff)";
  const nPatchesInput = document.createElement("input");
  nPatchesInput.type = "number";
  nPatchesInput.min = "1";
  nPatchesInput.step = "1";
  nPatchesInput.placeholder = "auto";
  nPatchesInput.addEventListener("change", () => {
    const raw = nPatchesInput.value.trim();
    if (raw === "") {
      h.onNPatches(null);
      return;
    }
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 1) {
      nPatchesInput.value = h.getNPatches() != null ? String(h.getNPatches()) : "";
      return;
    }
    h.onNPatches(n);
  });
  nPatchesLabel.appendChild(nPatchesInput);
  nPatchesField.appendChild(nPatchesLabel);
  root.appendChild(nPatchesField);

  const urbanRow = div("cg-slider-row");
  const urbanLabel = document.createElement("label");
  urbanLabel.textContent = "Urban core evolution";
  urbanRow.append(urbanLabel, urbanStatus, urbanSlider);
  root.appendChild(urbanRow);

  const sitesRow = div("cg-check-row");
  const sitesLabel = document.createElement("label");
  const sites = document.createElement("input");
  sites.type = "checkbox";
  sites.addEventListener("change", h.onToggleSites);
  sitesLabel.append(sites, document.createTextNode(" Show sites + river edge-track"));
  sitesRow.appendChild(sitesLabel);
  root.appendChild(sitesRow);

  const sync = (): void => {
    const { steps, gridStages, urbanStages } = h.getResult();
    stepSlider.max = String(steps.length - 1);
    stepSlider.value = String(h.getStepIndex());
    gridSlider.max = String(gridStages.length);
    gridSlider.value = "0";
    urbanSlider.max = String(urbanStages.length);
    urbanSlider.value = "0";
    const patches = h.getNPatches();
    nPatchesInput.value = patches != null ? String(patches) : "";
    setStepStatus();
    setGridStatus();
    setUrbanStatus();
  };
  sync();
  return { root, sync, showSites: () => sites.checked };
}

// --- pan / zoom ---------------------------------------------------------------

function attachPanZoom(canvas: HTMLElement, view: View, apply: () => void): void {
  let dragging = false;
  let hasDragged = false;
  let suppressNextClick = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("pointerdown", e => {
    if ((e.target as HTMLElement).closest(".cg-panel")) return;
    if (e.button !== 0) return;
    dragging = true;
    hasDragged = false;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  canvas.addEventListener("pointermove", e => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    if (!hasDragged && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      hasDragged = true;
      suppressNextClick = true;
      canvas.setPointerCapture(e.pointerId);
    }
    if (!hasDragged) return;
    view.tx += dx;
    view.ty += dy;
    lastX = e.clientX;
    lastY = e.clientY;
    apply();
  });
  const endDrag = (e: PointerEvent): void => {
    dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // Pointer capture starts only after the movement threshold, preserving normal
  // SVG click targets for the Inspector while keeping drag gestures click-free.
  canvas.addEventListener(
    "click",
    e => {
      if (!suppressNextClick) return;
      e.stopPropagation();
      e.preventDefault();
      suppressNextClick = false;
    },
    true
  );

  canvas.addEventListener(
    "wheel",
    e => {
      if ((e.target as HTMLElement).closest(".cg-panel")) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const next = clamp(view.scale * Math.exp(-e.deltaY * 0.0015), 0.25, 12);
      const applied = next / view.scale;
      view.tx = px - (px - view.tx) * applied;
      view.ty = py - (py - view.ty) * applied;
      view.scale = next;
      apply();
    },
    { passive: false }
  );
}

// --- helpers ---------------------------------------------------------------

function choice<K extends string>(label: string, onClick: () => void, key: K): { el: HTMLButtonElement; key: K } {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  el.addEventListener("click", onClick);
  return { el, key };
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  el.addEventListener("click", onClick);
  return el;
}

/** Briefly swap a button's label to signal an async action's outcome. */
function flash(btn: HTMLButtonElement, text: string): void {
  const original = btn.dataset.label ?? btn.textContent ?? "";
  btn.dataset.label = original;
  btn.textContent = text;
  window.setTimeout(() => {
    btn.textContent = btn.dataset.label ?? original;
  }, 1200);
}

function rangeInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.step = "1";
  return input;
}

function div(className: string): HTMLDivElement {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

function heading(text: string): HTMLElement {
  const h1 = document.createElement("h1");
  h1.textContent = text;
  return h1;
}

function subheading(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "cg-subhead";
  p.textContent = text;
  return p;
}

function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36);
}

/** Open a JSON file picker and return a validated city-generator export. */
function pickCityExport(): Promise<CityExport | null> {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", () =>
          resolve(typeof reader.result === "string" ? parseCityExport(reader.result) : null)
        );
        reader.addEventListener("error", () => resolve(null));
        reader.readAsText(file);
      },
      { once: true }
    );
    input.click();
  });
}

function exportSourceMode(
  mode: Mode,
  preset: PresetId,
  config: SiteConfig
): { kind: "standalone"; preset: PresetId; config: SiteConfig } | { kind: "imported"; origin: IncomingOrigin } {
  if (mode.kind === "imported") return { kind: "imported", origin: mode.origin };
  if (mode.kind === "export" && mode.data.settings.mode === "imported") {
    return { kind: "imported", origin: mode.data.settings.origin ?? "link" };
  }
  if (mode.kind === "export" && mode.data.settings.mode === "standalone") {
    return {
      kind: "standalone",
      preset: mode.data.settings.preset?.id ?? preset,
      config: mode.data.settings.siteConfig ?? config
    };
  }
  return { kind: "standalone", preset, config };
}

function exportLink(mode: Mode): string | null {
  if (mode.kind === "imported") return siteLinkFor(mode.descriptor);
  if (mode.kind === "export" && mode.data.settings.mode === "imported") return mode.data.settings.shareableLink ?? null;
  return null;
}

/** Serialise `data` and hand the browser a download. */
function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
