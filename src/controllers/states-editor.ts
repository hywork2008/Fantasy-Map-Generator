import * as d3 from "d3";
import { applySortingByHeader, ensureEl, rn, si } from "../utils";

const $body = insertEditorHtml();
addListeners();
const statesManualHistory = new BrushHistory();

export function open(): void {
  closeDialogs("#statesEditor, .stable");
  if (!layerIsOn("toggleStates")) toggleStates();
  if (!layerIsOn("toggleBorders")) toggleBorders();
  if (layerIsOn("toggleCultures")) toggleCultures();
  if (layerIsOn("toggleBiomes")) toggleBiomes();
  if (layerIsOn("toggleReligions")) toggleReligions();

  refreshStatesEditor();

  ($("#statesEditor") as any).dialog({
    title: "States Editor",
    resizable: false,
    close: closeStatesEditor,
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });
}

function insertEditorHtml(): HTMLElement {
  const editorHtml = /* html */ `<div id="statesEditor" class="dialog stable">
    <div id="statesHeader" class="header" style="grid-template-columns: 11em 8em 7em 7em 6em 6em 8em 6em 7em 6em">
      <div data-tip="Click to sort by state name" class="sortable alphabetically" data-sortby="name">State&nbsp;</div>
      <div data-tip="Click to sort by state form name" class="sortable alphabetically" data-sortby="form">Form&nbsp;</div>
      <div data-tip="Click to sort by capital name" class="sortable alphabetically" data-sortby="capital">Capital&nbsp;</div>
      <div data-tip="Click to sort by state dominant culture" class="sortable alphabetically hide" data-sortby="culture">Culture&nbsp;</div>
      <div data-tip="Click to sort by state burgs count" class="sortable hide" data-sortby="burgs">Burgs&nbsp;</div>
      <div data-tip="Click to sort by state area" class="sortable hide icon-sort-number-down" data-sortby="area">Area&nbsp;</div>
      <div data-tip="Click to sort by state population" class="sortable hide" data-sortby="population">Population&nbsp;</div>
      <div data-tip="Click to sort by state type" class="sortable alphabetically hidden show hide" data-sortby="type">Type&nbsp;</div>
      <div data-tip="Click to sort by state expansion value" class="sortable hidden show hide" data-sortby="expansionism">Expansion&nbsp;</div>
      <div data-tip="Click to sort by state cells count" class="sortable hidden show hide" data-sortby="cells">Cells&nbsp;</div>
    </div>

    <div id="statesBodySection" class="table" data-type="absolute"></div>

    <div id="statesFooter" class="totalLine">
      <div data-tip="States number" style="margin-left: 5px">States:&nbsp;<span id="statesFooterStates">0</span></div>
      <div data-tip="Total land cells number" style="margin-left: 12px">Cells:&nbsp;<span id="statesFooterCells">0</span></div>
      <div data-tip="Total burgs number" style="margin-left: 12px">Burgs:&nbsp;<span id="statesFooterBurgs">0</span></div>
      <div data-tip="Total land area" style="margin-left: 12px">Land Area:&nbsp;<span id="statesFooterArea">0</span></div>
      <div data-tip="Total population" style="margin-left: 12px">Population:&nbsp;<span id="statesFooterPopulation">0</span></div>
    </div>

    <div id="statesBottom">
      <button id="statesEditorRefresh" data-tip="Refresh the Editor" class="icon-cw"></button>
      <button id="statesEditStyle" data-tip="Edit states style in Style Editor" class="icon-adjust"></button>
      <button id="statesLegend" data-tip="Toggle Legend box" class="icon-list-bullet"></button>
      <button id="statesPercentage" data-tip="Toggle percentage / absolute values views" class="icon-percent"></button>
      <button id="statesChart" data-tip="Show states bubble chart" class="icon-chart-area"></button>

      <button id="statesRegenerate" data-tip="Show the regeneration menu and more data" class="icon-cog-alt"></button>
      <div id="statesRegenerateButtons" style="display: none">
        <button id="statesRegenerateBack" data-tip="Hide the regeneration menu" class="icon-cog-alt"></button>
        <button id="statesRandomize" data-tip="Randomize states Expansion value and re-calculate states and provinces" class="icon-shuffle"></button>
        <div data-tip="Additional growth rate. Defines how many land cells remain neutral" style="display: inline-block">
          <slider-input id="statesGrowthRate" min=".1" max="3" step=".05" value="1">Growth rate:</slider-input>
        </div>
        <button id="statesRecalculate" data-tip="Recalculate states based on current values of growth-related attributes" class="icon-retweet"></button>
        <div data-tip="Allow states neutral distance, expansion and type changes to take an immediate effect" style="display: inline-block">
          <input id="statesAutoChange" class="checkbox" type="checkbox" />
          <label for="statesAutoChange" class="checkbox-label"><i>auto-apply changes</i></label>
        </div>
        <div data-tip="Allow system to change state labels when states data is change" style="display: inline-block">
          <input id="adjustLabels" class="checkbox" type="checkbox" />
          <label for="adjustLabels" class="checkbox-label"><i>auto-change labels</i></label>
        </div>
      </div>

      <button id="statesManually" data-tip="Manually re-assign states" class="icon-brush"></button>
      <div id="statesManuallyButtons" style="display: none">
        <div data-tip="Change brush size. Shortcuts: + / ] to increase; - / [ to decrease" style="margin-block: 0.3em;">
          <slider-input id="statesBrush" min="1" max="100" value="15">Brush size:</slider-input>
        </div>
        <button id="statesManuallyUndo" data-tip="Undo last brush stroke" class="icon-ccw"></button>
        <button id="statesManuallyApply" data-tip="Apply assignment" class="icon-check"></button>
        <button id="statesManuallyCancel" data-tip="Cancel assignment" class="icon-cancel"></button>
        <div data-tip="When enabled, only neutral cells can be painted" style="display: inline-block">
          <input id="statesManuallyProtect" class="checkbox" type="checkbox" />
          <label for="statesManuallyProtect" class="checkbox-label"><i>do not overwrite existing</i></label>
        </div>
      </div>

      <button id="statesAdd" data-tip="Add a new state. Hold Shift to add multiple" class="icon-plus"></button>
      <button id="statesMerge" data-tip="Merge several states into one" class="icon-layer-group"></button>
      <button id="statesExport" data-tip="Save state-related data as a text file (.csv)" class="icon-download"></button>
    </div>
  </div>`;

  ensureEl("dialogs").insertAdjacentHTML("beforeend", editorHtml);
  return ensureEl("statesBodySection");
}

