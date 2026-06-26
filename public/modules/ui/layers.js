// UI module stub to control map layers
"use strict";

let presets = {}; // global object
restoreCustomPresets(); // run on-load

function getDefaultPresets() {
  return {
    political: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleIce",
      "toggleLabels",
      "toggleLakes",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleStates",
      "toggleVignette"
    ],
    cultural: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleCultures",
      "toggleLabels",
      "toggleLakes",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleVignette"
    ],
    religions: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleLabels",
      "toggleLakes",
      "toggleReligions",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleVignette"
    ],
    provinces: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleLakes",
      "toggleProvinces",
      "toggleRivers",
      "toggleScaleBar",
      "toggleVignette"
    ],
    biomes: ["toggleBiomes", "toggleIce", "toggleLakes", "toggleRivers", "toggleScaleBar", "toggleVignette"],
    heightmap: ["toggleHeight", "toggleLakes", "toggleRivers", "toggleVignette"],
    physical: ["toggleCoordinates", "toggleHeight", "toggleIce", "toggleLakes", "toggleRivers", "toggleScaleBar", "toggleVignette"],
    poi: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleHeight",
      "toggleIce",
      "toggleLakes",
      "toggleMarkers",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleVignette"
    ],
    military: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleLabels",
      "toggleLakes",
      "toggleMilitary",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleStates",
      "toggleVignette"
    ],
    emblems: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleIce",
      "toggleEmblems",
      "toggleLakes",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleStates",
      "toggleVignette"
    ],
    landmass: ["toggleScaleBar"]
  };
}

function restoreCustomPresets() {
  presets = getDefaultPresets();
  const storedPresets = JSON.parse(localStorage.getItem("presets"));
  if (!storedPresets) return;

  for (const preset in storedPresets) {
    if (presets[preset]) continue;
    layersPreset.add(new Option(preset, preset));
  }

  presets = storedPresets;
}

// run on map generation
function applyLayersPreset() {
  const preset = localStorage.getItem("preset") || ensureEl("layersPreset").value;
  setLayersPreset(preset);

  const layers = presets[preset]; // layers to be turned on
  document.querySelectorAll("#mapLayers > li").forEach(el => {
    const shouldBeOn = layers.includes(el.id);
    if (shouldBeOn) el.classList.remove("buttonoff");
    else el.classList.add("buttonoff");
  });
}

function setLayersPreset(preset) {
  ensureEl("layersPreset").value = preset;
  localStorage.setItem("preset", preset);

  const isDefault = getDefaultPresets()[preset];
  ensureEl("removePresetButton").style.display = isDefault ? "none" : "inline-block";
  ensureEl("savePresetButton").style.display = "none";
}

// toggle layers on manual preset change
function handleLayersPresetChange(preset) {
  setLayersPreset(preset);

  const layers = presets[preset]; // layers to be turned on
  document.querySelectorAll("#mapLayers > li").forEach(el => {
    const isOn = layerIsOn(el.id);
    const shouldBeOn = layers.includes(el.id);
    if (shouldBeOn && !isOn) el.click();
    if (isOn && !shouldBeOn) el.click();
  });

  if (ensureEl("canvas3d")) setTimeout(() => ThreeD.update(), 400);
}

function savePreset() {
  prompt("Please provide a preset name", {default: ""}, preset => {
    presets[preset] = Array.from(ensureEl("mapLayers").querySelectorAll("li:not(.buttonoff)"))
      .map(node => node.id)
      .sort();
    layersPreset.add(new Option(preset, preset, false, true));
    localStorage.setItem("presets", JSON.stringify(presets));
    localStorage.setItem("preset", preset);
    removePresetButton.style.display = "inline-block";
    savePresetButton.style.display = "none";
  });
}

function removePreset() {
  const preset = layersPreset.value;
  delete presets[preset];
  const index = Array.from(layersPreset.options).findIndex(o => o.value === preset);
  layersPreset.options.remove(index);
  layersPreset.value = "custom";
  removePresetButton.style.display = "none";
  savePresetButton.style.display = "inline-block";

  localStorage.setItem("presets", JSON.stringify(presets));
  localStorage.removeItem("preset");
}

