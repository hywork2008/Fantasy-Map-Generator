import { geoGraticule, geoOrthographic, geoPath, interpolateSpectral, range, scaleSequential, select } from "d3";
import { Biomes } from "../modules/biomes";
import { Features } from "../modules/features";
import { Lakes } from "../modules/lakes";
import { Rivers } from "../modules/river-generator";
import { drawBiomes, drawCoordinates, drawPrecipitation, drawRivers, drawTemperature } from "../renderers";
import { ensureEl, parseTransform, rn, round } from "../utils";

function editWorld(): void {
  if (customization) return;

  $("#worldConfigurator").dialog({
    title: "Configure World",
    resizable: false,
    width: "minmax(40em, 85vw)",
    buttons: { "Update world": updateWorld },
    open: function () {
      const checkbox = /* html */ `<div class="dontAsk" data-tip="Automatically update world on input changes and button clicks">
        <input id="wcAutoChange" class="checkbox" type="checkbox" checked />
        <label for="wcAutoChange" class="checkbox-label"><i>auto-apply changes</i></label>
      </div>`;
      const pane = (this as HTMLElement).parentElement!.querySelector(".ui-dialog-buttonpane");
      pane!.insertAdjacentHTML("afterbegin", checkbox);

      const button = (this as HTMLElement).parentElement!.querySelector(".ui-dialog-buttonset > button");
      (button as HTMLElement).on("mousemove", () => tip("Apply current settings to the map"));
    },
    close: function () {
      $(this).dialog("destroy");
    }
  });

  const globe = select("#globe");
  const projection = geoOrthographic().translate([100, 100]).scale(100);
  const path = geoPath(projection);

  updateInputValues();
  updateGlobeTemperature();
  updateGlobePosition();

  if (modules.editWorld) return;
  modules.editWorld = true;

  const graticule = geoGraticule();
  globe.select("#globeWindArrows").on("click", handleWindChange);
  globe.select("#globeGraticule").attr("d", round(path(graticule()) ?? "", 1));
  updateWindDirections();

  ensureEl("worldControls").on("input", handleControlsChange);
  ensureEl("restoreWinds").on("click", restoreDefaultWinds);
  ensureEl("wcWholeWorld").on("click", () => applyWorldPreset(100, 50));
  ensureEl("wcNorthern").on("click", () => applyWorldPreset(33, 25));
  ensureEl("wcTropical").on("click", () => applyWorldPreset(33, 50));
  ensureEl("wcSouthern").on("click", () => applyWorldPreset(33, 75));

  function updateInputValues(): void {
    ensureEl("temperatureEquatorInput").setAttribute("value", String(options.temperatureEquator));
    (ensureEl("temperatureEquatorOutput") as HTMLOutputElement).value = String(options.temperatureEquator);
    ensureEl("temperatureEquatorF").innerText = convertTemperature(options.temperatureEquator, "°F");

    ensureEl("temperatureNorthPoleInput").setAttribute("value", String(options.temperatureNorthPole));
    (ensureEl("temperatureNorthPoleOutput") as HTMLOutputElement).value = String(options.temperatureNorthPole);
    ensureEl("temperatureNorthPoleF").innerText = convertTemperature(options.temperatureNorthPole, "°F");

    ensureEl("temperatureSouthPoleInput").setAttribute("value", String(options.temperatureSouthPole));
    (ensureEl("temperatureSouthPoleOutput") as HTMLOutputElement).value = String(options.temperatureSouthPole);
    ensureEl("temperatureSouthPoleF").innerText = convertTemperature(options.temperatureSouthPole, "°F");
  }

  function handleControlsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const stored = target.dataset.stored!;
    (ensureEl(`${stored}Input`) as HTMLInputElement).value = target.value;
    (ensureEl(`${stored}Output`) as HTMLOutputElement).value = target.value;
    lock(stored);

    if (stored === "temperatureEquator") {
      options.temperatureEquator = Number(target.value);
      ensureEl("temperatureEquatorF").innerText = convertTemperature(options.temperatureEquator, "°F");
    } else if (stored === "temperatureNorthPole") {
      options.temperatureNorthPole = Number(target.value);
      ensureEl("temperatureNorthPoleF").innerText = convertTemperature(options.temperatureNorthPole, "°F");
    } else if (stored === "temperatureSouthPole") {
      options.temperatureSouthPole = Number(target.value);
      ensureEl("temperatureSouthPoleF").innerText = convertTemperature(options.temperatureSouthPole, "°F");
    }

    if ((ensureEl("wcAutoChange") as HTMLInputElement).checked) updateWorld();
  }

  function updateWorld(): void {
    updateGlobeTemperature();
    updateGlobePosition();
    calculateTemperatures();
    generatePrecipitation();
    const state = getWorldState();
    const heights = new Uint8Array(pack.cells.h);
    Rivers.generate(state);
    Rivers.specify(state);
    pack.cells.h = new Float32Array(heights);
    Biomes.define(state);
    Features.defineGroups();
    Lakes.defineNames(state);

    if (layerIsOn("toggleTemperature")) drawTemperature();
    if (layerIsOn("togglePrecipitation")) drawPrecipitation();
    if (layerIsOn("toggleBiomes")) drawBiomes();
    if (layerIsOn("toggleCoordinates")) drawCoordinates();
    if (layerIsOn("toggleRivers")) drawRivers();
    if (document.getElementById("canvas3d")) setTimeout(() => ThreeD.update(), 500);
  }

  function updateGlobePosition(): void {
    const size = +(ensureEl("mapSizeOutput") as HTMLOutputElement).value;
    const eqD = ((graphHeight / 2) * 100) / size;

    calculateMapCoordinates();
    const mc = mapCoordinates;
    const unit = distanceUnitInput.value;
    const meridian = toKilometer(eqD * 2 * distanceScale);
    ensureEl("mapSize").innerHTML = `${graphWidth}x${graphHeight}`;
    ensureEl("mapSizeFriendly").innerHTML =
      `${rn(graphWidth * distanceScale)}x${rn(graphHeight * distanceScale)} ${unit}`;
    ensureEl("meridianLength").innerHTML = String(rn(eqD * 2));
    ensureEl("meridianLengthFriendly").innerHTML = `${rn(eqD * 2 * distanceScale)} ${unit}`;
    ensureEl("meridianLengthEarth").innerHTML = meridian ? ` = ${rn(meridian / 200)}%🌏` : "";
    ensureEl("mapCoordinates").innerHTML =
      `${lat(mc.latN!)} ${Math.abs(rn(mc.lonW!))}°W; ${lat(mc.latS!)} ${rn(mc.lonE!)}°E`;

    function toKilometer(v: number): number {
      if (unit === "km") return v;
      if (unit === "mi") return v * 1.60934;
      if (unit === "lg") return v * 4.828;
      if (unit === "vr") return v * 1.0668;
      if (unit === "nmi") return v * 1.852;
      if (unit === "nlg") return v * 5.556;
      return 0;
    }

    function lat(latVal: number): string {
      return latVal > 0 ? `${Math.abs(rn(latVal))}°N` : `${Math.abs(rn(latVal))}°S`;
    }

    const area = geoGraticule().extent([
      [mc.lonW!, mc.latN!],
      [mc.lonE!, mc.latS!]
    ]);

    globe.select("#globeArea").attr("d", round(path(area.outline()) ?? "", 1));
  }

  function updateGlobeTemperature(): void {
    const tEq = options.temperatureEquator;
    const tNP = options.temperatureNorthPole;
    const tSP = options.temperatureSouthPole;

    const colorScale = scaleSequential(interpolateSpectral);
    const getColor = (value: number) => colorScale(1 - value);
    const [tMin, tMax] = [-25, 30];
    const tDelta = tMax - tMin;

    globe.select("#grad90").attr("stop-color", getColor((tNP - tMin) / tDelta));
    globe.select("#grad60").attr("stop-color", getColor((tEq - ((tEq - tNP) * 2) / 3 - tMin) / tDelta));
    globe.select("#grad30").attr("stop-color", getColor((tEq - ((tEq - tNP) * 1) / 4 - tMin) / tDelta));
    globe.select("#grad0").attr("stop-color", getColor((tEq - tMin) / tDelta));
    globe.select("#grad-30").attr("stop-color", getColor((tEq - ((tEq - tSP) * 1) / 4 - tMin) / tDelta));
    globe.select("#grad-60").attr("stop-color", getColor((tEq - ((tEq - tSP) * 2) / 3 - tMin) / tDelta));
    globe.select("#grad-90").attr("stop-color", getColor((tSP - tMin) / tDelta));
  }

  function updateWindDirections(): void {
    let idx = 0;
    globe
      .select("#globeWindArrows")
      .selectAll<SVGPathElement, unknown>("path")
      .each(function (this: SVGPathElement) {
        const tr = parseTransform(this.getAttribute("transform") ?? "");
        this.setAttribute("transform", `rotate(${options.winds[idx]} ${tr[1]} ${tr[2]})`);
        idx++;
      });
  }

  function handleWindChange(event: MouseEvent): void {
    const arrow = (event.target as Element)?.nextElementSibling as SVGElement | null;
    if (!arrow) return;
    const tier = +(arrow.dataset.tier ?? 0);
    options.winds[tier] = (options.winds[tier] + 45) % 360;
    const tr = parseTransform(arrow.getAttribute("transform") ?? "");
    arrow.setAttribute("transform", `rotate(${options.winds[tier]} ${tr[1]} ${tr[2]})`);
    localStorage.setItem("winds", String(options.winds));

    const mapTiers = range(mapCoordinates.latN!, mapCoordinates.latS!, -30).map(c => ((90 - c) / 30) | 0);
    if ((ensureEl("wcAutoChange") as HTMLInputElement).checked && mapTiers.includes(tier)) updateWorld();
  }

  function restoreDefaultWinds(): void {
    const defaultWinds: [number, number, number, number, number, number] = [225, 45, 225, 315, 135, 315];
    const mapTiers = range(mapCoordinates.latN!, mapCoordinates.latS!, -30).map(c => ((90 - c) / 30) | 0);
    const update =
      (ensureEl("wcAutoChange") as HTMLInputElement).checked &&
      mapTiers.some(t => options.winds[t] !== defaultWinds[t]);
    options.winds = defaultWinds;
    updateWindDirections();
    if (update) updateWorld();
  }

  function applyWorldPreset(size: number, lat: number): void {
    (ensureEl("mapSizeInput") as HTMLInputElement).value = String(size);
    (ensureEl("mapSizeOutput") as HTMLOutputElement).value = String(size);
    (ensureEl("latitudeInput") as HTMLInputElement).value = String(lat);
    (ensureEl("latitudeOutput") as HTMLOutputElement).value = String(lat);
    lock("mapSize");
    lock("latitude");
    if ((ensureEl("wcAutoChange") as HTMLInputElement).checked) updateWorld();
  }
}

window.editWorld = editWorld;