function addListeners(): void {
  applySortingByHeader("statesHeader");

  ensureEl("statesEditorRefresh").on("click", refreshStatesEditor);
  ensureEl("statesEditStyle").on("click", () => editStyle("regions"));
  ensureEl("statesLegend").on("click", toggleLegend);
  ensureEl("statesPercentage").on("click", togglePercentageMode);
  ensureEl("statesChart").on("click", showStatesChart);
  ensureEl("statesRegenerate").on("click", openRegenerationMenu);
  ensureEl("statesRegenerateBack").on("click", exitRegenerationMenu);
  ensureEl("statesRecalculate").on("click", () => recalculateStates(true));
  ensureEl("statesRandomize").on("click", randomizeStatesExpansion);
  ensureEl("statesGrowthRate").on("input", () => recalculateStates(false));
  ensureEl("statesManually").on("click", enterStatesManualAssignent);
  ensureEl("statesManuallyUndo").on("click", undoStatesManualAssignment);
  ensureEl("statesManuallyApply").on("click", applyStatesManualAssignent);
  ensureEl("statesManuallyCancel").on("click", () => exitStatesManualAssignment(false));
  ensureEl("statesAdd").on("click", enterAddStateMode);
  ensureEl("statesMerge").on("click", openStateMergeDialog);
  ensureEl("statesExport").on("click", downloadStatesCsv);

  ($body as any).on("click", (event: Event) => {
    const $element = event.target as HTMLElement;
    const classList = $element.classList;
    const stateId = +(($element.parentNode as HTMLElement)?.dataset?.id ?? "0");
    if ($element.tagName === "FILL-BOX") stateChangeFill($element);
    else if (classList.contains("name")) editStateName(stateId);
    else if (classList.contains("coaIcon")) editEmblem?.("state", `stateCOA${stateId}`, pack.states[stateId]);
    else if (classList.contains("icon-star-empty")) stateCapitalZoomIn(stateId);
    else if (classList.contains("icon-dot-circled")) overviewBurgs({ stateId });
    else if (classList.contains("statePopulation")) changePopulation(stateId);
    else if (classList.contains("icon-pin")) toggleFog(stateId, classList);
    else if (classList.contains("icon-target"))
      highlightElement(regions.select(`#state${stateId}`).node() as Element, 4);
    else if (classList.contains("icon-trash-empty")) stateRemovePrompt(stateId);
    else if (classList.contains("icon-lock") || classList.contains("icon-lock-open"))
      updateLockStatus(stateId, classList);
  });

  ($body as any).on("input", (ev: Event) => {
    const $element = ev.target as HTMLElement;
    const classList = $element.classList;
    const line = $element.parentNode as HTMLElement;
    const state = +line.dataset.id!;
    if (classList.contains("stateCapital")) stateChangeCapitalName(state, line, ($element as HTMLInputElement).value);
  });

  ($body as any).on("change", (ev: Event) => {
    const $element = ev.target as HTMLElement;
    const classList = $element.classList;
    const line = $element.parentNode as HTMLElement;
    const state = +line.dataset.id!;
    if (classList.contains("stateCulture")) stateChangeCulture(state, line, ($element as HTMLSelectElement).value);
    else if (classList.contains("cultureType")) stateChangeType(state, line, ($element as HTMLSelectElement).value);
    else if (classList.contains("statePower"))
      stateChangeExpansionism(state, line, ($element as HTMLInputElement).value);
  });
}

function refreshStatesEditor(): void {
  States.collectStatistics(getWorldState());
  statesEditorAddLines();
}

function statesEditorAddLines(): void {
  const unit = getAreaUnit();
  const hidden = ensureEl("statesRegenerateButtons").style.display === "block" ? "" : "hidden";
  let lines = "";
  let totalArea = 0;
  let totalPopulation = 0;
  let totalBurgs = 0;

  for (const s of pack.states as any[]) {
    if (s.removed) continue;
    const area = getArea(s.area);
    const rural = s.rural * populationRate;
    const urban = s.urban * populationRate * urbanization;
    const population = rn(rural + urban);
    const populationTip = `Total population: ${si(population)}; Rural population: ${si(rural)}; Urban population: ${si(urban)}. Click to change`;
    totalArea += area;
    totalPopulation += population;
    totalBurgs += s.burgs;
    const focused = defs.select(`#fog #focusState${s.i}`).size();

    if (!s.i) {
      lines += /* html */ `<div
        class="states"
        data-id=${s.i}
        data-name="${s.name}"
        data-cells=${s.cells}
        data-area=${area}
        data-population=${population}
        data-burgs=${s.burgs}
        data-color=""
        data-form=""
        data-capital=""
        data-culture=""
        data-type=""
        data-expansionism=""
      >
        <svg width="1em" height="1em" class="placeholder"></svg>
        <input data-tip="Neutral lands name. Click to change" class="stateName name pointer italic" value="${s.name}" readonly />
        <svg class="coaIcon placeholder"></svg>
        <input class="stateForm placeholder" value="none" />
        <span class="icon-star-empty placeholder"></span>
        <input class="stateCapital placeholder" />
        <select class="stateCulture placeholder hide">${getCultureOptions(0)}</select>
        <span data-tip="Click to overview neutral burgs" class="icon-dot-circled pointer hide" style="padding-right: 1px"></span>
        <div data-tip="Burgs count" class="stateBurgs hide">${s.burgs}</div>
        <span data-tip="Neutral lands area" style="padding-right: 4px" class="icon-map-o hide"></span>
        <div data-tip="Neutral lands area" class="stateArea hide" style="width: 6em">${si(area)} ${unit}</div>
        <span data-tip="${populationTip}" class="icon-male hide"></span>
        <div data-tip="${populationTip}" class="statePopulation pointer hide" style="width: 5em">${si(population)}</div>
        <select class="cultureType ${hidden} placeholder show hide">${getTypeOptions(0)}</select>
        <span class="icon-resize-full ${hidden} placeholder show hide"></span>
        <input class="statePower ${hidden} placeholder show hide" type="number" value="0" />
        <span data-tip="Cells count" class="icon-check-empty ${hidden} show hide"></span>
        <div data-tip="Cells count" class="stateCells ${hidden} show hide">${s.cells}</div>
      </div>`;
      continue;
    }

    const capital = (pack.burgs as any[])[s.capital].name;
    COArenderer.trigger(`stateCOA${s.i}`, s.coa);
    lines += /* html */ `<div
      class="states"
      data-id=${s.i}
      data-name="${s.name}"
      data-form="${s.formName}"
      data-capital="${capital}"
      data-color="${s.color}"
      data-cells=${s.cells}
      data-area=${area}
      data-population=${population}
      data-burgs=${s.burgs}
      data-culture=${(pack.cultures as any[])[s.culture].name}
      data-type=${s.type}
      data-expansionism=${s.expansionism}
    >
      <fill-box fill="${s.color}"></fill-box>
      <input data-tip="State name. Click to change" class="stateName name pointer" value="${s.name}" readonly />
      <svg data-tip="Click to show and edit state emblem" class="coaIcon pointer" viewBox="0 0 200 200"><use href="#stateCOA${s.i}"></use></svg>
      <input data-tip="State form name. Click to change" class="stateForm name pointer" value="${s.formName}" readonly />
      <span data-tip="State capital. Click to zoom into view" class="icon-star-empty pointer"></span>
      <input data-tip="Capital name. Click and type to rename" class="stateCapital" value="${capital}" autocorrect="off" spellcheck="false" />
      <select data-tip="Dominant culture. Click to change" class="stateCulture hide">${getCultureOptions(s.culture)}</select>
      <span data-tip="Click to overview state burgs" style="padding-right: 1px" class="icon-dot-circled pointer hide"></span>
      <div data-tip="Burgs count" class="stateBurgs hide">${s.burgs}</div>
      <span data-tip="State area" style="padding-right: 4px" class="icon-map-o hide"></span>
      <div data-tip="State area" class="stateArea hide" style="width: 6em">${si(area)} ${unit}</div>
      <span data-tip="${populationTip}" class="icon-male hide"></span>
      <div data-tip="${populationTip}" class="statePopulation pointer hide" style="width: 5em">${si(population)}</div>
      <select data-tip="State type. Defines growth model. Click to change" class="cultureType ${hidden} show hide">${getTypeOptions(s.type)}</select>
      <span data-tip="State expansionism" class="icon-resize-full ${hidden} show hide"></span>
      <input data-tip="Expansionism (defines competitive size). Change to re-calculate states based on new value"
        class="statePower ${hidden} show hide" type="number" min="0" max="99" step=".1" value=${s.expansionism} />
      <span data-tip="Cells count" class="icon-check-empty ${hidden} show hide"></span>
      <div data-tip="Cells count" class="stateCells ${hidden} show hide">${s.cells}</div>
      <span data-tip="Locate the state" class="icon-target hide"></span>
      <span data-tip="Toggle state focus" class="icon-pin ${focused ? "" : " inactive"} hide"></span>
      <span data-tip="Lock the state to protect it from re-generation" class="icon-lock${s.lock ? "" : "-open"} hide"></span>
      <span data-tip="Remove the state" class="icon-trash-empty hide"></span>
    </div>`;
  }
  $body.innerHTML = lines;

  ensureEl("statesFooterStates").innerHTML = String((pack.states as any[]).filter(s => s.i && !s.removed).length);
  ensureEl("statesFooterCells").innerHTML = String((pack.cells.h as unknown as number[]).filter(h => h >= 20).length);
  ensureEl("statesFooterBurgs").innerHTML = String(totalBurgs);
  ensureEl("statesFooterArea").innerHTML = si(totalArea) + unit;
  ensureEl("statesFooterArea").dataset.area = String(totalArea);
  ensureEl("statesFooterPopulation").innerHTML = si(totalPopulation);
  ensureEl("statesFooterPopulation").dataset.population = String(totalPopulation);

  $body.querySelectorAll(":scope > div").forEach($line => {
    ($line as any).on("mouseenter", stateHighlightOn);
    ($line as any).on("mouseleave", stateHighlightOff);
    ($line as any).on("click", selectStateOnLineClick);
  });

  if ($body.dataset.type === "percentage") {
    $body.dataset.type = "absolute";
    togglePercentageMode();
  }
  applySorting(ensureEl("statesHeader"));
  ($("#statesEditor") as any).dialog({ width: fitContent() });
}

