import { type Author, DEFAULT_AUTHOR } from "../buildings/authors";
import { createPolygonHouses, POLYGON_HOUSES } from "../buildings/houses/polygonHouses";
import { STANDARD_BIOME_DEFINITIONS } from "../data/biomeCatalog";
import "./viewer.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BUILDING_APPEARANCE_PROFILES, type BuildingAppearanceProfile } from "../buildings/appearance/types";
import { createPontDuGard, PONT_DU_GARD, pontDuGardElevation } from "../buildings/aqueducts/pontDuGard";
import { contentDigest } from "../buildings/canonicalJson";
import { createStGeorgesChapel, ST_GEORGES_CHAPEL } from "../buildings/chapels/stGeorgesChapel";
import { CODEX_TOWN_WALL_PERIOD, CODEX_TOWN_WALLS } from "../buildings/fortifications/codexTownWalls";
import { GATEHOUSE } from "../buildings/fortifications/gatehouse";
import { TOWN_WALL_AUTHOR, TOWN_WALLS, type TownWallModel } from "../buildings/fortifications/townWalls";
import { BARBICANS, createBarbican } from "../buildings/fortresses/barbicans";
import { BOJNICE, bojnicePlan, createBojnice } from "../buildings/fortresses/bojnice";
import { CHAMBORD, createChambord } from "../buildings/fortresses/chambord";
import { KRAK, type KrakPhase } from "../buildings/fortresses/krak";
import { createEarthenHouses, EARTHEN_HOUSES } from "../buildings/houses/earthenHouses";
import {
  createRegionalHouses,
  REGIONAL_HOUSES,
  type RegionalHouseProfile,
  type RegionalHouseQuality,
  regionalHouseNote
} from "../buildings/houses/regionalHouses";
import type { LandmarkModel } from "../buildings/landmarks/architectureKit";
import type { MedievalModel } from "../buildings/medieval/modelKit";
import { meshProjection } from "../buildings/meshProjection";
import { createPostMill, POST_MILL } from "../buildings/mills/postMill";
import { createTowerMill, TOWER_MILL } from "../buildings/mills/towerMill";
import {
  createLowBankWaterMill,
  createWaterMill,
  LOW_BANK_WATER_MILLS,
  WATER_MILL
} from "../buildings/mills/waterMill";
import { committedSvgHash, levelPlanSvg, planSvg } from "../buildings/planSvg";
import {
  CONTAINER_KINDS,
  CONTAINER_STATES,
  createMedievalContainer,
  MEDIEVAL_CONTAINER_NOTE,
  MEDIEVAL_CONTAINERS
} from "../buildings/props/medievalContainers";
import { type BuildingRecord, TRIANGLE_BUDGET } from "../buildings/record";
import { BARGE, createBarge } from "../buildings/ships/barge";
import { CARRACK, createCarrack } from "../buildings/ships/carrack";
import { createGalleon, GALLEON } from "../buildings/ships/galleon";
import { createOpusGalleon, OPUS_GALLEON, type OpusGalleonQuality } from "../buildings/ships/opusGalleon";
import { createSloop, SLOOP } from "../buildings/ships/sloop";
import { BATTERING_RAM, createBatteringRam } from "../buildings/siege/batteringRam";
import { createEarlyFieldCannon, EARLY_FIELD_CANNON } from "../buildings/siege/earlyFieldCannon";
import { createSiegeTower, SIEGE_TOWER } from "../buildings/siege/siegeTower";
import { createTrebuchet, TREBUCHET } from "../buildings/siege/trebuchet";
import {
  createHangingSign,
  HANGING_SIGN_TEMPLATES,
  type HangingSignOptions,
  SIGN_MATERIALS,
  SIGN_SHAPES,
  SIGN_SYMBOLS
} from "../buildings/signs/hangingSign";
import {
  BASILICA_QUALITIES,
  BASILICA_TEMPLE,
  type BasilicaQuality,
  createBasilicaTemple
} from "../buildings/temples/basilicaTemple";
import { validateBuildingRecord } from "../buildings/validate";
import { familyVariants } from "../buildings/variants";
import { COVERED_WAGON, createCoveredWagon } from "../buildings/vehicles/coveredWagon";
import {
  AIRSHIP,
  createAirship,
  createHotAirBalloon,
  createSteamLocomotive,
  HOT_AIR_BALLOON,
  STEAM_LOCOMOTIVE
} from "../buildings/vehicles/industrialVehicles";
import { createMedievalWagon, MEDIEVAL_WAGON } from "../buildings/vehicles/medievalWagon";
import { createMinecart, MINECART } from "../buildings/vehicles/minecart";
import { createNobleCarriage, NOBLE_CARRIAGE } from "../buildings/vehicles/nobleCarriage";
import { createWarWagon, WAR_WAGON } from "../buildings/vehicles/warWagon";
import { createMedievalWell, MEDIEVAL_WELL } from "../buildings/wells/medievalWell";
import {
  createPublicWaterBasin,
  PUBLIC_WATER_BASIN_NOTE,
  PUBLIC_WATER_BASINS,
  WATER_BASIN_KINDS
} from "../buildings/wells/publicWaterBasin";
import { createMedievalLumberYard, MEDIEVAL_LUMBER_YARD } from "../buildings/yards/medievalLumberYard";
import { buildingAppearancePreview } from "../city-editor/generators/buildingAppearancePreview";
import { adoptedVariant } from "../city3d/adoption";
import { catalogueMassing } from "../city3d/core/catalogueMassing";
import { structureSurfaces } from "../city3d/core/structureGeometry";
import { createTownBuildingDetails, type TownBuildingDetails } from "../city3d/three/buildingDetails";
import { createCityMassing } from "../city3d/three/cityMeshes";
import { type CityStructureMeshes, createStructureMassing } from "../city3d/three/structureMeshes";
import type { TownWaterMeshes } from "../city3d/three/waterMeshes";
import type { HistoricalPeriod } from "../types/historicalPeriod";
import { createModelComparison } from "./modelComparison";
import { mountPerformancePanel } from "./performancePanel";
import { sanitizeSvg } from "./svgSanitize";
import {
  catalogueWikipedia,
  containerWikipedia,
  landmarkWikipedia,
  medievalWikipediaArticle,
  wallWikipedia,
  wikipediaLink
} from "./wikipedia";

const PERIOD: Partial<Record<HistoricalPeriod, string>> = {
  earlyMedieval: "Early medieval",
  highMedieval: "High medieval",
  lateMedieval: "Late medieval"
};

interface Entry {
  record: BuildingRecord;
  plan: string | null;
}

const recordModules = import.meta.glob("../buildings/catalogue/*.json", {
  eager: true,
  import: "default"
}) as Record<string, BuildingRecord>;
const planModules = import.meta.glob("../buildings/plans/*.svg", {
  eager: true,
  query: "?raw",
  import: "default"
}) as Record<string, string>;

function loadEntries(): Entry[] {
  return Object.values(recordModules)
    .map(record => {
      const plan = Object.entries(planModules).find(([file]) => file.endsWith(`/${record.id}.svg`))?.[1] ?? null;
      return { record, plan };
    })
    .sort((a, b) => a.record.name.localeCompare(b.record.name));
}

function triangleCount(record: BuildingRecord): number {
  return catalogueMassing(record).reduce((sum, structure) => {
    const surfaces = structureSurfaces(structure);
    if (!surfaces) return sum;
    return sum + (surfaces.walls.positions.length + surfaces.roofs.positions.length) / 9;
  }, 0);
}

function hashesAgree(record: BuildingRecord, plan: string | null): boolean {
  const digest = contentDigest(record);
  return record.contentHash === digest && committedSvgHash(plan ?? "") === digest;
}

function mountPlan(host: HTMLElement, markup: string): void {
  host.replaceChildren();
  const svg = sanitizeSvg(markup);
  if (!svg) {
    const note = document.createElement("p");
    note.textContent = "The plan SVG could not be read.";
    host.append(note);
    return;
  }
  host.append(document.importNode(svg, true));
}

/** CE's choice for a registered family, from the shown author's side; empty for unregistered families. */
function adoptionFacts(family: string, level: string, author: Author): HTMLParagraphElement[] {
  if (!familyVariants(family).some(variant => variant.level === level)) return [];
  const adopted = adoptedVariant(family, level);
  return [fact("CE adoption", adopted.author === author ? "Adopted" : `Not adopted; CE uses ${adopted.author}`)];
}

function fact(label: string, value: string, wikipediaArticle?: string): HTMLParagraphElement {
  const row = document.createElement("p");
  const name = document.createElement("strong");
  name.textContent = `${label}: `;
  row.append(name, document.createTextNode(value));
  if (wikipediaArticle) row.append(document.createElement("br"), wikipediaLink(wikipediaArticle));
  return row;
}

const root = document.querySelector("#building-viewer");
if (!root) throw new Error("building viewer root is missing");

const entries = loadEntries();
const app = document.createElement("div");
app.className = "bv-app";
const list = document.createElement("nav");
list.className = "bv-list";
list.setAttribute("aria-label", "Model catalogue");
const heading = document.createElement("h1");
heading.textContent = "Building viewer";
list.append(heading);
const main = document.createElement("div");
main.className = "bv-main";
const stage = document.createElement("div");
stage.className = "bv-stage";
const banner = document.createElement("p");
banner.className = "bv-banner";
banner.hidden = true;
stage.append(banner);
const plans = document.createElement("div");
plans.className = "bv-plans";
const roofPane = document.createElement("section");
const roofTitle = document.createElement("h2");
roofTitle.textContent = "Roof plan";
const roofHost = document.createElement("div");
roofPane.append(roofTitle, roofHost);
const levelPane = document.createElement("section");
const levelTitle = document.createElement("h2");
levelTitle.textContent = "Floor plan";
const floors = document.createElement("div");
floors.className = "bv-floors";
const levelHost = document.createElement("div");
levelPane.append(levelTitle, floors, levelHost);
plans.append(roofPane, levelPane);
const facts = document.createElement("section");
facts.className = "bv-facts";
const inspector = document.createElement("aside");
inspector.className = "bv-inspector";
inspector.setAttribute("aria-label", "Model options and details");
const modelOptions = document.createElement("section");
modelOptions.className = "bv-options";
modelOptions.hidden = true;
const optionsTitle = document.createElement("h2");
optionsTitle.textContent = "Model options";
const optionFields = document.createElement("div");
modelOptions.append(optionsTitle, optionFields);
/**
 * Alternative versions of a list item made by other AI models, keyed by the list button's data-id.
 * `primary` means that author made the only prepared model, so it is selected on open.
 */
