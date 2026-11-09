import { isMarketPalette } from "../../../../buildings/medieval/marketAppearance";
import { historicalPeriodIndex } from "../../../../types/historicalPeriod";
import type { VectorCityDocument } from "../../../types/vector/document";
import { VECTOR_FEATURE_KINDS } from "../../../types/vector/environment";
import { parseFreeformCity } from "../../freeform/freeformCity";
import { validateVectorDefenses } from "../defense";
import { validateVectorFerries } from "../ferry";
import { evaluateAnchor } from "../geometry/curves";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { ringInside } from "../geometry/routing";
import { simpleContour } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { validateVectorGuilds } from "../guild";
import { validateVectorHarbor } from "../harbor";
import { validateVectorMonasteries } from "../monastery";
import { validateVectorLandscape } from "./landscape";

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const point = (v: unknown) =>
  Array.isArray(v) && v.length === 2 && v.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e7);
const ring = (v: unknown) =>
  Array.isArray(v) && v.length >= 3 && v.length <= 512 && v.every(point) && simpleContour(v, true);
const polygon = (p: unknown): boolean =>
  record(p) &&
  Object.keys(p).every(k => ["outer", "holes"].includes(k)) &&
  ring(p.outer) &&
  Array.isArray(p.holes) &&
  p.holes.length <= 64 &&
  p.holes.every(h => ring(h) && ringInside(h, p.outer as [number, number][]));
