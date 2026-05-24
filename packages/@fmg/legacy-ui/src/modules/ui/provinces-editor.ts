"use strict";
import { States } from "@fmg/core/modules/states-generator";
import { clearMainTip } from "./general";
import { applySorting, closeDialogs, fitContent, fog, getArea, getAreaUnit, removeCircle, unfog } from "./editors";
import { drawStates, layerIsOn, toggleBorders, toggleCultures, togglePopulation, toggleProvinces, toggleStates } from "./layers";
import { editStyle } from "./style";
import { requireFmgApi } from "../runtime/fmg-api";

declare const areaUnit: HTMLSelectElement;

const Burgs = requireFmgApi("Burgs") as {
  changeGroup: (burg: unknown, group?: string | null) => void;
  getType: (cellId: number, port?: number) => string;
};
const Provinces = requireFmgApi("Provinces") as {
  getPoles: () => void;
};

class ProvincesEditor {
  private get body() { return ensureEl("provincesBodySection"); }

  public open() {
    if (customization) return;
    closeDialogs("#provincesEditor, .stable");
    if (!layerIsOn("toggleProvinces")) toggleProvinces();
    if (!layerIsOn("toggleBorders")) toggleBorders();
    if (layerIsOn("toggleStates")) toggleStates();
    if (layerIsOn("toggleCultures")) toggleCultures();

    provs.selectAll("text").call(
      d3.drag().on("drag", function(this: SVGTextElement) { provincesEditorSelf.dragLabel(this); })
    ).classed("draggable", true);
    this.refreshProvincesEditor();

    if (modules.editProvinces) return;
    modules.editProvinces = true;

    $("#provincesEditor").dialog({
      title: "Provinces Editor",
      resizable: false,
      width: fitContent(),
      close: () => this.closeProvincesEditor(),
      position: {my: "right top", at: "right-10 top+10", of: "svg", collision: "fit"}
    });

    // add listeners
    ensureEl("provincesEditorRefresh").on("click", () => this.refreshProvincesEditor());
    ensureEl("provincesEditStyle").on("click", () => editStyle("provs"));
    ensureEl("provincesFilterState").on("change", () => this.provincesEditorAddLines());
    ensureEl("provincesPercentage").on("click", () => this.togglePercentageMode());
    ensureEl("provincesChart").on("click", () => this.showChart());
    ensureEl("provincesToggleLabels").on("click", () => this.toggleProvinceLabels());
    ensureEl("provincesExport").on("click", () => this.downloadProvincesData());
    ensureEl("provincesRemoveAll").on("click", () => this.removeAllProvinces());
    ensureEl("provincesManually").on("click", () => this.enterProvincesManualAssignent());
    ensureEl("provincesManuallyApply").on("click", () => this.applyProvincesManualAssignent());
    ensureEl("provincesManuallyCancel").on("click", () => this.exitProvincesManualAssignment());
    ensureEl("provincesRelease").on("click", () => this.triggerProvincesRelease());
    ensureEl("provincesAdd").on("click", () => this.enterAddProvinceMode());
    ensureEl("provincesRecolor").on("click", () => this.recolorProvinces());

    this.body.on("click", (ev: MouseEvent) => {
      if (customization) return;
      const el = ev.target as HTMLElement, cl = el.classList, line = el.parentNode as HTMLElement, p = +line.dataset.id!;
      const stateId = pack.provinces[p].state;

      if (el.tagName === "FILL-BOX") this.changeFill(el);
      else if (cl.contains("name")) this.editProvinceName(p);
      else if (cl.contains("coaIcon")) editEmblem("province", "provinceCOA" + p, pack.provinces[p]);
      else if (cl.contains("icon-star-empty")) this.capitalZoomIn(p);
      else if (cl.contains("icon-flag-empty")) this.triggerIndependencePromps(p);
      else if (cl.contains("icon-dot-circled")) overviewBurgs({stateId});
      else if (cl.contains("culturePopulation")) this.changeProvincePopulation(p);
      else if (cl.contains("icon-pin")) this.toggleFog(p, cl);
      else if (cl.contains("icon-trash-empty")) this.removeProvince(p);
      else if (cl.contains("icon-lock") || cl.contains("icon-lock-open")) updateLockStatus(p, cl);
    });

    this.body.on("change", (ev: Event) => {
      const el = ev.target as HTMLElement, cl = el.classList, line = el.parentNode as HTMLElement, p = +line.dataset.id!;
      if (cl.contains("cultureBase")) this.changeCapital(p, line, (el as HTMLSelectElement).value);
    });
  }

  private refreshProvincesEditor() {
    this.collectStatistics();
    this.updateFilter();
    this.provincesEditorAddLines();
  }

  private collectStatistics() {
    const {cells, provinces, burgs} = pack;

    provinces.forEach((p: any) => {
      if (!p.i || p.removed) return;
      p.area = p.rural = p.urban = 0;
      p.burgs = [];
      if ((p.burg && !burgs[p.burg]) || burgs[p.burg].removed) p.burg = 0;
    });

    for (const i of cells.i) {
      const p = cells.province[i];
      if (!p) continue;

      provinces[p].area += cells.area[i];
      provinces[p].rural += cells.pop[i];
      if (!cells.burg[i]) continue;
      provinces[p].urban += burgs[cells.burg[i]].population;
      provinces[p].burgs.push(cells.burg[i]);
    }

    provinces.forEach((p: any) => {
      if (!p.i || p.removed) return;
      if (!p.burg && p.burgs.length) p.burg = p.burgs[0];
    });
  }

  private updateFilter() {
    const stateFilter = ensureEl("provincesFilterState") as HTMLSelectElement;
    const selectedState = stateFilter.value || "1";
    stateFilter.options.length = 0;
    stateFilter.options.add(new Option(`all`, String(-1), false, selectedState === "-1"));
    const statesSorted = pack.states.filter((s: any) => s.i && !s.removed).sort((a: any, b: any) => (a.name > b.name ? 1 : -1));
    statesSorted.forEach((s: any) => stateFilter.options.add(new Option(s.name, String(s.i), false, String(s.i) === selectedState)));
  }

