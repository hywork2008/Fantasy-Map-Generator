import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { DEDICATED_TANNERY } from "../../../../buildings/medieval/dedicatedTanneryProfile";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import { defaultGenerationSettings } from "../../generation/settings";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "../../geom";
import { buildPopulationFacilityRequests } from "../../populationFacilityRequests";
import { defaultPopulationSettings } from "../../populationPlan";
import { riverFlowsFromDescriptor } from "../../riverFlow";
import { unpackPoints } from "../fabric/pack";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { allVectorWater } from "../geometry/water";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { vectorApproachBands } from "./suburbs";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

const FIXTURES = process.env.CE_TANNERY_CASES?.split(",") ??
  null ?? [
    "synthetic-open-5000",
    "synthetic-walls-5000",
    "synthetic-open-20000",
    "gothengsfeld-20261012",
    "kakati-20261009",
    "hiros-20261010",
    "gondre-20261009",
    "obern-20261027",
    "yayaropuz-20261009",
    "myosiasos-20261007",
    "archiagu-20261010"
  ];
const CASES = FIXTURES.map(f => [f, 0] as const);
const SEEDS = ["fixture"];

async function town(name: string) {
  const settings = {
    ...defaultGenerationSettings(),
    facilityLayout: "population" as const
  };
  let seed = name,
    population: number,
    frame = { extentMeters: 1600, cityRadiusMeters: 396, blockSizeMeters: 50 };
  if (name.startsWith("synthetic")) {
    // synthetic-<walls|open>-<population>[-<river shape>]
    const [, walls, pop, shape] = name.split("-");
    population = Number(pop);
    settings.config = {
      ...settings.config,
      rivers: [(shape ?? "through") as "through"],
      features: {
        ...settings.config.features,
        walls: walls === "walls",
        shanty: false,
        port: false
      }
    };
    const r = 396 * Math.sqrt(population / 5000);
    frame = {
      extentMeters: Math.round(r * 4),
      cityRadiusMeters: r,
      blockSizeMeters: 50
    };
  } else {
    const raw = (await import(`../../../data/fixtures/${name}.json`)).default as { descriptor?: unknown };
    const d = structuredClone(raw.descriptor ?? raw) as BurgSiteDescriptor;
    d.burg.shanty = false;
    settings.descriptor = d;
    seed = d.burg.seed ?? name;
    population = d.burg.population;
    frame = {
      extentMeters: d.frame.extentMeters,
      cityRadiusMeters: d.frame.cityRadiusMeters,
      blockSizeMeters: 50
    };
  }
  settings.population = defaultPopulationSettings(population);
  const input = vectorInputFromEditor({
    settings,
    seed,
    frame,
    lotOccupancy: 1
  });
  input.context.targetPopulation = population;
  const wall = vectorWallChoice(
    settings,
    seed,
    input.context.historicalPeriod ?? "ageOfExploration",
    frame.extentMeters
  );
  const skeleton = generateVectorSkeleton(input, {
    ...DEFAULT_VECTOR_GENERATION,
    seed,
    ...wall
  }).document;
  return {
    doc: generateVectorUrban(skeleton, {
      ...DEFAULT_VECTOR_URBAN,
      mode: "medieval-facilities",
      population,
      lotOccupancy: 1
    }),
    population
  };
}

const edgeDist = (doc: VectorCityDocument, p: Point) => {
  let d = Infinity;
  for (const w of allVectorWater(doc))
    for (const ring of [w.outer, ...w.holes])
      for (let i = 0; i < ring.length; i++)
        d = Math.min(d, pointSegmentDistance(p, ring[i], ring[(i + 1) % ring.length]));
  return d;
};
const inWater = (doc: VectorCityDocument, p: Point) =>
  allVectorWater(doc).some(w => pointInPolygon(p, w.outer) && !w.holes.some(h => pointInPolygon(p, h)));

/** Tanners' row plan T0 (docs/plan/ce-meshless-tanners-row.md): where facility mode puts the tanneries today.
 * CE_TANNERY_T0_OUT=docs/analytics/ce-meshless-tanners-row-t0-20261112.json npx vitest run <this file> */
