import { pointer, quadtree } from "d3";
import { ensureEl, gauss, generateSeed, getNextId, isCtrlClick, P, rn } from "../utils";
import { open as openChartsOverview } from "./charts-overview";

// ─── Tools panel event dispatcher ────────────────────────────────────────────

ensureEl("toolsContent").addEventListener("click", (event: MouseEvent) => {
  if (customization) return tip("Please exit the customization mode first", false, "error");
  const target = event.target as HTMLElement;
  if (!["BUTTON", "I"].includes(target.tagName)) return;
  const button = target.id;

  if (button === "editHeightmapButton") editHeightmap();
  else if (button === "editBiomesButton") editBiomes();
  else if (button === "editStatesButton") editStates();
  else if (button === "editProvincesButton") editProvinces?.();
  else if (button === "editDiplomacyButton") editDiplomacy?.();
  else if (button === "editCoastlineSettings") editCoastlineSettings();
  else if (button === "editCulturesButton") editCultures();
  else if (button === "editReligions") editReligions();
  else if (button === "editEmblemButton") openEmblemEditor();
  else if (button === "editNamesBaseButton") NamesbaseEditor.open();
  else if (button === "editUnitsButton") editUnits();
  else if (button === "editNotesButton") editNotes();
  else if (button === "editZonesButton") editZones?.();
  else if (button === "overviewChartsButton") overviewCharts();
  else if (button === "overviewBurgsButton") overviewBurgs();
  else if (button === "overviewRoutesButton") overviewRoutes();
  else if (button === "overviewRiversButton") overviewRivers();
  else if (button === "overviewMilitaryButton") overviewMilitary();
  else if (button === "overviewMarkersButton") overviewMarkers();
  else if (button === "overviewCellsButton") viewCellDetails();
  else if (button === "openMinimapButton") openMinimap?.();

  const parentNode = target.parentNode as Element | null;
  if (parentNode?.id === "regenerateFeature") {
    const dontAsk = sessionStorage.getItem("regenerateFeatureDontAsk");
    if (dontAsk) return processFeatureRegeneration(event, button);

    alertMessage.innerHTML = `Regeneration will remove all the custom changes for the element.<br /><br />Are you sure you want to proceed?`;
    $("#alert").dialog({
      resizable: false,
      title: "Regenerate element",
      buttons: {
        Proceed: function (this: Element) {
          processFeatureRegeneration(event, button);
          $(this).dialog("close");
        },
        Cancel: function (this: Element) {
          $(this).dialog("close");
        }
      },
      open: function (this: Element) {
        const checkbox =
          '<span><input id="dontAsk" class="checkbox" type="checkbox"><label for="dontAsk" class="checkbox-label dontAsk"><i>do not ask again</i></label><span>';
        const pane = (this as HTMLElement).parentElement!.querySelector(".ui-dialog-buttonpane")!;
        pane.insertAdjacentHTML("afterbegin", checkbox);
      },
      close: function (this: Element) {
        const box = (this as HTMLElement).parentElement!.querySelector<HTMLInputElement>(".checkbox");
        if (box?.checked) sessionStorage.setItem("regenerateFeatureDontAsk", "true");
        $(this).dialog("destroy");
      }
    });
  }

  if (button === "configRegenerateMarkers") configMarkersGeneration();

  if (button === "addLabel") toggleAddLabel();
  else if (button === "addBurgTool") toggleAddBurg();
  else if (button === "addRiver") toggleAddRiver();
  else if (button === "addRoute") createRoute();
  else if (button === "addMarker") toggleAddMarker();
  else if (button === "openSubmapTool") openSubmapTool?.();
  else if (button === "openTransformTool") openTransformTool?.();
});

// ─── Regeneration dispatcher ──────────────────────────────────────────────────

function processFeatureRegeneration(event: MouseEvent, button: string): void {
  if (button === "regenerateStateLabels") {
    $("#labels").fadeIn();
    drawStateLabels();
  } else if (button === "regenerateReliefIcons") {
    drawReliefIcons();
    if (!layerIsOn("toggleRelief")) toggleRelief();
  } else if (button === "regenerateRoutes") {
    regenerateRoutes();
    if (!layerIsOn("toggleRoutes")) toggleRoutes();
  } else if (button === "regenerateRivers") regenerateRivers();
  else if (button === "regeneratePopulation") recalculatePopulation();
  else if (button === "regenerateStates") regenerateStates();
  else if (button === "regenerateProvinces") regenerateProvinces();
  else if (button === "regenerateBurgs") regenerateBurgs();
  else if (button === "regenerateEmblems") regenerateEmblems();
  else if (button === "regenerateReligions") regenerateReligions();
  else if (button === "regenerateCultures") regenerateCultures();
  else if (button === "regenerateMilitary") regenerateMilitary();
  else if (button === "regenerateIce") regenerateIce();
  else if (button === "regenerateMarkers") regenerateMarkers();
  else if (button === "regenerateZones") regenerateZones(event);
}

// ─── Emblem editor opener ────────────────────────────────────────────────────