function getCurrentPreset() {
  const layers = Array.from(document.querySelectorAll("#mapLayers > li:not(.buttonoff)"))
    .map(node => node.id)
    .sort();

  for (const preset in presets) {
    if (JSON.stringify(presets[preset].sort()) === JSON.stringify(layers)) {
      layersPreset.value = preset;
      const isDefault = getDefaultPresets()[preset];
      removePresetButton.style.display = isDefault ? "none" : "inline-block";
      savePresetButton.style.display = "none";
      return;
    }
  }

  layersPreset.value = "custom";
  removePresetButton.style.display = "none";
  savePresetButton.style.display = "inline-block";
}

// run on each map generation
function drawLayers() {
  drawFeatures();
  if (layerIsOn("toggleTexture")) drawTexture();
  if (layerIsOn("toggleHeight")) drawHeightmap();
  if (layerIsOn("toggleBiomes")) drawBiomes();
  if (layerIsOn("toggleCells")) drawCells();
  if (layerIsOn("toggleGrid")) drawGrid();
  if (layerIsOn("toggleCoordinates")) drawCoordinates();
  if (layerIsOn("toggleCompass")) {
    if (!compass.select("use").size()) compass.append("use").attr("xlink:href", "#defs-compass-rose");
    compass.style("display", "block");
  }
  if (layerIsOn("toggleRivers")) drawRivers();
  if (layerIsOn("toggleRelief")) drawReliefIcons();
  if (layerIsOn("toggleReligions")) drawReligions();
  if (layerIsOn("toggleCultures")) drawCultures();
  if (layerIsOn("toggleStates")) drawStates();
  if (layerIsOn("toggleProvinces")) drawProvinces();
  if (layerIsOn("toggleZones")) drawZones();
  if (layerIsOn("toggleBorders")) drawBorders();
  if (layerIsOn("toggleRoutes")) drawRoutes();
  if (layerIsOn("toggleTemperature")) drawTemperature();
  if (layerIsOn("togglePopulation")) drawPopulation();
  if (layerIsOn("toggleIce")) drawIce();
  if (layerIsOn("togglePrecipitation")) drawPrecipitation();
  if (layerIsOn("toggleEmblems")) drawEmblems();
  if (layerIsOn("toggleLabels")) drawLabels();
  if (layerIsOn("toggleBurgIcons")) drawBurgIcons();
  if (layerIsOn("toggleMilitary")) drawMilitary();
  if (layerIsOn("toggleMarkers")) drawMarkers();
  if (layerIsOn("toggleRulers")) rulers.draw();
  // scale bar
  // vignette
}

function toggleHeight(event) {
  if (customization === 1) return tip("You cannot turn off the layer when heightmap is in edit mode", false, "error");

  const children = terrs.selectAll("#oceanHeights > *, #landHeights > *");
  if (!children.size()) {
    turnButtonOn("toggleHeight");
    drawHeightmap();
    if (event && isCtrlClick(event)) editStyle("terrs");
  } else {
    if (event && isCtrlClick(event)) return editStyle("terrs");
    turnButtonOff("toggleHeight");
    children.remove();
  }
}

function toggleTemperature(event) {
  if (!temperature.selectAll("*").size()) {
    turnButtonOn("toggleTemperature");
    drawTemperature();
    if (event && isCtrlClick(event)) editStyle("temperature");
  } else {
    if (event && isCtrlClick(event)) return editStyle("temperature");
    turnButtonOff("toggleTemperature");
    temperature.selectAll("*").remove();
  }
}

function toggleBiomes(event) {
  if (!biomes.selectAll("path").size()) {
    turnButtonOn("toggleBiomes");
    drawBiomes();
    if (event && isCtrlClick(event)) editStyle("biomes");
  } else {
    if (event && isCtrlClick(event)) return editStyle("biomes");
    biomes.selectAll("path").remove();
    turnButtonOff("toggleBiomes");
  }
}


function togglePrecipitation(event) {
  if (!prec.selectAll("circle").size()) {
    turnButtonOn("togglePrecipitation");
    drawPrecipitation();
    if (event && isCtrlClick(event)) editStyle("prec");
  } else {
    if (event && isCtrlClick(event)) return editStyle("prec");
    turnButtonOff("togglePrecipitation");
    const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
    prec.selectAll("text").attr("opacity", 1).transition(hide).attr("opacity", 0);
    prec.selectAll("circle").transition(hide).attr("r", 0).remove();
    prec.transition().delay(1000).style("display", "none");
  }
}


