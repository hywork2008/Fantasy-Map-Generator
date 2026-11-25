import { createFlintlockMusket, FLINTLOCK_MUSKET } from "../buildings/arms/flintlockMusket";
import { createPavise, PAVISE } from "../buildings/arms/pavise";
import { type Author, DEFAULT_AUTHOR } from "../buildings/authors";
import { createPolygonHouses, POLYGON_HOUSES } from "../buildings/houses/polygonHouses";
import { AMPHITHEATRE, createAmphitheatre } from "../buildings/roman/amphitheatre";
import { createForumBaths, FORUM_BATHS } from "../buildings/roman/forumBaths";
import { createInsula, INSULA } from "../buildings/roman/insula";
import { createFordCarrier, FORD_CARRIER } from "../buildings/ships/fordCarrier";
import type { GalleonState } from "../buildings/ships/galleonArmament";
import { STANDARD_BIOME_DEFINITIONS } from "../data/biomeCatalog";
import { installCatalogueFilter } from "./catalogueFilterPanel";
import "./viewer.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { BUILDING_APPEARANCE_PROFILES, type BuildingAppearanceProfile } from "../buildings/appearance/types";
import { createPontDuGard, PONT_DU_GARD, pontDuGardElevation } from "../buildings/aqueducts/pontDuGard";
import { createTudorLodging, TUDOR_LODGING } from "../buildings/camps/tudorLodging";
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
import { createModelAssembly, type ModelPartFactory } from "../buildings/modelParts";
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
import { CARAVEL, createCaravel } from "../buildings/ships/caravel";
import { CARRACK, createCarrack } from "../buildings/ships/carrack";
import { createFerryNachen, FERRY_NACHEN } from "../buildings/ships/ferryNachen";
import { createFerrySmack, FERRY_SMACK } from "../buildings/ships/ferrySmack";
import { createGalleon, GALLEON } from "../buildings/ships/galleon";
import {
  createGeminiTrireme,
  GEMINI_TRIREME,
  type GeminiTriremeQuality,
  geminiTriremeParts
} from "../buildings/ships/geminiTrireme";
import { createGrokGalleon, GROK_GALLEON, grokGalleonParts } from "../buildings/ships/grokGalleon";
import { createGrokGalley, GROK_GALLEY, grokGalleyParts } from "../buildings/ships/grokGalley";
import {
  createGrokShipOfTheLine,
  GROK_SHIP_OF_THE_LINE,
  grokShipOfTheLineParts
} from "../buildings/ships/grokShipOfTheLine";
import { createGrokTrireme, GROK_TRIREME, grokTriremeParts } from "../buildings/ships/grokTrireme";
import { createMerchantShipHigh, merchantShipParts } from "../buildings/ships/merchantShipHigh";
import {
  createOpusGalleon,
  OPUS_GALLEON,
  type OpusGalleonQuality,
  opusGalleonParts
} from "../buildings/ships/opusGalleon";
import {
  createOpusTrireme,
  OPUS_TRIREME,
  type OpusTriremeQuality,
  opusTriremeParts
} from "../buildings/ships/opusTrireme";
import { createReactionFerry, REACTION_FERRY } from "../buildings/ships/reactionFerry";
import { createRopeFerry, ROPE_FERRY } from "../buildings/ships/ropeFerry";
import { assembleSailingParts, type SailingShipState } from "../buildings/ships/sailingAssembly";
import { createSloop, SLOOP } from "../buildings/ships/sloop";
import { createSloopHigh, sloopHighParts } from "../buildings/ships/sloopHigh";
import { BATTERING_RAM, createBatteringRam } from "../buildings/siege/batteringRam";
import { BOMBARD, createBombard } from "../buildings/siege/bombard";
import { createEarlyFieldCannon, EARLY_FIELD_CANNON } from "../buildings/siege/earlyFieldCannon";
import {
  assembleGrokTrebuchet,
  createGrokTrebuchet,
  GROK_TREBUCHET,
  grokTrebuchetParts
} from "../buildings/siege/grokTrebuchet";
import { createSiegeTower, SIEGE_TOWER } from "../buildings/siege/siegeTower";
import { createTractionTrebuchet, TRACTION_TREBUCHET } from "../buildings/siege/tractionTrebuchet";
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
import { familyVariants, MODEL_VARIANTS } from "../buildings/variants";
import { B2, createB2 } from "../buildings/vehicles/b2Bomber";
import { B29, createB29 } from "../buildings/vehicles/b29Bomber";
import { BENZ_MOTORWAGEN, createBenzMotorwagen } from "../buildings/vehicles/benzMotorwagen";
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
import { createTigerTank, TIGER_I } from "../buildings/vehicles/tigerTank";
import { createWarWagon, WAR_WAGON } from "../buildings/vehicles/warWagon";
import { createWrightFlyer, WRIGHT_FLYER } from "../buildings/vehicles/wrightFlyer";
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
import { modelPartsPanel } from "./modelPartsPanel";
import { mountPerformancePanel } from "./performancePanel";
import {
  createReferencePerson,
  fitStudyCamera,
  REFERENCE_PERSON_HEIGHT_METERS,
  studyBounds,
  studyEnvelope
} from "./physicalScale";
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

const root = document.querySelector("#model-viewer");
if (!root) throw new Error("building viewer root is missing");

const entries = loadEntries();
const app = document.createElement("div");
app.className = "bv-app";
const list = document.createElement("nav");
list.className = "bv-list";
list.setAttribute("aria-label", "Model catalogue");
const heading = document.createElement("h1");
heading.textContent = "Model Viewer";
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
const AUTHORED_VARIANTS: Record<
  string,
  {
    author: Author;
    authors?: readonly Author[];
    primary?: boolean;
    quality?: boolean;
    /** High is the only prepared resolution, so the quality list cannot offer Low. */
    highOnly?: boolean;
    show: () => void;
  }
> = {
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
  for (const option of qualitySelect.options) option.disabled = false;
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
  const names = variant?.authors
    ? variant.authors
    : variant?.primary
      ? [variant.author]
      : ([DEFAULT_AUTHOR, variant?.author].filter(Boolean) as Author[]);
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    authorSelect.append(option);
  }
  authorSelect.value = variant?.primary ? variant.author : DEFAULT_AUTHOR;
  showQuality(variant?.quality === true);
  if (variant?.highOnly) {
    for (const option of qualitySelect.options) option.disabled = option.value !== "high";
    if (qualitySelect.value !== "high") qualitySelect.value = "high";
  }
}
authorSelect.addEventListener("change", () => {
  const level = LEVEL_AUTHORS[selectedId];
  if (level) return level.show(authorSelect.value as Author);
  const variant = AUTHORED_VARIANTS[selectedId];
  if (variant?.authors?.includes(authorSelect.value as Author) || (variant && authorSelect.value === variant.author))
    return variant.show();
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
const referencePerson = createReferencePerson();
referencePerson.group.visible = false;
scene.add(referencePerson.group);
const scaleToolbar = document.createElement("div");
scaleToolbar.className = "bv-scale-toolbar";
scaleToolbar.hidden = true;
const scaleCaption = document.createElement("label");
const showHuman = document.createElement("input");
showHuman.type = "checkbox";
showHuman.checked = false;
scaleCaption.append(showHuman, `Show human · ${REFERENCE_PERSON_HEIGHT_METERS.toFixed(2)} m`);
const fitModelButton = document.createElement("button");
fitModelButton.type = "button";
fitModelButton.textContent = "Fit model";
const humanScaleButton = document.createElement("button");
humanScaleButton.type = "button";
humanScaleButton.textContent = "Human scale";
humanScaleButton.disabled = true;
scaleToolbar.append(scaleCaption, fitModelButton, humanScaleButton);
stage.append(scaleToolbar);
let measuredBounds: THREE.Box3 | undefined;
let scaleReady = false;
let preserveScaleView = false;
let massing: CityStructureMeshes | null = null;
let regionalDetails: TownBuildingDetails | null = null;
let studyWater: TownWaterMeshes | null = null;
let selection = 0;
const modelComparison = createModelComparison();
let comparisonVariants: { id: string; levels: readonly { id: string; label: string }[]; selected: string } | null =
  null;
let comparisonModel: { path: string | null; quality: "low" | "high"; viewOnly?: boolean } | null = null;

function studyRoots(): THREE.Object3D[] {
  const roots: THREE.Object3D[] = [];
  if (massing) roots.push(massing.group);
  if (regionalDetails) roots.push(regionalDetails.group);
  if (studyWater) {
    roots.push(studyWater.parent);
    for (const mesh of [studyWater.land, studyWater.bank, studyWater.unknown]) if (mesh) roots.push(mesh);
  }
  return roots;
}

function fitMeasuredStudy(): void {
  if (!measuredBounds) return;
  const bounds = measuredBounds.clone();
  if (referencePerson.group.visible) bounds.union(new THREE.Box3().setFromObject(referencePerson.group, true));
  if (ground.visible) {
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    ground.geometry.dispose();
    ground.geometry = new THREE.CircleGeometry(Math.max(Math.hypot(size.x, size.z) * 0.55, 2), 48);
    ground.position.set(center.x, -0.05, center.z);
  }
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 0.01) direction.set(1, 0.7, 1);
  controls.target.copy(fitStudyCamera(camera, bounds, direction));
  controls.update();
}
fitModelButton.addEventListener("click", fitMeasuredStudy);
showHuman.addEventListener("change", () => {
  referencePerson.group.visible = showHuman.checked && measuredBounds !== undefined;
  humanScaleButton.disabled = !referencePerson.group.visible;
  fitMeasuredStudy();
});
humanScaleButton.addEventListener("click", () => {
  const target = referencePerson.group.position.clone().add(new THREE.Vector3(0, 0.9, 0));
  camera.position.copy(target).add(new THREE.Vector3(2.8, 1.1, 4.2));
  controls.target.copy(target);
  controls.update();
});
canvas.addEventListener("click", event => {
  if (!event.shiftKey || !measuredBounds || !showHuman.checked) return;
  const rect = canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(pointer, camera);
  const roots = studyRoots();
  const visible = (hit: THREE.Intersection) => {
    for (let object: THREE.Object3D | null = hit.object; object; object = object.parent)
      if (!object.visible) return false;
    return true;
  };
  const hit = ray.intersectObjects(roots, true).find(visible);
  if (!hit) return;
  // Stand in front of the clicked wall, on the ground or a landing below it.
  const offset = new THREE.Vector3(-ray.ray.direction.x, 0, -ray.ray.direction.z).normalize().multiplyScalar(0.35);
  const feet = hit.point.clone().add(offset);
  const downward = new THREE.Raycaster(feet.clone().add(new THREE.Vector3(0, 0.05, 0)), new THREE.Vector3(0, -1, 0));
  const support = downward.intersectObjects(roots, true).find(visible);
  feet.y = support?.point.y ?? 0;
  referencePerson.group.position.copy(feet);
});

function appendFacts(...nodes: (Node | string)[]): void {
  // Every family reports the displayed geometry, rather than its old camera-framing estimate.
  facts.append(...nodes);
  if (!scaleReady) {
    measuredBounds = studyBounds(studyRoots());
    if (measuredBounds) {
      referencePerson.group.position.set(measuredBounds.min.x - 0.8, 0, measuredBounds.max.z + 0.2);
      referencePerson.group.visible = showHuman.checked;
      humanScaleButton.disabled = !showHuman.checked;
      scaleToolbar.hidden = false;
      const summary = document.createElement("section");
      summary.className = "bv-physical-scale";
      summary.append(
        fact("Study envelope", studyEnvelope(measuredBounds)),
        fact("Scale", `1 unit = 1 m; human reference ${REFERENCE_PERSON_HEIGHT_METERS.toFixed(2)} m`),
        fact(
          "Axes",
          "Width X × depth Z × height Y. Includes modelled site; excludes viewer ground and reference figure."
        ),
        fact(
          "Reference placement",
          "Enable Show human to display the 1.70 m figure. Feet start at Y = 0 m. Shift-click a surface to place it beside a door or on a deck, then choose Human scale."
        )
      );
      facts.prepend(summary);
      scaleReady = true;
      if (!preserveScaleView) fitMeasuredStudy();
    }
  }
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
  modelComparison.mount(
    facts,
    comparisonModel?.path ?? null,
    comparisonModel?.quality ?? null,
    root,
    comparisonModel?.viewOnly
  );
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

function clearMesh(preserveOptions = false): void {
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minPolarAngle = 0;
  scene.environment = null;
  preserveScaleView = preserveOptions;
  scaleReady = false;
  measuredBounds = undefined;
  referencePerson.group.visible = false;
  scaleToolbar.hidden = true;
  ground.position.set(0, -0.05, 0);
  comparisonModel = null;
  comparisonVariants = null;
  modelComparison.clear();
  performancePanel.reset();
  if (regionalDetails) {
    scene.remove(regionalDetails.group);
    regionalDetails.dispose();
    regionalDetails = null;
  }
  if (!preserveOptions) {
    optionFields.replaceChildren();
    modelOptions.hidden = true;
  }
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
aqueductButton.dataset.id = "pont-du-gard";
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
stGeorgesButton.dataset.id = "st-georges-chapel";
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
    let selectedPart = "all";
    const showLandmark = (definition: LandmarkModel = model, keepControls = false) => {
      selection++;
      for (const other of list.querySelectorAll("button")) other.setAttribute("aria-current", String(other === button));
      clearMesh(keepControls);
      floors.replaceChildren();
      facts.replaceChildren();
      banner.hidden = true;
      roofTitle.textContent = "Exterior roof plan";
      levelTitle.textContent = "South elevation";
      if (definition.towerGeneration && !keepControls) {
        modelOptions.hidden = false;
        const generation = definition.towerGeneration;
        const row = document.createElement("label");
        row.textContent = "Terrace projection: ";
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "12";
        slider.step = "0.25";
        slider.value = String(generation.overhang);
        slider.setAttribute("aria-label", "Terrace projection");
        const output = document.createElement("output");
        output.value = `${generation.overhang} m`;
        slider.addEventListener("input", () => {
          generation.overhang = slider.valueAsNumber;
          output.value = `${generation.overhang} m`;
          showLandmark(definition, true);
        });
        row.append(slider, output);
        const regenerate = document.createElement("button");
        regenerate.type = "button";
        regenerate.textContent = "Randomize corridors";
        regenerate.addEventListener("click", () => {
          generation.regenerate();
          showLandmark(definition);
        });
        const paragraph = document.createElement("p");
        paragraph.append(row, document.createElement("br"), regenerate);
        optionFields.append(paragraph);
      }
      if (definition.terrainGeneration) {
        modelOptions.hidden = false;
        const generation = definition.terrainGeneration;
        const row = document.createElement("label");
        row.textContent = "Upper surface: ";
        const surface = document.createElement("select");
        surface.setAttribute("aria-label", "Upper surface");
        for (const [value, title] of [
          ["terrain", "Random terrain"],
          ["flat", "Flat"]
        ] as const) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = title;
          surface.append(option);
        }
        surface.value = generation.surface;
        surface.addEventListener("change", () => {
          generation.surface = surface.value === "flat" ? "flat" : "terrain";
          showLandmark(definition);
        });
        row.append(surface);
        const regenerate = document.createElement("button");
        regenerate.type = "button";
        regenerate.textContent = "Regenerate";
        regenerate.addEventListener("click", () => {
          generation.regenerate();
          showLandmark(definition);
        });
        const paragraph = document.createElement("p");
        paragraph.append(row, document.createTextNode(" "), regenerate);
        optionFields.append(paragraph);
      }
      if (model.highDetail || model.ultraDetail) {
        modelOptions.hidden = false;
        const row = document.createElement("label");
        row.textContent = model.parts ? "Assembly resolution: " : "Resolution: ";
        const resolution = document.createElement("select");
        resolution.setAttribute("aria-label", "Landmark resolution");
        for (const [value, title] of [
          ["low", "Low resolution (default)"],
          ...(model.highDetail ? [["high", "High resolution"]] : []),
          ...(model.ultraDetail ? [["ultra", "Ultra resolution"]] : [])
        ]) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = title;
          resolution.append(option);
        }
        resolution.value = definition === model ? "low" : definition === model.ultraDetail ? "ultra" : "high";
        resolution.addEventListener("change", () =>
          showLandmark(
            resolution.value === "ultra" ? model.ultraDetail : resolution.value === "high" ? model.highDetail : model
          )
        );
        row.append(resolution);
        const paragraph = document.createElement("p");
        paragraph.append(row);
        optionFields.append(paragraph);
      }
      if (model.ultraDetail) {
        comparisonVariants = {
          id: model.id,
          levels: [
            { id: "low", label: "Low" },
            ...(model.highDetail ? [{ id: "high", label: "High" }] : []),
            { id: "ultra", label: "Ultra" }
          ],
          selected: definition === model ? "low" : definition === model.ultraDetail ? "ultra" : "high"
        };
      } else if (model.highDetail) {
        comparisonModel = {
          path: Object.keys(landmarkModules).find(path => landmarkModules[path] === model)!,
          quality: definition === model ? "low" : "high"
        };
      }
      const partFactories = definition.parts?.();
      if (!partFactories?.some(part => part.id === selectedPart)) selectedPart = "all";
      const partFactory = partFactories?.find(part => part.id === selectedPart);
      if (partFactories) {
        modelOptions.hidden = false;
        const row = document.createElement("label");
        row.textContent = "View: ";
        const select = document.createElement("select");
        select.setAttribute("aria-label", "Assembly part");
        select.add(new Option("Complete assembly", "all"));
        for (const part of partFactories)
          select.add(new Option(`${label(part.role)} · ${label(part.quality)}`, part.id));
        select.value = selectedPart;
        select.addEventListener("change", () => {
          selectedPart = select.value;
          showLandmark(definition);
        });
        row.append(select);
        const paragraph = document.createElement("p");
        paragraph.append(row);
        optionFields.append(paragraph);
      }
      if (partFactory) {
        comparisonVariants = null;
        comparisonModel = { path: null, quality: partFactory.quality === "low" ? "low" : "high", viewOnly: true };
      }
      massing = partFactory
        ? (definition.assembleParts ?? (parts => createModelAssembly(model.id, parts)))([partFactory])
        : definition.create();
      scene.add(massing.group);
      ground.visible = !definition.floating;
      if (!keepControls) {
        frame({ occupancyMeters: { width: definition.size[0], depth: definition.size[1] } }, definition.size[2]);
        // Fit the actual bounding sphere to both viewport axes, including very tall spires.
        const sphere = new THREE.Box3().setFromObject(massing.group).getBoundingSphere(new THREE.Sphere());
        const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect));
        const distance = (sphere.radius / Math.sin(halfFov)) * 1.08;
        camera.position.copy(new THREE.Vector3(-1, 0.7, 1.1).normalize().multiplyScalar(distance).add(sphere.center));
        controls.target.copy(sphere.center);
        controls.update();
      }
      mountPlan(roofHost, meshProjection(massing, "top"));
      mountPlan(levelHost, meshProjection(massing, "side"));
      if (definition.terrainGeneration) appendFacts(fact("Seed", definition.terrainGeneration.seed));
      if (definition.towerGeneration) {
        const branches = massing.group.userData.branches as { length: number }[];
        appendFacts(
          fact("Seed", definition.towerGeneration.seed),
          fact("Satellite towers", String(branches.length)),
          fact(
            "Corridor clear spans",
            branches.length ? branches.map(branch => `${branch.length.toFixed(1)} m`).join(", ") : "None"
          )
        );
      }
      appendFacts(
        fact("Model", definition.name),
        fact("Style", definition.style),
        fact("State", definition.state),
        fact("Dimensions", definition.dimensions),
        fact("Note", definition.note, landmarkWikipedia[model.id])
      );
      if (partFactory) {
        appendFacts(
          fact("View", `Single part: ${label(partFactory.role)}; fitted position retained`),
          fact("Part quality", partFactory.quality),
          fact("Part author", partFactory.author),
          fact(
            "Assembly",
            "Fixed landmark exterior study; components are for inspection and are not interchangeable building presets."
          )
        );
      }
      const partsPanel = modelPartsPanel(massing.group);
      if (partsPanel) facts.append(partsPanel);
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
    button.addEventListener("click", () => {
      selectedPart = "all";
      showLandmark();
    });
  }
}
const assemblies = modelCategory("Fortress assemblies");
const bojniceButton = document.createElement("button");
bojniceButton.dataset.id = "bojnice-castle";
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
chambordButton.dataset.id = "chambord";
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
  button.dataset.id = `krak-${phase}`;
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
cliffButton.dataset.id = "cliff-fortress";
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
terraceButton.dataset.id = "terraced-river";
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
carrackButton.dataset.id = "carrack";
AUTHORED_VARIANTS.carrack = {
  author: CARRACK.author,
  primary: true,
  quality: true,
  show: () => showSailingShip("carrack")
};
carrackButton.addEventListener("click", () => showSailingShip("carrack"));
shipsHeading.append(carrackButton);
const caravelButton = document.createElement("button");
caravelButton.type = "button";
caravelButton.dataset.id = "caravel";
caravelButton.textContent = "Caravel · Two-masted lateen ship";
AUTHORED_VARIANTS.caravel = {
  author: CARAVEL.author,
  primary: true,
  quality: true,
  show: () => showSailingShip("caravel")
};
caravelButton.addEventListener("click", () => showSailingShip("caravel"));
shipsHeading.append(caravelButton);