async function openEmblemEditor(): Promise<void> {
  let type: string, id: string, el: any;

  const firstState = pack.states.find((s: any) => s.i && !s.removed && s.coa);
  const firstBurg = pack.burgs.find((b: any) => b.i && !b.removed && b.coa);

  if (firstState) {
    type = "state";
    id = `stateCOA${firstState.i}`;
    el = firstState;
  } else if (firstBurg) {
    type = "burg";
    id = `burgCOA${firstBurg.i}`;
    el = firstBurg;
  } else {
    tip("No emblems to edit, please generate states and burgs first", false, "error");
    return;
  }

  await COArenderer.trigger(id, el.coa);
  editEmblem?.(type as any, id, el);
}

// ─── Regenerate functions ─────────────────────────────────────────────────────

function regenerateRoutes(): void {
  const locked = pack.routes
    .filter((route: any) => route.lock)
    .map((route: any, index: number) => ({ ...route, i: index }));
  Routes.generate(getWorldState(), locked);

  routes.selectAll("path").remove();
  if (layerIsOn("toggleRoutes")) drawRoutes();
}

function regenerateRivers(): void {
  const state = getWorldState();
  Rivers.generate(state);
  Rivers.specify(state);
  Features.defineGroups();
  (Lakes as any).defineNames(state);
  if (layerIsOn("toggleRivers")) drawRivers();
}

function recalculatePopulation(): void {
  (window as any).rankCells();

  pack.burgs.forEach((b: any) => {
    if (!b.i || b.removed || b.lock) return;
    const i = b.cell;
    b.population = rn(Math.max(pack.cells.s[i] / 8 + b.i / 1000 + (i % 100) / 1000, 0.1), 3);
    if (b.capital) b.population = b.population * 1.3;
    if (b.port) b.population = b.population * 1.3;
    b.population = rn(b.population * gauss(2, 3, 0.6, 20, 3), 3);
  });

  layerIsOn("togglePopulation") ? drawPopulation() : togglePopulation();
}

function regenerateStates(): void {
  const newStates = recreateStates();
  if (!newStates) return;

  pack.states = newStates;
  const state = getWorldState();
  States.expandStates();
  States.normalize();
  States.getPoles(state);
  States.findNeighbors();
  States.collectStatistics(state);
  States.assignColors();
  States.generateCampaigns();
  States.generateDiplomacy();
  States.defineStateForms(state);

  Provinces.generate(state, true);
  Provinces.getPoles(state);

  layerIsOn("toggleStates") ? drawStates() : toggleStates();
  layerIsOn("toggleBorders") ? drawBorders() : toggleBorders();
  if (layerIsOn("toggleProvinces")) drawProvinces();

  drawStateLabels();
  Military.generate(state);
  if (layerIsOn("toggleEmblems")) drawEmblems();

  if (ensureEl("burgsOverviewRefresh").offsetParent) ensureEl<HTMLButtonElement>("burgsOverviewRefresh").click();
  if (document.getElementById("statesEditorRefresh")?.offsetParent)
    (document.getElementById("statesEditorRefresh") as HTMLButtonElement).click();
  if (ensureEl("militaryOverviewRefresh").offsetParent) ensureEl<HTMLButtonElement>("militaryOverviewRefresh").click();
}