function getCultureOptions(culture: number): string {
  let options = "";
  (pack.cultures as any[]).forEach(c => {
    if (!c.removed) {
      options += `<option ${c.i === culture ? "selected" : ""} value="${c.i}">${c.name}</option>`;
    }
  });
  return options;
}

function getTypeOptions(type: string | number): string {
  let options = "";
  const types = ["Generic", "River", "Lake", "Naval", "Nomadic", "Hunting", "Highland"];
  types.forEach(t => {
    options += `<option ${type === t ? "selected" : ""} value="${t}">${t}</option>`;
  });
  return options;
}

function stateHighlightOn(event: Event): void {
  if (!layerIsOn("toggleStates")) return;
  if (defs.select("#fog path").size()) return;

  const state = +((event.target as HTMLElement).dataset.id ?? 0);
  if (customization || !state) return;
  const d = regions.select(`#state${state}`).attr("d");

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
  const interpolate = d3.interpolateString(`0, ${totalLength}`, `${totalLength}, ${totalLength}`);
  path
    .transition()
    .duration(duration)
    .attrTween("stroke-dasharray", () => interpolate);
}

function stateHighlightOff(): void {
  debug.selectAll(".highlight").each(function (this: SVGElement) {
    d3.select(this).transition().duration(1000).attr("opacity", 0).remove();
  } as any);
}

function stateChangeFill(el: Element): void {
  const currentFill = el.getAttribute("fill");
  const state = +(el.parentNode as HTMLElement).dataset.id!;

  const callback = (newFill: string) => {
    (el as any).fill = newFill;
    pack.states[state].color = newFill;
    statesBody.select(`#state${state}`).attr("fill", newFill);
    statesBody.select(`#state-gap${state}`).attr("stroke", newFill);
    const halo = (d3.color(newFill) as any)?.darker().hex() ?? "#666666";
    statesHalo.select(`#state-border${state}`).attr("stroke", halo);

    const solidColor = newFill[0] === "#" ? newFill : "#999";
    const darkerColor = (d3.color(solidColor) as any).darker().hex();
    armies.select(`#army${state}`).attr("fill", solidColor);
    armies.select(`#army${state}`).selectAll("g > rect:nth-of-type(2)").attr("fill", darkerColor);
  };

  openPicker(currentFill ?? "", callback);
}

function editStateName(state: number): void {
  const stateNameEditorCustomForm = ensureEl<HTMLInputElement>("stateNameEditorCustomForm");
  const stateNameEditorSelectForm = ensureEl<HTMLSelectElement>("stateNameEditorSelectForm");

  stateNameEditorCustomForm.value = "";
  const addModeActive = stateNameEditorCustomForm.style.display === "inline-block";
  if (addModeActive) {
    stateNameEditorCustomForm.style.display = "none";
    stateNameEditorSelectForm.style.display = "inline-block";
  }

  const s = pack.states[state] as any;
  ensureEl("stateNameEditor").dataset.state = String(state);
  ensureEl<HTMLInputElement>("stateNameEditorShort").value = s.name || "";
  applyOption(stateNameEditorSelectForm, s.formName);
  ensureEl<HTMLInputElement>("stateNameEditorFull").value = s.fullName || "";

  ($("#stateNameEditor") as any).dialog({
    resizable: false,
    title: "Change state name",
    buttons: {
      Apply: function () {
        applyNameChange(s);
        ($(this) as any).dialog("close");
      },
      Cancel: function () {
        ($(this) as any).dialog("close");
      }
    },
    position: { my: "center", at: "center", of: "svg" }
  });

  if (modules.editStateName) return;
  modules.editStateName = true;

  ensureEl("stateNameEditorShortCulture").on("click", regenerateShortNameCulture);
  ensureEl("stateNameEditorShortRandom").on("click", regenerateShortNameRandom);
  ensureEl("stateNameEditorAddForm").on("click", addCustomForm);
  ensureEl("stateNameEditorCustomForm").on("change", addCustomForm);
  ensureEl("stateNameEditorFullRegenerate").on("click", regenerateFullName);

  function regenerateShortNameCulture(): void {
    const stateId = +ensureEl("stateNameEditor").dataset.state!;
    const culture = (pack.states[stateId] as any).culture;
    const name = Names.getState(Names.getCultureShort(culture), culture);
    ensureEl<HTMLInputElement>("stateNameEditorShort").value = name;
  }

  function regenerateShortNameRandom(): void {
    const base = rand(nameBases.length - 1);
    const name = Names.getState(Names.getBase(base), 0, base);
    ensureEl<HTMLInputElement>("stateNameEditorShort").value = name;
  }

  function addCustomForm(): void {
    const value = stateNameEditorCustomForm.value;
    const isAddModeActive = stateNameEditorCustomForm.style.display === "inline-block";
    stateNameEditorCustomForm.style.display = isAddModeActive ? "none" : "inline-block";
    stateNameEditorSelectForm.style.display = isAddModeActive ? "inline-block" : "none";
    if (value && isAddModeActive) applyOption(stateNameEditorSelectForm, value);
    stateNameEditorCustomForm.value = "";
  }

  function regenerateFullName(): void {
    const short = ensureEl<HTMLInputElement>("stateNameEditorShort").value;
    const form = ensureEl<HTMLSelectElement>("stateNameEditorSelectForm").value;
    ensureEl<HTMLInputElement>("stateNameEditorFull").value = computeFullName();

    function computeFullName(): string {
      if (!form) return short;
      if (!short && form) return `The ${form}`;
      const fullRegenEl = ensureEl("stateNameEditorFullRegenerate");
      const tick = +fullRegenEl.dataset.tick!;
      fullRegenEl.dataset.tick = String(tick + 1);
      return tick % 2 ? `${getAdjective(short)} ${form}` : `${form} of ${short}`;
    }
  }

  function applyNameChange(s: any): void {
    const nameInput = ensureEl<HTMLInputElement>("stateNameEditorShort");
    const formSelect = ensureEl<HTMLSelectElement>("stateNameEditorSelectForm");
    const fullNameInput = ensureEl<HTMLInputElement>("stateNameEditorFull");

    const nameChanged = nameInput.value !== s.name;
    const formChanged = formSelect.value !== s.formName;
    const fullNameChanged = fullNameInput.value !== s.fullName;
    const changed = nameChanged || formChanged || fullNameChanged;

    if (formChanged) {
      const selected = formSelect.selectedOptions[0];
      const form = (selected.parentElement as HTMLOptGroupElement).label || null;
      if (form) s.form = form;
    }

    s.name = nameInput.value;
    s.formName = formSelect.value;
    s.fullName = fullNameInput.value;
    if (changed && (ensureEl("stateNameEditorUpdateLabel") as HTMLInputElement).checked) drawStateLabels([s.i]);
    refreshStatesEditor();
  }
}