const AUTHORED_VARIANTS: Record<string, { author: Author; primary?: boolean; quality?: boolean; show: () => void }> = {
  "basilica-temple": { author: BASILICA_TEMPLE.author, show: () => showBasilicaTemple() }
};
let selectedId = entries[0]?.record.id ?? "";
const authorPane = document.createElement("section");
authorPane.className = "bv-author";
const authorTitle = document.createElement("h2");
authorTitle.textContent = "Created by";
const authorSelect = document.createElement("select");
authorSelect.setAttribute("aria-label", "AI model that created this object");
/** Authors of the quality level on show, keyed like AUTHORED_VARIANTS, for models with per-level variants. */
const LEVEL_AUTHORS: Record<string, { authors: Author[]; current: Author; show: (author: Author) => void }> = {};
function listAuthors(id: string): void {
  authorSelect.replaceChildren();
  const level = LEVEL_AUTHORS[id];
  if (level) {
    for (const name of level.authors) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      authorSelect.append(option);
    }
    authorSelect.value = level.current;
    showQuality(false);
    return;
  }
  const variant = AUTHORED_VARIANTS[id];
  const names = variant?.primary ? [variant.author] : ([DEFAULT_AUTHOR, variant?.author].filter(Boolean) as Author[]);
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    authorSelect.append(option);
  }
  authorSelect.value = variant?.primary ? variant.author : DEFAULT_AUTHOR;
  showQuality(variant?.primary === true && variant.quality === true);
}
authorSelect.addEventListener("change", () => {
  const level = LEVEL_AUTHORS[selectedId];
  if (level) return level.show(authorSelect.value as Author);
  const variant = AUTHORED_VARIANTS[selectedId];
  if (variant && authorSelect.value === variant.author) return variant.show();
  list.querySelector<HTMLButtonElement>(`button[data-id="${CSS.escape(selectedId)}"]`)?.click();
});
const selectedName = document.createElement("h2");
selectedName.className = "bv-selected";
selectedName.textContent = entries[0]?.record.name ?? "";
// Render quality applies only to variants that ship more than one level of detail.
const qualityTitle = document.createElement("h2");
qualityTitle.textContent = "Quality";
const qualitySelect = document.createElement("select");
qualitySelect.setAttribute("aria-label", "Model render quality");
for (const quality of BASILICA_QUALITIES) {
  const option = document.createElement("option");
  option.value = quality;
  option.textContent = quality === "high" ? "High" : "Low (light rendering)";
  qualitySelect.append(option);
}
qualitySelect.addEventListener("change", () => AUTHORED_VARIANTS[selectedId]?.show());
function showQuality(visible: boolean): void {
  qualityTitle.hidden = !visible;
  qualitySelect.hidden = !visible;
}
listAuthors(selectedId);
authorPane.append(authorTitle, authorSelect, qualityTitle, qualitySelect, selectedName);
// Mirror whichever list button was chosen, whatever model family it belongs to.
list.addEventListener("click", event => {
  const button = (event.target as HTMLElement).closest("button");
  if (!button) return;
  selectedName.textContent = button.querySelector(".bv-name")?.textContent ?? button.textContent ?? "";
  selectedId = button.dataset.id ?? "";
  listAuthors(selectedId);
});
inspector.append(authorPane, modelOptions, facts);
main.append(stage, plans);
app.append(list, main, inspector);
root.append(app);