const galleonButton = document.createElement("button");
galleonButton.type = "button";
galleonButton.textContent = "Galleon · Three-masted sailing ship";
galleonButton.dataset.id = "galleon";
AUTHORED_VARIANTS.galleon = {
  author: OPUS_GALLEON.author,
  authors: [DEFAULT_AUTHOR, OPUS_GALLEON.author, GROK_GALLEON.author],
  quality: true,
  show: () => showGalleon()
};
const galleonState: Required<GalleonState> & { ensign: boolean; windows: "open" | "closed" } = {
  sails: "set",
  gunports: "open",
  ensign: false,
  windows: "open"
};
const galleonPartsSelected = { codex: "all", opus: "all", grok: "all" };
function showGalleon(author: string = authorSelect.value): void {
  const opus = author === OPUS_GALLEON.author;
  const grok = author === GROK_GALLEON.author;
  const key = grok ? "grok" : opus ? "opus" : "codex";
  for (const option of qualitySelect.options) if (option.value === "low") option.disabled = grok;
  if (grok && qualitySelect.value !== "high") qualitySelect.value = "high";
  const quality = qualitySelect.value as OpusGalleonQuality,
    high = quality === "high";
  const info = grok ? GROK_GALLEON : opus ? OPUS_GALLEON : GALLEON;
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === galleonButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Ship elevation";
  levelTitle.textContent = "Deck plan";
  showQuality(true);
  const parts: readonly ModelPartFactory[] = grok
    ? grokGalleonParts(galleonState)
    : opus
      ? opusGalleonParts(quality, galleonState)
      : high
        ? merchantShipParts("galleon", galleonState)
        : [
            {
              id: "low-assembly",
              role: "Legacy assembly",
              author: GALLEON.author,
              quality: "low",
              create: () => createGalleon(galleonState)
            }
          ];
  if (!parts.some(p => p.id === galleonPartsSelected[key])) galleonPartsSelected[key] = "all";
  const chosen = parts.find(p => p.id === galleonPartsSelected[key]);
  const model = chosen
    ? opus
      ? chosen.create()
      : assembleSailingParts("galleon-part", [chosen])
    : grok
      ? createGrokGalleon(galleonState)
      : opus
        ? createOpusGalleon(quality, galleonState)
        : high
          ? createMerchantShipHigh("galleon", galleonState)
          : createGalleon(galleonState);
  comparisonModel = { path: null, quality, viewOnly: true };
  for (const [label, field, options] of [
    [
      "Sails",
      "sails",
      [
        ["Set", "set"],
        ["Furled · moored", "furled"]
      ]
    ],
    [
      "Gunports",
      "gunports",
      [
        ["Open", "open"],
        ["Closed", "closed"]
      ]
    ]
  ] as const) {
    const input = document.createElement("select");
    input.setAttribute("aria-label", label);
    for (const [name, value] of options) input.add(new Option(name, value));
    input.value = galleonState[field];
    input.addEventListener("change", () => {
      if (field === "sails") galleonState.sails = input.value as "set" | "furled";
      else galleonState.gunports = input.value as "open" | "closed";
      showGalleon(author);
    });
    const row = document.createElement("label");
    row.append(label, input);
    optionFields.append(row);
  }
  if (grok) {
    const input = document.createElement("select");
    input.setAttribute("aria-label", "Windows");
    input.add(new Option("Open", "open"));
    input.add(new Option("Shut", "closed"));
    input.value = galleonState.windows;
    input.addEventListener("change", () => {
      galleonState.windows = input.value as "open" | "closed";
      showGalleon(author);
    });
    const row = document.createElement("label");
    row.append("Windows", input);
    optionFields.append(row);
  }
  const partSelect = document.createElement("select");
  partSelect.setAttribute("aria-label", "Assembly part");
  partSelect.add(new Option("Complete ship", "all"));
  for (const part of parts) partSelect.add(new Option(`${part.role} · ${part.quality}`, part.id));
  partSelect.value = galleonPartsSelected[key];
  partSelect.addEventListener("change", () => {
    galleonPartsSelected[key] = partSelect.value;
    showGalleon(author);
  });
  const partRow = document.createElement("label");
  partRow.append("Assembly part", partSelect);
  optionFields.append(partRow);
  if (opus) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = galleonState.ensign;
    input.addEventListener("change", () => {
      galleonState.ensign = input.checked;
      showGalleon(author);
    });
    const row = document.createElement("label");
    row.append(input, " Stern ensign");
    optionFields.append(row);
  }
  modelOptions.hidden = false;
  massing = model;
  scene.add(model.group);
  frame({ occupancyMeters: { width: info.length, depth: info.beam } }, info.height);
  camera.position.set(info.length * 0.92, info.height * 0.8, info.length * 1.15);
  controls.target.set(2, info.height * 0.43, 0);
  controls.update();
  mountPlan(roofHost, meshProjection(model, "side"));
  mountPlan(levelHost, meshProjection(model, "top"));
  appendFacts(
    fact("Model", info.name),
    fact("Quality", grok ? "High — the only prepared resolution" : high ? "High" : "Low"),
    fact("Sails", galleonState.sails),
    fact("Gunports", galleonState.gunports),
    ...(grok ? [fact("Windows", galleonState.windows)] : []),
    fact(
      "CE adoption",
      grok
        ? "Not adopted; CE uses Codex GPT-6.1 Sol. High is BV-only"
        : opus
          ? "BV-only comparison"
          : "Legacy default (Low); sail and gunport states supported in CE; High is BV-only"
    ),
    fact(
      "Dimensions",
      `${info.length} m over spars × ${info.beam} m hull beam; ${info.height} m above water; ${info.draft} m draft`
    ),
    fact(
      "Armament",
      grok
        ? "26 guns: 16 lower-deck, 8 waist, 2 stern chasers"
        : opus
          ? "28 guns, including two stern chasers"
          : "14 broadside guns"
    ),
    ...(grok ? [fact("Rig", "Four masts, courses and topsails, two lateens and a spritsail")] : []),
    fact("Note", info.note, "Galleon")
  );
  const panel = modelPartsPanel(model.group);
  if (panel) facts.append(panel);
}
galleonButton.addEventListener("click", () => showGalleon(GALLEON.author));
shipsHeading.append(galleonButton);

