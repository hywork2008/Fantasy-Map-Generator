import { readFileSync, writeFileSync } from "node:fs";
import { describe, it, vi } from "vitest";
import { getUrbanDwellings } from "../../../../utils/urbanDwellings";
import { createGridDocument } from "../../../generators/document";
import { defaultGenerationSettings } from "../../../generators/generation/settings";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "../../../generators/geom";
import { defaultPopulationSettings } from "../../../generators/populationPlan";
import { cellHouseRing, unpackLine, unpackPoints } from "../../../generators/vector/fabric/pack";
import { vectorInputFromEditor } from "../../../generators/vector/generation/editorInput";
import { expectedVectorHouseStoreys } from "../../../generators/vector/generation/housingHeights";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../../generators/vector/generation/pipeline";
import { vectorApproachBands } from "../../../generators/vector/generation/suburbs";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../../generators/vector/generation/urban";
import { meshlessCityRadius } from "../../../generators/vector/generation/urbanSizing";
import { vectorWallChoice } from "../../../generators/vector/generation/wallShape";
import { streetBlockOf } from "../../../generators/vector/generation/wards";
import { pathIsClosed } from "../../../generators/vector/geometry/curves";
import { regionArea, regionBoolean } from "../../../generators/vector/geometry/regions";
import { samplePath } from "../../../generators/vector/geometry/sampling";
import type { WallShape } from "../../../types/generationSettings";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";

/**
 * Gate-ribbon plan W0 (docs/plan/ce-meshless-gate-ribbon-growth.md): what lies between the round site and a
 * non-round wall today, what the town would lack without it, and how many dwellings a fully built roadside strip
 * holds per metre of road. Opt-in: runs only with CE_GATE_RIBBON_OUT.
 *
 * Modes swap the lot test beyond the wall: `current` keeps it, `inside` refuses every lot outside the wall (the
 * town as W1 would leave it, before any ribbon), `full` keeps every lot (calibration of a built-up strip). `insidePotential` builds every lot inside the wall (four times
 * the population, nothing beyond the wall).
 */
type Mode = "current" | "inside" | "full";
const mode: { value: Mode } = vi.hoisted(() => ({ value: "current" as Mode }));
vi.mock("../../../generators/vector/generation/suburbs", async original => {
  const real = await original<typeof import("../../../generators/vector/generation/suburbs")>();
  const outerRing = (doc: VectorCityDocument) => {
    const wall = Object.values(doc.paths).find(p => p.role === "wall" && pathIsClosed(p) && !p.id.includes("inner"));
    return wall ? samplePath(wall).map(s => s.point) : undefined;
  };
  return {
    ...real,
    vectorSuburbanLots: (doc: VectorCityDocument, suburb: (id: string) => boolean) => {
      if (mode.value === "full") return () => true;
      if (mode.value === "current") return real.vectorSuburbanLots(doc, suburb);
      const ring = outerRing(doc);
      return (_id: string, polygon: Point[]) => !ring || pointInPolygon(polygonCentroid(polygon), ring);
    }
  };
});

const output = process.env.CE_GATE_RIBBON_OUT;
const SHAPES: WallShape[] = ["round", "oval", "organic", "polygon", "square", "bastioned"];
const POPULATIONS = [1000, 5000, 20000];
/** A street block this close to an approach band beyond its glacis is roadside ribbon. */
const RIBBON_REACH_METERS = 32;

const lineLength = (line: Point[]) =>
  line.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - line[i][0], p[1] - line[i][1]), 0);

/** The bastions of a bastioned outline: five vertices round each salient (shoulder, flank, salient, flank, shoulder),
 * closed by the gorge between the two shoulders. Salients are the `sides` farthest local maxima from the centre. */
