"use strict";

declare function drawRegiment(regiment: any, state: number): void;
declare function moveRegiment(regiment: any, x: number, y: number): void;

class RegimentEditor {
  public open(selector?: string) {
    if (customization) return;
    closeDialogs(".stable");
    if (!layerIsOn("toggleMilitary")) toggleMilitary();

    const self = this;
    armies.selectAll(":scope > g").classed("draggable", true);
    armies.selectAll(":scope > g > g").call(d3.drag().on("drag", function(this: SVGGElement) { self.dragRegiment(this); }));
    elSelected = selector ? document.querySelector(selector) : d3.event.target.parentElement;
    if (!pack.states[elSelected.dataset.state]) return;
    if (!this.getRegiment()) return;
    this.updateRegimentData(this.getRegiment());
    this.drawBase();
    this.drawRotationControl();

    $("#regimentEditor").dialog({
      title: "Edit Regiment",
      resizable: false,
      close: () => this.closeEditor(),
      position: {my: "left top", at: "left+10 top+10", of: "#map"}
    });

    if (modules.editRegiment) return;
    modules.editRegiment = true;

    ensureEl("regimentNameRestore").addEventListener("click", () => this.restoreName());
    ensureEl("regimentType").addEventListener("click", () => this.changeType());
    ensureEl("regimentName").addEventListener("change", (e: Event) => this.changeName((e.target as HTMLInputElement).value));
    ensureEl("regimentEmblemChange").addEventListener("click", () => this.changeEmblem());
    ensureEl("regimentAttack").addEventListener("click", () => this.toggleAttack());
    ensureEl("regimentRegenerateLegend").addEventListener("click", () => this.regenerateLegend());
    ensureEl("regimentLegend").addEventListener("click", () => this.editLegend());
    ensureEl("regimentSplit").addEventListener("click", () => this.splitRegiment());
    ensureEl("regimentAdd").addEventListener("click", () => this.toggleAdd());
    ensureEl("regimentAttach").addEventListener("click", () => this.toggleAttach());
    ensureEl("regimentRemove").addEventListener("click", () => this.removeRegiment());
  }

  private getRegiment() {
    const military = (pack.states[elSelected.dataset.state]?.military || []) as any[];
    return military.find((r: any) => r.i == elSelected.dataset.id);
  }

  private updateRegimentData(regiment: any) {
    ensureEl("regimentType").className = regiment.n ? "icon-anchor" : "icon-users";
    (ensureEl("regimentName") as HTMLInputElement).value = regiment.name;
    ensureEl("regimentEmblem").innerHTML = regiment.icon.startsWith("http") || regiment.icon.startsWith("data:image")
      ? `<img src="${regiment.icon}" style="width: 1em; height: 1em;">`
      : regiment.icon;

    const composition = ensureEl("regimentComposition");
    composition.innerHTML = options.military
      .map((u: any) => {
        return `<div data-tip="${capitalize(u.name)} number. Input to change">
        <div class="label">${capitalize(u.name)}:</div>
        <input data-u="${u.name}" type="number" min=0 step=1 value="${regiment.u[u.name] || 0}">
        <i>${u.type}</i></div>`;
      })
      .join("");

    composition.querySelectorAll("input").forEach((el: Element) => el.addEventListener("change", (e: Event) => this.changeUnit(e.target as HTMLInputElement)));
  }

  private drawBase() {
    const reg = this.getRegiment();
    const clr = pack.states[elSelected.dataset.state].color;
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
      .call(d3.drag().on("drag", function(this: SVGCircleElement) { regimentEditorSelf.dragBase(this); }));
  }

  private drawRotationControl() {
    const reg = this.getRegiment();
    const {x, width, y, height} = elSelected.getBBox();

    debug
      .append("circle")
      .attr("id", "rotationControl")
      .attr("cx", x + width)
      .attr("cy", y + height / 2)
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
      .call(d3.drag().on("start", () => this.rotateRegiment()));
  }

  private rotateRegiment() {
    const reg = this.getRegiment();

    d3.event.on("drag", function(this: SVGCircleElement) {
      const {x, y} = d3.event;
      const angle = rn(Math.atan2(y - reg.y, x - reg.x) * (180 / Math.PI), 2);
      elSelected.setAttribute("transform", `rotate(${angle})`);
      this.setAttribute("transform", `rotate(${angle})`);
      reg.angle = rn(angle, 2);
    });
  }

