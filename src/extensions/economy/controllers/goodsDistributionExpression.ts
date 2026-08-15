import type { WorldContext } from "../../hostCore";
import { getHeight } from "../../hostServices";
import { convertTemperature, list, rn } from "../../hostUtils";

export type ParamType = "none" | "number" | "biomes" | "biomeTags" | "shore" | "featureType" | "habitats";

export interface FnDef {
  id: string;
  label: string;
  paramType: ParamType;
  paramLabel?: string;
  defaultVal?: string;
  description: string;
  note?: string;
}

export interface DistCondition {
  fnId: string;
  negate: boolean;
  biomeIds: number[];
  biomeTagValues: string[];
  shoreValues: string[];
  typeValues: string[];
  habitatValues: string[];
  numberVal: string;
}

export type DistributionMethods = Record<string, (...args: Array<number | string>) => unknown>;

export const FN_DEFS: FnDef[] = [
  {
    id: "biome",
    label: "Biome",
    paramType: "biomes",
    description: "Cells in specific biomes"
  },
  {
    id: "biomeTag",
    label: "Biome Tag",
    paramType: "biomeTags",
    description: "Cells in biomes with any selected semantic tag"
  },
  {
    id: "minHeight",
    label: "Min Height",
    paramType: "number",
    paramLabel: "Height (0–100)",
    defaultVal: "40",
    description: "Cells at or above a height",
    note: "20: sea level, 50: highlands, 70: mountains."
  },
  {
    id: "maxHeight",
    label: "Max Height",
    paramType: "number",
    paramLabel: "Height (0–100)",
    defaultVal: "40",
    description: "Cells at or below a height",
    note: "20: sea level, 50: highlands, 70: mountains."
  },
  {
    id: "minTemp",
    label: "Min Temperature",
    paramType: "number",
    paramLabel: "Temp (°C)",
    defaultVal: "10",
    description: "Cells with average temperature at or above a value",
    note: "-18°C: polar, 18°C: tropical."
  },
  {
    id: "maxTemp",
    label: "Max Temperature",
    paramType: "number",
    paramLabel: "Temp (°C)",
    defaultVal: "5",
    description: "Cells with average temperature at or below a value",
    note: "-18°C: polar, 18°C: tropical."
  },
  {
    id: "shore",
    label: "Shore Proximity",
    paramType: "shore",
    description: "Cells by proximity to water",
    note: "-1: shallow ocean, -2: deep ocean, 1: coastal land, 2: near coast land."
  },
  {
    id: "type",
    label: "Waterbody Type",
    paramType: "featureType",
    description: "Cells by waterbody type"
  },
  {
    id: "coastalHabitat",
    label: "Coastal Habitat",
    paramType: "habitats",
    description: "Land cells with any selected coastal habitat"
  },
  {
    id: "nearshoreHabitat",
    label: "Nearshore Habitat",
    paramType: "habitats",
    description: "Shallow-water cells with any selected nearshore habitat"
  },
  {
    id: "river",
    label: "River",
    paramType: "none",
    description: "Cells that have a river flowing"
  },
  {
    id: "minHabitability",
    label: "Min Habitability",
    paramType: "number",
    paramLabel: "Habitability (0–100)",
    defaultVal: "20",
    description: "Cells where biome habitability is at or above a value"
  },
  {
    id: "habitability",
    label: "Habitability",
    paramType: "none",
    description: "Favors more habitable cells",
    note: "Higher chance in habitable biomes."
  },
  {
    id: "elevation",
    label: "Elevation",
    paramType: "none",
    description: "Favors higher elevated cells",
    note: "Higher chance at higher altitudes."
  },
  {
    id: "random",
    label: "Random Chance",
    paramType: "number",
    paramLabel: "Chance (%)",
    defaultVal: "50",
    description: "Probability to receive the good",
    note: "random(50): 50% chance per cell."
  },
  {
    id: "nth",
    label: "Every Nth Cell",
    paramType: "number",
    paramLabel: "N",
    defaultVal: "5",
    description: "Regular distribution pattern",
    note: "nth(5): 1 in 5 eligible cells."
  }
];