function recreateStates(): any[] | null {
  const localSeed = generateSeed();
  (Math as any).random = (window as any).aleaPRNG(localSeed);

  const statesCount = +ensureEl<HTMLInputElement>("statesNumber").value;
  if (!statesCount) {
    tip(`<i>States Number</i> option value is zero. No counties are generated`, false, "error");
    return null;
  }

  const validBurgs = pack.burgs.filter((b: any) => b.i && !b.removed);
  if (!validBurgs.length) {
    tip("There are no any burgs to generate states. Please create burgs first", false, "error");
    return null;
  }

  if (validBurgs.length < statesCount) {
    tip(
      `Not enough burgs to generate ${statesCount} states. Will generate only ${validBurgs.length} states`,
      false,
      "warn"
    );
  }

  const validStates = pack.states.filter((s: any) => s.i && !s.removed);
  const lockedStates = validStates.filter((s: any) => s.lock);
  const lockedStatesIds = lockedStates.map((s: any) => s.i);
  const lockedStatesCapitals = lockedStates.map((s: any) => s.capital);

  if (validStates.length && lockedStates.length === validStates.length) {
    tip("Unable to regenerate as all states are locked", false, "error");
    return null;
  }

  for (const burg of validBurgs as any[]) {
    if (burg.capital) {
      if (lockedStatesCapitals.includes(burg.i)) continue;
      burg.capital = 0;
      Burgs.changeGroup(burg);
    }
  }

  for (const state of pack.states as any[]) {
    if (!state.i || state.removed || state.lock) continue;
    document.getElementById(`stateLabel${state.i}`)?.remove();
    document.getElementById(`textPath_stateLabel${state.i}`)?.remove();
    document.getElementById(`stateCOA${state.i}`)?.remove();
    document.querySelector(`#stateEmblems > use[data-i="${state.i}"]`)?.remove();

    for (const provinceId of state.provinces) {
      document.getElementById(`provinceCOA${provinceId}`)?.remove();
      document.querySelector(`#provinceEmblems > use[data-i="${provinceId}"]`)?.remove();
      pack.provinces[provinceId].removed = true;
    }
  }

  unfog("");

  const sortedBurgs = (validBurgs as any[])
    .filter((b: any) => !lockedStatesIds.includes(b.state))
    .map((b: any) => [b, b.population * Math.random()])
    .sort((a: any[], b: any[]) => b[1] - a[1])
    .map((b: any[]) => b[0]);

  const count = Math.min(statesCount, validBurgs.length) + 1;
  let spacing = (graphWidth + graphHeight) / 2 / count;

  const capitalsTree = quadtree<[number, number]>()
    .x(d => d[0])
    .y(d => d[1]);
  const isTooClose = (x: number, y: number, sp: number) => Boolean(capitalsTree.find(x, y, sp));

  const newStates: any[] = [{ i: 0, name: pack.states[0].name }];

  lockedStates.forEach((state: any) => {
    const newId = newStates.length;
    const { x, y } = pack.burgs[state.capital] as any;
    capitalsTree.add([x, y]);

    document.getElementById(`textPath_stateLabel${state.i}`)?.setAttribute("id", `textPath_stateLabel${newId}`);
    const $label = document.getElementById(`stateLabel${state.i}`);
    if ($label) {
      $label.setAttribute("id", `stateLabel${newId}`);
      const $textPath = $label.querySelector("textPath");
      if ($textPath) {
        $textPath.removeAttribute("href");
        $textPath.setAttribute("href", `#textPath_stateLabel${newId}`);
      }
    }

    document.getElementById(`stateCOA${state.i}`)?.setAttribute("id", `stateCOA${newId}`);
    document.querySelector(`#stateEmblems > use[data-i="${state.i}"]`)?.setAttribute("data-i", String(newId));

    state.provinces.forEach((provinceId: number) => {
      if (!pack.provinces[provinceId]) return;
      pack.provinces[provinceId].state = newId;
    });

    state.i = newId;
    newStates.push(state);
  });

  for (const i of pack.cells.i as number[]) {
    const stateId = pack.cells.state[i];
    const lockedStateIndex = lockedStatesIds.indexOf(stateId) + 1;
    pack.cells.state[i] = lockedStateIndex;
  }

  for (let i = newStates.length; i < count; i++) {
    let capital: any = null;

    for (const burg of sortedBurgs) {
      const { x, y } = burg;
      if (!isTooClose(x, y, spacing)) {
        burg.capital = 1;
        capital = burg;
        capitalsTree.add([x, y]);
        Burgs.changeGroup(capital);
        break;
      }
      spacing = Math.max(spacing - 1, 1);
    }

    if (!capital) break;

    const culture = capital.culture;
    const basename =
      capital.name.length < 9 && capital.cell % 5 === 0
        ? capital.name
        : (Names as any).getCulture(culture, 3, 6, "", 0);
    const name = Names.getState(basename, culture);
    const nomadic = [1, 2, 3, 4].includes(pack.cells.biome[capital.cell]);
    const type = nomadic
      ? "Nomadic"
      : pack.cultures[culture].type === "Nomadic"
        ? "Generic"
        : pack.cultures[culture].type;
    const expansionism = rn(Math.random() * +ensureEl<HTMLInputElement>("sizeVariety").value + 1, 1);
    const cultureType = pack.cultures[culture].type;
    const coa = COA.generate(capital.coa, 0.3, null, cultureType ?? "Generic");
    coa.shield = capital.coa.shield;
    newStates.push({ i, name, type, capital: capital.i, center: capital.cell, culture, expansionism, coa });
  }

  return newStates;
}

function regenerateProvinces(): void {
  unfog("");
  const state = getWorldState();
  Provinces.generate(state, true, true);
  Provinces.getPoles(state);

  if (layerIsOn("toggleBorders")) drawBorders();
  layerIsOn("toggleProvinces") ? drawProvinces() : toggleProvinces();

  document.querySelectorAll("[id^=provinceCOA]").forEach(el => {
    el.remove();
  });
  emblems.selectAll("use").remove();
  if (layerIsOn("toggleEmblems")) drawEmblems();
  refreshAllEditors();
}