const lineButton = document.createElement("button");
lineButton.type = "button";
lineButton.textContent = "Ship of the line · First-rate, HMS Victory";
lineButton.dataset.id = "ship-of-the-line";
const lineState: { sails: "set" | "furled"; gunports: "open" | "closed"; windows: "open" | "closed"; part: string } = {
  sails: "set",
  gunports: "open",
  windows: "open",
  part: "all"
};
AUTHORED_VARIANTS["ship-of-the-line"] = {
  author: GROK_SHIP_OF_THE_LINE.author,
  primary: true,
  quality: true,
  highOnly: true,
  show: () => showShipOfTheLine()
};
function showShipOfTheLine(): void {
  if (qualitySelect.value !== "high") qualitySelect.value = "high";
  for (const option of qualitySelect.options) option.disabled = option.value !== "high";
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === lineButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Ship elevation";
  levelTitle.textContent = "Deck plan";
  showQuality(true);
  const parts = grokShipOfTheLineParts(lineState);
  if (!parts.some(part => part.id === lineState.part)) lineState.part = "all";
  const chosen = parts.find(part => part.id === lineState.part);
  const model = chosen ? assembleSailingParts("ship-of-the-line-part", [chosen]) : createGrokShipOfTheLine(lineState);
  comparisonModel = { path: null, quality: "high", viewOnly: true };
  for (const [label, field, options] of [
    [
      "Sails",
      "sails",
      [
        ["Set", "set"],
        ["Furled · moored", "furled"]
      ]
    ],
    [
      "Gunports",
      "gunports",
      [
        ["Open", "open"],
        ["Closed", "closed"]
      ]
    ],
    [
      "Windows",
      "windows",
      [
        ["Open", "open"],
        ["Shut", "closed"]
      ]
    ]
  ] as const) {
    const input = document.createElement("select");
    input.setAttribute("aria-label", label);
    for (const [name, value] of options) input.add(new Option(name, value));
    input.value = lineState[field];
    input.addEventListener("change", () => {
      (lineState as Record<string, string>)[field] = input.value;
      showShipOfTheLine();
    });
    const row = document.createElement("label");
    row.append(label, input);
    optionFields.append(row);
  }
  const partSelect = document.createElement("select");
  partSelect.setAttribute("aria-label", "Assembly part");
  partSelect.add(new Option("Complete ship", "all"));
  for (const part of parts) partSelect.add(new Option(`${part.role} · ${part.quality}`, part.id));
  partSelect.value = lineState.part;
  partSelect.addEventListener("change", () => {
    lineState.part = partSelect.value;
    showShipOfTheLine();
  });
  const partRow = document.createElement("label");
  partRow.append("Assembly part", partSelect);
  optionFields.append(partRow);
  modelOptions.hidden = false;
  massing = model;
  scene.add(model.group);
  const info = GROK_SHIP_OF_THE_LINE;
  frame({ occupancyMeters: { width: info.length, depth: info.beam } }, info.height);
  camera.position.set(info.length * 0.95, info.height * 0.55, info.length * 1.05);
  controls.target.set(2, info.height * 0.28, 0);
  controls.update();
  mountPlan(roofHost, meshProjection(model, "side"));
  mountPlan(levelHost, meshProjection(model, "top"));
  appendFacts(
    fact("Model", info.name),
    fact("Quality", "High — the only prepared resolution"),
    fact("Sails", lineState.sails),
    fact("Gunports", lineState.gunports),
    fact("Windows", lineState.windows),
    fact("CE adoption", "Not placed by CE. BV-only; CE keeps sloop, caravel, galleon and barge"),
    fact(
      "Dimensions",
      `${info.length} m sparred envelope × ${info.beam} m moulded beam; ${info.height} m to the main truck; ${info.draft} m illustrative waterline`
    ),
    fact(
      "Armament",
      "104 guns: 30 lower 32-pounders, 28 middle 24-pounders, 30 upper 12-pounders, 10 quarterdeck 12-pounders, 2 stern chasers, 2 forecastle 12-pounders and 2 carronades"
    ),
    fact("Rig", "Three masts, courses, topsails and topgallants, spanker, spritsail and two jibs"),
    fact("Note", info.note, "HMS Victory")
  );
  const panel = modelPartsPanel(model.group);
  if (panel) facts.append(panel);
}
lineButton.addEventListener("click", () => showShipOfTheLine());
shipsHeading.append(lineButton);

const galleyButton = document.createElement("button");
galleyButton.type = "button";
galleyButton.textContent = "Galley · Mediterranean war galley";
galleyButton.dataset.id = "galley";
const galleyState: {
  sails: "set" | "furled";
  oars: "out" | "stowed";
  guns: "run-out" | "housed";
  part: string;
} = { sails: "set", oars: "out", guns: "run-out", part: "all" };
AUTHORED_VARIANTS.galley = {
  author: GROK_GALLEY.author,
  primary: true,
  quality: true,
  highOnly: true,
  show: () => showGalley()
};
function showGalley(): void {
  if (qualitySelect.value !== "high") qualitySelect.value = "high";
  for (const option of qualitySelect.options) option.disabled = option.value !== "high";
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === galleyButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Ship elevation";
  levelTitle.textContent = "Deck plan";
  showQuality(true);
  const parts = grokGalleyParts(galleyState);
  if (!parts.some(part => part.id === galleyState.part)) galleyState.part = "all";
  const chosen = parts.find(part => part.id === galleyState.part);
  const model = chosen ? assembleSailingParts("galley-part", [chosen]) : createGrokGalley(galleyState);
  comparisonModel = { path: null, quality: "high", viewOnly: true };
  for (const [label, field, options] of [
    [
      "Sails",
      "sails",
      [
        ["Set", "set"],
        ["Furled · moored", "furled"]
      ]
    ],
    [
      "Oars",
      "oars",
      [
        ["Out", "out"],
        ["Stowed", "stowed"]
      ]
    ],
    [
      "Bow guns",
      "guns",
      [
        ["Run out", "run-out"],
        ["Housed", "housed"]
      ]
    ]
  ] as const) {
    const input = document.createElement("select");
    input.setAttribute("aria-label", label);
    for (const [name, value] of options) input.add(new Option(name, value));
    input.value = galleyState[field];
    input.addEventListener("change", () => {
      if (field === "sails") galleyState.sails = input.value as (typeof galleyState)["sails"];
      else if (field === "oars") galleyState.oars = input.value as (typeof galleyState)["oars"];
      else galleyState.guns = input.value as (typeof galleyState)["guns"];
      showGalley();
    });
    const row = document.createElement("label");
    row.append(label, input);
    optionFields.append(row);
  }
  const partSelect = document.createElement("select");
  partSelect.setAttribute("aria-label", "Assembly part");
  partSelect.add(new Option("Complete ship", "all"));
  for (const part of parts) partSelect.add(new Option(`${part.role} · ${part.quality}`, part.id));
  partSelect.value = galleyState.part;
  partSelect.addEventListener("change", () => {
    galleyState.part = partSelect.value;
    showGalley();
  });
  const partRow = document.createElement("label");
  partRow.append("Assembly part", partSelect);
  optionFields.append(partRow);
  modelOptions.hidden = false;
  massing = model;
  scene.add(model.group);
  const info = GROK_GALLEY;
  frame({ occupancyMeters: { width: info.length, depth: info.beam } }, info.height);
  camera.position.set(info.length * 0.85, info.height * 0.55, info.length * 0.7);
  controls.target.set(0, 2.2, 0);
  controls.update();
  mountPlan(roofHost, meshProjection(model, "side"));
  mountPlan(levelHost, meshProjection(model, "top"));
  appendFacts(
    fact("Model", info.name),
    fact("Quality", "High — the only prepared resolution"),
    fact("Sails", galleyState.sails),
    fact("Oars", galleyState.oars),
    fact("Bow guns", galleyState.guns),
    fact("CE adoption", "Not placed by CE. BV-only; CE keeps sloop, caravel, galleon and barge"),
    fact(
      "Dimensions",
      `${info.length} m sparred envelope × ${info.beam} m moulded beam; ${info.height} m above the waterline; ${info.draft} m illustrative waterline`
    ),
    fact("Armament", "5-gun bow battery: one centerline gun and four flanking guns on the rambade"),
    fact("Oarsmen", "48 oars, 24 banks a side, one oar to a bank"),
    fact("Rig", "Two lateen sails, fore and main, on one tack"),
    fact("Note", info.note, "Galley")
  );
  const panel = modelPartsPanel(model.group);
  if (panel) facts.append(panel);
}
galleyButton.addEventListener("click", () => showGalley());
shipsHeading.append(galleyButton);

const triremeButton = document.createElement("button");
triremeButton.type = "button";
triremeButton.textContent = "Trireme · Olympias";
triremeButton.dataset.id = "trireme";
const triremeState: { sails: "set" | "furled" | "struck"; oars: "out" | "stowed" } = {
  sails: "set",
  oars: "out"
};
AUTHORED_VARIANTS.trireme = {
  author: GROK_TRIREME.author,
  authors: [GROK_TRIREME.author, OPUS_TRIREME.author, GEMINI_TRIREME.author],
  primary: true,
  quality: true,
  show: () => showTrireme()
};
const triremePartSelected = { grok: "all", opus: "all", gemini: "all" };
function showTrireme(author: string = authorSelect.value): void {
  const opus = author === OPUS_TRIREME.author;
  const gemini = author === GEMINI_TRIREME.author;
  const multiTier = opus || gemini;
  const key = opus ? "opus" : gemini ? "gemini" : "grok";
  // Grok 4.7 prepared High only; the Opus and Gemini editions also have a light Low tier.
  for (const option of qualitySelect.options) option.disabled = !multiTier && option.value !== "high";
  if (!multiTier && qualitySelect.value !== "high") qualitySelect.value = "high";
  const quality = (multiTier ? qualitySelect.value : "high") as OpusTriremeQuality | GeminiTriremeQuality;
  // The Opus and Gemini editions can strike the main mast for battle trim.
  if (!multiTier && triremeState.sails === "struck") triremeState.sails = "furled";
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === triremeButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Ship elevation";
  levelTitle.textContent = "Deck plan";
  showQuality(true);
  const parts = opus
    ? opusTriremeParts(quality, triremeState)
    : gemini
      ? geminiTriremeParts(quality, triremeState)
      : grokTriremeParts({
          sails: triremeState.sails === "struck" ? "furled" : triremeState.sails,
          oars: triremeState.oars
        });
  if (!parts.some(entry => entry.id === triremePartSelected[key])) triremePartSelected[key] = "all";
  const chosen = parts.find(entry => entry.id === triremePartSelected[key]);
  const model = chosen
    ? assembleSailingParts("trireme-part", [chosen])
    : opus
      ? createOpusTrireme(quality, triremeState)
      : gemini
        ? createGeminiTrireme(quality, triremeState)
        : createGrokTrireme({
            sails: triremeState.sails === "struck" ? "furled" : triremeState.sails,
            oars: triremeState.oars
          });
  comparisonModel = { path: null, quality, viewOnly: true };
  for (const [label, field, options] of [
    [
      "Sails",
      "sails",
      multiTier
        ? [
            ["Set", "set"],
            ["Brailed up · moored", "furled"],
            ["Mast struck · battle trim", "struck"]
          ]
        : [
            ["Set", "set"],
            ["Furled · moored", "furled"]
          ]
    ],
    [
      "Oars",
      "oars",
      [
        ["Out", "out"],
        ["Stowed", "stowed"]
      ]
    ]
  ] as const) {
    const input = document.createElement("select");
    input.setAttribute("aria-label", label);
    for (const [name, value] of options) input.add(new Option(name, value));
    input.value = triremeState[field];
    input.addEventListener("change", () => {
      if (field === "sails") triremeState.sails = input.value as (typeof triremeState)["sails"];
      else triremeState.oars = input.value as (typeof triremeState)["oars"];
      showTrireme(author);
    });
    const row = document.createElement("label");
    row.append(label, input);
    optionFields.append(row);
  }
  const partSelect = document.createElement("select");
  partSelect.setAttribute("aria-label", "Assembly part");
  partSelect.add(new Option("Complete ship", "all"));
  for (const entry of parts) partSelect.add(new Option(`${entry.role} · ${entry.quality}`, entry.id));
  partSelect.value = triremePartSelected[key];
  partSelect.addEventListener("change", () => {
    triremePartSelected[key] = partSelect.value;
    showTrireme(author);
  });
  const partRow = document.createElement("label");
  partRow.append("Assembly part", partSelect);
  optionFields.append(partRow);
  modelOptions.hidden = false;
  massing = model;
  scene.add(model.group);
  const info = opus ? OPUS_TRIREME : gemini ? GEMINI_TRIREME : GROK_TRIREME;
  frame({ occupancyMeters: { width: info.length, depth: info.beam } }, info.height);
  camera.position.set(info.length * 0.95, info.height * 0.62, info.length * 0.85);
  controls.target.set(0, 1.15, 0);
  controls.update();
  mountPlan(roofHost, meshProjection(model, "side"));
  mountPlan(levelHost, meshProjection(model, "top"));
  appendFacts(
    fact("Model", info.name),
    fact("Quality", multiTier ? (quality === "high" ? "High" : "Low") : "High — the only prepared resolution"),
    fact("Sails", triremeState.sails),
    fact("Oars", triremeState.oars),
    fact(
      "CE adoption",
      multiTier
        ? "BV-only comparison; CE places the Grok 4.7 High"
        : "Placed by hand in CE (Model ships); the adopted High edition"
    ),
    fact(
      "Dimensions",
      gemini
        ? `${info.length} m ram to aphlaston × ${info.beam} m over the outriggers (${GEMINI_TRIREME.hullBeam} m hull, ${GEMINI_TRIREME.canopyBeam} m canopy deck); ${info.height} m to the main truck; ${info.draft} m draught`
        : opus
          ? `${info.length} m ram to aphlaston × ${info.beam} m over the outriggers (${OPUS_TRIREME.hullBeam} m hull); ${info.height} m to the main truck; ${info.draft} m draught`
          : `${info.length} m overall × ${info.beam} m beam over the outrigger; ${info.height} m above the waterline; ${info.draft} m illustrative waterline`
    ),
    fact(
      "Ram",
      gemini
        ? "Cast Piraeus-type three-bladed bronze ram straddling the waterline (no proembolion)"
        : opus
          ? "Three-finned bronze ram on the waterline, with a bronze-capped proembolion above"
          : "Bronze bow ram on the waterline"
    ),
    fact(
      "Oarsmen",
      gemini
        ? "170 sculpted 4.0–4.2 m oars on one 0.888 m room: 62 thranites on the framed parexeiresia, 54 zygites on the gunwale, 54 thalamites through askomata ports"
        : opus
          ? "170 oars on one 0.888 m room: 62 thranites on the outrigger, 54 zygites on the gunwale, 54 thalamites through leather-sleeved ports"
          : "170 oars in three banks: 62 thranite, 54 zygite, 54 thalamite"
    ),
    fact(
      "Rig",
      gemini
        ? "13 m arched main yard with ~95 m² brailed square sail and raked ~24 m² akateion; main mast strikes onto deck crutches for battle"
        : opus
          ? "Brailed square main sail and a raked boat sail (akateion); the main mast strikes onto deck crutches for battle"
          : "Two square sails, main and fore"
    ),
    fact("Note", info.note, "Olympias (trireme)")
  );
  const panel = modelPartsPanel(model.group);
  if (panel) facts.append(panel);
}
triremeButton.addEventListener("click", () => showTrireme(GROK_TRIREME.author));
shipsHeading.append(triremeButton);

