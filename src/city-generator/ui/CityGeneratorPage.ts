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
import type { GenerationResult } from "../core/types";
import { renderCity, showFamily, showGridStage, showStep } from "../render/svg";
import type { BurgSiteDescriptor } from "../site/burgSiteDescriptor";
import { CITY_SITE_KEY, type IncomingOrigin, readIncomingSite, siteLinkFor } from "../site/incomingSite";
import { PRESETS, type PresetId } from "../site/presets";
import {
  type CityFeatureSet,
  type CoastShape,
  DEFAULT_SITE_CONFIG,
  FEATURE_KEYS,
  type RiverShape,
  randomSiteConfig,
  type SiteConfig
} from "../site/siteConfig";
import { siteToGeography, siteToParams, siteToProgram } from "../site/siteInput";
import { synthSite } from "../site/synthSite";

interface View {
  tx: number;
  ty: number;
  scale: number;
}

/** Where the generation window's geography comes from. */
type Mode = { kind: "synth" } | { kind: "imported"; descriptor: BurgSiteDescriptor; origin: IncomingOrigin };

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
  let result: GenerationResult = build();
  let family: "grid" | "step" = "step";
  let stepIndex = result.steps.length - 1;
  let gridIndex = result.gridStages.length - 1;
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
    }
  });

  const process = buildProcessPanel({
    getResult: () => result,
    getStepIndex: () => stepIndex,
    getGridIndex: () => gridIndex,
    onStep: index => {
      stepIndex = index;
      family = "step";
      showFamily(svg(), "step");
      showStep(svg(), index);
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
    },
    onToggleSites: () => draw()
  });

  root.append(canvas, options.root, process.root);
  attachPanZoom(canvas, view, applyView);
  draw();

  function build(): GenerationResult {
    if (mode.kind === "imported") {
      // Geography + programme are the real descriptor; the seed still drives grid
      // + street RNG so "Generate" re-rolls the layout for the same burg.
      return generateCity(
        { ...siteToParams(mode.descriptor), seed },
        siteToGeography(mode.descriptor),
        siteToProgram(mode.descriptor)
      );
    }
    const site = synthSite(preset, config, seed);
    return generateCity(siteToParams(site), siteToGeography(site), siteToProgram(site));
  }

  function regenerate(): void {
    result = build();
    stepIndex = result.steps.length - 1;
    gridIndex = result.gridStages.length - 1;
    family = "step";
    options.sync();
    process.sync();
    draw();
  }

  function draw(): void {
    viewport.replaceChildren(
      renderCity(result, { family, gridIndex, stepIndex, showSites: process.showSites(), showRadius: true })
    );
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

    const isImported = mode.kind === "imported";
    imported.style.display = isImported ? "grid" : "none";
    for (const node of synthOnly) node.style.display = isImported ? "none" : "";
    if (isImported) importedText.replaceChildren(...describeDescriptor(mode.descriptor, mode.origin));
  };
  sync();
  return { root, sync };
}

/** Compact lines summarising what was imported — for the "does it fit the map?" check.
 * Features are read-only here: imported geography (and its programme) is fixed. */
function describeDescriptor(d: BurgSiteDescriptor, origin: IncomingOrigin): Node[] {
  const water = d.waterbody ? `${d.waterbody.kind}${d.waterbody.isPort ? " · port" : ""}` : "none";
  const yesNo = (b: boolean): string => (b ? "Yes" : "No");
  const rows: [string, string][] = [
    [origin === "world" ? "From world map" : "From shared link", d.burg.name || "(unnamed burg)"],
    ["Population", d.burg.population.toLocaleString()],
    ["Radius", `${Math.round(d.frame.cityRadiusMeters)} m`],
    ["Coast", water],
    ["Rivers", String(d.rivers.length)],
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
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// --- drawing-process panel -----------------------------------------------------

interface ProcessHandlers {
  getResult(): GenerationResult;
  getStepIndex(): number;
  getGridIndex(): number;
  onStep(index: number): void;
  onGrid(index: number): void;
  onToggleSites(): void;
}

function buildProcessPanel(h: ProcessHandlers): { root: HTMLElement; sync(): void; showSites(): boolean } {
  const root = div("cg-panel cg-panel--process");
  root.appendChild(heading("Drawing process"));

  const stepSlider = rangeInput();
  const gridSlider = rangeInput();
  const stepStatus = document.createElement("output");
  const gridStatus = document.createElement("output");

  const setStepStatus = (): void => {
    stepStatus.textContent = h.getResult().steps[h.getStepIndex()]?.label ?? "";
  };
  const setGridStatus = (): void => {
    const idx = h.getGridIndex();
    const stages = h.getResult().gridStages;
    gridStatus.textContent =
      gridSlider.value === "0" || idx < 0 ? "off" : `${stages[idx].label}  (${stages[idx].cells.length} cells)`;
  };

  stepSlider.addEventListener("input", () => {
    gridSlider.value = "0";
    h.onStep(Number(stepSlider.value));
    setStepStatus();
    setGridStatus();
  });
  gridSlider.addEventListener("input", () => {
    const value = Number(gridSlider.value);
    h.onGrid(value === 0 ? -1 : value - 1);
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

  const sitesRow = div("cg-check-row");
  const sitesLabel = document.createElement("label");
  const sites = document.createElement("input");
  sites.type = "checkbox";
  sites.addEventListener("change", h.onToggleSites);
  sitesLabel.append(sites, document.createTextNode(" Show sites + river edge-track"));
  sitesRow.appendChild(sitesLabel);
  root.appendChild(sitesRow);

  const sync = (): void => {
    const { steps, gridStages } = h.getResult();
    stepSlider.max = String(steps.length - 1);
    stepSlider.value = String(h.getStepIndex());
    gridSlider.max = String(gridStages.length);
    gridSlider.value = "0";
    setStepStatus();
    setGridStatus();
  };
  sync();
  return { root, sync, showSites: () => sites.checked };
}

// --- pan / zoom ---------------------------------------------------------------

function attachPanZoom(canvas: HTMLElement, view: View, apply: () => void): void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("pointerdown", e => {
    if ((e.target as HTMLElement).closest(".cg-panel")) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", e => {
    if (!dragging) return;
    view.tx += e.clientX - lastX;
    view.ty += e.clientY - lastY;
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

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