  private provincesEditorAddLines() {
    const body = this.body;
    const unit = " " + getAreaUnit();
    const selectedState = +(ensureEl("provincesFilterState") as HTMLSelectElement).value;
    let filtered = pack.provinces.filter((p: any) => p.i && !p.removed);
    if (selectedState != -1) filtered = filtered.filter((p: any) => p.state === selectedState);
    body.innerHTML = "";

    let lines = "";
    let totalArea = 0;
    let totalPopulation = 0;
    let totalBurgs = 0;

    for (const p of filtered) {
      const area = getArea(p.area);
      totalArea += area;
      const rural = p.rural * populationRate;
      const urban = p.urban * populationRate * urbanization;
      const population = rn(rural + urban);
      const populationTip = `Total population: ${si(population)}; Rural population: ${si(rural)}; Urban population: ${si(urban)}`;
      totalPopulation += population;
      totalBurgs += p.burgs.length;

      const stateName = pack.states[p.state].name;
      const capital = p.burg ? pack.burgs[p.burg].name : "";
      const separable = p.burg && p.burg !== pack.states[p.state].capital;
      const focused = defs.select("#fog #focusProvince" + p.i).size();
      COArenderer.trigger("provinceCOA" + p.i, p.coa);
      lines += /* html */ `<div
        class="states"
        data-id=${p.i}
        data-name="${p.name}"
        data-form="${p.formName}"
        data-color="${p.color}"
        data-capital="${capital}"
        data-state="${stateName}"
        data-area=${area}
        data-population=${population}
        data-burgs=${p.burgs.length}
      >
        <fill-box fill="${p.color}"></fill-box>
        <input data-tip="Province name. Click to change" class="name pointer" value="${p.name}" readonly />
        <svg data-tip="Click to show and edit province emblem" class="coaIcon pointer hide" viewBox="0 0 200 200"><use href="#provinceCOA${p.i}"></use></svg>
        <input data-tip="Province form name. Click to change" class="name pointer hide" value="${p.formName}" readonly />
        <span data-tip="Province capital. Click to zoom into view" class="icon-star-empty pointer hide ${p.burg ? "" : "placeholder"}"></span>
        <select
          data-tip="Province capital. Click to select from burgs within the state. No capital means the province is governed from the state capital"
          class="cultureBase hide ${p.burgs.length ? "" : "placeholder"}"
        >
          ${p.burgs.length ? this.getCapitalOptions(p.burgs, p.burg) : ""}
        </select>
        <input data-tip="Province owner" class="provinceOwner" value="${stateName}" disabled">
        <span data-tip="Click to overview province burgs" style="padding-right: 1px" class="icon-dot-circled pointer hide"></span>
        <div data-tip="Burgs count" class="provinceBurgs hide">${p.burgs.length}</div>
        <span data-tip="Province area" style="padding-right: 4px" class="icon-map-o hide"></span>
        <div data-tip="Province area" class="biomeArea hide">${si(area) + unit}</div>
        <span data-tip="${populationTip}" class="icon-male hide"></span>
        <div data-tip="${populationTip}" class="culturePopulation hide">${si(population)}</div>
        <span
          data-tip="Declare province independence (turn non-capital province with burgs into a new state)"
          class="icon-flag-empty ${separable ? "" : "placeholder"} hide"
        ></span>
        <span data-tip="Toggle province focus" class="icon-pin ${focused ? "" : " inactive"} hide"></span>
        <span data-tip="Lock the province" class="icon-lock${p.lock ? "" : "-open"} hide"></span>
        <span data-tip="Remove the province" class="icon-trash-empty hide"></span>
      </div>`;
    }
    body.innerHTML = lines;

    ensureEl("provincesFooterNumber").innerHTML = filtered.length;
    ensureEl("provincesFooterBurgs").innerHTML = totalBurgs;
    ensureEl("provincesFooterArea").innerHTML = filtered.length ? si(totalArea / filtered.length) + unit : 0 + unit;
    ensureEl("provincesFooterPopulation").innerHTML = filtered.length ? si(totalPopulation / filtered.length) : 0;
    (ensureEl("provincesFooterArea") as HTMLElement).dataset.area = String(totalArea);
    (ensureEl("provincesFooterPopulation") as HTMLElement).dataset.population = String(totalPopulation);

    body.querySelectorAll("div.states").forEach((el: Element) => {
      el.on("click", function(this: HTMLElement) { provincesEditorSelf.selectProvinceOnLineClick(this); });
      el.on("mouseenter", (ev: Event) => this.provinceHighlightOn(ev));
      el.on("mouseleave", (ev: Event) => this.provinceHighlightOff(ev));
    });

    if (body.dataset.type === "percentage") {
      body.dataset.type = "absolute";
      this.togglePercentageMode();
    }
    applySorting(provincesHeader);
    $("#provincesEditor").dialog({width: fitContent()});
  }

  private getCapitalOptions(burgs: number[], capital: number) {
    let options = "";
    burgs.forEach(
      (b: number) => (options += `<option ${b === capital ? "selected" : ""} value="${b}">${pack.burgs[b].name}</option>`)
    );
    return options;
  }

  private provinceHighlightOn(event: Event) {
    const province = +(event.target as HTMLElement).dataset.id!;
    const el = this.body.querySelector(`div[data-id='${province}']`);
    if (el) el.classList.add("active");

    if (!layerIsOn("toggleProvinces")) return;
    if (customization) return;
    const animate = d3.transition().duration(2000).ease(d3.easeSinIn);
    provs
      .select("#province" + province)
      .raise()
      .transition(animate)
      .attr("stroke-width", 2.5)
      .attr("stroke", "#d0240f");
  }