const fordButton = document.createElement("button");
fordButton.type = "button";
fordButton.dataset.id = "ford-carrier";
fordButton.textContent = "Gerald R. Ford-class · US nuclear aircraft carrier, 2017–";
function showFordCarrier(): void {
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === fordButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "Carrier side elevation";
  levelTitle.textContent = "Flight deck plan";
  const model = createFordCarrier(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = false;
  const info = FORD_CARRIER;
  frame({ occupancyMeters: { width: info.length, depth: info.beam } }, info.height);
  camera.position.set(150, 70, 140);
  controls.target.set(0, 15, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", info.name),
    fact("Author", info.author),
    fact("Period", "United States Navy, lead ship USS Gerald R. Ford (CVN-78) in service from 2017"),
    fact(
      "Dimensions",
      `${info.length} m overall × ${info.beam} m flight deck (${info.waterlineBeam} m at the waterline); ${info.draft} m draft; ${info.height} m keel to mast top; flight deck ${info.flightDeckHeight} m above the waterline`
    ),
    fact(
      "Flight deck",
      "9° angled landing area, four EMALS catapults (two bow, two waist), three arresting wires, three elevators"
    ),
    fact("Propulsion", "Two Bechtel A1B reactors, four shafts"),
    fact("Self-defence", "Two Mk 29 ESSM and two Mk 49 RAM launchers, three Phalanx CIWS"),
    fact("Radar", "Dual Band Radar on the island: AN/SPY-3 (X band) and AN/SPY-4 (S band)"),
    fact("CE adoption", "Not placed by CE; Model Viewer only"),
    fact("Quality", quality === "high" ? "High" : "Low — plain deck, island and hull without markings or weapons"),
    fact("Note", info.note, "Gerald R. Ford-class aircraft carrier"),
    ...(quality === "high" ? [fact("High detail", info.highNote)] : [])
  );
}
fordButton.addEventListener("click", () => showFordCarrier());
shipsHeading.append(fordButton);
AUTHORED_VARIANTS[fordButton.dataset.id] = {
  author: FORD_CARRIER.author,
  primary: true,
  quality: true,
  show: () => showFordCarrier()
};

const sloopButton = document.createElement("button");
sloopButton.type = "button";
sloopButton.textContent = "Sloop · Small coastal sailing ship";
sloopButton.dataset.id = "sloop";
AUTHORED_VARIANTS.sloop = { author: SLOOP.author, primary: true, quality: true, show: () => showSailingShip("sloop") };
type SailingStudy = "sloop" | "caravel" | "carrack";
const sailingStudies = {
  sloop: { info: SLOOP, button: sloopButton, low: createSloop, high: createSloopHigh, parts: sloopHighParts },
  caravel: {
    info: CARAVEL,
    button: caravelButton,
    low: createCaravel,
    high: (state: SailingShipState) => createMerchantShipHigh("caravel", state),
    parts: (state: SailingShipState) => merchantShipParts("caravel", state)
  },
  carrack: {
    info: CARRACK,
    button: carrackButton,
    low: createCarrack,
    high: (state: SailingShipState) => createMerchantShipHigh("carrack", state),
    parts: (state: SailingShipState) => merchantShipParts("carrack", state)
  }
};
const sailingStates: Record<SailingStudy, { sails: "set" | "furled"; part: string }> = {
  sloop: { sails: "set", part: "all" },
  caravel: { sails: "set", part: "all" },
  carrack: { sails: "set", part: "all" }
};
function showSailingShip(kind: SailingStudy): void {
  const study = sailingStudies[kind],
    saved = sailingStates[kind],
    info = study.info;
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === study.button ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  roofTitle.textContent = "Ship elevation";
  levelTitle.textContent = "Deck plan";
  showQuality(true);
  const high = qualitySelect.value === "high";
  const state = { sails: saved.sails };
  const parts: readonly ModelPartFactory[] = high
    ? study.parts(state)
    : [
        {
          id: "low-assembly",
          role: "Legacy assembly",
          author: info.author,
          quality: "low",
          create: () => study.low(state)
        }
      ];
  if (!parts.some(part => part.id === saved.part)) saved.part = "all";
  const chosen = parts.find(part => part.id === saved.part);
  const model = chosen ? assembleSailingParts(`${kind}-part`, [chosen]) : high ? study.high(state) : study.low(state);
  comparisonModel = { path: null, quality: high ? "high" : "low", viewOnly: true };
  const sailsSelect = document.createElement("select");
  sailsSelect.setAttribute("aria-label", "Sails");
  sailsSelect.add(new Option("Set", "set"));
  sailsSelect.add(new Option("Furled · moored", "furled"));
  sailsSelect.value = saved.sails;
  sailsSelect.addEventListener("change", () => {
    saved.sails = sailsSelect.value as "set" | "furled";
    showSailingShip(kind);
  });
  const partSelect = document.createElement("select");
  partSelect.setAttribute("aria-label", "Assembly part");
  partSelect.add(new Option("Complete ship", "all"));
  for (const part of parts) partSelect.add(new Option(`${part.role} · ${part.quality}`, part.id));
  partSelect.value = saved.part;
  partSelect.addEventListener("change", () => {
    saved.part = partSelect.value;
    showSailingShip(kind);
  });
  for (const [label, input] of [
    ["Sails", sailsSelect],
    ["Assembly part", partSelect]
  ] as const) {
    const row = document.createElement("label");
    row.append(label, input);
    optionFields.append(row);
  }
  modelOptions.hidden = false;
  massing = model;
  scene.add(model.group);
  frame({ occupancyMeters: { width: info.length, depth: info.beam } }, info.height);
  camera.position.set(info.length * 1.2, info.height * 0.9, info.length * 1.5);
  controls.target.set(1, info.height * 0.43, 0);
  controls.update();
  mountPlan(roofHost, meshProjection(model, "side"));
  mountPlan(levelHost, meshProjection(model, "top"));
  appendFacts(
    fact("Model", info.name),
    fact("Quality", high ? "High" : "Low"),
    fact("Sails", saved.sails === "furled" ? "Furled" : "Set"),
    fact(
      "CE adoption",
      kind === "carrack" ? "BV-only model" : "Legacy default (Low); sail states supported in CE; High is BV-only"
    ),
    fact(
      "Period",
      kind === "sloop"
        ? "Age of sail · imagined coastal vessel"
        : "Late medieval / early modern · imagined merchant vessel"
    ),
    fact(
      "Dimensions",
      `${info.length} m overall length × ${info.beam} m beam; ${info.height} m above water; ${info.draft} m draft`
    ),
    fact(
      "Rig",
      kind === "sloop"
        ? "One mast; gaff mainsail and jib"
        : kind === "caravel"
          ? "Two masts; lateen sails"
          : "Three masts; square fore and main, lateen mizzen"
    ),

    fact("Note", info.note, info.name)
  );
  if (kind === "carrack") {
    const source = document.createElement("a");
    source.href = CARRACK.source;
    source.textContent = "Mariners’ Museum · Carrack";
    source.target = "_blank";
    source.rel = "noreferrer";
    appendFacts(source);
  }
  const panel = modelPartsPanel(model.group);
  if (panel) facts.append(panel);
}
sloopButton.addEventListener("click", () => showSailingShip("sloop"));
shipsHeading.append(sloopButton);

const bargeButton = document.createElement("button");
bargeButton.dataset.id = "barge";
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

const ropeFerryButton = document.createElement("button");
ropeFerryButton.type = "button";
ropeFerryButton.dataset.id = "rope-ferry";
ropeFerryButton.textContent = "Rope ferry · Hand-hauled river cart ferry";
function showRopeFerry(): void {
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === ropeFerryButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "Ferry side elevation";
  levelTitle.textContent = "Deck plan";
  const model = createRopeFerry(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = false;
  frame({ occupancyMeters: { width: ROPE_FERRY.length, depth: ROPE_FERRY.beam } }, ROPE_FERRY.height);
  camera.position.set(11, 7, 12);
  controls.target.set(0, 0.8, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", ROPE_FERRY.name),
    fact("Author", ROPE_FERRY.author),
    fact("Period", "European river crossings, 13th to 19th century; before and beside the reaction ferry of 1657"),
    fact(
      "Dimensions",
      `${ROPE_FERRY.hullLength} m hull (${ROPE_FERRY.length.toFixed(2)} m with the flaps raised) × ${ROPE_FERRY.beam} m beam; ${ROPE_FERRY.depth} m deep, ${ROPE_FERRY.draft} m light draft; ${ROPE_FERRY.laneWidth} m between the wheel kerbs`
    ),
    fact("Propulsion", "Hauled hand over hand along a bank-to-bank rope; poled in the shallows"),
    fact("Load", "People, livestock, or one cart or wagon with its team, driven on at one end and off at the other"),
    fact("CE adoption", "Not placed by CE yet; Model Viewer only"),
    fact("Quality", quality === "high" ? "High" : "Low — one-piece deck, plain flaps and guides"),
    fact("Note", ROPE_FERRY.note, "Cable ferry"),
    ...(quality === "high" ? [fact("High detail", ROPE_FERRY.highNote)] : [])
  );
}
ropeFerryButton.addEventListener("click", () => showRopeFerry());
shipsHeading.append(ropeFerryButton);
AUTHORED_VARIANTS[ropeFerryButton.dataset.id] = {
  author: ROPE_FERRY.author,
  primary: true,
  quality: true,
  show: () => showRopeFerry()
};

const ferryNachenButton = document.createElement("button");
ferryNachenButton.type = "button";
ferryNachenButton.dataset.id = "ferry-nachen";
ferryNachenButton.textContent = "Fährnachen · Rowed and poled river ferry boat";
function showFerryNachen(): void {
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === ferryNachenButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "Boat side elevation";
  levelTitle.textContent = "Boat plan";
  const model = createFerryNachen(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = false;
  frame({ occupancyMeters: { width: FERRY_NACHEN.length, depth: FERRY_NACHEN.beam } }, FERRY_NACHEN.height);
  camera.position.set(9, 4.5, 9);
  controls.target.set(0, 0.3, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", FERRY_NACHEN.name),
    fact("Author", FERRY_NACHEN.author),
    fact(
      "Period",
      "Rhine, Mosel and their tributaries, medieval to 19th century; size from the Sieg ferry register of 1846"
    ),
    fact(
      "Dimensions",
      `${FERRY_NACHEN.length} × ${FERRY_NACHEN.beam} × ${FERRY_NACHEN.depth} m (40 × 5 × 2¼ Prussian feet); ${FERRY_NACHEN.draft} m light draft`
    ),
    fact("Propulsion", "Pole and hand oars, one or two boatmen"),
    fact(
      "Load",
      `Up to ${FERRY_NACHEN.passengers} passengers on five thwarts, small goods and small animals; no carts`
    ),
    fact("CE adoption", "Not placed by CE yet; Model Viewer only"),
    fact("Quality", quality === "high" ? "High" : "Low — hull, thwarts, oars and pole without frames or fittings"),
    fact("Note", FERRY_NACHEN.note, "Nachen"),
    ...(quality === "high" ? [fact("High detail", FERRY_NACHEN.highNote)] : [])
  );
}
ferryNachenButton.addEventListener("click", () => showFerryNachen());
shipsHeading.append(ferryNachenButton);
AUTHORED_VARIANTS[ferryNachenButton.dataset.id] = {
  author: FERRY_NACHEN.author,
  primary: true,
  quality: true,
  show: () => showFerryNachen()
};

const reactionFerryButton = document.createElement("button");
reactionFerryButton.type = "button";
reactionFerryButton.dataset.id = "reaction-ferry";
reactionFerryButton.textContent = "Gierponte · Rhine reaction ferry (flying bridge)";
function showReactionFerry(): void {
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === reactionFerryButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "Ferry side elevation";
  levelTitle.textContent = "Load floor plan";
  const model = createReactionFerry(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = false;
  frame({ occupancyMeters: { width: REACTION_FERRY.length, depth: REACTION_FERRY.width } }, REACTION_FERRY.height);
  camera.position.set(22, 13, 24);
  controls.target.set(0, 4, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  const { hull } = REACTION_FERRY;
  appendFacts(
    fact("Model", REACTION_FERRY.name),
    fact("Author", REACTION_FERRY.author),
    fact("Period", "Rhine and Waal, 1657 to the 19th century; after the St. Goar ferry of 1772"),
    fact(
      "Dimensions",
      `Two ships of ${hull.length.toFixed(1)} × ${hull.beam.toFixed(2)} × ${hull.depth.toFixed(2)} m (82.5 × 12.5 × 5.2 Schuh), ${REACTION_FERRY.gap} m apart; load floor ${REACTION_FERRY.deckLength.toFixed(1)} × ${REACTION_FERRY.width.toFixed(1)} m; ${REACTION_FERRY.height.toFixed(1)} m to the bell house roof`
    ),
    fact("Propulsion", "The current, steered across on a rope and an anchored chain; two rudders"),
    fact("Load", "Carts and coaches with their teams, riders, cattle and foot passengers through gates on both sides"),
    fact("CE adoption", "Not placed by CE yet; Model Viewer only"),
    fact("Quality", quality === "high" ? "High" : "Low — plain rails, masts and crossbars without rigging or fittings"),
    fact("Note", REACTION_FERRY.note, "Reaction ferry"),
    ...(quality === "high" ? [fact("High detail", REACTION_FERRY.highNote)] : [])
  );
}
reactionFerryButton.addEventListener("click", () => showReactionFerry());
shipsHeading.append(reactionFerryButton);
AUTHORED_VARIANTS[reactionFerryButton.dataset.id] = {
  author: REACTION_FERRY.author,
  primary: true,
  quality: true,
  show: () => showReactionFerry()
};

const ferrySmackState: { sails: "set" | "furled" } = { sails: "set" };
const ferrySmackButton = document.createElement("button");
ferrySmackButton.type = "button";
ferrySmackButton.dataset.id = "ferry-smack";
ferrySmackButton.textContent = "Ferry smack · Sail-and-oar ferry for wide water";
function showFerrySmack(): void {
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === ferrySmackButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  const sailsSelect = document.createElement("select");
  sailsSelect.setAttribute("aria-label", "Sails");
  sailsSelect.add(new Option("Set", "set"));
  sailsSelect.add(new Option("Furled · moored", "furled"));
  sailsSelect.value = ferrySmackState.sails;
  sailsSelect.addEventListener("change", () => {
    ferrySmackState.sails = sailsSelect.value as "set" | "furled";
    showFerrySmack();
  });
  const row = document.createElement("label");
  row.append("Sails", sailsSelect);
  optionFields.append(row);
  modelOptions.hidden = false;
  roofTitle.textContent = "Ship elevation";
  levelTitle.textContent = "Deck plan";
  const model = createFerrySmack(quality, ferrySmackState);
  massing = model;
  scene.add(model.group);
  ground.visible = false;
  frame({ occupancyMeters: { width: FERRY_SMACK.length, depth: FERRY_SMACK.width } }, FERRY_SMACK.height);
  camera.position.set(17, 10, 19);
  controls.target.set(0, 4, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", FERRY_SMACK.name),
    fact("Author", FERRY_SMACK.author),
    fact("Period", "Danish belts and sounds, 16th to 18th century; Great Belt ferry privileged since the 1300s"),
    fact(
      "Dimensions",
      `${FERRY_SMACK.hullLength} m hull (${FERRY_SMACK.length} m with the rudder) × ${FERRY_SMACK.beam} m beam (${FERRY_SMACK.width.toFixed(2)} m across the leeboards); ${FERRY_SMACK.depth} m deep, ${FERRY_SMACK.draft} m draft; ${FERRY_SMACK.height.toFixed(2)} m to the mast truck`
    ),
    fact("Propulsion", "Gaff mainsail and foresail on one mast, leeboards; sweeps in a calm"),
    fact(
      "Load",
      `Passengers, cattle and up to ${FERRY_SMACK.horses} horses in four files; crossings of 15–26 km recorded`
    ),
    fact("Sails", ferrySmackState.sails === "furled" ? "Furled" : "Set"),
    fact("CE adoption", "Not placed by CE yet; Model Viewer only"),
    fact("Quality", quality === "high" ? "High" : "Low — hull, spars, sails and hold without rigging or fittings"),
    fact("Note", FERRY_SMACK.note, "Smack (ship)"),
    ...(quality === "high" ? [fact("High detail", FERRY_SMACK.highNote)] : [])
  );
}
ferrySmackButton.addEventListener("click", () => showFerrySmack());
shipsHeading.append(ferrySmackButton);
AUTHORED_VARIANTS[ferrySmackButton.dataset.id] = {
  author: FERRY_SMACK.author,
  primary: true,
  quality: true,
  show: () => showFerrySmack()
};

const siegeHeading = modelCategory("Siege engines");
const trebuchetButton = document.createElement("button");
trebuchetButton.type = "button";
trebuchetButton.dataset.id = "trebuchet";
trebuchetButton.textContent = "Trebuchet · Hinged counterweight";
let trebuchetPart = "all";
AUTHORED_VARIANTS.trebuchet = {
  author: GROK_TREBUCHET.author,
  authors: [DEFAULT_AUTHOR, GROK_TREBUCHET.author],
  quality: true,
  show: () => showTrebuchet()
};
function showTrebuchet(): void {
  const grok = authorSelect.value === GROK_TREBUCHET.author;
  for (const option of qualitySelect.options) option.disabled = option.value !== (grok ? "high" : "low");
  qualitySelect.value = grok ? "high" : "low";
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === trebuchetButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  roofTitle.textContent = "Siege engine elevation";
  levelTitle.textContent = "Siege engine plan";
  const info = grok ? GROK_TREBUCHET : TREBUCHET;
  let elevation: string;
  let plan: string;
  if (grok) {
    const parts = grokTrebuchetParts();
    if (!parts.some(part => part.id === trebuchetPart)) trebuchetPart = "all";
    const partSelect = document.createElement("select");
    partSelect.setAttribute("aria-label", "Assembly part");
    partSelect.add(new Option("Complete engine", "all"));
    for (const part of parts) partSelect.add(new Option(`${part.role} · ${part.quality}`, part.id));
    partSelect.value = trebuchetPart;
    partSelect.addEventListener("change", () => {
      trebuchetPart = partSelect.value;
      showTrebuchet();
    });
    const row = document.createElement("label");
    row.append("Assembly part", partSelect);
    optionFields.append(row);
    modelOptions.hidden = false;
    const chosen = parts.find(part => part.id === trebuchetPart);
    const built = chosen ? assembleGrokTrebuchet([chosen]) : createGrokTrebuchet();
    elevation = meshProjection(built, "side");
    plan = meshProjection(built, "top");
    massing = built;
  } else {
    const built = createTrebuchet();
    elevation = built.elevation;
    plan = built.plan;
    massing = built;
  }
  scene.add(massing.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: info.length, depth: info.width } }, info.height);
  camera.position.set(16, 10, 18);
  controls.target.set(2.4, 3.4, 0);
  controls.update();
  mountPlan(roofHost, elevation);
  mountPlan(levelHost, plan);
  appendFacts(
    fact("Model", info.name),
    fact("Quality", grok ? "High — the only prepared resolution" : "Low"),
    fact("Type", "Hinged-counterweight siege engine"),
    fact("Throwing arm", `${info.longArm} m long arm / ${info.shortArm} m counterweight arm`),
    fact("Pose", "Cocked for loading; counterweight raised, sling and projectile in the trough"),
    fact(
      "CE adoption",
      grok ? "Not adopted; CE uses Codex GPT-6.1 Sol. High is BV-only" : "Legacy default; this author has no High model"
    ),
    ...(grok
      ? [
          fact("Counterweight", "Hinged planked chest of stone and lead, hung from the short arm"),
          fact("Windlass", "Twin spoked wheels, ratchet and pawl, rope hooked under the long arm")
        ]
      : []),
    fact("Note", info.note, "Trebuchet")
  );
  const panel = modelPartsPanel(massing.group);
  if (panel) facts.append(panel);
}
// listAuthors resets the author while this click is still bubbling, so show after that.
trebuchetButton.addEventListener("click", () => {
  queueMicrotask(() => showTrebuchet());
});
siegeHeading.append(trebuchetButton);

const ramButton = document.createElement("button");
ramButton.dataset.id = "batteringRam";
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
    fact("Ram", "Suspended oak log, rope cradles, iron bindings, blunt iron head and crew hand grips"),
    fact("Protection", "Hide-covered timber roof, braced open frame and four iron-bound wooden wheels"),
    fact("Note", BATTERING_RAM.note, "Battering ram")
  );
});
siegeHeading.append(ramButton);