function regenerateBurgs(): void {
  const { cells, burgs: packBurgs, states, provinces } = pack as any;

  (window as any).rankCells();

  notes = notes.filter((note: any) => {
    if (note.id.startsWith("burg")) {
      const burgId = +note.id.slice(4);
      return packBurgs[burgId]?.lock;
    }
    return true;
  });

  const newBurgs: any[] = [0];
  const burgsTree = quadtree<[number, number]>()
    .x(d => d[0])
    .y(d => d[1]);

  cells.burg = new Uint16Array(cells.i.length);
  states
    .filter((s: any) => s.i)
    .forEach((s: any) => {
      s.capital = 0;
    });
  provinces
    .filter((p: any) => p.i)
    .forEach((p: any) => {
      p.burg = 0;
    });

  const lockedburgs = packBurgs.filter((burg: any) => burg.i && !burg.removed && burg.lock);
  for (let j = 0; j < lockedburgs.length; j++) {
    const lockedBurg = lockedburgs[j];
    const newId = newBurgs.length;

    const noteIndex = notes.findIndex((note: any) => note.id === `burg${lockedBurg.i}`);
    if (noteIndex !== -1) notes[noteIndex].id = `burg${newId}`;

    lockedBurg.i = newId;
    newBurgs.push(lockedBurg);
    burgsTree.add([lockedBurg.x, lockedBurg.y]);
    cells.burg[lockedBurg.cell] = newId;

    if (lockedBurg.capital) {
      const stateId = lockedBurg.state;
      states[stateId].capital = newId;
      states[stateId].center = lockedBurg.cell;
    }
  }

  const score = new Int16Array(cells.s.map((s: number) => s * Math.random()));
  const sorted = cells.i
    .filter((i: number) => score[i] > 0 && cells.culture[i])
    .sort((a: number, b: number) => score[b] - score[a]);
  const existingStatesCount = states.filter((s: any) => s.i && !s.removed).length;
  const manorsInputEl = ensureEl<HTMLInputElement>("manorsInput");
  const burgsCount =
    (manorsInputEl.value === "1000"
      ? rn(sorted.length / 5 / (grid.points.length / 10000) ** 0.8)
      : +manorsInputEl.value) + existingStatesCount;
  const burgSpacing = (graphWidth + graphHeight) / 150 / (burgsCount ** 0.7 / 66);

  for (let i = 0; i < sorted.length && newBurgs.length < burgsCount; i++) {
    const id = newBurgs.length;
    const cell = sorted[i];
    const [x, y] = cells.p[cell] as [number, number];

    const s = burgSpacing * gauss(1, 0.3, 0.2, 2, 2);
    if (burgsTree.find(x, y, s) !== undefined) continue;

    const stateId = cells.state[cell];
    const capital = stateId && !states[stateId].capital;
    if (capital) {
      states[stateId].capital = id;
      states[stateId].center = cell;
    }

    const culture = cells.culture[cell];
    const name = Names.getCulture(culture);
    newBurgs.push({ cell, x, y, state: stateId, i: id, culture, name, capital, feature: cells.f[cell] });
    burgsTree.add([x, y]);
    cells.burg[cell] = id;
  }

  pack.burgs = newBurgs;
  Burgs.shift();

  states
    .filter((s: any) => s.i && !s.removed && !s.capital)
    .forEach((s: any) => {
      const [x, y] = cells.p[s.center] as [number, number];
      const burgId = Burgs.add([x, y]);
      s.capital = burgId;
      s.center = pack.burgs[burgId].cell;
      const burg = pack.burgs[burgId] as any;
      burg.state = s.i;
      burg.capital = 1;
      Burgs.changeGroup(burg);
    });

  Burgs.specify(getWorldState());
  regenerateRoutes();
  drawBurgIcons();
  drawBurgLabels();

  document.querySelectorAll("[id^=burgCOA]").forEach(el => {
    el.remove();
  });
  emblems.selectAll("use").remove();
  if (layerIsOn("toggleEmblems")) drawEmblems();

  if (ensureEl("burgsOverviewRefresh").offsetParent) ensureEl<HTMLButtonElement>("burgsOverviewRefresh").click();
  if (document.getElementById("statesEditorRefresh")?.offsetParent)
    (document.getElementById("statesEditorRefresh") as HTMLButtonElement).click();
}

function regenerateEmblems(): void {
  document.querySelectorAll("[id^=stateCOA]").forEach(el => {
    el.remove();
  });
  document.querySelectorAll("[id^=provinceCOA]").forEach(el => {
    el.remove();
  });
  document.querySelectorAll("[id^=burgCOA]").forEach(el => {
    el.remove();
  });
  emblems.selectAll("use").remove();

  pack.states.forEach((state: any) => {
    if (!state.i || state.removed) return;
    const cultureType = pack.cultures[state.culture].type;
    state.coa = COA.generate(null, 0, null, cultureType ?? "Generic");
    state.coa.shield = COA.getShield(state.culture);
  });

  pack.burgs.forEach((burg: any) => {
    if (!burg.i || burg.removed) return;
    const state = pack.states[burg.state];
    let kinship = state ? 0.25 : 0;
    if (burg.capital) kinship += 0.1;
    else if (burg.port) kinship -= 0.1;
    if (state && burg.culture !== state.culture) kinship -= 0.25;
    burg.coa = COA.generate(state ? state.coa : null, kinship, null, burg.type);
    burg.coa.shield = COA.getShield(burg.culture, state ? burg.state : 0);
  });

  pack.provinces.forEach((province: any) => {
    if (!province.i || province.removed) return;
    const parent = province.burg ? pack.burgs[province.burg] : pack.states[province.state];
    let dominion = false;

    if (!province.burg) {
      dominion = P(0.2);
      if (province.formName === "Colony") dominion = P(0.95);
      else if (province.formName === "Island") dominion = P(0.6);
      else if (province.formName === "Islands") dominion = P(0.5);
      else if (province.formName === "Territory") dominion = P(0.4);
      else if (province.formName === "Land") dominion = P(0.3);
    }

    const nameByBurg = province.burg && province.name.slice(0, 3) === (parent as any).name.slice(0, 3);
    const kinship = dominion ? 0 : nameByBurg ? 0.8 : 0.4;
    const culture = pack.cells.culture[province.center];
    const type = Burgs.getType(province.center, (parent as any).port);
    province.coa = COA.generate((parent as any).coa, kinship, dominion as any, type);
    province.coa.shield = COA.getShield(culture, province.state);
  });

  layerIsOn("toggleEmblems") ? drawEmblems() : toggleEmblems();
}

