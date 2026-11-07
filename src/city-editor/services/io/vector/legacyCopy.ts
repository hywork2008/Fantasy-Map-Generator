import { buildBlockFabric, buildHarborPlan } from "../../../generators/blockInfill";
import { buildForestPlan } from "../../../generators/forestPlan";
import { hasForestState } from "../../../generators/forestSettings";
import { convexHull, polygonCentroid } from "../../../generators/geom";
import { transformLandmarkPolygons } from "../../../generators/landmarks";
import { facePoints } from "../../../generators/mesh";
import { objectFootprint } from "../../../generators/objectPlacement";
import { residentialCapacity } from "../../../generators/residentialCapacityFormula";
import { createVectorDocument } from "../../../generators/vector/document";
import {
  adoptVectorBridge,
  createVectorGate,
  rebuildRoadGraph,
  setWallCircuit
} from "../../../generators/vector/editing/network";
import { curveSource } from "../../../generators/vector/editing/paths";
import { pathIsClosed } from "../../../generators/vector/geometry/curves";
import { pathIntersections } from "../../../generators/vector/geometry/intersections";
import { regionBoolean } from "../../../generators/vector/geometry/regions";
import { assertVectorDocument } from "../../../generators/vector/validation/document";
import type { CityDocument, Point } from "../../../types/document";
import type { CurveAnchor, VectorCityDocument, VectorPath, VectorPlacement } from "../../../types/vector/document";
import { parseDocument, serializeDocument } from "../documentCodec";
import { serializeVectorDocument } from "./documentCodec";
import { vectorFromFreeform } from "./freeform";
import { copyLegacyDefense } from "./legacyDefense";
import { copyLegacyHarbor } from "./legacyHarbor";
export type VectorCopyReport = NonNullable<VectorCityDocument["legacyCopy"]>["report"];
/** Explicit one-time adapter. The source archive preserves every feature without fabricating cells on the vector side. */
export function copyLegacyCity(source: CityDocument): { document: VectorCityDocument; report: VectorCopyReport } {
  const sourceJson = serializeDocument(source);
  if (sourceJson.length > 6 * 1024 * 1024) throw new Error("vector-copy-budget");
  if (source.freeform) {
    const document = vectorFromFreeform(source.freeform, source.historicalPeriod),
      report: VectorCopyReport = [
        {
          id: "freeform",
          status: "converted",
          category: "freeform-ledger",
          reason:
            "Terrain recipe, sculpt, pads, ways, rivers, zones, placements and market appearance retained without cells."
        }
      ];
    document.legacyCopy = { sourceJson, report };
    serializeVectorDocument(document);
    return { document, report };
  }
  let doc = createVectorDocument(source.generationSeed ?? "legacy-copy", source.frame.extentMeters);
  doc.context = {
    historicalPeriod: source.historicalPeriod ?? "highMedieval",
    targetPopulation: source.populationPlan?.settings.targetPopulation ?? 0
  };
  const report: VectorCopyReport = [],
    anchors = new Map<string, CurveAnchor[]>(),
    planks: string[] = [],
    groupPaths = new Map<string, string[]>(),
    gateIds = new Map<string, string>();
  const record = (id: string, status: VectorCopyReport[number]["status"], category: string, reason: string) =>
    report.push({ id, status, category, reason });
  const addPath = (id: string, role: VectorPath["role"], points: Point[], width: number, vertices?: string[]) => {
    const key = `copy:path:${Object.keys(doc.paths).length}`,
      closed = points.length > 2 && points[0][0] === points.at(-1)![0] && points[0][1] === points.at(-1)![1];
    const p: VectorPath = {
      id: key,
      revision: 0,
      role,
      origin: "imported",
      editPolicy: "fixed",
      source: curveSource(closed ? points.slice(0, -1) : points, "polyline", closed),
      width: { leftMeters: width / 2, rightMeters: width / 2, stations: [] }
    };
    const candidate = structuredClone(doc);
    candidate.paths[key] = p;
    try {
      assertVectorDocument(candidate);
    } catch (error) {
      record(
        id,
        "unsupported",
        role,
        `Source chain cannot satisfy vector geometry: ${error instanceof Error ? error.message : "invalid"}. Exact source is archived.`.slice(
          0,
          500
        )
      );
      return;
    }
    doc.paths[key] = p;
    if (vertices && p.source.kind === "curve")
      for (let i = 0; i < vertices.length; i++) {
        const index = Math.min(i, p.source.segments.length - 1),
          a = { pathId: key, segmentId: p.source.segments[index].id, t: i >= p.source.segments.length ? 1 : 0 };
        const list = anchors.get(vertices[i]) ?? [];
        list.push(a);
        anchors.set(vertices[i], list);
      }
    record(id, "converted", role, "Original meter coordinates and polyline corners retained.");
    return key;
  };
  for (const g of source.featureGroups) {
    if (g.kind === "river") {
      addPath(
        g.id,
        "river",
        g.vertices.map(id => source.mesh.vertices[id].point),
        g.style.widthMeters,
        g.vertices
      );
      continue;
    }
    let chain: string[] = [];
    const flush = () => {
      if (chain.length >= 2) {
        const id = addPath(
          g.id,
          g.kind === "wall" ? "wall" : "road",
          chain.map(id => source.mesh.vertices[id].point),
          g.style.widthMeters,
          chain
        );
        if (id) groupPaths.set(g.id, [...(groupPaths.get(g.id) ?? []), id]);
        if (id && g.kind === "plank") planks.push(id);
      }
      chain = [];
    };
    for (const ref of g.segments) {
      const e = source.mesh.edges[ref.edgeId],
        a = ref.forward ? e.a : e.b,
        b = ref.forward ? e.b : e.a;
      if (chain.length && chain.at(-1) !== a) flush();
      if (source.bastionedTown && chain.length >= 2) {
        const before = source.mesh.vertices[chain[chain.length - 2]].point,
          corner = source.mesh.vertices[a].point,
          after = source.mesh.vertices[b].point,
          u = [corner[0] - before[0], corner[1] - before[1]],
          v = [after[0] - corner[0], after[1] - corner[1]],
          scale = Math.hypot(...u) * Math.hypot(...v);
        // A defense rampart is not a constant-width ribbon around a sharp star.
        // Keep exact straight spans and shared nodes; the plan owns the corner masses.
        if (Math.abs(u[0] * v[1] - u[1] * v[0]) > scale * 1e-8 || u[0] * v[0] + u[1] * v[1] <= 0) flush();
      }
      if (!chain.length) chain.push(a);
      chain.push(b);
    }
    flush();
  }
  for (const [id, list] of anchors) {
    const unique = list.filter((a, i, all) => all.findIndex(b => JSON.stringify(a) === JSON.stringify(b)) === i);
    if (!unique.length) continue;
    doc.connections.nodes[`copy:node:${doc.connections.nodes ? Object.keys(doc.connections.nodes).length : 0}`] = {
      id: `copy:node:${Object.keys(doc.connections.nodes).length}`,
      position: [...source.mesh.vertices[id].point],
      anchors: unique
    };
  }
  rebuildRoadGraph(doc);
  for (const p of Object.values(doc.paths).filter(p => p.role === "wall" && pathIsClosed(p)))
    try {
      doc = setWallCircuit(doc, p.id);
    } catch {
      record(p.id, "unsupported", "wall-circuit", "The standing line is retained; circuit semantics are archived.");
    }
  for (const g of source.gates) {
    const list = anchors.get(g.vertexId) ?? [],
      wall = list.find(a => doc.paths[a.pathId]?.role === "wall"),
      access = list.find(a => doc.paths[a.pathId]?.role === (g.role === "water" ? "river" : "road"));
    if (!wall || !access) {
      record(g.id, "unsupported", "gate", "No exact shared wall/access vertex. No snapping was applied.");
      continue;
    }
    try {
      const previousGates = new Set(Object.keys(doc.connections.gates));
      const assembly = structuredClone(doc);
      assembly.paths[wall.pathId].editPolicy = "editable";
      const withGate = createVectorGate(
        assembly,
        wall,
        access,
        g.passageWidthMeters ??
          Math.max(4, (doc.paths[access.pathId].width.leftMeters + doc.paths[access.pathId].width.rightMeters) * 1.5),
        g.role === "water" ? "water" : "passage"
      );
      withGate.paths[wall.pathId].editPolicy = "fixed";
      assertVectorDocument(withGate);
      doc = withGate;
      const created = Object.keys(doc.connections.gates).find(id => !previousGates.has(id));
      if (created) gateIds.set(g.id, created);
      record(
        g.id,
        g.passageWidthMeters ? "converted" : "snapshot",
        "gate",
        g.passageWidthMeters
          ? "Exact shared source vertex and opening width retained."
          : "Opening width inferred from the source road; original gate is archived."
      );
    } catch (error) {
      record(
        g.id,
        "unsupported",
        "gate",
        `Opening or access violates vector constraints: ${error instanceof Error ? error.message : "invalid"}. Source gate is archived.`.slice(
          0,
          500
        )
      );
    }
  }
  const region = (
    id: string,
    kind: "district" | "reservation" | "forest" | "farm" | "park" | "cemetery",
    outer: Point[],
    holes: Point[][] = [],
    snapshot = false
  ) => {
    let index = Object.keys(doc.regions).length;
    while (doc.regions[`copy:region:${index}`]) index++;
    const key = `copy:region:${index}`,
      candidate = structuredClone(doc);
    candidate.regions[key] = { id: key, kind, outer: structuredClone(outer), holes: structuredClone(holes) };
    try {
      assertVectorDocument(candidate);
      doc.regions[key] = candidate.regions[key];
      record(
        id,
        snapshot ? "snapshot" : "converted",
        kind,
        snapshot
          ? "Resolved source forest boundary and clearings retained. Tree appearance and automatic regeneration remain archived."
          : "Original polygon and holes retained; editable cell attributes are archived."
      );
    } catch {
      record(id, "unsupported", kind, "Source polygon exceeds vector geometry constraints; archived without repair.");
    }
  };
  const water: { outer: Point[]; holes: Point[][] }[] = [];
  for (const f of Object.values(source.mesh.faces)) {
    const ring = facePoints(source.mesh, f);
    if (f.properties.water !== "land") water.push({ outer: ring, holes: [] });
    else if (f.properties.ward || f.properties.locked)
      region(
        f.id,
        f.properties.locked
          ? "reservation"
          : ["forest", "farm", "park", "cemetery"].includes(f.properties.ward ?? "")
            ? (f.properties.ward as "forest" | "farm" | "park" | "cemetery")
            : "district",
        ring
      );
  }
  water.push(
    ...(source.waterAreas ?? []).map(w => ({ outer: w.polygon, holes: [] })),
    ...(source.regionalWaterAreas ?? []).map(outer => ({ outer, holes: [] }))
  );
  for (const polygon of regionBoolean(water, [], "union")) region("water", "reservation", polygon.outer, polygon.holes);
  // Water display has an explicit immutable authority, independent of copied cell boundaries.
  const waters = regionBoolean(water, [], "union");
  doc.site = {
    kind: "synthetic",
    id: "copied-site",
    revision: 0,
    transform: { originMapUnits: [0, 0], metersPerMapUnit: 1, localAxes: "east-north" },
    center: [0, 0],
    domain: [
      {
        outer: [
          [-source.frame.extentMeters / 2, -source.frame.extentMeters / 2],
          [source.frame.extentMeters / 2, -source.frame.extentMeters / 2],
          [source.frame.extentMeters / 2, source.frame.extentMeters / 2],
          [-source.frame.extentMeters / 2, source.frame.extentMeters / 2]
        ],
        holes: []
      }
    ],
    water: waters.map((polygon, i) => {
      const rivers = Object.values(doc.paths).filter(p => p.role === "river");
      return {
        id: `copy-water:${i}`,
        polygons: [polygon],
        ...(rivers.length === 1 && waters.length === 1 ? { riverPathId: rivers[0].id } : {})
      };
    }),
    fixedPaths: Object.values(doc.paths).map(p => structuredClone(p)),
    crossings: []
  };
  for (const id of planks) {
    const p = doc.paths[id];
    let adopted = false;
    for (const river of Object.values(doc.paths).filter(p => p.role === "river")) {
      const hit = pathIntersections(p, river)[0];
      if (!hit || p.source.kind !== "curve") continue;
      try {
        doc = adoptVectorBridge(doc, {
          id: `copy:bridge:${Object.keys(doc.connections.bridges).length}`,
          roadPathId: id,
          riverAnchor: hit.b,
          from: { pathId: id, segmentId: p.source.segments[0].id, t: 0 },
          to: { pathId: id, segmentId: p.source.segments.at(-1)!.id, t: 1 },
          structure: "stone",
          dryLandingMeters: 0.1,
          editPolicy: "fixed"
        });
        adopted = true;
        break;
      } catch {
        /* Keep the source in the archive, never repair a copied bridge silently. */
      }
    }
    if (!adopted)
      record(
        id,
        "unsupported",
        "bridge",
        "Original crossing fails the common bridge policy or has no exact river reference; no deck is drawn."
      );
    else record(id, "converted", "bridge", "Bridge geometry satisfies the shared period, skew and landing policy.");
  }
  const addPlacement = (
    id: string,
    modelId: string,
    footprint: { outer: Point[]; holes: Point[][] }[],
    height: number,
    kind: NonNullable<VectorPlacement["display"]>["kind"],
    position?: Point,
    facing = 0,
    dwellings?: number
  ) => {
    const site = { outer: convexHull(footprint.flatMap(p => p.outer)), holes: [] },
      key = `copy:placement:${Object.keys(doc.placements).length}`,
      p: VectorPlacement = {
        id: key,
        modelId,
        position: position ?? polygonCentroid(site.outer),
        facingDegrees: ((facing % 360) + 360) % 360,
        origin: "imported",
        editPolicy: "fixed",
        site,
        accesses: [],
        display: {
          kind,
          heightMeters: height,
          footprint: structuredClone(footprint),
          provenance: "massing",
          note: "Copied plan footprint; 3D massing does not reproduce source detail.",
          ...(dwellings === undefined ? {} : { dwellings })
        }
      };
    const candidate = structuredClone(doc);
    candidate.placements[key] = p;
    try {
      assertVectorDocument(candidate);
      doc.placements[key] = p;
      record(
        id,
        "snapshot",
        kind,
        "Plan footprint and available capacity retained. 3D detail and editing semantics remain in the source archive."
      );
    } catch {
      record(
        id,
        "unsupported",
        kind,
        "Source placement cannot satisfy the vector contract; archived without resizing."
      );
    }
  };
  // Resolve old automatic cover once, using the same reservations as the old editor.
  // Only independent polygons are adopted; no source cells enter the vector document.
  const fabric = source.fabric ? buildBlockFabric(source) : undefined;
  if (hasForestState(source)) {
    const forest = buildForestPlan(source, fabric ?? { buildings: [], lanes: [], entrances: new Map(), farms: [] });
    const cover = forest.regions.map(r => ({ outer: r.outer, holes: r.holes }));
    // A farm ward may now be forest. Preserve only its non-forest area rather than
    // keeping contradictory farm/forest ownership at the same coordinates.
    for (const [id, r] of Object.entries(doc.regions)) {
      if (r.kind !== "farm") continue;
      const rest = regionBoolean([r], cover, "difference");
      if (rest.length === 1 && JSON.stringify(rest[0]) === JSON.stringify({ outer: r.outer, holes: r.holes })) continue;
      delete doc.regions[id];
      record(
        id,
        "snapshot",
        "farm",
        "Copied farm ownership excludes the resolved automatic forest; original cell attributes remain archived."
      );
      for (const [i, polygon] of rest.entries()) {
        const key = `${id}:open:${i}`;
        doc.regions[key] = { ...r, id: key, ...polygon };
      }
    }
    for (const r of forest.regions) region(`forest:${r.id}`, "forest", r.outer, r.holes, true);
    for (const face of Object.values(source.mesh.faces))
      if (face.properties.landCoverOverride !== undefined)
        record(
          face.id,
          "unsupported",
          "land-cover-override",
          "Resolved forest geometry is copied; per-cell override editing remains archived."
        );
  }
  if (fabric) {
    for (const [i, b] of fabric.buildings.entries())
      addPlacement(
        b.id ?? `building:${i}`,
        "copied:building",
        [{ outer: b.polygon, holes: [] }],
        b.massing?.eaveHeightMeters ?? (b.storeys ?? 1) * 3.2,
        b.landmark ? "landmark" : "housing",
        undefined,
        0,
        residentialCapacity(b)
      );
    for (const [i, l] of fabric.lanes.entries()) addPath(`lane:${i}`, "road", l.points, l.widthMeters);
    for (const key of ["parks", "watermills", "aerialLandmarks", "farms", "openSpaces"] as const)
      if (
        fabric[key] &&
        (Array.isArray(fabric[key])
          ? (fabric[key] as unknown[]).length > 0
          : Object.values(fabric[key]!).some(v => Array.isArray(v) && v.length > 0))
      )
        record(
          `fabric:${key}`,
          "unsupported",
          key,
          "Derived decoration and operating semantics remain in the full source archive."
        );
  }
  for (const l of source.landmarks ?? []) {
    const asset = source.landmarkAssets?.find(a => a.id === l.assetId);
    if (asset)
      addPlacement(
        l.id,
        asset.bvModel?.id ?? "copied:landmark",
        transformLandmarkPolygons(asset.footprint, l),
        asset.bvModel?.heightMeters ?? 6,
        "facility",
        l.position,
        (l.rotation * 180) / Math.PI,
        asset.residentialDwellings
      );
    else record(l.id, "unsupported", "landmark", "Missing source asset; full instance is archived.");
  }
  let harborConverted = false;
  const copiedShips = new Set<string>();
  if (source.elements.some(e => e.kind === "ship" || e.kind === "harbor") || fabric?.harbor) {
    try {
      const harbor = fabric?.harbor ?? buildHarborPlan(source);
      if (!harbor) throw Error("harbor-plan-missing");
      const converted = copyLegacyHarbor(source, doc, harbor),
        candidate = structuredClone(doc);
      candidate.environment ??= { features: {}, hidden: [] };
      candidate.environment.harbor = converted;
      assertVectorDocument(candidate);
      doc = candidate;
      harborConverted = true;
      for (const ship of converted.ships) copiedShips.add(ship.id);
      record(
        converted.id,
        "converted",
        "harbor-plan",
        "Fixed polygon navigation, depths, shore access, berth/crane/cargo links and physical ships retained without cells."
      );
    } catch (error) {
      record(
        "harbor:legacy",
        "unsupported",
        "harbor-plan",
        `Atomic harbor conversion rejected: ${error instanceof Error ? error.message : "invalid-harbor"}. The source remains archived.`.slice(
          0,
          500
        )
      );
    }
  }
  for (const e of source.elements) {
    if (copiedShips.has(e.id) || (harborConverted && e.kind === "harbor")) {
      record(
        e.id,
        "converted",
        e.kind,
        "Fixed operating harbor geometry, physical dimensions and display state retained."
      );
      continue;
    }
    if (e.kind === "object") {
      const footprint = objectFootprint(e);
      if (footprint.length) {
        addPlacement(
          e.id,
          e.objectType ?? "copied:object",
          [{ outer: footprint, holes: [] }],
          6,
          "object",
          e.point,
          ((e.rotation ?? 0) * 180) / Math.PI
        );
        continue;
      }
    }
    record(e.id, "unsupported", e.kind, "No complete vector equivalent. Exact source element is archived.");
  }
  // Archive restoration is not semantic conversion. Report each omitted plan entity
  // so adoption review does not hide a missing ditch, access, sluice or cargo link.
  const omitted = (id: string, category: string) =>
    record(
      id,
      "unsupported",
      category,
      "Detailed geometry, ownership and operating semantics remain in the source archive; no active vector equivalent was created."
    );
  const defense = source.bastionedTown;
  let defenseConverted = false;
  if (defense) {
    try {
      const converted = copyLegacyDefense(source, doc, anchors, groupPaths, gateIds);
      const candidate = structuredClone(doc);
      candidate.environment ??= { features: {}, hidden: [] };
      candidate.environment.defenses = { ...candidate.environment.defenses, [converted.id]: converted };
      assertVectorDocument(candidate);
      doc = candidate;
      defenseConverted = true;
      record(
        defense.id,
        "converted",
        "defense-plan",
        "Independent defense geometry, elevations, ownership, wall spans, portals and access references retained as fixed semantic input."
      );
    } catch (error) {
      record(
        defense.id,
        "unsupported",
        "defense-plan",
        `Atomic defense conversion rejected: ${error instanceof Error ? error.message : "invalid-defense"}. The full source is archived.`.slice(
          0,
          500
        )
      );
    }
    for (const key of [
      "bastions",
      "curtains",
      "outworks",
      "ditches",
      "coveredWays",
      "accesses",
      "sluices",
      "works"
    ] as const)
      for (const part of defense[key] ?? [])
        if (defenseConverted)
          record(
            part.id,
            "converted",
            `defense-${key}`,
            "Geometry, elevations and semantic ownership retained by the fixed defense plan."
          );
        else omitted(part.id, `defense-${key}`);
    for (const [i] of defense.glacis.entries())
      if (defenseConverted)
        record(
          `${defense.id}:glacis:${i}`,
          "converted",
          "defense-glacis",
          "Independent defense reservation retained with polygon holes."
        );
      else omitted(`${defense.id}:glacis:${i}`, "defense-glacis");
  }
  for (const castle of source.castles ?? []) {
    for (const part of castle.parts) omitted(part.id, "castle-part");
    for (const [i] of castle.courtyards.entries()) omitted(`${castle.id}:courtyard:${i}`, "castle-courtyard");
    for (const [i] of castle.accesses.entries()) omitted(`${castle.id}:access:${i}`, "castle-access");
  }
  for (const cemetery of source.cemeteries ?? []) {
    for (const part of cemetery.parts) omitted(part.id, "cemetery-part");
    for (const [i] of cemetery.accesses.entries()) omitted(`${cemetery.id}:access:${i}`, "cemetery-access");
  }
  for (const ship of source.elements.filter(e => e.kind === "ship" && e.harborOperation))
    if (copiedShips.has(ship.id))
      record(
        `${ship.id}:cargo`,
        "converted",
        "harbor-cargo-assignment",
        "Validated berth, crane, pose, swept load and lighter/mother-ship references retained."
      );
    else omitted(`${ship.id}:cargo`, "harbor-cargo-assignment");
  const handled = new Set([
    "format",
    "version",
    "mesh",
    "frame",
    "featureGroups",
    "gates",
    "elements",
    "fabric",
    "landmarks",
    "landmarkAssets",
    "freeform",
    "historicalPeriod",
    "generationSeed",
    "waterAreas",
    "regionalWaterAreas",
    "populationPlan",
    ...(defenseConverted ? ["bastionedTown"] : [])
  ]);
  for (const [key, value] of Object.entries(source))
    if (!handled.has(key) && value !== undefined && value !== null && !(Array.isArray(value) && !value.length))
      if (Array.isArray(value))
        for (const [i, item] of value.entries())
          record(
            `${key}:${item && typeof item === "object" && "id" in item ? item.id : i}`,
            "unsupported",
            key,
            "Exact source item and specialized semantics are retained in the archive."
          );
      else
        record(
          key,
          "unsupported",
          key,
          "Source attributes and specialized semantics are retained in the archive for the original editor."
        );
  if (doc.site) doc.site.fixedPaths = Object.values(doc.paths).map(p => structuredClone(p));
  doc.legacyCopy = { sourceJson, report };
  doc.revision++;
  assertVectorDocument(doc);
  serializeVectorDocument(doc);
  return { document: doc, report };
}
export function restoreLegacyCopy(
  document: VectorCityDocument,
  provider?: import("../../../types/contracts/fixedApproachAdoption").FixedApproachProvider
) {
  return document.legacyCopy ? parseDocument(document.legacyCopy.sourceJson, provider) : null;
}