const siegeTowerButton = document.createElement("button");
siegeTowerButton.dataset.id = "siegeTower";
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

const tractionTrebuchetButton = document.createElement("button");
tractionTrebuchetButton.dataset.id = "tractionTrebuchet";
tractionTrebuchetButton.type = "button";
tractionTrebuchetButton.textContent = "Traction trebuchet · Man-powered mangonel, 6th–13th century";
function showTractionTrebuchet(): void {
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === tractionTrebuchetButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "Siege engine side elevation";
  levelTitle.textContent = "Siege engine plan";
  const model = createTractionTrebuchet(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  model.group.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
  frame({ occupancyMeters: { width: size.x, depth: size.z } }, size.y);
  camera.position.set(7, 4.5, 8);
  controls.target.set(0, 1.8, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  const t = TRACTION_TREBUCHET;
  appendFacts(
    fact("Model", t.name),
    fact("Author", t.author),
    fact("Period", "Byzantine, Avar, Frankish and Islamic sieges, late 6th century to the 13th"),
    fact(
      "Dimensions",
      `Beam ${t.beamLength.toFixed(2)} m (16 ft) divided 6 : 1 (${t.longArm.toFixed(2)} + ${t.shortArm.toFixed(2)} m); uprights ${t.uprightHeight.toFixed(2)} m; base struts ${t.sills[0].toFixed(2)} and ${t.sills[1].toFixed(2)} m; sling ${t.slingLength.toFixed(2)} m`
    ),
    fact("Crew", `Twelve to twenty pullers on ${t.ropes} ropes and one shooter at the sling`),
    fact("Performance", "2.5–4.7 kg stones to 80–105 m, a little over four shots a minute (Tarver's reconstruction)"),
    fact("Quality", quality === "high" ? "High" : "Low — four ropes, no windings, rings or fittings"),
    fact("Note", t.note, "Mangonel"),
    ...(quality === "high" ? [fact("High detail", t.highNote)] : [])
  );
}
tractionTrebuchetButton.addEventListener("click", () => showTractionTrebuchet());
siegeHeading.append(tractionTrebuchetButton);
AUTHORED_VARIANTS[tractionTrebuchetButton.dataset.id] = {
  author: TRACTION_TREBUCHET.author,
  primary: true,
  quality: true,
  show: () => showTractionTrebuchet()
};

const artilleryHeading = modelCategory("Artillery");
const cannonButton = document.createElement("button");
cannonButton.dataset.id = "earlyFieldCannon";
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
    fact("Barrel", "Tapered bronze tube, open muzzle, reinforcing mouldings, trunnions and cascabel"),
    fact("Carriage", "Iron-bound oak wheels, timber cheeks, ground-resting trail and wooden elevation quoin"),
    fact("Note", EARLY_FIELD_CANNON.note, "History of cannon")
  );
});
artilleryHeading.append(cannonButton);

