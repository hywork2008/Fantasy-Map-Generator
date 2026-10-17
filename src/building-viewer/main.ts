import "./viewer.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { contentDigest } from "../buildings/canonicalJson";
import { committedSvgHash, levelPlanSvg, planSvg } from "../buildings/planSvg";
import { type BuildingRecord, type HistoricalPeriod, TRIANGLE_BUDGET } from "../buildings/record";
import { validateBuildingRecord } from "../buildings/validate";
import { catalogueMassing } from "../city3d/core/catalogueMassing";
import { structureSurfaces } from "../city3d/core/structureGeometry";
import { type CityStructureMeshes, createStructureMassing } from "../city3d/three/structureMeshes";
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

function frame(record: BuildingRecord, height: number): void {
  const radius = Math.max(record.occupancyMeters.width, record.occupancyMeters.depth, 8);
  camera.position.set(radius * 1.45, Math.max(height, 4) * 1.25, radius * 1.45);
  controls.target.set(0, height * 0.42, 0);
  controls.update();
  ground.geometry.dispose();
  ground.geometry = new THREE.CircleGeometry(radius * 0.9, 48);
}

function clearMesh(): void {
  ground.visible = false;
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

resize();
new ResizeObserver(resize).observe(stage);
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