const canvas = document.createElement("canvas");
stage.append(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0xc5c5bf);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
scene.add(new THREE.HemisphereLight(0xf4f0e6, 0x6d7a62, 0.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.15);
sun.position.set(1, 1.6, 0.4);
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.MeshLambertMaterial({ color: 0xd5cfbf }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.05;
ground.visible = false;
scene.add(ground);
const controls = new OrbitControls(camera, canvas);
controls.maxPolarAngle = Math.PI / 2 - 0.05;
let massing: CityStructureMeshes | null = null;
let regionalDetails: TownBuildingDetails | null = null;
let studyWater: TownWaterMeshes | null = null;
let selection = 0;
const modelComparison = createModelComparison();
let comparisonVariants: { id: string; levels: readonly { id: string; label: string }[]; selected: string } | null =
  null;
let comparisonModel: { path: string; quality: "low" | "high" } | null = null;

function appendFacts(...nodes: (Node | string)[]): void {
  facts.append(...nodes);
  if (facts.querySelector(".bv-comparison")) return;
  const root = new THREE.Group();
  // References only: do not reparent the visible model or its supplementary details.
  if (massing) root.children.push(massing.group);
  if (regionalDetails) root.children.push(regionalDetails.group);
  if (studyWater) {
    root.children.push(studyWater.parent);
    for (const mesh of [studyWater.land, studyWater.bank, studyWater.unknown]) if (mesh) root.children.push(mesh);
  }
  if (comparisonVariants) {
    modelComparison.mountVariants(
      facts,
      comparisonVariants.id,
      comparisonVariants.levels,
      comparisonVariants.selected,
      root
    );
    return;
  }
  modelComparison.mount(facts, comparisonModel?.path ?? null, comparisonModel?.quality ?? "high", root);
}
const performancePanel = mountPerformancePanel(inspector, () => massing?.group ?? null);
window.addEventListener("pagehide", () => modelComparison.clear());

function resize(): void {
  const rect = stage.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function label(value: string): string {
  return value
    .split("-")
    .map(part => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function frame(record: Pick<BuildingRecord, "occupancyMeters">, height: number): void {
  const radius = Math.max(record.occupancyMeters.width, record.occupancyMeters.depth, 8);
  camera.position.set(radius * 1.45, Math.max(height, 4) * 1.25, radius * 1.45);
  controls.target.set(0, height * 0.42, 0);
  controls.update();
  ground.geometry.dispose();
  ground.geometry = new THREE.CircleGeometry(radius * 0.9, 48);
}

function clearMesh(): void {
  comparisonModel = null;
  comparisonVariants = null;
  modelComparison.clear();
  performancePanel.reset();
  if (regionalDetails) {
    scene.remove(regionalDetails.group);
    regionalDetails.dispose();
    regionalDetails = null;
  }
  optionFields.replaceChildren();
  modelOptions.hidden = true;
  ground.visible = false;
  studyWater?.dispose();
  studyWater = null;
  if (!massing) return;
  scene.remove(massing.group);
  massing.dispose();
  massing = null;
}

function showLevel(record: BuildingRecord, levelId: string): void {
  for (const button of floors.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", button.dataset.level === levelId ? "true" : "false");
  }
  mountPlan(levelHost, levelPlanSvg(record, levelId));
}

function show(entry: Entry): void {
  selection++;
  roofTitle.textContent = "Roof plan";
  levelTitle.textContent = "Floor plan";
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button.dataset.id === entry.record.id ? "true" : "false");
  }
  const checked = validateBuildingRecord(entry.record);
  facts.replaceChildren();
  floors.replaceChildren();
  clearMesh();
  if (!checked.ok) {
    banner.hidden = false;
    banner.textContent = checked.errors.join(" ");
    appendFacts(fact("Record", entry.record.name || entry.record.id));
    return;
  }
  const record = checked.record;
  const plan = entry.plan ?? planSvg(record);
  const agree = entry.plan !== null && hashesAgree(record, entry.plan);
  banner.hidden = agree;
  banner.textContent = agree ? "" : "The record and the SVG do not match.";
  mountPlan(roofHost, plan);
  const triangles = triangleCount(record);
  if (agree) {
    massing = createStructureMassing(catalogueMassing(record));
    scene.add(massing.group);
    ground.visible = true;
    const top = catalogueMassing(record).reduce(
      (highest, structure) => Math.max(highest, structure.baseElevationMeters + structure.heightMeters),
      0
    );
    frame(record, top);
  }
  for (const level of record.levels) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.level = level.id;
    button.textContent = level.name;
    button.addEventListener("click", () => showLevel(record, level.id));
    floors.append(button);
  }
  showLevel(record, record.levels[0]?.id ?? "");
  const provenance = record.provenance;
  appendFacts(
    fact("Period", PERIOD[record.period] ?? record.period),
    fact("Plan", label(record.planFamily ?? "unspecified")),
    fact("Occupancy", `${record.occupancyMeters.width} × ${record.occupancyMeters.depth} m`),
    fact("Revision", String(record.revision)),
    fact("Hash", record.contentHash.slice(0, 12)),
    fact("Triangles", String(triangles)),
    fact("Construction", provenance.constructionPeriod),
    fact("Phase", provenance.depictedPhase),
    fact("Source", provenance.dimensionSource),
    fact("Omitted", provenance.omitted.join(", ")),
    fact("Note", provenance.note, catalogueWikipedia[record.id])
  );
  for (const level of record.levels) {
    appendFacts(fact(level.name, `${level.elevationMeters} m, floor to floor ${level.floorToFloorMeters} m`));
  }
  if (triangles > TRIANGLE_BUDGET) {
    const warn = document.createElement("p");
    warn.className = "bv-warn";
    warn.textContent = `This record uses ${triangles} triangles, above the ${TRIANGLE_BUDGET} budget.`;
    appendFacts(warn);
  }
}

async function showFortress(phase: KrakPhase): Promise<void> {
  const token = ++selection;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button.dataset.phase === phase ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Fortress plan";
  levelTitle.textContent = "Inner ward plan";
  const [{ createFortressStudy }, { cityTerrain }, { modularFortressStructures }, { createTownWater }] =
    await Promise.all([
      import("../city-editor/generators/fortressStudy"),
      import("../city-editor/generators/terrainElevation"),
      import("../city-editor/renderers/modularFortress"),
      import("../city3d/three/waterMeshes")
    ]);
  if (token !== selection) return;
  const city = createFortressStudy(phase);
  const terrain = cityTerrain(city);
  const parts = modularFortressStructures(city, city.castles![0], terrain)!;
  massing = createStructureMassing(parts);
  scene.add(massing.group);
  studyWater = createTownWater(city, terrain);
  for (const mesh of [studyWater.land, studyWater.bank, studyWater.unknown]) if (mesh) scene.add(mesh);
  scene.add(studyWater.parent);
  const top = Math.max(...parts.map(part => part.baseElevationMeters + part.heightMeters));
  frame({ occupancyMeters: { width: 160, depth: 190 } }, top);
  camera.position.set(200, top + 110, 220);
  controls.target.set(0, terrain.heightAt([0, 0]) + 8, 0);
  controls.update();
  const outline = (points: [number, number][]) =>
    `${points.map(([x, y], i) => `${i ? "L" : "M"}${x},${-y}`).join(" ")} Z`;
  const paths = [...parts]
    .sort((a, b) => a.baseElevationMeters + a.heightMeters - b.baseElevationMeters - b.heightMeters)
    .map(
      part =>
        `<path d="${[outline(part.footprint!), ...(part.holes ?? []).map(outline)].join(" ")}" fill-rule="evenodd" fill="${part.color ? "#456d7f" : part.id.includes("talus") ? "#aaa28e" : "#c1b8a2"}" stroke="#4a463c" stroke-width="0.6"/>`
    );
  mountPlan(roofHost, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-110 -115 220 230">${paths.join("")}</svg>`);
  mountPlan(levelHost, levelPlanSvg(KRAK.inner, KRAK.inner.levels[0].id));
  appendFacts(
    fact("Model", `${KRAK.name} — modular hill study`),
    fact("Phase", phase === "hospitalier-1270" ? "Hospitaller, c. 1270" : "Mamluk alterations, c. 1302"),
    fact("Parts", String(parts.length)),
    fact("Note", KRAK.note, "Krak des Chevaliers"),
    fact("Source", KRAK.source),
    fact("Inner ward", KRAK.inner.provenance.dimensionSource)
  );
  const download = document.createElement("button");
  download.type = "button";
  download.textContent = "Download editable CE hill study";
  download.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(city, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `krak-${phase}.city.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  appendFacts(download);
}

async function showCliffStudy(): Promise<void> {
  const token = ++selection;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button.dataset.study === "cliff" ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Cliff fortress";
  levelTitle.textContent = "Summit";
  const [{ createCliffFortressStudy }, { cityTerrain }, { createTownWater }] = await Promise.all([
    import("../city-editor/generators/terrainField/study"),
    import("../city-editor/generators/terrainElevation"),
    import("../city3d/three/waterMeshes")
  ]);
  if (token !== selection) return;
  const city = createCliffFortressStudy();
  const terrain = cityTerrain(city);
  studyWater = createTownWater(city, terrain);
  for (const mesh of [studyWater.land, studyWater.bank, studyWater.unknown]) if (mesh) scene.add(mesh);
  scene.add(studyWater.parent);
  const castle = city.castles?.[0];
  const platform = city.terrain?.features.find(feature => feature.kind === "platform");
  const top = platform?.levelMeters ?? terrain.datumMeters + terrain.heightAt([0, 0]);
  frame({ occupancyMeters: { width: 240, depth: 240 } }, Math.max(24, top));
  camera.position.set(180, top + 80, 220);
  controls.target.set(0, top * 0.4, 0);
  controls.update();
  appendFacts(
    fact("Model", "Cliff fortress study"),
    fact("Template", city.terrain?.field?.template ?? "crag"),
    fact("Frame", `${city.frame.extentMeters} m`),
    fact("Summit sample", `${top.toFixed(1)} m`),
    fact("Castle", castle ? castle.id : "none"),
    fact("Ramp", city.terrain?.ramps?.length ? "planned" : "none")
  );
  const download = document.createElement("button");
  download.type = "button";
  download.textContent = "Download editable CE cliff study";
  download.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(city, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cliff-fortress.city.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  appendFacts(download);
}

async function showTerraceStudy(): Promise<void> {
  const token = ++selection;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button.dataset.study === "terrace" ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Terraced river";
  levelTitle.textContent = "Pads";
  const [{ createTerraceRiverStudy }, { cityTerrain }, { createTownWater }] = await Promise.all([
    import("../city-editor/generators/terrainField/study"),
    import("../city-editor/generators/terrainElevation"),
    import("../city3d/three/waterMeshes")
  ]);
  if (token !== selection) return;
  const city = createTerraceRiverStudy();
  const terrain = cityTerrain(city);
  studyWater = createTownWater(city, terrain);
  for (const mesh of [studyWater.land, studyWater.bank, studyWater.unknown]) if (mesh) scene.add(mesh);
  scene.add(studyWater.parent);
  const pads = (city.terrain?.features ?? []).flatMap(feature =>
    feature.kind === "platform" && feature.role === "pad" ? [feature.levelMeters.toFixed(0)] : []
  );
  const corridor = city.terrain?.features.find(feature => feature.kind === "riverCorridor");
  frame({ occupancyMeters: { width: 280, depth: 220 } }, 28);
  camera.position.set(160, 90, 200);
  controls.target.set(0, 8, 0);
  controls.update();
  appendFacts(
    fact("Model", "Terraced river study"),
    fact("Template", city.terrain?.field?.template ?? "escarpment"),
    fact("Frame", `${city.frame.extentMeters} m`),
    fact("Pads", pads.map(level => `${level} m`).join(", ")),
    fact("River", corridor?.bank.kind ?? "none")
  );
  const download = document.createElement("button");
  download.type = "button";
  download.textContent = "Download editable CE terrace study";
  download.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(city, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "terrace-river.city.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  appendFacts(download);
}

function modelCategory(title: string, open = false): HTMLDetailsElement {
  const category = document.createElement("details");
  category.className = "bv-category";
  category.open = open;
  const summary = document.createElement("summary");
  summary.textContent = title;
  category.append(summary);
  list.append(category);
  return category;
}

const catalogue = modelCategory("Building catalogue", true);
if (!entries.length) {
  const empty = document.createElement("p");
  empty.textContent = "No buildings are in the catalogue.";
  catalogue.append(empty);
} else {
  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = entry.record.id;
    const name = document.createElement("span");
    name.className = "bv-name";
    name.textContent = entry.record.name;
    const meta = document.createElement("span");
    meta.className = "bv-meta";
    meta.textContent = `${PERIOD[entry.record.period] ?? entry.record.period} · ${label(entry.record.planFamily ?? "unspecified")} · ${entry.record.occupancyMeters.width} × ${entry.record.occupancyMeters.depth} m`;
    button.append(name, meta);
    button.addEventListener("click", () => show(entry));
    catalogue.append(button);
  }
  show(entries[0]);
}

function showBasilicaTemple(): void {
  selection++;
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Roof plan";
  levelTitle.textContent = "South elevation";
  showQuality(true);
  comparisonModel = { path: `basilica`, quality: qualitySelect.value as BasilicaQuality };
  massing = createBasilicaTemple(qualitySelect.value as BasilicaQuality);
  scene.add(massing.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: BASILICA_TEMPLE.width, depth: BASILICA_TEMPLE.depth } }, 30);
  camera.position.set(-70, 42, 62);
  controls.target.set(0, 12, 0);
  controls.update();
  mountPlan(roofHost, meshProjection(massing, "top"));
  mountPlan(levelHost, meshProjection(massing, "side"));
  appendFacts(
    fact("Model", `${BASILICA_TEMPLE.name} — detailed Romanesque study`),
    ...adoptionFacts("temple.basilica", qualitySelect.value, BASILICA_TEMPLE.author),
    fact("Period", "High medieval"),
    fact("Quality", qualitySelect.value === "high" ? "High" : "Low — mouldings, tile courses and ornament omitted"),
    fact("Dimensions", `${BASILICA_TEMPLE.width} × ${BASILICA_TEMPLE.depth} × ${BASILICA_TEMPLE.height} m (approx.)`),
    fact("Construction", BASILICA_TEMPLE.note, "Basilica"),
    fact("Omitted", "Interior, vaults, bells, sculpture programme, weathering and individual masonry blocks")
  );
}

const aqueducts = modelCategory("Aqueduct assemblies");
const aqueductButton = document.createElement("button");
aqueductButton.type = "button";
aqueductButton.textContent = "Pont du Gard · Roman aqueduct";
aqueductButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === aqueductButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Aqueduct elevation";
  levelTitle.textContent = "Water channel plan";
  massing = createPontDuGard();
  scene.add(massing.group);
  ground.visible = true;
  const width = PONT_DU_GARD.bays * PONT_DU_GARD.pitch;
  frame({ occupancyMeters: { width, depth: 6 } }, PONT_DU_GARD.height);
  camera.position.set(width * 0.45, 70, width * 0.95);
  controls.target.set(0, 24, 0);
  controls.update();
  mountPlan(roofHost, pontDuGardElevation());
  mountPlan(
    levelHost,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -4 ${width + 6} 8"><rect width="${width}" y="-1.5" height="3" fill="#d9c7a3" stroke="#827358" stroke-width="0.15"/><rect width="${width}" y="-1.05" height="2.1" fill="#a7b6b6"/></svg>`
  );
  appendFacts(
    fact("Model", PONT_DU_GARD.name),
    fact("Period", "Roman antiquity"),
    fact("Dimensions", `${width} × 6 × ${PONT_DU_GARD.height} m`),
    fact("Assembly", "6 large bays on each lower tier; 24 small arches on the upper tier"),
    fact(
      "Note",
      "Simplified imagined intact aqueduct inspired by Pont du Gard. Repeated bays share geometry; dimensions are illustrative. The upper channel is open for inspection.",
      "Pont du Gard"
    ),
    fact("Omitted", "Modern road bridge, damage, weathering, terrain and individual masonry blocks")
  );
});
aqueducts.append(aqueductButton);
const chapels = modelCategory("Chapel assemblies");
const stGeorgesButton = document.createElement("button");
stGeorgesButton.type = "button";
stGeorgesButton.textContent = "St George's Chapel · Windsor Castle";
stGeorgesButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === stGeorgesButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Chapel roof plan";
  levelTitle.textContent = "South elevation";
  massing = createStGeorgesChapel();
  scene.add(massing.group);
  ground.visible = true;
  frame(
    { occupancyMeters: { width: ST_GEORGES_CHAPEL.width, depth: ST_GEORGES_CHAPEL.depth } },
    ST_GEORGES_CHAPEL.height
  );
  camera.position.set(-80, 52, 85);
  controls.target.set(-2, 10, 0);
  controls.update();
  mountPlan(roofHost, meshProjection(massing, "top"));
  mountPlan(levelHost, meshProjection(massing, "side"));
  appendFacts(
    fact("Model", ST_GEORGES_CHAPEL.name),
    fact("Style", "English Perpendicular Gothic"),
    fact("Study envelope", `${ST_GEORGES_CHAPEL.width} × ${ST_GEORGES_CHAPEL.depth} × ${ST_GEORGES_CHAPEL.height} m`),
    fact("Note", ST_GEORGES_CHAPEL.note, "St George's Chapel, Windsor Castle")
  );
  const source = document.createElement("a");
  source.href = ST_GEORGES_CHAPEL.source;
  source.textContent = "College of St George · Nave and west window";
  source.target = "_blank";
  source.rel = "noreferrer";
  appendFacts(source);
});
chapels.append(stGeorgesButton);
const landmarkModules = import.meta.glob<LandmarkModel>(
  [
    "../buildings/landmarks/*.ts",
    "!../buildings/landmarks/*.test.ts",
    "!../buildings/landmarks/architectureKit.ts",
    "!../buildings/landmarks/landmarkTestSupport.ts"
  ],
  { eager: true, import: "model" }
);
for (const style of ["Gothic", "Romanesque", "Imaginary"] as const) {
  const category = modelCategory(`${style} landmarks`);
  for (const model of Object.values(landmarkModules)
    .filter(model => model.style === style)
    .sort((a, b) => a.task.localeCompare(b.task))) {
    const button = document.createElement("button");
    button.type = "button";
    category.append(button);
    button.textContent = `${model.task} · ${model.name}`;
    button.dataset.id = model.id;
    const showLandmark = (definition: LandmarkModel = model) => {
      selection++;
      for (const other of list.querySelectorAll("button")) other.setAttribute("aria-current", String(other === button));
      clearMesh();
      floors.replaceChildren();
      facts.replaceChildren();
      banner.hidden = true;
      roofTitle.textContent = "Exterior roof plan";
      levelTitle.textContent = "South elevation";
      if (model.highDetail) {
        modelOptions.hidden = false;
        const row = document.createElement("label");
        row.textContent = "Resolution: ";
        const resolution = document.createElement("select");
        for (const [value, title] of [
          ["low", "Low resolution (default)"],
          ["high", "High resolution"]
        ]) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = title;
          resolution.append(option);
        }
        resolution.value = definition === model ? "low" : "high";
        resolution.addEventListener("change", () =>
          showLandmark(resolution.value === "high" ? model.highDetail : model)
        );
        row.append(resolution);
        const paragraph = document.createElement("p");
        paragraph.append(row);
        optionFields.append(paragraph);
      }
      if (model.highDetail) {
        comparisonModel = {
          path: Object.keys(landmarkModules).find(path => landmarkModules[path] === model)!,
          quality: definition === model ? "low" : "high"
        };
      }
      massing = definition.create();
      scene.add(massing.group);
      ground.visible = true;
      frame({ occupancyMeters: { width: definition.size[0], depth: definition.size[1] } }, definition.size[2]);
      // Fit the actual bounding sphere to both viewport axes, including very tall spires.
      const sphere = new THREE.Box3().setFromObject(massing.group).getBoundingSphere(new THREE.Sphere());
      const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
      const distance = (sphere.radius / Math.sin(halfFov)) * 1.08;
      camera.position.copy(new THREE.Vector3(-1, 0.7, 1.1).normalize().multiplyScalar(distance).add(sphere.center));
      controls.target.copy(sphere.center);
      controls.update();
      mountPlan(roofHost, meshProjection(massing, "top"));
      mountPlan(levelHost, meshProjection(massing, "side"));
      appendFacts(
        fact("Model", definition.name),
        fact("Style", definition.style),
        fact("State", definition.state),
        fact("Study envelope", `${definition.size.join(" × ")} m`),
        fact("Dimensions", definition.dimensions),
        fact("Note", definition.note, landmarkWikipedia[model.id])
      );
      for (const source of definition.sources) {
        const row = document.createElement("p");
        const link = document.createElement("a");
        link.href = source.url;
        link.textContent = source.title;
        link.target = "_blank";
        link.rel = "noreferrer";
        row.append(link);
        appendFacts(row);
      }
    };
    button.addEventListener("click", () => showLandmark());
  }
}
const assemblies = modelCategory("Fortress assemblies");
const bojniceButton = document.createElement("button");
bojniceButton.type = "button";
bojniceButton.textContent = "Bojnice Castle · Romantic reconstruction";
bojniceButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === bojniceButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Castle roof plan";
  levelTitle.textContent = "Assembly";
  massing = createBojnice();
  scene.add(massing.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: BOJNICE.width, depth: BOJNICE.depth } }, BOJNICE.height);
  camera.position.set(105, 85, 130);
  controls.target.set(0, 25, 0);
  controls.update();
  mountPlan(roofHost, bojnicePlan(massing));
  levelHost.replaceChildren(
    fact("Exterior study", "Palace wings around an open courtyard, upper keep, conical towers and an arched entrance.")
  );
  appendFacts(
    fact("Model", BOJNICE.name),
    fact("Phase", "Romantic reconstruction, 1889–1910"),
    fact("Study envelope", `${BOJNICE.width} × ${BOJNICE.depth} × ${BOJNICE.height} m`),
    fact("Note", BOJNICE.note, "Bojnice Castle")
  );
  const source = document.createElement("a");
  source.href = BOJNICE.source;
  source.textContent = "Museum source";
  source.target = "_blank";
  source.rel = "noreferrer";
  appendFacts(source);
});
assemblies.append(bojniceButton);
const chambordButton = document.createElement("button");
chambordButton.type = "button";
chambordButton.textContent = "Château de Chambord · French Renaissance";
chambordButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === chambordButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Castle roof plan";
  levelTitle.textContent = "Assembly";
  const model = createChambord();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: CHAMBORD.width, depth: CHAMBORD.depth } }, CHAMBORD.height);
  camera.position.set(155, 125, 205);
  controls.target.set(0, 18, 8);
  controls.update();
  mountPlan(roofHost, model.plan);
  levelHost.replaceChildren(
    fact(
      "Exterior study",
      "Four-towered keep, central lantern, roof terraces, lateral wings and an open entrance court."
    )
  );
  appendFacts(
    fact("Model", CHAMBORD.name),
    fact("Period", "French Renaissance"),
    fact("Study envelope", `${CHAMBORD.width} × ${CHAMBORD.depth} × ${CHAMBORD.height} m`),
    fact("Note", CHAMBORD.note, "Château de Chambord")
  );
  const source = document.createElement("a");
  source.href = CHAMBORD.source;
  source.textContent = "Official architecture source";
  source.target = "_blank";
  source.rel = "noreferrer";
  appendFacts(source);
});
assemblies.append(chambordButton);
for (const phase of ["hospitalier-1270", "mamluk-1302"] as const) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.phase = phase;
  button.textContent = `${KRAK.name} · ${phase === "hospitalier-1270" ? "c. 1270" : "Mamluk alterations"}`;
  button.addEventListener("click", () => {
    void showFortress(phase).catch(error => {
      banner.hidden = false;
      banner.textContent = error instanceof Error ? error.message : String(error);
    });
  });
  assemblies.append(button);
}
const cliffButton = document.createElement("button");
cliffButton.type = "button";
cliffButton.dataset.study = "cliff";
cliffButton.textContent = "Cliff fortress · crag study";
cliffButton.addEventListener("click", () => {
  void showCliffStudy().catch(error => {
    banner.hidden = false;
    banner.textContent = error instanceof Error ? error.message : String(error);
  });
});
assemblies.append(cliffButton);
const terraceButton = document.createElement("button");
terraceButton.type = "button";
terraceButton.dataset.study = "terrace";
terraceButton.textContent = "Terraced river · escarpment study";
terraceButton.addEventListener("click", () => {
  void showTerraceStudy().catch(error => {
    banner.hidden = false;
    banner.textContent = error instanceof Error ? error.message : String(error);
  });
});
assemblies.append(terraceButton);