function regenerateReligions(): void {
  Religions.generate(getWorldState());
  layerIsOn("toggleReligions") ? drawReligions() : toggleReligions();
  refreshAllEditors();
}

function regenerateCultures(): void {
  const state = getWorldState();
  Cultures.generate(state);
  Cultures.expand(state);

  pack.states = pack.states.map((st: any) => {
    if (!st.i || st.removed) return st;
    return { ...st, culture: pack.cells.culture[st.center] };
  });

  pack.burgs = pack.burgs.map((burg: any) => {
    if (!burg.i || burg.removed) return burg;
    return { ...burg, culture: pack.cells.culture[burg.cell] };
  });

  pack.religions = pack.religions.map((religion: any) => {
    if (!religion.i || religion.removed) return religion;
    return { ...religion, culture: pack.cells.culture[religion.center] };
  });

  layerIsOn("toggleCultures") ? drawCultures() : toggleCultures();
  refreshAllEditors();
}

function regenerateMilitary(): void {
  Military.generate(getWorldState());
  if (layerIsOn("toggleMilitary")) drawMilitary();
  else toggleMilitary();
  if (ensureEl("militaryOverviewRefresh").offsetParent) ensureEl<HTMLButtonElement>("militaryOverviewRefresh").click();
}

function regenerateIce(): void {
  if (!layerIsOn("toggleIce")) toggleIce();
  Ice.generate(getWorldState());
  drawIce();
}

function regenerateMarkers(): void {
  Markers.regenerate();
  turnButtonOn("toggleMarkers");
  drawMarkers();
  const markersOverviewRefreshEl = document.getElementById("markersOverviewRefresh") as HTMLButtonElement | null;
  if (markersOverviewRefreshEl?.offsetParent) markersOverviewRefreshEl.click();
}

function regenerateZones(event: MouseEvent): void {
  if (isCtrlClick(event)) {
    (window as any).prompt(
      "Please provide zones number multiplier",
      { default: 1, step: 0.01, min: 0, max: 100 },
      (v: number) => addNumberOfZones(v)
    );
  } else {
    addNumberOfZones(gauss(1, 0.5, 0.6, 5, 2));
  }

  function addNumberOfZones(number: number) {
    Zones.generate(getWorldState(), number);
    if (ensureEl("zonesEditorRefresh").offsetParent) ensureEl<HTMLButtonElement>("zonesEditorRefresh").click();
    if (layerIsOn("toggleZones")) drawZones();
  }
}

// ─── Add/toggle feature tools ─────────────────────────────────────────────────

function unpressClickToAddButton(): void {
  document
    .getElementById("addFeature")!
    .querySelectorAll<HTMLButtonElement>("button.pressed")
    .forEach(b => {
      b.classList.remove("pressed");
    });
  restoreDefaultEvents!();
  clearMainTip();
}

function toggleAddLabel(): void {
  const addLabelBtn = ensureEl("addLabel");
  if (addLabelBtn.classList.contains("pressed")) {
    unpressClickToAddButton();
    return;
  }

  document
    .getElementById("addFeature")!
    .querySelectorAll<HTMLButtonElement>("button.pressed")
    .forEach(b => {
      b.classList.remove("pressed");
    });
  addLabelBtn.classList.add("pressed");
  closeDialogs(".stable");
  viewbox.style("cursor", "crosshair").on("click", addLabelOnClick as any);
  tip("Click on map to place label. Hold Shift to add multiple", true);
  if (!layerIsOn("toggleLabels")) toggleLabels();
}