function stateChangeCapitalName(state: number, line: HTMLElement, value: string): void {
  line.dataset.capital = value;
  const capital = (pack.states[state] as any).capital;
  if (!capital) return;
  (pack.burgs as any[])[capital].name = value;
  (document.querySelector(`#burgLabel${capital}`) as Element).textContent = value;
}

function changePopulation(stateId: number): void {
  const state = pack.states[stateId] as any;
  if (!state.cells) {
    tip("State does not have any cells, cannot change population", false, "error");
    return;
  }

  const rural = rn(state.rural * populationRate);
  const urban = rn(state.urban * populationRate * urbanization);
  const total = rural + urban;
  const format = (n: number) => Number(n).toLocaleString();

  alertMessage.innerHTML = /* html */ `<div>
    <i>Change population of all cells assigned to the state</i>
    <div style="margin: 0.5em 0">
      Rural: <input type="number" min="0" step="1" id="ruralPop" value=${rural} style="width:6em" />
      Urban: <input type="number" min="0" step="1" id="urbanPop" value=${urban} style="width:6em" />
    </div>
    <div>Total population: ${format(total)} ⇒ <span id="totalPop">${format(total)}</span>
      (<span id="totalPopPerc">100</span>%)
    </div>
  </div>`;

  const getRuralPop = () => document.getElementById("ruralPop") as HTMLInputElement;
  const getUrbanPop = () => document.getElementById("urbanPop") as HTMLInputElement;

  const update = () => {
    const totalNew = getRuralPop().valueAsNumber + getUrbanPop().valueAsNumber;
    if (Number.isNaN(totalNew)) return;
    const totalPopEl = document.getElementById("totalPop");
    const totalPopPercEl = document.getElementById("totalPopPerc");
    if (totalPopEl) totalPopEl.innerHTML = format(totalNew);
    if (totalPopPercEl) totalPopPercEl.innerHTML = String(rn((totalNew / total) * 100));
  };

  getRuralPop().oninput = () => update();
  getUrbanPop().oninput = () => update();

  ($("#alert") as any).dialog({
    resizable: false,
    title: "Change state population",
    width: "24em",
    buttons: {
      Apply: function () {
        applyPopulationChange();
        ($(this) as any).dialog("close");
      },
      Cancel: function () {
        ($(this) as any).dialog("close");
      }
    },
    position: { my: "center", at: "center", of: "svg" }
  });

  function applyPopulationChange(): void {
    const ruralChange = +getRuralPop().value / rural;
    if (Number.isFinite(ruralChange) && ruralChange !== 1) {
      const cells = (pack.cells.i as unknown as number[]).filter((i: number) => pack.cells.state[i] === stateId);
      cells.forEach((i: number) => {
        pack.cells.pop[i] *= ruralChange;
      });
    }
    if (!Number.isFinite(ruralChange) && +getRuralPop().value > 0) {
      const points = +getRuralPop().value / populationRate;
      const cells = (pack.cells.i as unknown as number[]).filter((i: number) => pack.cells.state[i] === stateId);
      const pop = points / cells.length;
      cells.forEach((i: number) => {
        pack.cells.pop[i] = pop;
      });
    }

    const urbanChange = +getUrbanPop().value / urban;
    if (Number.isFinite(urbanChange) && urbanChange !== 1) {
      const burgs = (pack.burgs as any[]).filter(b => !b.removed && b.state === stateId);
      burgs.forEach(b => {
        b.population = rn(b.population * urbanChange, 4);
      });
    }
    if (!Number.isFinite(urbanChange) && +getUrbanPop().value > 0) {
      const points = +getUrbanPop().value / populationRate / urbanization;
      const burgs = (pack.burgs as any[]).filter(b => !b.removed && b.state === stateId);
      const population = rn(points / burgs.length, 4);
      burgs.forEach(b => {
        b.population = population;
      });
    }

    if (layerIsOn("togglePopulation")) drawPopulation();
    refreshStatesEditor();
  }
}

function stateCapitalZoomIn(state: number): void {
  const capital = (pack.states[state] as any).capital;
  const l = burgLabels.select(`[data-id='${capital}']`);
  const x = +l.attr("x");
  const y = +l.attr("y");
  zoomTo(x, y, 8, 2000);
}

function stateChangeCulture(state: number, line: HTMLElement, value: string): void {
  (pack.states[state] as any).culture = +value;
  line.dataset.base = String((pack.states[state] as any).culture);
}

function stateChangeType(state: number, line: HTMLElement, value: string): void {
  line.dataset.type = pack.states[state].type = value;
  recalculateStates();
}

function stateChangeExpansionism(state: number, line: HTMLElement, value: string): void {
  line.dataset.expansionism = value;
  pack.states[state].expansionism = +value;
  recalculateStates();
}

function toggleFog(state: number, cl: DOMTokenList): void {
  if (customization) return;
  const path = statesBody.select(`#state${state}`).attr("d");
  const id = `focusState${state}`;
  cl.contains("inactive") ? fog(id, path) : unfog(id);
  cl.toggle("inactive");
}

function stateRemovePrompt(state: number): void {
  if (customization) return;

  confirmationDialog({
    title: "Remove state",
    message: "Are you sure you want to remove the state? <br>This action cannot be reverted",
    confirm: "Remove",
    onConfirm: () => stateRemove(state)
  });
}

function stateRemove(stateId: number): void {
  statesBody.select(`#state${stateId}`).remove();
  statesBody.select(`#state-gap${stateId}`).remove();
  statesHalo.select(`#state-border${stateId}`).remove();
  labels.select(`#stateLabel${stateId}`).remove();
  defs.select(`#textPath_stateLabel${stateId}`).remove();

  unfog(`focusState${stateId}`);

  (pack.burgs as any[]).forEach(burg => {
    if (burg.state === stateId) {
      burg.state = 0;
      if (burg.capital) {
        burg.capital = 0;
        Burgs.changeGroup(burg);
      }
    }
  });

  (pack.cells.state as unknown as number[]).forEach((s: number, i: number) => {
    if (s === stateId) pack.cells.state[i] = 0;
  });

  const coaId = `stateCOA${stateId}`;
  ensureEl(coaId).remove();
  emblems.select(`#stateEmblems > use[data-i='${stateId}']`).remove();

  (pack.states[stateId] as any).provinces.forEach((p: number) => {
    (pack.provinces as any)[p] = { i: p, removed: true };
    (pack.cells.province as unknown as number[]).forEach((pr: number, i: number) => {
      if (pr === p) pack.cells.province[i] = 0;
    });

    const provCoaId = `provinceCOA${p}`;
    const provCoaEl = document.getElementById(provCoaId);
    if (provCoaEl) provCoaEl.remove();
    emblems.select(`#provinceEmblems > use[data-i='${p}']`).remove();
    const g = provs.select("#provincesBody");
    g.select(`#province${p}`).remove();
    g.select(`#province-gap${p}`).remove();
  });

  (pack.states[stateId] as any).military.forEach((m: any) => {
    const id = `regiment${stateId}-${m.i}`;
    const index = notes.findIndex((n: any) => n.id === id);
    if (index !== -1) notes.splice(index, 1);
  });
  armies.select(`g#army${stateId}`).remove();

  (pack.states as any[]).forEach(state => {
    if (!state.i || state.removed || !state.neighbors) return;
    state.neighbors = state.neighbors.filter((n: number) => n !== stateId);
  });

  (pack.states as any)[stateId] = { i: stateId, removed: true };

  debug.selectAll(".highlight").remove();

  if (layerIsOn("toggleStates")) drawStates();
  if (layerIsOn("toggleBorders")) drawBorders();
  if (layerIsOn("toggleProvinces")) drawProvinces();

  refreshStatesEditor();
}