const shipsHeading = modelCategory("Ships");
const carrackButton = document.createElement("button");
carrackButton.type = "button";
carrackButton.textContent = "Carrack · High-castled merchant ship";
carrackButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === carrackButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Ship elevation";
  levelTitle.textContent = "Deck plan";
  const model = createCarrack();
  massing = model;
  scene.add(model.group);
  frame({ occupancyMeters: { width: CARRACK.length, depth: CARRACK.beam } }, CARRACK.height);
  camera.position.set(43, 28, 54);
  controls.target.set(1, 14, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", CARRACK.name),
    fact("Period", "Late medieval / early modern · imagined merchant vessel"),
    fact(
      "Dimensions",
      `${CARRACK.length} m overall length × ${CARRACK.beam} m beam; ${CARRACK.height} m above water; ${CARRACK.draft} m draft`
    ),
    fact("Rig", "Three masts; square-rigged fore and main masts; lateen mizzen"),
    fact("Hull", "Broad round-bilged hull; high forecastle and stepped sterncastle"),
    fact("Note", CARRACK.note, "Carrack")
  );
  const source = document.createElement("a");
  source.href = CARRACK.source;
  source.textContent = "Mariners’ Museum · Carrack";
  source.target = "_blank";
  source.rel = "noreferrer";
  appendFacts(source);
});
shipsHeading.append(carrackButton);

const galleonButton = document.createElement("button");
galleonButton.type = "button";
galleonButton.textContent = "Galleon · Three-masted sailing ship";
galleonButton.dataset.id = "galleon";
AUTHORED_VARIANTS[galleonButton.dataset.id] = { author: OPUS_GALLEON.author, show: () => showOpusGalleon() };
let opusGalleonEnsign = false;
function showOpusGalleon(): void {
  selection++;
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Ship elevation";
  levelTitle.textContent = "Deck plan";
  showQuality(true);
  const quality = qualitySelect.value as OpusGalleonQuality;
  const model = createOpusGalleon(quality, { ensign: opusGalleonEnsign });
  const ensignToggle = document.createElement("input");
  ensignToggle.type = "checkbox";
  ensignToggle.checked = opusGalleonEnsign;
  ensignToggle.addEventListener("change", () => {
    opusGalleonEnsign = ensignToggle.checked;
    showOpusGalleon();
  });
  const ensignRow = document.createElement("label");
  ensignRow.append(ensignToggle, " Stern ensign");
  const ensignParagraph = document.createElement("p");
  ensignParagraph.append(ensignRow);
  optionFields.append(ensignParagraph);
  modelOptions.hidden = false;
  massing = model;
  scene.add(model.group);
  frame({ occupancyMeters: { width: OPUS_GALLEON.length, depth: OPUS_GALLEON.beam } }, OPUS_GALLEON.height);
  camera.position.set(52, 30, 64);
  controls.target.set(4, 16, 0);
  controls.update();
  mountPlan(roofHost, meshProjection(model, "side"));
  mountPlan(levelHost, meshProjection(model, "top"));
  appendFacts(
    fact("Model", OPUS_GALLEON.name),
    ...adoptionFacts("ship.galleon", "default", OPUS_GALLEON.author),
    fact(
      "Quality",
      quality === "high" ? "High" : "Low — ratlines, running rigging, deck seams, balusters and gratings omitted"
    ),
    fact("Period", "Age of sail · imagined late-16th-century race-built galleon"),
    fact(
      "Dimensions",
      `${OPUS_GALLEON.length} m over spars × ${OPUS_GALLEON.beam} m beam; ${OPUS_GALLEON.height} m above water; ${OPUS_GALLEON.draft} m draft`
    ),
    fact("Rig", "Fore and main: course, topsail, topgallant; lateen mizzen with topsail; spritsail"),
    fact("Armament", `${OPUS_GALLEON.guns} guns on two tiers, including two stern chasers`),
    fact("Note", OPUS_GALLEON.note, "Galleon")
  );
}
galleonButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === galleonButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Ship elevation";
  levelTitle.textContent = "Deck plan";
  const model = createGalleon();
  massing = model;
  scene.add(model.group);
  frame({ occupancyMeters: { width: GALLEON.length, depth: GALLEON.beam } }, GALLEON.height);
  camera.position.set(54, 32, 67);
  controls.target.set(2, 17, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", GALLEON.name),
    ...adoptionFacts("ship.galleon", "default", GALLEON.author),
    fact("Period", "Age of sail · imagined early modern vessel"),
    fact(
      "Dimensions",
      `${GALLEON.length} m overall length × ${GALLEON.beam} m beam; ${GALLEON.height} m above water; ${GALLEON.draft} m draft`
    ),
    fact("Rig", "Three masts; square-rigged fore and main masts; lateen mizzen"),
    fact("Armament", "14 broadside guns"),
    fact("Note", GALLEON.note, "Galleon")
  );
});
shipsHeading.append(galleonButton);

const sloopButton = document.createElement("button");
sloopButton.type = "button";
sloopButton.textContent = "Sloop · Small coastal sailing ship";
sloopButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === sloopButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Ship elevation";
  levelTitle.textContent = "Deck plan";
  const model = createSloop();
  massing = model;
  scene.add(model.group);
  frame({ occupancyMeters: { width: SLOOP.length, depth: SLOOP.beam } }, SLOOP.height);
  camera.position.set(19, 13, 23);
  controls.target.set(1, 6, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", SLOOP.name),
    fact("Period", "Age of sail · imagined coastal vessel"),
    fact(
      "Dimensions",
      `${SLOOP.length} m overall length × ${SLOOP.beam} m beam; ${SLOOP.height} m above water; ${SLOOP.draft} m draft`
    ),
    fact("Rig", "One mast; gaff mainsail and jib"),
    fact("Hull", "Small wooden hull with keel, low cabin and tiller steering"),
    fact("Note", SLOOP.note, "Sloop")
  );
});
shipsHeading.append(sloopButton);

const bargeButton = document.createElement("button");
bargeButton.type = "button";
bargeButton.textContent = "Barge · River cargo carrier";
bargeButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === bargeButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Ship elevation";
  levelTitle.textContent = "Deck plan";
  const model = createBarge();
  massing = model;
  scene.add(model.group);
  frame({ occupancyMeters: { width: BARGE.length, depth: BARGE.beam } }, BARGE.height);
  camera.position.set(23, 17, 26);
  controls.target.set(0, 0.8, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", BARGE.name),
    fact("Period", "Pre-industrial · imagined river carrier"),
    fact(
      "Dimensions",
      `${BARGE.length} m overall length × ${BARGE.beam} m beam; ${BARGE.height} m above water; ${BARGE.draft} m draft`
    ),
    fact("Propulsion", "Towing or poling; unpowered"),
    fact("Hull", "Flat bottom, rising ends and shallow draft"),
    fact("Cargo", "Stacked crates, barrels and bundled timber"),
    fact("Note", BARGE.note, "Barge")
  );
});
shipsHeading.append(bargeButton);

