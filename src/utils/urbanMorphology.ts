import type { UrbanMorphologyProfile } from "../types/urbanMorphology";
import { getUrbanDwellings } from "./urbanDwellings";

export const clampGrowth = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export function growthHash(text: string): string {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
  return n.toString(16);
}
export function growthRandom(seed: string): number {
  return Number.parseInt(growthHash(seed), 16) / 0x100000000;
}
export function supportsUrbanMorphology(period: string): boolean {
  return [
    "classicalAntiquity",
    "earlyMedieval",
    "highMedieval",
    "lateMedieval",
    "ageOfExploration",
    "maritimeEra",
    "preIndustrialEra"
  ].includes(period);
}
export function residentialStoreys(period: string): { standard: number; maximum: number } {
  if (["classicalAntiquity", "earlyMedieval", "highMedieval"].includes(period)) return { standard: 2, maximum: 3 };
  if (period === "lateMedieval") return { standard: 3, maximum: 4 };
  return { standard: 3, maximum: 5 };
}
export const relationDefense = (relation?: string): number =>
  ({ Enemy: 1, Rival: 0.6, Suspicion: 0.3, Neutral: 0.15, Unknown: 0.15 })[relation ?? "Unknown"] ?? 0;
export const relationAccess = (relation?: string): number =>
  ({ Enemy: 0.25, Rival: 0.55, Suspicion: 0.65, Neutral: 0.8, Unknown: 0.8 })[relation ?? "Unknown"] ?? 1;

export function createUrbanMorphology(input: {
  seed: string;
  burgId: number;
  year: number;
  population: number;
  capital: boolean;
  walls: boolean;
  polityAge: number | null;
  generationYears: number;
  polityPower: number;
  defensePressure: number;
  period: string;
  foundedYear?: number;
  foundedSource?: "explicit" | "observed";
  religious: boolean;
  extramuralBurial: boolean;
  plaza: boolean;
  waterfrontResolved?: boolean;
  growthRegime?: UrbanMorphologyProfile["growthRegime"];
}): UrbanMorphologyProfile {
  const seed = `${input.seed}:${input.burgId}:extramural-v1`;
  const E =
    input.polityAge && input.polityAge > 0
      ? input.polityAge
      : clampGrowth(Math.round(4 * input.generationYears), 40, 600);
  const age = clampGrowth(
    Math.round(E * ((input.capital ? 1 : 0.35) + (input.capital ? 0.8 : 1) * growthRandom(`${seed}:age`))),
    input.capital ? 60 : 20,
    3000
  );
  const foundedYear = input.foundedYear ?? input.year - age;
  const young = input.year - foundedYear < 60;
  const N = Math.max(0, input.population);
  const regimeRoll = growthRandom(`${seed}:regime`);
  const growthRegime =
    input.growthRegime ??
    (regimeRoll < 0.4 ? "steady" : regimeRoll < 0.7 ? "postExpansion" : regimeRoll < 0.9 ? "rapid" : "declining");
  const expansionPopulation = N * { steady: 0.76, postExpansion: 0.9, rapid: 0.65, declining: 1.2 }[growthRegime];
  const knots: UrbanMorphologyProfile["populationKnots"] = [];
  const add = (year: number, people: number, source: "estimated" | "observed") => {
    if (knots.some(k => k.year === year)) return;
    knots.push({ year, people: Math.round(people), source });
  };
  add(foundedYear, young ? N : Math.max(1, N * 0.04), "estimated");
  const firstYear = Math.round(foundedYear + (input.year - foundedYear) * 0.25);
  if (!young) add(firstYear, Math.max(1, N * 0.25), "estimated");
  const wallPhases: UrbanMorphologyProfile["wallPhases"] = [];
  const reserve = 1.1 + 0.25 * input.polityPower;
  const addWall = (year: number, people: number) =>
    wallPhases.push({
      id: `${seed}:wall:${wallPhases.length}`,
      year,
      source: "estimated",
      people: Math.round(people),
      targetDwellings: Math.ceil(getUrbanDwellings(people) * reserve),
      absorbedClusterIds: []
    });
  if (input.walls) {
    addWall(young ? foundedYear : firstYear, young ? N : N * 0.25);
    const preparation = Math.round(15 + 45 * (1 - input.polityPower));
    const expandYear = Math.round(foundedYear + (input.year - foundedYear) * 0.78);
    if (!young && N >= 5000 && expandYear - firstYear >= preparation) {
      add(expandYear, expansionPopulation, "estimated");
      addWall(expandYear, expansionPopulation);
    }
  }
  add(input.year, N, "observed");
  // The present value is always exact; tiny/young settlements may share a year with founding.
  const current = knots.find(k => k.year === input.year)!;
  current.people = N;
  current.source = "observed";
  const anchors: UrbanMorphologyProfile["anchors"] = [];
  const addAnchor = (kind: "religious" | "cemetery" | "fair", fraction: number) =>
    anchors.push({
      id: `${seed}:anchor:${kind}`,
      kind,
      year: Math.round(foundedYear + (input.year - foundedYear) * fraction),
      source: "estimated"
    });
  if (input.religious) addAnchor("religious", 0.5);
  if (input.extramuralBurial) addAnchor("cemetery", 0.86);
  if (input.plaza && N >= 5000) addAnchor("fair", 0.9);
  return {
    version: 1,
    modelVersion: "extramural-v1",
    seed,
    baselineYear: input.year,
    baselinePopulation: N,
    contextRevision: growthHash(JSON.stringify(input)),
    foundedYear,
    foundedSource: input.foundedSource ?? "estimated",
    polityAgeAtBaseline: E,
    polityPower: clampGrowth(input.polityPower),
    defensePressure: clampGrowth(input.defensePressure),
    period: input.period,
    waterfrontResolved: input.waterfrontResolved,
    growthRegime,
    populationKnots: knots.sort((a, b) => a.year - b.year),
    wallPhases,
    approaches: [],
    anchors
  };
}

