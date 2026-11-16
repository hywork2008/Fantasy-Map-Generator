import { describe, expect, it } from "vitest";
import goth from "../../../data/fixtures/gothengsfeld-20261012.json";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { cellHouseCount } from "../fabric/pack";
import { vectorInputFromEditor } from "./editorInput";
import { vectorInputFromDescriptor } from "./input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { streetBlockOf } from "./wards";

describe("economic wards by the mesh editor's ward mix (feature parity P6g)", () => {
  it("gives the town's districts the mix, and patricians and merchants build higher than craftsmen", () => {
    const settings = {
        ...defaultGenerationSettings(),
        population: defaultPopulationSettings(3000),
        historicalPeriod: "lateMedieval" as const,
        buildingPattern: "medieval" as const
      },
      seed = "p6g-wards",
      input = vectorInputFromEditor({
        settings,
        seed,
        frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 },
        lotOccupancy: 1
      }),
      doc = generateVectorUrban(
        generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall: "ellipse" }).document,
        { ...DEFAULT_VECTOR_URBAN, population: 3000, lotOccupancy: 1 }
      ),
      districts = doc.urban!.districts;
    // Inside the wall every district takes a ward; outside only the shanty (on by default) does.
    expect(districts.filter(d => d.inside).every(d => d.ward)).toBe(true);
    expect(districts.filter(d => !d.inside).every(d => d.ward === undefined || d.ward === "shanty")).toBe(true);
    const kinds = new Set(districts.map(d => d.ward));
    for (const k of ["craftsmen", "patriciate", "market", "slum"]) expect(kinds).toContain(k);
    const mean = (wards: string[]) => {
      const blocks = new Set(districts.filter(d => wards.includes(d.ward ?? "")).map(d => streetBlockOf(d.id))),
        storeys = [...blocks].flatMap(id => {
          const c = doc.fabric!.cells[id];
          return c ? c.houses.storeys.slice(0, cellHouseCount(c)) : [];
        });
      return storeys.reduce((n, s) => n + s, 0) / storeys.length;
    };
    expect(mean(["patriciate", "merchant", "market"])).toBeGreaterThan(mean(["craftsmen"]));
    expect(doc.urban!.report.unplacedPopulation).toBe(0);
  });

  it("follows the FMG economy's guild trades for the craftsman streets", () => {
    const d = structuredClone(goth.descriptor) as unknown as BurgSiteDescriptor,
      domains = new Set(d.economy!.guilds.filter(g => g.practitioners > 0).map(g => g.domain)),
      skeleton = generateVectorSkeleton(vectorInputFromDescriptor(d), {
        ...DEFAULT_VECTOR_GENERATION,
        seed: "p"
      }).document,
      city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: d.burg.population }),
      crafts = city.urban!.districts.filter(x => x.ward === "craftsmen");
    expect(crafts.length).toBeGreaterThan(0);
    for (const x of crafts) expect(domains).toContain(x.craftDomain);
  });

  it("builds the extramural shanty on 3-6 street blocks beyond the wall when asked (P6h)", () => {
    const build = (shanty: boolean) => {
      const base = defaultGenerationSettings(),
        settings = {
          ...base,
          config: { ...base.config, features: { ...base.config.features, walls: true, shanty } },
          population: defaultPopulationSettings(3000),
          historicalPeriod: "lateMedieval" as const,
          buildingPattern: "medieval" as const
        },
        seed = "p6h-shanty",
        input = vectorInputFromEditor({
          settings,
          seed,
          frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 },
          lotOccupancy: 1
        });
      return generateVectorUrban(
        generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall: "ellipse" }).document,
        { ...DEFAULT_VECTOR_URBAN, population: 3000, lotOccupancy: 1 }
      );
    };
    const off = build(false);
    expect(off.urban!.districts.some(d => d.ward === "shanty")).toBe(false);
    const doc = build(true),
      blocks = new Set(doc.urban!.districts.filter(d => d.ward === "shanty").map(d => streetBlockOf(d.id)));
    // The faubourg is land of its own: the town's street blocks inside the wall stay as they were.
    const insideIds = (d: typeof doc) =>
      d
        .urban!.districts.filter(x => x.inside)
        .map(x => x.id)
        .sort();
    expect(insideIds(doc)).toEqual(insideIds(off));
    expect(blocks.size).toBeGreaterThanOrEqual(3);
    expect(blocks.size).toBeLessThanOrEqual(6);
    for (const id of blocks) {
      const c = doc.fabric!.cells[id];
      expect(c && !c.inside).toBe(true);
      // Built up whatever the demand.
      expect(cellHouseCount(c)).toBeGreaterThan(0);
    }
    expect(doc.urban!.report.unplacedPopulation).toBe(0);
  });
});
