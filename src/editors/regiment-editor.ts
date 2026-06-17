import { drag, easeSinInOut, pointer, select, sum, transition } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { BattleRegiment } from "../controllers/battle-screen";
import { interactionManager } from "../controllers/interactionManager";
import type { MilitaryRegiment } from "../modules/military-generator";
import { Military } from "../modules/military-generator";
import { drawRegiment, moveRegiment } from "../renderers/index";
import type { WorldNote } from "../types/WorldState";
import { closeDialog, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { capitalize, ensureEl, findCell, last, rn } from "../utils";
import { editNotes } from "./notes-editor";

let worldContext: WorldContext;
let viewContext: Readonly<ViewContext>;
let appServices: AppServices;

export function editRegiment(selectorOrEl?: string | Element): void {
  if (customization) return;
  closeDialogs(".stable");
  if (!layerIsOn("toggleMilitary")) toggleMilitary();

  armies.selectAll(":scope > g").classed("draggable", true);
  armies
    .selectAll<SVGGElement, unknown>(":scope > g > g")
    .call(drag<SVGGElement, unknown>().on("start", dragRegimentStart).on("drag", dragRegimentDrag));
  const rawEl = typeof selectorOrEl === "string" ? document.querySelector(selectorOrEl) : (selectorOrEl ?? null);
  elSelected = select(rawEl as Element);
  const getRegEl = () => elSelected!.node() as SVGGElement;
  if (!pack.states[+getRegEl().dataset.state!]) return;
  if (!getRegiment()) return;
  updateRegimentData(getRegiment()!);
  drawBase();
  drawRotationControl();

  openDialog("regimentEditor", {
    title: "Edit Regiment",
    resizable: false,
    close: closeEditor,
    position: { my: "left top", at: "left+10 top+10", of: "#map" }
  });

  if (modules.editRegiment) return;
  modules.editRegiment = true;

  // add listeners
  ensureEl("regimentNameRestore").addEventListener("click", restoreName);
  ensureEl("regimentType").addEventListener("click", changeType);
  ensureEl("regimentName").addEventListener("change", changeName);
  ensureEl("regimentEmblemChange").addEventListener("click", changeEmblem);
  ensureEl("regimentAttack").addEventListener("click", toggleAttack);
  ensureEl("regimentRegenerateLegend").addEventListener("click", regenerateLegend);
  ensureEl("regimentLegend").addEventListener("click", editLegend);
  ensureEl("regimentSplit").addEventListener("click", splitRegiment);
  ensureEl("regimentAdd").addEventListener("click", toggleAdd);
  ensureEl("regimentAttach").addEventListener("click", toggleAttach);
  ensureEl("regimentRemove").addEventListener("click", removeRegiment);

  function getRegiment(): MilitaryRegiment {
    return (pack.states[+getRegEl().dataset.state!]?.military as MilitaryRegiment[] | undefined)?.find(
      r => r.i === +getRegEl().dataset.id!
    ) as MilitaryRegiment;
  }

  function updateRegimentData(regiment: MilitaryRegiment): void {
    (ensureEl("regimentType") as HTMLElement).className = regiment.n ? "icon-anchor" : "icon-users";
    (ensureEl("regimentName") as HTMLInputElement).value = regiment.name;
    const icon = regiment.icon ?? "";
    (ensureEl("regimentEmblem") as HTMLElement).innerHTML =
      icon.startsWith("http") || icon.startsWith("data:image")
        ? `<img src="${icon}" style="width: 1em; height: 1em;">`
        : icon;

    const composition = ensureEl("regimentComposition") as HTMLElement;
    composition.innerHTML = (options.military ?? [])
      .map((u: { name: string; type: string }) => {
        return `<div data-tip="${capitalize(u.name)} number. Input to change">
        <div class="label">${capitalize(u.name)}:</div>
        <input data-u="${u.name}" type="number" min=0 step=1 value="${regiment.u[u.name] || 0}">
        <i>${u.type}</i></div>`;
      })
      .join("");

    composition.querySelectorAll("input").forEach(el => {
      el.addEventListener("change", changeUnit);
    });
  }

  function drawBase(): void {
    const reg = getRegiment();
    const clr = pack.states[+getRegEl().dataset.state!].color ?? "";
    const base = viewbox
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
      .call(
        drag<SVGCircleElement, unknown>().on("start", dragBaseStart).on("drag", dragBaseDrag).on("end", dragBaseEnd)
      );
  }

  function drawRotationControl(): void {
    const reg = getRegiment();
    const bbox = getRegEl().getBBox();

    debug
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
    const reg = getRegiment();
    const { x, y } = event;
    const angle = rn(Math.atan2(y - reg.y, x - reg.x) * (180 / Math.PI), 2);
    getRegEl().setAttribute("transform", `rotate(${angle})`);
    this.setAttribute("transform", `rotate(${angle})`);
    reg.angle = rn(angle, 2);
  }

  function changeType(): void {
    const reg = getRegiment();
    reg.n = +!reg.n;
    (ensureEl("regimentType") as HTMLElement).className = reg.n ? "icon-anchor" : "icon-users";

    const size = +armies.attr("box-size");
    const baseRect = getRegEl().querySelectorAll("rect")[0];
    const iconRect = getRegEl().querySelectorAll("rect")[1];
    const icon = getRegEl().querySelector(".regimentIcon") as SVGElement;
    const x = reg.n ? reg.x - size * 2 : reg.x - size * 3;
    baseRect.setAttribute("x", String(x));
    baseRect.setAttribute("width", String(reg.n ? size * 4 : size * 6));
    iconRect.setAttribute("x", String(x - size * 2));
    icon.setAttribute("x", String(x - size));
    (getRegEl().querySelector("text") as SVGTextElement).innerHTML = String(Military.getTotal(reg));
  }

  function changeName(this: HTMLInputElement): void {
    getRegEl().dataset.name = getRegiment().name = this.value;
  }

  function restoreName(): void {
    const reg = getRegiment();
    const regs = pack.states[+getRegEl().dataset.state!].military ?? [];
    const name = Military.getName(reg, regs);
    getRegEl().dataset.name = reg.name = (ensureEl("regimentName") as HTMLInputElement).value = name;
  }

  function changeEmblem(): void {
    const regiment = getRegiment();

    selectIcon(regiment.icon ?? "", (value: string) => {
      regiment.icon = value;
      const isExternal = value.startsWith("http") || value.startsWith("data:image");
      (ensureEl("regimentEmblem") as HTMLElement).innerHTML = isExternal
        ? `<img src="${value}" style="width: 1em; height: 1em;">`
        : value;
      (getRegEl().querySelector(".regimentIcon") as SVGElement).innerHTML = isExternal ? "" : value;
      (getRegEl().querySelector(".regimentImage") as SVGImageElement).setAttribute("href", isExternal ? value : "");
    });
  }

  function changeUnit(this: HTMLInputElement): void {
    const u = this.dataset.u!;
    const reg = getRegiment();
    reg.u[u] = +this.value || 0;
    reg.a = sum(Object.values(reg.u) as number[]);
    (getRegEl().querySelector("text") as SVGTextElement).innerHTML = String(Military.getTotal(reg));
    if (militaryOverviewRefresh?.offsetParent) militaryOverviewRefresh.click();
    if (regimentsOverviewRefresh?.offsetParent) regimentsOverviewRefresh.click();
  }

  function splitRegiment(): void {
    const reg = getRegiment();
    const u1 = reg.u;
    const state = +getRegEl().dataset.state!;
    const military = pack.states[state].military ?? [];
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

    // update old regiment
    Object.keys(u1).forEach(u => {
      u1[u] = Math.ceil(u1[u] / 2);
    });
    reg.a = sum(Object.values(u1) as number[]);
    (ensureEl("regimentComposition") as HTMLElement).querySelectorAll("input").forEach(el => {
      (el as HTMLInputElement).value = String(reg.u[(el as HTMLInputElement).dataset.u!] || 0);
    });
    (getRegEl().querySelector("text") as SVGTextElement).innerHTML = String(Military.getTotal(reg));

    // create new regiment
    const shift = +armies.attr("box-size") * 2;
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
    } as unknown as MilitaryRegiment;
    newReg.name = Military.getName(newReg, military);
    military.push(newReg);
    Military.generateNote(newReg, pack.states[state]);
    drawRegiment(worldContext, viewContext, appServices, newReg, state);

    if (regimentsOverviewRefresh?.offsetParent) regimentsOverviewRefresh.click();
  }

  function toggleAdd(): void {
    (ensureEl("regimentAdd") as HTMLElement).classList.toggle("pressed");
    if ((ensureEl("regimentAdd") as HTMLElement).classList.contains("pressed")) {
      viewbox.style("cursor", "crosshair");
      interactionManager.setClickHandler(addRegimentOnClick);
      tip("Click on map to create new regiment or fleet", true);
    } else {
      clearMainTip();
      interactionManager.resetClickHandler();
      viewbox.style("cursor", "default");
    }
  }

  function addRegimentOnClick(this: SVGElement, event: MouseEvent): void {
    const pt = pointer(event, this) as [number, number];
    const cell = findCell(pt[0], pt[1]);
    const [x, y] = pack.cells.p[cell];
    const state = +getRegEl().dataset.state!;
    const military = pack.states[state].military ?? [];
    const i = military.length ? last(military).i + 1 : 0;
    const n = +(pack.cells.h[cell] < 20);
    const reg = { a: 0, cell, i, n, u: {}, x, y, bx: x, by: y, state, icon: "🛡️" } as MilitaryRegiment;
    reg.name = Military.getName(reg, military);
    military.push(reg);
    Military.generateNote(reg, pack.states[state]);
    drawRegiment(worldContext, viewContext, appServices, reg, state);
    if (regimentsOverviewRefresh?.offsetParent) regimentsOverviewRefresh.click();
    toggleAdd();
  }

  function toggleAttack(): void {
    (ensureEl("regimentAttack") as HTMLElement).classList.toggle("pressed");
    if ((ensureEl("regimentAttack") as HTMLElement).classList.contains("pressed")) {
      viewbox.style("cursor", "crosshair");
      interactionManager.setClickHandler(attackRegimentOnClick);
      tip("Click on another regiment to initiate battle", true);
      armies.selectAll(":scope > g").classed("draggable", false);
    } else {
      clearMainTip();
      armies.selectAll(":scope > g").classed("draggable", true);
      interactionManager.resetClickHandler();
      viewbox.style("cursor", "default");
    }
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
    const defender = pack.states[+regSelected.dataset.state!].military?.find(
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
    svg
      .append("text")
      .attr("text-rendering", "optimizeSpeed")
      .attr("x", window.innerWidth / 2)
      .attr("y", window.innerHeight / 2)
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

  function toggleAttach(): void {
    (ensureEl("regimentAttach") as HTMLElement).classList.toggle("pressed");
    if ((ensureEl("regimentAttach") as HTMLElement).classList.contains("pressed")) {
      viewbox.style("cursor", "crosshair");
      interactionManager.setClickHandler(attachRegimentOnClick);
      tip("Click on another regiment to unite both regiments. The current regiment will be removed", true);
      armies.selectAll(":scope > g").classed("draggable", false);
    } else {
      clearMainTip();
      armies.selectAll(":scope > g").classed("draggable", true);
      interactionManager.resetClickHandler();
      viewbox.style("cursor", "default");
    }
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

    const reg = getRegiment();
    const sel = (pack.states[newState].military as MilitaryRegiment[]).find(r => r.i === +regSelected.dataset.id!)!;

    for (const unit of options.military ?? []) {
      const u = unit.name;
      if (reg.u[u]) {
        if (sel.u[u]) sel.u[u] += reg.u[u];
        else sel.u[u] = reg.u[u];
      }
    }
    sel.a = sum(Object.values(sel.u) as number[]);
    (regSelected.querySelector("text") as SVGTextElement).innerHTML = String(Military.getTotal(sel));

    // remove attached regiment
    const military = pack.states[oldState].military ?? [];
    military.splice(military.indexOf(reg), 1);
    const index = notes.findIndex((n: WorldNote) => n.id === getRegEl().id);
    if (index !== -1) notes.splice(index, 1);
    getRegEl().remove();

    if (regimentsOverviewRefresh?.offsetParent) regimentsOverviewRefresh.click();
    closeDialog("regimentEditor");
    editRegiment(`#${regSelected.id}`);
  }

  function regenerateLegend(): void {
    const index = notes.findIndex((n: WorldNote) => n.id === getRegEl().id);
    if (index !== -1) notes.splice(index, 1);

    const s = pack.states[+getRegEl().dataset.state!];
    Military.generateNote(getRegiment(), s);
  }

  function editLegend(): void {
    editNotes(getRegEl().id, getRegiment().name);
  }

  function removeRegiment(): void {
    alertMessage.innerHTML = "Are you sure you want to remove the regiment?";
    openRichDialog({
      content: window.alertMessage.innerHTML,
      resizable: false,
      title: "Remove regiment",
      buttons: {
        Remove: () => {
          /* $(this).dialog("close") removed */
          const military = pack.states[+getRegEl().dataset.state!].military ?? [];
          const regIndex = military.indexOf(getRegiment());
          if (regIndex === -1) return;
          military.splice(regIndex, 1);

          const index = notes.findIndex((n: WorldNote) => n.id === getRegEl().id);
          if (index !== -1) notes.splice(index, 1);
          getRegEl().remove();

          if (militaryOverviewRefresh?.offsetParent) militaryOverviewRefresh.click();
          if (regimentsOverviewRefresh?.offsetParent) regimentsOverviewRefresh.click();
          closeDialog("regimentEditor");
        },
        Cancel: () => {
          /* $(this).dialog("close") removed */
        }
      }
    });
  }

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

  function dragRegimentStart(this: SVGGElement): void {
    select(this).raise();
    select(this.parentNode as Element).raise();
    const reg = (pack.states[+this.dataset.state!].military as MilitaryRegiment[]).find(
      r => r.i === +this.dataset.id!
    )!;
    const size = +armies.attr("box-size");
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
      baseLine: viewbox.select("g#regimentBase > line"),
      rotationControl: debug.select("#rotationControl")
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

  let _baseDragReg: MilitaryRegiment | null = null;

  function dragBaseStart(): void {
    _baseDragReg = getRegiment();
  }

  function dragBaseDrag(this: SVGCircleElement, event: d3.D3DragEvent<SVGCircleElement, unknown, unknown>): void {
    this.setAttribute("cx", String(event.x));
    this.setAttribute("cy", String(event.y));
    viewbox.select("g#regimentBase > line").attr("x1", event.x).attr("y1", event.y);
  }

  function dragBaseEnd(this: SVGCircleElement, event: d3.D3DragEvent<SVGCircleElement, unknown, unknown>): void {
    if (_baseDragReg) {
      _baseDragReg.bx = event.x;
      _baseDragReg.by = event.y;
    }
  }

  function closeEditor(): void {
    debug.selectAll("*").remove();
    viewbox.selectAll("g#regimentBase").remove();
    armies.selectAll(":scope > g").classed("draggable", false);
    armies.selectAll<SVGGElement, unknown>("g>g").call(drag<SVGGElement, unknown>().on("drag", null));
    (ensureEl("regimentAdd") as HTMLElement).classList.remove("pressed");
    (ensureEl("regimentAttack") as HTMLElement).classList.remove("pressed");
    (ensureEl("regimentAttach") as HTMLElement).classList.remove("pressed");
    restoreDefaultEvents?.();
    elSelected = null;
  }
}

export function initRegimentEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