  private provinceHighlightOff(event: Event) {
    const province = +(event.target as HTMLElement).dataset.id!;
    const el = this.body.querySelector(`div[data-id='${province}']`);
    if (el) el.classList.remove("active");

    if (!layerIsOn("toggleProvinces")) return;
    provs
      .select("#province" + province)
      .transition()
      .attr("stroke-width", null)
      .attr("stroke", null);
  }

  private changeFill(el: HTMLElement) {
    const currentFill = el.getAttribute("fill");
    const p = +(el.parentNode as HTMLElement).dataset.id!;

    const callback = (newFill: string) => {
      (el as any).fill = newFill;
      pack.provinces[p].color = newFill;
      const g = provs.select("#provincesBody");
      g.select("#province" + p).attr("fill", newFill);
      g.select("#province-gap" + p).attr("stroke", newFill);
    };

    openPicker(currentFill, callback);
  }

  private capitalZoomIn(p: number) {
    const capital = pack.provinces[p].burg;
    const l = burgLabels.select("[data-id='" + capital + "']");
    const x = +l.attr("x");
    const y = +l.attr("y");
    zoomTo(x, y, 8, 2000);
  }

  private triggerIndependencePromps(p: number) {
    confirmationDialog({
      title: "Declare independence",
      message: "Are you sure you want to declare province independence? <br>It will turn province into a new state",
      confirm: "Declare",
      onConfirm: () => {
        const released = this.declareProvinceIndependence(p);
        if (!released) return;
        const [oldStateId, newStateId] = released;
        this.updateStatesPostRelease([oldStateId], [newStateId]);
      }
    });
  }

  private declareProvinceIndependence(provinceId: number): [number, number] | null {
    const {states, provinces, cells, burgs} = pack;
    const province = provinces[provinceId];
    const {name, burg: burgId, burgs: provinceBurgs} = province;

    if (provinceBurgs.some((b: number) => burgs[b].capital)) {
      tip(
        "Cannot declare independence of a province having capital burg. Please change capital first",
        false,
        "error"
      );
      return null;
    }
    if (!burgId) {
      tip("Cannot declare independence of a province without burg", false, "error");
      return null;
    }

    const oldStateId = province.state;
    const newStateId = states.length;

    const capital = burgs[burgId];
    capital.capital = 1;
    Burgs.changeGroup(capital);

    province.burgs.forEach((b: number) => (burgs[b].state = newStateId));

    const {cell: center, culture} = burgs[burgId];
    const color = getRandomColor();
    const coa = province.coa;
    const coaEl = ensureEl("provinceCOA" + provinceId);
    if (coaEl) coaEl.id = "stateCOA" + newStateId;
    emblems.select(`#provinceEmblems > use[data-i='${provinceId}']`).remove();

    cells.i
      .filter((i: number) => cells.province[i] === provinceId)
      .forEach((i: number) => {
        cells.province[i] = 0;
        cells.state[i] = newStateId;
      });

    const diplomacy = states.map((s: any) => {
      if (!s.i || s.removed) return "x";
      let relations = states[oldStateId].diplomacy[s.i];
      if (s.i === oldStateId) relations = "Enemy";
      else if (relations === "Ally") relations = "Suspicion";
      else if (relations === "Friendly") relations = "Suspicion";
      else if (relations === "Suspicion") relations = "Neutral";
      else if (relations === "Enemy") relations = "Friendly";
      else if (relations === "Rival") relations = "Friendly";
      else if (relations === "Vassal") relations = "Suspicion";
      else if (relations === "Suzerain") relations = "Enemy";
      s.diplomacy.push(relations);
      return relations;
    });
    diplomacy.push("x");
    states[0].diplomacy.push([
      `Independance declaration`,
      `${name} declared its independance from ${states[oldStateId].name}`
    ]);

    states.push({
      i: newStateId,
      name,
      diplomacy,
      provinces: [],
      color,
      expansionism: 0.5,
      capital: burgId,
      type: "Generic",
      center,
      culture,
      military: [],
      alert: 1,
      coa
    });

    states[oldStateId].provinces = states[oldStateId].provinces.filter((p: number) => p !== provinceId);
    provinces[provinceId] = {i: provinceId, removed: true};

    return [oldStateId, newStateId];
  }

  private updateStatesPostRelease(oldStates: number[], newStates: number[]) {
    const allStates = unique([...oldStates, ...newStates]);

    layerIsOn("toggleProvinces") && toggleProvinces();
    layerIsOn("toggleStates") ? drawStates() : toggleStates();
    layerIsOn("toggleBorders") ? drawBorders() : toggleBorders();

    States.getPoles();
    States.findNeighbors();
    States.collectStatistics();
    States.defineStateForms(newStates);
    drawStateLabels(allStates);

    allStates.forEach((stateId: number) => {
      emblems.select(`#stateEmblems > use[data-i='${stateId}']`)?.remove();
      const {coa, pole} = pack.states[stateId];
      COArenderer.add("state", stateId, coa, ...pole);
    });

    layerIsOn("toggleProvinces") && toggleProvinces();
    layerIsOn("toggleStates") ? drawStates() : toggleStates();
    layerIsOn("toggleBorders") ? drawBorders() : toggleBorders();

    unfog();
    closeDialogs();
    editStates();
  }