  private changeType() {
    const reg = this.getRegiment();
    reg.n = +!reg.n;
    ensureEl("regimentType").className = reg.n ? "icon-anchor" : "icon-users";

    const size = +armies.attr("box-size");
    const baseRect = elSelected.querySelectorAll("rect")[0];
    const iconRect = elSelected.querySelectorAll("rect")[1];
    const icon = elSelected.querySelector(".regimentIcon");
    const x = reg.n ? reg.x - size * 2 : reg.x - size * 3;
    baseRect.setAttribute("x", x);
    baseRect.setAttribute("width", reg.n ? size * 4 : size * 6);
    iconRect.setAttribute("x", x - size * 2);
    icon.setAttribute("x", x - size);
    elSelected.querySelector("text").innerHTML = Military.getTotal(reg);
  }

  private changeName(value: string) {
    elSelected.dataset.name = this.getRegiment().name = value;
  }

  private restoreName() {
    const reg = this.getRegiment(),
      regs = (pack.states[elSelected.dataset.state].military || []) as any[];
    const name = Military.getName(reg, regs);
    elSelected.dataset.name = reg.name = (ensureEl("regimentName") as HTMLInputElement).value = name;
  }

  private changeEmblem() {
    const regiment = this.getRegiment();

    selectIcon(regiment.icon, (value: string) => {
      regiment.icon = value;
      const isExternal = value.startsWith("http") || value.startsWith("data:image");
      ensureEl("regimentEmblem").innerHTML = isExternal ? `<img src="${value}" style="width: 1em; height: 1em;">` : value;
      elSelected.querySelector(".regimentIcon").innerHTML = isExternal ? "" : value;
      elSelected.querySelector(".regimentImage").setAttribute("href", isExternal ? value : "");
    });
  }

  private changeUnit(input: HTMLInputElement) {
    const u = input.dataset.u!;
    const reg = this.getRegiment();
    reg.u[u] = +input.value || 0;
    reg.a = d3.sum(Object.values(reg.u));
    elSelected.querySelector("text").innerHTML = Military.getTotal(reg);
    if (militaryOverviewRefresh.offsetParent) militaryOverviewRefresh.click();
    if (regimentsOverviewRefresh.offsetParent) regimentsOverviewRefresh.click();
  }

  private splitRegiment() {
    const reg = this.getRegiment(),
      u1 = reg.u;
    const state = +elSelected.dataset.state,
      military = (pack.states[state].military || []) as any[];
    const i = last(military).i + 1,
      u2 = Object.assign({}, u1);

    Object.keys(u2).forEach((u: string) => (u2[u] = Math.floor(u2[u] / 2)));
    const a = d3.sum(Object.values(u2));
    if (!a) {
      tip("Not enough forces to split", false, "error");
      return;
    }

    Object.keys(u1).forEach((u: string) => (u1[u] = Math.ceil(u1[u] / 2)));
    reg.a = d3.sum(Object.values(u1));
    regimentComposition.querySelectorAll("input").forEach((el: Element) => ((el as HTMLInputElement).value = reg.u[(el as HTMLInputElement).dataset.u] || 0));
    elSelected.querySelector("text").innerHTML = Military.getTotal(reg);

    const shift = +armies.attr("box-size") * 2;
    const nextY = (x: number, y: number) => {
      do {
        y += shift;
      } while (military.find((r: any) => r.x === x && r.y === y));
      return y;
    };
    const newReg = {
      a,
      t: a,
      s: reg.s,
      type: reg.type,
      cell: reg.cell,
      i,
      n: reg.n,
      u: u2,
      x: reg.x,
      y: nextY(reg.x, reg.y),
      bx: reg.bx,
      by: reg.by,
      state,
      icon: reg.icon,
      name: ""
    };
    newReg.name = Military.getName(newReg as any, military);
    military.push(newReg);
    Military.generateNote(newReg, pack.states[state]);
    drawRegiment(newReg as any, state);

    if (regimentsOverviewRefresh.offsetParent) regimentsOverviewRefresh.click();
  }

  private toggleAdd() {
    ensureEl("regimentAdd").classList.toggle("pressed");
    if (ensureEl("regimentAdd").classList.contains("pressed")) {
      viewbox.style("cursor", "crosshair").on("click", () => this.addRegimentOnClick());
      tip("Click on map to create new regiment or fleet", true);
    } else {
      clearMainTip();
      viewbox.on("click", clicked).style("cursor", "default");
    }
  }

