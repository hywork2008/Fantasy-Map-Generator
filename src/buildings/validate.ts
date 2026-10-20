import { isHistoricalPeriod } from "../types/historicalPeriod";
import { contentDigest } from "./canonicalJson";
import { boundsOf, holeInside, holesOverlap, ringArea, ringIsSimple, ringPerimeter } from "./geometry";
import {
  BUILDING_RECORD_FORMAT,
  BUILDING_RECORD_VERSION,
  type BuildingKind,
  type BuildingRecord,
  CASTLE_PLAN_FAMILIES,
  type FloorPlate,
  type LevelRecord,
  MAX_FRAME_METERS,
  MAX_LEVELS,
  MAX_VERTICES_PER_LEVEL,
  MEDIEVAL_PERIODS,
  type OpeningRecord,
  type Point,
  type WallLoop
} from "./record";

export interface ValidBuilding {
  ok: true;
  record: BuildingRecord;
}

export interface InvalidBuilding {
  ok: false;
  errors: string[];
}

const PLACEMENT = new Set(["classic", "norman-keep", "concentric"]);
const CASTLE_FAMILIES = new Set<string>(CASTLE_PLAN_FAMILIES);
const WALL_KINDS = new Set(["curtain", "keep", "tower", "range", "partition", "chemise"]);
const OPENING_KINDS = new Set(["door", "gate", "arch", "window", "arrow-slit", "postern"]);
const ROOF_FORMS = new Set(["flat", "gable", "hip", "pyramid", "cone"]);
const WALL_MATERIALS = new Set(["stone", "brick", "timber"]);
const ROOF_MATERIALS = new Set(["lead", "tile", "slate", "thatch", "flat-stone"]);
const PLATE_KINDS = new Set(["room", "corridor", "courtyard", "yard", "hall", "court", "other"]);

function isPoint(value: unknown): value is Point {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function vertexCount(level: LevelRecord): number {
  let count = 0;
  const rings = [
    ...level.walls.flatMap(wall => [wall.outer, ...wall.holes]),
    ...level.plates.flatMap(plate => [plate.outer, ...plate.holes]),
    ...level.fixtures.map(fixture => fixture.footprint)
  ];
  for (const ring of rings) count += ring.length;
  return count;
}

function checkRing(errors: string[], label: string, ring: readonly Point[], winding: "ccw" | "cw"): boolean {
  if (!ring.every(isPoint) || !ringIsSimple(ring)) {
    errors.push(`${label} is not a simple ring with vertices at least 0.05 m apart`);
    return false;
  }
  const area = ringArea(ring);
  if (winding === "ccw" && area <= 0) errors.push(`${label} must be counter-clockwise`);
  if (winding === "cw" && area >= 0) errors.push(`${label} must be clockwise`);
  return true;
}

function intervalsOverlap(openings: readonly OpeningRecord[], errors: string[], levelId: string): void {
  const groups = new Map<string, OpeningRecord[]>();
  for (const opening of openings) {
    const key = `${opening.ring.wallId}:${opening.ring.hole ?? "outer"}`;
    const group = groups.get(key) ?? [];
    group.push(opening);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => a.offsetMeters - b.offsetMeters);
    for (let i = 1; i < ordered.length; i++) {
      const previous = ordered[i - 1];
      if (previous.offsetMeters + previous.widthMeters > ordered[i].offsetMeters + 1e-6) {
        errors.push(`level ${levelId} openings overlap on one ring`);
      }
    }
  }
}

function checkOpenings(errors: string[], level: LevelRecord, kind: BuildingKind, walls: Map<string, WallLoop>): void {
  let mains = 0;
  for (const opening of level.openings) {
    if (!OPENING_KINDS.has(opening.kind)) errors.push(`opening ${opening.id} has an unknown kind`);
    if (
      !(opening.widthMeters > 0) ||
      opening.offsetMeters < 0 ||
      !(opening.heightMeters > 0) ||
      opening.sillMeters < 0
    ) {
      errors.push(`opening ${opening.id} has a bad interval`);
    }
    const wall = walls.get(opening.ring.wallId);
    const ring =
      opening.ring.hole === null ? wall?.outer : opening.ring.hole >= 0 ? wall?.holes[opening.ring.hole] : undefined;
    if (!wall || !ring) {
      errors.push(`opening ${opening.id} does not lie on a wall ring`);
      continue;
    }
    if (opening.offsetMeters + opening.widthMeters > ringPerimeter(ring) + 1e-4) {
      errors.push(`opening ${opening.id} does not lie on its ring`);
    }
    if (kind === "dungeon") {
      if (!opening.state || !opening.visibility || !opening.role || opening.locked === undefined) {
        errors.push(`opening ${opening.id} is missing dungeon state`);
      }
      if (opening.role === "main") mains += 1;
    }
  }
  if (kind === "dungeon" && mains > 1) errors.push(`level ${level.id} has more than one main entrance`);
  intervalsOverlap(level.openings, errors, level.id);
}