function toggleLegend(): void {
  if (legend.selectAll("*").size()) {
    clearLegend();
    return;
  }

  const data = (pack.states as any[])
    .filter(s => s.i && !s.removed && s.cells)
    .sort((a: any, b: any) => b.area - a.area)
    .map((s: any) => [s.i, s.color, s.name] as [number, string, string]);
  drawLegend("States", data);
}

function togglePercentageMode(): void {
  if ($body.dataset.type === "absolute") {
    $body.dataset.type = "percentage";
    const totalCells = +ensureEl("statesFooterCells").innerText;
    const totalBurgs = +ensureEl("statesFooterBurgs").innerText;
    const totalArea = +ensureEl("statesFooterArea").dataset.area!;
    const totalPopulation = +ensureEl("statesFooterPopulation").dataset.population!;

    $body.querySelectorAll(":scope > div").forEach((el: Element) => {
      const { cells, burgs, area, population } = (el as HTMLElement).dataset;
      el.querySelector<HTMLElement>(".stateCells")!.innerText = `${rn((+(cells ?? 0) / totalCells) * 100)}%`;
      el.querySelector<HTMLElement>(".stateBurgs")!.innerText = `${rn((+(burgs ?? 0) / totalBurgs) * 100)}%`;
      el.querySelector<HTMLElement>(".stateArea")!.innerText = `${rn((+(area ?? 0) / totalArea) * 100)}%`;
      el.querySelector<HTMLElement>(".statePopulation")!.innerText =
        `${rn((+(population ?? 0) / totalPopulation) * 100)}%`;
    });
  } else {
    $body.dataset.type = "absolute";
    statesEditorAddLines();
  }
}

function showStatesChart(): void {
  const statesData = (pack.states as any[]).filter(s => !s.removed);
  if (statesData.length < 2) {
    tip("There are no states to show", false, "error");
    return;
  }

  const root = d3
    .stratify<any>()
    .id((d: any) => d.i)
    .parentId((d: any) => (d.i ? "0" : null))(statesData)
    .sum((d: any) => d.area)
    .sort((a: any, b: any) => b.value - a.value);

  const size = 150 + 200 * +uiSize.value;
  const margin = { top: 0, right: -50, bottom: 0, left: -50 };
  const w = +size - margin.left - margin.right;
  const h = +size - margin.top - margin.bottom;
  const treeLayout = d3.pack<any>().size([w, h]).padding(3);

  alertMessage.innerHTML = /* html */ `<select id="statesTreeType" style="display:block; margin-left:13px; font-size:11px">
    <option value="area" selected>Area</option>
    <option value="population">Total population</option>
    <option value="rural">Rural population</option>
    <option value="urban">Urban population</option>
    <option value="burgs">Burgs number</option>
  </select>`;
  alertMessage.innerHTML += `<div id='statesInfo' class='chartInfo'>&#8205;</div>`;

  const chartSvg = d3
    .select("#alertMessage")
    .insert("svg", "#statesInfo")
    .attr("id", "statesTree")
    .attr("width", size)
    .attr("height", size)
    .style("font-family", "Almendra SC")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central");
  const graph = chartSvg.append("g").attr("transform", `translate(-50, 0)`);
  ensureEl("statesTreeType").on("change", updateChart);

  treeLayout(root);

  const node = graph
    .selectAll("g")
    .data(root.leaves())
    .enter()
    .append("g")
    .attr("transform", (d: any) => `translate(${d.x},${d.y})`)
    .attr("data-id", (d: any) => d.data.i)
    .on("mouseenter", (event: any, d: any) => showInfo(event, d))
    .on("mouseleave", (event: any) => hideInfo(event));

  node
    .append("circle")
    .attr("fill", (d: any) => d.data.color)
    .attr("r", (d: any) => d.r);

  const exp = /(?=[A-Z][^A-Z])/g;
  const lp = (n: string) => d3.max(n.split(exp).map(p => p.length))! + 1;

  node
    .append("text")
    .attr("text-rendering", "optimizeSpeed")
    .style("font-size", (d: any) => `${rn((d.r ** 0.97 * 4) / lp(d.data.name), 2)}px`)
    .selectAll("tspan")
    .data((d: any) => d.data.name.split(exp))
    .join("tspan")
    .attr("x", 0)
    .text((d: any) => d)
    .attr("dy", (_d: any, i: number, n: any) => `${i ? 1 : (n.length - 1) / -2}em`);

  function showInfo(ev: any, d: any): void {
    d3.select(ev.target).select("circle").classed("selected", true);
    const state = d.data.fullName;

    const area = `${getArea(d.data.area)} ${getAreaUnit()}`;
    const rural = rn(d.data.rural * populationRate);
    const urban = rn(d.data.urban * populationRate * urbanization);

    const option = (ensureEl("statesTreeType") as HTMLSelectElement).value;
    const value =
      option === "area"
        ? `Area: ${area}`
        : option === "rural"
          ? `Rural population: ${si(rural)}`
          : option === "urban"
            ? `Urban population: ${si(urban)}`
            : option === "burgs"
              ? `Burgs number: ${d.data.burgs}`
              : `Population: ${si(rural + urban)}`;

    ensureEl("statesInfo").innerHTML = `${state}. ${value}`;
    stateHighlightOn(ev);
  }

  function hideInfo(ev: any): void {
    stateHighlightOff();
    const statesInfoEl = document.getElementById("statesInfo");
    if (!statesInfoEl) return;
    statesInfoEl.innerHTML = "&#8205;";
    d3.select(ev.target).select("circle").classed("selected", false);
  }

  function updateChart(this: HTMLSelectElement): void {
    const value =
      this.value === "area"
        ? (d: any) => d.area
        : this.value === "rural"
          ? (d: any) => d.rural
          : this.value === "urban"
            ? (d: any) => d.urban
            : this.value === "burgs"
              ? (d: any) => d.burgs
              : (d: any) => d.rural + d.urban;

    root.sum(value);
    node.data(treeLayout(root).leaves());

    node
      .transition()
      .duration(1500)
      .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    node
      .select("circle")
      .transition()
      .duration(1500)
      .attr("r", (d: any) => d.r);
    node
      .select("text")
      .transition()
      .duration(1500)
      .style("font-size", (d: any) => `${rn((d.r ** 0.97 * 4) / lp(d.data.name), 2)}px`);
  }

  ($("#alert") as any).dialog({
    title: "States bubble chart",
    width: fitContent(),
    position: { my: "left bottom", at: "left+10 bottom-10", of: "svg" },
    buttons: {},
    close: () => {
      alertMessage.innerHTML = "";
    }
  });
}

function openRegenerationMenu(): void {
  ensureEl("statesBottom")
    .querySelectorAll<HTMLElement>(":scope > button")
    .forEach(el => {
      el.style.display = "none";
    });
  ensureEl("statesRegenerateButtons").style.display = "block";

  ensureEl("statesEditor")
    .querySelectorAll(".show")
    .forEach(el => {
      el.classList.remove("hidden");
    });
  ($("#statesEditor") as any).dialog({
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });
}

function recalculateStates(must?: boolean): void {
  if (!must && !(statesAutoChange as HTMLInputElement).checked) return;

  const state = getWorldState();
  States.expandStates();
  Provinces.generate(state);
  Provinces.getPoles(state);
  States.getPoles(state);

  if (layerIsOn("toggleStates")) drawStates();
  if (layerIsOn("toggleBorders")) drawBorders();
  if (layerIsOn("toggleProvinces")) drawProvinces();
  if ((adjustLabels as HTMLInputElement).checked) drawStateLabels();

  refreshStatesEditor();
}

