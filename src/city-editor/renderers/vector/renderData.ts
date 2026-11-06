import { curveSource } from "../../generators/vector/editing/paths";
import { bridgeGeometry, gateOpening, junctionSurface } from "../../generators/vector/geometry/network";
import { regionBoolean } from "../../generators/vector/geometry/regions";
import { pathSurface } from "../../generators/vector/geometry/surfaces";
import { vectorWaterSurfaces } from "../../generators/vector/geometry/water";
import { assertVectorDocument } from "../../generators/vector/validation/document";
import type { Point } from "../../types/primitives";
import type { VectorCityDocument, VectorPath, VectorPlacement } from "../../types/vector/document";
import type { VectorPolygon } from "../../types/vector/generation";
import type { VectorStage } from "../../types/vector/urban";
export type VectorSurfaceKind =
  | "region"
  | "block"
  | "junction"
  | "road"
  | "river"
  | "wall"
  | "bridge"
  | "access"
  | "building";
export interface VectorRenderSurface {
  id: string;
  kind: VectorSurfaceKind;
  polygons: VectorPolygon[];
  color: string;
  heightMeters: number;
  elevationMeters: number;
  placement?: VectorPlacement;
  provisional?: boolean;
  buildingKind?: string;
}
export interface VectorRenderData {
  revision: number;
  stage: VectorStage;
  center: Point;
  extentMeters: number;
  surfaces: VectorRenderSurface[];
  paths: VectorPath[];
  nodes: { id: string; position: Point }[];
  warnings: string[];
}
/** Adopted geometry only. The same clipped surfaces feed screen SVG, exports and 3D. */
export function vectorRenderData(
  doc: VectorCityDocument,
  stage: VectorStage = doc.urban ? "housing" : "regions"
): VectorRenderData {
  assertVectorDocument(doc);
  const urban = doc.urban?.inputRevision === doc.revision ? doc.urban : undefined,
    checkpoint = urban?.checkpoints.find(c => c.id === stage),
    hidden = new Set(
      checkpoint
        ? Object.keys(doc.paths).filter(id => !checkpoint.pathIds.includes(id))
        : stage === "inputs"
          ? Object.keys(doc.generation?.pathRevisions ?? {})
          : []
    );
  const paths = Object.values(doc.paths).filter(p => !hidden.has(p.id));
  let extent = doc.frame.extentMeters,
    center: Point = doc.site?.center ?? [0, 0];
  if (!doc.site && Object.keys(doc.paths).length) {
    let minX = -extent / 2,
      maxX = extent / 2,
      minY = -extent / 2,
      maxY = extent / 2;
    for (const path of Object.values(doc.paths))
      for (const p of pathSurface(path).outer) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]);
        maxY = Math.max(maxY, p[1]);
      }
    center = [(minX + maxX) / 2, (minY + maxY) / 2];
    extent = Math.max(maxX - minX, maxY - minY) * 1.05;
  }
  const frame: VectorPolygon = {
      outer: [
        [center[0] - extent / 2, center[1] - extent / 2],
        [center[0] + extent / 2, center[1] - extent / 2],
        [center[0] + extent / 2, center[1] + extent / 2],
        [center[0] - extent / 2, center[1] + extent / 2]
      ],
      holes: []
    },
    surfaces: VectorRenderSurface[] = [],
    warnings: string[] = [];
  const add = (item: VectorRenderSurface) => {
    const clipped = regionBoolean(item.polygons, [frame], "intersection");
    if (clipped.length) surfaces.push({ ...item, polygons: clipped });
  };
  for (const r of Object.values(doc.regions))
    add({ id: r.id, kind: "region", polygons: [r], color: "#bfc8ab", heightMeters: 0, elevationMeters: 0.005 });
  const early = urban && ["inputs", "skeleton", "regions"].includes(stage),
    nodes = (
      stage === "inputs" && doc.generation?.inputRevision === doc.revision
        ? (urban?.baseGeneration ?? doc.generation).inputNodes
        : Object.values(early ? urban.baseConnections.nodes : doc.connections.nodes)
    )
      .map(n => ({ ...n, anchors: n.anchors.filter(a => !hidden.has(a.pathId)) }))
      .filter(n => n.anchors.length),
    sceneDoc = { ...doc, connections: { ...doc.connections, nodes: Object.fromEntries(nodes.map(n => [n.id, n])) } };
  for (const n of nodes) {
    const j = junctionSurface(sceneDoc, n.id);
    if (j)
      add({ id: n.id, kind: "junction", polygons: [j], color: "#c7ae84", heightMeters: 0.03, elevationMeters: 0.02 });
  }
  if (
    ["regions", "blocksAndLanes", "facilities", "housing"].includes(stage) &&
    doc.generation?.inputRevision === doc.revision
  )
    for (const b of urban && stage === "regions" ? urban.baseGeneration.blocks : doc.generation.blocks)
      add({
        id: b.id,
        kind: "block",
        polygons: [b],
        color:
          urban && stage !== "regions"
            ? { commerce: "#ddd0a6", craft: "#d5c2ab", hazard: "#c9b6b0", river: "#b9cec7", residential: "#d5d1a9" }[
                urban.districts.find(d => d.id === b.id)?.use ?? "residential"
              ]
            : b.reachable
              ? "#d5d1a9"
              : "#d9c9b9",
        heightMeters: 0,
        elevationMeters: 0.01
      });
  for (const p of paths.filter(p => p.role === "road"))
    add({
      id: p.id,
      kind: "road",
      polygons: [pathSurface(p)],
      color: "#c7ae84",
      heightMeters: 0.04,
      elevationMeters: 0.02
    });
  for (const w of doc.site?.water ?? [])
    add({ id: w.id, kind: "river", polygons: w.polygons, color: "#71abc4", heightMeters: 0, elevationMeters: 0.08 });
  for (const p of paths.filter(p => p.role !== "road")) {
    if (p.role === "river" && doc.site?.water.some(w => w.riverPathId === p.id)) continue;
    const polygons =
      p.role === "wall"
        ? regionBoolean(
            [pathSurface(p)],
            Object.values(doc.connections.gates)
              .filter(g => g.wallPathId === p.id)
              .map(g => ({ outer: gateOpening(doc, g), holes: [] })),
            "difference"
          )
        : [pathSurface(p)];
    add({
      id: p.id,
      kind: p.role,
      polygons,
      color: p.role === "wall" ? "#655b53" : "#71abc4",
      heightMeters: p.role === "wall" ? 6 : 0,
      elevationMeters: p.role === "wall" ? 0.1 : 0.08
    });
  }
  const waters = vectorWaterSurfaces(doc);
  for (const b of Object.values(doc.connections.bridges)) {
    if (hidden.has(b.roadPathId)) continue;
    add({
      id: b.id,
      kind: "bridge",
      polygons: [{ outer: bridgeGeometry(doc, b, waters).deck, holes: [] }],
      color: b.structure === "stone" ? "#a69d8c" : "#a98050",
      heightMeters: 0.3,
      elevationMeters: 0.16
    });
  }
  for (const p of Object.values(doc.placements)) {
    if (checkpoint && !checkpoint.placementIds.includes(p.id)) continue;
    for (const e of p.building?.entrances ?? []) {
      const path: VectorPath = {
        id: p.id,
        revision: 0,
        role: "road",
        origin: "automatic",
        editPolicy: "editable",
        source: curveSource(e.connector, "polyline", false),
        width: { leftMeters: e.widthMeters / 2, rightMeters: e.widthMeters / 2, stations: [] }
      };
      add({
        id: p.id,
        kind: "access",
        polygons: [pathSurface(path)],
        color: "#c7ae84",
        heightMeters: 0.02,
        elevationMeters: 0.025
      });
    }
    const b = p.building,
      display = p.display;
    add({
      id: p.id,
      kind: "building",
      polygons: b?.footprint ?? display?.footprint ?? [p.site],
      color: b?.kind === "facility" || display?.kind === "facility" ? "#ac7858" : "#99816b",
      heightMeters: b?.heightMeters ?? display?.heightMeters ?? (b?.storeys ? b.storeys * 3.2 : 6),
      elevationMeters: 0.1,
      placement: p,
      provisional: b?.provenance === "provisional" || display?.provenance === "massing",
      buildingKind: b?.kind ?? display?.kind ?? "manual"
    });
  }
  if (doc.urban && !urban) warnings.push("stale-stages");
  return {
    revision: doc.revision,
    stage,
    center,
    extentMeters: extent,
    surfaces,
    paths,
    nodes: nodes.map(n => ({ id: n.id, position: n.position })),
    warnings
  };
}
