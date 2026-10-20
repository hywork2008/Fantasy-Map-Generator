import "./viewer.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createPontDuGard, PONT_DU_GARD, pontDuGardElevation } from "../buildings/aqueducts/pontDuGard";
import { contentDigest } from "../buildings/canonicalJson";
import { BOJNICE, bojnicePlan, createBojnice } from "../buildings/fortresses/bojnice";
import { CHAMBORD, createChambord } from "../buildings/fortresses/chambord";
import { KRAK, type KrakPhase } from "../buildings/fortresses/krak";
import { createPostMill, POST_MILL } from "../buildings/mills/postMill";
import { createTowerMill, TOWER_MILL } from "../buildings/mills/towerMill";
import { createWaterMill, WATER_MILL } from "../buildings/mills/waterMill";
import { committedSvgHash, levelPlanSvg, planSvg } from "../buildings/planSvg";
import { type BuildingRecord, TRIANGLE_BUDGET } from "../buildings/record";
import { CARRACK, createCarrack } from "../buildings/ships/carrack";
import { createGalleon, GALLEON } from "../buildings/ships/galleon";
import { createTrebuchet, TREBUCHET } from "../buildings/siege/trebuchet";
import { validateBuildingRecord } from "../buildings/validate";
import { catalogueMassing } from "../city3d/core/catalogueMassing";
import { structureSurfaces } from "../city3d/core/structureGeometry";
import { type CityStructureMeshes, createStructureMassing } from "../city3d/three/structureMeshes";
import type { TownWaterMeshes } from "../city3d/three/waterMeshes";
import type { HistoricalPeriod } from "../types/historicalPeriod";
import { sanitizeSvg } from "./svgSanitize";

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

function fact(label: string, value: string): HTMLParagraphElement {
  const row = document.createElement("p");
  const name = document.createElement("strong");
  name.textContent = `${label}: `;
  row.append(name, document.createTextNode(value));
  return row;
}

const root = document.querySelector("#building-viewer");
if (!root) throw new Error("building viewer root is missing");

const entries = loadEntries();
const app = document.createElement("div");
app.className = "bv-app";
const list = document.createElement("nav");
list.className = "bv-list";
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
main.append(stage, plans, facts);
app.append(list, main);
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
let studyWater: TownWaterMeshes | null = null;
let selection = 0;

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
    facts.append(fact("Record", entry.record.name || entry.record.id));
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
  facts.append(
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
    fact("Note", provenance.note)
  );
  for (const level of record.levels) {
    facts.append(fact(level.name, `${level.elevationMeters} m, floor to floor ${level.floorToFloorMeters} m`));
  }
  if (triangles > TRIANGLE_BUDGET) {
    const warn = document.createElement("p");
    warn.className = "bv-warn";
    warn.textContent = `This record uses ${triangles} triangles, above the ${TRIANGLE_BUDGET} budget.`;
    facts.append(warn);
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
  facts.append(
    fact("Model", `${KRAK.name} — modular hill study`),
    fact("Phase", phase === "hospitalier-1270" ? "Hospitaller, c. 1270" : "Mamluk alterations, c. 1302"),
    fact("Parts", String(parts.length)),
    fact("Note", KRAK.note),
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
  facts.append(download);
}

if (!entries.length) {
  const empty = document.createElement("p");
  empty.textContent = "No buildings are in the catalogue.";
  list.append(empty);
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
    list.append(button);
  }
  show(entries[0]);
}

const assemblies = document.createElement("h2");
const aqueducts = document.createElement("h2");
aqueducts.textContent = "Aqueduct assemblies";
list.append(aqueducts);
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
  facts.append(
    fact("Model", PONT_DU_GARD.name),
    fact("Period", "Roman antiquity"),
    fact("Dimensions", `${width} × 6 × ${PONT_DU_GARD.height} m`),
    fact("Assembly", "6 large bays on each lower tier; 24 small arches on the upper tier"),
    fact(
      "Note",
      "Simplified imagined intact aqueduct inspired by Pont du Gard. Repeated bays share geometry; dimensions are illustrative. The upper channel is open for inspection."
    ),
    fact("Omitted", "Modern road bridge, damage, weathering, terrain and individual masonry blocks")
  );
});
list.append(aqueductButton);
assemblies.textContent = "Fortress assemblies";
list.append(assemblies);
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
  facts.append(
    fact("Model", BOJNICE.name),
    fact("Phase", "Romantic reconstruction, 1889–1910"),
    fact("Study envelope", `${BOJNICE.width} × ${BOJNICE.depth} × ${BOJNICE.height} m`),
    fact("Note", BOJNICE.note)
  );
  const source = document.createElement("a");
  source.href = BOJNICE.source;
  source.textContent = "Museum source";
  source.target = "_blank";
  source.rel = "noreferrer";
  facts.append(source);
});
list.append(bojniceButton);
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
  facts.append(
    fact("Model", CHAMBORD.name),
    fact("Period", "French Renaissance"),
    fact("Study envelope", `${CHAMBORD.width} × ${CHAMBORD.depth} × ${CHAMBORD.height} m`),
    fact("Note", CHAMBORD.note)
  );
  const source = document.createElement("a");
  source.href = CHAMBORD.source;
  source.textContent = "Official architecture source";
  source.target = "_blank";
  source.rel = "noreferrer";
  facts.append(source);
});
list.append(chambordButton);
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
  list.append(button);
}