export const SHORE_OPTIONS = [
  { value: "-2", label: "Deep Ocean" },
  { value: "-1", label: "Shallow Ocean (adjacent to land)" },
  { value: "1", label: "Coastal Land (adjacent to water)" },
  { value: "2", label: "Near Coast Land" }
];

export const FEATURE_TYPE_OPTIONS = [
  { value: "ocean", label: "Ocean / Sea" },
  { value: "freshwater", label: "Freshwater Lake" },
  { value: "salt", label: "Salt Lake" },
  { value: "dry", label: "Dry Lake" },
  { value: "lava", label: "Lava Lake" },
  { value: "frozen", label: "Frozen Lake" },
  { value: "sinkhole", label: "Sinkhole" }
];

export const BIOME_TAG_OPTIONS = [
  "marine",
  "forest",
  "wetland",
  "mountain",
  "coastal",
  "dry",
  "cold",
  "desert",
  "grassland",
  "scrub",
  "snow",
  "arable",
  "nomadic"
].map(value => ({ value, label: value }));

export const HABITAT_OPTIONS = [
  { value: "sandyBeach", label: "Sandy beach" },
  { value: "rockyIntertidal", label: "Rocky intertidal" },
  { value: "tidalFlat", label: "Tidal flat" },
  { value: "coastalDune", label: "Coastal dune" },
  { value: "rockyReef", label: "Rocky reef" },
  { value: "coralReef", label: "Coral reef" },
  { value: "seagrassMeadow", label: "Seagrass meadow" }
];

export function createDefaultCondition(): DistCondition {
  return {
    fnId: "biome",
    negate: false,
    biomeIds: [],
    biomeTagValues: [],
    shoreValues: [],
    typeValues: [],
    habitatValues: [],
    numberVal: ""
  };
}

export function conditionToExpr(condition: DistCondition): string {
  const def = FN_DEFS.find(fnDef => fnDef.id === condition.fnId);
  if (!def) return "";

  let inner: string;
  switch (def.paramType) {
    case "none":
      inner = `${condition.fnId}()`;
      break;
    case "number":
      if (!condition.numberVal) return "";
      inner = `${condition.fnId}(${condition.numberVal})`;
      break;
    case "biomes":
      if (!condition.biomeIds.length) return "";
      inner = `biome(${condition.biomeIds.join(", ")})`;
      break;
    case "biomeTags":
      if (!condition.biomeTagValues.length) return "";
      inner = `biomeTag(${condition.biomeTagValues.map(value => `"${value}"`).join(", ")})`;
      break;
    case "shore":
      if (!condition.shoreValues.length) return "";
      inner = `shore(${condition.shoreValues.join(", ")})`;
      break;
    case "featureType":
      if (!condition.typeValues.length) return "";
      inner = `type(${condition.typeValues.map(value => `"${value}"`).join(", ")})`;
      break;
    case "habitats":
      if (!condition.habitatValues.length) return "";
      inner = `${condition.fnId}(${condition.habitatValues.map(value => `"${value}"`).join(", ")})`;
      break;
    default:
      return "";
  }

  return condition.negate ? `!${inner}` : inner;
}

export function generateExpression(groups: DistCondition[][]): string {
  const groupExpressions = groups
    .map(group => {
      const parts = group.map(conditionToExpr).filter(Boolean);
      if (!parts.length) return "";
      return parts.length === 1 ? parts[0] : parts.join(" && ");
    })
    .filter(Boolean);

  if (!groupExpressions.length) return "";
  if (groupExpressions.length === 1) return groupExpressions[0];
  return groupExpressions.map(expr => (expr.includes(" && ") ? `(${expr})` : expr)).join(" || ");
}

