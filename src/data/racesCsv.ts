import { APPEARANCE_AXIS_IDS, CHARACTER_GENDER_MODES } from "../types/models";
import { hybridAppearance, hybridBeautyIdeal } from "./hybridRaceTraits";
import type { RaceDefinition } from "./races";

const axes = APPEARANCE_AXIS_IDS;
const numericColumns: Record<string, string> = {
  lifespan_years: "lifespan",
  max_lifespan_years: "maxLifespan",
  fertility_start_years: "fertility.fertilityStart",
  fertility_end_years: "fertility.fertilityEnd",
  interbirth_years: "fertility.interbirthYears",
  litter_mean: "fertility.litterMean",
  litter_max: "fertility.litterMax",
  ...Object.fromEntries(axes.map(a => [`looks_${a}`, `looksBaseline.${a}`])),
  ...Object.fromEntries(axes.map(a => [`beauty_weight_${a}`, `beautyIdeal.weights.${a}`])),
  ...Object.fromEntries(axes.flatMap(a => ["min", "max"].map(b => [`looks_${a}_${b}`, `looksRange.${a}.${b}`]))),
  population_capacity_multiplier: "environmentalSurvival.populationCapacityMultiplier",
  furry_scale_min: "characterAppearance.furryScale.min",
  furry_scale_max: "characterAppearance.furryScale.max"
};
const textColumns: Record<string, string> = {
  key: "key",
  name: "name",
  character_gender: "characterGender",
  appearance_kind: "characterAppearance.kind"
};
const boolColumns: Record<string, string> = {
  food_independent: "environmentalSurvival.foodIndependent",
  temperature_independent: "environmentalSurvival.temperatureIndependent"
};
const listColumns: Record<string, string> = {
  horn_animals: "characterAppearance.hornAnimals",
  animals: "characterAppearance.animals"
};
export const RACE_CSV_HEADERS = [
  "id",
  "key",
  "name",
  "hybrid_parent_a",
  "hybrid_parent_b",
  "character_gender",
  ...Object.keys(numericColumns),
  "appearance_kind",
  ...Object.keys(listColumns),
  ...Object.keys(boolColumns)
];
const paths = { ...numericColumns, ...textColumns, ...boolColumns, ...listColumns };
const stableKeys = [
  "unknown",
  "human",
  "elf",
  "dark_elf",
  "dwarf",
  "goblin",
  "orc",
  "giant",
  "draconic",
  "arachnid",
  "amazones",
  "wyrmkin",
  "demon",
  "beastfolk",
  "half_elf"
];

/** RFC 4180 records, including BOM, CRLF, escaped quotes and embedded newlines. */
function records(csv: string): string[][] {
  csv = csv.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    closed = false;
  const field = () => {
    row.push(value);
    value = "";
    closed = false;
  };
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c !== '"') value += c;
      else if (csv[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (c === ",") field();
    else if (c === "\n" || c === "\r") {
      field();
      if (row.some(v => v !== "")) rows.push(row);
      row = [];
      if (c === "\r" && csv[i + 1] === "\n") i++;
    } else if (c === '"' && !value && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error(`CSV record ${rows.length + 1}: invalid quote`);
      value += c;
    }
  }
  if (quoted) throw new Error(`CSV record ${rows.length + 1}: unclosed quote`);
  field();
  if (row.some(v => v !== "")) rows.push(row);
  return rows;
}
function set(object: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  for (const part of parts.slice(0, -1)) {
    object[part] ??= {};
    object = object[part] as Record<string, unknown>;
  }
  object[parts.at(-1)!] = value;
}
function get(object: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], object);
}

