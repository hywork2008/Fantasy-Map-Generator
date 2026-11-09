import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import { pointInPolygon, polygonArea } from "../../geom";
import { simpleContour } from "../geometry/surfaces";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

import { vectorWallSettings } from "../generation/wallShape";

const keys = (v: unknown, names: string, optional = "") =>
  object(v) &&
  names.split(",").every(k => Object.hasOwn(v, k)) &&
  Object.keys(v).every(k => [...names.split(","), ...optional.split(",")].includes(k));
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e8;
const point = (v: unknown): v is Point => Array.isArray(v) && v.length === 2 && v.every(finite);
const ring = (v: unknown): v is Point[] =>
  Array.isArray(v) &&
  v.length >= 3 &&
  v.length <= 16000 &&
  v.every(point) &&
  simpleContour(v, true) &&
  Math.abs(polygonArea(v)) > 1e-12;
const polygon = (v: unknown) =>
  object(v) &&
  ring(v.outer) &&
  Array.isArray(v.holes) &&
  v.holes.length <= 128 &&
  v.holes.every(h => ring(h) && h.every(p => pointInPolygon(p, v.outer as Point[])));
const id = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,127}$/.test(v) &&
  !["__proto__", "constructor", "prototype"].includes(v);
export function validateVectorGeneration(doc: VectorCityDocument): string[] {
  const errors: string[] = [];
  const s = doc.site,
    g = doc.generation;
  if (s) {
    if (
      !keys(s, "kind,id,revision,transform,center,domain,water,fixedPaths,crossings", "descriptor") ||
      !["fmg", "synthetic"].includes(s.kind) ||
      !id(s.id) ||
      !Number.isSafeInteger(s.revision) ||
      s.revision < 0 ||
      !keys(s.transform, "originMapUnits,metersPerMapUnit,localAxes") ||
      !point(s.transform.originMapUnits) ||
      !finite(s.transform.metersPerMapUnit) ||
      s.transform.metersPerMapUnit <= 0 ||
      s.transform.localAxes !== "east-north" ||
      !point(s.center) ||
      !Array.isArray(s.domain) ||
      !s.domain.length ||
      s.domain.length > 100 ||
      !s.domain.every(p => keys(p, "outer,holes") && polygon(p)) ||
      !Array.isArray(s.water) ||
      s.water.length > 500 ||
      !s.water.every(
        w =>
          keys(w, "id,polygons", "riverPathId") &&
          id(w.id) &&
          Array.isArray(w.polygons) &&
          w.polygons.length <= 100 &&
          w.polygons.every(p => keys(p, "outer,holes") && polygon(p)) &&
          (w.riverPathId === undefined || (id(w.riverPathId) && doc.paths[w.riverPathId]?.role === "river"))
      ) ||
      !Array.isArray(s.fixedPaths) ||
      s.fixedPaths.length > 2048 ||
      !s.fixedPaths.every(
        p =>
          p.editPolicy === "fixed" && p.origin === "imported" && JSON.stringify(p) === JSON.stringify(doc.paths[p.id])
      ) ||
      !Array.isArray(s.crossings) ||
      s.crossings.length > 100 ||
      !s.crossings.every(
        c =>
          keys(c, "id,riverId,geometryVersion,bridgeId,routeIds,waterA,waterB,deckA,deckB,approachA,approachB") &&
          [c.id, c.riverId, c.geometryVersion].every(Number.isSafeInteger) &&
          id(c.bridgeId) &&
          doc.connections.bridges[c.bridgeId]?.editPolicy === "fixed" &&
          Array.isArray(c.routeIds) &&
          c.routeIds.every(Number.isSafeInteger) &&
          [c.waterA, c.waterB, c.deckA, c.deckB, c.approachA, c.approachB].every(point)
      ) ||
      (s.descriptor !== undefined && !object(s.descriptor))
    )
      errors.push("site-input");
  }
  if (g) {
    if (
      !s ||
      !keys(
        g,
        "algorithm,sourceRevision,settings,pathRevisions,connectionFingerprint,blocks,diagnostics,inputRevision,inputNodes"
      ) ||
      g.algorithm !== "vector-skeleton-v1" ||
      !Number.isSafeInteger(g.sourceRevision) ||
      !Number.isSafeInteger(g.inputRevision) ||
      !Array.isArray(g.inputNodes) ||
      g.inputNodes.length > 10000 ||
      !g.inputNodes.every(
        n =>
          keys(n, "id,position,anchors") &&
          id(n.id) &&
          point(n.position) &&
          Array.isArray(n.anchors) &&
          n.anchors.every(
            a => keys(a, "pathId,segmentId,t") && id(a.pathId) && id(a.segmentId) && finite(a.t) && a.t >= 0 && a.t <= 1
          )
      ) ||
      !keys(
        g.settings,
        "seed,roadWidthMeters,clearanceMeters,branches,wall",
        "wallSides,wallMaterial,innerWall,townMoat,layout,castle,port,wallCoast"
      ) ||
      typeof g.settings.seed !== "string" ||
      g.settings.seed.length > 256 ||
      !finite(g.settings.roadWidthMeters) ||
      g.settings.roadWidthMeters <= 0 ||
      !finite(g.settings.clearanceMeters) ||
      g.settings.clearanceMeters < 0 ||
      !Number.isInteger(g.settings.branches) ||
      g.settings.branches < 0 ||
      g.settings.branches > 24 ||
      !vectorWallSettings(g.settings) ||
      !object(g.pathRevisions) ||
      Object.entries(g.pathRevisions).some(([key, value]) => !id(key) || !Number.isSafeInteger(value)) ||
      typeof g.connectionFingerprint !== "string" ||
      g.connectionFingerprint.length > 2e6 ||
      !Array.isArray(g.blocks) ||
      g.blocks.length > 10000 ||
      !g.blocks.every(
        b =>
          keys(b, "id,outer,holes,areaMeters2,frontage,reachable") &&
          id(b.id) &&
          polygon(b) &&
          finite(b.areaMeters2) &&
          b.areaMeters2 > 0 &&
          Math.abs(
            b.areaMeters2 - (Math.abs(polygonArea(b.outer)) - b.holes.reduce((n, h) => n + Math.abs(polygonArea(h)), 0))
          ) < 1e-3 &&
          typeof b.reachable === "boolean" &&
          Array.isArray(b.frontage) &&
          b.frontage.every(
            f =>
              keys(f, "pathId,from,to,lengthMeters") &&
              id(f.pathId) &&
              point(f.from) &&
              point(f.to) &&
              finite(f.lengthMeters) &&
              f.lengthMeters > 0 &&
              (g.inputRevision !== doc.revision || doc.paths[f.pathId]?.role === "road")
          )
      ) ||
      !Array.isArray(g.diagnostics) ||
      g.diagnostics.length > 10000 ||
      !g.diagnostics.every(
        d =>
          keys(d, "code,entityId,severity") &&
          id(d.code) &&
          typeof d.entityId === "string" &&
          ["warning", "error"].includes(d.severity)
      )
    )
      errors.push("generation-data");
  }
  return errors;
}