  private addRegimentOnClick() {
    const point = d3.mouse(viewbox.node());
    const cell = findCell(point[0], point[1]);
    const [x, y] = pack.cells.p[cell];
    const state = +elSelected.dataset.state,
      military = (pack.states[state].military || []) as any[];
    const i = military.length ? last(military).i + 1 : 0;
    const n = +(pack.cells.h[cell] < 20);
    const reg: any = {a: 0, cell, i, n, u: {}, x, y, bx: x, by: y, state, icon: "🛡️", name: ""};
    reg.name = Military.getName(reg, military);
    military.push(reg);
    Military.generateNote(reg, pack.states[state]);
    drawRegiment(reg, state);
    if (regimentsOverviewRefresh.offsetParent) regimentsOverviewRefresh.click();
    this.toggleAdd();
  }

  private toggleAttack() {
    ensureEl("regimentAttack").classList.toggle("pressed");
    if (ensureEl("regimentAttack").classList.contains("pressed")) {
      viewbox.style("cursor", "crosshair").on("click", () => this.attackRegimentOnClick());
      tip("Click on another regiment to initiate battle", true);
      armies.selectAll(":scope > g").classed("draggable", false);
    } else {
      clearMainTip();
      armies.selectAll(":scope > g").classed("draggable", true);
      viewbox.on("click", clicked).style("cursor", "default");
    }
  }

  private attackRegimentOnClick() {
    const target = d3.event.target,
      regSelected = target.parentElement,
      army = regSelected.parentElement;
    const oldState = +elSelected.dataset.state,
      newState = +regSelected.dataset.state;

    if (army.parentElement.id !== "armies") {
      tip("Please click on a regiment to attack", false, "error");
      return;
    }
    if (regSelected === elSelected) {
      tip("Regiment cannot attack itself", false, "error");
      return;
    }
    if (oldState === newState) {
      tip("Cannot attack fraternal regiment", false, "error");
      return;
    }

    const attacker = this.getRegiment();
    const defender = ((pack.states[regSelected.dataset.state].military || []) as any[]).find(
      (r: any) => r.i == regSelected.dataset.id
    );
    if (!attacker.a || !defender.a) {
      tip("Regiment has no troops to battle", false, "error");
      return;
    }

    (attacker.px = attacker.x), (attacker.py = attacker.y);
    (defender.px = defender.x), (defender.py = defender.y);

    moveRegiment(attacker, defender.x, defender.y - 8);

    const attack = d3
      .transition()
      .delay(300)
      .duration(700)
      .ease(d3.easeSinInOut)
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
    $("#regimentEditor").dialog("close");
  }

  private toggleAttach() {
    ensureEl("regimentAttach").classList.toggle("pressed");
    if (ensureEl("regimentAttach").classList.contains("pressed")) {
      viewbox.style("cursor", "crosshair").on("click", () => this.attachRegimentOnClick());
      tip("Click on another regiment to unite both regiments. The current regiment will be removed", true);
      armies.selectAll(":scope > g").classed("draggable", false);
    } else {
      clearMainTip();
      armies.selectAll(":scope > g").classed("draggable", true);
      viewbox.on("click", clicked).style("cursor", "default");
    }
  }

  private attachRegimentOnClick() {
    const target = d3.event.target,
      regSelected = target.parentElement,
      army = regSelected.parentElement;
    const oldState = +elSelected.dataset.state,
      newState = +regSelected.dataset.state;

    if (army.parentElement.id !== "armies") {
      tip("Please click on a regiment", false, "error");
      return;
    }
    if (regSelected === elSelected) {
      tip("Cannot attach regiment to itself. Please click on another regiment", false, "error");
      return;
    }

    const reg = this.getRegiment();
    const sel = ((pack.states[newState].military || []) as any[]).find((r: any) => r.i == regSelected.dataset.id);

    for (const unit of options.military) {
      const u = unit.name;
      if (reg.u[u]) sel.u[u] ? (sel.u[u] += reg.u[u]) : (sel.u[u] = reg.u[u]);
    }
    sel.a = d3.sum(Object.values(sel.u));
    regSelected.querySelector("text").innerHTML = Military.getTotal(sel);

    const military = (pack.states[oldState].military || []) as any[];
    military.splice(military.indexOf(reg), 1);
    const index = notes.findIndex((n: any) => n.id === elSelected.id);
    if (index != -1) notes.splice(index, 1);
    elSelected.remove();

    if (regimentsOverviewRefresh.offsetParent) regimentsOverviewRefresh.click();
    $("#regimentEditor").dialog("close");
    editRegiment("#" + regSelected.id);
  }