function randomizeStatesExpansion(): void {
  (pack.states as any[]).forEach(s => {
    if (!s.i || s.removed) return;
    const expansionism = rn(Math.random() * 4 + 1, 1);
    s.expansionism = expansionism;
    ($body.querySelector(`div.states[data-id='${s.i}'] > input.statePower`) as HTMLInputElement).value =
      String(expansionism);
  });
  recalculateStates(true);
}

function exitRegenerationMenu(): void {
  ensureEl("statesBottom")
    .querySelectorAll<HTMLElement>(":scope > button")
    .forEach(el => {
      el.style.display = "inline-block";
    });
  ensureEl("statesRegenerateButtons").style.display = "none";
  ensureEl("statesEditor")
    .querySelectorAll(".show")
    .forEach(el => {
      el.classList.add("hidden");
    });
  ($("#statesEditor") as any).dialog({
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });
}

function enterStatesManualAssignent(): void {
  if (!layerIsOn("toggleStates")) toggleStates();
  customization = 2;
  statesBody.append("g").attr("id", "temp");
  document.querySelectorAll<HTMLElement>("#statesBottom > button").forEach(el => {
    el.style.display = "none";
  });
  ensureEl("statesManuallyButtons").style.display = "inline-block";
  ensureEl("statesHalo").style.display = "none";

  ensureEl("statesEditor")
    .querySelectorAll(".hide")
    .forEach(el => {
      el.classList.add("hidden");
    });
  ensureEl("statesFooter").style.display = "none";
  $body.querySelectorAll<HTMLElement>("div > input, select, span, svg").forEach(e => {
    e.style.pointerEvents = "none";
  });
  ($("#statesEditor") as any).dialog({
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });

  tip("Click on state to select, drag the circle to change state", true);
  viewbox
    .style("cursor", "crosshair")
    .on("click", selectStateOnMapClick)
    .call(d3.drag<SVGElement, unknown>().on("start", dragStateBrushStart).on("drag", dragStateBrush))
    .on("touchmove mousemove", moveStateBrush);

  $body.querySelector<HTMLElement>("div")!.classList.add("selected");
  statesManualHistory.reset();
}

function selectStateOnLineClick(this: HTMLElement): void {
  if (customization !== 2) return;
  if ((this.parentNode as Element).id !== "statesBodySection") return;
  $body.querySelector("div.selected")!.classList.remove("selected");
  this.classList.add("selected");
}

function selectStateOnMapClick(this: SVGElement, event: MouseEvent): void {
  const point = d3.pointer(event, this);
  const i = findCell(point[0], point[1]);
  if (pack.cells.h[i] < 20) return;

  const assigned = statesBody.select("#temp").select(`polygon[data-cell='${i}']`);
  const state = assigned.size() ? +assigned.attr("data-state") : pack.cells.state[i];

  $body.querySelector("div.selected")!.classList.remove("selected");
  $body.querySelector<HTMLElement>(`div[data-id='${state}']`)!.classList.add("selected");
}

function dragStateBrushStart(): void {
  saveStatesManualSnapshot();
}

function dragStateBrush(this: SVGElement, event: any): void {
  if (!event.dx && !event.dy) return;
  const r = +(ensureEl("statesBrush") as HTMLInputElement).value;
  const p = d3.pointer(event, this);
  moveCircle(p[0], p[1], r);

  const found = r > 5 ? findAll(p[0], p[1], r) : [findCell(p[0], p[1])];
  const selection = found.filter(isLand);
  if (selection) changeStateForSelection(selection);
}

function changeStateForSelection(selection: number[]): void {
  const temp = statesBody.select("#temp");

  const $selected = $body.querySelector<HTMLElement>("div.selected")!;
  const stateNew = +$selected.dataset.id!;
  const color = (pack.states[stateNew] as any).color || "#ffffff";
  const preventOverwrite = (document.getElementById("statesManuallyProtect") as HTMLInputElement)?.checked;

  selection.forEach((i: number) => {
    const exists = temp.select(`polygon[data-cell='${i}']`);
    const stateOld = exists.size() ? +exists.attr("data-state") : pack.cells.state[i];
    if (stateNew === stateOld) return;
    if (preventOverwrite && stateOld) return;
    if (i === (pack.states[stateOld] as any).center) return;

    if (exists.size()) exists.attr("data-state", stateNew).attr("fill", color).attr("stroke", color);
    else
      temp
        .append("polygon")
        .attr("data-cell", i)
        .attr("data-state", stateNew)
        .attr("points", getPackPolygon(i).join(" "))
        .attr("fill", color)
        .attr("stroke", color);
  });
}

function moveStateBrush(this: SVGElement, event: MouseEvent): void {
  showMainTip();
  const point = d3.pointer(event, this);
  const radius = +(ensureEl("statesBrush") as HTMLInputElement).value;
  moveCircle(point[0], point[1], radius);
}

function applyStatesManualAssignent(): void {
  const { cells } = pack;
  const affectedStates: number[] = [];
  const affectedProvinces: number[] = [];

  statesBody
    .select("#temp")
    .selectAll("polygon")
    .each(function (this: SVGPolygonElement) {
      const i = +(this as any).dataset.cell;
      const c = +(this as any).dataset.state;
      affectedStates.push(cells.state[i], c);
      affectedProvinces.push(cells.province[i]);
      cells.state[i] = c;
      if (cells.burg[i]) (pack.burgs as any[])[cells.burg[i]].state = c;
    } as any);

  if (affectedStates.length) {
    refreshStatesEditor();
    States.getPoles(getWorldState());
    layerIsOn("toggleStates") ? drawStates() : toggleStates();
    if ((adjustLabels as HTMLInputElement).checked) drawStateLabels([...new Set(affectedStates)]);
    adjustProvinces([...new Set(affectedProvinces)]);
    layerIsOn("toggleBorders") ? drawBorders() : toggleBorders();
    if (layerIsOn("toggleProvinces")) drawProvinces();
  }

  exitStatesManualAssignment(false);
}

