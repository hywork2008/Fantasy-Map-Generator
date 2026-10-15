import type { WorldContext } from "../../../src/context/worldContext";
import type { BurgRoadAuditReference } from "../../../src/services/burgRoadAuditReference";
import { auditCeRoads } from "./ceRoads";
import { burgDestinationTraits } from "../../../src/services/burgDestinationTraits";
import type { Route } from "../../../src/types/models";
import type { PackedGraph } from "../../../src/types/PackedGraph";
import { normalizeHeightExponent } from "../../../src/utils/height";
import { mapUnitMeters } from "../../../src/utils/mapUnitMeters";
import { rn } from "../../../src/utils/numberUtils";
import {
  buildDirectionsGraphs,
  computeDirectionsForWorld,
  pickDefaultMode,
  TRAVEL_MODES,
  type TravelMode
} from "../../../src/services/travelDirectionsCore";
import { type FmgArchive, type RecordValue, record } from "../fmgArchiveReader";

export interface AuditOptions {
  burgIds: number[];
  all: boolean;
  distanceUnit?: string;
  heightExponent?: number;
  travelMode: TravelMode | "auto";
  avoidSea: boolean;
  preferSea: boolean;
  nearbyRadiusKm?: number;
  ceHandoff?: BurgRoadAuditReference;
}
export interface Finding extends RecordValue {
  ruleId: string;
  severity: "error" | "warning" | "info";
  status: "flagged" | "skipped" | "pass";
  subject: string;
  message: string;
  evidence: string[];
}
export interface AuditReport {
  schemaVersion: number;
  metadata: RecordValue;
  burgs: RecordValue[];
  connections: RecordValue[];
  directions: RecordValue[];
  ceRoads: RecordValue[];
  ceDifferences: RecordValue[];
  nearby: RecordValue[];
  military: RecordValue[];
  findings: Finding[];
}
const finite = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const id = (value: unknown): number | null =>
  Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
const bool = (value: unknown): boolean | null =>
  value === true || value === 1 ? true : value === false || value === 0 ? false : null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const column = (value: unknown, index: number): unknown => (value as ArrayLike<unknown> | undefined)?.[index];
const pointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
const worldPath = "map/world.json#";
const simulationPath = "simulation/core.json#";
const units = new Set(["km", "mi", "lg", "vr", "nmi"]);

