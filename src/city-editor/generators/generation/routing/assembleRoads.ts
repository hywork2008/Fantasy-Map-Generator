import { editorText } from "../../../../i18n/editorMessages";
import { townMeshExtentMeters } from "../../../core/document";
import { featureGroupVertices } from "../../../core/features";
import { townGates } from "../../../core/fortifications";
import { orientedRectPolylineDistance, templeRectForElement } from "../../../core/gen/civicPlacement";
import { pointInPolygon, polylineCrossesSegment } from "../../../core/gen/geom";
import { bramCoreRadiusForCity, bramRoadBanRadiusMeters } from "../../../core/gen/polygonalCirculadeLayout";
import { defaultRoadWidthMeters, townExtentMeters } from "../../../core/gen/settlementExtent";
import type { Cell, CityProgram } from "../../../core/gen/types";
import type { GenerationObserver, RoadRoutingTrace } from "../../../core/generationDiagnostics";
import {
  kindEdgeIds,
  openBarrierPassage,
  openGeneratedPassages,
  straightenBridges,
  vertexHasKindPassage
} from "../../../core/passages";
import type { CityDocument, Id, Point } from "../../../core/types";
import { lineHitsDocumentWater, lineHitsWater, waterPolygons } from "../../../core/waterGeometry";
import type { AssemblyCheckpoint, AssemblyMark } from "../assembly/contracts";
import { applyCrossings } from "../assembly/crossings";
import { appendGeneratedGroup } from "../assembly/generatedFeatures";
import { longestUnbannedRun } from "../assembly/wallGeometry";
import { GEN_PREFIX } from "../constants";
import type { Plan } from "../contracts";
import { nearestVertexLookup } from "../planning/meshLookup";
import { plazaApproachPoint } from "../planning/roadGeometry";
import { completeRoadRouter } from "./completeRoadRouter";
import { dryTownApproach, isInteriorRiverLanding } from "./dryApproaches";
import { connectDryCellInteriors, joinShoreStrandedGates, shortcutExteriorRoads } from "./gateApproaches";
import { oldTownNonGateEntries } from "./oldTownEntries";

export interface ApplyRoadsInput {
  stageStep: number;
  next: CityDocument;
  plan: Plan;
  complete: boolean;
  innerFirst: boolean;
  wallCheckpoint: AssemblyCheckpoint | undefined;
  mark: AssemblyMark;
  mesh: import("../../../core/types").Mesh;
  source: CityDocument;
  routingPlan: Plan;
  faceIdOf: string[];
  program: CityProgram;
  urbanRegions: Point[][];
  observer: GenerationObserver | undefined;
  attempt: number;
  gateRouting: Map<string, RoadRoutingTrace[]>;
  cells: Cell[];
}

