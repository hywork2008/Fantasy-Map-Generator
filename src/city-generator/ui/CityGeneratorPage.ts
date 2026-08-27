// City Generator — vanilla DOM shell.
//
// M2: standalone. Size preset + site archetype + seed drive a synthetic
// BurgSiteDescriptor; the pipeline runs S0–S3. Two sliders: "Drawing process"
// (S0 grid → S3 urban) with First/Prev/Next/Last, and "Grid evolution" over the
// S0 Lloyd passes. FMG descriptor import lands in M3 (docs/city-generator/design.md §7).

import { generateCity } from "../core/pipeline";
import type { GenerationResult } from "../core/types";
import { renderCity, showFamily, showGridStage, showStep } from "../render/svg";
import type { BurgSiteArchetype } from "../site/burgSiteDescriptor";
import { PRESETS, type PresetId } from "../site/presets";
import { siteToGeography, siteToParams } from "../site/siteInput";
import { synthSite } from "../site/synthSite";

interface View {
  tx: number;
  ty: number;
  scale: number;
}

const ARCHETYPES: { id: BurgSiteArchetype; label: string }[] = [
  { id: "crossroads", label: "Crossroads" },
  { id: "riverCrossing", label: "River crossing" },
  { id: "harbor", label: "Harbor" },
  { id: "hillTop", label: "Hilltop" }
];

export function mountCityGenerator(root: HTMLElement): void {
  root.replaceChildren();

  let preset: PresetId = "smallCity";
  let archetype: BurgSiteArchetype = "riverCrossing";
  let seed = randomSeed();
  let result: GenerationResult = build();
  let family: "grid" | "step" = "step";
  let stepIndex = result.steps.length - 1;
  let gridIndex = result.gridStages.length - 1;
  const view: View = { tx: 0, ty: 0, scale: 1 };

  const canvas = div("cg-canvas");
  const viewport = div("cg-viewport-host");
  canvas.appendChild(viewport);

  const options = buildOptionsPanel({
    getPreset: () => preset,
    getArchetype: () => archetype,
    getSeed: () => seed,
    onPreset: id => {
      preset = id;
      seed = randomSeed();
      regenerate();
    },
    onArchetype: id => {
      archetype = id;
      seed = randomSeed();
      regenerate();
    },
    onSeedInput: value => {
      seed = value;
    },
    onGenerate: () => {
      if (!seed.trim()) seed = randomSeed();
      regenerate();
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
    const site = synthSite(preset, archetype, seed);
    return generateCity(siteToParams(site), siteToGeography(site));
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

// --- options panel ---------------------------------------------------------------

interface OptionsHandlers {
  getPreset(): PresetId;
  getArchetype(): BurgSiteArchetype;
  getSeed(): string;
  onPreset(id: PresetId): void;
  onArchetype(id: BurgSiteArchetype): void;
  onSeedInput(value: string): void;
  onGenerate(): void;
}

function buildOptionsPanel(h: OptionsHandlers): { root: HTMLElement; sync(): void } {
  const root = div("cg-panel cg-panel--options");
  root.appendChild(heading("Generation options"));

  const presetRow = div("cg-choices");
  const presetButtons = PRESETS.map(p => choice(p.label, () => h.onPreset(p.id), p.id));
  for (const c of presetButtons) presetRow.appendChild(c.el);
  root.append(subheading("Size"), presetRow);

  const archRow = div("cg-choices");
  const archButtons = ARCHETYPES.map(a => choice(a.label, () => h.onArchetype(a.id), a.id));
  for (const c of archButtons) archRow.appendChild(c.el);
  root.append(subheading("Site type"), archRow);

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

  const generate = document.createElement("button");
  generate.type = "button";
  generate.className = "cg-generate";
  generate.textContent = "Generate";
  generate.addEventListener("click", h.onGenerate);
  root.appendChild(generate);

  const sync = (): void => {
    seedInput.value = h.getSeed();
    for (const c of presetButtons) c.el.classList.toggle("is-active", c.key === h.getPreset());
    for (const c of archButtons) c.el.classList.toggle("is-active", c.key === h.getArchetype());
  };
  sync();
  return { root, sync };
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
  sitesLabel.append(sites, document.createTextNode(" Show sites (grid)"));
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
