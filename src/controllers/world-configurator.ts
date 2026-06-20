import { geoGraticule, geoOrthographic, geoPath, interpolateSpectral, range, scaleSequential, select } from "d3";
import { getWorldState } from "../actions";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { Biomes } from "../modules/biomes";
import { Features } from "../modules/features";
import { Lakes } from "../modules/lakes";
import { Rivers } from "../modules/river-generator";
import {
  BiomesRenderer,
  CoordinatesRenderer,
  drawTemperature,
  PrecipitationRenderer,
  RiversRenderer
} from "../renderers";
import { openDialog } from "../ui/dialogs/dialogService";
import { convertTemperature, debounce, ensureEl, parseTransform, rn, round } from "../utils";
import { lock } from "../utils/uiHelpers";
import { layerIsOn } from "./layers";

export function editWorld(): void {
  if (viewContext.customization) return;

  openDialog("worldConfigurator");

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

  ensureEl("worldControls").addEventListener("input", handleControlsChange);
  ensureEl("restoreWinds").addEventListener("click", restoreDefaultWinds);
  ensureEl("wcWholeWorld").addEventListener("click", () => applyWorldPreset(100, 50));
  ensureEl("wcNorthern").addEventListener("click", () => applyWorldPreset(33, 25));
  ensureEl("wcTropical").addEventListener("click", () => applyWorldPreset(33, 50));
  ensureEl("wcSouthern").addEventListener("click", () => applyWorldPreset(33, 75));

  function updateInputValues(): void {
    ensureEl("temperatureEquatorInput").setAttribute("value", String(worldContext.options.temperatureEquator));
    (ensureEl("temperatureEquatorOutput") as HTMLOutputElement).value = String(worldContext.options.temperatureEquator);
    ensureEl("temperatureEquatorF").innerText = convertTemperature(worldContext.options.temperatureEquator, "°F");

    ensureEl("temperatureNorthPoleInput").setAttribute("value", String(worldContext.options.temperatureNorthPole));
    (ensureEl("temperatureNorthPoleOutput") as HTMLOutputElement).value = String(
      worldContext.options.temperatureNorthPole
    );
    ensureEl("temperatureNorthPoleF").innerText = convertTemperature(worldContext.options.temperatureNorthPole, "°F");

    ensureEl("temperatureSouthPoleInput").setAttribute("value", String(worldContext.options.temperatureSouthPole));
    (ensureEl("temperatureSouthPoleOutput") as HTMLOutputElement).value = String(
      worldContext.options.temperatureSouthPole
    );
    ensureEl("temperatureSouthPoleF").innerText = convertTemperature(worldContext.options.temperatureSouthPole, "°F");
  }

  const debouncedUpdateWorld = debounce(updateWorld, 300);

  function handleControlsChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const stored = target.dataset.stored!;
    (ensureEl(`${stored}Input`) as HTMLInputElement).value = target.value;
    (ensureEl(`${stored}Output`) as HTMLOutputElement).value = target.value;
    lock(stored);

    if (stored === "temperatureEquator") {
      worldContext.options.temperatureEquator = Number(target.value);
      ensureEl("temperatureEquatorF").innerText = convertTemperature(worldContext.options.temperatureEquator, "°F");
    } else if (stored === "temperatureNorthPole") {
      worldContext.options.temperatureNorthPole = Number(target.value);
      ensureEl("temperatureNorthPoleF").innerText = convertTemperature(worldContext.options.temperatureNorthPole, "°F");
    } else if (stored === "temperatureSouthPole") {
      worldContext.options.temperatureSouthPole = Number(target.value);
      ensureEl("temperatureSouthPoleF").innerText = convertTemperature(worldContext.options.temperatureSouthPole, "°F");
    }

    if ((ensureEl("wcAutoChange") as HTMLInputElement).checked) debouncedUpdateWorld();
  }

  function updateWorld(): void {
    updateGlobeTemperature();
    updateGlobePosition();
    document.dispatchEvent(new CustomEvent("fmg:world-recalculate", { detail: { temps: true, prec: true } }));
    const state = getWorldState();
    const heights = new Uint8Array(worldContext.pack.cells.h);
    Rivers.generate(worldContext, viewContext, appServices, state);
    Rivers.specify(worldContext, viewContext, appServices, state);
    worldContext.pack.cells.h = new Float32Array(heights);
    Biomes.define(state);
    Features.defineGroups();
    Lakes.defineNames(state);

    if (layerIsOn("toggleTemperature")) drawTemperature(worldContext, viewContext, appServices);
    if (layerIsOn("togglePrecipitation")) PrecipitationRenderer.render(worldContext, viewContext, appServices);
    if (layerIsOn("toggleBiomes")) BiomesRenderer.render(worldContext, viewContext, appServices);
    if (layerIsOn("toggleCoordinates")) CoordinatesRenderer.render(worldContext, viewContext, appServices);
    if (layerIsOn("toggleRivers")) RiversRenderer.render(worldContext, viewContext, appServices);
    if (ThreeD.options.isOn) requestAnimationFrame(() => ThreeD.update());
  }

  function updateGlobePosition(): void {
    const size = +(ensureEl("mapSizeOutput") as HTMLOutputElement).value;
    const eqD = ((worldContext.graphHeight / 2) * 100) / size;

    document.dispatchEvent(new CustomEvent("fmg:world-recalculate", { detail: { coords: true } }));
    const mc = worldContext.mapCoordinates;
    const unit = distanceUnitInput.value;
    const meridian = toKilometer(eqD * 2 * worldContext.distanceScale);
    ensureEl("mapSize").innerHTML = `${worldContext.graphWidth}x${worldContext.graphHeight}`;
    ensureEl("mapSizeFriendly").innerHTML =
      `${rn(worldContext.graphWidth * worldContext.distanceScale)}x${rn(worldContext.graphHeight * worldContext.distanceScale)} ${unit}`;
    ensureEl("meridianLength").innerHTML = String(rn(eqD * 2));
    ensureEl("meridianLengthFriendly").innerHTML = `${rn(eqD * 2 * worldContext.distanceScale)} ${unit}`;
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
    const tEq = worldContext.options.temperatureEquator;
    const tNP = worldContext.options.temperatureNorthPole;
    const tSP = worldContext.options.temperatureSouthPole;

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
        this.setAttribute("transform", `rotate(${worldContext.options.winds[idx]} ${tr[1]} ${tr[2]})`);
        idx++;
      });
  }

  function handleWindChange(event: MouseEvent): void {
    const arrow = (event.target as Element)?.nextElementSibling as SVGElement | null;
    if (!arrow) return;
    const tier = +(arrow.dataset.tier ?? 0);
    worldContext.options.winds[tier] = (worldContext.options.winds[tier] + 45) % 360;
    const tr = parseTransform(arrow.getAttribute("transform") ?? "");
    arrow.setAttribute("transform", `rotate(${worldContext.options.winds[tier]} ${tr[1]} ${tr[2]})`);
    localStorage.setItem("winds", String(worldContext.options.winds));

    const mapTiers = range(worldContext.mapCoordinates.latN!, worldContext.mapCoordinates.latS!, -30).map(
      c => ((90 - c) / 30) | 0
    );
    if ((ensureEl("wcAutoChange") as HTMLInputElement).checked && mapTiers.includes(tier)) updateWorld();
  }

  function restoreDefaultWinds(): void {
    const defaultWinds: [number, number, number, number, number, number] = [225, 45, 225, 315, 135, 315];
    const mapTiers = range(worldContext.mapCoordinates.latN!, worldContext.mapCoordinates.latS!, -30).map(
      c => ((90 - c) / 30) | 0
    );
    const update =
      (ensureEl("wcAutoChange") as HTMLInputElement).checked &&
      mapTiers.some(t => worldContext.options.winds[t] !== defaultWinds[t]);
    worldContext.options.winds = defaultWinds;
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

export function initWorldConfigurator(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}