const output = process.env.CE_TANNERY_T0_OUT;
it.runIf(!!output)(
  "T0: tannery placement observation",
  async () => {
    const rows: Record<string, unknown>[] = [];
    for (const [shape] of CASES)
      for (const seed of SEEDS) {
        const t = performance.now();
        let doc: VectorCityDocument,
          population = 0;
        try {
          const made = await town(shape);
          doc = made.doc;
          population = made.population;
        } catch (e) {
          rows.push({ case: shape, seed, error: String(e).slice(0, 200) });
          console.log(JSON.stringify(rows.at(-1)));
          continue;
        }
        // Downstream courses: an FMG town's from its descriptor (its river paths are only crossing witnesses), with any
        // leat; other towns' drawn rivers.
        const descriptor = doc.site?.descriptor;
        const rivers = [
          ...(descriptor ? riverFlowsFromDescriptor(descriptor).map(f => f.points) : []),
          ...Object.values(doc.paths)
            .filter(p => p.role === "river" && !p.id.includes("moat") && !(descriptor && p.id.startsWith("fmg-river:")))
            .map(p => samplePath(p).map(s => s.point))
        ];
        const wallPath = Object.values(doc.paths).find(p => p.role === "wall" && !p.id.includes("inner"));
        const ring = wallPath ? samplePath(wallPath).map(s => s.point) : [];
        const report = doc.urban!.report as unknown as Record<string, number>;
        const tanneries = Object.values(doc.placements).filter(p => p.modelId.includes("dedicated-wet-tannery"));
        // Arc length along a river polyline at its nearest point.
        const along = (poly: Point[], p: Point) => {
          const h = nearestOnPolyline(p, poly),
            k = h.segIndex;
          let s = 0;
          for (let i = 0; i < k; i++) s += Math.hypot(poly[i + 1][0] - poly[i][0], poly[i + 1][1] - poly[i][1]);
          return s + h.t * Math.hypot(poly[k + 1][0] - poly[k][0], poly[k + 1][1] - poly[k][1]);
        };
        const per = tanneries.map(p => {
          const a = (p.facingDegrees * Math.PI) / 180,
            c = Math.cos(a),
            s = Math.sin(a),
            // A BV model's plan frame is (x, -z) (bvFacilityAsset); a mirrored placement flips x.
            world = ([x0, z]: number[]): Point => {
              const x = p.mirrored ? -x0 : x0,
                y = -z;
              return [x * c - y * s + p.position[0], x * s + y * c + p.position[1]];
            };
          const intake = world(DEDICATED_TANNERY.waterPorts[0].position.filter((_, i) => i !== 1)),
            effluent = world(DEDICATED_TANNERY.waterPorts[1].position.filter((_, i) => i !== 1)),
            backMid: Point = [(intake[0] + effluent[0]) / 2, (intake[1] + effluent[1]) / 2],
            center = polygonCentroid(p.site.outer),
            back: Point = [backMid[0] - center[0], backMid[1] - center[1]],
            bl = Math.hypot(...back);
          // Nearest river and the direction from the site's centre to it.
          const river = rivers
            .map(r => ({
              r,
              h: nearestOnPolyline(center, r) as unknown as {
                dist: number;
                point?: Point;
                x?: number;
              }
            }))
            .sort((x, y) => x.h.dist - y.h.dist)[0];
          // The nearest point of the water's edge (a drawn centreline can lie off its surveyed water).
          let hit: Point = center,
            near = Infinity;
          for (const w of allVectorWater(doc))
            for (const ring of [w.outer, ...w.holes])
              for (let i = 0; i < ring.length; i++) {
                const q = nearestOnPolyline(center, [ring[i], ring[(i + 1) % ring.length]]);
                if (q.dist < near) {
                  near = q.dist;
                  hit = q.point;
                }
              }
          const toRiver: Point = [hit[0] - center[0], hit[1] - center[1]],
            tl = Math.hypot(...toRiver),
            backCos = (back[0] * toRiver[0] + back[1] * toRiver[1]) / (bl * tl);
          const portGap = Math.max(
            inWater(doc, intake) ? 0 : edgeDist(doc, intake),
            inWater(doc, effluent) ? 0 : edgeDist(doc, effluent)
          );
          const flowOk = along(river.r, effluent) > along(river.r, intake);
          // Downstream of the town: beyond the last point of the river inside the wall.
          const last = ring.length ? river.r.reduce((k, q, i) => (pointInPolygon(q, ring) ? i : k), -1) : -1;
          const downstream = last >= 0 && along(river.r, center) > along(river.r, river.r[last]);
          return {
            siteDistance: p.building?.riverbankDistanceMeters ?? null,
            portGap: Math.round(portGap * 10) / 10,
            backCos: Math.round(backCos * 100) / 100,
            flowOk,
            downstream,
            belowCenter: along(river.r, center) > along(river.r, [0, 0]),
            center: center.map(v => Math.round(v)) as Point
          };
        });
        // Groups of tanneries whose site centres lie within 22 m (one frontage plus a party wall's slack).
        const parent = per.map((_, i) => i),
          find = (i: number): number => {
            while (parent[i] !== i) i = parent[i];
            return i;
          };
        for (let i = 0; i < per.length; i++)
          for (let j = i + 1; j < per.length; j++)
            if (Math.hypot(per[i].center[0] - per[j].center[0], per[i].center[1] - per[j].center[1]) < 22)
              parent[find(i)] = find(j);
        const groups = new Set(per.map((_, i) => find(i))).size;
        const period = doc.context.historicalPeriod ?? "ageOfExploration";
        const requested = buildPopulationFacilityRequests(population, {
          period,
          port: false
        }).requests.filter(r => r.id.includes(":tanning:")).length;
        rows.push({
          case: shape,
          seed,
          ms: Math.round(performance.now() - t),
          requiredFacilities: report.requiredFacilities,
          placedFacilities: report.placedFacilities,
          period,
          tanneryRequests: requested,
          rivers: rivers.length,
          bands: vectorApproachBands(doc).bands.map(b => {
            const run = rivers[0] ?? [];
            const last = run.reduce((k, q, i) => (ring.length && pointInPolygon(q, ring) ? i : k), -1);
            const down = last >= 0 ? run.slice(last + 1) : [];
            return {
              profile: b.profile,
              toRiverDown:
                down.length > 1 ? Math.round(Math.min(...b.points.map(q => nearestOnPolyline(q, down).dist))) : null,
              toRiverAny: run.length ? Math.round(Math.min(...b.points.map(q => nearestOnPolyline(q, run).dist))) : null
            };
          }),
          outsideCellWaterMin: Math.round(
            Math.min(
              ...Object.values(doc.fabric?.cells ?? {})
                .filter(c => !c.inside)
                .map(c =>
                  Math.min(...unpackPoints(c.ring, c.origin).map(q => (inWater(doc, q) ? 0 : edgeDist(doc, q))))
                )
            )
          ),
          outsideCells: Object.values(doc.fabric?.cells ?? {}).filter(c => !c.inside).length,
          tanneryUnplaced: (doc.urban!.report.unplacedFacilities ?? [])
            .filter(u => u.id.includes(":tanning:"))
            .reduce((m: Record<string, number>, u) => ({ ...m, [u.reason]: (m[u.reason] ?? 0) + 1 }), {}),
          tanneries: per.length,
          bankRow: per.filter(r => r.portGap <= 3.5).length,
          bankRowBackToWater: per.filter(r => r.portGap <= 3.5 && r.backCos >= Math.SQRT1_2).length,
          belowCenter: per.filter(r => r.belowCenter).length,
          backFacesRiver: per.filter(r => r.backCos >= Math.SQRT1_2).length,
          flowOk: per.filter(r => r.flowOk).length,
          downstream: per.filter(r => r.downstream).length,
          groups,
          portGapMax: per.length ? Math.max(...per.map(r => r.portGap)) : null,
          detail: per
        });
        console.log(JSON.stringify({ ...rows.at(-1), detail: undefined }));
      }
    writeFileSync(output!, `${JSON.stringify(rows, null, 1)}\n`);
  },
  3_600_000
);