  private changeProvincePopulation(province: number) {
    const p = pack.provinces[province];
    const cells = pack.cells.i.filter((i: number) => pack.cells.province[i] === province);
    if (!cells.length) {
      tip("Province does not have any cells, cannot change population", false, "error");
      return;
    }
    const rural = rn(p.rural * populationRate);
    const urban = rn(p.urban * populationRate * urbanization);
    const total = rural + urban;
    const l = (n: number) => Number(n).toLocaleString();

    alertMessage.innerHTML = /* html */ ` Rural: <input type="number" min="0" step="1" id="ruralPop" value=${rural} style="width:6em" /> Urban:
      <input type="number" min="0" step="1" id="urbanPop" value=${urban} style="width:6em" ${p.burgs.length ? "" : "disabled"} />
      <p>Total population: ${l(total)} ⇒ <span id="totalPop">${l(total)}</span> (<span id="totalPopPerc">100</span>%)</p>`;

    const update = () => {
      const totalNew = (ruralPop as HTMLInputElement).valueAsNumber + (urbanPop as HTMLInputElement).valueAsNumber;
      if (isNaN(totalNew)) return;
      totalPop.innerHTML = l(totalNew);
      totalPopPerc.innerHTML = String(rn((totalNew / total) * 100));
    };

    (ruralPop as HTMLInputElement).oninput = () => update();
    (urbanPop as HTMLInputElement).oninput = () => update();

    const applyPopulationChange = () => {
      const ruralChange = +(ruralPop as HTMLInputElement).value / rural;
      if (isFinite(ruralChange) && ruralChange !== 1) {
        cells.forEach((i: number) => (pack.cells.pop[i] *= ruralChange));
      }
      if (!isFinite(ruralChange) && +(ruralPop as HTMLInputElement).value > 0) {
        const points = +(ruralPop as HTMLInputElement).value / populationRate;
        const pop = rn(points / cells.length);
        cells.forEach((i: number) => (pack.cells.pop[i] = pop));
      }

      const urbanChange = +(urbanPop as HTMLInputElement).value / urban;
      if (isFinite(urbanChange) && urbanChange !== 1) {
        p.burgs.forEach((b: number) => (pack.burgs[b].population = rn(pack.burgs[b].population * urbanChange, 4)));
      }
      if (!isFinite(urbanChange) && +(urbanPop as HTMLInputElement).value > 0) {
        const points = +(urbanPop as HTMLInputElement).value / populationRate / urbanization;
        const population = rn(points / burgs.length, 4);
        p.burgs.forEach((b: number) => (pack.burgs[b].population = population));
      }

      if (layerIsOn("togglePopulation")) drawPopulation();
      this.refreshProvincesEditor();
    };

    $("#alert").dialog({
      resizable: false,
      title: "Change province population",
      width: "24em",
      buttons: {
        Apply: () => {
          applyPopulationChange();
          $("#alert").dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      },
      position: {my: "center", at: "center", of: "svg"}
    });
  }

  private toggleFog(p: number, cl: DOMTokenList) {
    const path = provs.select("#province" + p).attr("d"),
      id = "focusProvince" + p;
    cl.contains("inactive") ? fog(id, path) : unfog(id);
    cl.toggle("inactive");
  }

  private removeProvince(p: number) {
    alertMessage.innerHTML = /* html */ `Are you sure you want to remove the province? <br />This action cannot be reverted`;
    $("#alert").dialog({
      resizable: false,
      title: "Remove province",
      buttons: {
        Remove: () => {
          pack.cells.province.forEach((province: number, i: number) => {
            if (province === p) pack.cells.province[i] = 0;
          });
          const s = pack.provinces[p].state,
            state = pack.states[s];
          if (state.provinces.includes(p)) state.provinces.splice(state.provinces.indexOf(p), 1);

          unfog("focusProvince" + p);

          const coaId = "provinceCOA" + p;
          if (ensureEl(coaId)) ensureEl(coaId).remove();
          emblems.select(`#provinceEmblems > use[data-i='${p}']`).remove();

          pack.provinces[p] = {i: p, removed: true};

          const g = provs.select("#provincesBody");
          g.select("#province" + p).remove();
          g.select("#province-gap" + p).remove();
          if (layerIsOn("toggleBorders")) drawBorders();
          this.refreshProvincesEditor();
          $("#alert").dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  private editProvinceName(province: number) {
    const p = pack.provinces[province];
    (ensureEl("provinceNameEditor") as HTMLElement).dataset.province = String(province);
    (ensureEl("provinceNameEditorShort") as HTMLInputElement).value = p.name;
    applyOption(provinceNameEditorSelectForm, p.formName);
    (ensureEl("provinceNameEditorFull") as HTMLInputElement).value = p.fullName;

    const cultureId = pack.cells.culture[p.center];
    (ensureEl("provinceCultureDisplay") as HTMLElement).innerText = pack.cultures[cultureId].name;

    $("#provinceNameEditor").dialog({
      resizable: false,
      title: "Change province name",
      buttons: {
        Apply: () => {
          applyNameChange(p);
          $("#provinceNameEditor").dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      },
      position: {my: "center", at: "center", of: "svg"}
    });

    if (modules.editProvinceName) return;
    modules.editProvinceName = true;

    ensureEl("provinceNameEditorShortCulture").on("click", regenerateShortNameCulture);
    ensureEl("provinceNameEditorShortRandom").on("click", regenerateShortNameRandom);
    ensureEl("provinceNameEditorAddForm").on("click", addCustomForm);
    ensureEl("provinceNameEditorFullRegenerate").on("click", regenerateFullName);

    function regenerateShortNameCulture() {
      const province = +(provinceNameEditor as HTMLElement).dataset.province!;
      const culture = pack.cells.culture[pack.provinces[province].center];
      const name = Names.getState(Names.getCultureShort(culture), culture);
      (ensureEl("provinceNameEditorShort") as HTMLInputElement).value = name;
    }

    function regenerateShortNameRandom() {
      const base = rand(nameBases.length - 1);
      const name = Names.getState(Names.getBase(base), undefined, base);
      (ensureEl("provinceNameEditorShort") as HTMLInputElement).value = name;
    }

    function addCustomForm() {
      const value = (provinceNameEditorCustomForm as HTMLInputElement).value;
      const displayed = (provinceNameEditorCustomForm as HTMLElement).style.display === "inline-block";
      (provinceNameEditorCustomForm as HTMLElement).style.display = displayed ? "none" : "inline-block";
      (provinceNameEditorSelectForm as HTMLElement).style.display = displayed ? "inline-block" : "none";
      if (displayed) applyOption(provinceNameEditorSelectForm, value);
    }

    function regenerateFullName() {
      const short = (ensureEl("provinceNameEditorShort") as HTMLInputElement).value;
      const form = (ensureEl("provinceNameEditorSelectForm") as HTMLSelectElement).value;
      (ensureEl("provinceNameEditorFull") as HTMLInputElement).value = getFullName();

      function getFullName() {
        if (!form) return short;
        if (!short && form) return "The " + form;
        return short + " " + form;
      }
    }

    function applyNameChange(p: any) {
      p.name = (ensureEl("provinceNameEditorShort") as HTMLInputElement).value;
      p.formName = (ensureEl("provinceNameEditorSelectForm") as HTMLSelectElement).value;
      p.fullName = (ensureEl("provinceNameEditorFull") as HTMLInputElement).value;
      provs.select("#provinceLabel" + p.i).text(p.name);
    }
  }

  private changeCapital(p: number, line: HTMLElement, value: string) {
    line.dataset.capital = pack.burgs[+value].name;
    pack.provinces[p].center = pack.burgs[+value].cell;
    pack.provinces[p].burg = +value;
  }

  private togglePercentageMode() {
    const body = this.body;
    if (body.dataset.type === "absolute") {
      body.dataset.type = "percentage";
      const totalBurgs = +(ensureEl("provincesFooterBurgs") as HTMLElement).innerText;
      const totalArea = +(ensureEl("provincesFooterArea") as HTMLElement).dataset.area!;
      const totalPopulation = +(ensureEl("provincesFooterPopulation") as HTMLElement).dataset.population!;

      body.querySelectorAll(":scope > div").forEach((el: Element) => {
        const {burgs, area, population} = (el as HTMLElement).dataset;
        (el.querySelector(".provinceBurgs") as HTMLElement).innerText = rn((+burgs! / totalBurgs) * 100) + "%";
        (el.querySelector(".biomeArea") as HTMLElement).innerHTML = rn((+area! / totalArea) * 100) + "%";
        (el.querySelector(".culturePopulation") as HTMLElement).innerHTML = rn((+population! / totalPopulation) * 100) + "%";
      });
    } else {
      body.dataset.type = "absolute";
      this.provincesEditorAddLines();
    }
  }

  private showChart() {
    const getColor = (s: any) => (!s.i || s.removed || s.color[0] !== "#" ? "#666" : d3.color(s.color).darker());
    const states = pack.states.map((s: any) => ({id: s.i, state: s.i ? 0 : null, color: getColor(s)}));
    const provinces = pack.provinces
      .filter((p: any) => p.i && !p.removed)
      .map((p: any) => ({
        id: p.i + states.length - 1,
        i: p.i,
        state: p.state,
        color: p.color,
        name: p.name,
        fullName: p.fullName,
        area: p.area,
        urban: p.urban,
        rural: p.rural
      }));
    const data = states.concat(provinces);
    const root = d3
      .stratify()
      .parentId((d: any) => d.state)(data)
      .sum((d: any) => d.area);

    const width = 300 + 300 * uiSize.value,
      height = 90 + 90 * uiSize.value;
    const margin = {top: 10, right: 10, bottom: 0, left: 10};
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const treeLayout = d3.treemap().size([w, h]).padding(2);

    alertMessage.innerHTML = /* html */ `<select id="provincesTreeType" style="display:block; margin-left:13px; font-size:11px">
      <option value="area" selected>Area</option>
      <option value="population">Total population</option>
      <option value="rural">Rural population</option>
      <option value="urban">Urban population</option>
    </select>`;
    alertMessage.innerHTML += `<div id='provinceInfo' class='chartInfo'>&#8205;</div>`;
    const svg = d3
      .select("#alertMessage")
      .insert("svg", "#provinceInfo")
      .attr("id", "provincesTree")
      .attr("width", width)
      .attr("height", height)
      .attr("font-size", "10px");
    const graph = svg.append("g").attr("transform", `translate(10, 0)`);
    ensureEl("provincesTreeType").on("change", updateChart);

    treeLayout(root);

    const node = graph
      .selectAll("g")
      .data(root.leaves())
      .enter()
      .append("g")
      .attr("data-id", (d: any) => d.data.i)
      .on("mouseenter", (d: any) => showInfo(d3.event, d))
      .on("mouseleave", (d: any) => hideInfo(d));

    const showInfo = (ev: any, d: any) => {
      d3.select(ev.target).select("rect").classed("selected", 1);
      const name = d.data.fullName;
      const state = pack.states[d.data.state].fullName;

      const area = getArea(d.data.area) + " " + getAreaUnit();
      const rural = rn(d.data.rural * populationRate);
      const urban = rn(d.data.urban * populationRate * urbanization);

      const treeVal = (provincesTreeType as HTMLSelectElement).value;
      const value =
        treeVal === "area"
          ? "Area: " + area
          : treeVal === "rural"
          ? "Rural population: " + si(rural)
          : treeVal === "urban"
          ? "Urban population: " + si(urban)
          : "Population: " + si(rural + urban);

      provinceInfo.innerHTML = /* html */ `${name}. ${state}. ${value}`;
      this.provinceHighlightOn(ev);
    };

    const hideInfo = (ev: any) => {
      this.provinceHighlightOff(ev);
      if (!ensureEl("provinceInfo")) return;
      provinceInfo.innerHTML = "&#8205;";
      d3.select(ev.target).select("rect").classed("selected", 0);
    };

    node
      .append("rect")
      .attr("stroke", (d: any) => d.parent.data.color)
      .attr("stroke-width", 1)
      .attr("fill", (d: any) => d.data.color)
      .attr("x", (d: any) => d.x0)
      .attr("y", (d: any) => d.y0)
      .attr("width", (d: any) => d.x1 - d.x0)
      .attr("height", (d: any) => d.y1 - d.y0);

    node
      .append("text")
      .attr("text-rendering", "optimizeSpeed")
      .attr("dx", ".2em")
      .attr("dy", "1em")
      .attr("x", (d: any) => d.x0)
      .attr("y", (d: any) => d.y0);

    function hideNonfittingLabels() {
      node.select("text").each(function(this: SVGTextElement, d: any) {
        this.innerHTML = d.data.name;
        let b = this.getBBox();
        if (b.y + b.height > d.y1 + 1) this.innerHTML = "";

        for (let i = 0; i < 15 && b.width > 0 && b.x + b.width > d.x1; i++) {
          if (this.innerHTML.length < 3) {
            this.innerHTML = "";
            break;
          }
          this.innerHTML = this.innerHTML.slice(0, -2) + "…";
          b = this.getBBox();
        }
      });
    }

    function updateChart(this: HTMLSelectElement) {
      const val = this.value;
      const value =
        val === "area"
          ? (d: any) => d.area
          : val === "rural"
          ? (d: any) => d.rural
          : val === "urban"
          ? (d: any) => d.urban
          : (d: any) => d.rural + d.urban;

      root.sum(value);
      node.data(treeLayout(root).leaves());

      node
        .select("rect")
        .transition()
        .duration(1500)
        .attr("x", (d: any) => d.x0)
        .attr("y", (d: any) => d.y0)
        .attr("width", (d: any) => d.x1 - d.x0)
        .attr("height", (d: any) => d.y1 - d.y0);

      node
        .select("text")
        .transition()
        .duration(1500)
        .attr("x", (d: any) => d.x0)
        .attr("y", (d: any) => d.y0);

      setTimeout(hideNonfittingLabels, 2000);
    }

    $("#alert").dialog({
      title: "Provinces chart",
      width: fitContent(),
      position: {my: "left bottom", at: "left+10 bottom-10", of: "svg"},
      buttons: {},
      close: () => {
        alertMessage.innerHTML = "";
      }
    });

    hideNonfittingLabels();
  }

  private toggleProvinceLabels() {
    const hidden = provs.select("#provinceLabels").style("display") === "none";
    provs.select("#provinceLabels").style("display", `${hidden ? "block" : "none"}`);
    provs.attr("data-labels", +hidden);
    provs.selectAll("text").call(
      d3.drag().on("drag", function(this: SVGTextElement) { provincesEditorSelf.dragLabel(this); })
    ).classed("draggable", true);
  }

  private triggerProvincesRelease() {
    const body = this.body;
    confirmationDialog({
      title: "Release provinces",
      message: `Are you sure you want to release all provinces?
          </br>It will turn all separable provinces into independent states.
          </br>Capital province and provinces without any burgs will state as they are`,
      confirm: "Release",
      onConfirm: () => {
        const oldStateIds: number[] = [];
        const newStateIds: number[] = [];

        body.querySelectorAll(":scope > div").forEach((el: Element) => {
          const provinceId = +(el as HTMLElement).dataset.id!;
          const province = pack.provinces[provinceId];
          if (!province.burg) return;
          if (province.burg === pack.states[province.state].capital) return;
          if (province.burgs.some((burgId: number) => pack.burgs[burgId].capital)) return;

          const result = this.declareProvinceIndependence(provinceId);
          if (!result) return;
          const [oldStateId, newStateId] = result;
          oldStateIds.push(oldStateId);
          newStateIds.push(newStateId);
        });

        this.updateStatesPostRelease(unique(oldStateIds), newStateIds);
      }
    });
  }

  private enterProvincesManualAssignent() {
    const body = this.body;
    if (!layerIsOn("toggleProvinces")) toggleProvinces();
    if (!layerIsOn("toggleBorders")) toggleBorders();

    provinceBorders.select("path").attr("stroke", "#000").attr("stroke-width", 0.5);
    stateBorders.select("path").attr("stroke", "#000").attr("stroke-width", 1.2);

    customization = 11;
    provs.select("g#provincesBody").append("g").attr("id", "temp").attr("stroke-width", 0.3);
    provs
      .select("g#provincesBody")
      .append("g")
      .attr("id", "centers")
      .attr("fill", "none")
      .attr("stroke", "#ff0000")
      .attr("stroke-width", 1);

    document.querySelectorAll("#provincesBottom > *").forEach((el: Element) => ((el as HTMLElement).style.display = "none"));
    (ensureEl("provincesManuallyButtons") as HTMLElement).style.display = "inline-block";

    provincesEditor.querySelectorAll(".hide").forEach((el: Element) => el.classList.add("hidden"));
    provincesHeader.querySelector("div[data-sortby='state']").style.left = "7.7em";
    provincesFooter.style.display = "none";
    body.querySelectorAll("div > input, select, span, svg").forEach((e: Element) => ((e as HTMLElement).style.pointerEvents = "none"));
    $("#provincesEditor").dialog({position: {my: "right top", at: "right-10 top+10", of: "svg", collision: "fit"}});

    tip("Click on a province to select, drag the circle to change province", true);
    viewbox
      .style("cursor", "crosshair")
      .on("click", () => this.selectProvinceOnMapClick())
      .call(d3.drag().on("start", () => this.dragBrush()))
      .on("touchmove mousemove", () => this.moveBrush());

    const firstDiv = body.querySelector("div");
    if (firstDiv) {
      firstDiv.classList.add("selected");
      this.highlightProvinceVisual(+firstDiv.dataset.id!);
    }
  }

  public selectProvinceOnLineClick(el: HTMLElement) {
    if (customization !== 11) return;
    if (el.parentNode && (el.parentNode as HTMLElement).id !== "provincesBodySection") return;
    const body = this.body;
    const selected = body.querySelector("div.selected");
    if (selected) selected.classList.remove("selected");
    el.classList.add("selected");
    this.highlightProvinceVisual(+el.dataset.id!);
  }

  private selectProvinceOnMapClick() {
    const point = d3.mouse(viewbox.node());
    const i = findCell(point[0], point[1]);
    if (pack.cells.h[i] < 20 || !pack.cells.state[i]) return;

    const assigned = provs.select("g#temp").select("polygon[data-cell='" + i + "']");
    const province = assigned.size() ? +assigned.attr("data-province") : pack.cells.province[i];

    const editorLine = this.body.querySelector("div[data-id='" + province + "']");
    if (!editorLine) {
      tip("You cannot select a province if it is not in the Editor list", false, "error");
      return;
    }

    const selected = this.body.querySelector("div.selected");
    if (selected) selected.classList.remove("selected");
    (editorLine as HTMLElement).classList.add("selected");
    this.highlightProvinceVisual(province);
  }

  private highlightProvinceVisual(p: number) {
    debug.selectAll("path.selected").remove();
    const path = provs.select("#province" + p).attr("d");
    debug.append("path").attr("class", "selected").attr("d", path);
  }

  private dragBrush() {
    const r = +(provincesBrush as unknown as HTMLInputElement).value;

    d3.event.on("drag", () => {
      if (!d3.event.dx && !d3.event.dy) return;
      const p = d3.mouse(viewbox.node());
      moveCircle(p[0], p[1], r);

      const found = r > 5 ? findAll(p[0], p[1], r) : [findCell(p[0], p[1])];
      const selection = found.filter(isLand);
      if (selection) this.changeForSelection(selection);
    });
  }

  private changeForSelection(selection: number[]) {
    const temp = provs.select("#temp"),
      centers = provs.select("#centers");
    const selected = this.body.querySelector("div.selected");

    const provinceNew = +(selected as HTMLElement).dataset.id!;
    const state = pack.provinces[provinceNew].state;
    const fill = pack.provinces[provinceNew].color || "#ffffff";

    selection.forEach((i: number) => {
      if (!pack.cells.state[i] || pack.cells.state[i] !== state) return;
      const exists = temp.select("polygon[data-cell='" + i + "']");
      const provinceOld = exists.size() ? +exists.attr("data-province") : pack.cells.province[i];
      if (provinceNew === provinceOld) return;
      if (i === pack.provinces[provinceOld].center) {
        const center = centers.select("polygon[data-center='" + i + "']");
        if (!center.size()) centers.append("polygon").attr("data-center", i).attr("points", getPackPolygon(i) as any);
        tip(
          "Province center cannot be assigned to a different region. Please remove the province first",
          false,
          "error"
        );
        return;
      }

      if (exists.size()) {
        if (pack.cells.province[i] === provinceNew) exists.remove();
        else exists.attr("data-province", provinceNew).attr("fill", fill);
      } else {
        temp
          .append("polygon")
          .attr("points", getPackPolygon(i) as any)
          .attr("data-cell", i)
          .attr("data-province", provinceNew)
          .attr("fill", fill)
          .attr("stroke", "#555");
      }
    });
  }

  private moveBrush() {
    showMainTip();
    const point = d3.mouse(viewbox.node());
    const radius = +(provincesBrush as unknown as HTMLInputElement).value;
    moveCircle(point[0], point[1], radius);
  }

  private applyProvincesManualAssignent() {
    provs
      .select("#temp")
      .selectAll("polygon")
      .each(function(this: SVGPolygonElement) {
        const i = +(this as any).dataset.cell;
        pack.cells.province[i] = +(this as any).dataset.province;
      });

    Provinces.getPoles();
    if (layerIsOn("toggleBorders")) drawBorders();
    if (layerIsOn("toggleProvinces")) drawProvinces();

    this.exitProvincesManualAssignment();
    this.refreshProvincesEditor();
  }

  private exitProvincesManualAssignment(close = false) {
    const body = this.body;
    customization = 0;
    provs.select("#temp").remove();
    provs.select("#centers").remove();
    removeCircle();

    provinceBorders.select("path").attr("stroke", null).attr("stroke-width", null);
    stateBorders.select("path").attr("stroke", null).attr("stroke-width", null);
    debug.selectAll("path.selected").remove();

    document.querySelectorAll("#provincesBottom > *").forEach((el: Element) => ((el as HTMLElement).style.display = "inline-block"));
    (ensureEl("provincesManuallyButtons") as HTMLElement).style.display = "none";

    provincesEditor.querySelectorAll(".hide:not(.show)").forEach((el: Element) => el.classList.remove("hidden"));
    provincesHeader.querySelector("div[data-sortby='state']").style.left = "22em";
    provincesFooter.style.display = "block";
    body.querySelectorAll("div > input, select, span, svg").forEach((e: Element) => ((e as HTMLElement).style.pointerEvents = "all"));
    if (!close)
      $("#provincesEditor").dialog({position: {my: "right top", at: "right-10 top+10", of: "svg", collision: "fit"}});

    restoreDefaultEvents();
    clearMainTip();
    const selected = body.querySelector("div.selected");
    if (selected) selected.classList.remove("selected");
  }

  private enterAddProvinceMode() {
    if (ensureEl("provincesAdd").classList.contains("pressed")) return this.exitAddProvinceMode();

    customization = 12;
    ensureEl("provincesAdd").classList.add("pressed");
    tip("Click on the map to place a new province center", true);
    viewbox.style("cursor", "crosshair").on("click", () => this.addProvince());
    this.body.querySelectorAll("div > input, select, span, svg").forEach((e: Element) => ((e as HTMLElement).style.pointerEvents = "none"));
  }

  private addProvince() {
    const {cells, provinces} = pack;
    const point = d3.mouse(viewbox.node());
    const center = findCell(point[0], point[1]);
    if (cells.h[center] < 20)
      return tip("You cannot place province into the water. Please click on a land cell", false, "error");

    const oldProvince = cells.province[center];
    if (oldProvince && provinces[oldProvince].center === center)
      return tip("The cell is already a center of a different province. Select other cell", false, "error");

    const state = cells.state[center];
    if (!state)
      return tip(
        "You cannot create a province in neutral lands. Please assign this land to a state first",
        false,
        "error"
      );

    if (d3.event.shiftKey === false) this.exitAddProvinceMode();

    const province = provinces.length;
    pack.states[state].provinces.push(province);
    const burg = cells.burg[center];
    const c = cells.culture[center];
    const name = burg ? pack.burgs[burg].name : Names.getState(Names.getCultureShort(c), c);
    const formName = oldProvince ? provinces[oldProvince].formName : "Province";
    const fullName = name + " " + formName;
    const stateColor = pack.states[state].color;
    const rndColor = getRandomColor();
    const color = stateColor[0] === "#" ? d3.color(d3.interpolate(stateColor, rndColor)(0.2)).hex() : rndColor;

    const kinship = burg ? 0.8 : 0.4;
    const parent = burg ? pack.burgs[burg].coa : pack.states[state].coa;
    const type = Burgs.getType(center, (parent as any).port);
    const coa = COA.generate(parent, kinship, P(0.1), type);
    coa.shield = COA.getShield(c, state);
    COArenderer.add("province", province, coa, point[0], point[1]);

    provinces.push({i: province, state, center, burg, name, formName, fullName, color, coa});

    cells.province[center] = province;
    cells.c[center].forEach((c: number) => {
      if (cells.h[c] < 20 || cells.state[c] !== state) return;
      if (provinces.find((p: any) => !p.removed && p.center === c)) return;
      cells.province[c] = province;
    });

    if (layerIsOn("toggleBorders")) drawBorders();
    if (layerIsOn("toggleProvinces")) drawProvinces();

    this.collectStatistics();
    (ensureEl("provincesFilterState") as HTMLSelectElement).value = String(state);
    this.provincesEditorAddLines();
  }

  private exitAddProvinceMode() {
    customization = 0;
    restoreDefaultEvents();
    clearMainTip();
    this.body.querySelectorAll("div > input, select, span, svg").forEach((e: Element) => ((e as HTMLElement).style.pointerEvents = "all"));
    if (ensureEl("provincesAdd").classList.contains("pressed")) ensureEl("provincesAdd").classList.remove("pressed");
  }

  private recolorProvinces() {
    const state = +(ensureEl("provincesFilterState") as HTMLSelectElement).value;

    pack.provinces.forEach((p: any) => {
      if (!p || p.removed) return;
      if (state !== -1 && p.state !== state) return;
      const stateColor = pack.states[p.state].color;
      const rndColor = getRandomColor();
      p.color = stateColor[0] === "#" ? d3.color(d3.interpolate(stateColor, rndColor)(0.2)).hex() : rndColor;
    });

    if (!layerIsOn("toggleProvinces")) toggleProvinces();
    else drawProvinces();
  }

  private downloadProvincesData() {
    const unit = (areaUnit as HTMLSelectElement).value === "square" ? (distanceUnitInput as HTMLInputElement).value + "2" : (areaUnit as HTMLSelectElement).value;
    let data = `Id,Province,Full Name,Form,State,Color,Capital,Area ${unit},Total Population,Rural Population,Urban Population,Burgs\n`;

    this.body.querySelectorAll(":scope > div").forEach((el: Element) => {
      const htmlEl = el as HTMLElement;
      const key = parseInt(htmlEl.dataset.id!);
      const provincePack = pack.provinces[key];
      data += htmlEl.dataset.id + ",";
      data += htmlEl.dataset.name + ",";
      data += provincePack.fullName + ",";
      data += htmlEl.dataset.form + ",";
      data += htmlEl.dataset.state + ",";
      data += htmlEl.dataset.color + ",";
      data += htmlEl.dataset.capital + ",";
      data += htmlEl.dataset.area + ",";
      data += htmlEl.dataset.population + ",";
      data += Math.round(provincePack.rural * populationRate) + ",";
      data += Math.round(provincePack.urban * populationRate * urbanization) + ",";
      data += htmlEl.dataset.burgs + "\n";
    });

    const name = getFileName("Provinces") + ".csv";
    downloadFile(data, name);
  }

  private removeAllProvinces() {
    alertMessage.innerHTML = /* html */ `Are you sure you want to remove all provinces? <br />This action cannot be reverted`;
    $("#alert").dialog({
      resizable: false,
      title: "Remove all provinces",
      buttons: {
        Remove: () => {
          $("#alert").dialog("close");

          document.querySelectorAll("[id^='provinceCOA']").forEach((el: Element) => el.remove());
          emblems.select("#provinceEmblems").selectAll("*").remove();

          pack.provinces = [0] as any;
          pack.cells.province = new Uint16Array(pack.cells.i.length);
          pack.states.forEach((s: any) => (s.provinces = []));

          unfog();
          if (layerIsOn("toggleBorders")) drawBorders();
          provs.select("#provincesBody").remove();
          turnButtonOff("toggleProvinces");

          this.provincesEditorAddLines();
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  public dragLabel(element: SVGTextElement) {
    const tr = parseTransform(element.getAttribute("transform"));
    const x = +tr[0] - d3.event.x,
      y = +tr[1] - d3.event.y;

    d3.event.on("drag", function(this: SVGTextElement) {
      const transform = `translate(${x + d3.event.x},${y + d3.event.y})`;
      this.setAttribute("transform", transform);
    });
  }

  private closeProvincesEditor() {
    provs.selectAll("text").call(d3.drag().on("drag", null)).attr("class", null);
    if (customization === 11) this.exitProvincesManualAssignment(true);
    if (customization === 12) this.exitAddProvinceMode();
  }
}

const provincesEditorController = new ProvincesEditor();
const provincesEditorSelf = provincesEditorController;

export function editProvinces() {
  provincesEditorController.open();
}

function updateLockStatus(provinceId: number, classList: DOMTokenList) {
  const p = pack.provinces[provinceId];
  p.lock = !p.lock;

  classList.toggle("icon-lock-open");
  classList.toggle("icon-lock");
}