function addLabelOnClick(this: SVGElement, event: MouseEvent): void {
  const point = pointer(event, this);

  const cell = findCell(point[0], point[1]);
  const culture = pack.cells.culture[cell];
  const name = Names.getCulture(culture);
  const id = getNextId("label");

  const lastSelected = ensureEl<HTMLSelectElement>("labelGroupSelect").value;
  const groupId = ["", "states", "burgLabels"].includes(lastSelected) ? "#addedLabels" : `#${lastSelected}`;

  let group: any = labels.select(groupId);
  if (!group.size()) {
    group = labels
      .append("g")
      .attr("id", "addedLabels")
      .attr("fill", "#3e3e4b")
      .attr("opacity", 1)
      .attr("stroke", "#3a3a3a")
      .attr("stroke-width", 0)
      .attr("font-family", "Almendra SC")
      .attr("font-size", 18)
      .attr("data-size", 18)
      .attr("filter", null);
  }

  const example = group.append("text").attr("x", 0).attr("y", 0).text(name);
  const width = (example.node() as SVGTextElement).getBBox().width;
  example.remove();

  group.classed("hidden", false);
  group
    .append("text")
    .attr("text-rendering", "optimizeSpeed")
    .attr("id", id)
    .append("textPath")
    .attr("text-rendering", "optimizeSpeed")
    .attr("xlink:href", `#textPath_${id}`)
    .attr("startOffset", "50%")
    .attr("font-size", "100%")
    .append("tspan")
    .attr("x", 0)
    .text(name);

  defs
    .select("#textPaths")
    .append("path")
    .attr("id", `textPath_${id}`)
    .attr("d", `M${point[0] - width},${point[1]} h${width * 2}`);

  if (!event.shiftKey) unpressClickToAddButton();
}

function toggleAddBurg(): void {
  unpressClickToAddButton();
  ensureEl("addBurgTool").classList.add("pressed");
  overviewBurgs();
  ensureEl("addNewBurg").click();
}

function toggleAddRiver(): void {
  const addRiverBtn = ensureEl("addRiver");
  const addNewRiverEl = ensureEl("addNewRiver");

  if (addRiverBtn.classList.contains("pressed")) {
    unpressClickToAddButton();
    addNewRiverEl.classList.remove("pressed");
    return;
  }

  document
    .getElementById("addFeature")!
    .querySelectorAll<HTMLButtonElement>("button.pressed")
    .forEach(b => {
      b.classList.remove("pressed");
    });
  addRiverBtn.classList.add("pressed");
  addNewRiverEl.classList.add("pressed");
  closeDialogs(".stable");
  viewbox.style("cursor", "crosshair").on("click", addRiverOnClick as any);
  tip("Click on map to place new river or extend an existing one. Hold Shift to place multiple rivers", true, "warn");
  if (!layerIsOn("toggleRivers")) toggleRivers();
}

function addRiverOnClick(this: SVGElement, event: MouseEvent): void {
  const { cells, rivers: packRivers } = pack as any;
  const point = pointer(event, this);
  let i = findCell(point[0], point[1]);

  if (cells.r[i]) {
    tip("There is already a river here", false, "error");
    return;
  }
  if (cells.h[i] < 20) {
    tip("Cannot create river in water cell", false, "error");
    return;
  }
  if (cells.b[i]) return;

  const riverCells: number[] = [];
  let riverId = Rivers.getNextId(packRivers);
  let parent = riverId;

  const initialFlux = grid.cells.prec[cells.g[i]];
  cells.fl[i] = initialFlux;

  const h = Rivers.alterHeights();
  Rivers.resolveDepressions(h);

  while (i) {
    cells.r[i] = riverId;
    riverCells.push(i);

    const min = cells.c[i].sort((a: number, b: number) => h[a] - h[b])[0];
    if (h[i] <= h[min]) {
      tip(`Cell ${i} is depressed, river cannot flow further`, false, "error");
      return;
    }

    if (h[min] < 20) {
      riverCells.push(min);
      const feature = pack.features[cells.f[min]] as any;
      if (feature.type === "lake") {
        if (feature.outlet) parent = feature.outlet;
        if (feature.inlets) {
          feature.inlets.push(riverId);
        } else {
          feature.inlets = [riverId];
        }
      }
      break;
    }

    if (cells.b[min]) {
      cells.fl[min] += cells.fl[i];
      riverCells.push(-1);
      break;
    }

    if (!cells.r[min]) {
      cells.fl[min] += cells.fl[i];
      i = min;
      continue;
    }

    const oldRiverId = cells.r[min];
    const oldRiver = packRivers.find((river: any) => river.i === oldRiverId);
    const oldRiverCells: number[] = oldRiver?.cells || cells.i.filter((ci: number) => cells.r[ci] === oldRiverId);
    const oldRiverCellsUpper = oldRiverCells.filter((ci: number) => h[ci] > h[min]);

    if (riverCells.length <= oldRiverCellsUpper.length) {
      cells.conf[min] += cells.fl[i];
      riverCells.push(min);
      parent = oldRiverId;
      break;
    }

    document.getElementById(`river${oldRiverId}`)?.remove();
    riverCells.forEach((ci: number) => {
      cells.r[ci] = oldRiverId;
    });
    oldRiverCells.forEach((cell: number) => {
      if (h[cell] > h[min]) {
        cells.r[cell] = 0;
        cells.fl[cell] = grid.cells.prec[cells.g[cell]];
      } else {
        riverCells.push(cell);
        cells.fl[cell] += cells.fl[i];
      }
    });
    riverId = oldRiverId;
    break;
  }

  const river = packRivers.find((r: any) => r.i === riverId);
  const source = riverCells[0];
  const mouth = riverCells[riverCells.length - 2];

  const defaultWidthFactor = rn(1 / (pointsInput.dataset.cells ? +pointsInput.dataset.cells / 10000 : 1) ** 0.25, 2);
  const widthFactor =
    river?.widthFactor || (!parent || parent === riverId ? defaultWidthFactor * 1.2 : defaultWidthFactor);
  const sourceWidth = river?.sourceWidth || Rivers.getSourceWidth(cells.fl[source]);
  const meanderedPoints = Rivers.addMeandering(riverCells);

  const discharge = cells.fl[mouth];
  const length = Rivers.getApproximateLength(meanderedPoints as any);
  const width = Rivers.getWidth(
    Rivers.getOffset({ flux: discharge, pointIndex: meanderedPoints.length, widthFactor, startingWidth: sourceWidth })
  );

  if (river) {
    river.source = source;
    river.length = length;
    river.discharge = discharge;
    river.width = width;
    river.cells = riverCells;
  } else {
    const basin = Rivers.getBasin(parent);
    const name = Rivers.getName(mouth);
    const type = Rivers.getType({ i: riverId, length, parent } as any);
    packRivers.push({
      i: riverId,
      source,
      mouth,
      discharge,
      length,
      width,
      widthFactor,
      sourceWidth,
      parent,
      cells: riverCells,
      basin,
      name,
      type
    });
  }

  const path = Rivers.getRiverPath(meanderedPoints as any, widthFactor, sourceWidth);
  const id = `river${riverId}`;
  const riversG = viewbox.select("#rivers");
  riversG.append("path").attr("id", id).attr("d", path);

  if (!event.shiftKey) {
    (Lakes as any).cleanupLakeData();
    unpressClickToAddButton();
    ensureEl("addNewRiver").classList.remove("pressed");
    const riversOverviewRefreshEl = document.getElementById("riversOverviewRefresh") as HTMLButtonElement | null;
    if (riversOverviewRefreshEl?.offsetParent) riversOverviewRefreshEl.click();
  }
}

