// City Generator — vanilla DOM shell.
//
// M1: standalone, preset-only. Size presets + seed + "Grid evolution" slider over
// the S0 (grid) snapshots, on a pan/zoom SVG canvas. Generation-step slider,
// layer toggles and FMG site import arrive in M2/M3 (docs/city-generator/design.md §7).

import { generateCity } from "../core/pipeline";
import type { GenerationResult } from "../core/types";
import { renderCity, showStage } from "../render/svg";
import { PRESETS, type PresetId, presetParams } from "../site/presets";

interface View {
  tx: number;
  ty: number;
  scale: number;
}

export function mountCityGenerator(root: HTMLElement): void {
  root.replaceChildren();

  let preset: PresetId = "smallCity";
  let seed = randomSeed();
  let result: GenerationResult = generateCity(presetParams(preset, seed));
  let stageIndex = result.gridStages.length - 1;
  const view: View = { tx: 0, ty: 0, scale: 1 };

  const canvas = div("cg-canvas");
  const viewport = div("cg-viewport-host");
  canvas.appendChild(viewport);

  const options = buildOptionsPanel({
    getPreset: () => preset,
    getSeed: () => seed,
    onPreset: id => {
      preset = id;
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
    getStageIndex: () => stageIndex,
    onStage: index => {
      stageIndex = index;
      showStage(svg(), index);
    },
    onToggleSites: () => draw()
  });

  root.append(canvas, options.root, process.root);

  attachPanZoom(canvas, view, applyView);
  draw();

  function regenerate(): void {
    result = generateCity(presetParams(preset, seed));
    stageIndex = result.gridStages.length - 1;
    options.sync();
    process.sync();
    draw();
  }

  function draw(): void {
    const rendered = renderCity(result, {
      stageIndex,
      showSites: process.showSites(),
      showRadius: true
    });
    viewport.replaceChildren(rendered);
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

// --- panels -----------------------------------------------------------------

interface OptionsHandlers {
  getPreset(): PresetId;
  getSeed(): string;
  onPreset(id: PresetId): void;
  onSeedInput(value: string): void;
  onGenerate(): void;
}

function buildOptionsPanel(h: OptionsHandlers): { root: HTMLElement; sync(): void } {
  const root = div("cg-panel cg-panel--options");
  root.appendChild(heading("Generation options"));

  const presetRow = div("cg-presets");
  const buttons = PRESETS.map(p => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = p.label;
    b.addEventListener("click", () => h.onPreset(p.id));
    presetRow.appendChild(b);
    return { id: p.id, b };
  });
  root.appendChild(presetRow);

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
    for (const { id, b } of buttons) b.classList.toggle("is-active", id === h.getPreset());
  };
  sync();
  return { root, sync };
}

interface ProcessHandlers {
  getResult(): GenerationResult;
  getStageIndex(): number;
  onStage(index: number): void;
  onToggleSites(): void;
}

function buildProcessPanel(h: ProcessHandlers): { root: HTMLElement; sync(): void; showSites(): boolean } {
  const root = div("cg-panel cg-panel--process");
  root.appendChild(heading("Drawing process"));

  const row = div("cg-slider-row");
  const label = document.createElement("label");
  label.textContent = "Grid evolution";
  const status = document.createElement("output");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.step = "1";

  const setStatus = (): void => {
    const idx = h.getStageIndex();
    const stages = h.getResult().gridStages;
    status.textContent = idx < 0 ? "hidden" : `${stages[idx].label}  (${stages[idx].cells.length} cells)`;
  };

  slider.addEventListener("input", () => {
    const value = Number(slider.value);
    h.onStage(value === 0 ? -1 : value - 1);
    setStatus();
  });

  row.append(label, status, slider);
  root.appendChild(row);

  const sitesRow = div("cg-check-row");
  const sitesLabel = document.createElement("label");
  const sites = document.createElement("input");
  sites.type = "checkbox";
  sites.addEventListener("change", h.onToggleSites);
  sitesLabel.append(sites, document.createTextNode(" Show sites"));
  sitesRow.appendChild(sitesLabel);
  root.appendChild(sitesRow);

  const sync = (): void => {
    const count = h.getResult().gridStages.length;
    slider.max = String(count);
    slider.value = String(h.getStageIndex() + 1);
    setStatus();
  };
  sync();
  return { root, sync, showSites: () => sites.checked };
}

// --- pan / zoom -----------------------------------------------------------------

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
      const factor = Math.exp(-e.deltaY * 0.0015);
      const next = clamp(view.scale * factor, 0.25, 12);
      const applied = next / view.scale;
      view.tx = px - (px - view.tx) * applied;
      view.ty = py - (py - view.ty) * applied;
      view.scale = next;
      apply();
    },
    { passive: false }
  );
}

// --- helpers -----------------------------------------------------------------

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

function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