function bastionsOf(doc: VectorCityDocument, sides: number): Point[][] {
  const wall = Object.values(doc.paths).find(p => p.role === "wall" && pathIsClosed(p) && !p.id.includes("inner"));
  if (wall?.source.kind !== "curve") return [];
  const v = wall.source.segments.map(s => s.from),
    n = v.length,
    c = doc.site!.center,
    r = v.map(p => Math.hypot(p[0] - c[0], p[1] - c[1]));
  const salients = v
    .map((_, i) => i)
    .filter(i => r[i] > r[(i + 1) % n] && r[i] > r[(i + n - 1) % n])
    .sort((a, b) => r[b] - r[a])
    .slice(0, sides);
  return salients.map(i => [-2, -1, 0, 1, 2].map(k => v[(i + k + n) % n]));
}

function measure(doc: VectorCityDocument, inputArea: number, sides?: number) {
  const wall = Object.values(doc.paths).find(p => p.role === "wall" && pathIsClosed(p) && !p.id.includes("inner"));
  const ring = wall ? samplePath(wall).map(s => s.point) : undefined;
  const urban = doc.urban!;
  const { bands } = vectorApproachBands(doc);
  const shanty = new Set(urban.districts.filter(d => d.ward === "shanty").map(d => streetBlockOf(d.id)));
  const kindOf = (centroid: Point, id: string): "inside" | "shanty" | "ribbon" | "ring" => {
    if (!ring || pointInPolygon(centroid, ring)) return "inside";
    if (shanty.has(id)) return "shanty";
    for (const band of bands) {
      const hit = nearestOnPolyline(centroid, band.points);
      const gate = Math.hypot(centroid[0] - band.points[0][0], centroid[1] - band.points[0][1]);
      if (hit.dist <= RIBBON_REACH_METERS && gate >= band.clearance * 0.8) return "ribbon";
    }
    return "ring";
  };
  const empty = () => ({ cells: 0, areaM2: 0, laneMeters: 0, houses: 0, dwellings: 0 });
  const by = { inside: empty(), shanty: empty(), ribbon: empty(), ring: empty() };
  for (const cell of Object.values(doc.fabric?.cells ?? {})) {
    const outline = unpackPoints(cell.ring, cell.origin);
    const row = by[kindOf(polygonCentroid(outline), cell.id)];
    row.cells++;
    row.areaM2 += Math.abs(polygonArea(outline));
    for (let i = 0; i < cell.lanes.widths.length; i++)
      row.laneMeters += lineLength(unpackLine(cell.lanes, i, cell.origin));
    for (let i = 0; i < cell.houses.offsets.length; i++) {
      if (cell.detached.includes(i)) continue;
      row.houses++;
      row.dwellings += cell.houses.dwellings[i];
    }
  }
  // Houses on the bastions' terrepleins, the gun platforms (bastioned outlines only).
  const bastions = sides ? bastionsOf(doc, sides) : [];
  const onBastions = { bastions: bastions.length, areaM2: 0, houses: 0, dwellings: 0 };
  for (const b of bastions) onBastions.areaM2 += Math.abs(polygonArea(b));
  if (bastions.length)
    for (const cell of Object.values(doc.fabric?.cells ?? {}))
      for (let i = 0; i < cell.houses.offsets.length; i++) {
        if (cell.detached.includes(i)) continue;
        const centre = polygonCentroid(cellHouseRing(cell, i));
        if (!bastions.some(b => pointInPolygon(centre, b))) continue;
        onBastions.houses++;
        onBastions.dwellings += cell.houses.dwellings[i];
      }
  let streetsOutside = 0;
  for (const district of Object.values(doc.fabric?.districts ?? {}))
    for (let i = 0; i < district.streets.widths.length; i++) {
      const line = unpackLine(district.streets, i, district.origin);
      const mid = line[Math.floor(line.length / 2)];
      if (ring && !pointInPolygon(mid, ring)) streetsOutside += lineLength(line);
    }
  const wallArea = ring ? Math.abs(polygonArea(ring)) : 0;
  const domainOutside = ring
    ? regionBoolean(doc.site!.domain, [{ outer: ring, holes: [] }], "difference").reduce((n, r) => n + regionArea(r), 0)
    : 0;
  const round = (x: number) => Math.round(x);
  const rows = Object.fromEntries(
    Object.entries(by).map(([k, v]) => [k, { ...v, areaM2: round(v.areaM2), laneMeters: round(v.laneMeters) }])
  );
  return {
    inputDomainM2: round(inputArea),
    wallInteriorM2: round(wallArea),
    wallShareOfInput: inputArea ? Number((wallArea / inputArea).toFixed(3)) : null,
    domainOutsideWallM2: round(domainOutside),
    districtStreetMetersOutside: round(streetsOutside),
    bands: bands.map(b => ({ id: b.groupId, profile: b.profile, clearance: b.clearance, length: round(b.length) })),
    fabric: rows,
    ...(bastions.length ? { bastions: { ...onBastions, areaM2: round(onBastions.areaM2) } } : {}),
    report: {
      required: urban.report.requiredDwellings,
      capacityInside: urban.report.capacityInside,
      capacityOutside: urban.report.capacityOutside,
      unplacedDwellings: urban.report.unplacedDwellings,
      reasons: urban.report.reasons
    },
    diagnostics: doc.generation?.diagnostics.map(d => d.code) ?? []
  };
}