function toggleAddMarker(): void {
  const addMarkerBtn = ensureEl("addMarker");
  if (addMarkerBtn.classList.contains("pressed")) {
    unpressClickToAddButton();
    return;
  }

  document
    .getElementById("addFeature")!
    .querySelectorAll<HTMLButtonElement>("button.pressed")
    .forEach(b => {
      b.classList.remove("pressed");
    });
  addMarkerBtn.classList.add("pressed");
  const markersAddFromOverviewEl = document.getElementById("markersAddFromOverview");
  if (markersAddFromOverviewEl) markersAddFromOverviewEl.classList.add("pressed");

  viewbox.style("cursor", "crosshair").on("click", addMarkerOnClick as any);
  tip("Click on map to add a marker. Hold Shift to add multiple", true);
  if (!layerIsOn("toggleMarkers")) toggleMarkers();
}

function addMarkerOnClick(this: SVGElement, event: MouseEvent): void {
  const { markers: packMarkers } = pack as any;
  const point = pointer(event, this);
  const x = rn(point[0], 2);
  const y = rn(point[1], 2);
  const cell = findCell(point[0], point[1]);

  const isMarkerSelected = packMarkers.length && (elSelected as any)?.node()?.parentElement?.id === "markers";
  const selectedMarker = isMarkerSelected
    ? packMarkers.find((marker: any) => marker.i === +(elSelected as any).attr("id").slice(6))
    : null;

  const selectedType = ensureEl<HTMLInputElement>("addedMarkerType").value;
  const selectedConfig = Markers.getConfig().find(({ type }: any) => type === selectedType);
  const baseMarker = selectedMarker || selectedConfig || { icon: "❓" };
  const marker = Markers.add({ ...baseMarker, x, y, cell });

  if (selectedConfig?.add) {
    selectedConfig.add(`marker${marker.i}`, cell);
  }

  const markersElement = ensureEl("markers");
  const rescale = +markersElement.getAttribute("rescale")!;
  markersElement.insertAdjacentHTML("beforeend", (window as any).drawMarker(marker, rescale));

  if (!event.shiftKey) {
    document.getElementById("markerAdd")?.classList.remove("pressed");
    document.getElementById("markersAddFromOverview")?.classList.remove("pressed");
    unpressClickToAddButton();
  }
}

// ─── Markers config ───────────────────────────────────────────────────────────

