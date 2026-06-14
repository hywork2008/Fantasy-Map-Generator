import * as d3 from "d3";
import { color, interpolate, interpolateString, pointer } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { Burg } from "../modules/burgs-generator";
import { Burgs } from "../modules/burgs-generator";
import type { Culture } from "../modules/cultures-generator";
import { COA } from "../modules/emblem/generator";
import type { Emblem as RendererEmblem } from "../modules/emblem/renderer";
import { COArenderer } from "../modules/emblem/renderer";
import type { Province } from "../modules/provinces-generator";
import { Provinces } from "../modules/provinces-generator";
import type { State } from "../modules/states-generator";
import { States } from "../modules/states-generator";
import { drawBorders, drawPopulation, drawProvinces, drawStateLabels, drawStates } from "../renderers";
import { openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { ensureEl, findCell, getRandomColor, isLand, parseTransform, rand, rn, si, unique } from "../utils";
import { getPackPolygon } from "../utils/graphUtils";
import { editEmblem } from "./emblems-editor";

let worldContext: WorldContext;
let viewContext: Readonly<ViewContext>;
let appServices: AppServices;

export function editProvinces(): void {
  if (customization) return;
  closeDialogs("#provincesEditor, .stable");
  if (!layerIsOn("toggleProvinces")) toggleProvinces();
  if (!layerIsOn("toggleBorders")) toggleBorders();
  if (layerIsOn("toggleStates")) toggleStates();
  if (layerIsOn("toggleCultures")) toggleCultures();

  provs
    .selectAll<SVGTextElement, unknown>("text")
    .call(d3.drag<SVGTextElement, unknown>().on("start", dragLabelStart).on("drag", dragLabel))
    .classed("draggable", true);
  const body = ensureEl("provincesBodySection");
  refreshProvincesEditor();

  if (modules.editProvinces) return;
  modules.editProvinces = true;

  openDialog("provincesEditor", {
    title: "Provinces Editor",
    resizable: false,
    width: fitContent(),
    close: closeProvincesEditor,
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });

  ensureEl("provincesEditorRefresh").addEventListener("click", refreshProvincesEditor);
  ensureEl("provincesEditStyle").addEventListener("click", () => editStyle("provs"));
  ensureEl("provincesFilterState").addEventListener("change", provincesEditorAddLines);
  ensureEl("provincesPercentage").addEventListener("click", togglePercentageMode);
  ensureEl("provincesChart").addEventListener("click", showChart);
  ensureEl("provincesToggleLabels").addEventListener("click", toggleLabels);
  ensureEl("provincesExport").addEventListener("click", downloadProvincesData);
  ensureEl("provincesRemoveAll").addEventListener("click", removeAllProvinces);
  ensureEl("provincesManually").addEventListener("click", enterProvincesManualAssignment);
  ensureEl("provincesManuallyApply").addEventListener("click", applyProvincesManualAssignment);
  ensureEl("provincesManuallyCancel").addEventListener("click", () => exitProvincesManualAssignment());
  ensureEl("provincesRelease").addEventListener("click", triggerProvincesRelease);
  ensureEl("provincesAdd").addEventListener("click", enterAddProvinceMode);
  ensureEl("provincesMerge").addEventListener("click", openProvinceMergeDialog);
  ensureEl("provincesRecolor").addEventListener("click", recolorProvinces);

  body.addEventListener("click", (ev: MouseEvent) => {
    if (customization) return;
    const el = ev.target as HTMLElement;
    const cl = el.classList;
    const line = el.parentNode as HTMLElement;
    const p = +line.dataset.id!;
    const stateId = pack.provinces[p].state;

    if (el.tagName === "FILL-BOX") changeFill(el);
    else if (cl.contains("name")) editProvinceName(p);
    else if (cl.contains("coaIcon")) editEmblem?.("province", `provinceCOA${p}`, pack.provinces[p]);
    else if (cl.contains("icon-star-empty")) capitalZoomIn(p);
    else if (cl.contains("icon-flag-empty")) triggerIndependencePrompts(p);
    else if (cl.contains("icon-dot-circled")) overviewBurgs({ stateId });
    else if (cl.contains("culturePopulation")) changePopulation(p);
    else if (cl.contains("icon-target")) highlightElement(provs.select(`#province${p}`).node() as Element, 8);
    else if (cl.contains("icon-pin")) toggleFog(p, cl);
    else if (cl.contains("icon-trash-empty")) removeProvince(p);
    else if (cl.contains("icon-lock") || cl.contains("icon-lock-open")) updateLockStatus(p, cl);
  });

  body.addEventListener("change", (ev: Event) => {
    const el = ev.target as HTMLSelectElement;
    const cl = el.classList;
    const line = el.parentNode as HTMLElement;
    const p = +line.dataset.id!;
    if (cl.contains("cultureBase")) changeCapital(p, line, el.value);
  });

  function refreshProvincesEditor(): void {
    collectStatistics();
    updateFilter();
    provincesEditorAddLines();
  }

  function collectStatistics(): void {
    const { cells } = pack;
    const provinces = pack.provinces as Province[];
    const burgs = pack.burgs as Burg[];

    provinces.forEach(p => {
      if (!p.i || p.removed) return;
      p.area = p.rural = p.urban = 0;
      p.burgs = [];
      if ((p.burg && !burgs[p.burg]) || burgs[p.burg]?.removed) p.burg = 0;
    });

    for (const i of cells.i) {
      const p = cells.province[i];
      if (!p) continue;
      provinces[p].area! += cells.area[i];
      provinces[p].rural! += cells.pop[i];
      if (!cells.burg[i]) continue;
      provinces[p].urban! += burgs[cells.burg[i]].population ?? 0;
      provinces[p].burgs!.push(cells.burg[i]);
    }

    provinces.forEach(p => {
      if (!p.i || p.removed) return;
      if (!p.burg && p.burgs?.length) p.burg = p.burgs[0];
    });
  }

  function updateFilter(): void {
    const stateFilter = ensureEl("provincesFilterState") as HTMLSelectElement;
    const selectedState = stateFilter.value || "1";
    stateFilter.options.length = 0;
    stateFilter.options.add(new Option("all", "-1", false, selectedState === "-1"));
    const statesSorted = (pack.states as State[])
      .filter(s => s.i && !s.removed)
      .sort((a, b) => (a.name > b.name ? 1 : -1));
    statesSorted.forEach(s => {
      stateFilter.options.add(new Option(s.name, String(s.i), false, String(s.i) === selectedState));
    });
  }

  function provincesEditorAddLines(): void {
    const unit = ` ${getAreaUnit()}`;
    const selectedState = +(ensureEl("provincesFilterState") as HTMLSelectElement).value;
    let filtered = (pack.provinces as Province[]).filter(p => p.i && !p.removed);
    if (selectedState !== -1) filtered = filtered.filter(p => p.state === selectedState);
    body.innerHTML = "";

    let lines = "";
    let totalArea = 0;
    let totalPopulation = 0;
    let totalBurgs = 0;

    for (const p of filtered) {
      const area = getArea(p.area ?? 0);
      totalArea += area;
      const rural = (p.rural ?? 0) * populationRate;
      const urban = (p.urban ?? 0) * populationRate * urbanization;
      const population = rn(rural + urban);
      const populationTip = `Total population: ${si(population)}; Rural population: ${si(rural)}; Urban population: ${si(urban)}`;
      totalPopulation += population;
      const burgCount = p.burgs?.length ?? 0;
      totalBurgs += burgCount;

      const stateName = (pack.states as State[])[p.state].name;
      const capital = p.burg ? ((pack.burgs as Burg[])[p.burg].name ?? "") : "";
      const separable = p.burg && p.burg !== (pack.states as State[])[p.state].capital;
      const focused = defs.select(`#fog #focusProvince${p.i}`).size();
      COArenderer.trigger(`provinceCOA${p.i}`, p.coa as RendererEmblem);
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
        data-burgs=${burgCount}
      >
        <fill-box fill="${p.color}"></fill-box>
        <input data-tip="Province name. Click to change" class="name pointer" value="${p.name}" readonly />
        <svg data-tip="Click to show and edit province emblem" class="coaIcon pointer hide" viewBox="0 0 200 200"><use href="#provinceCOA${p.i}"></use></svg>
        <input data-tip="Province form name. Click to change" class="name pointer hide" value="${p.formName}" readonly />
        <span data-tip="Province capital. Click to zoom into view" class="icon-star-empty pointer hide ${p.burg ? "" : "placeholder"}"></span>
        <select data-tip="Province capital. Click to select from burgs within the state. No capital means the province is governed from the state capital" class="cultureBase hide ${burgCount ? "" : "placeholder"}">
          ${burgCount && p.burgs ? getCapitalOptions(p.burgs, p.burg) : ""}
        </select>
        <input data-tip="Province owner" class="provinceOwner" value="${stateName}" disabled">
        <span data-tip="Click to overview province burgs" style="padding-right: 1px" class="icon-dot-circled pointer hide"></span>
        <div data-tip="Burgs count" class="provinceBurgs hide">${burgCount}</div>
        <span data-tip="Province area" style="padding-right: 4px" class="icon-map-o hide"></span>
        <div data-tip="Province area" class="biomeArea hide">${si(area) + unit}</div>
        <span data-tip="${populationTip}" class="icon-male hide"></span>
        <div data-tip="${populationTip}" class="culturePopulation hide">${si(population)}</div>
        <span data-tip="Declare province independence (turn non-capital province with burgs into a new state)" class="icon-flag-empty ${separable ? "" : "placeholder"} hide"></span>
        <span data-tip="Locate the province" class="icon-target hide"></span>
        <span data-tip="Toggle province focus" class="icon-pin ${focused ? "" : " inactive"} hide"></span>
        <span data-tip="Lock the province" class="icon-lock${p.lock ? "" : "-open"} hide"></span>
        <span data-tip="Remove the province" class="icon-trash-empty hide"></span>
      </div>`;
    }
    body.innerHTML = lines;

    ensureEl("provincesFooterNumber").innerHTML = String(filtered.length);
    ensureEl("provincesFooterBurgs").innerHTML = String(totalBurgs);
    ensureEl("provincesFooterArea").innerHTML = filtered.length ? si(totalArea / filtered.length) + unit : `0${unit}`;
    ensureEl("provincesFooterPopulation").innerHTML = filtered.length ? si(totalPopulation / filtered.length) : "0";
    (ensureEl("provincesFooterArea") as HTMLElement).dataset.area = String(totalArea);
    (ensureEl("provincesFooterPopulation") as HTMLElement).dataset.population = String(totalPopulation);

    body.querySelectorAll("div.states").forEach(el => {
      el.addEventListener("click", selectProvinceOnLineClick as EventListener);
      el.addEventListener("mouseenter", provinceHighlightOn as EventListener);
      el.addEventListener("mouseleave", provinceHighlightOff as EventListener);
    });

    if (body.dataset.type === "percentage") {
      body.dataset.type = "absolute";
      togglePercentageMode();
    }
    applySorting(ensureEl("provincesHeader") as HTMLElement);
    openDialog("provincesEditor", { width: fitContent() });
  }

  function getCapitalOptions(burgs: number[], capital: number): string {
    let options = "";
    burgs.forEach(b => {
      options += `<option ${b === capital ? "selected" : ""} value="${b}">${(pack.burgs as Burg[])[b].name ?? ""}</option>`;
    });
    return options;
  }

  function provinceHighlightOn(event: MouseEvent): void {
    const province = +(event.target as HTMLElement).dataset.id!;
    const el = body.querySelector<HTMLElement>(`div[data-id='${province}']`);
    if (el) el.classList.add("active");

    if (!layerIsOn("toggleProvinces")) return;
    if (customization) return;
    const animate = d3.transition().duration(2000).ease(d3.easeSinIn);
    provs
      .select(`#province${province}`)
      .raise()
      .transition(animate)
      .attr("stroke-width", 2.5)
      .attr("stroke", "#d0240f");
  }

  function provinceHighlightOff(event: MouseEvent | null): void {
    const province = event?.target ? +(event.target as HTMLElement).dataset.id! : null;
    if (province) {
      const el = body.querySelector<HTMLElement>(`div[data-id='${province}']`);
      if (el) el.classList.remove("active");
    }

    if (!layerIsOn("toggleProvinces") || !province) {
      debug.selectAll(".highlight").remove();
      return;
    }
    provs.select(`#province${province}`).transition().attr("stroke-width", null).attr("stroke", null);
    debug.selectAll(".highlight").remove();
  }

  function changeFill(el: HTMLElement): void {
    const currentFill = el.getAttribute("fill")!;
    const p = +(el.parentNode as HTMLElement).dataset.id!;

    const callback = (newFill: string) => {
      (el as unknown as { fill: string }).fill = newFill;
      (pack.provinces as Province[])[p].color = newFill;
      const g = provs.select("#provincesBody");
      g.select(`#province${p}`).attr("fill", newFill);
      g.select(`#province-gap${p}`).attr("stroke", newFill);
    };

    openPicker(currentFill, callback);
  }

  function capitalZoomIn(p: number): void {
    const capital = (pack.provinces as Province[])[p].burg;
    const l = burgLabels.select(`[data-id='${capital}']`);
    const x = +l.attr("x");
    const y = +l.attr("y");
    zoomTo(x, y, 8, 2000);
  }

  function triggerIndependencePrompts(p: number): void {
    confirmationDialog({
      title: "Declare independence",
      message: "Are you sure you want to declare province independence? <br>It will turn province into a new state",
      confirm: "Declare",
      onConfirm: () => {
        const [oldStateId, newStateId] = declareProvinceIndependence(p);
        updateStatesPostRelease([oldStateId], [newStateId]);
      }
    });
  }

  function declareProvinceIndependence(provinceId: number): [number, number] {
    const { states, provinces, cells, burgs } = pack;
    const province = (provinces as Province[])[provinceId];
    const { name, burg: burgId, burgs: provinceBurgs } = province;

    if ((provinceBurgs ?? []).some((b: number) => (burgs as Burg[])[b].capital))
      return tip(
        "Cannot declare independence of a province having capital burg. Please change capital first",
        false,
        "error"
      ) as unknown as [number, number];
    if (!burgId)
      return tip("Cannot declare independence of a province without burg", false, "error") as unknown as [
        number,
        number
      ];

    const oldStateId = province.state;
    const newStateId = (states as State[]).length;

    const capital = (burgs as Burg[])[burgId];
    capital.capital = 1;
    Burgs.changeGroup(capital);

    (provinceBurgs ?? []).forEach((b: number) => {
      (burgs as Burg[])[b].state = newStateId;
    });

    const { cell: center, culture } = (burgs as Burg[])[burgId];
    const newColor = getRandomColor();
    const coa = province.coa;
    const coaEl = document.getElementById(`provinceCOA${provinceId}`);
    if (coaEl) coaEl.id = `stateCOA${newStateId}`;
    emblems.select(`#provinceEmblems > use[data-i='${provinceId}']`).remove();

    Array.from(cells.i)
      .filter((i: number) => cells.province[i] === provinceId)
      .forEach((i: number) => {
        cells.province[i] = 0;
        cells.state[i] = newStateId;
      });

    const statesArr = states as State[];
    const diplomacy = statesArr.map(s => {
      if (!s.i || s.removed) return "x";
      let relations = statesArr[oldStateId].diplomacy![s.i];
      if (s.i === oldStateId) relations = "Enemy";
      else if (relations === "Ally") relations = "Suspicion";
      else if (relations === "Friendly") relations = "Suspicion";
      else if (relations === "Suspicion") relations = "Neutral";
      else if (relations === "Enemy") relations = "Friendly";
      else if (relations === "Rival") relations = "Friendly";
      else if (relations === "Vassal") relations = "Suspicion";
      else if (relations === "Suzerain") relations = "Enemy";
      s.diplomacy!.push(relations);
      return relations;
    });
    diplomacy.push("x");
    statesArr[0].diplomacy!.push(`${name} declared its independance from ${statesArr[oldStateId].name}`);

    statesArr.push({
      i: newStateId,
      name,
      diplomacy,
      provinces: [],
      color: newColor,
      expansionism: 0.5,
      capital: burgId,
      type: "Generic",
      center: center!,
      culture: culture!,
      military: [],
      alert: 1,
      coa
    } as State);

    statesArr[oldStateId].provinces = (statesArr[oldStateId].provinces ?? []).filter(p => p !== provinceId);
    (provinces as Province[])[provinceId] = { i: provinceId, removed: true } as Province;

    return [oldStateId, newStateId];
  }

  function updateStatesPostRelease(oldStates: number[], newStates: number[]): void {
    const allStates = unique([...oldStates, ...newStates]);

    layerIsOn("toggleProvinces") && toggleProvinces();
    layerIsOn("toggleStates") ? drawStates(worldContext, viewContext, appServices) : toggleStates();
    layerIsOn("toggleBorders") ? drawBorders(worldContext, viewContext, appServices) : toggleBorders();

    const state = getWorldState();
    States.getPoles(state);
    States.findNeighbors();
    States.collectStatistics(state);
    States.defineStateForms(state, newStates);
    drawStateLabels(worldContext, viewContext, appServices, allStates);

    allStates.forEach(stateId => {
      emblems.select(`#stateEmblems > use[data-i='${stateId}']`)?.remove();
      const { coa, pole } = (pack.states as State[])[stateId];
      COArenderer.add("state", stateId, coa as RendererEmblem, pole![0], pole![1]);
    });

    layerIsOn("toggleProvinces") && toggleProvinces();
    layerIsOn("toggleStates") ? drawStates(worldContext, viewContext, appServices) : toggleStates();
    layerIsOn("toggleBorders") ? drawBorders(worldContext, viewContext, appServices) : toggleBorders();

    unfog();
    closeDialogs();
    editStates();
  }

  function changePopulation(province: number): void {
    const p = (pack.provinces as Province[])[province];
    const cells = Array.from(pack.cells.i).filter(i => pack.cells.province[i] === province);
    if (!cells.length) {
      tip("Province does not have any cells, cannot change population", false, "error");
      return;
    }
    const rural = rn((p.rural ?? 0) * populationRate);
    const urban = rn((p.urban ?? 0) * populationRate * urbanization);
    const total = rural + urban;
    const l = (n: number) => Number(n).toLocaleString();

    alertMessage.innerHTML = /* html */ ` Rural: <input type="number" min="0" step="1" id="ruralPop" value=${rural} style="width:6em" /> Urban:
      <input type="number" min="0" step="1" id="urbanPop" value=${urban} style="width:6em" ${p.burgs?.length ? "" : "disabled"} />
      <p>Total population: ${l(total)} ⇒ <span id="totalPop">${l(total)}</span> (<span id="totalPopPerc">100</span>%)</p>`;

    const ruralPopEl = () => document.getElementById("ruralPop") as HTMLInputElement;
    const urbanPopEl = () => document.getElementById("urbanPop") as HTMLInputElement;
    const totalPopEl = () => document.getElementById("totalPop")!;
    const totalPopPercEl = () => document.getElementById("totalPopPerc")!;

    const update = () => {
      const totalNew = ruralPopEl().valueAsNumber + urbanPopEl().valueAsNumber;
      if (Number.isNaN(totalNew)) return;
      totalPopEl().innerHTML = l(totalNew);
      totalPopPercEl().innerHTML = String(rn((totalNew / total) * 100));
    };

    openRichDialog({
      content: window.alertMessage.innerHTML,
      resizable: false,
      title: "Change province population",
      width: "24em",
      open: () => {
        ruralPopEl().oninput = () => update();
        urbanPopEl().oninput = () => update();
      },
      buttons: {
        Apply: function (this: Element) {
          applyPopulationChange();
          /* $(this).dialog("close") removed */
        },
        Cancel: function (this: Element) {
          /* $(this).dialog("close") removed */
        }
      },
      position: { my: "center", at: "center", of: "svg" }
    });

    function applyPopulationChange(): void {
      const ruralChange = ruralPopEl().valueAsNumber / rural;
      if (Number.isFinite(ruralChange) && ruralChange !== 1) {
        cells.forEach(i => {
          pack.cells.pop[i] *= ruralChange;
        });
      }
      if (!Number.isFinite(ruralChange) && ruralPopEl().valueAsNumber > 0) {
        const points = ruralPopEl().valueAsNumber / populationRate;
        const pop = rn(points / cells.length);
        cells.forEach(i => {
          pack.cells.pop[i] = pop;
        });
      }

      const urbanChange = urbanPopEl().valueAsNumber / urban;
      if (Number.isFinite(urbanChange) && urbanChange !== 1) {
        p.burgs?.forEach((b: number) => {
          (pack.burgs as Burg[])[b].population = rn(((pack.burgs as Burg[])[b].population ?? 0) * urbanChange, 4);
        });
      }
      if (!Number.isFinite(urbanChange) && urbanPopEl().valueAsNumber > 0) {
        const points = urbanPopEl().valueAsNumber / populationRate / urbanization;
        const population = rn(points / (p.burgs?.length ?? 1), 4);
        p.burgs?.forEach((b: number) => {
          (pack.burgs as Burg[])[b].population = population;
        });
      }

      if (layerIsOn("togglePopulation")) drawPopulation(worldContext, viewContext, appServices);
      refreshProvincesEditor();
    }
  }

  function toggleFog(p: number, cl: DOMTokenList): void {
    const path = provs.select(`#province${p}`).attr("d");
    const id = `focusProvince${p}`;
    cl.contains("inactive") ? fog(id, path) : unfog(id);
    cl.toggle("inactive");
  }

  function removeProvince(p: number): void {
    alertMessage.innerHTML = "Are you sure you want to remove the province? <br />This action cannot be reverted";
    openRichDialog({
      content: window.alertMessage.innerHTML,
      resizable: false,
      title: "Remove province",
      buttons: {
        Remove: function (this: Element) {
          pack.cells.province.forEach((province: number, i: number) => {
            if (province === p) pack.cells.province[i] = 0;
          });
          const s = (pack.provinces as Province[])[p].state;
          const state = (pack.states as State[])[s];
          if (state.provinces?.includes(p)) state.provinces.splice(state.provinces.indexOf(p), 1);

          unfog(`focusProvince${p}`);

          const coaId = `provinceCOA${p}`;
          const coaEl = document.getElementById(coaId);
          if (coaEl) coaEl.remove();
          emblems.select(`#provinceEmblems > use[data-i='${p}']`).remove();

          (pack.provinces as Province[])[p] = { i: p, removed: true } as Province;

          const g = provs.select("#provincesBody");
          g.select(`#province${p}`).remove();
          g.select(`#province-gap${p}`).remove();
          if (layerIsOn("toggleBorders")) drawBorders(worldContext, viewContext, appServices);
          refreshProvincesEditor();
          /* $(this).dialog("close") removed */
        },
        Cancel: function (this: Element) {
          /* $(this).dialog("close") removed */
        }
      }
    });
  }

  function editProvinceName(province: number): void {
    const p = (pack.provinces as Province[])[province];
    ensureEl("provinceNameEditor").dataset.province = String(province);
    (ensureEl("provinceNameEditorShort") as HTMLInputElement).value = p.name;
    applyOption(ensureEl("provinceNameEditorSelectForm") as HTMLSelectElement, p.formName);
    (ensureEl("provinceNameEditorFull") as HTMLInputElement).value = p.fullName;

    const cultureId = pack.cells.culture[p.center];
    ensureEl("provinceCultureDisplay").innerText = (pack.cultures as Culture[])[cultureId].name;

    openDialog("provinceNameEditor", {
      resizable: false,
      title: "Change province name",
      buttons: {
        Apply: function (this: Element) {
          applyNameChange(p);
          /* $(this).dialog("close") removed */
        },
        Cancel: function (this: Element) {
          /* $(this).dialog("close") removed */
        }
      },
      position: { my: "center", at: "center", of: "svg" }
    });

    if (modules.editProvinceName) return;
    modules.editProvinceName = true;

    ensureEl("provinceNameEditorShortCulture").addEventListener("click", regenerateShortNameCulture);
    ensureEl("provinceNameEditorShortRandom").addEventListener("click", regenerateShortNameRandom);
    ensureEl("provinceNameEditorAddForm").addEventListener("click", addCustomForm);
    ensureEl("provinceNameEditorFullRegenerate").addEventListener("click", regenerateFullName);

    function regenerateShortNameCulture(): void {
      const prov = +(ensureEl("provinceNameEditor") as HTMLElement).dataset.province!;
      const culture = pack.cells.culture[(pack.provinces as Province[])[prov].center];
      const name = Names.getState(Names.getCultureShort(worldContext, viewContext, appServices, culture), culture);
      (ensureEl("provinceNameEditorShort") as HTMLInputElement).value = name;
    }

    function regenerateShortNameRandom(): void {
      const base = rand(nameBases.length - 1);
      const name = Names.getState(Names.getBase(base), 0, base);
      (ensureEl("provinceNameEditorShort") as HTMLInputElement).value = name;
    }

    function addCustomForm(): void {
      const customForm = ensureEl("provinceNameEditorCustomForm") as HTMLInputElement;
      const selectForm = ensureEl("provinceNameEditorSelectForm") as HTMLSelectElement;
      const value = customForm.value;
      const displayed = customForm.style.display === "inline-block";
      customForm.style.display = displayed ? "none" : "inline-block";
      selectForm.style.display = displayed ? "inline-block" : "none";
      if (displayed) applyOption(selectForm, value);
    }

    function regenerateFullName(): void {
      const short = (ensureEl("provinceNameEditorShort") as HTMLInputElement).value;
      const form = (ensureEl("provinceNameEditorSelectForm") as HTMLSelectElement).value;
      (ensureEl("provinceNameEditorFull") as HTMLInputElement).value = getFullName();

      function getFullName(): string {
        if (!form) return short;
        if (!short && form) return `The ${form}`;
        return `${short} ${form}`;
      }
    }

    function applyNameChange(p: Province): void {
      p.name = (ensureEl("provinceNameEditorShort") as HTMLInputElement).value;
      p.formName = (ensureEl("provinceNameEditorSelectForm") as HTMLSelectElement).value;
      p.fullName = (ensureEl("provinceNameEditorFull") as HTMLInputElement).value;
      provs.select(`#provinceLabel${p.i}`).text(p.name);
      refreshProvincesEditor();
    }
  }

  function changeCapital(p: number, line: HTMLElement, value: string): void {
    line.dataset.capital = (pack.burgs as Burg[])[+value].name ?? "";
    (pack.provinces as Province[])[p].center = (pack.burgs as Burg[])[+value].cell;
    (pack.provinces as Province[])[p].burg = +value;
  }

  function togglePercentageMode(): void {
    if (body.dataset.type === "absolute") {
      body.dataset.type = "percentage";
      const totalBurgs = +ensureEl("provincesFooterBurgs").innerText;
      const totalArea = +(ensureEl("provincesFooterArea") as HTMLElement).dataset.area!;
      const totalPopulation = +(ensureEl("provincesFooterPopulation") as HTMLElement).dataset.population!;

      body.querySelectorAll<HTMLElement>(":scope > div").forEach(el => {
        const { burgs, area, population } = el.dataset;
        el.querySelector<HTMLElement>(".provinceBurgs")!.innerText = `${rn((+burgs! / totalBurgs) * 100)}%`;
        el.querySelector<HTMLElement>(".biomeArea")!.innerHTML = `${rn((+area! / totalArea) * 100)}%`;
        el.querySelector<HTMLElement>(".culturePopulation")!.innerHTML =
          `${rn((+population! / totalPopulation) * 100)}%`;
      });
    } else {
      body.dataset.type = "absolute";
      provincesEditorAddLines();
    }
  }

  type ChartNode = {
    id: number;
    state: number | null;
    color: unknown;
    i?: number;
    name?: string;
    fullName?: string;
    area?: number;
    urban?: number;
    rural?: number;
  };

  function showChart(): void {
    const getClr = (s: State) =>
      !s.i || s.removed || !s.color || s.color[0] !== "#" ? "#666" : color(s.color)?.darker();
    const states = (pack.states as State[]).map(
      s => ({ id: s.i, state: s.i ? 0 : null, color: getClr(s) }) as ChartNode
    );
    const provinces = (pack.provinces as Province[])
      .filter(p => p.i && !p.removed)
      .map(
        p =>
          ({
            id: p.i + states.length - 1,
            i: p.i,
            state: p.state,
            color: p.color,
            name: p.name,
            fullName: p.fullName,
            area: p.area,
            urban: p.urban,
            rural: p.rural
          }) as ChartNode
      );
    const data: ChartNode[] = [...states, ...provinces];
    const root = d3
      .stratify<ChartNode>()
      .id(d => String(d.id))
      .parentId(d => (d.state !== null && d.state !== undefined ? String(d.state) : null))(data)
      .sum(d => d.area ?? 0);

    const width = 300 + 300 * +(uiSize as HTMLInputElement).value;
    const height = 90 + 90 * +(uiSize as HTMLInputElement).value;
    const margin = { top: 10, right: 10, bottom: 0, left: 10 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;
    const treeLayout = d3.treemap<ChartNode>().size([w, h]).padding(2);

    alertMessage.innerHTML = /* html */ `<select id="provincesTreeType" style="display:block; margin-left:13px; font-size:11px">
      <option value="area" selected>Area</option>
      <option value="population">Total population</option>
      <option value="rural">Rural population</option>
      <option value="urban">Urban population</option>
    </select>`;
    alertMessage.innerHTML += `<div id='provinceInfo' class='chartInfo'>&#8205;</div>`;
    const chartSvg = d3
      .select("#alertMessage")
      .insert("svg", "#provinceInfo")
      .attr("id", "provincesTree")
      .attr("width", width)
      .attr("height", height)
      .attr("font-size", "10px");
    const graph = chartSvg.append("g").attr("transform", "translate(10, 0)");
    document.getElementById("provincesTreeType")!.addEventListener("change", updateChart);

    treeLayout(root);

    type HRNode = d3.HierarchyRectangularNode<ChartNode>;
    const leaves = root.leaves() as unknown as HRNode[];
    const node = graph
      .selectAll<SVGGElement, HRNode>("g")
      .data(leaves)
      .enter()
      .append("g")
      .attr("data-id", (d: HRNode) => d.data.i ?? null)
      .on("mouseenter", (event: MouseEvent, d: HRNode) => showInfo(event, d))
      .on("mouseleave", (event: MouseEvent) => hideInfo(event));

    function showInfo(ev: MouseEvent, d: HRNode): void {
      d3.select(ev.target as Element)
        .select("rect")
        .classed("selected", true);
      const name = d.data.fullName;
      const state = (pack.states as State[])[d.data.state!].fullName;
      const area = `${getArea(d.data.area ?? 0)} ${getAreaUnit()}`;
      const rural = rn((d.data.rural ?? 0) * populationRate);
      const urban = rn((d.data.urban ?? 0) * populationRate * urbanization);
      const treeTypeEl = document.getElementById("provincesTreeType") as HTMLSelectElement;
      const value =
        treeTypeEl?.value === "area"
          ? `Area: ${area}`
          : treeTypeEl?.value === "rural"
            ? `Rural population: ${si(rural)}`
            : treeTypeEl?.value === "urban"
              ? `Urban population: ${si(urban)}`
              : `Population: ${si(rural + urban)}`;

      const provinceInfoEl = document.getElementById("provinceInfo");
      if (provinceInfoEl) provinceInfoEl.innerHTML = `${name}. ${state}. ${value}`;
      provinceHighlightOn(ev);
    }

    function hideInfo(ev: MouseEvent): void {
      provinceHighlightOff(ev);
      const provinceInfoEl = document.getElementById("provinceInfo");
      if (!provinceInfoEl) return;
      provinceInfoEl.innerHTML = "&#8205;";
      d3.select(ev.target as Element)
        .select("rect")
        .classed("selected", false);
    }

    node
      .append("rect")
      .attr("stroke", (d: HRNode) => String(d.parent?.data.color ?? ""))
      .attr("stroke-width", 1)
      .attr("fill", (d: HRNode) => String(d.data.color ?? ""))
      .attr("x", (d: HRNode) => d.x0)
      .attr("y", (d: HRNode) => d.y0)
      .attr("width", (d: HRNode) => d.x1 - d.x0)
      .attr("height", (d: HRNode) => d.y1 - d.y0);

    node
      .append("text")
      .attr("text-rendering", "optimizeSpeed")
      .attr("dx", ".2em")
      .attr("dy", "1em")
      .attr("x", (d: HRNode) => d.x0)
      .attr("y", (d: HRNode) => d.y0);

    function hideNonfittingLabels(): void {
      node.select<SVGTextElement>("text").each(function (d: HRNode) {
        this.innerHTML = d.data.name ?? "";
        let b = this.getBBox();
        if (b.y + b.height > d.y1 + 1) this.innerHTML = "";

        for (let i = 0; i < 15 && b.width > 0 && b.x + b.width > d.x1; i++) {
          if (this.innerHTML.length < 3) {
            this.innerHTML = "";
            break;
          }
          this.innerHTML = `${this.innerHTML.slice(0, -2)}…`;
          b = this.getBBox();
        }
      });
    }

    function updateChart(this: HTMLSelectElement): void {
      const accessor: (d: ChartNode) => number =
        this.value === "area"
          ? d => d.area ?? 0
          : this.value === "rural"
            ? d => d.rural ?? 0
            : this.value === "urban"
              ? d => d.urban ?? 0
              : d => (d.rural ?? 0) + (d.urban ?? 0);

      root.sum(accessor);
      node.data(treeLayout(root).leaves() as unknown as HRNode[]);

      node
        .select("rect")
        .transition()
        .duration(1500)
        .attr("x", (d: HRNode) => d.x0)
        .attr("y", (d: HRNode) => d.y0)
        .attr("width", (d: HRNode) => d.x1 - d.x0)
        .attr("height", (d: HRNode) => d.y1 - d.y0);

      node
        .select("text")
        .transition()
        .duration(1500)
        .attr("x", (d: HRNode) => d.x0)
        .attr("y", (d: HRNode) => d.y0);

      setTimeout(hideNonfittingLabels, 2000);
    }

    openRichDialog({
      content: window.alertMessage.innerHTML,
      title: "Provinces chart",
      width: fitContent(),
      position: { my: "left bottom", at: "left+10 bottom-10", of: "svg" },
      buttons: {},
      close: () => {
        alertMessage.innerHTML = "";
      }
    });

    hideNonfittingLabels();
  }

  function toggleLabels(): void {
    const hidden = provs.select("#provinceLabels").style("display") === "none";
    provs.select("#provinceLabels").style("display", `${hidden ? "block" : "none"}`);
    provs.attr("data-labels", +hidden);
    provs
      .selectAll<SVGTextElement, unknown>("text")
      .call(d3.drag<SVGTextElement, unknown>().on("start", dragLabelStart).on("drag", dragLabel))
      .classed("draggable", true);
  }

  function triggerProvincesRelease(): void {
    confirmationDialog({
      title: "Release provinces",
      message: `Are you sure you want to release all provinces?
          </br>It will turn all separable provinces into independent states.
          </br>Capital province and provinces without any burgs will state as they are`,
      confirm: "Release",
      onConfirm: () => {
        const oldStateIds: number[] = [];
        const newStateIds: number[] = [];

        body.querySelectorAll<HTMLElement>(":scope > div").forEach(el => {
          const provinceId = +el.dataset.id!;
          const province = (pack.provinces as Province[])[provinceId];
          if (!province.burg) return;
          if (province.burg === (pack.states as State[])[province.state].capital) return;
          if ((province.burgs ?? []).some((burgId: number) => (pack.burgs as Burg[])[burgId].capital)) return;

          const [oldStateId, newStateId] = declareProvinceIndependence(provinceId);
          oldStateIds.push(oldStateId);
          newStateIds.push(newStateId);
        });

        updateStatesPostRelease(unique(oldStateIds), newStateIds);
      }
    });
  }

  function enterProvincesManualAssignment(this: HTMLButtonElement): void {
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

    document.querySelectorAll<HTMLElement>("#provincesBottom > *").forEach(el => {
      el.style.display = "none";
    });
    ensureEl("provincesManuallyButtons").style.display = "inline-block";

    ensureEl("provincesEditor")
      .querySelectorAll<HTMLElement>(".hide")
      .forEach(el => {
        el.classList.add("hidden");
      });
    ensureEl("provincesHeader").querySelector<HTMLElement>("div[data-sortby='state']")!.style.left = "7.7em";
    ensureEl("provincesFooter").style.display = "none";
    body.querySelectorAll<HTMLElement>("div > input, select, span, svg").forEach(e => {
      e.style.pointerEvents = "none";
    });
    openDialog("provincesEditor", {
      position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
    });

    tip("Click on a province to select, drag the circle to change province", true);
    viewbox
      .style("cursor", "crosshair")
      .on("click", selectProvinceOnMapClick)
      .call(d3.drag<SVGGElement, unknown>().on("drag", dragBrush))
      .on("touchmove", moveBrush)
      .on("mousemove", moveBrush);

    const firstDiv = body.querySelector<HTMLElement>("div");
    if (firstDiv) {
      firstDiv.classList.add("selected");
      selectProvince(+firstDiv.dataset.id!);
    }
  }

  function selectProvinceOnLineClick(this: HTMLElement): void {
    if ((this.parentNode as HTMLElement)?.id !== "provincesBodySection") return;
    if (customization === 11) {
      body.querySelector<HTMLElement>("div.selected")?.classList.remove("selected");
      this.classList.add("selected");
      selectProvince(+this.dataset.id!);
    }
  }

  function selectProvinceOnMapClick(this: SVGElement, event: MouseEvent): void {
    const [px, py] = pointer(event, this);
    const i = findCell(px, py);
    if (pack.cells.h[i] < 20 || !pack.cells.state[i]) return;

    const assigned = provs.select("g#temp").select(`polygon[data-cell='${i}']`);
    const province = assigned.size() ? +assigned.attr("data-province") : pack.cells.province[i];

    const editorLine = body.querySelector<HTMLElement>(`div[data-id='${province}']`);
    if (!editorLine) {
      tip("You cannot select a province if it is not in the Editor list", false, "error");
      return;
    }

    body.querySelector<HTMLElement>("div.selected")?.classList.remove("selected");
    editorLine.classList.add("selected");
    selectProvince(province);
  }

  function selectProvince(p: number): void {
    debug.selectAll("path.selected").remove();
    const path = provs.select(`#province${p}`).attr("d");
    debug.append("path").attr("class", "selected").attr("d", path);
  }

  function dragBrush(this: SVGElement, event: d3.D3DragEvent<SVGElement, unknown, unknown>): void {
    if (!event.dx && !event.dy) return;
    const r = +(ensureEl("provincesBrush") as HTMLInputElement).value;
    moveCircle(event.x, event.y, r);

    const found = r > 5 ? findAll(event.x, event.y, r) : [findCell(event.x, event.y)];
    const selection = found.filter(isLand);
    if (selection) changeForSelection(selection);
  }

  function changeForSelection(selection: number[]): void {
    const temp = provs.select("#temp");
    const centers = provs.select("#centers");
    const selected = body.querySelector<HTMLElement>("div.selected");
    if (!selected) return;

    const provinceNew = +selected.dataset.id!;
    const state = (pack.provinces as Province[])[provinceNew].state;
    const fill = (pack.provinces as Province[])[provinceNew].color || "#ffffff";

    selection.forEach(i => {
      if (!pack.cells.state[i] || pack.cells.state[i] !== state) return;
      const exists = temp.select(`polygon[data-cell='${i}']`);
      const provinceOld = exists.size() ? +exists.attr("data-province") : pack.cells.province[i];
      if (provinceNew === provinceOld) return;
      if (i === (pack.provinces as Province[])[provinceOld]?.center) {
        const center = centers.select(`polygon[data-center='${i}']`);
        if (!center.size())
          centers
            .append("polygon")
            .attr("data-center", i)
            .attr("points", getPackPolygon(i, worldContext.pack).join(" "));
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
          .attr("points", getPackPolygon(i, worldContext.pack).join(" "))
          .attr("data-cell", i)
          .attr("data-province", provinceNew)
          .attr("fill", fill)
          .attr("stroke", "#555");
      }
    });
  }

  function moveBrush(this: SVGElement, event: MouseEvent): void {
    showMainTip();
    const [px, py] = pointer(event, this);
    const radius = +(ensureEl("provincesBrush") as HTMLInputElement).value;
    moveCircle(px, py, radius);
  }

  function applyProvincesManualAssignment(): void {
    provs
      .select("#temp")
      .selectAll("polygon")
      .each(function () {
        const el = this as unknown as SVGPolygonElement;
        const i = +el.dataset.cell!;
        pack.cells.province[i] = +el.dataset.province!;
      });

    Provinces.getPoles(getWorldState());
    if (layerIsOn("toggleBorders")) drawBorders(worldContext, viewContext, appServices);
    if (layerIsOn("toggleProvinces")) drawProvinces(worldContext, viewContext, appServices);

    exitProvincesManualAssignment();
    refreshProvincesEditor();
  }

  function exitProvincesManualAssignment(close?: string): void {
    customization = 0;
    provs.select("#temp").remove();
    provs.select("#centers").remove();
    removeCircle();

    provinceBorders.select("path").attr("stroke", null).attr("stroke-width", null);
    stateBorders.select("path").attr("stroke", null).attr("stroke-width", null);
    debug.selectAll("path.selected").remove();

    document.querySelectorAll<HTMLElement>("#provincesBottom > *").forEach(el => {
      el.style.display = "inline-block";
    });
    ensureEl("provincesManuallyButtons").style.display = "none";

    ensureEl("provincesEditor")
      .querySelectorAll<HTMLElement>(".hide:not(.show)")
      .forEach(el => {
        el.classList.remove("hidden");
      });
    ensureEl("provincesHeader").querySelector<HTMLElement>("div[data-sortby='state']")!.style.left = "22em";
    ensureEl("provincesFooter").style.display = "block";
    body.querySelectorAll<HTMLElement>("div > input, select, span, svg").forEach(e => {
      e.style.pointerEvents = "all";
    });
    if (!close)
      openDialog("provincesEditor", {
        position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
      });

    restoreDefaultEvents?.();
    clearMainTip();
    body.querySelector<HTMLElement>("div.selected")?.classList.remove("selected");
  }

  function enterAddProvinceMode(this: HTMLButtonElement): void {
    if (this.classList.contains("pressed")) {
      exitAddProvinceMode.call(this);
      return;
    }

    customization = 12;
    this.classList.add("pressed");
    tip("Click on the map to place a new province center", true);
    viewbox.style("cursor", "crosshair").on("click", addProvince);
    body.querySelectorAll<HTMLElement>("div > input, select, span, svg").forEach(e => {
      e.style.pointerEvents = "none";
    });
  }

  function addProvince(this: SVGElement, event: MouseEvent): void {
    const { cells, provinces } = pack;
    const [px, py] = pointer(event, this);
    const center = findCell(px, py);
    if (cells.h[center] < 20) {
      tip("You cannot place province into the water. Please click on a land cell", false, "error");
      return;
    }

    const oldProvince = cells.province[center];
    const provincesArr = provinces as Province[];
    if (oldProvince && provincesArr[oldProvince].center === center) {
      tip("The cell is already a center of a different province. Select other cell", false, "error");
      return;
    }

    const state = cells.state[center];
    if (!state) {
      tip("You cannot create a province in neutral lands. Please assign this land to a state first", false, "error");
      return;
    }

    if (!(event as KeyboardEvent & MouseEvent).shiftKey)
      exitAddProvinceMode.call(ensureEl("provincesAdd") as HTMLButtonElement);

    const province = provincesArr.length;
    (pack.states as State[])[state].provinces!.push(province);
    const burg = cells.burg[center];
    const c = cells.culture[center];
    const name = burg
      ? ((pack.burgs as Burg[])[burg].name ?? "")
      : Names.getState(Names.getCultureShort(worldContext, viewContext, appServices, c), c);
    const formName = oldProvince ? provincesArr[oldProvince].formName : "Province";
    const fullName = `${name} ${formName}`;
    const stateColor = (pack.states as State[])[state].color ?? "";
    const rndColor = getRandomColor();
    const newColor = stateColor[0] === "#" ? color(interpolate(stateColor, rndColor)(0.2))!.formatHex() : rndColor;

    const kinship = burg ? 0.8 : 0.4;
    const parentBurg = burg ? (pack.burgs as Burg[])[burg] : null;
    const type = Burgs.getType(center, parentBurg?.port);
    const parentCOA = parentBurg ? parentBurg.coa : (pack.states as State[])[state].coa;
    const coa = COA.generate(parentCOA ?? null, kinship, P(0.1) as unknown as number, type);
    coa.shield = COA.getShield(c, state) ?? "";
    COArenderer.add("province", province, coa as RendererEmblem, px, py);

    provincesArr.push({ i: province, state, center, burg, name, formName, fullName, color: newColor, coa } as Province);

    cells.province[center] = province;
    cells.c[center].forEach((cc: number) => {
      if (cells.h[cc] < 20 || cells.state[cc] !== state) return;
      if (provincesArr.find(p => !p.removed && p.center === cc)) return;
      cells.province[cc] = province;
    });

    if (layerIsOn("toggleBorders")) drawBorders(worldContext, viewContext, appServices);
    if (layerIsOn("toggleProvinces")) drawProvinces(worldContext, viewContext, appServices);

    collectStatistics();
    (ensureEl("provincesFilterState") as HTMLSelectElement).value = String(state);
    provincesEditorAddLines();
  }

  function exitAddProvinceMode(this: HTMLButtonElement): void {
    customization = 0;
    restoreDefaultEvents?.();
    clearMainTip();
    body.querySelectorAll<HTMLElement>("div > input, select, span, svg").forEach(e => {
      e.style.pointerEvents = "all";
    });
    const provincesAddEl = document.getElementById("provincesAdd");
    if (provincesAddEl?.classList.contains("pressed")) provincesAddEl.classList.remove("pressed");
  }

  function recolorProvinces(): void {
    const state = +(ensureEl("provincesFilterState") as HTMLSelectElement).value;

    (pack.provinces as Province[]).forEach(p => {
      if (!p || p.removed) return;
      if (state !== -1 && p.state !== state) return;
      const stateColor = (pack.states as State[])[p.state].color ?? "";
      const rndColor = getRandomColor();
      p.color = stateColor[0] === "#" ? color(interpolate(stateColor, rndColor)(0.2))!.formatHex() : rndColor;
    });

    if (!layerIsOn("toggleProvinces")) toggleProvinces();
    else drawProvinces(worldContext, viewContext, appServices);
  }

  function downloadProvincesData(): void {
    const unit = areaUnit.value === "square" ? `${distanceUnitInput.value}2` : areaUnit.value;
    let data = `Id,Province,Full Name,Form,State,Color,Capital,Area ${unit},Total Population,Rural Population,Urban Population,Burgs\n`;

    body.querySelectorAll<HTMLElement>(":scope > div").forEach(el => {
      const key = parseInt(el.dataset.id!, 10);
      const provincePack = (pack.provinces as Province[])[key];
      data += `${el.dataset.id},`;
      data += `${el.dataset.name},`;
      data += `${provincePack.fullName},`;
      data += `${el.dataset.form},`;
      data += `${el.dataset.state},`;
      data += `${el.dataset.color},`;
      data += `${el.dataset.capital},`;
      data += `${el.dataset.area},`;
      data += `${el.dataset.population},`;
      data += `${Math.round((provincePack.rural ?? 0) * populationRate)},`;
      data += `${Math.round((provincePack.urban ?? 0) * populationRate * urbanization)},`;
      data += `${el.dataset.burgs}\n`;
    });

    downloadFile(data, `${getFileName("Provinces")}.csv`);
  }

  function removeAllProvinces(): void {
    alertMessage.innerHTML = "Are you sure you want to remove all provinces? <br />This action cannot be reverted";
    openRichDialog({
      content: window.alertMessage.innerHTML,
      resizable: false,
      title: "Remove all provinces",
      buttons: {
        Remove: function (this: Element) {
          /* $(this).dialog("close") removed */

          document.querySelectorAll("[id^='provinceCOA']").forEach(el => {
            el.remove();
          });
          emblems.select("#provinceEmblems").selectAll("*").remove();

          pack.provinces = [0 as unknown as Province];
          pack.cells.province = new Uint16Array(pack.cells.i.length);
          (pack.states as State[]).forEach(s => {
            s.provinces = [];
          });

          unfog();
          if (layerIsOn("toggleBorders")) drawBorders(worldContext, viewContext, appServices);
          provs.select("#provincesBody").remove();
          turnButtonOff("toggleProvinces");

          provincesEditorAddLines();
        },
        Cancel: function (this: Element) {
          /* $(this).dialog("close") removed */
        }
      }
    });
  }

  let _dlX = 0,
    _dlY = 0;

  function dragLabelStart(this: SVGTextElement, event: d3.D3DragEvent<SVGTextElement, unknown, unknown>): void {
    const tr = parseTransform(this.getAttribute("transform") ?? "");
    _dlX = +tr[0] - event.x;
    _dlY = +tr[1] - event.y;
  }

  function dragLabel(this: SVGTextElement, event: d3.D3DragEvent<SVGTextElement, unknown, unknown>): void {
    this.setAttribute("transform", `translate(${_dlX + event.x},${_dlY + event.y})`);
  }

  function closeProvincesEditor(): void {
    provs
      .selectAll<SVGTextElement, unknown>("text")
      .call(d3.drag<SVGTextElement, unknown>().on("drag", null))
      .attr("class", null);
    if (customization === 11) exitProvincesManualAssignment("close");
    if (customization === 12) exitAddProvinceMode.call(document.getElementById("provincesAdd") as HTMLButtonElement);
  }

  function openProvinceMergeDialog(): void {
    const selectedState = +(ensureEl("provincesFilterState") as HTMLSelectElement).value;
    if (selectedState === -1) {
      alertMessage.innerHTML = "Please select a specific state from the filter to merge provinces within that state.";
      openRichDialog({
        content: window.alertMessage.innerHTML,
        title: "Merge Provinces",
        buttons: {
          OK: function (this: Element) {
            /* $(this).dialog("close") removed */
          }
        }
      });
      return;
    }
    const provincesToMerge = (pack.provinces as Province[]).filter(p => p.i && !p.removed && p.state === selectedState);
    if (provincesToMerge.length < 2) {
      alertMessage.innerHTML = "Not enough provinces in the selected state to merge.";
      openRichDialog({
        content: window.alertMessage.innerHTML,
        title: "Merge Provinces",
        buttons: {
          OK: function (this: Element) {
            /* $(this).dialog("close") removed */
          }
        }
      });
      return;
    }

    const emblem = (i: number) =>
      `<svg class="coaIcon" viewBox="0 0 200 200"><use href="#provinceCOA${i}"></use></svg>`;
    const provincesSelector = provincesToMerge
      .map(
        (p: Province) => `
      <div data-id="${p.i}" data-tip="${p.fullName || p.name}" style="cursor:default">
        <input type="radio" name="rulingProvince" value="${p.i}" />
        <input id="selectProvince${p.i}" class="checkbox" type="checkbox" name="provincesToMerge" value="${p.i}" />
        <label for="selectProvince${p.i}" class="checkbox-label"><fill-box fill="${p.color}" disabled></fill-box>${emblem(p.i)}${p.name}</label>
      </div>`
      )
      .join("");

    alertMessage.innerHTML = `
      <form id='mergeProvincesForm' style="overflow: hidden; display: flex; flex-direction: column; gap: 1em;">
        <p style="margin:0">
          Check the <b>checkbox</b> next to each province you want to merge.
          Use the <b>radio button</b> to pick the <em>primary province</em> that will absorb all others.
          Hover over a row to highlight the province on the map.
        </p>
        <main style='display: grid; grid-template-columns: 1fr 1fr; gap: .3em;'>
          ${provincesSelector}
        </main>
      </form>`;

    document
      .getElementById("mergeProvincesForm")!
      .querySelectorAll("div[data-id]")
      .forEach(el => {
        el.addEventListener("mouseenter", highlightProvinceOnMergeHover);
        el.addEventListener("mouseleave", provinceHighlightOff as EventListener);
      });

    function highlightProvinceOnMergeHover(event: Event): void {
      if (!layerIsOn("toggleProvinces")) return;
      const province = +(event.currentTarget as HTMLElement).dataset.id!;
      if (!province) return;
      const d = provs.select(`#province${province}`).attr("d");
      if (!d) return;

      provinceHighlightOff(null);

      const path = debug
        .append("path")
        .attr("class", "highlight")
        .attr("d", d)
        .attr("fill", "none")
        .attr("stroke", "red")
        .attr("stroke-width", 1)
        .attr("opacity", 1)
        .attr("filter", "url(#blur1)");

      const totalLength = (path.node() as SVGPathElement).getTotalLength();
      const duration = (totalLength + 5000) / 2;
      const interp = interpolateString(`0, ${totalLength}`, `${totalLength}, ${totalLength}`);
      path
        .transition()
        .duration(duration)
        .attrTween("stroke-dasharray", () => interp);
    }

    openRichDialog({
      content: window.alertMessage.innerHTML,
      width: 600,
      title: "Merge provinces",
      close: () => provinceHighlightOff(null),
      buttons: {
        Merge: function (this: Element) {
          const formData = new FormData(document.getElementById("mergeProvincesForm") as HTMLFormElement);
          const primaryProvinceId = Number(formData.get("rulingProvince"));
          if (!primaryProvinceId) return tip("Please select a province to merge into", false, "error");

          const provincesToMergeIds = formData
            .getAll("provincesToMerge")
            .map(Number)
            .filter(provinceId => provinceId !== primaryProvinceId);
          if (!provincesToMergeIds.length) return tip("Please select several provinces to merge", false, "error");

          confirmationDialog({
            title: "Merge provinces",
            message: `
              <p>The following provinces will be <strong>removed</strong>: ${provincesToMergeIds
                .map(provinceId => `${emblem(provinceId)}${(pack.provinces as Province[])[provinceId].name}`)
                .join(", ")}.</p>
              <p>Removed provinces data (burgs and cells) will be assigned to ${emblem(primaryProvinceId)}${(pack.provinces as Province[])[primaryProvinceId].name}.</p>
              <p>Are you sure you want to merge provinces? This action cannot be reverted.</p>`,
            confirm: "Merge",
            onConfirm: () => {
              mergeProvinces(provincesToMergeIds, primaryProvinceId);
              /* $(this).dialog("close") removed */
            }
          });
        },
        Cancel: function (this: Element) {
          /* $(this).dialog("close") removed */
        }
      }
    });
  }

  function cleanupMergedProvince(provinceId: number): void {
    unfog(`focusProvince${provinceId}`);
    const coaEl = document.getElementById(`provinceCOA${provinceId}`);
    if (coaEl) coaEl.remove();
    emblems.select(`#provinceEmblems > use[data-i='${provinceId}']`).remove();
  }

  function mergeProvinces(ids: number[], primary: number): void {
    const primaryProvince = (pack.provinces as Province[])[primary];
    const provinceIdMap = new Map<number, number>();

    ids.forEach(id => {
      if (id === primary) return;
      const province = (pack.provinces as Province[])[id];

      (province.burgs ?? []).forEach((b: number) => {
        (pack.burgs as Burg[])[b].province = primary;
        if (!primaryProvince.burgs?.includes(b)) primaryProvince.burgs?.push(b);
      });
      if (!primaryProvince.burg && province.burg) {
        primaryProvince.burg = province.burg;
      }

      provinceIdMap.set(id, primary);
      cleanupMergedProvince(id);
      (pack.provinces as Province[])[id] = { i: id, removed: true } as Province;
    });

    pack.cells.province.forEach((oldProvinceId: number, cellIndex: number) => {
      const newProvinceId = provinceIdMap.get(oldProvinceId);
      if (newProvinceId !== undefined) pack.cells.province[cellIndex] = newProvinceId;
    });

    const state = (pack.states as State[])[primaryProvince.state];
    state.provinces = (state.provinces ?? []).filter((p: number) => !(pack.provinces as Province[])[p].removed);

    collectStatistics();
    Provinces.getPoles(getWorldState());

    if (layerIsOn("toggleProvinces")) drawProvinces(worldContext, viewContext, appServices);
    if (layerIsOn("toggleBorders")) drawBorders(worldContext, viewContext, appServices);

    unfog();
    debug.selectAll(".highlight").remove();

    refreshProvincesEditor();
  }
}

function updateLockStatus(provinceId: number, classList: DOMTokenList): void {
  const p = (pack.provinces as Province[])[provinceId];
  p.lock = !p.lock;
  classList.toggle("icon-lock-open");
  classList.toggle("icon-lock");
}

// ─── Global registration ───────────────────────────────────────────────────────
export function initProvincesEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