const bombardButton = document.createElement("button");
bombardButton.dataset.id = "bombard";
bombardButton.type = "button";
bombardButton.textContent = "Great bombard · Siege emplacement after Mons Meg, 1449";
function showBombard(): void {
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === bombardButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "Bombard side elevation";
  levelTitle.textContent = "Emplacement plan";
  const model = createBombard(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  model.group.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
  frame({ occupancyMeters: { width: size.x, depth: size.z } }, size.y);
  camera.position.set(8, 4.5, 9);
  controls.target.set(0.5, 1.2, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  const b = BOMBARD;
  appendFacts(
    fact("Model", b.name),
    fact("Author", b.author),
    fact("Period", "Late medieval siege artillery; gun after Mons Meg, tested at Mons for Philip the Good in 1449"),
    fact(
      "Gun",
      `${b.gunLength} m overall, ${b.barrelLength} m barrel of ${b.staves} wrought-iron staves and shrunk-on hoops, screwed-in chamber; ${(b.bore * 1000).toFixed(0)} mm (20 in) bore; barrel about ${b.barrelOuter.toFixed(2)} m across (from the 6.6 t mass)`
    ),
    fact("Shot", `Granite ball of about ${b.ballMass.toFixed(0)} kg; one to seven shots a day under about 500 m`),
    fact(
      "Emplacement",
      "Timber bed on sleepers, saddles and elevation wedge, recoil block with raking shores, pivoting plank shield raised to fire"
    ),
    fact("Quality", quality === "high" ? "High" : "Low — four hoops, plain shield, no lashings or kit"),
    fact("Note", b.note, "Mons Meg"),
    ...(quality === "high" ? [fact("High detail", b.highNote)] : [])
  );
}
bombardButton.addEventListener("click", () => showBombard());
artilleryHeading.append(bombardButton);
AUTHORED_VARIANTS[bombardButton.dataset.id] = {
  author: BOMBARD.author,
  primary: true,
  quality: true,
  show: () => showBombard()
};

const campsHeading = modelCategory("Camps");
const tudorLodgingButton = document.createElement("button");
tudorLodgingButton.dataset.id = "tudor-lodging";
tudorLodgingButton.type = "button";
tudorLodgingButton.textContent = "Tudor royal field lodging · Hall, round house and passage (1547)";
function showTudorLodging(): void {
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === tudorLodgingButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "Lodging side elevation";
  levelTitle.textContent = "Lodging plan";
  const model = createTudorLodging(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  frame({ occupancyMeters: { width: size.x, depth: size.z } }, size.y);
  camera.position.set(centre.x + 16, 10, centre.z + 14);
  controls.target.set(centre.x, 3, centre.z);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  const { round, hall, passage } = TUDOR_LODGING;
  appendFacts(
    fact("Model", TUDOR_LODGING.name),
    fact("Author", TUDOR_LODGING.author),
    fact("Period", "Henry VIII's field lodgings, inventory of 1547; camps such as Boulogne 1544"),
    fact(
      "Round house",
      `${round.gores} gores, roof ${round.roofDepth.toFixed(2)} m deep; ${round.breadths} wall breadths, walls ${round.wall.toFixed(2)} m; about ${(2 * round.radius).toFixed(1)} m across, peak ${round.peak.toFixed(1)} m`
    ),
    fact(
      "Hall",
      `${hall.roofBreadths} roof breadths, ${hall.goresPerEnd} gores to each end, roof ${hall.roofDepth.toFixed(2)} m deep; ${hall.wallBreadths} wall breadths; about ${(hall.straight + 2 * hall.radius).toFixed(1)} × ${(2 * hall.radius).toFixed(1)} m, ridge ${hall.ridge.toFixed(1)} m`
    ),
    fact("Passage", `Tresaunte of ${passage.roofBreadths} roof breadths, ${passage.length.toFixed(2)} m long`),
    fact("Scale", "One breadth of canvas taken as about a yard, inferred from the tent drawings"),
    fact("Quality", quality === "high" ? "High" : "Low — plain canvas shells, valances and vanes"),
    fact("Note", TUDOR_LODGING.note, "Field of the Cloth of Gold"),
    ...(quality === "high" ? [fact("High detail", TUDOR_LODGING.highNote)] : [])
  );
}
tudorLodgingButton.addEventListener("click", () => showTudorLodging());
campsHeading.append(tudorLodgingButton);
AUTHORED_VARIANTS[tudorLodgingButton.dataset.id] = {
  author: TUDOR_LODGING.author,
  primary: true,
  quality: true,
  show: () => showTudorLodging()
};

const smallArmsHeading = modelCategory("Small arms", true);
const musketButton = document.createElement("button");
musketButton.type = "button";
musketButton.dataset.id = "flintlock-musket";
musketButton.textContent = "Flintlock musket · 18th-century infantry";
let musketEnvironment: THREE.Texture | null = null;
AUTHORED_VARIANTS["flintlock-musket"] = {
  author: FLINTLOCK_MUSKET.author,
  primary: true,
  quality: true,
  show: () => showFlintlockMusket()
};
function showFlintlockMusket(): void {
  for (const option of qualitySelect.options) option.disabled = option.value !== "high";
  qualitySelect.value = "high";
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === musketButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  roofTitle.textContent = "Musket side elevation";
  levelTitle.textContent = "Musket plan";
  const model = createFlintlockMusket();
  massing = model;
  scene.add(model.group);
  ground.visible = false;
  // Metals need an environment to read. Other studies stay on the plain lights.
  if (!musketEnvironment) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    musketEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  scene.environment = musketEnvironment;
  controls.minPolarAngle = 0.02;
  controls.maxPolarAngle = Math.PI - 0.02;
  camera.position.set(0.95, 0.42, 1.15);
  controls.target.set(0.72, 0.07, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", FLINTLOCK_MUSKET.name),
    fact("Quality", "High — the only prepared resolution"),
    fact("Period", "18th century · European infantry"),
    fact("Type", "Flintlock musket, full stock, brass furniture"),
    fact("Pose", "Full cock; frizzen closed over the pan"),
    fact("Facing", "Muzzle +X. Lock on +Z, the side shown in the elevation. Toe on Y = 0."),
    fact("CE adoption", "BV-only study. Not placed in towns."),
    fact("View", "Orbit continues below the horizon on this study, and the ground disc stays hidden."),
    fact("Note", FLINTLOCK_MUSKET.note, "Musket")
  );
  const panel = modelPartsPanel(model.group);
  if (panel) facts.append(panel);
}
musketButton.addEventListener("click", () => {
  queueMicrotask(() => showFlintlockMusket());
});
smallArmsHeading.append(musketButton);

const romanHeading = modelCategory("Roman buildings");
const insulaButton = document.createElement("button");
insulaButton.dataset.id = "roman-insula";
insulaButton.type = "button";
insulaButton.textContent = "Insula · Roman apartment block, Ostia c. AD 130";
function showInsula(): void {
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === insulaButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "Street elevation";
  levelTitle.textContent = "Roof plan";
  const model = createInsula(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: INSULA.length, depth: INSULA.depth } }, INSULA.ridge);
  camera.position.set(-38, 22, -40);
  controls.target.set(0, 7, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  const i = INSULA;
  appendFacts(
    fact("Model", i.name),
    fact("Author", i.author),
    fact("Period", "Ostia, Hadrianic, about AD 130; altered into the 3rd century"),
    fact(
      "Dimensions",
      `${i.length} × ${i.depth} m block round a courtyard; ${i.floors.length} storeys (${i.floors.join(" + ")} m), eaves ${i.eaves.toFixed(1)} m under Trajan's limit of ${i.heightLimit.toFixed(2)} m (60 Roman feet)`
    ),
    fact(
      "Ground floor",
      `${i.shops} shops with mezzanine windows, two passages to the courtyard, stairs from the street; walls about ${i.wall} m thick`
    ),
    fact("Quality", quality === "high" ? "High" : "Low — massing, openings, balcony and tiled roofs"),
    fact("Note", i.note, "Insula (building)"),
    ...(quality === "high" ? [fact("High detail", i.highNote)] : [])
  );
}
insulaButton.addEventListener("click", () => showInsula());
romanHeading.append(insulaButton);
AUTHORED_VARIANTS[insulaButton.dataset.id] = {
  author: INSULA.author,
  primary: true,
  quality: true,
  show: () => showInsula()
};

const forumBathsButton = document.createElement("button");
forumBathsButton.dataset.id = "forum-baths";
forumBathsButton.type = "button";
forumBathsButton.textContent = "Thermae · Pompeii Forum Baths, men's section, c. 80 BC";
function showForumBaths(): void {
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === forumBathsButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "South elevation";
  levelTitle.textContent = "Roof plan";
  const model = createForumBaths(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  model.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model.group);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  frame({ occupancyMeters: { width: size.x, depth: size.z } }, size.y);
  camera.position.set(centre.x - 22, 18, centre.z + 26);
  controls.target.set(centre.x, 3.5, centre.z);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  const { plan } = FORUM_BATHS;
  const size2 = (r: { x0: number; x1: number; z0: number; z1: number }) =>
    `${(r.x1 - r.x0).toFixed(1)} × ${(r.z1 - r.z0).toFixed(1)} m`;
  appendFacts(
    fact("Model", FORUM_BATHS.name),
    fact("Author", FORUM_BATHS.author),
    fact("Period", "Built soon after 80 BC; the only baths working at Pompeii in AD 79"),
    fact(
      "Rooms",
      `Apodyterium ${size2(plan.apodyterium)}; round frigidarium ${(2 * plan.frigidarium.radius).toFixed(1)} m across; tepidarium ${size2(plan.tepidarium)}; caldarium ${size2(plan.caldarium)} with apse and alveus; furnace room with three boilers`
    ),
    fact("Source", `Room sizes measured from ${FORUM_BATHS.scale}; heights, vaults and roofs proportioned`),
    fact("Quality", quality === "high" ? "High" : "Low — room masses, tiled roofs and doorways"),
    fact("Note", FORUM_BATHS.note, "Thermae"),
    ...(quality === "high" ? [fact("High detail", FORUM_BATHS.highNote)] : [])
  );
}
forumBathsButton.addEventListener("click", () => showForumBaths());
romanHeading.append(forumBathsButton);
AUTHORED_VARIANTS[forumBathsButton.dataset.id] = {
  author: FORUM_BATHS.author,
  primary: true,
  quality: true,
  show: () => showForumBaths()
};

const amphitheatreButton = document.createElement("button");
amphitheatreButton.dataset.id = "amphitheatre";
amphitheatreButton.type = "button";
amphitheatreButton.textContent = "Amphitheatre · Pompeii, c. 70 BC";
function showAmphitheatre(): void {
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === amphitheatreButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "Side elevation";
  levelTitle.textContent = "Plan";
  const model = createAmphitheatre(quality);
  massing = model;
  scene.add(model.group);
  // The model carries its own ground round the building; the viewer's disc would cover the sunken arena.
  ground.visible = false;
  model.group.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
  frame({ occupancyMeters: { width: size.x, depth: size.z } }, size.y);
  camera.position.set(-95, 70, 105);
  controls.target.set(0, -2, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  const { arena, outer, rows, terrace } = AMPHITHEATRE;
  appendFacts(
    fact("Model", AMPHITHEATRE.name),
    fact("Author", AMPHITHEATRE.author),
    fact("Period", "Built about 70 BC by Valgus and Porcius; the oldest stone amphitheatre known"),
    fact(
      "Size",
      `${outer.length} × ${outer.width} m overall; arena ${arena.length} × ${arena.width} m, ${-AMPHITHEATRE.arenaFloor} m below the ground; terrace ${terrace.toFixed(1)} m above it`
    ),
    fact(
      "Seating",
      `${rows.ima + rows.media + rows.summa} rows (${rows.ima} + ${rows.media} + ${rows.summa}); about ${Math.round(AMPHITHEATRE.seatingLength / AMPHITHEATRE.seatPerPerson / 100) * 100} places at ${AMPHITHEATRE.seatPerPerson} m each, against the recorded ${AMPHITHEATRE.recordedCapacity.toLocaleString("en")}`
    ),
    fact("Source", `Ring widths measured from ${AMPHITHEATRE.scale}; row height, corridors and boxes proportioned`),
    fact("Quality", quality === "high" ? "High" : "Low — seating, arena wall, gallery, terrace, piers and stairways"),
    fact("Note", AMPHITHEATRE.note, "Amphitheatre"),
    ...(quality === "high" ? [fact("High detail", AMPHITHEATRE.highNote)] : [])
  );
}
amphitheatreButton.addEventListener("click", () => showAmphitheatre());
romanHeading.append(amphitheatreButton);
AUTHORED_VARIANTS[amphitheatreButton.dataset.id] = {
  author: AMPHITHEATRE.author,
  primary: true,
  quality: true,
  show: () => showAmphitheatre()
};

const fieldDefencesHeading = modelCategory("Field defences");
const paviseButton = document.createElement("button");
paviseButton.dataset.id = "pavise";
paviseButton.type = "button";
paviseButton.textContent = "Pavise · Bohemian standing shield, c. 1450";
function showPavise(): void {
  selection++;
  for (const button of list.querySelectorAll("button"))
    button.setAttribute("aria-current", button === paviseButton ? "true" : "false");
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "Pavise side elevation";
  levelTitle.textContent = "Pavise plan";
  const model = createPavise(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  model.group.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
  frame({ occupancyMeters: { width: size.x, depth: size.z } }, size.y);
  camera.position.set(1.6, 1.1, 1.4);
  controls.target.set(-0.2, 0.55, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  const p = PAVISE;
  appendFacts(
    fact("Model", p.name),
    fact("Author", p.author),
    fact("Period", "Central Europe, 15th century; after the Metropolitan Museum's Bohemian pavise of about 1450"),
    fact(
      "Dimensions",
      `${(p.height * 100).toFixed(2)} × ${(p.width * 100).toFixed(2)} cm, ${(p.curvature * 100).toFixed(1)} cm of curvature, about ${(p.thickness * 100).toFixed(1)} cm thick; ${p.recordedMass} kg recorded`
    ),
    fact("Use", "Set up on its prop in front of a crossbowman while he spanned and loaded"),
    fact("Quality", quality === "high" ? "High" : "Low — plain painted board and prop"),
    fact("Note", p.note, "Pavise"),
    ...(quality === "high" ? [fact("High detail", p.highNote)] : [])
  );
}
paviseButton.addEventListener("click", () => showPavise());
fieldDefencesHeading.append(paviseButton);
AUTHORED_VARIANTS[paviseButton.dataset.id] = {
  author: PAVISE.author,
  primary: true,
  quality: true,
  show: () => showPavise()
};

const millsHeading = modelCategory("Mills");
const postMillButton = document.createElement("button");
postMillButton.dataset.id = "postMill";
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
    fact("Sails", `Four canvas-covered lattice sails; ${POST_MILL.sailRadius * 2} m stock diameter`),
    fact("Structure", "Timber milling house on a braced central post; rear stair and tailpole"),
    fact("Note", POST_MILL.note, "Post mill")
  );
});
millsHeading.append(postMillButton);

const towerMillButton = document.createElement("button");
towerMillButton.dataset.id = "towerMill";
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
    fact("Tower", `${TOWER_MILL.towerHeight} m high; ${TOWER_MILL.baseRadius * 2} m diameter at the base`),
    fact("Sails", "Four canvas-covered lattice sails on a timber cap"),
    fact("Note", TOWER_MILL.note, "Tower mill")
  );
});
millsHeading.append(towerMillButton);