export function inferredWallSettings(
  profile: UrbanMorphologyProfile,
  dwellings: number
): { townWallRings: "single" | "double"; walledAreaShare: number } {
  const phases = profile.wallPhases;
  return {
    townWallRings: phases.length > 1 ? "double" : "single",
    walledAreaShare:
      phases.length > 1
        ? clampGrowth(phases[0].targetDwellings / Math.max(phases.at(-1)!.targetDwellings, 1), 0.2, 0.7)
        : clampGrowth((phases[0]?.targetDwellings ?? dwellings) / Math.max(dwellings, 1), 0.65, 1)
  };
}

export function outsidePopulationCap(profile: UrbanMorphologyProfile, population: number): number {
  const lastWall = profile.wallPhases.at(-1)?.people ?? population;
  const growth = clampGrowth((population - lastWall) / Math.max(lastWall, 1));
  return clampGrowth(0.1 + 0.15 * growth - 0.1 * profile.defensePressure, 0.05, 0.25);
}

/** Untrusted archives / links must not smuggle invalid capacities or unordered history. */
export function validUrbanMorphology(value: unknown): value is UrbanMorphologyProfile {
  try {
    if (!value || typeof value !== "object") return false;
    const p = value as UrbanMorphologyProfile;
    const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
    const source = (s: unknown) => ["explicit", "observed", "estimated"].includes(String(s));
    const unit = (n: unknown) => finite(n) && n >= 0 && n <= 1;
    const ordered = (items: { year: number }[]) =>
      items.every((v, i) => finite(v.year) && (!i || v.year > items[i - 1].year));
    return (
      p.version === 1 &&
      p.modelVersion === "extramural-v1" &&
      typeof p.seed === "string" &&
      typeof p.contextRevision === "string" &&
      finite(p.baselineYear) &&
      finite(p.baselinePopulation) &&
      p.baselinePopulation >= 0 &&
      finite(p.foundedYear) &&
      p.foundedYear <= p.baselineYear &&
      source(p.foundedSource) &&
      finite(p.polityAgeAtBaseline) &&
      p.polityAgeAtBaseline > 0 &&
      unit(p.polityPower) &&
      unit(p.defensePressure) &&
      typeof p.period === "string" &&
      (p.waterfrontResolved === undefined || typeof p.waterfrontResolved === "boolean") &&
      (p.growthRegime === undefined || ["steady", "postExpansion", "rapid", "declining"].includes(p.growthRegime)) &&
      Array.isArray(p.populationKnots) &&
      p.populationKnots.length > 0 &&
      p.populationKnots.some(k => k.year === p.baselineYear && k.people === p.baselinePopulation) &&
      ordered(p.populationKnots) &&
      p.populationKnots.every(k => finite(k.people) && k.people >= 0 && source(k.source)) &&
      Array.isArray(p.wallPhases) &&
      ordered(p.wallPhases) &&
      p.wallPhases.every(
        w =>
          typeof w.id === "string" &&
          w.year >= p.foundedYear &&
          w.year <= p.baselineYear &&
          source(w.source) &&
          finite(w.people) &&
          w.people >= 0 &&
          Number.isInteger(w.targetDwellings) &&
          w.targetDwellings >= 0 &&
          Array.isArray(w.absorbedClusterIds) &&
          w.absorbedClusterIds.every(id => typeof id === "string")
      ) &&
      Array.isArray(p.approaches) &&
      p.approaches.every(
        a =>
          typeof a.id === "string" &&
          Array.isArray(a.routeIds) &&
          a.routeIds.every(id => Number.isInteger(id) && id >= 0) &&
          Number.isInteger(a.sourceIndex) &&
          a.sourceIndex >= 0 &&
          finite(a.weight) &&
          a.weight >= 0 &&
          unit(a.defense)
      ) &&
      Array.isArray(p.anchors) &&
      p.anchors.every(
        a =>
          typeof a.id === "string" &&
          ["religious", "cemetery", "fair"].includes(a.kind) &&
          finite(a.year) &&
          a.year >= p.foundedYear &&
          a.year <= p.baselineYear &&
          source(a.source)
      )
    );
  } catch {
    return false;
  }
}