export function buildCityAudit(archive: FmgArchive, options: AuditOptions): AuditReport {
  const { world, simulation } = archive;
  const pack = record(world.pack);
  const cells = record(pack.cells);
  const simulationBurgs = record(simulation.burgs);
  const findings: Finding[] = [];
  function finding(
    ruleId: string,
    severity: Finding["severity"],
    subject: string,
    message: string,
    evidence: string[],
    status: Finding["status"] = "flagged"
  ) {
    findings.push({ ruleId, ruleVersion: 1, severity, status, subject, message, evidence });
  }
  const burgs = new Map<number, RecordValue>();
  const burgPaths = new Map<number, string>();
  const states = new Map<number, RecordValue>();
  const statePaths = new Map<number, string>();
  const pointCount = list(cells.p).length;
  const validCell = (value: unknown) =>
    id(value) !== null &&
    (value as number) < pointCount &&
    list(column(cells.p, value as number)).length >= 2 &&
    list(column(cells.p, value as number))
      .slice(0, 2)
      .every(v => finite(v) !== null);
  for (const [index, raw] of list(pack.states).entries()) {
    const st = record(raw);
    const stateId = id(st.i);
    if (stateId === null || st.removed) continue;
    if (states.has(stateId)) {
      finding("DATA_REFERENCE_INVALID", "error", `state:${stateId}`, "Duplicate state ID", [
        `${worldPath}/pack/states/${index}`
      ]);
    } else {
      states.set(stateId, st);
      statePaths.set(stateId, `${worldPath}/pack/states/${index}`);
    }
  }
  const invalidBurgs = new Set<number>();
  for (const [index, raw] of list(pack.burgs).entries()) {
    if (index === 0 && (!raw || raw === 0)) continue;
    const burg = record(raw);
    const burgId = id(burg.i);
    if (burg.removed) continue;
    const evidence = [`${worldPath}/pack/burgs/${index}`];
    if (!burgId) {
      finding("DATA_REFERENCE_INVALID", "error", `burg-index:${index}`, "Missing or invalid burg ID", evidence);
      continue;
    }
    if (burgs.has(burgId)) {
      invalidBurgs.add(burgId);
      finding(
        "DATA_REFERENCE_INVALID",
        "error",
        `burg:${burgId}`,
        "Duplicate burg ID; directions disabled for this burg",
        evidence
      );
      continue;
    }
    burgs.set(burgId, burg);
    burgPaths.set(burgId, evidence[0]);
    if (!validCell(burg.cell) || finite(burg.x) === null || finite(burg.y) === null) {
      invalidBurgs.add(burgId);
      finding("DATA_REFERENCE_INVALID", "error", `burg:${burgId}`, "Invalid burg cell or position", evidence);
    }
    if (burg.state !== 0 && !states.has(burg.state as number)) {
      finding("DATA_REFERENCE_INVALID", "error", `burg:${burgId}`, "Missing owning state", evidence);
    }
    if (validCell(burg.cell) && column(cells.burg, burg.cell as number) !== burgId) {
      finding(
        "DATA_REFERENCE_INVALID",
        "error",
        `burg:${burgId}`,
        "Burg cell does not point back to this burg",
        evidence
      );
    }
  }
  const sourceIds = options.all
    ? [...burgs.keys()].sort((a, b) => a - b)
    : [...new Set(options.burgIds)].sort((a, b) => a - b);
  for (const burgId of sourceIds) if (!burgs.has(burgId)) throw new Error(`Burg ${burgId} is missing or removed`);
  const sourceSet = new Set(sourceIds);
  const included = new Set(sourceIds);
  const savedUnit = record(world.options).distanceUnit ?? record(world.options).registeredLandConnectionUnit;
  if (savedUnit !== undefined && !units.has(String(savedUnit)))
    throw new Error(`Unsupported stored distance unit: ${savedUnit}`);
  if (options.distanceUnit && savedUnit && savedUnit !== options.distanceUnit)
    throw new Error("--distance-unit conflicts with stored unit");
  const distanceUnit = savedUnit ? String(savedUnit) : (options.distanceUnit ?? null);
  const distanceScale = finite(world.distanceScale);
  const metersPerMapUnit =
    distanceUnit && distanceScale !== null && distanceScale > 0 ? mapUnitMeters(distanceScale, distanceUnit) : null;
  const savedHeight = finite(record(world.options).heightExponent);
  const heightExponent = normalizeHeightExponent(options.heightExponent ?? savedHeight ?? undefined);
  const populationRate = finite(world.populationRate);
  const urbanization = finite(world.urbanization);
  const popFactor =
    populationRate !== null && urbanization !== null && populationRate >= 0 && urbanization >= 0
      ? populationRate * urbanization
      : null;
  if (popFactor === null)
    finding("DATA_VALUE_MISSING", "warning", "world", "Population scaling is missing or invalid", [
      `${worldPath}/populationRate`,
      `${worldPath}/urbanization`
    ]);
  if (!distanceUnit)
    finding(
      "DISTANCE_UNIT_UNKNOWN",
      "warning",
      "world",
      "Directions values are preserved, but physical km/meters are unconfirmed; supply --distance-unit",
      [`${worldPath}/distanceScale`]
    );

  function owned(burgId: number, field: string): { value: unknown; evidence: string; sourceKind: string } {
    const burg = burgs.get(burgId)!;
    const sim = record(simulationBurgs[String(burgId)]);
    if (Object.hasOwn(sim, field)) {
      if (Object.hasOwn(burg, field) && JSON.stringify(burg[field]) !== JSON.stringify(sim[field])) {
        finding("DATA_OWNER_CONFLICT", "warning", `burg:${burgId}`, `Conflicting ${field}; simulation value selected`, [
          `${burgPaths.get(burgId)}/${field}`,
          `${simulationPath}/burgs/${burgId}/${field}`
        ]);
      }
      return { value: sim[field], evidence: `${simulationPath}/burgs/${burgId}/${field}`, sourceKind: "stored" };
    }
    return {
      value: burg[field],
      evidence: `${burgPaths.get(burgId)}/${field}`,
      sourceKind: Object.hasOwn(burg, field) ? "stored_legacy_fallback" : "missing"
    };
  }
  // Cache ownership resolution: each field contributes at most one conflict finding per city.
  const facts = new Map<number, Record<string, ReturnType<typeof owned>>>();
  for (const burgId of burgs.keys())
    facts.set(
      burgId,
      Object.fromEntries(
        ["population", "treasury", "product", "demographics"].map(field => [field, owned(burgId, field)])
      )
    );
  function population(burgId: number): number | null {
    const points = finite(facts.get(burgId)?.population.value);
    return points !== null && points >= 0 && popFactor !== null ? Math.round(points * popFactor) : null;
  }
  function relation(from: RecordValue, to: RecordValue): RecordValue {
    const a = id(from.state);
    const b = id(to.state);
    const domestic = a !== null && a > 0 && a === b && states.has(a);
    const raw = a !== null && b !== null ? column(states.get(a)?.diplomacy, b) : undefined;
    const reverse = a !== null && b !== null ? column(states.get(b)?.diplomacy, a) : undefined;
    const known =
      typeof raw === "string" && a !== null && a > 0 && b !== null && b > 0 && states.has(a) && states.has(b);
    const classByRaw: Record<string, string> = {
      Enemy: "enemy",
      Rival: "rival",
      Friendly: "friendly",
      Ally: "friendly",
      Neutral: "neutral"
    };
    return {
      sourceStateId: a,
      targetStateId: b,
      isDomestic: domestic,
      relationRaw: known ? raw : null,
      reverseRelationRaw: typeof reverse === "string" ? reverse : null,
      relationClass: domestic
        ? "domestic"
        : known
          ? Object.hasOwn(classByRaw, raw)
            ? classByRaw[raw]
            : "other"
          : "unknown",
      relationEvidence: a !== null && b !== null && statePaths.has(a) ? `${statePaths.get(a)}/diplomacy/${b}` : null
    };
  }
  function ceProjection(burgId: number): RecordValue {
    const b = burgs.get(burgId)!;
    const { scale, role } = burgDestinationTraits({
      population: finite(facts.get(burgId)?.population.value) ?? undefined,
      group: typeof b.group === "string" ? b.group : undefined,
      capital: b.capital,
      citadel: b.citadel,
      walls: b.walls,
      port: b.port,
      plaza: b.plaza
    });
    return { scale, role, status: "shared_classifier_full_descriptor_not_verified" };
  }

  let invalidRoutes = false;
  const routes = list(pack.routes);
  const routeIds = new Set<number>();
  const routeIndex = new Map<number, Array<{ route: RecordValue; index: number }>>();
  for (const [index, raw] of routes.entries()) {
    const route = record(raw);
    const routeId = id(route.i);
    const points = list(route.points);
    const evidence = [`${worldPath}/pack/routes/${index}`];
    if (
      routeId === null ||
      routeIds.has(routeId) ||
      !Array.isArray(route.points) ||
      points.some(
        p => !Array.isArray(p) || p.length < 3 || finite(p[0]) === null || finite(p[1]) === null || !validCell(p[2])
      )
    ) {
      invalidRoutes = true;
      finding(
        "DATA_REFERENCE_INVALID",
        "error",
        `route:${routeId ?? index}`,
        "Invalid/duplicate route ID, points, or cell reference; Directions cannot be trusted",
        evidence
      );
      continue;
    }
    routeIds.add(routeId);
    if (route.merged) continue;
    const seen = new Set<number>();
    for (const point of points as number[][]) {
      const bid = id(column(cells.burg, point[2]));
      if (bid && !burgs.has(bid))
        finding(
          "DATA_REFERENCE_INVALID",
          "error",
          `route:${routeId}`,
          `Route cell refers to missing or removed burg ${bid}`,
          evidence
        );
      if (!bid || !sourceSet.has(bid) || seen.has(bid)) continue;
      seen.add(bid);
      const entries = routeIndex.get(bid) ?? [];
      entries.push({ route, index });
      routeIndex.set(bid, entries);
    }
  }
  // Separate indexed view for the Directions API; do not mutate the stored records.
  const alignedBurgs: unknown[] = [];
  for (const [burgId, burg] of burgs) alignedBurgs[burgId] = burg;
  const directionPack = { ...pack, burgs: alignedBurgs } as unknown as PackedGraph;
  const heights = cells.h as ArrayLike<unknown> | undefined;
  const validHeights =
    heights && Array.from({ length: pointCount }, (_, i) => finite(heights[i]) !== null).every(Boolean);
  const directionsAvailable = !invalidRoutes && validHeights && distanceScale !== null && distanceScale > 0;
  if (!directionsAvailable)
    finding(
      "DIRECTIONS_INPUT_INVALID",
      "error",
      "world",
      "Directions disabled: invalid route geometry, cell heights, or distanceScale",
      [`${worldPath}/pack`, `${worldPath}/distanceScale`]
    );
  const graphs = directionsAvailable ? buildDirectionsGraphs(directionPack) : null;
  const directionRows: RecordValue[] = [];
  const selectedDirections = new Map<string, RecordValue>();
  function directions(fromId: number, toId: number): RecordValue {
    const key = `${fromId}:${toId}`;
    const cached = selectedDirections.get(key);
    if (cached) return cached;
    const directionsId = `directions:${fromId}:${toId}`;
    const result =
      graphs && !invalidBurgs.has(fromId) && !invalidBurgs.has(toId)
        ? computeDirectionsForWorld(
            { pack: directionPack, distanceScale: distanceScale!, heightExponent },
            fromId,
            toId,
            { avoidSea: options.avoidSea, preferSea: options.preferSea },
            graphs
          )
        : null;
    const selectedMode = result ? (options.travelMode === "auto" ? pickDefaultMode(result) : options.travelMode) : null;
    let selected: RecordValue = {
      directionsId,
      directionsMode: selectedMode,
      directionsStatus: "invalid_input",
      directionsDistanceValue: null,
      directionsDisplayDistance: null,
      directionsComposition: null,
      routeDistanceKm: null,
      routeDistanceMeters: null
    };
    for (const mode of TRAVEL_MODES) {
      const modeResult = result?.[mode];
      const route = modeResult?.available ? modeResult.route : null;
      // Directions labels its raw number distanceKm without reading distanceUnit.
      const physicalKm = route && distanceUnit === "km" ? route.distanceKm : null;
      const row: RecordValue = {
        directionsId,
        sourceId: fromId,
        targetId: toId,
        mode,
        selected: selectedMode === mode,
        status: modeResult ? (modeResult.available ? "resolved" : modeResult.reasonKey) : "invalid_input",
        avoidSea: options.avoidSea,
        preferSea: options.preferSea,
        heightExponent,
        distanceBasis: "directions",
        distanceValue: route?.distanceKm ?? null,
        displayDistance: route ? rn(route.distanceKm) : null,
        displayUnit: distanceUnit,
        physicalUnitStatus: distanceUnit === "km" ? "confirmed_km" : "unconfirmed_directions_value",
        routeDistanceKm: physicalKm,
        routeDistanceMeters: physicalKm === null ? null : physicalKm * 1000,
        landDistanceValue: route?.landDistanceKm ?? null,
        seaDistanceValue: route?.seaDistanceKm ?? null,
        durationDays: route?.durationDays ?? null,
        composition: route?.composition ?? null,
        seaRequiredDespiteAvoid: route?.seaRequiredDespiteAvoid ?? null,
        preferSeaNoEffect: route?.preferSeaNoEffect ?? null,
        cells: route?.cells ?? [],
        kinds: route?.kinds ?? [],
        ascentM: route?.ascentM ?? null,
        descentM: route?.descentM ?? null,
        evidence: [
          `${worldPath}/pack/routes`,
          `${worldPath}/pack/cells/p`,
          `${worldPath}/pack/cells/h`,
          `${worldPath}/distanceScale`
        ],
        method: "travelDirectionsCore.computeDirectionsForWorld"
      };
      directionRows.push(row);
      if (selectedMode === mode)
        selected = {
          directionsId,
          directionsMode: mode,
          directionsStatus: row.status,
          routeDistanceKm: row.routeDistanceKm,
          routeDistanceMeters: row.routeDistanceMeters,
          directionsDistanceValue: row.distanceValue,
          directionsDisplayDistance: row.displayDistance,
          directionsComposition: row.composition
        };
    }
    if (result && !selectedMode) selected.directionsStatus = "no_available_mode";
    selectedDirections.set(key, selected);
    return selected;
  }

  const connections: RecordValue[] = [];
  for (const sourceId of sourceIds) {
    const source = burgs.get(sourceId)!;
    for (const { route, index: routeArrayIndex } of routeIndex.get(sourceId) ?? []) {
      const points = route.points as number[][];
      let start = -1;
      let nearest = Infinity;
      for (const [i, point] of points.entries()) {
        if (point[2] !== source.cell) continue;
        const d = Math.hypot(point[0] - Number(source.x), point[1] - Number(source.y));
        if (d < nearest) {
          nearest = d;
          start = i;
        }
      }
      if (start < 0) continue;
      for (const direction of ["forward", "backward"] as const) {
        const leg = direction === "forward" ? points.slice(start) : points.slice(0, start + 1).reverse();
        if (leg.length < 2) continue;
        let targetId: number | null = null;
        let missingTarget: number | null = null;
        let distance = 0;
        let stop = leg.length - 1;
        for (let i = 1; i < leg.length; i++) {
          distance += Math.hypot(leg[i][0] - leg[i - 1][0], leg[i][1] - leg[i - 1][1]);
          const bid = id(column(cells.burg, leg[i][2]));
          if (bid && bid !== sourceId) {
            if (burgs.has(bid)) targetId = bid;
            else missingTarget = bid;
            stop = i;
            break;
          }
        }
        const target = targetId ? burgs.get(targetId)! : null;
        if (targetId) included.add(targetId);
        const projection = targetId ? ceProjection(targetId) : {};
        const straight = target
          ? Math.hypot(Number(target.x) - Number(source.x), Number(target.y) - Number(source.y))
          : null;
        connections.push({
          connectionId: `${sourceId}:${route.i}:${direction}:0`,
          sourceId,
          sourceName: source.name,
          sourcePopulation: population(sourceId),
          sourceGroup: source.group ?? null,
          sourceCitadel: bool(source.citadel),
          sourceWalls: bool(source.walls),
          targetId,
          targetName: target?.name ?? null,
          targetPopulation: targetId ? population(targetId) : null,
          targetGroupRaw: target?.group ?? null,
          targetCeScale: projection.scale ?? null,
          targetCeRole: projection.role ?? null,
          targetCitadel: bool(target?.citadel),
          targetWalls: bool(target?.walls),
          targetStateName: states.get(Number(target?.state))?.name ?? null,
          ...(target ? relation(source, target) : { relationClass: "unknown" }),
          routeId: route.i,
          routeGroup: route.group,
          direction,
          branchId: 0,
          connectionKind: "stored_route_next_burg",
          pathStatus: missingTarget ? "invalid_reference" : target ? "resolved" : "terminal_without_burg",
          ceCompatibility: route.registeredConnectionId !== undefined ? "requires_registered_snapshot" : "not_verified",
          registeredConnectionId: route.registeredConnectionId ?? null,
          riverRoadConvergence: route.riverRoadConvergence ?? null,
          riverCrossings: route.riverCrossings ?? null,
          rawPathMapUnits: distance,
          rawPathDistanceKm: metersPerMapUnit === null ? null : (distance * metersPerMapUnit) / 1000,
          straightDistanceKm:
            straight === null || metersPerMapUnit === null ? null : (straight * metersPerMapUnit) / 1000,
          trafficRaw: finite(route.traffic),
          trafficUnit: "unknown",
          trafficPeriod: null,
          distanceBasis: "directions",
          ...(targetId ? directions(sourceId, targetId) : { routeDistanceKm: null, routeDistanceMeters: null }),
          evidence: [
            `${worldPath}/pack/routes/${routeArrayIndex}`,
            burgPaths.get(sourceId),
            targetId ? burgPaths.get(targetId) : null
          ].filter(Boolean),
          path: leg.slice(0, stop + 1),
          missingReasons: missingTarget ? [`missing_target_burg:${missingTarget}`] : []
        });
      }
    }
  }

  const nearby: RecordValue[] = [];
  if (options.nearbyRadiusKm !== undefined) {
    if (metersPerMapUnit === null)
      finding(
        "NEARBY_UNIT_UNKNOWN",
        "warning",
        "world",
        "Nearby search needs a confirmed distance unit",
        [],
        "skipped"
      );
    else {
      // Spatial bins prevent an all-cities scan for every origin.
      const size = (options.nearbyRadiusKm * 1000) / metersPerMapUnit;
      const bins = new Map<string, number[]>();
      for (const [bid, b] of burgs) {
        if (invalidBurgs.has(bid)) continue;
        const key = `${Math.floor(Number(b.x) / size)}:${Math.floor(Number(b.y) / size)}`;
        const bin = bins.get(key) ?? [];
        bin.push(bid);
        bins.set(key, bin);
      }
      for (const sourceId of sourceIds) {
        if (invalidBurgs.has(sourceId)) continue;
        const source = burgs.get(sourceId)!;
        const bx = Math.floor(Number(source.x) / size);
        const by = Math.floor(Number(source.y) / size);
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++) {
            for (const targetId of bins.get(`${bx + dx}:${by + dy}`) ?? []) {
              if (sourceId === targetId) continue;
              const target = burgs.get(targetId)!;
              const distance =
                (Math.hypot(Number(source.x) - Number(target.x), Number(source.y) - Number(target.y)) *
                  metersPerMapUnit) /
                1000;
              if (distance > options.nearbyRadiusKm) continue;
              included.add(targetId);
              nearby.push({
                sourceId,
                sourceName: source.name,
                targetId,
                targetName: target.name,
                straightDistanceKm: distance,
                radiusKm: options.nearbyRadiusKm,
                targetPopulation: population(targetId),
                targetCitadel: bool(target.citadel),
                targetWalls: bool(target.walls),
                ...relation(source, target),
                ...directions(sourceId, targetId)
              });
            }
          }
      }
    }
  }

  const ceBurgs = alignedBurgs.map((raw, burgId) => {
    const f = facts.get(burgId);
    if (!f) return raw;
    return {
      ...record(raw),
      population: f.population.value,
      treasury: f.treasury.value,
      product: f.product.value,
      demographics: f.demographics.value
    };
  });
  const ceWorld = { ...world, pack: { ...pack, burgs: ceBurgs } } as unknown as WorldContext;
  const ce = auditCeRoads({
    world: ceWorld,
    sourceIds,
    inputHash: archive.inputHash,
    metersPerMapUnit,
    distanceUnit,
    invalidInput: !directionsAvailable || invalidBurgs.size > 0 || popFactor === null,
    routesByBurg: new Map([...routeIndex].map(([id, entries]) => [id, entries.map(e => e.route as unknown as Route)])),
    reference: options.ceHandoff
  });
  findings.push(...ce.findings);
  for (const road of ce.roads) {
    if (burgs.has(Number(road.ceTargetId))) {
      included.add(Number(road.ceTargetId));
      Object.assign(road, directions(Number(road.sourceId), Number(road.ceTargetId)));
    }
  }
  for (const connection of connections) {
    const projected = ce.legs.get(`${connection.sourceId}:${connection.routeId}:${connection.direction}`);
    if (projected) {
      Object.assign(connection, projected, { ceCompatibility: "shared_reader_saved_geometry" });
      if (projected.ceTargetId !== connection.targetId)
        finding(
          "CE_ROUTE_DESTINATION_DIVERGENCE",
          "warning",
          `burg:${connection.sourceId}`,
          `Route ${connection.routeId} stored target ${connection.targetId} differs from CE reader target ${projected.ceTargetId}`,
          connection.evidence as string[]
        );
    }
  }

  const military: RecordValue[] = [];
  const militaryByCell = new Map<number, string[]>();
  const unitsByCell = new Map<number, Record<string, number>>();
  const unitsByState = new Map<number, Record<string, number>>();
  const burgsByCell = new Map<number, number[]>();
  for (const [bid, b] of burgs) {
    const cell = id(b.cell);
    if (cell === null) continue;
    const ids = burgsByCell.get(cell) ?? [];
    ids.push(bid);
    burgsByCell.set(cell, ids);
  }
  const rosterStates = new Set([...states.keys(), ...Object.keys(record(simulation.military)).map(Number)]);
  for (const stateId of [...rosterStates].sort((a, b) => a - b)) {
    const canonical = record(simulation.military)[String(stateId)];
    const legacy = states.get(stateId)?.military;
    const roster = canonical !== undefined ? canonical : legacy;
    if (canonical !== undefined && legacy !== undefined && JSON.stringify(canonical) !== JSON.stringify(legacy)) {
      finding(
        "DATA_OWNER_CONFLICT",
        "warning",
        `state:${stateId}`,
        "Conflicting military rosters; simulation selected",
        [`${simulationPath}/military/${stateId}`, `${statePaths.get(stateId)}/military`]
      );
    }
    if (roster === undefined) continue;
    if (!Array.isArray(roster)) {
      finding("DATA_REFERENCE_INVALID", "error", `state:${stateId}`, "Military roster is not an array", [
        `${simulationPath}/military/${stateId}`
      ]);
      continue;
    }
    const base =
      canonical !== undefined ? `${simulationPath}/military/${stateId}` : `${statePaths.get(stateId)}/military`;
    const seen = new Set<number>();
    for (const [index, raw] of roster.entries()) {
      const regiment = record(raw);
      const rid = id(regiment.i);
      const key = `${stateId}:${rid ?? index}`;
      if (rid === null || seen.has(rid)) {
        finding("DATA_REFERENCE_INVALID", "error", `regiment:${key}`, "Invalid/duplicate military ID", [
          `${base}/${index}`
        ]);
        continue;
      }
      seen.add(rid);
      if (!validCell(regiment.cell))
        finding("DATA_REFERENCE_INVALID", "error", `regiment:${key}`, "Invalid military cell", [
          `${base}/${index}/cell`
        ]);
      if (regiment.state !== undefined && regiment.state !== stateId)
        finding("DATA_REFERENCE_INVALID", "error", `regiment:${key}`, "Regiment owner differs from roster state", [
          `${base}/${index}/state`
        ]);
      const cell = id(regiment.cell);
      if (cell !== null) {
        const bin = militaryByCell.get(cell) ?? [];
        bin.push(key);
        militaryByCell.set(cell, bin);
      }
      const unitEntries = Object.entries(record(regiment.u));
      for (const [unit, rawAmount] of unitEntries) {
        const amount = finite(rawAmount);
        if (amount === null || amount < 0) {
          finding("DATA_VALUE_INVALID", "error", `regiment:${key}`, `Invalid unit quantity ${unit}`, [
            `${base}/${index}/u/${pointer(unit)}`
          ]);
          continue;
        }
        const stateTotals = unitsByState.get(stateId) ?? Object.create(null);
        stateTotals[unit] = (Object.hasOwn(stateTotals, unit) ? stateTotals[unit] : 0) + amount;
        unitsByState.set(stateId, stateTotals);
        if (cell !== null) {
          const cellTotals = unitsByCell.get(cell) ?? Object.create(null);
          cellTotals[unit] = (Object.hasOwn(cellTotals, unit) ? cellTotals[unit] : 0) + amount;
          unitsByCell.set(cell, cellTotals);
        }
      }
      for (const [unit, amount] of unitEntries.length ? unitEntries : [[null, null]]) {
        military.push({
          regimentKey: key,
          stateId,
          regimentId: rid,
          name: regiment.name ?? null,
          unit,
          amount,
          amountUnit: "unverified_native_unit",
          manpowerPersons: null,
          sameCellBurgIds: cell === null ? [] : (burgsByCell.get(cell) ?? []),
          association: "same_cell_not_exclusive_garrison",
          cellId: cell,
          x: finite(regiment.x),
          y: finite(regiment.y),
          baseX: finite(regiment.bx),
          baseY: finite(regiment.by),
          aRaw: finite(regiment.a),
          recruitmentCeilingRaw: finite(regiment.t),
          plannedUnits: regiment.plannedU ?? null,
          navalFlag: regiment.n ?? null,
          type: regiment.type ?? null,
          quality: finite(regiment.quality),
          homeProvince: regiment.homeProvince ?? null,
          garrisonHost: regiment.garrisonHost ?? null,
          children: regiment.children ?? null,
          aggregation: "top_level_regiments_only_no_children_sum",
          evidence: [`${base}/${index}${unit ? `/u/${pointer(unit)}` : ""}`],
          rawRegiment: regiment
        });
      }
    }
  }
  for (const connection of connections) {
    const source = burgs.get(Number(connection.sourceId));
    const target = burgs.get(Number(connection.targetId));
    connection.sourceMilitarySameCellUnitsRaw = source ? (unitsByCell.get(Number(source.cell)) ?? null) : null;
    connection.targetMilitarySameCellUnitsRaw = target ? (unitsByCell.get(Number(target.cell)) ?? null) : null;
    connection.militaryUnitStatus = "native_units_not_verified_persons";
  }
  const economy = record(record(simulation.extensions).economy);
  const cityRows: RecordValue[] = [];
  for (const burgId of [...included].sort((a, b) => a - b)) {
    const b = burgs.get(burgId)!;
    const f = facts.get(burgId)!;
    const sim = record(simulationBurgs[String(burgId)]);
    const ce = ceProjection(burgId);
    const points = finite(f.population.value);
    if (points === null || points < 0)
      finding("DATA_VALUE_MISSING", "warning", `burg:${burgId}`, "Population is missing or invalid", [
        f.population.evidence
      ]);
    if (b.group && ce.scale !== b.group)
      finding(
        "SETTLEMENT_CLASS_DIVERGENCE",
        "info",
        `burg:${burgId}`,
        `Stored group ${b.group} differs from diagnostic CE scale ${ce.scale}`,
        [burgPaths.get(burgId)!]
      );
    const militaryKeys = militaryByCell.get(Number(b.cell)) ?? [];
    const ledger = record(economy.burgMarketLedgers)[String(burgId)] ?? null;
    cityRows.push({
      id: burgId,
      name: b.name ?? "",
      label: `${b.name ?? ""}#${burgId}`,
      isOrigin: sourceSet.has(burgId),
      cellId: id(b.cell),
      stateId: id(b.state),
      stateName: states.get(Number(b.state))?.name ?? null,
      provinceId: column(cells.province, Number(b.cell)) ?? null,
      cultureId: b.culture ?? null,
      groupRaw: b.group ?? null,
      typeRaw: b.type ?? null,
      populationPoints: points,
      populationPersons: population(burgId),
      populationSource: f.population.evidence,
      populationSourceKind: f.population.sourceKind,
      capital: bool(b.capital),
      citadel: bool(b.citadel),
      walls: bool(b.walls),
      port: b.port === undefined ? null : Boolean(b.port),
      fortificationQuality: finite(b.fortificationQuality),
      foundedYear: b.foundedYear ?? null,
      settlementSite: b.settlementSite ?? null,
      x: finite(b.x),
      y: finite(b.y),
      heightIndex: column(cells.h, Number(b.cell)) ?? null,
      riverId: record(b.riverPlacement).riverId ?? record(b.waterAccess).riverId ?? null,
      riverBank: record(b.riverPlacement).bank ?? null,
      waterAccess: b.waterAccess ?? null,
      riverPlacement: b.riverPlacement ?? null,
      riverSiteStatus: b.riverSiteStatus ?? null,
      stateHistory: b.stateHistory ?? null,
      castlePosition: null,
      builtAreaCentroid: null,
      militarySameCellKeys: militaryKeys,
      militarySameCellUnitsRaw: unitsByCell.get(Number(b.cell)) ?? null,
      militaryStateUnitsRaw: unitsByState.get(Number(b.state)) ?? null,
      militaryAssociation: "same_cell_not_exclusive_garrison",
      militaryPersons: null,
      treasury: finite(f.treasury.value),
      product: finite(f.product.value),
      marketId: b.market ?? null,
      demographics: f.demographics.value ?? null,
      demographicsUnit: "stored_native_population_points",
      burgMarketLedger: ledger,
      production: record(economy.productionByBurg)[String(burgId)] ?? null,
      ceProjection: ce,
      rawBurg: b,
      rawSimulationBurg: sim,
      evidence: {
        burg: burgPaths.get(burgId),
        population: f.population.evidence,
        treasury: f.treasury.evidence,
        product: f.product.evidence,
        demographics: f.demographics.evidence,
        economy: ledger === null ? null : `${simulationPath}/extensions/economy/burgMarketLedgers/${burgId}`
      }
    });
  }
  for (const sourceId of sourceIds) {
    for (const [rule, reason] of [
      ["FORT_CONTEXT_UNEXPLAINED", "Historical evidence profile and complete strategic context are not implemented"],
      ["MILITARY_BALANCE_REVIEW", "Unit-to-person conversion and comparable deployment scope are not verified"],
      ["ROAD_ECONOMIC_CONTEXT_WEAK", "Traffic units/period and downstream economic context are not verified"],
      ["RIVER_DEFENSE_ORIENTATION_REVIEW", "FMG has no verified CE castle position or built-area centroid"],
      ["CE_RIBBON_DEVELOPMENT_REVIEW", "No matching CE building audit input"],
      [
        "BRIDGE_SKEW_POLICY",
        "Physical bridge geometry and technology context are not restored; no independent skew test performed"
      ]
    ])
      finding(rule, "info", `burg:${sourceId}`, reason, [burgPaths.get(sourceId)!], "skipped");
  }
  connections.sort(
    (a, b) =>
      Number(a.sourceId) - Number(b.sourceId) ||
      Number(a.routeId) - Number(b.routeId) ||
      String(a.direction).localeCompare(String(b.direction))
  );
  directionRows.sort(
    (a, b) =>
      Number(a.sourceId) - Number(b.sourceId) ||
      Number(a.targetId) - Number(b.targetId) ||
      String(a.mode).localeCompare(String(b.mode))
  );
  nearby.sort((a, b) => Number(a.sourceId) - Number(b.sourceId) || Number(a.targetId) - Number(b.targetId));
  findings.sort(
    (a, b) =>
      a.subject.localeCompare(b.subject) || a.ruleId.localeCompare(b.ruleId) || a.message.localeCompare(b.message)
  );
  return {
    schemaVersion: 1,
    metadata: {
      sourceIds,
      distanceUnit,
      distanceUnitSource: savedUnit ? "stored" : options.distanceUnit ? "cli" : "unknown",
      distanceScale,
      heightExponent,
      heightExponentSource:
        options.heightExponent !== undefined ? "cli" : savedHeight !== null ? "stored" : "shared_default_1.8",
      populationRate,
      urbanization,
      currentYear: simulation.currentYear ?? null,
      currentMonth: simulation.currentMonth ?? null,
      currentDay: simulation.currentDay ?? null,
      historicalPeriod: record(world.options).historicalPeriod ?? null,
      avoidSea: options.avoidSea,
      preferSea: options.preferSea,
      travelMode: options.travelMode,
      economyAvailable: Object.keys(economy).length > 0,
      ceCompatibility: ce.status,
      ceReferenceBurgId: options.ceHandoff?.burgId ?? null,
      ceReferenceSourceRevision: options.ceHandoff?.sourceRevision ?? null,
      ceReferencePreparedRevision: options.ceHandoff?.preparedRevision ?? null,
      supportedScope: "archive_facts_directions_ce_roads_and_integrity",
      historicalRulesEnabled: false
    },
    burgs: cityRows,
    connections,
    directions: directionRows,
    ceRoads: ce.roads,
    ceDifferences: ce.differences,
    nearby,
    military,
    findings
  };
}