function togglePopulation(event) {
  if (!population.selectAll("line").size()) {
    turnButtonOn("togglePopulation");
    drawPopulation();
    if (event && isCtrlClick(event)) editStyle("population");
  } else {
    if (event && isCtrlClick(event)) return editStyle("population");
    turnButtonOff("togglePopulation");

    const isD3data = population.select("line").datum();
    if (!isD3data) {
      // just remove
      population.selectAll("line").remove();
    } else {
      // remove with animation
      const hide = d3.transition().duration(1000).ease(d3.easeSinIn);
      population
        .select("#rural")
        .selectAll("line")
        .transition(hide)
        .attr("y2", d => d[1])
        .remove();
      population
        .select("#urban")
        .selectAll("line")
        .transition(hide)
        .delay(1000)
        .attr("y2", d => d[1])
        .remove();
    }
  }
}


function toggleCells(event) {
  if (!cells.selectAll("path").size()) {
    turnButtonOn("toggleCells");
    drawCells();
    if (event && isCtrlClick(event)) editStyle("cells");
  } else {
    if (event && isCtrlClick(event)) return editStyle("cells");
    cells.selectAll("path").remove();
    turnButtonOff("toggleCells");
  }
}


function toggleIce(event) {
  if (!layerIsOn("toggleIce")) {
    turnButtonOn("toggleIce");
    $("#ice").fadeIn();
    if (!ice.selectAll("*").size()) drawIce();
    if (event && isCtrlClick(event)) editStyle("ice");
  } else {
    if (event && isCtrlClick(event)) return editStyle("ice");
    $("#ice").fadeOut();
    turnButtonOff("toggleIce");
  }
}

function toggleCultures(event) {
  const cultures = pack.cultures.filter(c => c.i && !c.removed);
  const empty = !cults.selectAll("path").size();
  if (empty && cultures.length) {
    turnButtonOn("toggleCultures");
    drawCultures();
    if (event && isCtrlClick(event)) editStyle("cults");
  } else {
    if (event && isCtrlClick(event)) return editStyle("cults");
    cults.selectAll("path").remove();
    turnButtonOff("toggleCultures");
  }
}


function toggleReligions(event) {
  const religions = pack.religions.filter(r => r.i && !r.removed);
  if (!relig.selectAll("path").size() && religions.length) {
    turnButtonOn("toggleReligions");
    drawReligions();
    if (event && isCtrlClick(event)) editStyle("relig");
  } else {
    if (event && isCtrlClick(event)) return editStyle("relig");
    relig.selectAll("path").remove();
    turnButtonOff("toggleReligions");
  }
}


function toggleStates(event) {
  if (!layerIsOn("toggleStates")) {
    turnButtonOn("toggleStates");
    drawStates();
    if (event && isCtrlClick(event)) editStyle("regions");
  } else {
    if (event && isCtrlClick(event)) return editStyle("regions");
    regions.selectAll("path").remove();
    turnButtonOff("toggleStates");
  }
}


function toggleBorders(event) {
  if (!layerIsOn("toggleBorders")) {
    turnButtonOn("toggleBorders");
    drawBorders();
    if (event && isCtrlClick(event)) editStyle("borders");
  } else {
    if (event && isCtrlClick(event)) return editStyle("borders");
    turnButtonOff("toggleBorders");
    borders.selectAll("path").remove();
  }
}

function toggleProvinces(event) {
  if (!layerIsOn("toggleProvinces")) {
    turnButtonOn("toggleProvinces");
    drawProvinces();
    if (event && isCtrlClick(event)) editStyle("provs");
  } else {
    if (event && isCtrlClick(event)) return editStyle("provs");
    provs.selectAll("*").remove();
    turnButtonOff("toggleProvinces");
  }
}


function toggleGrid(event) {
  if (!gridOverlay.selectAll("*").size()) {
    turnButtonOn("toggleGrid");
    drawGrid();
    calculateFriendlyGridSize();
    if (event && isCtrlClick(event)) editStyle("gridOverlay");
  } else {
    if (event && isCtrlClick(event)) return editStyle("gridOverlay");
    turnButtonOff("toggleGrid");
    gridOverlay.selectAll("*").remove();
  }
}


function toggleCoordinates(event) {
  if (!coordinates.selectAll("*").size()) {
    turnButtonOn("toggleCoordinates");
    drawCoordinates();
    if (event && isCtrlClick(event)) editStyle("coordinates");
  } else {
    if (event && isCtrlClick(event)) return editStyle("coordinates");
    turnButtonOff("toggleCoordinates");
    coordinates.selectAll("*").remove();
  }
}


