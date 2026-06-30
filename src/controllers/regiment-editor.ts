import { drag, easeSinInOut, pointer, select, sum, transition } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";

import { drawRegiment, moveRegiment } from "../renderers/index";
import { GenerationPipeline } from "../services/generationPipeline";
import { clearMainTip, tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { elSelected, modules, setElSelected } from "../store/editorState";
import { getRegimentEditorState, setRegimentEditorState } from "../store/regimentEditorState";
import type { MilitaryRegiment } from "../types/models";
import type { WorldNote } from "../types/WorldState";
import { closeDialog, closeDialogs, openConfirm, openDialog } from "../ui/dialogs/dialogService";
import { findCell, last, rn } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { getElementBySelector, layerIsOn } from "../utils/nodeUtils";
import type { BattleRegiment } from "./battle-screen";
import { interactionManager } from "./interactionManager";
import { toggleMilitary } from "./layers";
import { editNotes } from "./notes-editor";

let worldContext: WorldContext;
let appServices: AppServices;

let _regDragState: {
  reg: MilitaryRegiment;
  w: number;
  h: number;
  size: number;
  self: boolean;
  baseRect: Element;
  text: Element;
  iconRect: Element;
  icon: SVGElement;
  image: SVGImageElement;
  baseLine: d3.Selection<SVGLineElement, unknown, null, undefined>;
  rotationControl: d3.Selection<SVGCircleElement, unknown, null, undefined>;
} | null = null;
let _baseDragReg: MilitaryRegiment | null = null;

function getRegEl(): SVGGElement {
  return elSelected!.node() as SVGGElement;
}

function getRegiment(): MilitaryRegiment | undefined {
  const el = getRegEl();
  return (worldContext.pack.states[+el.dataset.state!]?.military as MilitaryRegiment[] | undefined)?.find(
    r => r.i === +el.dataset.id!
  );
}

function syncRegimentState(regiment: MilitaryRegiment): void {
  const unitOptions = worldContext.options.military ?? [];
  setRegimentEditorState({
    regimentId: regiment.i,
    stateId: +getRegEl().dataset.state!,
    name: regiment.name,
    isNaval: !!regiment.n,
    icon: regiment.icon ?? "",
    units: unitOptions.map((u: { name: string; type: string }) => ({
      name: u.name,
      type: u.type,
      count: regiment.u[u.name] || 0
    }))
  });
}

function drawBase(): void {
  const reg = getRegiment()!;
  const clr = worldContext.pack.states[+getRegEl().dataset.state!].color ?? "";
  const base = view.viewbox
    .insert("g", "g#armies")
    .attr("id", "regimentBase")
    .attr("stroke-width", 0.3)
    .attr("stroke", "#000")
    .attr("cursor", "move");
  base
    .on("mouseenter", () => tip("Regiment base. Drag to re-base the regiment", true))
    .on("mouseleave", () => tip("", true));

  base
    .append("line")
    .attr("x1", reg.bx)
    .attr("y1", reg.by)
    .attr("x2", reg.x)
    .attr("y2", reg.y)
    .attr("class", "regimentDragLine");
  base
    .append("circle")
    .attr("cx", reg.bx)
    .attr("cy", reg.by)
    .attr("r", 2)
    .attr("fill", clr)
    .call(drag<SVGCircleElement, unknown>().on("start", dragBaseStart).on("drag", dragBaseDrag).on("end", dragBaseEnd));
}

function drawRotationControl(): void {
  const reg = getRegiment()!;
  const bbox = getRegEl().getBBox();

  view.debug
    .append("circle")
    .attr("id", "rotationControl")
    .attr("cx", bbox.x + bbox.width)
    .attr("cy", bbox.y + bbox.height / 2)
    .attr("r", 1)
    .attr("opacity", 1)
    .attr("fill", "yellow")
    .attr("stroke-width", 0.3)
    .attr("stroke", "black")
    .attr("cursor", "alias")
    .attr("transform", `rotate(${reg.angle || 0})`)
    .attr("transform-origin", `${reg.x}px ${reg.y}px`)
    .on("mouseenter", () => tip("Drag to rotate the regiment", true))
    .on("mouseleave", () => tip("", true))
    .call(drag<SVGCircleElement, unknown>().on("drag", rotateRegimentDrag));
}

function rotateRegimentDrag(this: SVGCircleElement, event: d3.D3DragEvent<SVGCircleElement, unknown, unknown>): void {
  const reg = getRegiment()!;
  const { x, y } = event;
  const angle = rn(Math.atan2(y - reg.y, x - reg.x) * (180 / Math.PI), 2);
  getRegEl().setAttribute("transform", `rotate(${angle})`);
  this.setAttribute("transform", `rotate(${angle})`);
  reg.angle = rn(angle, 2);
}

function dragRegimentStart(this: SVGGElement): void {
  select(this).raise();
  select(this.parentNode as Element).raise();
  const reg = (worldContext.pack.states[+this.dataset.state!].military as MilitaryRegiment[])?.find(
    r => r.i === +this.dataset.id!
  );
  if (!reg) return;
  const size = +view.armies.attr("box-size");
  const w = reg.n ? size * 4 : size * 6;
  const h = size * 2;
  _regDragState = {
    reg,
    w,
    h,
    size,
    self: (getRegEl() as Node) === (this as Node),
    baseRect: this.querySelector("rect")!,
    text: this.querySelector("text")!,
    iconRect: this.querySelectorAll("rect")[1],
    icon: this.querySelector(".regimentIcon") as SVGElement,
    image: this.querySelector(".regimentImage") as SVGImageElement,
    baseLine: view.viewbox.select("g#regimentBase > line"),
    rotationControl: view.debug.select("#rotationControl")
  };
}

function dragRegimentDrag(this: SVGGElement, event: d3.D3DragEvent<SVGGElement, unknown, unknown>): void {
  if (!_regDragState) return;
  const { reg, w, h, size, self, baseRect, text, iconRect, icon, image, baseLine, rotationControl } = _regDragState;
  const { x, y } = event;
  reg.x = x;
  reg.y = y;
  const x1 = rn(x - w / 2, 2);
  const y1 = rn(y - size, 2);
  this.setAttribute("transform-origin", `${x}px ${y}px`);
  baseRect.setAttribute("x", String(x1));
  baseRect.setAttribute("y", String(y1));
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  iconRect.setAttribute("x", String(x1 - h));
  iconRect.setAttribute("y", String(y1));
  icon.setAttribute("x", String(x1 - size));
  icon.setAttribute("y", String(y));
  image.setAttribute("x", String(x1 - h));
  image.setAttribute("y", String(y1));
  if (self) {
    baseLine.attr("x2", x).attr("y2", y);
    rotationControl
      .attr("cx", x1 + w)
      .attr("cy", y)
      .attr("transform-origin", `${x}px ${y}px`);
  }
}

function dragBaseStart(): void {
  _baseDragReg = getRegiment() ?? null;
}

function dragBaseDrag(this: SVGCircleElement, event: d3.D3DragEvent<SVGCircleElement, unknown, unknown>): void {
  this.setAttribute("cx", String(event.x));
  this.setAttribute("cy", String(event.y));
  view.viewbox.select("g#regimentBase > line").attr("x1", event.x).attr("y1", event.y);
}

function dragBaseEnd(this: SVGCircleElement, event: d3.D3DragEvent<SVGCircleElement, unknown, unknown>): void {
  if (_baseDragReg) {
    _baseDragReg.bx = event.x;
    _baseDragReg.by = event.y;
  }
}

function closeEditor(): void {
  view.debug.selectAll("*").remove();
  view.viewbox.selectAll("g#regimentBase").remove();
  view.armies.selectAll(":scope > g").classed("draggable", false);
  view.armies.selectAll<SVGGElement, unknown>("g>g").call(drag<SVGGElement, unknown>().on("drag", null));
  setRegimentEditorState({ isOpen: false, mode: "normal" });
  EditorBus.restoreDefaultEvents();
  setElSelected(null);
  modules.editRegiment = false;
}

export function editRegiment(selectorOrEl?: string | Element): void {
  if (view.customization) return;
  closeDialogs(".stable");
  if (!layerIsOn("toggleMilitary")) toggleMilitary();

  view.armies.selectAll(":scope > g").classed("draggable", true);
  view.armies
    .selectAll<SVGGElement, unknown>(":scope > g > g")
    .call(drag<SVGGElement, unknown>().on("start", dragRegimentStart).on("drag", dragRegimentDrag));

  const rawEl = typeof selectorOrEl === "string" ? getElementBySelector(selectorOrEl) : (selectorOrEl ?? null);
  setElSelected(select(rawEl as Element));

  if (!worldContext.pack.states[+getRegEl().dataset.state!]) return;
  const reg = getRegiment();
  if (!reg) return;

  syncRegimentState(reg);
  drawBase();
  drawRotationControl();

  setRegimentEditorState({ isOpen: true, mode: "normal" });

  openDialog("regimentEditor", {
    title: "Edit Regiment",
    resizable: false,
    onClose: closeEditor,
    position: { my: "left top", at: "left+10 top+10", of: "#map" }
  });

  modules.editRegiment = true;
}

export const regimentEditorActions = {
  changeName(name: string): void {
    const reg = getRegiment();
    if (!reg) return;
    getRegEl().dataset.name = reg.name = name;
    setRegimentEditorState({ name });
  },

  restoreName(): void {
    const reg = getRegiment();
    if (!reg) return;
    const regs = worldContext.pack.states[+getRegEl().dataset.state!].military ?? [];
    const name = GenerationPipeline.Military.getName(reg, regs);
    getRegEl().dataset.name = reg.name = name;
    setRegimentEditorState({ name });
  },

  changeType(): void {
    const reg = getRegiment();
    if (!reg) return;
    reg.n = +!reg.n;
    const isNaval = !!reg.n;
    setRegimentEditorState({ isNaval });

    const size = +view.armies.attr("box-size");
    const baseRect = getRegEl().querySelectorAll("rect")[0];
    const iconRect = getRegEl().querySelectorAll("rect")[1];
    const icon = getRegEl().querySelector(".regimentIcon") as SVGElement;
    const x = isNaval ? reg.x - size * 2 : reg.x - size * 3;
    baseRect.setAttribute("x", String(x));
    baseRect.setAttribute("width", String(isNaval ? size * 4 : size * 6));
    iconRect.setAttribute("x", String(x - size * 2));
    icon.setAttribute("x", String(x - size));
    (getRegEl().querySelector("text") as SVGTextElement).textContent = String(
      GenerationPipeline.Military.getTotal(reg)
    );
  },

  changeEmblem(): void {
    const regiment = getRegiment();
    if (!regiment) return;
    const regEl = getRegEl();

    EditorBus.selectIcon(regiment.icon ?? "", (value: string) => {
      regiment.icon = value;
      setRegimentEditorState({ icon: value });
      if (!regEl?.isConnected) return;
      const isExternal = value.startsWith("http") || value.startsWith("data:image");
      (regEl.querySelector(".regimentIcon") as SVGElement).textContent = isExternal ? "" : value;
      (regEl.querySelector(".regimentImage") as SVGImageElement).setAttribute("href", isExternal ? value : "");
    });
  },

  changeUnit(unitName: string, count: number): void {
    const reg = getRegiment();
    if (!reg) return;
    reg.u[unitName] = count;
    reg.a = sum(Object.values(reg.u) as number[]);
    (getRegEl().querySelector("text") as SVGTextElement).textContent = String(
      GenerationPipeline.Military.getTotal(reg)
    );

    const units = getRegimentEditorState().units.map(u => (u.name === unitName ? { ...u, count } : u));
    setRegimentEditorState({ units });

    document.dispatchEvent(new CustomEvent("fmg:refresh-military"));
  },

  splitRegiment(): void {
    const reg = getRegiment();
    if (!reg) return;
    const u1 = reg.u;
    const state = +getRegEl().dataset.state!;
    const military = worldContext.pack.states[state].military ?? [];
    const i = last(military).i + 1;
    const u2 = Object.assign({}, u1);

    Object.keys(u2).forEach(u => {
      u2[u] = Math.floor(u2[u] / 2);
    });
    const a = sum(Object.values(u2) as number[]);
    if (!a) {
      tip("Not enough forces to split", false, "error");
      return;
    }

    Object.keys(u1).forEach(u => {
      u1[u] = Math.ceil(u1[u] / 2);
    });
    reg.a = sum(Object.values(u1) as number[]);
    (getRegEl().querySelector("text") as SVGTextElement).textContent = String(
      GenerationPipeline.Military.getTotal(reg)
    );

    // sync updated counts to store
    const unitOptions = worldContext.options.military ?? [];
    setRegimentEditorState({
      units: unitOptions.map((u: { name: string; type: string }) => ({
        name: u.name,
        type: u.type,
        count: reg.u[u.name] || 0
      }))
    });

    const shift = +view.armies.attr("box-size") * 2;
    const findY = (x: number, startY: number) => {
      let yVal = startY;
      do {
        yVal += shift;
      } while (military.find(r => (r as MilitaryRegiment).x === x && (r as MilitaryRegiment).y === yVal));
      return yVal;
    };
    const newReg = {
      a,
      cell: reg.cell,
      i,
      n: reg.n,
      u: u2,
      x: reg.x,
      y: findY(reg.x, reg.y),
      bx: reg.bx,
      by: reg.by,
      state,
      icon: reg.icon
    } as MilitaryRegiment;
    newReg.name = GenerationPipeline.Military.getName(newReg, military);
    military.push(newReg);
    GenerationPipeline.Military.generateNote(newReg, worldContext.pack.states[state]);
    drawRegiment(worldContext, viewContext, appServices, newReg, state);

    document.dispatchEvent(new CustomEvent("fmg:refresh-military"));
  },

  toggleAdd(): void {
    const { mode } = getRegimentEditorState();
    if (mode === "adding") {
      clearMainTip();
      interactionManager.resetClickHandler();
      view.viewbox.style("cursor", "default");
      setRegimentEditorState({ mode: "normal" });
    } else {
      setRegimentEditorState({ mode: "adding" });
      view.viewbox.style("cursor", "crosshair");
      interactionManager.setClickHandler(addRegimentOnClick);
      tip("Click on map to create new regiment or fleet", true);
    }
  },

  toggleAttack(): void {
    const { mode } = getRegimentEditorState();
    if (mode === "attacking") {
      clearMainTip();
      view.armies.selectAll(":scope > g").classed("draggable", true);
      interactionManager.resetClickHandler();
      view.viewbox.style("cursor", "default");
      setRegimentEditorState({ mode: "normal" });
    } else {
      setRegimentEditorState({ mode: "attacking" });
      view.viewbox.style("cursor", "crosshair");
      interactionManager.setClickHandler(attackRegimentOnClick);
      tip("Click on another regiment to initiate battle", true);
      view.armies.selectAll(":scope > g").classed("draggable", false);
    }
  },

  toggleAttach(): void {
    const { mode } = getRegimentEditorState();
    if (mode === "attaching") {
      clearMainTip();
      view.armies.selectAll(":scope > g").classed("draggable", true);
      interactionManager.resetClickHandler();
      view.viewbox.style("cursor", "default");
      setRegimentEditorState({ mode: "normal" });
    } else {
      setRegimentEditorState({ mode: "attaching" });
      view.viewbox.style("cursor", "crosshair");
      interactionManager.setClickHandler(attachRegimentOnClick);
      tip("Click on another regiment to unite both regiments. The current regiment will be removed", true);
      view.armies.selectAll(":scope > g").classed("draggable", false);
    }
  },

  regenerateLegend(): void {
    const index = worldContext.notes.findIndex((n: WorldNote) => n.id === getRegEl().id);
    if (index !== -1) worldContext.notes.splice(index, 1);
    const s = worldContext.pack.states[+getRegEl().dataset.state!];
    GenerationPipeline.Military.generateNote(getRegiment()!, s);
  },

  editLegend(): void {
    const reg = getRegiment();
    if (!reg) return;
    editNotes(getRegEl().id, reg.name);
  },

  removeRegiment(): void {
    openConfirm("Are you sure you want to remove the regiment?", {
      title: "Remove regiment",
      confirm: "Remove",
      onConfirm: () => {
        const military = worldContext.pack.states[+getRegEl().dataset.state!].military ?? [];
        const reg = getRegiment();
        if (!reg) return;
        const regIndex = military.indexOf(reg);
        if (regIndex === -1) return;
        military.splice(regIndex, 1);

        const index = worldContext.notes.findIndex((n: WorldNote) => n.id === getRegEl().id);
        if (index !== -1) worldContext.notes.splice(index, 1);
        getRegEl().remove();

        document.dispatchEvent(new CustomEvent("fmg:refresh-military"));
        closeDialog("regimentEditor");
      }
    });
  }
};

function addRegimentOnClick(this: SVGElement, event: MouseEvent): void {
  const pt = pointer(event, this) as [number, number];
  const cell = findCell(pt[0], pt[1]);
  const [x, y] = worldContext.pack.cells.p[cell];
  const state = +getRegEl().dataset.state!;
  const military = worldContext.pack.states[state].military ?? [];
  const i = military.length ? last(military).i + 1 : 0;
  const n = +(worldContext.pack.cells.h[cell] < 20);
  const reg = { a: 0, cell, i, n, u: {}, x, y, bx: x, by: y, state, icon: "🛡️" } as MilitaryRegiment;
  reg.name = GenerationPipeline.Military.getName(reg, military);
  military.push(reg);
  GenerationPipeline.Military.generateNote(reg, worldContext.pack.states[state]);
  drawRegiment(worldContext, viewContext, appServices, reg, state);
  document.dispatchEvent(new CustomEvent("fmg:refresh-military"));
  regimentEditorActions.toggleAdd();
}

function attackRegimentOnClick(this: SVGElement, event: MouseEvent): void {
  const target = event.target as SVGElement;
  const regSelected = target.parentElement!;
  const army = regSelected.parentElement!;
  const oldState = +getRegEl().dataset.state!;
  const newState = +regSelected.dataset.state!;

  if (army.parentElement!.id !== "armies") {
    tip("Please click on a regiment to attack", false, "error");
    return;
  }
  if ((regSelected as Node) === (getRegEl() as Node)) {
    tip("Regiment cannot attack itself", false, "error");
    return;
  }
  if (oldState === newState) {
    tip("Cannot attack fraternal regiment", false, "error");
    return;
  }

  const attacker = getRegiment() as BattleRegiment;
  const defender = worldContext.pack.states[+regSelected.dataset.state!].military?.find(
    (r: MilitaryRegiment) => r.i === +regSelected.dataset.id!
  ) as BattleRegiment | undefined;
  if (!attacker.a || !defender?.a) {
    tip("Regiment has no troops to battle", false, "error");
    return;
  }

  attacker.px = attacker.x;
  attacker.py = attacker.y;
  defender.px = defender.x;
  defender.py = defender.y;

  moveRegiment(worldContext, viewContext, appServices, attacker, defender.x, defender.y - 8);

  const attack = transition()
    .delay(300)
    .duration(700)
    .ease(easeSinInOut)
    .on("end", () => new Battle(attacker, defender));
  view.svg
    .append("text")
    .attr("text-rendering", "optimizeSpeed")
    .attr("x", view.svgWidth / 2)
    .attr("y", view.svgHeight / 2)
    .text("⚔️")
    .attr("font-size", 0)
    .attr("opacity", 1)
    .style("dominant-baseline", "central")
    .style("text-anchor", "middle")
    .transition(attack)
    .attr("font-size", 1000)
    .attr("opacity", 0.2)
    .remove();

  clearMainTip();
  closeDialog("regimentEditor");
}

function attachRegimentOnClick(this: SVGElement, event: MouseEvent): void {
  const target = event.target as SVGElement;
  const regSelected = target.parentElement!;
  const army = regSelected.parentElement!;
  const oldState = +getRegEl().dataset.state!;
  const newState = +regSelected.dataset.state!;

  if (army.parentElement!.id !== "armies") {
    tip("Please click on a regiment", false, "error");
    return;
  }
  if ((regSelected as Node) === (getRegEl() as Node)) {
    tip("Cannot attach regiment to itself. Please click on another regiment", false, "error");
    return;
  }

  const reg = getRegiment()!;
  const sel = (worldContext.pack.states[newState].military as MilitaryRegiment[]).find(
    r => r.i === +regSelected.dataset.id!
  )!;

  for (const unit of worldContext.options.military ?? []) {
    const u = unit.name;
    if (reg.u[u]) {
      if (sel.u[u]) sel.u[u] += reg.u[u];
      else sel.u[u] = reg.u[u];
    }
  }
  sel.a = sum(Object.values(sel.u) as number[]);
  (regSelected.querySelector("text") as SVGTextElement).textContent = String(GenerationPipeline.Military.getTotal(sel));

  const military = worldContext.pack.states[oldState].military ?? [];
  military.splice(military.indexOf(reg), 1);
  const index = worldContext.notes.findIndex((n: WorldNote) => n.id === getRegEl().id);
  if (index !== -1) worldContext.notes.splice(index, 1);
  getRegEl().remove();

  document.dispatchEvent(new CustomEvent("fmg:refresh-military"));
  closeDialog("regimentEditor");
  editRegiment(`#${regSelected.id}`);
}

export function initRegimentEditor(wc: WorldContext, _vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  appServices = as;
}