function checkLevel(errors: string[], level: LevelRecord, kind: BuildingKind): void {
  if (!level.id || !(level.floorToFloorMeters > 0) || !Number.isFinite(level.elevationMeters)) {
    errors.push(`level ${level.id || "(missing)"} has a bad elevation or height`);
  }
  const walls = new Map<string, WallLoop>();
  const plates = new Map<string, FloorPlate>();
  for (const wall of level.walls) {
    if (walls.has(wall.id)) errors.push(`level ${level.id} repeats wall ${wall.id}`);
    walls.set(wall.id, wall);
    if (!WALL_KINDS.has(wall.kind) || !(wall.thicknessMeters > 0)) errors.push(`wall ${wall.id} is incomplete`);
    if (kind === "dungeon" && wall.locked === undefined) errors.push(`wall ${wall.id} is missing locked`);
    checkRing(errors, `wall ${wall.id} outer`, wall.outer, "ccw");
    wall.holes.forEach((hole, index) => {
      if (!checkRing(errors, `wall ${wall.id} hole ${index}`, hole, "cw")) return;
      if (!holeInside(wall.outer, hole)) errors.push(`wall ${wall.id} hole ${index} is outside its outer ring`);
    });
    for (let i = 0; i < wall.holes.length; i++) {
      for (let j = i + 1; j < wall.holes.length; j++) {
        if (holesOverlap(wall.holes[i], wall.holes[j])) errors.push(`wall ${wall.id} holes overlap`);
      }
    }
  }
  for (const plate of level.plates) {
    if (plates.has(plate.id)) errors.push(`level ${level.id} repeats plate ${plate.id}`);
    plates.set(plate.id, plate);
    if (!plate.use) errors.push(`plate ${plate.id} needs a use`);
    if (plate.kind !== undefined && !PLATE_KINDS.has(plate.kind)) errors.push(`plate ${plate.id} has an unknown kind`);
    if (kind === "dungeon" && (plate.label === undefined || plate.locked === undefined)) {
      errors.push(`plate ${plate.id} is missing a dungeon label or lock`);
    }
    checkRing(errors, `plate ${plate.id} outer`, plate.outer, "ccw");
    plate.holes.forEach((hole, index) => {
      checkRing(errors, `plate ${plate.id} hole ${index}`, hole, "cw");
    });
  }
  for (const fixture of level.fixtures) {
    if (!plates.has(fixture.plateId)) errors.push(`fixture ${fixture.id} has no plate`);
    if (fixture.blocking !== false || (fixture.kind !== "well" && fixture.kind !== "table")) {
      errors.push(`fixture ${fixture.id} is not a decorative well or table`);
    }
    checkRing(errors, `fixture ${fixture.id}`, fixture.footprint, "ccw");
  }
  if (kind === "dungeon" && !level.openJoins) errors.push(`level ${level.id} is missing openJoins`);
  if (kind !== "dungeon" && level.openJoins) errors.push(`level ${level.id} must omit openJoins`);
  for (const join of level.openJoins ?? []) {
    if (!plates.has(join.plateA) || !plates.has(join.plateB) || !(join.clearanceMeters >= 0)) {
      errors.push(`open join ${join.id} does not connect two plates`);
    }
  }
  checkOpenings(errors, level, kind, walls);
  if (vertexCount(level) > MAX_VERTICES_PER_LEVEL) errors.push(`level ${level.id} has more than 512 vertices`);
}

function checkLinks(errors: string[], record: BuildingRecord): void {
  const ids = new Set(record.levels.map(level => level.id));
  for (const link of record.verticalLinks) {
    if (!ids.has(link.fromLevelId) || !ids.has(link.toLevelId)) errors.push(`vertical link ${link.id} has a bad level`);
    if (link.kind !== "stair" && link.kind !== "ladder" && link.kind !== "ramp") {
      errors.push(`vertical link ${link.id} has an unknown kind`);
    }
    if (!(link.widthMeters > 0)) errors.push(`vertical link ${link.id} needs a width`);
    checkRing(errors, `vertical link ${link.id}`, link.footprint, "ccw");
  }
  if (record.kind !== "castle" || record.generation || record.levels.length < 2) return;
  const ordered = [...record.levels].sort((a, b) => a.elevationMeters - b.elevationMeters || (a.id < b.id ? -1 : 1));
  for (let i = 1; i < ordered.length; i++) {
    const below = ordered[i - 1].id;
    const above = ordered[i].id;
    const linked = record.verticalLinks.some(
      link =>
        (link.fromLevelId === below && link.toLevelId === above) ||
        (link.fromLevelId === above && link.toLevelId === below)
    );
    if (!linked) errors.push(`catalogue castle levels ${below} and ${above} have no vertical link`);
  }
}

function checkRoofs(errors: string[], record: BuildingRecord): void {
  const walls = new Map<string, WallLoop>();
  const plates = new Set<string>();
  for (const level of record.levels) {
    for (const wall of level.walls) walls.set(wall.id, wall);
    for (const plate of level.plates) plates.add(plate.id);
  }
  for (const roof of record.roofs) {
    if (!ROOF_FORMS.has(roof.form) || !Number.isFinite(roof.pitchDeg)) errors.push(`roof ${roof.baseId} is incomplete`);
    const wall = walls.get(roof.baseId);
    if (!wall && !plates.has(roof.baseId)) errors.push(`roof ${roof.baseId} does not sit on a wall or plate`);
    if (wall && wall.holes.length > 0 && roof.form !== "flat") {
      errors.push(`roof ${roof.baseId} on a wall with a hole must be flat`);
    }
  }
}