function adjustProvinces(affectedProvinces: number[]): void {
  const { cells, provinces, states, burgs } = pack;

  affectedProvinces.forEach((provinceId: number) => {
    if (!provinces[provinceId]) return;

    const provCells = (cells.i as number[]).filter((i: number) => cells.province[i] === provinceId);
    const provStates = [...new Set(provCells.map((i: number) => cells.state[i]))];

    if (provinceId && provStates.length === 1) {
      changeProvinceOwner(provinceId, provStates[0] as number, provCells);
      return;
    }

    splitProvince(provinceId, provStates as number[], provCells);
  });

  function changeProvinceOwner(provinceId: number, newOwnerId: number, provinceCells: number[]): void {
    const province = (provinces as any[])[provinceId];
    const prevOwner = (states as any[])[province.state];

    prevOwner.provinces = prevOwner.provinces.filter((p: number) => p !== provinceId);

    if (newOwnerId) {
      province.state = newOwnerId;
      (states as any[])[newOwnerId].provinces.push(provinceId);
    } else {
      (provinces as any[])[provinceId] = { i: provinceId, removed: true };
      provinceCells.forEach((i: number) => {
        cells.province[i] = 0;
      });
    }
  }

  function splitProvince(provinceId: number, provinceStates: number[], provinceCells: number[]): void {
    const province = (provinces as any[])[provinceId];
    const prevOwner = (states as any[])[province.state];
    const provinceCenterOwner = cells.state[province.center];

    provinceStates.forEach((stateId: number) => {
      const stateProvinceCells = provinceCells.filter((i: number) => cells.state[i] === stateId);

      if (stateId === provinceCenterOwner) {
        if (stateId === prevOwner.i) return;

        if (!stateId) {
          (provinces as any[])[provinceId] = { i: provinceId, removed: true };
          stateProvinceCells.forEach((i: number) => {
            cells.province[i] = 0;
          });
          return;
        }

        prevOwner.provinces = prevOwner.provinces.filter((p: number) => p !== provinceId);
        province.state = stateId;
        province.color = getMixedColor((states as any[])[stateId].color);
        (states as any[])[stateId].provinces.push(provinceId);
        return;
      }

      if (!stateId) {
        stateProvinceCells.forEach((i: number) => {
          cells.province[i] = 0;
        });
        return;
      }

      if (stateProvinceCells.length < 20) {
        const closestProvince = findClosestProvince(provinceId, stateId, stateProvinceCells);
        if (closestProvince) {
          stateProvinceCells.forEach((i: number) => {
            cells.province[i] = closestProvince;
          });
          return;
        }
      }

      createProvince(province, stateId, stateProvinceCells);
    });
  }

  function createProvince(oldProvince: any, stateId: number, provinceCells: number[]): void {
    const newProvinceId = (provinces as any[]).length;
    const burgCell = provinceCells.find((i: number) => cells.burg[i]);
    const center = burgCell ?? provinceCells[0];
    const burgId = burgCell ? cells.burg[burgCell] : 0;
    const burg = burgId ? (burgs as any[])[burgId] : null;
    const culture = cells.culture[center];

    const nameByBurg = burgCell && P(0.5);
    const name = nameByBurg ? burg.name : oldProvince.name || Names.getState(Names.getCultureShort(culture), culture);

    const formOptions = ["Zone", "Area", "Territory", "Province"];
    const formName = burgCell && oldProvince.formName ? oldProvince.formName : ra(formOptions);

    const color = getMixedColor((states as any[])[stateId].color);

    const kinship = nameByBurg ? 0.8 : 0.4;
    const type = Burgs.getType(center, burg?.port);
    const coa = COA.generate(burg?.coa || (states as any[])[stateId].coa, kinship, burg ? null : 0.9, type);
    coa.shield = COA.getShield(culture, stateId);

    (provinces as any[]).push({
      i: newProvinceId,
      state: stateId,
      center,
      burg: burgId,
      name,
      formName,
      fullName: `${name} ${formName}`,
      color,
      coa
    });

    provinceCells.forEach((i: number) => {
      cells.province[i] = newProvinceId;
    });
    (states as any[])[stateId].provinces.push(newProvinceId);
  }

  function findClosestProvince(provinceId: number, stateId: number, sourceCells: number[]): number | undefined {
    const borderCell = sourceCells.find((i: number) =>
      (cells.c[i] as number[]).some((c: number) => {
        return cells.state[c] === stateId && cells.province[c] && cells.province[c] !== provinceId;
      })
    );

    return (
      borderCell &&
      (cells.c[borderCell] as number[]).map((c: number) => cells.province[c]).find((p: number) => p && p !== provinceId)
    );
  }
}

function exitStatesManualAssignment(close: boolean): void {
  customization = 0;
  statesManualHistory.reset();
  statesBody.select("#temp").remove();
  removeCircle();
  document.querySelectorAll<HTMLElement>("#statesBottom > button").forEach(el => {
    el.style.display = "inline-block";
  });
  ensureEl("statesManuallyButtons").style.display = "none";
  ensureEl("statesHalo").style.display = "block";

  ensureEl("statesEditor")
    .querySelectorAll(".hide:not(.show)")
    .forEach(el => {
      el.classList.remove("hidden");
    });
  ensureEl("statesFooter").style.display = "block";
  $body.querySelectorAll<HTMLElement>("div > input, select, span, svg").forEach(e => {
    e.style.pointerEvents = "all";
  });
  if (!close)
    ($("#statesEditor") as any).dialog({
      position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
    });

  restoreDefaultEvents?.();
  clearMainTip();
  const selected = $body.querySelector("div.selected");
  if (selected) selected.classList.remove("selected");
}

function saveStatesManualSnapshot(): void {
  const temp = statesBody.select("#temp").node() as Element | null;
  if (!temp) return;
  statesManualHistory.push(temp.innerHTML);
}

function undoStatesManualAssignment(): void {
  const temp = statesBody.select("#temp").node() as Element | null;
  if (!temp || !statesManualHistory.canUndo) return;
  temp.innerHTML = statesManualHistory.pop() ?? "";
}

function enterAddStateMode(this: HTMLButtonElement): void {
  if (this.classList.contains("pressed")) {
    exitAddStateMode();
    return;
  }
  customization = 3;
  this.classList.add("pressed");
  tip("Click on the map to create a new capital or promote an existing burg", true);
  viewbox.style("cursor", "crosshair").on("click", addState);
  $body.querySelectorAll<HTMLElement>("div > input, select, span, svg").forEach(e => {
    e.style.pointerEvents = "none";
  });
}

