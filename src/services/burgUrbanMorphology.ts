import type { SimulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { estimatePolityAgeForRace, generationLengthYears } from "../data/polityAgeEstimate";
import { getRaceFertility, getRaceLifespan } from "../data/races";
import type { Burg } from "../types/models";
import type { UrbanMorphologyProfile } from "../types/urbanMorphology";
import { getCultureBurialProfile } from "../utils/cultureBurialProfile";
import { clampGrowth, createUrbanMorphology, relationDefense } from "../utils/urbanMorphology";

/** Read-only projection. The runtime owns the separate first-initialization commit. */
export function burgUrbanMorphology(
  world: WorldContext,
  simulation: SimulationContext,
  burg: Burg
): UrbanMorphologyProfile {
  const saved = simulation.burgs?.[burg.i!]?.urbanMorphology;
  if (saved) return structuredClone(saved);
  const { pack } = world;
  const people = new Map<number, number>();
  for (let cell = 0; cell < pack.cells.state.length; cell++) {
    const id = pack.cells.state[cell];
    people.set(id, (people.get(id) ?? 0) + (pack.cells.pop?.[cell] ?? 0) * world.populationRate);
  }
  for (const town of pack.burgs) {
    if (!town?.i || town.removed) continue;
    people.set(
      town.state ?? 0,
      (people.get(town.state ?? 0) ?? 0) + (town.population ?? 0) * world.populationRate * world.urbanization
    );
  }
  const states = pack.states.filter(s => s?.i && !s.removed);
  const percentile = (value: number, values: number[]) => {
    if (values.length < 2) return 0.5;
    const less = values.filter(n => n < value).length;
    const equal = values.filter(n => n === value).length;
    return (less + (equal - 1) / 2) / (values.length - 1);
  };
  const powers = new Map(
    states.map(s => [
      s.i,
      0.65 *
        percentile(
          Math.log1p(people.get(s.i) ?? 0),
          states.map(s => Math.log1p(people.get(s.i) ?? 0))
        ) +
        0.35 *
          percentile(
            Math.log1p(s.area ?? 0),
            states.map(s => Math.log1p(s.area ?? 0))
          )
    ])
  );
  const state = pack.states[burg.state ?? 0];
  const polityPower = powers.get(burg.state ?? 0) ?? 0.5;
  let defensePressure = 0;
  for (const id of state?.neighbors ?? []) {
    const enemy = pack.states[id];
    if (!enemy || enemy.removed) continue;
    const relation = state.diplomacy?.[id];
    const strength = relationDefense(typeof relation === "string" ? relation : "Unknown");
    // A burg deep in the interior has lower exposure than one on this state's border.
    let borderDistance = Infinity;
    for (let cell = 0; cell < pack.cells.state.length; cell++) {
      if (pack.cells.state[cell] !== id) continue;
      const p = pack.cells.p[cell];
      if (p) borderDistance = Math.min(borderDistance, Math.hypot(p[0] - burg.x, p[1] - burg.y));
    }
    const proximity = Number.isFinite(borderDistance) ? 1 / (1 + borderDistance / 40) : 0;
    defensePressure = Math.max(
      defensePressure,
      strength * proximity * clampGrowth((powers.get(id) ?? 0.5) - polityPower + 0.5, 0.2, 1)
    );
  }
  const culture = pack.cultures[burg.culture ?? 0];
  const raceId = pack.cultures[state?.culture ?? burg.culture ?? 0]?.race ?? 1;
  const age = estimatePolityAgeForRace(people.get(burg.state ?? 0) ?? 0, pack.races, raceId);
  const fertility = getRaceFertility(pack.races, culture?.race ?? 1);
  const generationYears = generationLengthYears(fertility, getRaceLifespan(pack.races, culture?.race ?? 1));
  const foundingSource = burg.foundedSource;
  const foundedYear =
    foundingSource === "observed" || foundingSource === "explicit"
      ? burg.foundedYear
      : burg.foundedYear !== undefined && burg.foundedYear !== world.options.year
        ? burg.foundedYear
        : undefined;
  const burial = getCultureBurialProfile(culture);
  const profile = createUrbanMorphology({
    seed: world.seed,
    burgId: burg.i!,
    year: simulation.currentYear ?? world.options.year ?? 0,
    population: (burg.population ?? 0) * world.populationRate * world.urbanization,
    capital: Boolean(burg.capital),
    walls: Boolean(burg.walls),
    polityAge: age.years,
    generationYears,
    polityPower,
    defensePressure,
    period: world.options.historicalPeriod ?? "ageOfExploration",
    foundedYear,
    foundedSource: foundedYear === undefined ? undefined : foundingSource === "explicit" ? "explicit" : "observed",
    religious: Boolean(burg.temple),
    extramuralBurial: burial?.zoning === "extramural_sanitary",
    plaza: Boolean(burg.plaza),
    waterfrontResolved:
      !(burg.waterAccess?.river ?? Boolean(pack.cells.r?.[burg.cell])) ||
      burg.riverSiteStatus?.status === "placed" ||
      Boolean(burg.riverPlacement)
  });
  const history = simulation.burgs?.[burg.i!]?.urbanPopulationHistory ?? [];
  for (const knot of history) {
    if (knot.year < profile.foundedYear || knot.year >= profile.baselineYear) continue;
    const index = profile.populationKnots.findIndex(k => k.year === knot.year);
    if (index >= 0) profile.populationKnots[index] = { ...knot };
    else profile.populationKnots.push({ ...knot });
  }
  profile.populationKnots.sort((a, b) => a.year - b.year);
  return profile;
}