export function parseRacesCsv(csv: string): RaceDefinition[] {
  const [headers, ...rows] = records(csv);
  if (
    !headers ||
    headers.length !== RACE_CSV_HEADERS.length ||
    new Set(headers).size !== headers.length ||
    RACE_CSV_HEADERS.some(h => !headers.includes(h))
  )
    throw new Error("CSV header: missing, duplicate or unknown columns");
  const entries = rows
    .map((cells, index) => {
      const fail = (message: string): never => {
        throw new Error(`CSV record ${index + 2}: ${message}`);
      };
      if (cells.length !== headers.length) fail(`expected ${headers.length} columns, got ${cells.length}`);
      const row = Object.fromEntries(headers.map((h, i) => [h, cells[i].trim()]));
      if (!/^\d+$/.test(row.id)) fail("id must be a non-negative integer");
      const def: Record<string, unknown> = {};
      for (const [column, path] of Object.entries(paths)) {
        const value = row[column];
        if (!value) continue;
        if (column in numericColumns) {
          if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value)))
            fail(`${column}: invalid number '${value}'`);
          set(def, path, Number(value));
        } else if (column in boolColumns) {
          if (value !== "true" && value !== "false") fail(`${column}: expected true or false`);
          set(def, path, value === "true");
        } else set(def, path, column in listColumns ? value.split("|").map(v => v.trim()) : value);
      }
      if (!/^[a-z][a-z0-9_]*$/.test(row.key) || !row.name) fail("key/name required (key: lowercase snake_case)");
      if (!!row.hybrid_parent_a !== !!row.hybrid_parent_b) fail("both hybrid parents required");
      return { id: Number(row.id), def: def as unknown as RaceDefinition, row, fail };
    })
    .sort((a, b) => a.id - b.id);
  const keys = new Set<string>();
  for (const [id, entry] of entries.entries()) {
    if (entry.id !== id) entry.fail("ids must be unique and contiguous from 0");
    if (stableKeys[id] && entry.def.key !== stableKeys[id]) entry.fail(`id ${id} is reserved for ${stableKeys[id]}`);
    if (keys.has(entry.def.key)) entry.fail(`duplicate key ${entry.def.key}`);
    keys.add(entry.def.key);
  }
  if (entries.length < stableKeys.length) throw new Error("CSV: existing races cannot be removed; append new ids");
  const resolved = new Set<string>(),
    visiting = new Set<string>();
  function resolve(entry: (typeof entries)[number]): RaceDefinition {
    const { def, row, fail } = entry;
    if (resolved.has(def.key)) return def;
    if (visiting.has(def.key)) fail("cyclic hybrid parents");
    visiting.add(def.key);
    if (row.hybrid_parent_a) {
      for (const column of Object.keys(numericColumns).filter(
        c => c.startsWith("looks_") || c.startsWith("beauty_") || c === "lifespan_years" || c === "max_lifespan_years"
      )) {
        if (row[column]) fail(`${column}: must be blank for a hybrid (derived from parents)`);
      }
      const parents = [row.hybrid_parent_a, row.hybrid_parent_b].map(key => {
        const parent = entries.find(e => e.def.key === key);
        if (!parent) return fail(`unknown parent ${key}`);
        return resolve(parent);
      });
      const [a, b] = parents;
      def.lifespan = Math.min(a.lifespan, b.lifespan);
      def.maxLifespan = Math.max(a.maxLifespan, b.maxLifespan);
      const looks = hybridAppearance(a.looksBaseline, b.looksBaseline);
      def.looksBaseline = looks.baseline;
      def.looksRange = looks.range;
      def.beautyIdeal = hybridBeautyIdeal(a.beautyIdeal, b.beautyIdeal);
    }
    const number = (path: string, min: number, max = Infinity, integer = false) => {
      const value = get(def, path);
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < min ||
        value > max ||
        (integer && !Number.isInteger(value))
      )
        fail(`${path}: expected ${integer ? "integer" : "number"} in [${min}, ${max}]`);
    };
    number("lifespan", 1);
    number("maxLifespan", def.lifespan);
    number("fertility.fertilityStart", 0, def.maxLifespan);
    number("fertility.fertilityEnd", def.fertility?.fertilityStart, def.maxLifespan);
    number("fertility.interbirthYears", Number.MIN_VALUE);
    number("fertility.litterMax", 0, Infinity, true);
    number("fertility.litterMean", 0, def.fertility?.litterMax);
    if ((def.fertility.litterMean === 0) !== (def.fertility.litterMax === 0))
      fail("sterile races require both litter values to be zero");
    for (const axis of axes) {
      number(`looksBaseline.${axis}`, 1, 100);
      if (get(def, `beautyIdeal.weights.${axis}`) !== undefined) number(`beautyIdeal.weights.${axis}`, -Infinity);
      if (def.looksRange?.[axis]) {
        number(`looksRange.${axis}.min`, 1, def.looksBaseline[axis]);
        number(`looksRange.${axis}.max`, def.looksBaseline[axis], 100);
      }
    }
    if (!def.beautyIdeal) fail("at least one beauty weight required");
    if (def.characterGender && !CHARACTER_GENDER_MODES.includes(def.characterGender)) fail("invalid character_gender");
    if (def.environmentalSurvival) {
      number("environmentalSurvival.populationCapacityMultiplier", 0);
      if (
        typeof def.environmentalSurvival.foodIndependent !== "boolean" ||
        typeof def.environmentalSurvival.temperatureIndependent !== "boolean"
      )
        fail("all environmental survival fields required");
    }
    const appearance = def.characterAppearance;
    if (appearance) {
      const demon = appearance.kind === "demon";
      if (!demon && appearance.kind !== "beastfolk") fail("appearance_kind must be demon or beastfolk");
      const allowed = demon
        ? "antelope bison buffalo gazelle goat ibex oryx ram yak"
        : "bear cat cattle deer dog fox goat hare horse lion otter raccoon tiger wolf";
      const animals = demon ? appearance.hornAnimals : appearance.animals;
      if (
        !animals?.length ||
        new Set(animals).size !== animals.length ||
        animals.some(a => !allowed.split(" ").includes(a))
      )
        fail("invalid or duplicate appearance animals");
      if (demon ? row.animals || row.furry_scale_min || row.furry_scale_max : row.horn_animals)
        fail("appearance fields do not match kind");
      if (!demon) {
        number("characterAppearance.furryScale.min", 1, 10, true);
        number("characterAppearance.furryScale.max", appearance.furryScale.min, 10, true);
      }
    }
    visiting.delete(def.key);
    resolved.add(def.key);
    return def;
  }
  return entries.map(resolve);
}

/** Export resolved source/game catalog values; hybrid formulas become explicit values. */
export function exportRacesCsv(definitions: readonly RaceDefinition[]): string {
  const escapeCell = (value: unknown) => {
    const text = value === undefined ? "" : Array.isArray(value) ? value.join("|") : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = definitions.map((def, id) =>
    RACE_CSV_HEADERS.map(h => escapeCell(h === "id" ? id : paths[h] ? get(def, paths[h]) : undefined)).join(",")
  );
  const csv = `${RACE_CSV_HEADERS.join(",")}\n${rows.join("\n")}\n`;
  parseRacesCsv(csv);
  return csv;
}