describe.runIf(!!output)("gate ribbon W0 observation", () => {
  it("measures the ring beyond the wall and the roadside strips", () => {
    const grid = createGridDocument({ size: "small", grid: "voronoi" });
    const cases: { shape: WallShape; population: number; rivers?: string[]; coast?: string; fixture?: string }[] = [
      // FMG burgs with walls and an urban-morphology profile, where every lot beyond the wall is kept today.
      ...["amerford-20261027", "rombornit-20261031"].map(fixture => ({
        shape: "organic" as WallShape,
        population: 0,
        fixture
      })),
      ...SHAPES.flatMap(shape => POPULATIONS.map(population => ({ shape, population }))),
      // Water takes land the round site was planned on; a coast also leaves the native sizing (no wall scale).
      ...(["polygon", "square"] as WallShape[]).flatMap(shape =>
        [5000, 20000].flatMap(population => [
          { shape, population, rivers: ["through"] },
          { shape, population, coast: "bay" }
        ])
      )
    ];
    const rows = cases.map(({ shape, population, rivers, coast, fixture }) => {
      let seed = `w0-${shape}-${population}${rivers ? "-river" : ""}${coast ? `-${coast}` : ""}`;
      const settings = defaultGenerationSettings();
      if (fixture) {
        const data = JSON.parse(readFileSync(`src/city-editor/data/fixtures/${fixture}.json`, "utf8"));
        Object.assign(settings, structuredClone(data.settings), { descriptor: data.descriptor });
        population = data.descriptor.burg.population;
        seed = `w0-${fixture}`;
      } else {
        settings.config = {
          ...settings.config,
          rivers: (rivers ?? []) as typeof settings.config.rivers,
          coast: (coast ?? "none") as typeof settings.config.coast,
          features: { ...settings.config.features, walls: true, port: false, shanty: false }
        };
        settings.wallShape = shape;
        settings.population = defaultPopulationSettings(population);
      }
      const started = performance.now();
      try {
        const input = vectorInputFromEditor({ seed, settings, frame: grid.frame, lotOccupancy: 1 });
        input.context.targetPopulation = population;
        const inputArea = input.site!.domain.reduce((n, r) => n + regionArea(r), 0);
        const wall = vectorWallChoice(settings, seed, input.context.historicalPeriod, grid.frame.extentMeters);
        const skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document;
        const result: Record<string, unknown> = { wall: wall.wall, wallSides: wall.wallSides };
        for (const m of ["current", "inside", "full"] as Mode[]) {
          mode.value = m;
          const doc = generateVectorUrban(structuredClone(skeleton), {
            ...DEFAULT_VECTOR_URBAN,
            population,
            lotOccupancy: 1
          });
          result[m] = measure(doc, inputArea, wall.wall === "bastioned" ? wall.wallSides : undefined);
        }
        // Every lot inside the wall: the same skeleton asked to house four times the town, nothing beyond the wall.
        mode.value = "inside";
        const potential = generateVectorUrban(structuredClone(skeleton), {
          ...DEFAULT_VECTOR_URBAN,
          population: population * 4,
          lotOccupancy: 1
        });
        result.insidePotential = measure(potential, inputArea, wall.wall === "bastioned" ? wall.wallSides : undefined);
        mode.value = "current";
        return { seed, shape, population, rivers, coast, ms: Math.round(performance.now() - started), ...result };
      } catch (error) {
        mode.value = "current";
        return { seed, shape, population, error: error instanceof Error ? error.message : String(error) };
      }
    });
    writeFileSync(
      output!,
      `${JSON.stringify(
        {
          format: "ce-meshless-gate-ribbon-w0",
          version: 1,
          measuredAtUtc: new Date().toISOString(),
          scope:
            "Standalone sites (native unless a coast is set), no river or coast unless stated, lot occupancy 1, default period. Fabric street blocks classified by centroid: inside the outer wall, shanty ward, roadside ribbon (within 32 m of an approach band beyond 0.8 of its glacis), or ring (the rest beyond the wall). Modes: current lot test; inside = no lot beyond the wall; full = every lot beyond the wall kept.",
          rows
        },
        null,
        2
      )}\n`
    );
  }, 3600000);
});