  private regenerateLegend() {
    const index = notes.findIndex((n: any) => n.id === elSelected.id);
    if (index != -1) notes.splice(index, 1);

    const s = pack.states[elSelected.dataset.state];
    Military.generateNote(this.getRegiment(), s);
  }

  private editLegend() {
    editNotes(elSelected.id, this.getRegiment().name);
  }

  private removeRegiment() {
    alertMessage.innerHTML = "Are you sure you want to remove the regiment?";
    $("#alert").dialog({
      resizable: false,
      title: "Remove regiment",
      buttons: {
        Remove: () => {
          $("#alert").dialog("close");
          const military = (pack.states[elSelected.dataset.state].military || []) as any[];
          const regIndex = military.indexOf(this.getRegiment());
          if (regIndex === -1) return;
          military.splice(regIndex, 1);

          const index = notes.findIndex((n: any) => n.id === elSelected.id);
          if (index != -1) notes.splice(index, 1);
          elSelected.remove();

          if (militaryOverviewRefresh.offsetParent) militaryOverviewRefresh.click();
          if (regimentsOverviewRefresh.offsetParent) regimentsOverviewRefresh.click();
          $("#regimentEditor").dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  public dragRegiment(element: SVGGElement) {
    d3.select(element).raise();
    d3.select(element.parentNode as Element).raise();

    const reg = ((pack.states[(element as any).dataset.state].military || []) as any[]).find(
      (r: any) => r.i == (element as any).dataset.id
    );
    const size = +armies.attr("box-size");
    const w = reg.n ? size * 4 : size * 6;
    const h = size * 2;

    const baseRect = element.querySelector("rect");
    const text = element.querySelector("text");
    const iconRect = element.querySelectorAll("rect")[1];
    const icon = element.querySelector(".regimentIcon");
    const image = element.querySelector(".regimentImage");

    const isSelf = elSelected === element;
    const baseLine = viewbox.select("g#regimentBase > line");
    const rotationControl = debug.select("#rotationControl");

    d3.event.on("drag", () => {
      const {x, y} = d3.event;
      reg.x = x;
      reg.y = y;
      const x1 = rn(x - w / 2, 2);
      const y1 = rn(y - size, 2);

      element.setAttribute("transform-origin", `${x}px ${y}px`);
      baseRect!.setAttribute("x", String(x1));
      baseRect!.setAttribute("y", String(y1));
      text!.setAttribute("x", String(x));
      text!.setAttribute("y", String(y));
      iconRect.setAttribute("x", String(x1 - h));
      iconRect.setAttribute("y", String(y1));
      icon!.setAttribute("x", String(x1 - size));
      icon!.setAttribute("y", String(y));
      image!.setAttribute("x", String(x1 - h));
      image!.setAttribute("y", String(y1));
      if (isSelf) {
        baseLine.attr("x2", x).attr("y2", y);
        rotationControl
          .attr("cx", x1 + w)
          .attr("cy", y)
          .attr("transform-origin", `${x}px ${y}px`);
      }
    });
  }

  public dragBase(circle: SVGCircleElement) {
    const baseLine = viewbox.select("g#regimentBase > line");
    const reg = this.getRegiment();

    d3.event.on("drag", () => {
      circle.setAttribute("cx", String(d3.event.x));
      circle.setAttribute("cy", String(d3.event.y));
      baseLine.attr("x1", d3.event.x).attr("y1", d3.event.y);
    });

    d3.event.on("end", () => {
      reg.bx = d3.event.x;
      reg.by = d3.event.y;
    });
  }

  private closeEditor() {
    debug.selectAll("*").remove();
    viewbox.selectAll("g#regimentBase").remove();
    armies.selectAll(":scope > g").classed("draggable", false);
    armies.selectAll("g>g").call(d3.drag().on("drag", null));
    ensureEl("regimentAdd").classList.remove("pressed");
    ensureEl("regimentAttack").classList.remove("pressed");
    ensureEl("regimentAttach").classList.remove("pressed");
    restoreDefaultEvents();
    elSelected = null;
  }
}

const regimentEditorController = new RegimentEditor();
const regimentEditorSelf = regimentEditorController;

function editRegiment(selector?: string) {
  regimentEditorController.open(selector);
}