function checkOccupancy(errors: string[], record: BuildingRecord): void {
  const outers = record.levels.flatMap(level => [
    ...level.walls.map(wall => wall.outer),
    ...level.plates.map(plate => plate.outer)
  ]);
  const bounds = boundsOf(outers);
  if (!bounds) {
    errors.push("the record has no outer ring");
    return;
  }
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxY - bounds.minY;
  if (width > MAX_FRAME_METERS || depth > MAX_FRAME_METERS) errors.push("the plan exceeds 400 m on a side");
  if (Math.abs(width - record.occupancyMeters.width) > 0.05 || Math.abs(depth - record.occupancyMeters.depth) > 0.05) {
    errors.push("occupancyMeters does not match the outer bounding box");
  }
  const catalogueCastle = record.kind === "castle" && !record.generation;
  if (!catalogueCastle) return;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  if (Math.hypot(cx, cy) > 0.05) errors.push("a catalogue castle must be centred on the local origin");
}

function checkKind(errors: string[], record: BuildingRecord): void {
  const family = record.planFamily;
  if (record.kind === "castle" && !record.generation) {
    if (!family || !CASTLE_FAMILIES.has(family)) errors.push("a catalogue castle needs a castle plan family");
    if (record.approachAzimuthRadians === undefined || !Number.isFinite(record.approachAzimuthRadians)) {
      errors.push("a catalogue castle needs approachAzimuthRadians");
    }
    if (!record.placementStyles.length) errors.push("a catalogue castle needs a placement style");
    if (!(MEDIEVAL_PERIODS as readonly string[]).includes(record.period)) {
      errors.push("a catalogue castle period must be early, high, or late medieval");
    }
    const provenance = record.provenance;
    if (
      !provenance.constructionPeriod ||
      !provenance.depictedPhase ||
      !provenance.dimensionSource ||
      !provenance.note ||
      !Array.isArray(provenance.omitted) ||
      provenance.omitted.length === 0 ||
      provenance.omitted.some(item => !item)
    ) {
      errors.push("a catalogue castle needs provenance, including what was omitted");
    }
  }
  if (record.kind === "dungeon") {
    if (family !== "procedural-rooms") errors.push("a dungeon plan family must be procedural-rooms");
    if (!record.generation) errors.push("a dungeon needs generation settings");
  }
  if (
    record.kind === "temple" ||
    record.kind === "monastery" ||
    record.kind === "house" ||
    record.kind === "watermill"
  ) {
    if (family !== undefined && family !== "other") errors.push(`${record.kind} planFamily must be omitted or other`);
  }
}

function checkIdentity(errors: string[], record: BuildingRecord): void {
  if (record.format !== BUILDING_RECORD_FORMAT || record.version !== BUILDING_RECORD_VERSION) {
    errors.push("format or version is not a building record");
  }
  if (!record.id || !record.name || !Number.isInteger(record.revision) || record.revision < 1) {
    errors.push("id, name, or revision is missing");
  }
  if (!isHistoricalPeriod(record.period)) errors.push("period is unknown");
  if (!Array.isArray(record.placementStyles) || !record.placementStyles.every(style => PLACEMENT.has(style))) {
    errors.push("placementStyles has an unknown style");
  }
  if (!WALL_MATERIALS.has(record.materials?.wall) || !ROOF_MATERIALS.has(record.materials?.roof)) {
    errors.push("materials are unknown");
  }
  const planClass = record.provenance?.planClass;
  if (planClass !== "published-dimensions" && planClass !== "well-published-survey") {
    errors.push("plan class is unknown");
  }
  const confidence = record.provenance?.confidence;
  if (confidence !== "measured" && confidence !== "scholarly-reconstruction" && confidence !== "approximate") {
    errors.push("confidence is unknown");
  }
  if (!Array.isArray(record.levels) || record.levels.length < 1 || record.levels.length > MAX_LEVELS) {
    errors.push("a record needs 1 to 8 levels");
  }
  if (!/^[0-9a-f]{64}$/.test(record.contentHash ?? "")) errors.push("contentHash is not a sha256 hex digest");
}

export function validateBuildingRecord(value: unknown): ValidBuilding | InvalidBuilding {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return { ok: false, errors: ["record is not an object"] };
  const record = value as BuildingRecord;
  checkIdentity(errors, record);
  if (errors.length) return { ok: false, errors };
  checkKind(errors, record);
  for (const level of record.levels) checkLevel(errors, level, record.kind);
  checkLinks(errors, record);
  checkRoofs(errors, record);
  checkOccupancy(errors, record);
  if (!errors.length && contentDigest(record) !== record.contentHash)
    errors.push("contentHash does not match the record");
  return errors.length ? { ok: false, errors } : { ok: true, record };
}
