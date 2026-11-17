import { landmarkFacets, medievalFacets, placeableFacets, recordFacets } from "../buildings/catalogueFacets";
import type { LandmarkModel } from "../buildings/landmarks/architectureKit";
import type { MedievalModel } from "../buildings/medieval/modelKit";
import {
  MODEL_KINDS,
  MODEL_REGIONS,
  type ModelFacets,
  type ModelKind,
  type ModelRegion
} from "../buildings/modelFacets";
import { PLACEABLE_OBJECTS } from "../buildings/placeableObjects";
import type { BuildingRecord } from "../buildings/record";
import { HISTORICAL_PERIODS, type HistoricalPeriod, isHistoricalPeriod } from "../types/historicalPeriod";

/**
 * Facets of every list entry, keyed by the entry button's `data-id`, and the list filter
 * (docs/plan/model-viewer-rename-and-catalogue-facets.md, stage 3).
 */

function span(from: HistoricalPeriod, to: HistoricalPeriod): HistoricalPeriod[] {
  return HISTORICAL_PERIODS.slice(HISTORICAL_PERIODS.indexOf(from), HISTORICAL_PERIODS.indexOf(to) + 1);
}
function f(
  kind: ModelKind,
  periods: readonly HistoricalPeriod[],
  regions: readonly ModelRegion[],
  uses: readonly string[],
  years?: readonly [number, number]
): ModelFacets {
  return { kind, periods, regions, uses, ...(years ? { years } : {}) };
}
const EU: ModelRegion[] = ["european"];
const MEDIEVAL_ON = span("earlyMedieval", "preIndustrialEra");
const HIGH_LATE = span("highMedieval", "lateMedieval");
const FORTRESS = f("structure", HIGH_LATE, EU, ["fortification", "military"]);
const BARBICAN = f("structure", HIGH_LATE, EU, ["fortification", "military"]);
const SIGN = f("prop", MEDIEVAL_ON, EU, ["signage", "trade"]);
const CONTAINER = f("prop", span("classicalAntiquity", "steamEra"), ["any"], ["storage", "transport"]);

/** Entries built directly in the viewer, outside the medieval, landmark, placeable and record registries. */
const VIEWER_ENTRIES: Record<string, ModelFacets> = {
  "pont-du-gard": f("structure", ["classicalAntiquity"], ["european", "mediterranean"], ["water"]),
  "st-georges-chapel": f("structure", ["lateMedieval"], EU, ["worship"]),
  "bojnice-castle": f("structure", span("highMedieval", "steamEra"), EU, ["fortification", "residence"]),
  chambord: f("structure", ["ageOfExploration"], EU, ["residence"]),
  "krak-hospitalier-1270": f("structure", HIGH_LATE, ["middle-eastern"], ["fortification", "military"]),
  "krak-mamluk-1302": f("structure", HIGH_LATE, ["middle-eastern"], ["fortification", "military"]),
  "cliff-fortress": f("structure", span("earlyMedieval", "lateMedieval"), ["any"], ["fortification", "military"]),
  "terraced-river": f("structure", span("earlyMedieval", "preIndustrialEra"), ["any"], ["terrain"]),
  carrack: f("ship", span("lateMedieval", "ageOfExploration"), ["european", "mediterranean"], ["trade", "transport"]),
  caravel: f("ship", span("lateMedieval", "ageOfExploration"), EU, ["exploration", "trade"]),
  galleon: f("ship", span("ageOfExploration", "maritimeEra"), EU, ["military", "trade"]),
  "ship-of-the-line": f("ship", span("maritimeEra", "preIndustrialEra"), EU, ["military"], [1765, 1850]),
  galley: f("ship", span("classicalAntiquity", "ageOfExploration"), ["mediterranean"], ["military"]),
  trireme: f("ship", ["classicalAntiquity"], ["mediterranean"], ["military"]),
  sloop: f("ship", span("maritimeEra", "steamEra"), ["european", "american"], ["trade", "transport"]),
  barge: f("ship", span("classicalAntiquity", "steamEra"), ["any"], ["trade", "transport"]),
  "flintlock-musket": f("weapon", span("maritimeEra", "preIndustrialEra"), EU, ["military", "small-arms"]),
  "lumber-yard": f("structure", MEDIEVAL_ON, EU, ["storage", "woodworking"]),
  "town-curtain-wall": FORTRESS,
  "town-mural-tower": FORTRESS,
  "town-gate": FORTRESS,
  "medieval-town-gatehouse": FORTRESS,
  "regional-earthen-flat": f(
    "structure",
    span("classicalAntiquity", "preIndustrialEra"),
    ["middle-eastern", "african"],
    ["dwelling"]
  ),
  "regional-polygon": f("structure", MEDIEVAL_ON, EU, ["dwelling"]),
  "regional-mediterranean": f("structure", MEDIEVAL_ON, ["mediterranean"], ["dwelling"]),
  "regional-atlantic": f("structure", MEDIEVAL_ON, EU, ["dwelling"]),
  "regional-northern-wooded": f("structure", MEDIEVAL_ON, EU, ["dwelling"]),
  "regional-northern-urban": f("structure", MEDIEVAL_ON, EU, ["dwelling"]),
  "regional-stone-upland": f("structure", MEDIEVAL_ON, EU, ["dwelling"])
};
const VIEWER_PREFIXES: [string, ModelFacets][] = [
  ["barbican-", BARBICAN],
  ["sign-", SIGN],
  ["container-", CONTAINER]
];