function addState(this: SVGElement, event: MouseEvent): void {
  const { cells, states, burgs } = pack;
  const point = d3.pointer(event, this);
  const center = findCell(point[0], point[1]);
  if (cells.h[center] < 20) {
    tip("You cannot place state into the water. Please click on a land cell", false, "error");
    return;
  }

  let burgId = cells.burg[center];
  if (burgId && (burgs as any[])[burgId].capital) {
    tip("Existing capital cannot be selected as a new state capital! Select other cell", false, "error");
    return;
  }

  if (!burgId) burgId = Burgs.add(point);

  const oldState = cells.state[center];
  const newState = (states as any[]).length;

  (burgs as any[])[burgId].capital = 1;
  (burgs as any[])[burgId].state = newState;
  Burgs.changeGroup((burgs as any[])[burgId]);

  if (event.shiftKey === false) exitAddStateMode();

  const culture = cells.culture[center];
  const basename = center % 5 === 0 ? (burgs as any[])[burgId].name : Names.getCulture(culture);
  const name = Names.getState(basename, culture);
  const color = getRandomColor();

  const cultureType = (pack.cultures as any[])[culture].type;
  const coa = COA.generate((burgs as any[])[burgId].coa, 0.4, null, cultureType);
  coa.shield = COA.getShield(culture);

  const diplomacy = (states as any[]).map((s: any) => {
    if (!s.i || s.removed) return "x";
    if (!oldState) {
      s.diplomacy.push("Neutral");
      return "Neutral";
    }

    let relations = (states as any[])[oldState].diplomacy[s.i];
    if (s.i === oldState) relations = "Enemy";
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
  (states as any[])[0].diplomacy.push([
    `Independance declaration`,
    `${name} declared its independance from ${(states as any[])[oldState].name}`
  ]);

  cells.state[center] = newState;
  cells.province[center] = 0;

  (states as any[]).push({
    i: newState,
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

  const state = getWorldState();
  States.getPoles(state);
  States.findNeighbors();
  States.collectStatistics(state);
  States.defineStateForms(state, [newState]);
  adjustProvinces([cells.province[center]]);

  drawStateLabels([newState]);
  COArenderer.add(
    "state",
    newState,
    coa as any,
    (states as any[])[newState].pole[0],
    (states as any[])[newState].pole[1]
  );

  layerIsOn("toggleProvinces") && toggleProvinces();
  layerIsOn("toggleStates") ? drawStates() : toggleStates();
  layerIsOn("toggleBorders") ? drawBorders() : toggleBorders();

  statesEditorAddLines();
}

function exitAddStateMode(): void {
  customization = 0;
  restoreDefaultEvents?.();
  clearMainTip();
  $body.querySelectorAll<HTMLElement>("div > input, select, span, svg").forEach(e => {
    e.style.pointerEvents = "all";
  });
  const statesAdd = document.getElementById("statesAdd");
  if (statesAdd?.classList.contains("pressed")) statesAdd.classList.remove("pressed");
}

function openStateMergeDialog(): void {
  const emblem = (i: number) => `<svg class="coaIcon" viewBox="0 0 200 200"><use href="#stateCOA${i}"></use></svg>`;
  const validStates = (pack.states as any[]).filter(s => s.i && !s.removed);

  const statesSelector = validStates
    .map(
      (s: any) => `
      <div data-id="${s.i}" data-tip="${s.fullName}" style="cursor:default">
        <input type="radio" name="rulingState" value="${s.i}" />
        <input id="selectState${s.i}" class="checkbox" type="checkbox" name="statesToMerge" value="${s.i}" />
        <label for="selectState${s.i}" class="checkbox-label"><fill-box fill="${s.color}" disabled></fill-box>${emblem(s.i)}${s.fullName}</label>
      </div>
    `
    )
    .join("");

  alertMessage.innerHTML = /* html */ `
    <form id='mergeStatesForm' style="overflow: hidden; display: flex; flex-direction: column; gap: 1em;">
      <p style="margin:0">
        Check the <b>checkbox</b> next to each state you want to merge.
        Use the <b>radio button</b> to pick the <em>ruling state</em> that will absorb all others (its name, color, and capital will be kept).
        Hover over a row to highlight the state on the map.
      </p>
      <main style='display: grid; grid-template-columns: 1fr 1fr; gap: .3em;'>
        ${statesSelector}
      </main>
    </form>
  `;

  ensureEl("mergeStatesForm")
    .querySelectorAll("div[data-id]")
    .forEach(el => {
      el.addEventListener("mouseenter", highlightStateOnMergeHover);
      el.addEventListener("mouseleave", () => stateHighlightOff());
    });

  function highlightStateOnMergeHover(event: Event): void {
    if (!layerIsOn("toggleStates")) return;
    const state = +(event.currentTarget as HTMLElement).dataset.id!;
    if (!state) return;
    const d = regions.select(`#state${state}`).attr("d");
    if (!d) return;

    stateHighlightOff();

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
    const interpolate = d3.interpolateString(`0, ${totalLength}`, `${totalLength}, ${totalLength}`);
    path
      .transition()
      .duration(duration)
      .attrTween("stroke-dasharray", () => interpolate);
  }

  ($("#alert") as any).dialog({
    width: 600,
    title: `Merge states`,
    close: stateHighlightOff,
    buttons: {
      Merge: function () {
        const formData = new FormData(ensureEl<HTMLFormElement>("mergeStatesForm"));

        const rulingStateId = Number(formData.get("rulingState"));
        if (!rulingStateId) return tip("Please select a state to merge into", false, "error");
        const rullingState = pack.states[rulingStateId] as any;

        const statesToMerge = formData
          .getAll("statesToMerge")
          .map(Number)
          .filter((stateId: number) => stateId !== rulingStateId);
        if (!statesToMerge.length) return tip("Please select several states to merge", false, "error");

        confirmationDialog({
          title: "Merge states",
          message: `
            <p>The following states will be <strong>removed</strong>: ${statesToMerge.map((stateId: number) => `${emblem(stateId)}${(pack.states[stateId] as any).name}`).join(", ")}.</p>
            <p>Removed states data (burgs, provinces, regiments) will be assigned to ${emblem(rullingState.i)}${rullingState.name}.</p>
            <p>Are you sure you want to merge states? This action cannot be reverted.</p>`,
          confirm: "Merge",
          onConfirm: () => {
            mergeStates(statesToMerge, rulingStateId);
            ($(this) as any).dialog("close");
          }
        });
      },
      Cancel: function () {
        ($(this) as any).dialog("close");
      }
    }
  });

  function mergeStates(statesToMerge: number[], rulingStateId: number): void {
    const rulingState = pack.states[rulingStateId] as any;
    const rulingStateArmy = ensureEl(`army${rulingStateId}`);

    statesToMerge.forEach((stateId: number) => {
      const state = pack.states[stateId] as any;
      state.removed = true;

      statesBody.select(`#state${stateId}`).remove();
      statesBody.select(`#state-gap${stateId}`).remove();
      statesHalo.select(`#state-border${stateId}`).remove();
      labels.select(`#stateLabel${stateId}`).remove();
      defs.select(`#textPath_stateLabel${stateId}`).remove();

      ensureEl(`stateCOA${stateId}`).remove();
      emblems.select(`#stateEmblems > use[data-i='${stateId}']`).remove();

      state.military.forEach((regiment: any) => {
        const oldId = `regiment${stateId}-${regiment.i}`;
        const newIndex = rulingState.military.length;
        rulingState.military.push({ ...regiment, i: newIndex });
        const newId = `regiment${rulingStateId}-${newIndex}`;

        const note = (notes as any[]).find((n: any) => n.id === oldId);
        if (note) note.id = newId;

        const element = document.getElementById(oldId);
        if (element) {
          element.id = newId;
          element.dataset.state = String(rulingStateId);
          element.dataset.id = String(newIndex);
          rulingStateArmy.appendChild(element);
        }
      });

      armies.select(`g#army${stateId}`).remove();
    });

    (pack.burgs as any[]).forEach((burg: any) => {
      if (statesToMerge.includes(burg.state)) {
        if (burg.capital) {
          burg.capital = 0;
          Burgs.changeGroup(burg);
        }
        burg.state = rulingStateId;
      }
    });

    (pack.provinces as any[]).forEach((province: any) => {
      if (statesToMerge.includes(province.state)) province.state = rulingStateId;
    });

    (pack.cells.state as unknown as number[]).forEach((s: number, i: number) => {
      if (statesToMerge.includes(s)) pack.cells.state[i] = rulingStateId;
    });

    unfog();
    debug.selectAll(".highlight").remove();

    States.getPoles(getWorldState());
    layerIsOn("toggleStates") ? drawStates() : toggleStates();
    layerIsOn("toggleBorders") ? drawBorders() : toggleBorders();
    layerIsOn("toggleProvinces") && drawProvinces();
    drawStateLabels([rulingStateId]);

    refreshStatesEditor();
  }
}

function downloadStatesCsv(): void {
  const unit = getAreaUnit("2");
  const headers = `Id,State,Full Name,Form,Color,Capital,Culture,Type,Expansionism,Cells,Burgs,Area ${unit},Total Population,Rural Population,Urban Population`;
  const lines = Array.from($body.querySelectorAll(":scope > div"));
  const data = lines.map(($line: Element) => {
    const { id, name, form, color, capital, culture, type, expansionism, cells, burgs, area, population } = (
      $line as HTMLElement
    ).dataset;
    const { fullName = "", rural, urban } = pack.states[+(id ?? 0)] as any;
    const ruralPopulation = Math.round(rural * populationRate);
    const urbanPopulation = Math.round(urban * populationRate * urbanization);
    return [
      id,
      name,
      fullName,
      form,
      color,
      capital,
      culture,
      type,
      expansionism,
      cells,
      burgs,
      area,
      population,
      ruralPopulation,
      urbanPopulation
    ].join(",");
  });
  const csvData = [headers].concat(data).join("\n");

  const name = `${getFileName("States")}.csv`;
  downloadFile(csvData, name);
}

function closeStatesEditor(): void {
  if (customization === 2) exitStatesManualAssignment(true);
  if (customization === 3) exitAddStateMode();
  debug.selectAll(".highlight").remove();
  $body.innerHTML = "";
}

function updateLockStatus(stateId: number, classList: DOMTokenList): void {
  const s = pack.states[stateId] as any;
  s.lock = !s.lock;

  classList.toggle("icon-lock-open");
  classList.toggle("icon-lock");
}

declare global {
  var statesAutoChange: HTMLInputElement;
  var adjustLabels: HTMLInputElement;
  var getMixedColor: (color: string) => string;
  var getAdjective: (name: string) => string;
}
