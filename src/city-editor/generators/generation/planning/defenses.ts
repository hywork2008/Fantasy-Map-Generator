import { editorText } from "../../../../i18n/editorMessages";
import type { CityDocument, Id, Mesh, Point } from "../../../types/document";
import type { GenerationSettings } from "../../../types/generation";
import type { Cell, CityGeography, CityParams, CityProgram, Gate } from "../../../types/geometry";
import {
  buildApproachCorridors,
  type CastleSitingConstraints,
  emptySitingReport,
  planGateSectors
} from "../../approachCorridors";
import { type CastleSite, placeCastleRegion } from "../../castlePlacement";
import { planCirculadeLayout } from "../../circuladeLayout";
import type { CoastResult } from "../../classifySea";
import { maxWallGatesForExtent } from "../../document";
import { resolveWallMaterial } from "../../features";
import { nearestOnPolyline, pointInPolygon } from "../../geom";
import { type InnerTownPlanDiagnostics, innerTownCapacity, planInnerTown } from "../../innerTownWall";
import { markSeaSurroundedGates, markWaterGate, placeGates, placePrecincts } from "../../interior";
import { facePoints, faceVertices } from "../../mesh";
import { bramCoreRadiusMeters, planPolygonalCirculadeLayout } from "../../polygonalCirculadeLayout";
import type { RoutedRiver } from "../../riverPath";
import { defaultRoadWidthMeters, innerWalledAreaShare, townExtentMeters } from "../../settlementExtent";
import { synthSite } from "../../site/synthSite";
import { dryRuns, lineHitsDocumentWater, lineHitsWater } from "../../waterGeometry";
import type { Plan } from "../contracts";
import { cellsFromMesh, componentBorderLoops } from "../meshGeometry";
import { nearestVertexLookup, toGeneratorBorder } from "./meshLookup";

const NOMINAL_PRESET = "largeTown" as const;
const INNER_WALL_MIN_GAP_CELLS = 2;

export interface PlanDefensesInput {
  rivers: RoutedRiver[];
  currentMesh: Mesh;
  currentFaceIdOf: string[];
  currentUrban: Set<number>;
  currentCells: Cell[];
  sea: Set<number>;
  geo: CityGeography;
  params: CityParams;
  settings: Pick<
    GenerationSettings,
    | "legacyCastles"
    | "townWallRings"
    | "walledAreaShare"
    | "townWallBuildOrder"
    | "innerWallState"
    | "townWallDefensePolicy"
    | "config"
    | "descriptor"
    | "castleStreetLinks"
    | "castleOutward"
    | "castle"
  >;
  program: CityProgram;
  effectiveLayout: "organic" | "circulade" | "bram" | "classic";
  urbanRadius: number;
  seed: string;
  half: number;
  cellSize: number;
  sourceDocument: CityDocument | undefined;
  water: Pick<Plan, "channelPolygons" | "fixedCrossings">;
  currentOutskirts: Set<number>;
  currentBuiltUp: Set<number>;
  residentialOutskirts: Set<number>;
  ocean: Set<number>;
  coastalWater: Set<number>;
  meshModified: boolean;
  coast: CoastResult | null;
  streetOpts: import("../../../types/generation").StreetSettings;
  waterPolygon: Point[] | null;
}