function toggleCompass(event) {
  if (!layerIsOn("toggleCompass")) {
    turnButtonOn("toggleCompass");
    if (!compass.select("use").size()) compass.append("use").attr("xlink:href", "#defs-compass-rose");
    $("#compass").fadeIn();
    if (event && isCtrlClick(event)) editStyle("compass");
  } else {
    if (event && isCtrlClick(event)) return editStyle("compass");
    $("#compass").fadeOut();
    turnButtonOff("toggleCompass");
  }
}

function toggleRelief(event) {
  if (!layerIsOn("toggleRelief")) {
    turnButtonOn("toggleRelief");
    if (!terrain.selectAll("*").size()) drawReliefIcons();
    $("#terrain").fadeIn();
    if (event && isCtrlClick(event)) editStyle("terrain");
  } else {
    if (event && isCtrlClick(event)) return editStyle("terrain");
    $("#terrain").fadeOut();
    turnButtonOff("toggleRelief");
  }
}

function toggleLakes(event) {
  if (!layerIsOn("toggleLakes")) {
    turnButtonOn("toggleLakes");
    $("#lakes").fadeIn();
    if (event && isCtrlClick(event)) editStyle("lakes");
  } else {
    if (event && isCtrlClick(event)) return editStyle("lakes");
    $("#lakes").fadeOut();
    turnButtonOff("toggleLakes");
  }
}

function toggleTexture(event) {
  if (!layerIsOn("toggleTexture")) {
    turnButtonOn("toggleTexture");
    drawTexture();
    if (event && isCtrlClick(event)) editStyle("texture");
  } else {
    if (event && isCtrlClick(event)) return editStyle("texture");
    turnButtonOff("toggleTexture");
    texture.select("image").remove();
  }
}


function toggleRivers(event) {
  if (!layerIsOn("toggleRivers")) {
    turnButtonOn("toggleRivers");
    drawRivers();
    if (event && isCtrlClick(event)) editStyle("rivers");
  } else {
    if (event && isCtrlClick(event)) return editStyle("rivers");
    rivers.selectAll("*").remove();
    turnButtonOff("toggleRivers");
  }
}


function toggleRoutes(event) {
  if (!layerIsOn("toggleRoutes")) {
    turnButtonOn("toggleRoutes");
    drawRoutes();
    if (event && isCtrlClick(event)) editStyle("routes");
  } else {
    if (event && isCtrlClick(event)) return editStyle("routes");
    routes.selectAll("path").remove();
    turnButtonOff("toggleRoutes");
  }
}


function toggleMilitary(event) {
  if (!layerIsOn("toggleMilitary")) {
    turnButtonOn("toggleMilitary");
    drawMilitary();
    if (event && isCtrlClick(event)) editStyle("armies");
  } else {
    if (event && isCtrlClick(event)) return editStyle("armies");
    armies.selectAll("g").remove();
    turnButtonOff("toggleMilitary");
  }
}

function toggleMarkers(event) {
  if (!layerIsOn("toggleMarkers")) {
    turnButtonOn("toggleMarkers");
    drawMarkers();
    if (event && isCtrlClick(event)) editStyle("markers");
  } else {
    if (event && isCtrlClick(event)) return editStyle("markers");
    markers.html("");
    turnButtonOff("toggleMarkers");
  }
}

function toggleLabels(event) {
  if (!layerIsOn("toggleLabels")) {
    turnButtonOn("toggleLabels");
    $("#labels").fadeIn();
    // don't redraw labels as they are not stored in data yet
    if (labels.selectAll("text").size() === 0) drawLabels();
    if (event && isCtrlClick(event)) editStyle("labels");
  } else {
    if (event && isCtrlClick(event)) return editStyle("labels");
    turnButtonOff("toggleLabels");
    $("#labels").fadeOut();
  }
}

function drawLabels() {
  drawStateLabels();
  drawBurgLabels();
  invokeActiveZooming();
}

function toggleBurgIcons(event) {
  if (!layerIsOn("toggleBurgIcons")) {
    turnButtonOn("toggleBurgIcons");
    drawBurgIcons();
    if (event && isCtrlClick(event)) editStyle("burgIcons");
  } else {
    if (event && isCtrlClick(event)) return editStyle("burgIcons");
    turnButtonOff("toggleBurgIcons");
    icons.selectAll("circle, use").remove();
  }
}