function validRecipeParts(value: unknown): boolean {
  if (!Array.isArray(value) || !value.length || value.length > 256) return false;
  let budget = 0;
  const finiteTree = (v: unknown, depth = 0): boolean => {
    if (++budget > 300000 || depth > 8) return false;
    if (typeof v === "number") return Number.isFinite(v) && Math.abs(v) <= 1e7;
    if (Array.isArray(v)) return v.length <= 65536 && v.every(x => finiteTree(x, depth + 1));
    if (v && typeof v === "object") return Object.values(v).every(x => finiteTree(x, depth + 1));
    return typeof v === "string" || typeof v === "boolean" || v === undefined;
  };
  return (
    finiteTree(value) &&
    value.every(p => {
      if (
        !record(p) ||
        ![
          "offset",
          "hill",
          "dome",
          "range",
          "trough",
          "pit",
          "crag",
          "spur",
          "scarp",
          "noise",
          "smooth",
          "mask",
          "coarse",
          "correct"
        ].includes(p.kind as string)
      )
        return false;
      if (p.radiusMeters !== undefined && (!((p.radiusMeters as number) > 0) || (p.radiusMeters as number) > 10000))
        return false;
      if (
        p.kind === "noise" &&
        (!((p.wavelengthMeters as number) > 0) ||
          (p.octaves !== undefined &&
            (!Number.isInteger(p.octaves) || (p.octaves as number) < 1 || (p.octaves as number) > 8)))
      )
        return false;
      if (p.kind === "coarse" || p.kind === "correct")
        return (
          point(p.origin) &&
          Number.isInteger(p.columns) &&
          Number.isInteger(p.rows) &&
          (p.columns as number) >= 2 &&
          (p.rows as number) >= 2 &&
          (p.columns as number) * (p.rows as number) <= 65536 &&
          typeof p.spacingMeters === "number" &&
          (p.spacingMeters as number) > 0 &&
          Array.isArray(p.elevationsMeters) &&
          p.elevationsMeters.length === (p.columns as number) * (p.rows as number)
        );
      const fields: Record<string, string[]> = {
        offset: ["meters"],
        hill: ["center", "radiusMeters", "heightMeters"],
        dome: ["center", "radiusMeters", "heightMeters"],
        range: ["points", "radiusMeters", "heightMeters"],
        trough: ["points", "radiusMeters", "depthMeters"],
        pit: ["center", "radiusMeters", "depthMeters"],
        crag: ["center", "topRadiusMeters", "cliffRunMeters", "heightMeters"],
        spur: ["root", "tip", "topWidthMeters", "cliffRunMeters", "heightMeters", "gentleRunMeters"],
        scarp: ["origin", "downhill", "cliffRunMeters", "heightMeters", "gentleRunMeters"],
        noise: ["amplitudeMeters", "wavelengthMeters", "seed"],
        smooth: ["radiusMeters"],
        mask: ["dropMeters"]
      };
      return (
        (fields[p.kind as string] ?? []).every(
          k =>
            k in p &&
            (["center", "root", "tip", "origin", "downhill", "points"].includes(k) || typeof p[k] === "number")
        ) &&
        ["center", "root", "tip", "origin", "downhill"].every(k => p[k] === undefined || point(p[k])) &&
        (p.points === undefined ||
          (Array.isArray(p.points) && p.points.length >= 2 && p.points.length <= 512 && p.points.every(point)))
      );
    })
  );
}
export function validateVectorEnvironment(doc: VectorCityDocument): string[] {
  const appearanceErrors = Object.values(doc.placements)
    .filter(
      p =>
        p.appearance &&
        (!record(p.appearance) ||
          Object.keys(p.appearance).some(k => !["quality", "palette", "activity"].includes(k)) ||
          !["low", "high", "ultra"].includes(p.appearance.quality) ||
          (p.appearance.palette !== undefined && !isMarketPalette(p.appearance.palette)) ||
          (p.appearance.activity !== undefined && !["market-day", "closed"].includes(p.appearance.activity)))
    )
    .map(p => `appearance:${p.id}`);
  const e = doc.environment;
  if (!e) return appearanceErrors;
  if (
    !record(e) ||
    Object.keys(e).some(
      k =>
        ![
          "features",
          "defenses",
          "harbor",
          "ferries",
          "monasteries",
          "guilds",
          "landscape",
          "terrain",
          "hidden",
          "freeformSource"
        ].includes(k)
    ) ||
    !record(e.features) ||
    Object.keys(e.features).length > 256 ||
    !Array.isArray(e.hidden) ||
    e.hidden.some(id => typeof id !== "string" || !e.features[id])
  )
    return ["environment"];
  const errors: string[] = [
    ...appearanceErrors,
    ...validateVectorDefenses(doc),
    ...validateVectorHarbor(doc),
    ...validateVectorFerries(doc),
    ...validateVectorMonasteries(doc),
    ...validateVectorGuilds(doc),
    ...validateVectorLandscape(doc)
  ];
  if (e.freeformSource && !parseFreeformCity(JSON.stringify(e.freeformSource)))
    errors.push("environment-freeform-source");
  if (e.terrain) {
    const t = e.terrain;
    if (
      !parseFreeformCity(JSON.stringify(t)) ||
      !validRecipeParts(t.ground?.parts) ||
      !Number.isFinite(t.ground.seed) ||
      t.sculpt.some(
        s =>
          !Number.isFinite(s.radiusMeters) ||
          s.radiusMeters <= 0 ||
          s.radiusMeters > 10000 ||
          Math.abs(s.meters) > 10000
      ) ||
      t.frame.extentMeters !== doc.frame.extentMeters ||
      t.frame.extentMeters > 10000 ||
      t.ground.sampleMeters < 1 ||
      t.ground.parts.length > 256 ||
      t.sculpt.length > 256 ||
      t.plots.length > 10000 ||
      t.ways.length > 2048 ||
      t.rivers.length > 256
    )
      errors.push("environment-terrain");
  }
  for (const [id, f] of Object.entries(e.features))
    try {
      if (
        !f ||
        f.id !== id ||
        !/^feature:[A-Za-z0-9:._/-]{1,110}$/.test(id) ||
        Object.keys(f).some(
          k =>
            ![
              "id",
              "kind",
              "boundary",
              "access",
              "entrance",
              "connector",
              "waterAnchor",
              "pathIds",
              "placementIds",
              "pieces",
              "settings",
              "editPolicy"
            ].includes(k)
        ) ||
        !VECTOR_FEATURE_KINDS.includes(f.kind) ||
        !polygon(f.boundary) ||
        !point(f.entrance) ||
        !Array.isArray(f.connector) ||
        f.connector.length < 2 ||
        f.connector.length > 512 ||
        !f.connector.every(point) ||
        !["fixed", "editable"].includes(f.editPolicy)
      )
        throw Error();
      const access = evaluateAnchor(doc.paths[f.access.pathId], f.access);
      if (
        doc.paths[f.access.pathId].role !== "road" ||
        Math.hypot(access[0] - f.connector.at(-1)![0], access[1] - f.connector.at(-1)![1]) > 0.005 ||
        Math.hypot(f.entrance[0] - f.connector[0][0], f.entrance[1] - f.connector[0][1]) > 0.005
      )
        throw Error();
      if (
        !Array.isArray(f.pathIds) ||
        f.pathIds.some(id => !doc.paths[id]) ||
        !Array.isArray(f.placementIds) ||
        f.placementIds.some(id => !doc.placements[id])
      )
        throw Error();
      if (
        !f.settings ||
        Object.keys(f.settings).some(
          k => !["density", "heightMeters", "activity", "culture", "moatWidthMeters"].includes(k)
        ) ||
        !Number.isFinite(f.settings.density) ||
        f.settings.density < 0 ||
        f.settings.density > 1 ||
        !Number.isFinite(f.settings.heightMeters) ||
        f.settings.heightMeters < 1 ||
        f.settings.heightMeters > 60 ||
        !["market-day", "closed"].includes(f.settings.activity) ||
        !["stone", "timber"].includes(f.settings.culture) ||
        !Number.isFinite(f.settings.moatWidthMeters) ||
        f.settings.moatWidthMeters < 0 ||
        f.settings.moatWidthMeters > 20
      )
        throw Error();
      if (f.waterAnchor) {
        if (doc.paths[f.waterAnchor.pathId]?.role !== "river") throw Error();
        evaluateAnchor(doc.paths[f.waterAnchor.pathId], f.waterAnchor);
      }
      if (
        f.placementIds.some(id =>
          regionBoolean([doc.placements[id].site], [f.boundary], "difference").some(p => regionArea(p) > 1e-5)
        )
      )
        throw Error();
      if (
        f.editPolicy === "fixed" &&
        (f.pathIds.some(id => doc.paths[id].editPolicy !== "fixed") ||
          f.placementIds.some(id => doc.placements[id].editPolicy !== "fixed"))
      )
        throw Error();
      if (f.kind === "harbor" && !f.waterAnchor) throw Error();
      if (
        f.kind === "bastion" &&
        historicalPeriodIndex(doc.context.historicalPeriod) < historicalPeriodIndex("ageOfExploration")
      )
        throw Error();
      const foreignWater = allVectorWater({
        ...doc,
        paths: Object.fromEntries(Object.entries(doc.paths).filter(([id]) => !f.pathIds.includes(id)))
      });
      if (regionBoolean([f.boundary], foreignWater, "intersection").some(p => regionArea(p) > 1e-5)) throw Error();
      if (
        f.kind === "harbor" &&
        f.pieces
          .filter(p => p.role === "ship")
          .some(p => regionBoolean([p.polygon], foreignWater, "difference").some(p => regionArea(p) > 1e-5))
      )
        throw Error();
      if (
        !Array.isArray(f.pieces) ||
        f.pieces.length > 1024 ||
        !f.pieces.every(
          p =>
            p &&
            typeof p.id === "string" &&
            p.id.length < 160 &&
            ["ground", "structure", "vegetation", "quay", "ship", "cargo", "stall"].includes(p.role) &&
            polygon(p.polygon) &&
            Number.isFinite(p.heightMeters) &&
            p.heightMeters >= 0 &&
            p.heightMeters <= 100 &&
            /^#[0-9a-f]{6}$/i.test(p.color) &&
            Object.keys(p).every(k => ["id", "role", "polygon", "heightMeters", "color"].includes(k))
        )
      )
        throw Error();
      if (
        f.kind !== "harbor" &&
        f.pieces.some(p => regionBoolean([p.polygon], [f.boundary], "difference").some(r => regionArea(r) > 1e-5))
      )
        throw Error();
      if (
        !containsRegion([f.boundary], f.entrance) &&
        !f.boundary.outer.some(p => Math.hypot(p[0] - f.entrance[0], p[1] - f.entrance[1]) < 0.005)
      ) {
        // Entrances may lie on an edge, whose boundary convention is implementation dependent.
        if (
          regionBoolean(
            [
              {
                outer: [
                  [f.entrance[0] - 0.001, f.entrance[1] - 0.001],
                  [f.entrance[0] + 0.001, f.entrance[1] - 0.001],
                  [f.entrance[0] + 0.001, f.entrance[1] + 0.001],
                  [f.entrance[0] - 0.001, f.entrance[1] + 0.001]
                ],
                holes: []
              }
            ],
            [f.boundary],
            "intersection"
          ).length === 0
        )
          throw Error();
      }
    } catch {
      errors.push(`feature:${id}`);
    }
  return errors;
}