const medieval = new Map(
  Object.values(
    import.meta.glob<{ models: MedievalModel[] }>("../buildings/medieval/*Models.ts", { eager: true })
  ).flatMap(module => module.models.map((model): [string, MedievalModel] => [`medieval-${model.id}`, model]))
);
const landmarks = new Map(
  Object.values(
    import.meta.glob<LandmarkModel>(
      [
        "../buildings/landmarks/*.ts",
        "!../buildings/landmarks/*.test.ts",
        "!../buildings/landmarks/architectureKit.ts",
        "!../buildings/landmarks/landmarkTestSupport.ts"
      ],
      { eager: true, import: "model" }
    )
  ).map(model => [model.id, model] as const)
);
const records = new Map(
  Object.values(
    import.meta.glob<BuildingRecord>("../buildings/catalogue/*.json", { eager: true, import: "default" })
  ).map(record => [record.id, record] as const)
);
const placeables = new Map(PLACEABLE_OBJECTS.map(object => [object.id, object] as const));

/** Facets of a list entry; undefined marks it unclassified. */
export function entryFacets(id: string | undefined): ModelFacets | undefined {
  if (!id) return undefined;
  const model = medieval.get(id);
  if (model) return medievalFacets(model);
  const landmark = landmarks.get(id);
  if (landmark) return landmarkFacets(landmark);
  const record = records.get(id);
  if (record) return recordFacets(record);
  const object = placeables.get(id);
  if (object) return placeableFacets(object);
  return VIEWER_ENTRIES[id] ?? VIEWER_PREFIXES.find(([prefix]) => id.startsWith(prefix))?.[1];
}

export interface CatalogueFilter {
  kinds: readonly ModelKind[];
  from?: HistoricalPeriod;
  to?: HistoricalPeriod;
  regions: readonly ModelRegion[];
  uses: readonly string[];
  query: string;
}
export const EMPTY_FILTER: CatalogueFilter = { kinds: [], regions: [], uses: [], query: "" };

/** True when only the name query, or nothing, narrows the list. Unclassified entries stay visible then. */
export function facetFilterIsEmpty(filter: CatalogueFilter): boolean {
  return !filter.kinds.length && !filter.from && !filter.to && !filter.regions.length && !filter.uses.length;
}

/**
 * Kinds, regions and uses each match any selected value; a period range matches any overlapping period.
 * A model for "any" region matches every region.
 */
export function entryMatches(facets: ModelFacets | undefined, name: string, filter: CatalogueFilter): boolean {
  const query = filter.query.trim().toLowerCase();
  if (query && !name.toLowerCase().includes(query) && !facets?.uses.some(use => use.includes(query))) return false;
  if (facetFilterIsEmpty(filter)) return true;
  if (!facets) return false;
  if (filter.kinds.length && !filter.kinds.includes(facets.kind)) return false;
  if (filter.from || filter.to) {
    const from = HISTORICAL_PERIODS.indexOf(filter.from ?? HISTORICAL_PERIODS[0]),
      to = HISTORICAL_PERIODS.indexOf(filter.to ?? HISTORICAL_PERIODS.at(-1)!);
    if (
      !facets.periods.some(
        period => HISTORICAL_PERIODS.indexOf(period) >= from && HISTORICAL_PERIODS.indexOf(period) <= to
      )
    )
      return false;
  }
  if (
    filter.regions.length &&
    !facets.regions.includes("any") &&
    !facets.regions.some(region => filter.regions.includes(region))
  )
    return false;
  if (filter.uses.length && !facets.uses.some(use => filter.uses.includes(use))) return false;
  return true;
}

const list = (params: URLSearchParams, key: string) => params.get(key)?.split(",").filter(Boolean) ?? [];

/** Reads the filter from URL query parameters, dropping unknown values. */
export function parseFilter(search: string): CatalogueFilter {
  const params = new URLSearchParams(search);
  const from = params.get("from"),
    to = params.get("to");
  return {
    kinds: list(params, "kind").filter((kind): kind is ModelKind => (MODEL_KINDS as readonly string[]).includes(kind)),
    ...(isHistoricalPeriod(from) ? { from } : {}),
    ...(isHistoricalPeriod(to) ? { to } : {}),
    regions: list(params, "region").filter((region): region is ModelRegion =>
      (MODEL_REGIONS as readonly string[]).includes(region)
    ),
    uses: list(params, "use"),
    query: params.get("q") ?? ""
  };
}

/** Writes the filter into `search`, keeping unrelated parameters. */
export function serializeFilter(filter: CatalogueFilter, search = ""): string {
  const params = new URLSearchParams(search);
  const set = (key: string, value: string | undefined) => (value ? params.set(key, value) : params.delete(key));
  set("kind", filter.kinds.join(","));
  set("from", filter.from);
  set("to", filter.to);
  set("region", filter.regions.join(","));
  set("use", filter.uses.join(","));
  set("q", filter.query.trim());
  const text = params.toString();
  return text ? `?${text}` : "";
}