/** Requires the admitted urban core. May replace the mesh when siting a castle and remaps the supplied sea, ocean and coastal-water sets in place. Returned gate predicates retain this invocation only. */
export function planDefenses(input: PlanDefensesInput) {
  let {
    rivers,
    currentMesh,
    currentFaceIdOf,
    currentUrban,
    currentCells,
    sea,
    geo,
    params,
    settings,
    program,
    effectiveLayout,
    urbanRadius,
    seed,
    half,
    cellSize,
    sourceDocument,
    water,
    currentOutskirts,
    currentBuiltUp,
    residentialOutskirts,
    ocean,
    coastalWater,
    meshModified,
    coast,
    streetOpts,
    waterPolygon
  } = input;
  // S4 — outline the urban blob along real mesh edges, gates, plaza & citadel.
  const riverLines = rivers.map(band => band.smoothPoints);
  let borderLoops = componentBorderLoops(currentMesh, currentFaceIdOf, currentUrban);
  let genBorders = borderLoops.map(loop => toGeneratorBorder(loop));
  let precincts = placePrecincts(
    currentCells,
    currentUrban,
    sea,
    genBorders,
    geo,
    params,
    settings.legacyCastles ? program : { ...program, citadel: false },
    riverLines
  );
  const citadel = precincts.find(p => p.kind === "citadel");
  const citadelOutline = citadel
    ? (componentBorderLoops(currentMesh, currentFaceIdOf, new Set(citadel.cellIds))[0]?.points ?? null)
    : null;

  let circuladePlan: import("../../circuladeLayout").CirculadeLayoutPlan | null = null;
  let polygonalCirculadePlan: import("../../polygonalCirculadeLayout").PolygonalCirculadePlan | null = null;
  if (effectiveLayout === "circulade") {
    const urbanCells = currentCells.filter(c => currentUrban.has(c.id));
    const hub: Point = urbanCells.length
      ? (urbanCells
          .reduce<Point>((sum, c) => [sum[0] + c.centroid[0], sum[1] + c.centroid[1]], [0, 0])
          .map(v => v / urbanCells.length) as Point)
      : [0, 0];
    circuladePlan = planCirculadeLayout(hub, urbanRadius, seed, program.temple);

    // Replace default plaza and temple with circulade core plaza & attached temple
    precincts = precincts.filter(p => p.kind !== "plaza" && p.kind !== "temple");
    if (program.plaza) precincts.push(circuladePlan.plaza);
    if (program.temple && circuladePlan.temple) precincts.push(circuladePlan.temple);
  } else if (effectiveLayout === "bram") {
    const urbanCells = currentCells.filter(c => currentUrban.has(c.id));
    const hub: Point = urbanCells.length
      ? (urbanCells
          .reduce<Point>((sum, c) => [sum[0] + c.centroid[0], sum[1] + c.centroid[1]], [0, 0])
          .map(v => v / urbanCells.length) as Point)
      : [0, 0];
    polygonalCirculadePlan = planPolygonalCirculadeLayout(
      hub,
      seed,
      bramCoreRadiusMeters(urbanRadius),
      program.temple,
      16
    );

    precincts = precincts.filter(p => p.kind !== "plaza" && p.kind !== "temple");
    if (program.plaza) precincts.push(polygonalCirculadePlan.plaza);
    if (program.temple && polygonalCirculadePlan.temple) precincts.push(polygonalCirculadePlan.temple);
  }

  let castleSite: CastleSite | null = null;
  let innerPlanFaces: Set<Id> | null = null;
  let castleFailure: string | undefined;
  let castleFailureDetails: string[] | undefined;
  // castle-road-siting-order.md §3.1 ③④: roads and their gate arcs come
  // first; the castle is placed beside them.
  const corridors = buildApproachCorridors(geo, genBorders, half, cellSize);
  const preservedOwners = new Set(
    (sourceDocument?.castles ?? []).filter(c => c.locked || c.provenance !== "generated").map(c => c.id)
  );
  const preservedCastleIds = new Set(
    (sourceDocument?.defenseCircuits ?? [])
      .filter(c => c.ownerCastleId && preservedOwners.has(c.ownerCastleId))
      .flatMap(c => c.areaFaceIds)
  );
  // Double walls: plan the old town now so the castle can stand in it (§4.4),
  // and keep a town with no room for two curtains single (§5.3).
  let innerWall: Plan["innerWall"];
  if (
    settings.townWallRings === "double" &&
    program.walls &&
    effectiveLayout !== "circulade" &&
    effectiveLayout !== "bram"
  ) {
    const diagnostics: InnerTownPlanDiagnostics = {};
    const planned = planInnerTown(
      currentMesh,
      [...currentUrban].map(id => currentFaceIdOf[id]),
      innerWalledAreaShare(settings.walledAreaShare, params.extentMeters),
      settings.townWallBuildOrder === "inner-first" ? 0 : INNER_WALL_MIN_GAP_CELLS,
      // The final old town is centred on the plaza (`townCenter`); plan on the same centre.
      precincts.find(p => p.kind === "plaza")?.anchor ?? [0, 0],
      undefined,
      diagnostics
    );
    innerWall = planned
      ? {
          planned: true,
          share: innerWalledAreaShare(settings.walledAreaShare, params.extentMeters),
          razed: settings.innerWallState === "razed",
          buildOrder: settings.townWallBuildOrder,
          defensePolicy: settings.townWallDefensePolicy
        }
      : { planned: false, failure: diagnostics.failure ?? "gap", diagnostics };
    innerPlanFaces = planned?.faces ?? null;
  }
  if (program.citadel && !settings.legacyCastles && !preservedCastleIds.size) {
    const originalCells = currentCells;

    const urbanFaces = new Set([...currentUrban].map(id => currentFaceIdOf[id]));
    const reserve = new Set(precincts.flatMap(p => p.cellIds.map(id => currentFaceIdOf[id])));
    for (const face of Object.values(currentMesh.faces)) if (face.properties.locked) reserve.add(face.id);
    // A town without a plaza still routes its streets to the centre. A castle
    // on that hub leaves its gate no inward arm and the town gates no way in
    // (Sinzlingen, Sanjeiradil, Ordes), on every attempt.
    if (!precincts.some(p => p.kind === "plaza"))
      for (const id of townHubFaces(currentMesh, urbanFaces)) reserve.add(id);
    const planningWallMaterial = resolveWallMaterial(
      sourceDocument ?? {
        format: "fmg-city-editor",
        version: 1,
        frame: {
          extentMeters: half * 2,
          cityRadiusMeters: params.cityRadiusMeters,
          blockSizeMeters: cellSize
        },
        mesh: currentMesh,
        featureGroups: [],
        gates: [],
        elements: []
      },
      { choice: settings.config.wall.material, descriptor: settings.descriptor }
    );
    const isPlanningWallWood = planningWallMaterial === "wood";
    const temp: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      frame: {
        extentMeters: sourceDocument?.frame.extentMeters ?? half * 2,
        cityRadiusMeters: params.cityRadiusMeters,
        blockSizeMeters: cellSize,
        ...(sourceDocument?.frame.settlementExtentMeters
          ? { settlementExtentMeters: sourceDocument.frame.settlementExtentMeters }
          : {})
      },
      mesh: currentMesh,
      featureGroups: program.walls
        ? [
            {
              id: "planning-town-wall",
              kind: "wall",
              name: "Town wall",
              segments: [],
              style: {
                widthMeters: isPlanningWallWood ? 2.4 : 3,
                color: isPlanningWallWood ? "#634327" : "#41382e"
              },
              wallMaterial: planningWallMaterial,
              locked: false
            }
          ]
        : [],
      waterAreas: (water.channelPolygons ?? []).map(polygon => ({ kind: "river", polygon })),
      importedFixedCrossings: settings.descriptor?.fixedCrossings,
      gates: [],
      elements: []
    };
    const terrain = (
      settings.descriptor ??
      synthSite(NOMINAL_PRESET, settings.config, seed, {
        extentMeters: half * 2,
        cityRadiusMeters: params.cityRadiusMeters
      })
    ).terrain;
    const siting: CastleSitingConstraints = {
      corridors,
      sectors: planGateSectors(corridors, genBorders, cellSize, true),
      clearanceMeters: (defaultRoadWidthMeters(params.extentMeters) + 3) / 2 + 0.5,
      report: emptySitingReport(),
      streetLinks: settings.castleStreetLinks,
      outward: settings.castleOutward
    };
    const placeIn = (faces: Set<Id>) =>
      placeCastleRegion(
        temp,
        faces,
        new Set([...sea].map(id => currentFaceIdOf[id])),
        reserve,
        rivers.map(r => ({ points: r.edgePoints, width: Math.max(...r.widths, 6) })),
        seed,
        settings.castle,
        terrain,
        siting
      );
    castleSite = null;
    // §4.4/§5.2: the castle stands in the old town (a third ring when walled)
    // while the old town keeps room for its plaza and streets; otherwise it
    // moves to the outer wall like a single-walled town's.
    if (innerPlanFaces && innerWall?.planned) {
      const inOldTown = placeIn(innerPlanFaces);
      if (inOldTown) {
        const castleFaces = new Set([inOldTown.faceId]);
        const survivors = [...innerPlanFaces].filter(id => inOldTown.mesh.faces[id]);
        if (innerTownCapacity(inOldTown.mesh, survivors, castleFaces).ok) castleSite = inOldTown;
      }
      innerWall.castleRing = castleSite ? "inner" : "outer";
    }
    castleSite ??= placeIn(urbanFaces);
    if (castleSite) {
      currentMesh = castleSite.mesh;
      const updated = cellsFromMesh(currentMesh, half);
      const parentOf = (cell: Cell) => originalCells.find(old => pointInPolygon(cell.centroid, old.polygon));
      const remap = (set: Set<number>) =>
        new Set(
          updated.cells
            .filter(cell => {
              const old = parentOf(cell);
              return old && set.has(old.id);
            })
            .map(cell => cell.id)
        );
      currentUrban = remap(currentUrban);
      currentOutskirts = remap(currentOutskirts);
      currentBuiltUp = remap(currentBuiltUp);
      residentialOutskirts = remap(residentialOutskirts);
      const newSea = remap(sea);
      const newOcean = remap(ocean);
      const newCoastalWater = remap(coastalWater);
      sea.clear();
      for (const id of newSea) sea.add(id);
      ocean.clear();
      for (const id of newOcean) ocean.add(id);
      coastalWater.clear();
      for (const id of newCoastalWater) coastalWater.add(id);
      for (const precinct of precincts) {
        const previous = new Set(precinct.cellIds);
        precinct.cellIds = updated.cells
          .filter(cell => {
            const old = parentOf(cell);
            return old && previous.has(old.id);
          })
          .map(cell => cell.id);
      }
      currentCells = updated.cells;
      currentFaceIdOf = updated.faceIdOf;
      const castleCell = currentFaceIdOf.indexOf(castleSite.faceId);
      if (castleSite.relationship === "integrated") currentUrban.add(castleCell);
      const anchor = currentCells[castleCell].centroid;
      precincts.push({
        kind: "citadel",
        cellIds: [castleCell],
        anchor,
        label: editorText("cityEditor.messages.castle")
      });
      borderLoops = componentBorderLoops(currentMesh, currentFaceIdOf, currentUrban);
      genBorders = borderLoops.map(toGeneratorBorder);
      meshModified = true;
    } else {
      castleFailure = "castle-no-site";
      const { rejected, corridors: blocked } = siting.report!;
      castleFailureDetails = [
        `rejected C1=${rejected.C1} C2=${rejected.C2} C3=${rejected.C3} C4=${rejected.C4}`,
        ...(blocked.size ? [`corridors=${[...blocked].sort((a, b) => a - b).join(",")}`] : [])
      ];
    }
  }
  // Reserved/manual castles remain part of the planning obstacles.
  if (preservedCastleIds.size) {
    const cellIds = currentFaceIdOf.flatMap((id, i) => (preservedCastleIds.has(id) ? [i] : []));
    if (cellIds.length)
      precincts.push({
        kind: "citadel",
        cellIds,
        anchor: currentCells[cellIds[0]].centroid,
        label: editorText("cityEditor.messages.castle")
      });
  }

  const castleGateRegions = [...preservedCastleIds, ...(castleSite ? [castleSite.faceId] : [])].flatMap(id =>
    currentMesh.faces[id] ? [facePoints(currentMesh, currentMesh.faces[id])] : []
  );
  const channelPolygons = water.channelPolygons ?? [];
  const gateNearest = nearestVertexLookup(currentMesh, Math.max(1, cellSize));
  const urbanFaces = new Set([...currentUrban].map(id => currentFaceIdOf[id]));
  const gateWaterDocument =
    sourceDocument && water.fixedCrossings
      ? {
          ...sourceDocument,
          mesh: currentMesh,
          importedFixedCrossings: water.fixedCrossings,
          waterAreas: channelPolygons.map(polygon => ({ kind: "river" as const, polygon }))
        }
      : undefined;
  // Without a square every gate street meets in the middle, but a central
  // castle can stand there. Meet at the nearest street corner clear of it
  // instead, so the streets end before the castle (castle-road-siting-order.md H5).
  const castleClearance = (defaultRoadWidthMeters(params.extentMeters) + 3) / 2 + 0.5;
  const nearCastle = (p: Point) =>
    castleGateRegions.some(r => pointInPolygon(p, r) || nearestOnPolyline(p, [...r, r[0]]).dist < castleClearance);
  const streetHub = (): Point => {
    if (!nearCastle([0, 0])) return [0, 0];
    const castleFaces = new Set([...preservedCastleIds, ...(castleSite ? [castleSite.faceId] : [])]);
    const open = new Set([...currentUrban].map(id => currentFaceIdOf[id]).filter(id => !castleFaces.has(id)));
    // Streets pass a wall vertex only at its own gate.
    const rim = new Set<Id>();
    for (const edge of Object.values(currentMesh.edges))
      if (urbanFaces.has(edge.leftFace ?? "") !== urbanFaces.has(edge.rightFace ?? "")) {
        rim.add(edge.a);
        rim.add(edge.b);
      }
    let best: Point = [0, 0],
      bestDistance = Infinity;
    for (const edge of Object.values(currentMesh.edges)) {
      if (!edge.leftFace || !edge.rightFace || !open.has(edge.leftFace) || !open.has(edge.rightFace)) continue;
      const a = currentMesh.vertices[edge.a].point,
        b = currentMesh.vertices[edge.b].point;
      if ([0, 0.25, 0.5, 0.75, 1].some(t => nearCastle([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]))) continue;
      for (const id of [edge.a, edge.b]) {
        const p = currentMesh.vertices[id].point;
        if (!rim.has(id) && Math.hypot(p[0], p[1]) < bestDistance) {
          best = p;
          bestDistance = Math.hypot(p[0], p[1]);
        }
      }
    }
    return best;
  };
  // A narrow surveyed headwater can cut an exterior cell without turning
  // its centroid into a water face. Do not move an entrance behind it when
  // the castle removes nearby wall candidates (Archiagu).
  const exteriorGateReach = new Set<Id>();
  if (gateWaterDocument) {
    const adjacent = new Map<Id, Id[]>();
    const rim = new Set<Id>();
    const queue: Id[] = [];
    for (const edge of Object.values(currentMesh.edges)) {
      const leftUrban = urbanFaces.has(edge.leftFace ?? "");
      const rightUrban = urbanFaces.has(edge.rightFace ?? "");
      if (leftUrban !== rightUrban) {
        rim.add(edge.a);
        rim.add(edge.b);
      }
      if (leftUrban || rightUrban) continue;
      const line = [currentMesh.vertices[edge.a].point, currentMesh.vertices[edge.b].point];
      if (lineHitsDocumentWater(gateWaterDocument, line, defaultRoadWidthMeters(params.extentMeters), true)) continue;
      if (castleGateRegions.some(region => lineHitsWater(line, [region]))) continue;
      adjacent.set(edge.a, [...(adjacent.get(edge.a) ?? []), edge.b]);
      adjacent.set(edge.b, [...(adjacent.get(edge.b) ?? []), edge.a]);
      if (!edge.leftFace || !edge.rightFace)
        for (const id of [edge.a, edge.b]) {
          if (!exteriorGateReach.has(id)) {
            exteriorGateReach.add(id);
            queue.push(id);
          }
        }
    }
    for (const id of queue) {
      if (rim.has(id)) continue;
      for (const next of adjacent.get(id) ?? [])
        if (!exteriorGateReach.has(next)) {
          exteriorGateReach.add(next);
          queue.push(next);
        }
    }
  }
  const canPlaceTownGate = (p: Point) => {
    if (castleGateRegions.some(r => pointInPolygon(p, r) || nearestOnPolyline(p, [...r, r[0]]).dist < 10)) return false;
    if (!channelPolygons.length && !gateWaterDocument) return true;
    const vertex = gateNearest(p);
    if (!vertex || channelPolygons.some(polygon => pointInPolygon(p, polygon))) return false;
    if (gateWaterDocument && !exteriorGateReach.has(vertex)) {
      // Ordinary degree-three wall corners gain their exterior arm by a
      // later cell split. Accept a dry chord to that cell's reachable side.
      const exteriorFaces = Object.values(currentMesh.faces).filter(
        face => !urbanFaces.has(face.id) && faceVertices(currentMesh, face).includes(vertex)
      );
      const canSplit = exteriorFaces.some(face =>
        faceVertices(currentMesh, face).some(id => {
          if (!exteriorGateReach.has(id)) return false;
          const line = [p, currentMesh.vertices[id].point];
          // The future split must stay inside this exterior cell; a chord
          // across a concave corner is not a usable gate approach.
          if (dryRuns(line, [facePoints(currentMesh, face)]).length) return false;
          return (
            !lineHitsDocumentWater(gateWaterDocument, line, defaultRoadWidthMeters(params.extentMeters), true) &&
            !castleGateRegions.some(region => lineHitsWater(line, [region]))
          );
        })
      );
      if (!canSplit) return false;
    }
    // A wall corner needs a dry inward edge. Otherwise a narrow surveyed
    // channel can isolate its gate even though both incident faces are land.
    return Object.values(currentMesh.edges).some(edge => {
      if (edge.a !== vertex && edge.b !== vertex) return false;
      if (!edge.leftFace || !edge.rightFace || !urbanFaces.has(edge.leftFace) || !urbanFaces.has(edge.rightFace))
        return false;
      const line = [currentMesh.vertices[edge.a].point, currentMesh.vertices[edge.b].point];
      return (
        !lineHitsWater(line, channelPolygons) &&
        (!gateWaterDocument ||
          !lineHitsDocumentWater(
            gateWaterDocument,
            line,
            defaultRoadWidthMeters(townExtentMeters(gateWaterDocument.frame)),
            true
          )) &&
        !castleGateRegions.some(region => lineHitsWater(line, [region]))
      );
    });
  };

  const placed = markWaterGate(
    placeGates(
      currentCells,
      currentUrban,
      genBorders,
      {
        ...geo,
        rivers: rivers.map(river => ({
          corridor: river.edgePoints,
          widths: river.widths,
          cityBank: "left" as const,
          bridgeAllowed: river.bridgeAllowed
        }))
      },
      maxWallGatesForExtent(params.extentMeters),
      canPlaceTownGate,
      // §3.3 ⑥: redraw the arcs on the outline the castle may have changed.
      planGateSectors(corridors, genBorders, cellSize, !!castleSite)
    ),
    genBorders,
    coast?.shoreline ?? null,
    program.port && geo.importedRoads === undefined
  );
  let gates = streetOpts.avoidSea ? markSeaSurroundedGates(placed, waterPolygon, cellSize) : placed;

  // For pure circulade or Bram, snap gates to recommended opposed positions along the border
  const recommendedGates =
    effectiveLayout === "circulade" && circuladePlan
      ? circuladePlan.recommendedGates
      : effectiveLayout === "bram" && polygonalCirculadePlan
        ? polygonalCirculadePlan.recommendedGates
        : null;

  if (recommendedGates && genBorders.length && geo.importedRoads === undefined) {
    const customGates: Gate[] = [];
    for (const rec of recommendedGates) {
      let bestDist = Infinity;
      let bestPt: Point | null = null;
      let bestBIdx = 0;
      genBorders.forEach((border, bIdx) => {
        for (const pt of border.points) {
          if (!canPlaceTownGate(pt)) continue;
          const d = Math.hypot(pt[0] - rec[0], pt[1] - rec[1]);
          if (d < bestDist) {
            bestDist = d;
            bestPt = pt;
            bestBIdx = bIdx;
          }
        }
      });
      if (bestPt && !customGates.some(g => Math.hypot(g.point[0] - bestPt![0], g.point[1] - bestPt![1]) < 12)) {
        customGates.push({ point: bestPt, borderIndex: bestBIdx, water: false });
      }
    }
    if (customGates.length >= 2) {
      gates = customGates;
    }
  }

  return {
    borderLoops,
    genBorders,
    precincts,
    citadelOutline,
    castleSite,
    castleFailure,
    castleFailureDetails,
    innerWall,
    streetHub,
    canPlaceTownGate,
    gates,
    currentMesh,
    currentFaceIdOf,
    currentUrban,
    currentCells,
    currentOutskirts,
    currentBuiltUp,
    residentialOutskirts,
    meshModified
  };
}

/** Output references belong to one pipeline invocation; no cache retains them. */
export type PlanDefensesResult = ReturnType<typeof planDefenses>;

/** Urban faces around the vertex nearest the town centre, where plaza-less streets meet. */
function townHubFaces(mesh: Mesh, urbanFaces: Set<Id>): Id[] {
  let hub: Id | null = null;
  let best = Infinity;
  for (const id of urbanFaces) {
    const face = mesh.faces[id];
    if (!face) continue;
    for (const v of faceVertices(mesh, face)) {
      const [x, y] = mesh.vertices[v].point;
      const d = Math.hypot(x, y);
      if (d < best) {
        best = d;
        hub = v;
      }
    }
  }
  if (!hub) return [];
  return [...urbanFaces].filter(id => mesh.faces[id] && faceVertices(mesh, mesh.faces[id]).includes(hub!));
}