const siegeHeading = modelCategory("Siege engines");
const trebuchetButton = document.createElement("button");
trebuchetButton.type = "button";
trebuchetButton.textContent = "Trebuchet · Hinged counterweight";
trebuchetButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === trebuchetButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Siege engine elevation";
  levelTitle.textContent = "Siege engine plan";
  const model = createTrebuchet();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: TREBUCHET.length, depth: TREBUCHET.width } }, TREBUCHET.height);
  camera.position.set(14, 11, 21);
  controls.target.set(3, 4, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", TREBUCHET.name),
    fact("Type", "Hinged-counterweight siege engine"),
    fact("Study envelope", `${TREBUCHET.length} × ${TREBUCHET.width} × ${TREBUCHET.height} m`),
    fact("Throwing arm", `${TREBUCHET.longArm} m long arm / ${TREBUCHET.shortArm} m counterweight arm`),
    fact("Pose", "Lowered for loading; sling and projectile in the trough"),
    fact("Note", TREBUCHET.note, "Trebuchet")
  );
});
siegeHeading.append(trebuchetButton);

const ramButton = document.createElement("button");
ramButton.type = "button";
ramButton.textContent = "Battering ram · Medieval European covered ram";
ramButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === ramButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Battering ram side elevation";
  levelTitle.textContent = "Battering ram plan";
  const model = createBatteringRam();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: BATTERING_RAM.length, depth: BATTERING_RAM.width } }, BATTERING_RAM.height);
  camera.position.set(8, 5, 9);
  controls.target.set(0.3, 1.65, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", BATTERING_RAM.name),
    fact("Style", "Medieval Europe · Covered siege ram"),
    fact("Study envelope", `${BATTERING_RAM.length} × ${BATTERING_RAM.width} × ${BATTERING_RAM.height} m`),
    fact("Ram", "Suspended oak log, rope cradles, iron bindings, blunt iron head and crew hand grips"),
    fact("Protection", "Hide-covered timber roof, braced open frame and four iron-bound wooden wheels"),
    fact("Note", BATTERING_RAM.note, "Battering ram")
  );
});
siegeHeading.append(ramButton);

const siegeTowerButton = document.createElement("button");
siegeTowerButton.type = "button";
siegeTowerButton.textContent = "Siege tower · Medieval European belfry";
siegeTowerButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === siegeTowerButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Siege tower side elevation";
  levelTitle.textContent = "Siege tower plan";
  const model = createSiegeTower();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: SIEGE_TOWER.length, depth: SIEGE_TOWER.width } }, SIEGE_TOWER.height);
  camera.position.set(16, 12, 18);
  controls.target.set(1, 5.2, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", SIEGE_TOWER.name),
    fact("Style", "Medieval Europe · Timber belfry"),
    fact("Study envelope", `${SIEGE_TOWER.length} × ${SIEGE_TOWER.width} × ${SIEGE_TOWER.height} m`),
    fact("Structure", "Asymmetric timber frame, raked open rear, four decks and rear-set roof access"),
    fact("Protection", "Hide panels, arrow slits and a clear 1.5 m deep forward archer strip"),
    fact(
      "Equipment",
      "Four iron-bound wheels, flush assault bridge and one overhead windlass with linked drums and a wall-side hand-rope loop"
    ),
    fact("Note", SIEGE_TOWER.note, "Siege tower")
  );
});
siegeHeading.append(siegeTowerButton);

const artilleryHeading = modelCategory("Artillery");
const cannonButton = document.createElement("button");
cannonButton.type = "button";
cannonButton.textContent = "Early field cannon · Europe c. 1500";
cannonButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === cannonButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Field cannon side elevation";
  levelTitle.textContent = "Field cannon plan";
  const model = createEarlyFieldCannon();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame(
    { occupancyMeters: { width: EARLY_FIELD_CANNON.length, depth: EARLY_FIELD_CANNON.width } },
    EARLY_FIELD_CANNON.height
  );
  camera.position.set(4.6, 3.1, 5.2);
  controls.target.set(-0.2, 0.8, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", EARLY_FIELD_CANNON.name),
    fact("Period", "Late medieval / Age of Discovery · Europe, circa 1500"),
    fact("Type", "Muzzle-loading land artillery on a two-wheeled field carriage"),
    fact(
      "Study envelope",
      `${EARLY_FIELD_CANNON.length} × ${EARLY_FIELD_CANNON.width} × ${EARLY_FIELD_CANNON.height} m`
    ),
    fact("Barrel", "Tapered bronze tube, open muzzle, reinforcing mouldings, trunnions and cascabel"),
    fact("Carriage", "Iron-bound oak wheels, timber cheeks, ground-resting trail and wooden elevation quoin"),
    fact("Note", EARLY_FIELD_CANNON.note, "History of cannon")
  );
});
artilleryHeading.append(cannonButton);

const millsHeading = modelCategory("Mills");
const postMillButton = document.createElement("button");
postMillButton.type = "button";
postMillButton.textContent = "Medieval windmill · Timber post mill";
postMillButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === postMillButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Windmill front elevation";
  levelTitle.textContent = "Windmill plan";
  const model = createPostMill();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: POST_MILL.width, depth: POST_MILL.depth } }, POST_MILL.height);
  camera.position.set(17, 12, 24);
  controls.target.set(0, 6, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", POST_MILL.name),
    fact("Style", "Medieval Europe · Timber post mill"),
    fact("Study envelope", `${POST_MILL.width} × ${POST_MILL.depth} × ${POST_MILL.height} m`),
    fact("Sails", `Four canvas-covered lattice sails; ${POST_MILL.sailRadius * 2} m stock diameter`),
    fact("Structure", "Timber milling house on a braced central post; rear stair and tailpole"),
    fact("Note", POST_MILL.note, "Post mill")
  );
});
millsHeading.append(postMillButton);

const towerMillButton = document.createElement("button");
towerMillButton.type = "button";
towerMillButton.textContent = "Stone windmill · Tower mill";
towerMillButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === towerMillButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Tower windmill front elevation";
  levelTitle.textContent = "Tower windmill plan";
  const model = createTowerMill();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: TOWER_MILL.width, depth: TOWER_MILL.depth } }, TOWER_MILL.height);
  camera.position.set(21, 16, 30);
  controls.target.set(0, 9, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", TOWER_MILL.name),
    fact("Style", "European stone tower mill"),
    fact("Study envelope", `${TOWER_MILL.width} × ${TOWER_MILL.depth} × ${TOWER_MILL.height} m`),
    fact("Tower", `${TOWER_MILL.towerHeight} m high; ${TOWER_MILL.baseRadius * 2} m diameter at the base`),
    fact("Sails", "Four canvas-covered lattice sails on a timber cap"),
    fact("Note", TOWER_MILL.note, "Tower mill")
  );
});
millsHeading.append(towerMillButton);

const waterMillButton = document.createElement("button");
waterMillButton.type = "button";
waterMillButton.textContent = "Medieval watermill · Timber and stone";
waterMillButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === waterMillButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Watermill front elevation";
  levelTitle.textContent = "Watermill plan";
  const model = createWaterMill();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: WATER_MILL.width, depth: WATER_MILL.depth } }, WATER_MILL.height);
  camera.position.set(20, 13, 25);
  controls.target.set(0, 4, 0.8);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", WATER_MILL.name),
    fact("Style", "Medieval Europe · Stone and half-timbered grain mill"),
    fact("Study envelope", `${WATER_MILL.width} × ${WATER_MILL.depth} × ${WATER_MILL.height} m`),
    fact("Wheel", `Wooden overshot wheel; ${WATER_MILL.wheelRadius * 2} m diameter; 24 buckets`),
    fact("Water supply", "Raised timber flume with sluice gate; lower millrace and axle bearing pier"),
    fact("Note", WATER_MILL.note, "Watermill")
  );
});
millsHeading.append(waterMillButton);

for (const spec of LOW_BANK_WATER_MILLS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = spec.name;
  button.addEventListener("click", () => {
    selection++;
    for (const item of list.querySelectorAll("button"))
      item.setAttribute("aria-current", item === button ? "true" : "false");
    clearMesh();
    floors.replaceChildren();
    facts.replaceChildren();
    banner.hidden = true;
    roofTitle.textContent = "Low-bank watermill elevation";
    levelTitle.textContent = "Low-bank watermill plan and flow";
    const model = createLowBankWaterMill(spec, true);
    massing = model;
    scene.add(model.group);
    frame({ occupancyMeters: { width: 18, depth: 13 } }, WATER_MILL.height);
    // This study includes its own bank section so the river below y=0 remains visible.
    ground.visible = false;
    camera.position.set(20, 13, 25);
    controls.target.set(0, 3, 2);
    controls.update();
    mountPlan(roofHost, model.elevation);
    mountPlan(levelHost, model.plan);
    appendFacts(
      fact("Model", spec.name),
      fact("Wheel", `Undershot paddle wheel; ${WATER_MILL.wheelRadius * 2} m diameter; 16 paddles`),
      fact("Ground / river", `Ground y=0 m; river y=-${spec.bankDrop} m; paddle immersion about 0.35 m`),
      fact("Flow", spec.flow === 1 ? "Upstream -X → downstream +X" : "Upstream +X → downstream -X"),
      fact("Water supply", "Low intake and partly raised sluice upstream; open tailrace downstream"),
      fact(
        "Note",
        "Imagined low-bank study for CE sites with ground 0–1 m above the river. The house stays on the land side (-Z), the wheel on the river side (+Z). Surface chevrons show downstream. Bank and river context appear only in this BV preview; the placeable model omits them. Static exterior; illustrative dimensions.",
        "Watermill"
      )
    );
  });
  millsHeading.append(button);
}

const wellsHeading = modelCategory("Wells");
const wellButton = document.createElement("button");
wellButton.type = "button";
wellButton.textContent = "Medieval European well · Stone and timber";
wellButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === wellButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Well front elevation";
  levelTitle.textContent = "Well roof plan";
  const model = createMedievalWell();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: MEDIEVAL_WELL.width, depth: MEDIEVAL_WELL.depth } }, MEDIEVAL_WELL.height);
  camera.position.set(5.2, 4.2, 6.8);
  controls.target.set(0, 1.75, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", MEDIEVAL_WELL.name),
    fact("Style", "Medieval Europe · Roofed village well"),
    fact("Study envelope", `${MEDIEVAL_WELL.width} × ${MEDIEVAL_WELL.depth} × ${MEDIEVAL_WELL.height} m`),
    fact("Structure", "Open masonry curb, braced oak posts and a timber-shingled gable roof"),
    fact("Lifting gear", "Hand-cranked wooden windlass, rope and iron-bound wooden bucket"),
    fact("Note", MEDIEVAL_WELL.note, "Water well")
  );
});
wellsHeading.append(wellButton);

for (const kind of WATER_BASIN_KINDS) {
  const spec = PUBLIC_WATER_BASINS[kind];
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = spec.name;
  button.addEventListener("click", () => {
    selection++;
    for (const item of list.querySelectorAll("button")) {
      item.setAttribute("aria-current", item === button ? "true" : "false");
    }
    clearMesh();
    floors.replaceChildren();
    facts.replaceChildren();
    banner.hidden = true;
    roofTitle.textContent = "Waterworks front elevation";
    levelTitle.textContent = "Waterworks top view";
    const model = createPublicWaterBasin(kind);
    massing = model;
    scene.add(model.group);
    ground.visible = true;
    frame({ occupancyMeters: { width: spec.width, depth: spec.depth } }, spec.height);
    camera.position.set(5.5, 4.7, 6.5);
    controls.target.set(0, spec.height * 0.4, 0);
    controls.update();
    mountPlan(roofHost, model.elevation);
    mountPlan(levelHost, model.plan);
    appendFacts(
      fact("Model", spec.name),
      fact("Study envelope", `${spec.width} × ${spec.depth} × ${spec.height} m`),
      fact("Ground contact", "Base Y = 0 m"),
      fact("Note", PUBLIC_WATER_BASIN_NOTE, "Fountain")
    );
  });
  wellsHeading.append(button);
}