const calibration = process.env.CE_GATE_RIBBON_CALIBRATE;
/** Sizing calibration (plan §3.6): round walled towns of many sizes, every lot inside the wall built. Each row is the
 * housing radius the sizing asked for (`meshlessCityRadius` without reserved land) and the dwellings per storey the
 * interior actually holds. */
describe.runIf(!!calibration)("gate ribbon sizing calibration", () => {
  it("measures interior dwellings per storey by housing radius", () => {
    const grid = createGridDocument({ size: "small", grid: "voronoi" });
    const rows = [100, 200, 350, 500, 750, 1000, 1500, 2000, 3000, 5000, 8000, 12000, 20000, 30000].flatMap(
      population =>
        ["a", "b"].map(variant => {
          const seed = `w1a-${population}-${variant}`;
          const settings = defaultGenerationSettings();
          settings.config = {
            ...settings.config,
            rivers: [],
            coast: "none",
            features: { ...settings.config.features, walls: true, port: false, shanty: false }
          };
          settings.wallShape = "round";
          settings.population = defaultPopulationSettings(population);
          try {
            const input = vectorInputFromEditor({ seed, settings, frame: grid.frame, lotOccupancy: 1 });
            const period = input.context.historicalPeriod ?? "ageOfExploration";
            const storeys = expectedVectorHouseStoreys(period, settings, undefined);
            const required = getUrbanDwellings(population);
            const wall = vectorWallChoice(settings, seed, period, grid.frame.extentMeters);
            const skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document;
            mode.value = "inside";
            const doc = generateVectorUrban(structuredClone(skeleton), {
              ...DEFAULT_VECTOR_URBAN,
              population: population * 4,
              lotOccupancy: 1
            });
            mode.value = "current";
            const potential = doc.urban!.report.capacityInside;
            return {
              seed,
              population,
              required,
              storeys,
              housingRadius: Number(meshlessCityRadius(required, storeys, 1, 0).toFixed(2)),
              potential,
              perStorey: Number((potential / storeys).toFixed(2)),
              fill: Number((required / potential).toFixed(3))
            };
          } catch (error) {
            mode.value = "current";
            return { seed, population, error: error instanceof Error ? error.message : String(error) };
          }
        })
    );
    writeFileSync(
      calibration!,
      `${JSON.stringify({ format: "ce-meshless-sizing-calibration", version: 1, rows }, null, 2)}\n`
    );
  }, 3600000);
});