export function splitTopLevel(expr: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === "(") depth++;
    else if (expr[i] === ")") depth--;
    else if (depth === 0 && expr.startsWith(separator, i)) {
      parts.push(expr.slice(start, i).trim());
      i += separator.length - 1;
      start = i + 1;
    }
  }

  parts.push(expr.slice(start).trim());
  return parts.filter(Boolean);
}

export function stripOuterParens(value: string): string {
  if (!value.startsWith("(") || !value.endsWith(")")) return value;

  let depth = 0;
  for (let i = 0; i < value.length - 1; i++) {
    if (value[i] === "(") depth++;
    else if (value[i] === ")") {
      if (--depth === 0) return value;
    }
  }

  return value.slice(1, -1).trim();
}

export function parseConditionStr(value: string): DistCondition | null {
  let rest = value.trim();
  let negate = false;
  if (rest.startsWith("!")) {
    negate = true;
    rest = rest.slice(1).trim();
  }

  const match = rest.match(/^(\w+)\(([^)]*)\)$/);
  if (!match) return null;

  const [, fnId, rawArgs] = match;
  if (!FN_DEFS.find(def => def.id === fnId)) return null;

  const condition = createDefaultCondition();
  condition.fnId = fnId;
  condition.negate = negate;

  const args = rawArgs
    .split(",")
    .map(arg => arg.trim())
    .filter(Boolean);
  const def = FN_DEFS.find(fnDef => fnDef.id === fnId);
  if (!def) return null;

  switch (def.paramType) {
    case "number":
      condition.numberVal = args[0] ?? "";
      break;
    case "biomes":
      condition.biomeIds = args.map(Number).filter(n => !Number.isNaN(n));
      break;
    case "biomeTags":
      condition.biomeTagValues = args.map(arg => arg.replace(/["']/g, ""));
      break;
    case "shore":
      condition.shoreValues = args;
      break;
    case "featureType":
      condition.typeValues = args.map(arg => arg.replace(/["']/g, ""));
      break;
    case "habitats":
      condition.habitatValues = args.map(arg => arg.replace(/["']/g, ""));
      break;
    case "none":
      break;
  }

  return condition;
}

export function parseExpression(expr: string): DistCondition[][] | null {
  if (!expr) return null;

  const groups: DistCondition[][] = [];
  for (const orPart of splitTopLevel(expr, " || ")) {
    const groupExpr = stripOuterParens(orPart.trim());
    const group: DistCondition[] = [];

    for (const andPart of splitTopLevel(groupExpr, " && ")) {
      const condition = parseConditionStr(andPart.trim());
      if (!condition) return null;
      group.push(condition);
    }

    if (group.length) groups.push(group);
  }

  return groups.length ? groups : null;
}

const SHORE_PREVIEW_KEYS: Record<string, string> = {
  "-2": "extensions.goodsDistribution.shore.n2",
  "-1": "extensions.goodsDistribution.shore.n1",
  "1": "extensions.goodsDistribution.shore.p1",
  "2": "extensions.goodsDistribution.shore.p2"
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

function splitArgs(args: string): string[] {
  return args
    .replace(/["']/g, "")
    .split(",")
    .map(arg => arg.trim())
    .filter(Boolean);
}

export function interpretDistribution(
  dist: string,
  biomesData: WorldContext["biomesData"],
  t: Translate = (_key, options) => String(options?.defaultValue ?? _key)
): string {
  if (!dist) return "";

  return dist
    .replace(/biome\(([^)]+)\)/g, (_, args: string) => {
      const names = args.split(",").map(arg => biomesData.name[parseInt(arg.trim(), 10)]);
      return names.length === 1 ? names[0] : `${list(names)}`;
    })
    .replace(/biomeTag\(([^)]+)\)/g, (_, args: string) => {
      const tags = splitArgs(args).map(tag => t(`extensions.goodsDistribution.biomeTag.${tag}`, { defaultValue: tag }));
      return t("extensions.goodsDistribution.previewBiomeTag", { tags: tags.join("/") });
    })
    .replace(/minHeight\((-?\d+(?:\.\d+)?)\)/g, (_, h: string) =>
      t("extensions.goodsDistribution.previewMinHeight", { value: getHeight(+h) })
    )
    .replace(/maxHeight\((-?\d+(?:\.\d+)?)\)/g, (_, h: string) =>
      t("extensions.goodsDistribution.previewMaxHeight", { value: getHeight(+h) })
    )
    .replace(/minTemp\((-?\d+(?:\.\d+)?)\)/g, (_, temp: string) =>
      t("extensions.goodsDistribution.previewMinTemp", { value: convertTemperature(+temp) })
    )
    .replace(/maxTemp\((-?\d+(?:\.\d+)?)\)/g, (_, temp: string) =>
      t("extensions.goodsDistribution.previewMaxTemp", { value: convertTemperature(+temp) })
    )
    .replace(/shore\(([^)]+)\)/g, (_, args: string) =>
      splitArgs(args)
        .map(value => {
          const key = SHORE_PREVIEW_KEYS[value];
          return key ? t(key) : SHORE_OPTIONS.find(option => option.value === value)?.label || value;
        })
        .join("/")
    )
    .replace(/type\(([^)]+)\)/g, (_, args: string) => {
      const types = splitArgs(args).map(type =>
        t(`extensions.goodsDistribution.featureType.${type}`, { defaultValue: type })
      );
      return t("extensions.goodsDistribution.previewType", { types: types.join("/") });
    })
    .replace(/coastalHabitat\(([^)]+)\)/g, (_, args: string) => {
      const habitats = splitArgs(args).map(habitat =>
        t(`extensions.goodsDistribution.habitat.${habitat}`, { defaultValue: habitat })
      );
      return t("extensions.goodsDistribution.previewCoastal", { habitats: habitats.join("/") });
    })
    .replace(/nearshoreHabitat\(([^)]+)\)/g, (_, args: string) => {
      const habitats = splitArgs(args).map(habitat =>
        t(`extensions.goodsDistribution.habitat.${habitat}`, { defaultValue: habitat })
      );
      return t("extensions.goodsDistribution.previewNearshore", { habitats: habitats.join("/") });
    })
    .replace(/river\(\)/g, () => t("extensions.goodsDistribution.previewRiver"))
    .replace(/minHabitability\((\d+)\)/g, (_, n: string) =>
      t("extensions.goodsDistribution.previewMinHab", { value: n })
    )
    .replace(/habitability\(\)/g, () => t("extensions.goodsDistribution.previewHab"))
    .replace(/elevation\(\)/g, () => t("extensions.goodsDistribution.previewElev"))
    .replace(/nth\((\d+)\)/g, (_, n: string) => t("extensions.goodsDistribution.previewNth", { n }))
    .replace(/random\((\d+)\)/g, (_, n: string) => t("extensions.goodsDistribution.previewRandom", { n }))
    .replace(/\s*&&\s*/g, ` ${t("extensions.goodsDistribution.and")} `)
    .replace(/\s*\|\|\s*/g, ` ${t("extensions.goodsDistribution.or")} `)
    .replace(/!\s*/g, `${t("extensions.goodsDistribution.not")} `)
    .replace(/\s+/g, " ")
    .trim();
}

export type MatchingCellCount =
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "ok"; cells: number; percent: number };

export function countMatchingCells(
  distribution: string,
  pack: WorldContext["pack"],
  getMethods: (cellId: number) => DistributionMethods
): MatchingCellCount {
  if (!distribution) return { status: "empty" };

  let cells = 0;
  try {
    const methods = getMethods(0);
    const allMethods = `{${Object.keys(methods).join(", ")}}`;
    const spread = new Function(allMethods, `return ${distribution}`) as (methods: DistributionMethods) => unknown;

    for (const cellId of pack.cells.i) {
      const eligible = spread(getMethods(cellId));
      if (eligible) cells++;
    }
  } catch {
    return { status: "invalid" };
  }

  return { status: "ok", cells, percent: rn((cells / pack.cells.i.length) * 100, 1) };
}