const containersHeading = modelCategory("Storage props");
for (const kind of CONTAINER_KINDS) {
  for (const state of CONTAINER_STATES) {
    const spec = MEDIEVAL_CONTAINERS[kind];
    const button = document.createElement("button");
    button.type = "button";
    const stateLabel = state === "closed" && kind === "sack" ? "Tied" : label(state);
    button.textContent = `${spec.name} · ${stateLabel}`;
    button.addEventListener("click", () => {
      selection++;
      for (const item of list.querySelectorAll("button")) {
        item.setAttribute("aria-current", item === button ? "true" : "false");
      }
      clearMesh();
      floors.replaceChildren();
      facts.replaceChildren();
      banner.hidden = true;
      roofTitle.textContent = "Container front elevation";
      levelTitle.textContent = "Container top view";
      const model = createMedievalContainer(kind, state);
      massing = model;
      scene.add(model.group);
      ground.visible = true;
      const size = Math.max(spec.width, spec.depth, spec.height);
      ground.geometry.dispose();
      ground.geometry = new THREE.CircleGeometry(size * 1.3, 48);
      camera.position.set(size * 1.65, size * 1.6, size * 1.9);
      controls.target.set(0, spec.height * 0.43, 0);
      controls.update();
      mountPlan(roofHost, model.elevation);
      mountPlan(levelHost, model.plan);
      const bounds = new THREE.Box3().setFromObject(model.group);
      const dimensions = bounds.getSize(new THREE.Vector3());
      appendFacts(
        fact("Model", spec.name),
        fact("State", stateLabel),
        fact("Study envelope", `${spec.width} × ${spec.depth} × ${spec.height} m`),
        fact(
          "Mesh dimensions",
          `${dimensions.x.toFixed(3)} × ${dimensions.z.toFixed(3)} × ${dimensions.y.toFixed(3)} m`
        ),
        fact("Ground contact", `Base Y = ${(Math.abs(bounds.min.y) < 0.0005 ? 0 : bounds.min.y).toFixed(3)} m`),
        fact("Note", MEDIEVAL_CONTAINER_NOTE, containerWikipedia[kind])
      );
    });
    containersHeading.append(button);
  }
}

const yardsHeading = modelCategory("Work yards");
const lumberYardButton = document.createElement("button");
lumberYardButton.type = "button";
lumberYardButton.textContent = "Medieval European lumber yard · Timber storage";
lumberYardButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === lumberYardButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Yard front elevation";
  levelTitle.textContent = "Yard plan";
  const model = createMedievalLumberYard();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame(
    { occupancyMeters: { width: MEDIEVAL_LUMBER_YARD.width, depth: MEDIEVAL_LUMBER_YARD.depth } },
    MEDIEVAL_LUMBER_YARD.height
  );
  camera.position.set(20, 15, 22);
  controls.target.set(0, 1.7, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", MEDIEVAL_LUMBER_YARD.name),
    fact("Style", "Medieval Europe · Timber storage and hand-work yard"),
    fact(
      "Study envelope",
      `${MEDIEVAL_LUMBER_YARD.width} × ${MEDIEVAL_LUMBER_YARD.depth} × ${MEDIEVAL_LUMBER_YARD.height} m`
    ),
    fact("Storage", "Sleeper-supported log pile, boards separated by drying stickers and stacked hewn beams"),
    fact("Workshop", "Open braced timber shed, wooden roof, sawing trestles, frame saw and chopping block with axe"),
    fact("Note", MEDIEVAL_LUMBER_YARD.note, "Lumber yard")
  );
});
yardsHeading.append(lumberYardButton);

const vehiclesHeading = modelCategory("Vehicles");
for (const [definition, create] of [
  [HOT_AIR_BALLOON, createHotAirBalloon],
  [AIRSHIP, createAirship],
  [STEAM_LOCOMOTIVE, createSteamLocomotive]
] as const) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = definition.name;
  button.addEventListener("click", () => {
    selection++;
    for (const entry of list.querySelectorAll("button")) {
      entry.setAttribute("aria-current", entry === button ? "true" : "false");
    }
    clearMesh();
    floors.replaceChildren();
    facts.replaceChildren();
    banner.hidden = true;
    roofTitle.textContent = `${definition.name} side elevation`;
    levelTitle.textContent = `${definition.name} plan`;
    const model = create();
    massing = model;
    scene.add(model.group);
    ground.visible = true;
    frame({ occupancyMeters: { width: definition.length, depth: definition.width } }, definition.height);
    mountPlan(roofHost, model.elevation);
    mountPlan(levelHost, model.plan);
    const triangles = model.pickables.reduce(
      (sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3,
      0
    );
    appendFacts(
      fact("Model", definition.name),
      fact("Style", "Low-poly · Untextured flat-shaded geometry"),
      fact("Study envelope", `${definition.length} × ${definition.width} × ${definition.height} m`),
      fact("Triangles", triangles.toLocaleString("en-US")),
      fact("Note", definition.note, definition.name)
    );
  });
  vehiclesHeading.append(button);
}

const minecartButton = document.createElement("button");
minecartButton.type = "button";
minecartButton.textContent = "Minecart · Timber mining cart";
minecartButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === minecartButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Minecart side elevation";
  levelTitle.textContent = "Minecart plan";
  const model = createMinecart();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: MINECART.length, depth: MINECART.width } }, MINECART.height);
  camera.position.set(3.5, 2.7, 3.8);
  controls.target.set(0, 0.7, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", MINECART.name),
    fact("Type", "Hand-pushed mining cart"),
    fact("Study envelope", `${MINECART.length} × ${MINECART.width} × ${MINECART.height} m, including display track`),
    fact("Body", "Empty sloping plank box, iron straps, rivets and end handles"),
    fact("Running gear", "Four flanged iron wheels on two axles; short narrow-gauge track on timber sleepers"),
    fact("Note", MINECART.note, "Minecart")
  );
});
vehiclesHeading.append(minecartButton);

const wagonButton = document.createElement("button");
wagonButton.type = "button";
wagonButton.textContent = "Medieval European wagon · Four-wheeled freight wagon";
wagonButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === wagonButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Wagon side elevation";
  levelTitle.textContent = "Wagon plan";
  const model = createMedievalWagon();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: MEDIEVAL_WAGON.length, depth: MEDIEVAL_WAGON.width } }, MEDIEVAL_WAGON.height);
  camera.position.set(7, 5, 8);
  controls.target.set(0.7, 1, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", MEDIEVAL_WAGON.name),
    fact("Style", "Medieval Europe · Open timber freight wagon"),
    fact("Study envelope", `${MEDIEVAL_WAGON.length} × ${MEDIEVAL_WAGON.width} × ${MEDIEVAL_WAGON.height} m`),
    fact("Running gear", "Four wooden spoked wheels with iron tires; smaller front wheels and a pivoted front axle"),
    fact("Body", "Empty plank bed, iron straps, driver's bench and twin draft shafts; no animals"),
    fact("Note", MEDIEVAL_WAGON.note, "Wagon")
  );
});
vehiclesHeading.append(wagonButton);

const coveredWagonButton = document.createElement("button");
coveredWagonButton.type = "button";
coveredWagonButton.textContent = "Covered wagon · Canvas-covered freight wagon";
coveredWagonButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === coveredWagonButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Covered wagon side elevation";
  levelTitle.textContent = "Covered wagon canopy plan";
  const model = createCoveredWagon();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: COVERED_WAGON.length, depth: COVERED_WAGON.width } }, COVERED_WAGON.height);
  camera.position.set(7, 4.8, 8);
  controls.target.set(0.55, 1.65, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", COVERED_WAGON.name),
    fact("Style", "Pre-industrial · Timber freight wagon with a canvas cover"),
    fact("Study envelope", `${COVERED_WAGON.length} × ${COVERED_WAGON.width} × ${COVERED_WAGON.height} m`),
    fact("Cover", "Unbleached canvas on five wooden bows; stitched seams, rope lashings and rolled end curtains"),
    fact("Body", "Empty plank bed; open front and rear above the end boards"),
    fact("Running gear", "Four iron-bound spoked wheels, driver's bench and twin shafts; no animals"),
    fact("Note", COVERED_WAGON.note, "Covered wagon")
  );
});
vehiclesHeading.append(coveredWagonButton);

const nobleCarriageButton = document.createElement("button");
nobleCarriageButton.type = "button";
nobleCarriageButton.textContent = "Noble carriage · Medieval European covered carriage";
nobleCarriageButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === nobleCarriageButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Carriage side elevation";
  levelTitle.textContent = "Carriage canopy plan";
  const model = createNobleCarriage();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: NOBLE_CARRIAGE.length, depth: NOBLE_CARRIAGE.width } }, NOBLE_CARRIAGE.height);
  camera.position.set(7, 4.8, 8);
  controls.target.set(0.55, 1.65, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", NOBLE_CARRIAGE.name),
    fact("Style", "Late medieval Europe · Noble household traveling wagon"),
    fact("Study envelope", `${NOBLE_CARRIAGE.length} × ${NOBLE_CARRIAGE.width} × ${NOBLE_CARRIAGE.height} m`),
    fact("Body", "Blue painted timber, burgundy textile canopy, tied curtains and gilded heraldic shields"),
    fact("Interior", "Facing cushioned benches, low side doors and boarding steps; unglazed openings"),
    fact("Running gear", "Four iron-bound spoked wheels, front axle pivot, driver's bench and twin shafts; no animals"),
    fact("Note", NOBLE_CARRIAGE.note, "Carriage")
  );
});
vehiclesHeading.append(nobleCarriageButton);

const warWagonButton = document.createElement("button");
warWagonButton.type = "button";
warWagonButton.textContent = "War wagon · Medieval European defensive wagon";
warWagonButton.addEventListener("click", () => {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === warWagonButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "War wagon side elevation";
  levelTitle.textContent = "War wagon plan";
  const model = createWarWagon();
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: WAR_WAGON.length, depth: WAR_WAGON.width } }, WAR_WAGON.height);
  camera.position.set(8, 6, 9);
  controls.target.set(0.6, 1.45, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", WAR_WAGON.name),
    fact("Style", "Late medieval Europe · Wagon-fort inspired defensive wagon"),
    fact("Study envelope", `${WAR_WAGON.length} × ${WAR_WAGON.width} × ${WAR_WAGON.height} m`),
    fact(
      "Defenses",
      "High iron-strapped timber walls with four firing apertures on each side; open fighting compartment"
    ),
    fact("Running gear", "Four iron-bound spoked wheels, front axle kingpin and wooden drawbar; no animals"),
    fact("Access", "Closed rear double doors, iron hinges and latch, and a boarding step"),
    fact("Note", WAR_WAGON.note, "War wagon")
  );
});
vehiclesHeading.append(warWagonButton);

let townWallHousingCulture: BuildingAppearanceProfile = "legacy";