const waterMillButton = document.createElement("button");
waterMillButton.dataset.id = "waterMill";
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
    fact("Wheel", `Wooden overshot wheel; ${WATER_MILL.wheelRadius * 2} m diameter; 24 buckets`),
    fact("Water supply", "Raised timber flume with sluice gate; lower millrace and axle bearing pier"),
    fact("Note", WATER_MILL.note, "Watermill")
  );
});
millsHeading.append(waterMillButton);

for (const spec of LOW_BANK_WATER_MILLS) {
  const button = document.createElement("button");
  button.dataset.id = spec.id;
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
wellButton.dataset.id = "medievalWell";
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
    fact("Structure", "Open masonry curb, braced oak posts and a timber-shingled gable roof"),
    fact("Lifting gear", "Hand-cranked wooden windlass, rope and iron-bound wooden bucket"),
    fact("Note", MEDIEVAL_WELL.note, "Water well")
  );
});
wellsHeading.append(wellButton);

for (const kind of WATER_BASIN_KINDS) {
  const spec = PUBLIC_WATER_BASINS[kind];
  const button = document.createElement("button");
  button.dataset.id = kind;
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
    button.dataset.id = `container-${kind}-${state}`;
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
lumberYardButton.dataset.id = "lumber-yard";
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
    fact("Storage", "Sleeper-supported log pile, boards separated by drying stickers and stacked hewn beams"),
    fact("Workshop", "Open braced timber shed, wooden roof, sawing trestles, frame saw and chopping block with axe"),
    fact("Note", MEDIEVAL_LUMBER_YARD.note, "Lumber yard")
  );
});
yardsHeading.append(lumberYardButton);

const vehiclesHeading = modelCategory("Vehicles");
for (const [definition, create, id] of [
  [HOT_AIR_BALLOON, createHotAirBalloon, "hotAirBalloon"],
  [AIRSHIP, createAirship, "airship"],
  [STEAM_LOCOMOTIVE, createSteamLocomotive, "steamLocomotive"]
] as const) {
  const button = document.createElement("button");
  button.dataset.id = id;
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
      fact("Triangles", triangles.toLocaleString("en-US")),
      fact("Note", definition.note, definition.name)
    );
  });
  vehiclesHeading.append(button);
}

const minecartButton = document.createElement("button");
minecartButton.dataset.id = "minecart";
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
    fact("Body", "Empty sloping plank box, iron straps, rivets and end handles"),
    fact("Running gear", "Four flanged iron wheels on two axles; short narrow-gauge track on timber sleepers"),
    fact("Note", MINECART.note, "Minecart")
  );
});
vehiclesHeading.append(minecartButton);

const wagonButton = document.createElement("button");
wagonButton.dataset.id = "medievalWagon";
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
    fact("Running gear", "Four wooden spoked wheels with iron tires; smaller front wheels and a pivoted front axle"),
    fact("Body", "Empty plank bed, iron straps, driver's bench and twin draft shafts; no animals"),
    fact("Note", MEDIEVAL_WAGON.note, "Wagon")
  );
});
vehiclesHeading.append(wagonButton);

const coveredWagonButton = document.createElement("button");
coveredWagonButton.dataset.id = "coveredWagon";
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
    fact("Cover", "Unbleached canvas on five wooden bows; stitched seams, rope lashings and rolled end curtains"),
    fact("Body", "Empty plank bed; open front and rear above the end boards"),
    fact("Running gear", "Four iron-bound spoked wheels, driver's bench and twin shafts; no animals"),
    fact("Note", COVERED_WAGON.note, "Covered wagon")
  );
});
vehiclesHeading.append(coveredWagonButton);

const nobleCarriageButton = document.createElement("button");
nobleCarriageButton.dataset.id = "nobleCarriage";
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
    fact("Body", "Blue painted timber, burgundy textile canopy, tied curtains and gilded heraldic shields"),
    fact("Interior", "Facing cushioned benches, low side doors and boarding steps; unglazed openings"),
    fact("Running gear", "Four iron-bound spoked wheels, front axle pivot, driver's bench and twin shafts; no animals"),
    fact("Note", NOBLE_CARRIAGE.note, "Carriage")
  );
});
vehiclesHeading.append(nobleCarriageButton);

const warWagonButton = document.createElement("button");
warWagonButton.dataset.id = "warWagon";
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

const tigerButton = document.createElement("button");
tigerButton.dataset.id = "tigerI";
tigerButton.type = "button";
tigerButton.textContent = "Tiger I · German heavy tank, 1942–1945";
function showTigerTank(): void {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === tigerButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "Tiger I side elevation";
  levelTitle.textContent = "Tiger I plan";
  const model = createTigerTank(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: TIGER_I.length, depth: TIGER_I.width } }, TIGER_I.height);
  camera.position.set(9, 6, 10);
  controls.target.set(0.8, 1.4, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", TIGER_I.name),
    fact("Author", TIGER_I.author),
    fact("Period", "Second World War · Germany, 1942–1945"),
    fact(
      "Dimensions",
      `${TIGER_I.length} m with gun forward (hull ${TIGER_I.hullLength} m) × ${TIGER_I.width} m × ${TIGER_I.height} m`
    ),
    fact("Armament", "8.8 cm KwK 36 L/56 with muzzle brake; hull machine-gun ball mount"),
    fact("Running gear", "Interleaved road wheels on eight stations a side, front drive sprocket, rear idler"),
    fact("Quality", quality === "high" ? "High" : "Low — plain track runs and simplified fittings"),
    fact("Note", TIGER_I.note, "Tiger I"),
    ...(quality === "high" ? [fact("High detail", TIGER_I.highNote)] : [])
  );
}
tigerButton.addEventListener("click", () => showTigerTank());
vehiclesHeading.append(tigerButton);
AUTHORED_VARIANTS[tigerButton.dataset.id] = {
  author: TIGER_I.author,
  primary: true,
  quality: true,
  show: () => showTigerTank()
};

const b29Button = document.createElement("button");
b29Button.dataset.id = "b29";
b29Button.type = "button";
b29Button.textContent = "B-29 Superfortress · US heavy bomber, 1944–1960";
function showB29(): void {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === b29Button ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "B-29 side elevation";
  levelTitle.textContent = "B-29 plan";
  const model = createB29(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: B29.length, depth: B29.span } }, B29.height);
  camera.position.set(21, 10, 24);
  controls.target.set(1, 3.5, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", B29.name),
    fact("Author", B29.author),
    fact("Period", "Second World War and Korean War · United States, 1944–1960"),
    fact("Dimensions", `${B29.length} m long × ${B29.span} m span × ${B29.height} m to the fin tip`),
    fact(
      "Powerplant",
      `Four Wright R-3350 Duplex-Cyclone 18-cylinder radials with turbosuperchargers; four-blade Hamilton Standard propellers, ${B29.propellerDiameter} m`
    ),
    fact(
      "Defensive armament",
      "Four remote-controlled turrets (upper and lower, forward and aft) and a manned tail position, each shown with two .50-cal machine guns"
    ),
    fact("Landing gear", "Tricycle: dual main wheels retracting into the inboard nacelles, twin nose wheel"),
    fact("Quality", quality === "high" ? "High" : "Low — one-piece flying surfaces, plain cowlings and glazing"),
    fact("Note", B29.note, "B-29 Superfortress"),
    ...(quality === "high" ? [fact("High detail", B29.highNote)] : [])
  );
}
b29Button.addEventListener("click", () => showB29());
vehiclesHeading.append(b29Button);
AUTHORED_VARIANTS[b29Button.dataset.id] = {
  author: B29.author,
  primary: true,
  quality: true,
  show: () => showB29()
};

const b2Button = document.createElement("button");
b2Button.dataset.id = "b2";
b2Button.type = "button";
b2Button.textContent = "B-2 Spirit · US stealth bomber, 1997–";
function showB2(): void {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === b2Button ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "B-2 side elevation";
  levelTitle.textContent = "B-2 plan";
  const model = createB2(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: B2.length, depth: B2.span } }, B2.height);
  camera.position.set(30, 19, 26);
  controls.target.set(0, 2.5, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", B2.name),
    fact("Author", B2.author),
    fact("Period", "Late Cold War to the present · United States, in service from 1997"),
    fact(
      "Dimensions",
      `${B2.length} m long × ${B2.span} m span × ${B2.height} m high; leading edges swept ${B2.sweep}°`
    ),
    fact(
      "Powerplant",
      "Four General Electric F118-GE-100 non-afterburning turbofans buried in the wing, fed from upper-surface intakes"
    ),
    fact("Armament", "Two internal bomb bays side by side in the centre body; no defensive guns"),
    fact("Landing gear", "Tricycle: four-wheel main bogies, twin nose wheel"),
    fact("Quality", quality === "high" ? "High" : "Low — one-piece wing without control surfaces and plain gear"),
    fact("Note", B2.note, "Northrop B-2 Spirit"),
    ...(quality === "high" ? [fact("High detail", B2.highNote)] : [])
  );
}
b2Button.addEventListener("click", () => showB2());
vehiclesHeading.append(b2Button);
AUTHORED_VARIANTS[b2Button.dataset.id] = {
  author: B2.author,
  primary: true,
  quality: true,
  show: () => showB2()
};

const wrightFlyerButton = document.createElement("button");
wrightFlyerButton.dataset.id = "wrightFlyer";
wrightFlyerButton.type = "button";
wrightFlyerButton.textContent = "Wright Flyer · US pioneer aeroplane, 1903";
function showWrightFlyer(): void {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === wrightFlyerButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "Wright Flyer side elevation";
  levelTitle.textContent = "Wright Flyer plan";
  const model = createWrightFlyer(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: WRIGHT_FLYER.length, depth: WRIGHT_FLYER.span } }, WRIGHT_FLYER.height);
  camera.position.set(7.5, 4.5, 9.5);
  controls.target.set(0, 1.2, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", WRIGHT_FLYER.name),
    fact("Author", WRIGHT_FLYER.author),
    fact("Period", "Pioneer era of aviation · United States, first flights on 17 December 1903"),
    fact(
      "Dimensions",
      `${WRIGHT_FLYER.length} m long × ${WRIGHT_FLYER.span} m span × ${WRIGHT_FLYER.height} m high; wing chord ${WRIGHT_FLYER.chord} m, gap ${WRIGHT_FLYER.gap} m, camber 1:20`
    ),
    fact(
      "Powerplant",
      `The Wrights' own 12 hp four-cylinder water-cooled engine; two counter-rotating pusher propellers, ${WRIGHT_FLYER.propellerDiameter} m, driven by chains`
    ),
    fact(
      "Controls",
      "Biplane elevator ahead for pitch, wing warping from the pilot's hip cradle for roll, twin rudders aft"
    ),
    fact("Undercarriage", "Two wooden skids; it took off from a wooden launching rail (not modelled)"),
    fact(
      "Quality",
      quality === "high" ? "High" : "Low — plain wings without ribs or bracing wires, a block engine and no chains"
    ),
    fact("Note", WRIGHT_FLYER.note, "Wright Flyer"),
    ...(quality === "high" ? [fact("High detail", WRIGHT_FLYER.highNote)] : [])
  );
}
wrightFlyerButton.addEventListener("click", () => showWrightFlyer());
vehiclesHeading.append(wrightFlyerButton);
AUTHORED_VARIANTS[wrightFlyerButton.dataset.id] = {
  author: WRIGHT_FLYER.author,
  primary: true,
  quality: true,
  show: () => showWrightFlyer()
};

