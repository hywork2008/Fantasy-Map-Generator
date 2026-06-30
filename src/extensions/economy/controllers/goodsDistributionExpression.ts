import type { WorldContext } from "../../hostCore";
import { getHeight } from "../../hostServices";
import { convertTemperature, list, rn } from "../../hostUtils";

export type ParamType = "none" | "number" | "biomes" | "shore" | "featureType";

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
  shoreValues: string[];
  typeValues: string[];
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

export function createDefaultCondition(): DistCondition {
  return { fnId: "biome", negate: false, biomeIds: [], shoreValues: [], typeValues: [], numberVal: "" };
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
    case "shore":
      if (!condition.shoreValues.length) return "";
      inner = `shore(${condition.shoreValues.join(", ")})`;
      break;
    case "featureType":
      if (!condition.typeValues.length) return "";
      inner = `type(${condition.typeValues.map(value => `"${value}"`).join(", ")})`;
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
    case "shore":
      condition.shoreValues = args;
      break;
    case "featureType":
      condition.typeValues = args.map(arg => arg.replace(/["']/g, ""));
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

export function interpretDistribution(dist: string, biomesData: WorldContext["biomesData"]): string {
  if (!dist) return "";

  return dist
    .replace(/biome\(([^)]+)\)/g, (_, args: string) => {
      const names = args.split(",").map(arg => biomesData.name[parseInt(arg.trim(), 10)]);
      return names.length === 1 ? names[0] : `${list(names)}`;
    })
    .replace(/minHeight\((-?\d+(?:\.\d+)?)\)/g, (_, h: string) => `min height ${getHeight(+h)}`)
    .replace(/maxHeight\((-?\d+(?:\.\d+)?)\)/g, (_, h: string) => `max height ${getHeight(+h)}`)
    .replace(/minTemp\((-?\d+(?:\.\d+)?)\)/g, (_, t: string) => `min temp ${convertTemperature(+t)}`)
    .replace(/maxTemp\((-?\d+(?:\.\d+)?)\)/g, (_, t: string) => `max temp ${convertTemperature(+t)}`)
    .replace(/shore\(([^)]+)\)/g, (_, args: string) =>
      args
        .split(",")
        .map(arg => SHORE_OPTIONS.find(option => option.value === arg.trim())?.label || arg.trim())
        .join("/")
    )
    .replace(/type\(([^)]+)\)/g, (_, args: string) => {
      const types = args
        .replace(/["']/g, "")
        .split(",")
        .map(arg => arg.trim());
      return `type: ${types.join("/")}`;
    })
    .replace(/river\(\)/g, "river presence")
    .replace(/minHabitability\((\d+)\)/g, (_, n: string) => `habitability ≥ ${n}%`)
    .replace(/habitability\(\)/g, "more habitable areas")
    .replace(/elevation\(\)/g, "more elevated areas")
    .replace(/nth\((\d+)\)/g, (_, n: string) => `1 in ${n} cells`)
    .replace(/random\((\d+)\)/g, (_, n: string) => `${n}% chance`)
    .replace(/\s*&&\s*/g, " AND ")
    .replace(/\s*\|\|\s*/g, " OR ")
    .replace(/!\s*/g, "NOT ")
    .replace(/\s+/g, " ")
    .trim();
}

export function countMatchingCells(
  distribution: string,
  pack: WorldContext["pack"],
  getMethods: (cellId: number) => DistributionMethods
): string {
  if (!distribution) return "";

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
    return "invalid";
  }

  return `${cells.toLocaleString()} cells (${rn((cells / pack.cells.i.length) * 100, 1)}%)`;
}