function showTownWall(model: TownWallModel, button: HTMLButtonElement, codex = false, view = -1): void {
  selection++;
  for (const item of list.querySelectorAll("button")) item.setAttribute("aria-current", String(item === button));
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Field elevation";
  levelTitle.textContent = "Plan";
  modelOptions.hidden = false;
  const row = document.createElement("label");
  row.textContent = "Resolution: ";
  const resolution = document.createElement("select");
  resolution.setAttribute("aria-label", "Model resolution");
  const option = document.createElement("option");
  option.value = "high";
  option.textContent = "High resolution (default)";
  resolution.append(option);
  resolution.value = "high";
  row.append(resolution);
  const paragraph = document.createElement("p");
  paragraph.append(row);
  optionFields.append(paragraph);
  if (model.task !== "W01") {
    const cultureRow = document.createElement("label");
    cultureRow.textContent = "Housing culture: ";
    const culture = document.createElement("select");
    culture.setAttribute("aria-label", "Housing culture");
    for (const profile of BUILDING_APPEARANCE_PROFILES) {
      const option = document.createElement("option");
      option.value = profile;
      option.textContent = label(profile);
      culture.append(option);
    }
    culture.value = townWallHousingCulture;
    culture.addEventListener("change", () => {
      townWallHousingCulture = culture.value as BuildingAppearanceProfile;
      showTownWall(model, button, codex, view);
    });
    cultureRow.append(culture);
    optionFields.append(cultureRow);
  }
  if (model.views) {
    const viewRow = document.createElement("label");
    viewRow.textContent = "View: ";
    const viewSelect = document.createElement("select");
    viewSelect.setAttribute("aria-label", "Gatehouse view");
    for (const [index, name] of ["Exterior", ...model.views.map(item => item.name)].entries()) {
      const option = document.createElement("option");
      option.value = String(index - 1);
      option.textContent = name;
      viewSelect.append(option);
    }
    viewSelect.value = String(view);
    viewSelect.addEventListener("change", () => showTownWall(model, button, codex, Number(viewSelect.value)));
    viewRow.append(viewSelect);
    optionFields.append(viewRow);
  }
  const built = (model.views?.[view] ?? model).create(townWallHousingCulture);
  massing = built;
  scene.add(built.group);
  ground.visible = true;
  built.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(built.group, true);
  const center = bounds.getCenter(new THREE.Vector3());
  const extent = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(extent.x, extent.y, extent.z, 1);
  camera.position.copy(center).add(new THREE.Vector3(radius * 0.85, radius * 0.62, radius * 1.25));
  controls.target.copy(center);
  controls.update();
  ground.geometry.dispose();
  ground.geometry = new THREE.CircleGeometry(Math.max(radius * 0.85, 8), 48);
  mountPlan(roofHost, meshProjection(built, "side"));
  mountPlan(levelHost, meshProjection(built, "top"));
  appendFacts(
    fact("Model", `${model.task} · ${model.name}`),
    ...adoptionFacts(`town-wall.${model.id}`, "default", model.author ?? TOWN_WALL_AUTHOR),
    fact("Part", model.part),
    fact("Period", model.period ?? (codex ? CODEX_TOWN_WALL_PERIOD : "High medieval Europe")),
    fact("Resolution", "High — low and standard tiers are not prepared"),
    fact("Mesh dimensions", `${extent.x.toFixed(2)} × ${extent.z.toFixed(2)} × ${extent.y.toFixed(2)} m`),
    fact("Construction", model.note, wallWikipedia[model.id]),
    fact(
      "Scope",
      model.scope ??
        "Illustrative study of a part CE places around a town when Features → Walls is on. Metre units. Circuit placement is separate."
    )
  );
  for (const source of model.sources) {
    const row = document.createElement("p");
    const link = document.createElement("a");
    link.href = source.url;
    link.textContent = source.title;
    link.target = "_blank";
    link.rel = "noreferrer";
    row.append(link);
    appendFacts(row);
  }
}

const townWallsHeading = modelCategory("Town walls");
for (const model of TOWN_WALLS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `${model.task} · ${model.name}`;
  button.dataset.id = model.id;
  AUTHORED_VARIANTS[model.id] = {
    author: TOWN_WALL_AUTHOR,
    show: () => showTownWall(model, button)
  };
  const codexModel = CODEX_TOWN_WALLS.find(candidate => candidate.id === model.id)!;
  button.addEventListener("click", () => showTownWall(codexModel, button, true));
  townWallsHeading.append(button);
}

const gatehouseButton = document.createElement("button");
gatehouseButton.type = "button";
gatehouseButton.textContent = `${GATEHOUSE.task} · ${GATEHOUSE.name}`;
gatehouseButton.dataset.id = GATEHOUSE.id;
gatehouseButton.addEventListener("click", () => showTownWall(GATEHOUSE, gatehouseButton));
AUTHORED_VARIANTS[GATEHOUSE.id] = { author: GATEHOUSE.author!, primary: true, show: () => gatehouseButton.click() };
townWallsHeading.append(gatehouseButton);

const barbicansHeading = modelCategory("Barbicans");
for (const definition of BARBICANS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = definition.name;
  button.dataset.barbicanId = definition.id;
  button.addEventListener("click", () => {
    selection++;
    for (const item of list.querySelectorAll("button"))
      item.setAttribute("aria-current", item === button ? "true" : "false");
    clearMesh();
    floors.replaceChildren();
    facts.replaceChildren();
    banner.hidden = true;
    roofTitle.textContent = "Barbican front elevation";
    levelTitle.textContent = "Barbican top view";
    const model = createBarbican(definition);
    massing = model;
    scene.add(model.group);
    ground.visible = true;
    const bounds = new THREE.Box3().setFromObject(model.group, true);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z);
    camera.position.copy(center).add(new THREE.Vector3(radius * 0.9, radius, radius * 1.2));
    controls.target.copy(center);
    controls.update();
    ground.geometry.dispose();
    ground.geometry = new THREE.CircleGeometry(radius, 48);
    mountPlan(roofHost, meshProjection(model, "side"));
    mountPlan(levelHost, meshProjection(model, "top"));
    appendFacts(
      fact("Model", definition.name),
      fact("Period", definition.period),
      fact("Mesh dimensions", `${size.x.toFixed(2)} × ${size.z.toFixed(2)} × ${size.y.toFixed(2)} m`),
      fact("Construction", definition.note, "Barbican"),
      fact("Connection", "Castle gate attaches at negative Z. Both entrances are open; the court is unroofed."),
      fact(
        "Scope",
        "Illustrative independent forework; dimensions are invented. Top view projects the actual 3D mesh. CE placement is separate."
      )
    );
    const reference = document.createElement("a");
    reference.href = definition.reference.url;
    reference.textContent = definition.reference.title;
    reference.target = "_blank";
    reference.rel = "noopener noreferrer";
    appendFacts(reference);
  });
  barbicansHeading.append(button);
}

const signsHeading = modelCategory("Hanging shop signs");
function showSign(options: HangingSignOptions, activeButton: HTMLButtonElement): void {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === activeButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Sign front elevation";
  levelTitle.textContent = "Sign plan";
  const model = createHangingSign(options);
  massing = model;
  scene.add(model.group);
  camera.position.set(2.3, 0.5, 3.1);
  controls.target.set(0.8, -0.65, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(fact("Model", "Modular hanging shop sign"));
  modelOptions.hidden = false;
  function selector<T extends string>(name: string, values: readonly T[], selected: T, change: (value: T) => void) {
    const row = document.createElement("label");
    row.textContent = `${name}: `;
    const select = document.createElement("select");
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label(value);
      select.append(option);
    }
    select.value = selected;
    select.addEventListener("change", () => change(select.value as T));
    row.append(select);
    const paragraph = document.createElement("p");
    paragraph.append(row);
    optionFields.append(paragraph);
  }
  selector("Shape", SIGN_SHAPES, options.shape ?? "rectangle", shape => showSign({ ...options, shape }, activeButton));
  selector("Material", SIGN_MATERIALS, options.material ?? "oak", material =>
    showSign({ ...options, material }, activeButton)
  );
  selector("Symbol", SIGN_SYMBOLS, options.symbol ?? "blank", symbol => showSign({ ...options, symbol }, activeButton));
  appendFacts(
    fact(
      "Mount",
      "Wall plate at origin; +X projects from the facade. Meter units. Rotate around Y to align with the wall."
    ),
    fact("Construction", "Braced metal arm, two chains, metal rim and two-sided raised pictogram"),
    fact(
      "Note",
      "Imagined reusable templates. Building attributes and automatic placement are not assigned by this preview.",
      "Signboard"
    )
  );
}
for (const template of [
  { id: "blank", shape: "rectangle", material: "oak", symbol: "blank" },
  ...HANGING_SIGN_TEMPLATES
] as const) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = `${label(template.id)} · Hanging sign`;
  button.addEventListener("click", () => showSign(template, button));
  signsHeading.append(button);
}

const regionalHeading = modelCategory("CE regional houses");
const earthenButton = document.createElement("button");
earthenButton.type = "button";
earthenButton.textContent = "Earthen flat-roof houses";
earthenButton.dataset.id = "regional-earthen-flat";
AUTHORED_VARIANTS[earthenButton.dataset.id] = {
  author: EARTHEN_HOUSES.author,
  primary: true,
  quality: true,
  show: showEarthenHouses
};
earthenButton.addEventListener("click", showEarthenHouses);
regionalHeading.append(earthenButton);

function showEarthenHouses(): void {
  selection++;
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Front elevation";
  levelTitle.textContent = "Roof plan";
  showQuality(true);
  const quality = qualitySelect.value as RegionalHouseQuality;
  comparisonModel = { path: `earthen`, quality: quality };
  massing = createEarthenHouses(quality);
  scene.add(massing.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: 24, depth: 10 } }, 10);
  camera.position.set(15, 12, 22);
  controls.target.set(0, 4, 0);
  controls.update();
  mountPlan(roofHost, meshProjection(massing, "side"));
  mountPlan(levelHost, meshProjection(massing, "top"));
  appendFacts(
    fact("Quality", quality === "high" ? "High" : "Low — facade courses, joinery, beam ends and drains omitted"),
    fact(
      "Envelope",
      "One to three storeys, including a trapezoidal lot; walls retain the CE footprint and floor heights"
    ),
    fact("Construction", EARTHEN_HOUSES.note),
    fact("CE placement", "Automatic for supported mudbrick, flat-roof residential, retail, craft and storage lots"),
    fact("Omitted", "Interiors and roof access")
  );
}

const polygonButton = document.createElement("button");
polygonButton.type = "button";
polygonButton.textContent = "Polygonal and narrow houses";
polygonButton.dataset.id = "regional-polygon";
AUTHORED_VARIANTS[polygonButton.dataset.id] = {
  author: POLYGON_HOUSES.author,
  primary: true,
  quality: true,
  show: showPolygonHouses
};
polygonButton.addEventListener("click", showPolygonHouses);
regionalHeading.append(polygonButton);

function showPolygonHouses(): void {
  selection++;
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Front elevation";
  levelTitle.textContent = "Roof plan";
  showQuality(true);
  const quality = qualitySelect.value as RegionalHouseQuality;
  comparisonModel = { path: `polygon`, quality: quality };
  massing = createPolygonHouses(quality);
  scene.add(massing.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: 24, depth: 10 } }, 10);
  camera.position.set(15, 12, 22);
  controls.target.set(0, 4, 0);
  controls.update();
  mountPlan(roofHost, meshProjection(massing, "side"));
  mountPlan(levelHost, meshProjection(massing, "top"));
  appendFacts(
    fact("Quality", quality === "high" ? "High" : "Low — joinery and roof courses omitted"),
    fact("Construction", POLYGON_HOUSES.note),
    fact("Envelope", "2.4 m narrow gable, trapezoidal hip and concave flat-roof houses"),
    fact("CE placement", "Automatic when a supported domestic lot cannot fit the rectangular regional model"),
    fact("Omitted", "Interiors")
  );
}