/** Routes against the current opened mesh, repairs dry-cell and shore connectivity, and materializes roads in their original ID order. Router indexes remain local to this invocation. */
export function applyRoads(input: ApplyRoadsInput) {
  let {
    stageStep,
    next,
    plan,
    complete,
    innerFirst,
    wallCheckpoint,
    mark,
    mesh,
    source,
    routingPlan,
    faceIdOf,
    program,
    urbanRegions,
    observer,
    attempt,
    gateRouting,
    cells
  } = input;
  // ⑤ roads. First open 4-way wall passages at gates (merge nearest wall
  // neighbour or split a cell) so a road can pass through on opposite edges.
  // Then snap roads, never onto a river or wall edge. Finally open river
  // bridges at remaining road–river meetings and thread the road through.
  if (stageStep >= 5) {
    const crossings = applyCrossings({ next, plan, complete, innerFirst, wallCheckpoint, mark, mesh });
    if (crossings.stopped) return crossings;
    ({ next, mesh } = crossings);
    for (const gate of townGates(next)) {
      if (gate.locked) continue;
      const opened = openBarrierPassage(next, gate.vertexId, "wall");
      if (opened) next = opened;
    }
    // A road leaving a surveyed bridge head starts on the bank, so its own
    // width always reaches the water there. Judge edges from a head without
    // that first half-width (Gondre's only landing vertex sat on the bank).
    const roadWidth = defaultRoadWidthMeters(townExtentMeters(next.frame));
    const heads = next.importedFixedCrossings
      ? plan.roads.flatMap((line, i) =>
          i < plan.roads.length - plan.streets.length &&
          (!plan.gates[i] || plan.importedRoads?.[plan.gates[i].roadIndex ?? -1]?.riverLanding)
            ? [line[0]]
            : []
        )
      : [];
    const nearHead = (p: Point) => heads.some(h => Math.hypot(p[0] - h[0], p[1] - h[1]) < source.frame.blockSizeMeters);
    const leavesHead = (a: Point, b: Point) => {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const trim = roadWidth / 2 + 0.5;
      if (length <= trim * 2) return false;
      const start: Point = [a[0] + ((b[0] - a[0]) * trim) / length, a[1] + ((b[1] - a[1]) * trim) / length];
      return !lineHitsDocumentWater(next, [start, b], roadWidth, true);
    };
    const edgeHitsWater = (a: Point, b: Point) => {
      if (!next.importedFixedCrossings) return lineHitsWater([a, b], waterPolygons(next));
      if (!lineHitsDocumentWater(next, [a, b], roadWidth, true)) return false;
      return !((nearHead(a) && leavesHead(a, b)) || (nearHead(b) && leavesHead(b, a)));
    };
    {
      const preliminaryBans = new Set([...kindEdgeIds(next, "river"), ...kindEdgeIds(next, "wall")]);
      const probe = completeRoadRouter(
        next,
        routingPlan,
        faceIdOf,
        nearestVertexLookup(next.mesh, Math.max(1, source.frame.blockSizeMeters)),
        preliminaryBans,
        !program.walls,
        urbanRegions
      );
      const approaches = plan.roads.length - plan.streets.length;
      if (plan.roads.some((line, i) => i < plan.gates.length * 2 && !probe(line, i < approaches).length)) {
        next = connectDryCellInteriors(next);
      }
    }
    {
      // The router also bans edges whose road width reaches the water. A gate
      // whose only outer arm runs along the bank needs a chord into its cell
      // (Odutum). Probe with those bans before adding one.
      const shoreEdges = new Set(
        Object.values(next.mesh.edges)
          .filter(edge => edgeHitsWater(next.mesh.vertices[edge.a].point, next.mesh.vertices[edge.b].point))
          .map(edge => edge.id)
      );
      const bans = new Set([...kindEdgeIds(next, "river"), ...kindEdgeIds(next, "wall"), ...shoreEdges]);
      const probe = completeRoadRouter(
        next,
        routingPlan,
        faceIdOf,
        nearestVertexLookup(next.mesh, Math.max(1, source.frame.blockSizeMeters)),
        bans,
        !program.walls,
        urbanRegions
      );
      const approaches = plan.roads.length - plan.streets.length;
      if (plan.roads.some((line, i) => i < approaches && plan.gates[i] && !probe(line, true).length))
        next = joinShoreStrandedGates(next, shoreEdges);
    }
    mesh = next.mesh;
    const nearestAfter = nearestVertexLookup(mesh, Math.max(1, source.frame.blockSizeMeters));
    const plazaFaces = new Set(next.elements.find(e => e.kind === "plaza")?.faceIds ?? []);
    const internalPlazaEdges = Object.values(mesh.edges)
      .filter(e => e.leftFace && e.rightFace && plazaFaces.has(e.leftFace) && plazaFaces.has(e.rightFace))
      .map(e => e.id);
    const templeElem = next.elements.find(e => e.kind === "temple");
    const templeFaces = new Set(templeElem?.faceIds ?? []);
    const internalTempleEdges = Object.values(mesh.edges)
      .filter(e => e.leftFace && e.rightFace && templeFaces.has(e.leftFace) && templeFaces.has(e.rightFace))
      .map(e => e.id);
    const templeNave = templeElem?.point
      ? templeRectForElement(templeElem.point, templeElem.sizeMeters, templeElem.rotation, townExtentMeters(next.frame))
      : null;
    const templeBlockedEdges = new Set<Id>(internalTempleEdges);
    if (templeNave) {
      for (const edge of Object.values(mesh.edges)) {
        const pa = mesh.vertices[edge.a]?.point;
        const pb = mesh.vertices[edge.b]?.point;
        if (!pa || !pb) continue;
        if (orientedRectPolylineDistance(templeNave, [pa, pb]) <= 0) {
          templeBlockedEdges.add(edge.id);
        }
      }
    }
    const channelEdges = Object.values(mesh.edges)
      .filter(edge => edgeHitsWater(mesh.vertices[edge.a].point, mesh.vertices[edge.b].point))
      .map(edge => edge.id);
    const oldTownEntries = oldTownNonGateEntries(next);
    const banned = new Set<Id>([
      ...channelEdges,
      ...kindEdgeIds(next, "river"),
      ...kindEdgeIds(next, "wall"),
      ...internalPlazaEdges,
      ...templeBlockedEdges,
      ...oldTownEntries
    ]);
    const banReasons = new Map<Id, string[]>();
    const recordBans = (ids: Iterable<Id>, reason: string) => {
      for (const id of ids) banReasons.set(id, [...(banReasons.get(id) ?? []), reason]);
    };
    recordBans(channelEdges, editorText("cityEditor.messages.waterAreaEdgeInsideAContinuousWaterway"));
    recordBans(kindEdgeIds(next, "river"), editorText("cityEditor.messages.riverEdgeRiverEdge"));
    recordBans(kindEdgeIds(next, "wall"), editorText("cityEditor.messages.wallEdgeWallEdge"));
    recordBans(oldTownEntries, editorText("cityEditor.messages.wallEdgeWallEdge"));
    recordBans(internalPlazaEdges, editorText("cityEditor.messages.plazaInteriorInternalPlazaEdge"));
    recordBans(templeBlockedEdges, editorText("cityEditor.messages.templeTempleInteriorOrNave"));
    const layout = plan.layout ?? source.layout;
    if (layout === "bram") {
      const plazaElem = next.elements.find(e => e.kind === "plaza");
      const hub: Point = plazaElem?.point ?? [0, 0];
      const banRadius = bramRoadBanRadiusMeters(bramCoreRadiusForCity(source.frame.cityRadiusMeters, program.walls));
      for (const e of Object.values(mesh.edges)) {
        const pa = mesh.vertices[e.a]?.point;
        const pb = mesh.vertices[e.b]?.point;
        if (
          pa &&
          pb &&
          (Math.hypot(pa[0] - hub[0], pa[1] - hub[1]) < banRadius ||
            Math.hypot(pb[0] - hub[0], pb[1] - hub[1]) < banRadius)
        ) {
          banned.add(e.id);
          recordBans([e.id], editorText("cityEditor.messages.bramCoreInsideTheBramCoreRoadExclusionRadius"));
        }
      }
    }
    const routeComplete = completeRoadRouter(
      next,
      routingPlan,
      faceIdOf,
      nearestAfter,
      banned,
      !program.walls,
      urbanRegions,
      banReasons
    );
    // Landing endpoints must snap to a usable dry vertex rather than a
    // closer submerged vertex of the coarse editing mesh. A gateless FMG road
    // starts at its surveyed bridge head too: Gondre's head vertex lay on the
    // bank, where every edge's road width reached the water.
    const gatelessRoads = plan.roads.some((_, i) => i < plan.roads.length - plan.streets.length && !plan.gates[i]);
    let routeLanding = routeComplete;
    if (plan.importedRoads?.some(road => road.riverLanding) || (gatelessRoads && next.importedFixedCrossings)) {
      const landingVertices = new Set<Id>();
      for (const edge of Object.values(mesh.edges)) {
        if (
          banned.has(edge.id) ||
          (next.importedFixedCrossings
            ? lineHitsDocumentWater(
                next,
                [mesh.vertices[edge.a].point, mesh.vertices[edge.b].point],
                defaultRoadWidthMeters(townExtentMeters(next.frame)),
                true
              )
            : lineHitsWater([mesh.vertices[edge.a].point, mesh.vertices[edge.b].point], waterPolygons(next)))
        )
          continue;
        for (const id of [edge.a, edge.b])
          if (!waterPolygons(next).some(p => pointInPolygon(mesh.vertices[id].point, p))) landingVertices.add(id);
      }
      routeLanding = completeRoadRouter(
        next,
        routingPlan,
        faceIdOf,
        (point, allowed) =>
          nearestAfter(point, allowed ? new Set([...allowed].filter(id => landingVertices.has(id))) : landingVertices),
        banned,
        !program.walls,
        urbanRegions,
        banReasons
      );
    }
    // A complete city supplies one approach road and one interior street for
    // every planned gate. Gate placement is allowed to fail (for example when
    // the matching wall run was removed at the coast), so never materialize
    // either route for a gate that did not actually make it onto the mesh.
    const approachRoadCount = plan.roads.length - plan.streets.length;
    plan.roads.forEach((polyline, i) => {
      const isApproach = i < approachRoadCount;
      // Approaches and the matching gate-to-plaza streets share a gate index.
      // Later streets are extras and are not paired with a planned gate.
      const gateIndex = isApproach ? i : i - approachRoadCount;
      const plannedGate = plan.gates[gateIndex];
      const riverLanding = isInteriorRiverLanding(plan, program, urbanRegions, plannedGate?.roadIndex);
      const hasRiverLanding =
        plannedGate?.roadIndex !== undefined && plan.importedRoads?.[plannedGate.roadIndex]?.riverLanding;
      const gateExists = townGates(next).some(gate => gate.id === `${GEN_PREFIX}gate-${gateIndex}`);
      // An imported road with no dry corner has no planned gate. Its town-side
      // street still has to be traced; only a gate that was planned and lost is skipped.
      if (
        complete &&
        program.walls &&
        plannedGate &&
        gateIndex >= 0 &&
        gateIndex < approachRoadCount &&
        !gateExists &&
        !riverLanding
      )
        return;
      if (riverLanding && !isApproach) return;
      const routeLine = riverLanding ? [...plan.importedRoads![plannedGate.roadIndex!].path].reverse() : polyline;
      // A gateless bank street stays inside the town. A real gate approach stays outside.
      const routeOutside = isApproach && !riverLanding && !!plannedGate;
      const traceRoute = (line: Point[]) =>
        (hasRiverLanding || (isApproach && !plannedGate) ? routeLanding : routeComplete)(
          line,
          routeOutside,
          !!riverLanding,
          trace => {
            trace.routeId = `${GEN_PREFIX}road-${i}`;
            if (trace.status === "failed")
              observer?.({ phase: "road-routing", elapsedMs: 0, attempt, routing: [trace] });
            const id = `${GEN_PREFIX}gate-${gateIndex}`;
            gateRouting.set(id, [...(gateRouting.get(id) ?? []), trace]);
          }
        );
      let segments = traceRoute(routeLine);
      // Odutum: a ferry landing on the market's bank snaps to the same vertex
      // as its town end. Lead it on to the nearest town end of another road.
      if (segments.length < 1 && isApproach && (riverLanding || !plannedGate)) {
        const start = routeLine[0];
        const ends = plan.roads
          .flatMap((line, j) => (j === i || !line.length ? [] : [line.at(-1)!]))
          .sort((p, q) => Math.hypot(p[0] - start[0], p[1] - start[1]) - Math.hypot(q[0] - start[0], q[1] - start[1]));
        for (const end of ends) {
          segments = traceRoute([start, end]);
          if (segments.length) break;
        }
      }
      // The mesh route stops on the town-side bank. The frame road carries the perpendicular crossing onward.
      if (segments.length < 1 && routeOutside && next.importedFixedCrossings) {
        const shortened = dryTownApproach(next, routeLine);
        if (shortened) segments = traceRoute(shortened);
      }
      if (segments.length < 1) return;
      if (!isApproach && program.walls) {
        const wallEdges = kindEdgeIds(next, "wall");
        const wallVertices = new Set([...wallEdges].flatMap(id => [mesh.edges[id].a, mesh.edges[id].b]));
        const gateVertices = new Set(townGates(next).map(g => g.vertexId));
        const segStart = (seg: (typeof segments)[0]) => {
          const e = mesh.edges[seg.edgeId];
          return seg.forward ? e.a : e.b;
        };
        const segEnd = (seg: (typeof segments)[0]) => {
          const e = mesh.edges[seg.edgeId];
          return seg.forward ? e.b : e.a;
        };
        while (segments.length > 1) {
          const startV = segStart(segments[0]);
          if (wallVertices.has(startV) && !gateVertices.has(startV)) {
            segments.shift();
          } else {
            break;
          }
        }
        while (segments.length > 1) {
          const endV = segEnd(segments[segments.length - 1]);
          if (wallVertices.has(endV) && !gateVertices.has(endV)) {
            segments.pop();
          } else {
            break;
          }
        }
        if (segments.length === 1) {
          const startV = segStart(segments[0]);
          const endV = segEnd(segments[0]);
          if (
            (wallVertices.has(startV) && !gateVertices.has(startV)) ||
            (wallVertices.has(endV) && !gateVertices.has(endV))
          ) {
            return;
          }
        }
      }
      const importedRoad = (() => {
        if (!plan.importedRoads) return undefined;
        const gateRoad = plan.gates[gateIndex]?.roadIndex;
        if (isApproach && gateRoad !== undefined) return plan.importedRoads[gateRoad];
        if (plannedGate) return undefined;
        const used = new Set(plan.gates.flatMap(gate => (gate.roadIndex === undefined ? [] : [gate.roadIndex])));
        const near = (point: Point | undefined) =>
          point
            ? plan.importedRoads!.find((road, index) => {
                if (used.has(index)) return false;
                const end = road.path.at(-1);
                return !!end && Math.hypot(end[0] - point[0], end[1] - point[1]) < 1;
              })
            : undefined;
        return near(polyline[0]) ?? near(polyline.at(-1));
      })();
      appendGeneratedGroup(next, {
        id: `${GEN_PREFIX}road-${i}`,
        kind: "road",
        name: `Road ${i + 1}`,
        ...(importedRoad
          ? {
              sourceRoad: {
                index: importedRoad.sourceIndex,
                routeId: importedRoad.routeId,
                ...(importedRoad.riverLanding ? { terminal: "riverLanding" as const } : {})
              }
            }
          : {}),
        segments,
        style: { widthMeters: defaultRoadWidthMeters(townExtentMeters(source.frame)), color: "#735238" },
        locked: false
      });
    });
    // The outside approach can collapse onto one vertex when the surveyed bank
    // already sits inside the town. The gate's street is that road's town end.
    if (plan.importedRoads) {
      const tagged = new Set(
        next.featureGroups.flatMap(group =>
          group.kind === "road" && group.sourceRoad && group.segments.length ? [group.sourceRoad.index] : []
        )
      );
      const meshHalf = townMeshExtentMeters(source.frame) / 2;
      for (const [roadIndex, road] of plan.importedRoads.entries()) {
        if (tagged.has(road.sourceIndex)) continue;
        const end = road.path.at(-1);
        // A road that still aims at the mesh edge failed to leave town. Do not
        // borrow another street for it. Only a bank already inside the mesh
        // is continued by the frame road.
        if (!end || Math.max(Math.abs(end[0]), Math.abs(end[1])) >= meshHalf - 1) continue;
        const gateIndex = plan.gates.findIndex(gate => gate.roadIndex === roadIndex);
        if (gateIndex < 0) continue;
        const street = next.featureGroups.find(
          group => group.id === `${GEN_PREFIX}road-${approachRoadCount + gateIndex}`
        );
        if (street?.kind !== "road" || !street.segments.length || street.sourceRoad) continue;
        street.sourceRoad = {
          index: road.sourceIndex,
          routeId: road.routeId,
          ...(road.riverLanding ? { terminal: "riverLanding" as const } : {})
        };
      }
    }
    if (complete && plan.importedRoads === undefined) {
      // Far-bank FMG roads must cross the entire span before entering town.
      // An exterior-only gate route can otherwise skirt the river instead.
      const plaza = plan.precincts.find(p => p.kind === "plaza");
      for (const bridge of next.featureGroups.filter(
        g => g.kind === "road" && g.id.startsWith(`${GEN_PREFIX}bridgeApproach-`)
      )) {
        const vertices = featureGroupVertices(next, bridge);
        const bankA = mesh.vertices[vertices[0]].point;
        const bankB = mesh.vertices[vertices.at(-1)!].point;
        const river = next.featureGroups.find(g => g.kind === "river" && g.vertices.some(id => vertices.includes(id)));
        if (river?.kind !== "river") continue;
        const riverPoints = river.vertices.map(id => mesh.vertices[id].point);
        for (const [i, line] of (plan.roadPaths ?? []).entries()) {
          if (!line.slice(1).some((point, j) => polylineCrossesSegment(riverPoints, line[j], point))) continue;
          const end = line.at(-1)!;
          const half = source.frame.extentMeters / 2;
          const scale = half / Math.max(Math.abs(end[0]), Math.abs(end[1]), 1);
          const far: Point = [end[0] * scale, end[1] * scale];
          const nearA =
            Math.hypot(far[0] - bankA[0], far[1] - bankA[1]) < Math.hypot(far[0] - bankB[0], far[1] - bankB[1]);
          const entry = nearA ? bankA : bankB,
            exit = nearA ? bankB : bankA;
          const target = plazaApproachPoint(cells, plaza, exit);
          if (!target) continue;
          const approach = routeComplete([far, entry], false, true);
          const street = routeComplete([exit, target], false, true);
          if (!approach.length || !street.length || bridge.kind !== "road") continue;
          const span = nearA
            ? bridge.segments
            : bridge.segments
                .slice()
                .reverse()
                .map(ref => ({
                  edgeId: ref.edgeId,
                  forward: !ref.forward
                }));
          const segments = [...approach, ...span, ...street];
          appendGeneratedGroup(next, {
            id: `${bridge.id.replace("bridgeApproach-", "riverRoad-")}-${i}`,
            kind: "road",
            name: "Cross-river road",
            segments,
            style: { widthMeters: defaultRoadWidthMeters(townExtentMeters(source.frame)), color: "#735238" },
            locked: false
          });
        }
      }
    }
    next = complete ? straightenBridges(next) : openGeneratedPassages(next);
    mesh = next.mesh;
    if (!complete) {
      // A diagnostic route may reach a river where a passage cannot be opened.
      // Keep its longest safe run instead of leaving a false river junction.
      const roadVertices = new Set(
        next.featureGroups.flatMap(group =>
          group.kind === "road"
            ? group.segments.flatMap(ref => [mesh.edges[ref.edgeId].a, mesh.edges[ref.edgeId].b])
            : []
        )
      );
      const blockedVertices = new Set(
        next.featureGroups
          .flatMap(group => (group.kind === "river" ? group.vertices : []))
          .filter(id => roadVertices.has(id) && !vertexHasKindPassage(next, id, "river"))
      );
      const blockedEdges = new Set(
        Object.values(mesh.edges)
          .filter(edge => blockedVertices.has(edge.a) || blockedVertices.has(edge.b))
          .map(edge => edge.id)
      );
      next.featureGroups = next.featureGroups.flatMap(group => {
        if (group.locked || group.kind !== "road" || !group.id.startsWith(GEN_PREFIX)) return [group];
        const segments = longestUnbannedRun(group.segments, blockedEdges);
        return segments.length ? [{ ...group, segments }] : [];
      });
    }
  }

  if (stageStep >= 5) {
    next = shortcutExteriorRoads(next, true);
    mesh = next.mesh;
  }
  // A ferry landing sits on the bank, off the coarse mesh. Run its town road
  // from the routed road's outer vertex so the road reaches the landing and
  // lots and fields keep clear of it (Batonykut).
  for (const connection of next.riverConnections ?? []) {
    const group = next.featureGroups.find(g => g.kind === "road" && g.sourceRoad?.index === connection.sourceIndex);
    const outer = group ? mesh.vertices[featureGroupVertices(next, group)[0]]?.point : undefined;
    if (outer && connection.townRoad.length === 1) connection.townRoad = [[...outer], connection.townRoad[0]];
  }

  return { stopped: false as const, next, mesh };
}

export type ApplyRoadsResult = ReturnType<typeof applyRoads>;