const benzMotorwagenButton = document.createElement("button");
benzMotorwagenButton.dataset.id = "benzMotorwagen";
benzMotorwagenButton.type = "button";
benzMotorwagenButton.textContent = "Benz Patent-Motorwagen · German motor car, 1886";
function showBenzMotorwagen(): void {
  selection++;
  for (const button of list.querySelectorAll("button")) {
    button.setAttribute("aria-current", button === benzMotorwagenButton ? "true" : "false");
  }
  clearMesh();
  floors.replaceChildren();
  facts.replaceChildren();
  banner.hidden = true;
  showQuality(true);
  const quality = qualitySelect.value === "low" ? "low" : "high";
  comparisonModel = { path: null, quality, viewOnly: true };
  roofTitle.textContent = "Benz Patent-Motorwagen side elevation";
  levelTitle.textContent = "Benz Patent-Motorwagen plan";
  const model = createBenzMotorwagen(quality);
  massing = model;
  scene.add(model.group);
  ground.visible = true;
  frame({ occupancyMeters: { width: BENZ_MOTORWAGEN.length, depth: BENZ_MOTORWAGEN.width } }, BENZ_MOTORWAGEN.height);
  camera.position.set(2.6, 1.8, 3.2);
  controls.target.set(0, 0.6, 0);
  controls.update();
  mountPlan(roofHost, model.elevation);
  mountPlan(levelHost, model.plan);
  appendFacts(
    fact("Model", BENZ_MOTORWAGEN.name),
    fact("Author", BENZ_MOTORWAGEN.author),
    fact("Period", "Second Industrial Revolution · Mannheim, Germany; patented 29 January 1886, built 1886–1893"),
    fact(
      "Dimensions",
      `${BENZ_MOTORWAGEN.length} m long × ${BENZ_MOTORWAGEN.width} m wide × ${BENZ_MOTORWAGEN.height} m high; wheelbase ${BENZ_MOTORWAGEN.wheelbase} m`
    ),
    fact(
      "Powerplant",
      "954 cc horizontal single-cylinder four-stroke, about 2/3 hp at 400 rpm; vertical crankshaft, horizontal flywheel, evaporative cooling"
    ),
    fact(
      "Drive",
      "Flat belt to a countershaft with differential, then a chain to each rear wheel; one speed, no reverse"
    ),
    fact("Steering", "Tiller turning the single front wheel through a rack and pinion"),
    fact("Quality", quality === "high" ? "High" : "Low — eight spokes per wheel, a block engine, no belt or chains"),
    fact("Note", BENZ_MOTORWAGEN.note, "Benz Patent-Motorwagen"),
    ...(quality === "high" ? [fact("High detail", BENZ_MOTORWAGEN.highNote)] : [])
  );
}
benzMotorwagenButton.addEventListener("click", () => showBenzMotorwagen());
vehiclesHeading.append(benzMotorwagenButton);
AUTHORED_VARIANTS[benzMotorwagenButton.dataset.id] = {
  author: BENZ_MOTORWAGEN.author,
  primary: true,
  quality: true,
  show: () => showBenzMotorwagen()
};

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
  option.value = "low";
  option.textContent = "Low resolution (only available tier)";
  resolution.append(option);
  resolution.value = "low";
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
    fact("Resolution", "Low — no explicit high-quality edition is registered"),
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
  button.dataset.id = `barbican-${definition.id}`;
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
  button.dataset.id = `sign-${template.id}`;
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
      : label(
          file
            .split("/")
            .at(-1)!
            .replace(/^\d+-|Models.ts$/g, "")
        )
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
    // The previewed season persists across quality and edition switches of the same tree.
    let season = definition.seasons?.default;
    let appearance = definition.appearances?.default;
    // Parametric controls persist across quality switches of the same model.
    const presentationValues: Record<string, string> = Object.fromEntries(
      (definition.presentation?.fields ?? []).map(field => [field.id, field.default])
    );
    const presentationChanged = () =>
      !!definition.presentation?.fields.some(field => presentationValues[field.id] !== field.default);
    let marketActivity: "market-day" | "closed" = "market-day";
    let marketDetail: "near" | "distant" = "near";
    let selectedPart = "all";
    let selectedPartPreset = definition.partPresets?.[0]?.id;
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
        resolution.setAttribute("aria-label", task === 43 ? "Tree model quality" : "Model quality");
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
      if (variant && definition.marketDisplay) {
        for (const [title, aria, entries, value, change] of [
          [
            "Activity",
            "Market activity",
            [
              ["market-day", "Market day"],
              ["closed", "Closed"]
            ],
            marketActivity,
            (value: string) => {
              marketActivity = value as typeof marketActivity;
            }
          ],
          [
            "Detail",
            "Market distance representation",
            [
              ["near", "Near"],
              ["distant", "Distant"]
            ],
            marketDetail,
            (value: string) => {
              marketDetail = value as typeof marketDetail;
            }
          ]
        ] as const) {
          const row = document.createElement("label");
          row.textContent = `${title}: `;
          const select = document.createElement("select");
          select.setAttribute("aria-label", aria);
          for (const [id, label] of entries) select.add(new Option(label, id));
          select.value = value;
          select.addEventListener("change", () => {
            change(select.value);
            showModel(variant);
          });
          row.append(select);
          optionFields.append(document.createElement("br"), row);
        }
      }
      if (variant && definition.appearances) {
        const row = document.createElement("label");
        row.textContent = "Palette: ";
        const select = document.createElement("select");
        select.setAttribute("aria-label", "Model palette");
        for (const option of definition.appearances.options) select.add(new Option(option.label, option.id));
        select.value = appearance!;
        select.addEventListener("change", () => {
          appearance = select.value;
          showModel(variant);
        });
        row.append(select);
        optionFields.append(document.createElement("br"), row);
      }
      const presenting = !!variant && !!definition.presentation?.applies(variant.id);
      if (presenting)
        for (const field of definition.presentation!.fields) {
          const row = document.createElement("label");
          row.textContent = `${field.label}: `;
          const select = document.createElement("select");
          select.setAttribute("aria-label", field.label);
          for (const option of field.options) select.add(new Option(option.label, option.id));
          select.value = presentationValues[field.id];
          select.addEventListener("change", () => {
            presentationValues[field.id] = select.value;
            showModel(variant);
          });
          row.append(select);
          optionFields.append(document.createElement("br"), row);
        }
      if (variant && definition.seasons) {
        const seasonRow = document.createElement("label");
        seasonRow.textContent = "Season: ";
        const seasonSelect = document.createElement("select");
        seasonSelect.setAttribute("aria-label", "Tree seasonal appearance");
        for (const entry of definition.seasons.options) {
          const option = document.createElement("option");
          option.value = entry.id;
          option.textContent = entry.label;
          seasonSelect.append(option);
        }
        seasonSelect.value = season!;
        seasonSelect.addEventListener("change", () => {
          season = seasonSelect.value;
          showModel(variant);
        });
        seasonRow.append(seasonSelect);
        optionFields.append(document.createElement("br"), seasonRow);
      }
      if (variant && definition.variants)
        comparisonVariants = {
          id: definition.id,
          levels: definition.variants.map(entry => ({ id: column(entry), label: entry.label })),
          selected: column(variant)
        };
      if (!variant) comparisonModel = { path: null, quality: definition.quality ?? "low" };
      // A variant with nothing to list (an empty part list) shows its assembly only.
      const listedParts = definition.parts?.(variant?.id, selectedPartPreset);
      const partFactories = listedParts?.length ? listedParts : undefined;
      if (selectedPart !== "all" && !partFactories?.some(part => part.id === selectedPart)) selectedPart = "all";
      const partFactory = partFactories?.find(part => part.id === selectedPart);
      const displayedDependencies = partFactory ? partFactory.basedOn : variant?.basedOn;
      const customAssembly =
        !!partFactories && !!definition.partPresets && selectedPartPreset !== definition.partPresets[0].id;
      if (definition.partPresets) {
        const row = document.createElement("label");
        row.textContent = "Composition: ";
        const select = document.createElement("select");
        select.setAttribute("aria-label", "Assembly composition");
        for (const preset of definition.partPresets) select.add(new Option(preset.name, preset.id));
        select.value = selectedPartPreset!;
        select.addEventListener("change", () => {
          selectedPartPreset = select.value;
          showModel(variant);
        });
        row.append(select);
        optionFields.append(row);
      }
      if (partFactories) {
        modelOptions.hidden = false;
        const row = document.createElement("label");
        row.textContent = "View: ";
        const select = document.createElement("select");
        select.setAttribute("aria-label", "Assembly part");
        select.add(new Option("Complete assembly", "all"));
        for (const [index, part] of partFactories.entries())
          select.add(new Option(`${label(part.role)} · ${index + 1}`, part.id));
        select.value = partFactory ? selectedPart : "all";
        select.addEventListener("change", () => {
          selectedPart = select.value;
          showModel(variant);
        });
        row.append(select);
        optionFields.append(row);
      }
      if (
        partFactory ||
        customAssembly ||
        (definition.appearances && appearance !== definition.appearances.default) ||
        (presenting && presentationChanged()) ||
        (definition.marketDisplay && (marketActivity === "closed" || marketDetail === "distant"))
      ) {
        // Components and custom compositions must not overwrite the registered assembly's metrics.
        comparisonVariants = null;
        comparisonModel = {
          path: null,
          quality: (partFactory?.quality ?? variant?.level) === "high" ? "high" : "low",
          viewOnly: true
        };
      }
      const assemble = (parts: readonly ModelPartFactory[]) =>
        definition.assembleParts ? definition.assembleParts(parts) : createModelAssembly(definition.id, parts);
      const model = partFactory
        ? assemble([partFactory])
        : customAssembly
          ? assemble(partFactories!)
          : variant
            ? presenting
              ? definition.presentation!.create(variant.id, presentationValues)
              : definition.marketDisplay
                ? definition.marketDisplay.create(variant.id, appearance ?? "ochre", marketActivity, marketDetail)
                : definition.appearances
                  ? definition.appearances.create(variant.id, appearance!)
                  : definition.seasons && season !== definition.seasons.default
                    ? definition.seasons.create(variant.id, season!)
                    : variant.create()
            : definition.create();
      massing = model;
      scene.add(model.group);
      ground.visible = true;
      const bounds = new THREE.Box3().setFromObject(model.group, true);
      if (bounds.isEmpty()) bounds.set(new THREE.Vector3(), new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z, 0.6);
      camera.position.copy(center).add(new THREE.Vector3(radius * 1.15, radius * 0.9, radius * 1.3));
      controls.target.copy(center);
      controls.update();
      ground.geometry.dispose();
      ground.geometry = new THREE.CircleGeometry(radius * 0.85, 48);
      if (partFactory) ground.position.set(center.x, -0.05, center.z);
      mountPlan(roofHost, meshProjection(model, "side"));
      mountPlan(levelHost, meshProjection(model, "top"));
      appendFacts(
        fact("Model", definition.name),
        fact("Task", String(task).padStart(2, "0")),
        ...(definition.marketDisplay
          ? [
              fact(
                "Activity",
                marketActivity === "closed"
                  ? definition.id === "market-fish-booth"
                    ? "Closed; shutters shut"
                    : "Closed; temporary pitch packed away"
                  : "Market day"
              ),
              fact("Representation", marketDetail === "distant" ? "Distant silhouette" : "Near model")
            ]
          : []),
        ...(definition.appearances
          ? [
              fact(
                "Palette",
                definition.appearances.options.find(option => option.id === appearance)?.label ?? appearance!
              )
            ]
          : []),
        ...(presenting
          ? definition.presentation!.fields.map(field =>
              fact(field.label, field.options.find(option => option.id === presentationValues[field.id])?.label ?? "")
            )
          : []),
        ...(definition.partPresets
          ? [fact("Composition", definition.partPresets.find(preset => preset.id === selectedPartPreset)!.name)]
          : []),
        ...(partFactory
          ? [
              fact("View", `Single part: ${label(partFactory.role)}; fitted position retained`),
              fact("Part quality", partFactory.quality),
              fact("Part author", partFactory.author)
            ]
          : []),
        ...(variant
          ? [
              fact(partFactory ? "Assembly quality" : "Quality", variant.label),
              ...(definition.seasons
                ? [fact("Season", definition.seasons.options.find(entry => entry.id === season)?.label ?? season!)]
                : []),
              ...(variant.edition || definition.variants!.some(entry => entry.edition)
                ? [fact("Edition", editionLabel(variant))]
                : []),
              fact(
                "CE adoption",
                definition.cePlacementStatus === "preview-only"
                  ? "Not enabled; BV preview only"
                  : partFactory || customAssembly
                    ? "Component preview; CE placement uses its registered assembly"
                    : variant.family === "monastery.friary" || variant.family === "monastery.abbey"
                      ? variant.level === "high"
                        ? "CE uses this architecture at High model quality"
                        : "CE uses Low architecture at Low or Standard model quality"
                      : variant === adopted(variant.level)
                        ? "Adopted"
                        : `Not adopted; CE uses ${adopted(variant.level).author}`
              ),
              ...(displayedDependencies
                ? [
                    fact(
                      "Based on",
                      displayedDependencies
                        .map(id => {
                          const own = definition.variants!.find(entry => entry.id === id);
                          if (own) return `${own.label} · ${own.author}`;
                          const dependency = MODEL_VARIANTS.find(entry => entry.id === id);
                          return dependency ? `${dependency.family} · ${dependency.level} · ${dependency.author}` : id;
                        })
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
          partFactory
            ? "Independently generated component in its assembly position; other parts are not constructed."
            : customAssembly
              ? "Component composition preview; CE placement continues to use its registered assembly."
              : definition.task === 33 || definition.id === "abbey" || definition.id === "orthodox-monastery"
                ? "CE-fitted religious-house assembly; meter units. BV and CE share the same construction."
                : definition.task === 43 || definition.task === 44
                  ? "Shared landscape or funerary model; meter units. Shared with CE park and cemetery 3D placement."
                  : "Illustrative medieval or early modern model; meter units. CE automatic placement is separate."
        )
      );
      const partsPanel = modelPartsPanel(model.group);
      if (partsPanel) facts.append(partsPanel);
    };
    button.addEventListener("click", () => showModel());
    category.append(button);
  }
}

const treeCoverage = modelCategory("Trees · biome coverage");
treeCoverage.dataset.kind = "flora";
for (const biome of STANDARD_BIOME_DEFINITIONS) {
  const ready = Object.values(medievalModules)
    .flatMap(module => module.models)
    .filter(model => model.biomes?.includes(biome.key));
  const row = document.createElement("p");
  row.textContent = `${biome.label}: ${ready.length ? ready.map(model => model.name).join(", ") : Object.keys(biome.relief.icons).some(icon => ["acacia", "palm", "deciduous", "conifer", "swamp", "deadTree"].includes(icon)) ? "Tree models planned" : "No tree relief in FMG"}`;
  treeCoverage.append(row);
}
installCatalogueFilter(list);

resize();
new ResizeObserver(resize).observe(stage);
renderer.setAnimationLoop(() => {
  controls.update();
  regionalDetails?.update(camera, renderer.domElement.clientHeight);
  const started = performancePanel.open ? performance.now() : null;
  renderer.render(scene, camera);
  if (started !== null) performancePanel.sample(renderer, started);
});