for (const profile of BUILDING_APPEARANCE_PROFILES.filter(id => id !== "legacy")) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label(profile);
  button.dataset.appearanceProfile = profile;
  button.dataset.id = `regional-${profile}`;
  AUTHORED_VARIANTS[button.dataset.id] = {
    author: REGIONAL_HOUSES.author,
    show: () => showDetailedRegionalHouses(profile)
  };
  button.addEventListener("click", () => {
    selection++;
    for (const item of list.querySelectorAll("button")) item.setAttribute("aria-current", String(item === button));
    clearMesh();
    floors.replaceChildren();
    facts.replaceChildren();
    banner.hidden = true;
    roofTitle.textContent = "Front elevation";
    levelTitle.textContent = "Roof plan";
    const lots = buildingAppearancePreview(profile);
    const model = createCityMassing(lots);
    regionalDetails = createTownBuildingDetails(lots);
    scene.add(regionalDetails.group);
    massing = model;
    scene.add(model.group);
    ground.visible = true;
    frame({ occupancyMeters: { width: 24, depth: 10 } }, 10);
    mountPlan(roofHost, meshProjection(model, "side"));
    mountPlan(levelHost, meshProjection(model, "top"));
    appendFacts(
      fact("Profile", label(profile)),
      fact("Roof coverings", [...new Set(lots.map(lot => lot.massing!.roof.material))].join(", ")),
      fact(
        "Construction",
        "CE shared massing and regional colors; no separate detailed model.",
        "Vernacular architecture"
      )
    );
  });
  regionalHeading.append(button);
}

function showDetailedRegionalHouses(profile: RegionalHouseProfile): void {
  selection++;
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Front elevation";
  levelTitle.textContent = "Roof plan";
  showQuality(true);
  const quality = qualitySelect.value as RegionalHouseQuality;
  comparisonModel = { path: `regional:${profile}`, quality: quality };
  massing = createRegionalHouses(profile, quality);
  scene.add(massing.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: 24, depth: 10 } }, 10);
  camera.position.set(12, 8, 17);
  controls.target.set(0, 3.5, 0);
  controls.update();
  mountPlan(roofHost, meshProjection(massing, "side"));
  mountPlan(levelHost, meshProjection(massing, "top"));
  const { width, depth, ground: groundStorey, upper, pitchDeg } = REGIONAL_HOUSES;
  appendFacts(
    fact("Profile", label(profile)),
    fact(
      "Quality",
      quality === "high" ? "High" : "Low — frame studs, cladding, mouldings, roof courses and props omitted"
    ),
    fact(
      "Envelope",
      `${width} × ${depth} m lots, ${groundStorey} + ${upper} m storeys, ${pitchDeg}° gable — same as the CE massing`
    ),
    fact("Construction", regionalHouseNote(profile), "Vernacular architecture"),
    fact("Omitted", "Interiors, outbuildings, signage and weathering")
  );
}

const medievalModules = import.meta.glob<{ models: MedievalModel[] }>("../buildings/medieval/*Models.ts", {
  eager: true
});
for (const [file, module] of Object.entries(medievalModules).sort(([a], [b]) => a.localeCompare(b))) {
  const task = module.models[0].task;
  const category = modelCategory(
    task === 43
      ? "Trees"
      : `Medieval ${String(task).padStart(2, "0")} · ${label(
          file
            .split("/")
            .at(-1)!
            .replace(/^\d+-|Models.ts$/g, "")
        )}`
  );
  for (const definition of module.models) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = definition.name;
    button.dataset.medievalId = definition.id;
    button.dataset.id = `medieval-${definition.id}`;
    if (definition.author)
      AUTHORED_VARIANTS[button.dataset.id] = { author: definition.author, primary: true, show: () => button.click() };
    type Variant = NonNullable<MedievalModel["variants"]>[number];
    const levels = [...new Set(definition.variants?.map(entry => entry.level))];
    const adopted = (level: string) => {
      const id = adoptedVariant(definition.variants![0].family, level).id;
      return definition.variants!.find(entry => entry.id === id)!;
    };
    // Alternatives get their author in the comparison column so they never overwrite the adopted level.
    const column = (entry: Variant) =>
      entry === adopted(entry.level)
        ? entry.level
        : `${entry.level} · ${entry.author.split(" ")[0]}${entry.edition ? ` ${entry.edition}` : ""}`;
    const editionLabel = (entry: Variant) => (entry.edition ? label(entry.edition) : "Standard");
    const showModel = (variant: Variant | undefined = definition.variants && adopted(levels.at(-1)!)) => {
      selection++;
      for (const item of list.querySelectorAll("button"))
        item.setAttribute("aria-current", item === button ? "true" : "false");
      clearMesh();
      floors.replaceChildren();
      facts.replaceChildren();
      banner.hidden = true;
      roofTitle.textContent = "Front elevation";
      levelTitle.textContent = "Top view";
      selectedId = button.dataset.id!;
      selectedName.textContent = definition.name;
      if (variant)
        LEVEL_AUTHORS[selectedId] = {
          authors: [
            ...new Set(definition.variants!.filter(entry => entry.level === variant.level).map(entry => entry.author))
          ],
          current: variant.author,
          // Switching author shows that author's standard edition, or the first one they made.
          show: author => {
            const own = definition.variants!.filter(entry => entry.level === variant.level && entry.author === author);
            showModel(own.find(entry => !entry.edition) ?? own[0]);
          }
        };
      else delete LEVEL_AUTHORS[selectedId];
      listAuthors(selectedId);
      if (definition.variants) {
        modelOptions.hidden = false;
        const row = document.createElement("label");
        row.textContent = "Quality: ";
        const resolution = document.createElement("select");
        resolution.setAttribute("aria-label", "Tree model quality");
        for (const level of levels) {
          const option = document.createElement("option");
          option.value = level;
          option.textContent = adopted(level).label;
          resolution.append(option);
        }
        resolution.value = variant!.level;
        resolution.addEventListener("change", () => showModel(adopted(resolution.value)));
        row.append(resolution);
        optionFields.append(row);
        const editions = definition.variants.filter(
          entry => entry.level === variant!.level && entry.author === variant!.author
        );
        if (editions.length > 1) {
          const editionRow = document.createElement("label");
          editionRow.textContent = "Edition: ";
          const editionSelect = document.createElement("select");
          editionSelect.setAttribute("aria-label", "Model edition");
          for (const entry of editions) {
            const option = document.createElement("option");
            option.value = entry.id;
            option.textContent = editionLabel(entry);
            editionSelect.append(option);
          }
          editionSelect.value = variant!.id;
          editionSelect.addEventListener("change", () =>
            showModel(editions.find(entry => entry.id === editionSelect.value))
          );
          editionRow.append(editionSelect);
          optionFields.append(document.createElement("br"), editionRow);
        }
      }
      if (variant && definition.variants)
        comparisonVariants = {
          id: definition.id,
          levels: definition.variants.map(entry => ({ id: column(entry), label: entry.label })),
          selected: column(variant)
        };
      const model = variant ? variant.create() : definition.create();
      massing = model;
      scene.add(model.group);
      ground.visible = true;
      const bounds = new THREE.Box3().setFromObject(model.group, true);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 0.6);
      camera.position.copy(center).add(new THREE.Vector3(radius * 1.15, radius * 0.9, radius * 1.3));
      controls.target.copy(center);
      controls.update();
      ground.geometry.dispose();
      ground.geometry = new THREE.CircleGeometry(radius * 0.85, 48);
      mountPlan(roofHost, meshProjection(model, "side"));
      mountPlan(levelHost, meshProjection(model, "top"));
      appendFacts(
        fact("Model", definition.name),
        fact("Task", String(task).padStart(2, "0")),
        ...(variant
          ? [
              fact("Quality", variant.label),
              ...(variant.edition || definition.variants!.some(entry => entry.edition)
                ? [fact("Edition", editionLabel(variant))]
                : []),
              fact(
                "CE adoption",
                variant === adopted(variant.level) ? "Adopted" : `Not adopted; CE uses ${adopted(variant.level).author}`
              ),
              ...(variant.basedOn
                ? [
                    fact(
                      "Based on",
                      variant.basedOn
                        .map(id => definition.variants!.find(entry => entry.id === id))
                        .map(entry => (entry ? `${entry.label} · ${entry.author}` : ""))
                        .join(", ")
                    )
                  ]
                : []),
              ...(variant.credits
                ? [
                    fact(
                      "Credits",
                      variant.credits
                        .map(
                          credit =>
                            `${credit.date} ${credit.author}: ${credit.note}${credit.commit ? ` (${credit.commit})` : ""}`
                        )
                        .join("; ")
                    )
                  ]
                : []),
              fact(
                "Triangles",
                String(
                  model.pickables.reduce(
                    (sum, mesh) =>
                      sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3,
                    0
                  )
                )
              )
            ]
          : []),
        ...(definition.biomes ? [fact("Biomes", definition.biomes.join(", "))] : []),
        fact("Mesh dimensions", `${size.x.toFixed(2)} × ${size.z.toFixed(2)} × ${size.y.toFixed(2)} m`),
        fact(
          "Ground contact",
          definition.task === 43 && bounds.min.y < -0.1
            ? `Ground Y = 0 m; roots extend to ${bounds.min.y.toFixed(3)} m`
            : `Base Y = ${(Math.abs(bounds.min.y) < 0.0005 ? 0 : bounds.min.y).toFixed(3)} m`
        ),
        fact("Construction", definition.note, medievalWikipediaArticle(definition)),
        fact(
          "Scope",
          definition.task === 33 || definition.id === "abbey" || definition.id === "orthodox-monastery"
            ? "CE-fitted religious-house assembly; meter units. BV and CE share the same construction."
            : definition.task === 43 || definition.task === 44
              ? "Shared landscape or funerary model; meter units. Shared with CE park and cemetery 3D placement."
              : "Illustrative medieval or early modern model; meter units. CE automatic placement is separate."
        )
      );
    };
    button.addEventListener("click", () => showModel());
    category.append(button);
  }
}

const treeCoverage = modelCategory("Trees · biome coverage");
for (const biome of STANDARD_BIOME_DEFINITIONS) {
  const ready = Object.values(medievalModules)
    .flatMap(module => module.models)
    .filter(model => model.biomes?.includes(biome.key));
  const row = document.createElement("p");
  row.textContent = `${biome.label}: ${ready.length ? ready.map(model => model.name).join(", ") : Object.keys(biome.relief.icons).some(icon => ["acacia", "palm", "deciduous", "conifer", "swamp", "deadTree"].includes(icon)) ? "Tree models planned" : "No tree relief in FMG"}`;
  treeCoverage.append(row);
}

resize();
new ResizeObserver(resize).observe(stage);
renderer.setAnimationLoop(() => {
  controls.update();
  regionalDetails?.update(camera, renderer.domElement.clientHeight);
  const started = performancePanel.open ? performance.now() : null;
  renderer.render(scene, camera);
  if (started !== null) performancePanel.sample(renderer, started);
});