const shipsHeading = document.createElement("h2");
shipsHeading.textContent = "Ships";
list.append(shipsHeading);
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
  facts.append(
    fact("Model", CARRACK.name),
    fact("Period", "Late medieval / early modern · imagined merchant vessel"),
    fact(
      "Dimensions",
      `${CARRACK.length} m overall length × ${CARRACK.beam} m beam; ${CARRACK.height} m above water; ${CARRACK.draft} m draft`
    ),
    fact("Rig", "Three masts; square-rigged fore and main masts; lateen mizzen"),
    fact("Hull", "Broad round-bilged hull; high forecastle and stepped sterncastle"),
    fact("Note", CARRACK.note)
  );
  const source = document.createElement("a");
  source.href = CARRACK.source;
  source.textContent = "Mariners’ Museum · Carrack";
  source.target = "_blank";
  source.rel = "noreferrer";
  facts.append(source);
});
list.append(carrackButton);

const galleonButton = document.createElement("button");
galleonButton.type = "button";
galleonButton.textContent = "Galleon · Three-masted sailing ship";
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
  facts.append(
    fact("Model", GALLEON.name),
    fact("Period", "Age of sail · imagined early modern vessel"),
    fact(
      "Dimensions",
      `${GALLEON.length} m overall length × ${GALLEON.beam} m beam; ${GALLEON.height} m above water; ${GALLEON.draft} m draft`
    ),
    fact("Rig", "Three masts; square-rigged fore and main masts; lateen mizzen"),
    fact("Armament", "14 broadside guns"),
    fact("Note", GALLEON.note)
  );
});
list.append(galleonButton);

const siegeHeading = document.createElement("h2");
siegeHeading.textContent = "Siege engines";
list.append(siegeHeading);
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
  facts.append(
    fact("Model", TREBUCHET.name),
    fact("Type", "Hinged-counterweight siege engine"),
    fact("Study envelope", `${TREBUCHET.length} × ${TREBUCHET.width} × ${TREBUCHET.height} m`),
    fact("Throwing arm", `${TREBUCHET.longArm} m long arm / ${TREBUCHET.shortArm} m counterweight arm`),
    fact("Pose", "Lowered for loading; sling and projectile in the trough"),
    fact("Note", TREBUCHET.note)
  );
});
list.append(trebuchetButton);

const millsHeading = document.createElement("h2");
millsHeading.textContent = "Mills";
list.append(millsHeading);
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
  facts.append(
    fact("Model", POST_MILL.name),
    fact("Style", "Medieval Europe · Timber post mill"),
    fact("Study envelope", `${POST_MILL.width} × ${POST_MILL.depth} × ${POST_MILL.height} m`),
    fact("Sails", `Four canvas-covered lattice sails; ${POST_MILL.sailRadius * 2} m stock diameter`),
    fact("Structure", "Timber milling house on a braced central post; rear stair and tailpole"),
    fact("Note", POST_MILL.note)
  );
});
list.append(postMillButton);

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
  facts.append(
    fact("Model", TOWER_MILL.name),
    fact("Style", "European stone tower mill"),
    fact("Study envelope", `${TOWER_MILL.width} × ${TOWER_MILL.depth} × ${TOWER_MILL.height} m`),
    fact("Tower", `${TOWER_MILL.towerHeight} m high; ${TOWER_MILL.baseRadius * 2} m diameter at the base`),
    fact("Sails", "Four canvas-covered lattice sails on a timber cap"),
    fact("Note", TOWER_MILL.note)
  );
});
list.append(towerMillButton);

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
  facts.append(
    fact("Model", WATER_MILL.name),
    fact("Style", "Medieval Europe · Stone and half-timbered grain mill"),
    fact("Study envelope", `${WATER_MILL.width} × ${WATER_MILL.depth} × ${WATER_MILL.height} m`),
    fact("Wheel", `Wooden overshot wheel; ${WATER_MILL.wheelRadius * 2} m diameter; 24 buckets`),
    fact("Water supply", "Raised timber flume with sluice gate; lower millrace and axle bearing pier"),
    fact("Note", WATER_MILL.note)
  );
});
list.append(waterMillButton);

resize();
new ResizeObserver(resize).observe(stage);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