function toggleRulers(event) {
  if (!layerIsOn("toggleRulers")) {
    turnButtonOn("toggleRulers");
    if (event && isCtrlClick(event)) editStyle("ruler");
    rulers.draw();
    ruler.style("display", null);
  } else {
    if (event && isCtrlClick(event)) return editStyle("ruler");
    turnButtonOff("toggleRulers");
    ruler.selectAll("*").remove();
    ruler.style("display", "none");
  }
}

function toggleScaleBar(event) {
  if (!layerIsOn("toggleScaleBar")) {
    turnButtonOn("toggleScaleBar");
    $("#scaleBar").fadeIn();
    if (event && isCtrlClick(event)) editStyle("scaleBar");
  } else {
    if (event && isCtrlClick(event)) return editStyle("scaleBar");
    $("#scaleBar").fadeOut();
    turnButtonOff("toggleScaleBar");
  }
}

function toggleZones(event) {
  if (!layerIsOn("toggleZones")) {
    turnButtonOn("toggleZones");
    drawZones();
    if (event && isCtrlClick(event)) editStyle("zones");
  } else {
    if (event && isCtrlClick(event)) return editStyle("zones");
    turnButtonOff("toggleZones");
    zones.selectAll("*").remove();
  }
}


function toggleEmblems(event) {
  if (!layerIsOn("toggleEmblems")) {
    turnButtonOn("toggleEmblems");
    if (!emblems.selectAll("use").size()) drawEmblems();
    $("#emblems").fadeIn();
    invokeActiveZooming();
    if (event && isCtrlClick(event)) editStyle("emblems");
  } else {
    if (event && isCtrlClick(event)) return editStyle("emblems");
    $("#emblems").fadeOut();
    turnButtonOff("toggleEmblems");
  }
}

function toggleVignette(event) {
  if (!layerIsOn("toggleVignette")) {
    turnButtonOn("toggleVignette");
    $("#vignette").fadeIn();
    if (event && isCtrlClick(event)) editStyle("vignette");
  } else {
    if (event && isCtrlClick(event)) return editStyle("vignette");
    $("#vignette").fadeOut();
    turnButtonOff("toggleVignette");
  }
}


function layerIsOn(el) {
  return ensureEl(el).classList.contains("buttonoff") ? false : true;
}

function turnButtonOff(el) {
  ensureEl(el).classList.add("buttonoff");
  getCurrentPreset();
}

function turnButtonOn(el) {
  ensureEl(el).classList.remove("buttonoff");
  getCurrentPreset();
}

// move layers on mapLayers dragging (jquery sortable)
$("#mapLayers").sortable({items: "li:not(.solid)", containment: "parent", cancel: ".solid", update: moveLayer});
function moveLayer(event, ui) {
  const el = getLayer(ui.item.attr("id"));
  if (!el) return;
  const prev = getLayer(ui.item.prev().attr("id"));
  const next = getLayer(ui.item.next().attr("id"));
  if (prev) el.insertAfter(prev);
  else if (next) el.insertBefore(next);
}

// define connection between option layer buttons and actual svg groups to move the element
function getLayer(id) {
  if (id === "toggleLakes") return $("#lakes");
  if (id === "toggleHeight") return $("#terrs");
  if (id === "toggleBiomes") return $("#biomes");
  if (id === "toggleCells") return $("#cells");
  if (id === "toggleGrid") return $("#gridOverlay");
  if (id === "toggleCoordinates") return $("#coordinates");
  if (id === "toggleCompass") return $("#compass");
  if (id === "toggleRivers") return $("#rivers");
  if (id === "toggleRelief") return $("#terrain");
  if (id === "toggleReligions") return $("#relig");
  if (id === "toggleCultures") return $("#cults");
  if (id === "toggleStates") return $("#regions");
  if (id === "toggleProvinces") return $("#provs");
  if (id === "toggleBorders") return $("#borders");
  if (id === "toggleRoutes") return $("#routes");
  if (id === "toggleTemperature") return $("#temperature");
  if (id === "togglePrecipitation") return $("#prec");
  if (id === "togglePopulation") return $("#population");
  if (id === "toggleIce") return $("#ice");
  if (id === "toggleTexture") return $("#texture");
  if (id === "toggleEmblems") return $("#emblems");
  if (id === "toggleLabels") return $("#labels");
  if (id === "toggleBurgIcons") return $("#icons");
  if (id === "toggleMarkers") return $("#markers");
  if (id === "toggleRulers") return $("#ruler");
}