function configMarkersGeneration(): void {
  drawConfigTable();

  function drawConfigTable() {
    const config = Markers.getConfig();

    const headers = `<thead style='font-weight:bold'><tr>
      <td data-tip="Marker type name">Type</td>
      <td data-tip="Marker icon">Icon</td>
      <td data-tip="Marker number multiplier">Multiplier</td>
      <td data-tip="Number of markers of that type on the current map">Number</td>
    </tr></thead>`;

    const lines = config.map(({ type, icon, multiplier }: any) => {
      const isExternal = icon.startsWith("http") || icon.startsWith("data:image");
      return `<tr>
        <td><input class="type" value="${type}" /></td>
        <td style="position: relative">
          <img class="image" src="${isExternal ? icon : ""}" ${isExternal ? "" : "hidden"} style="width:1.2em; height:1.2em; vertical-align: middle;">
          <span class="emoji" style="font-size:1.2em">${isExternal ? "" : icon}</span>
          <button class="changeIcon icon-pencil"></button>
        </td>
        <td><input class="multiplier" type="number" min="0" max="100" step="0.1" value="${multiplier}" /></td>
        <td style="text-align:center">${(pack.markers as any[]).filter((marker: any) => marker.type === type).length}</td>
      </tr>`;
    });

    const table = `<table class="table">${headers}<tbody>${lines.join("")}</tbody></table>`;
    alertMessage.innerHTML = table;

    alertMessage.querySelectorAll<HTMLButtonElement>("button.changeIcon").forEach(selectIconButton => {
      selectIconButton.addEventListener("click", function () {
        const image = this.parentElement!.querySelector<HTMLImageElement>(".image")!;
        const emoji = this.parentElement!.querySelector<HTMLElement>(".emoji")!;
        const icon = image.getAttribute("src") || emoji.textContent!;

        selectIcon(icon, value => {
          const isExt = value.startsWith("http") || value.startsWith("data:image");
          image.setAttribute("src", isExt ? value : "");
          image.hidden = !isExt;
          emoji.textContent = isExt ? "" : value;
        });
      });
    });
  }

  const applyChanges = () => {
    const rows = alertMessage.querySelectorAll<HTMLTableRowElement>("tbody > tr");
    const rowsData = Array.from(rows).map(row => {
      const type = row.querySelector<HTMLInputElement>(".type")!.value;
      const image = row.querySelector<HTMLImageElement>(".image")!;
      const emoji = row.querySelector<HTMLElement>(".emoji")!;
      const icon = image.getAttribute("src") || emoji.textContent!;
      const multiplier = parseFloat(row.querySelector<HTMLInputElement>(".multiplier")!.value);
      return { type, icon, multiplier };
    });

    const config = Markers.getConfig();
    const newConfig = config.map((markerType: any, index: number) => {
      const { type, icon, multiplier } = rowsData[index];
      return { ...markerType, type, icon, multiplier };
    });
    Markers.setConfig(newConfig);
  };

  $("#alert").dialog({
    resizable: false,
    title: "Markers generation settings",
    position: { my: "left top", at: "left+10 top+10", of: "svg", collision: "fit" },
    buttons: {
      Regenerate: () => {
        applyChanges();
        regenerateMarkers();
        drawConfigTable();
      },
      Close: function (this: Element) {
        $(this).dialog("close");
      }
    },
    open: function () {
      const buttons = $(this).dialog("widget").find(".ui-dialog-buttonset > button");
      buttons[0].addEventListener("mousemove", () => tip("Apply changes and regenerate markers"));
      buttons[1].addEventListener("mousemove", () => tip("Close the window"));
    },
    close: function (this: Element) {
      $(this).dialog("destroy");
    }
  });
}

// ─── Cell details & overview dialogs ─────────────────────────────────────────

function viewCellDetails(): void {
  $("#cellInfo").dialog({
    resizable: false,
    width: "22em",
    title: "Cell Details",
    position: { my: "right top", at: "right-10 top+10", of: "svg", collision: "fit" }
  });
}

function overviewCharts(): void {
  openChartsOverview();
}

async function openMinimap(): Promise<void> {
  const url = `${import.meta.env.BASE_URL}modules/ui/minimap.js`;
  const Minimap = (await import(/* @vite-ignore */ url)) as { openMinimapDialog: () => void };
  Minimap.openMinimapDialog();
}

// ─── Global registration ───────────────────────────────────────────────────────

window.recalculatePopulation = recalculatePopulation;
window.regenerateRoutes = regenerateRoutes;
window.regenerateRivers = regenerateRivers;
window.regenerateStates = regenerateStates;
window.regenerateProvinces = regenerateProvinces;
window.regenerateBurgs = regenerateBurgs;
window.regenerateEmblems = regenerateEmblems;
window.regenerateReligions = regenerateReligions;
window.regenerateCultures = regenerateCultures;
window.regenerateMilitary = regenerateMilitary;
window.regenerateIce = regenerateIce;
window.regenerateMarkers = regenerateMarkers;
window.regenerateZones = regenerateZones;
window.openEmblemEditor = openEmblemEditor;
window.configMarkersGeneration = configMarkersGeneration;
window.viewCellDetails = viewCellDetails;
window.overviewCharts = overviewCharts;
window.openMinimap = openMinimap;
window.toggleAddLabel = toggleAddLabel;
window.toggleAddBurg = toggleAddBurg;
window.toggleAddRiver = toggleAddRiver;
window.toggleAddMarker = toggleAddMarker;
window.unpressClickToAddButton = unpressClickToAddButton;
