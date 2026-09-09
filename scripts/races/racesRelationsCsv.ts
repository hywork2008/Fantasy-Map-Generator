import type { RaceDefinition } from "./raceParameters";
import { parseCsvRecords } from "./racesCsv";

export interface RaceAestheticRelation {
  observerKey: string;
  targetKey: string;
  readability: number;
}
const headers = ["observer_key", "target_key", "readability"];

/** Directional relationships stay in a long-form table so new races add rows, not columns. */
export function parseRaceRelationsCsv(
  csv: string,
  races: readonly Pick<RaceDefinition, "key">[]
): RaceAestheticRelation[] {
  const [columns, ...rows] = parseCsvRecords(csv);
  if (
    !columns ||
    columns.length !== headers.length ||
    new Set(columns).size !== headers.length ||
    headers.some(h => !columns.includes(h))
  )
    throw new Error("Race relations CSV header: expected observer_key,target_key,readability");
  const keys = new Set(races.map(race => race.key));
  const pairs = new Set<string>();
  return rows
    .map((row, index) => {
      const fail = (message: string): never => {
        throw new Error(`Race relations CSV record ${index + 2}: ${message}`);
      };
      if (row.length !== headers.length) fail("expected 3 columns");
      const [observerKey, targetKey, value] = headers.map(h => row[columns.indexOf(h)].trim());
      if (!keys.has(observerKey) || !keys.has(targetKey)) fail("unknown observer or target key");
      if (observerKey === targetKey) fail("same-race evaluation does not use cross-race readability");
      const pair = `${observerKey}:${targetKey}`;
      if (pairs.has(pair)) fail(`duplicate pair ${pair}`);
      pairs.add(pair);
      if (
        !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ||
        !Number.isFinite(Number(value)) ||
        Number(value) < 0 ||
        Number(value) > 1
      )
        fail("readability must be a number in [0, 1]");
      return { observerKey, targetKey, readability: Number(value) };
    })
    .sort((a, b) => a.observerKey.localeCompare(b.observerKey, "en") || a.targetKey.localeCompare(b.targetKey, "en"));
}

export function exportRaceRelationsCsv(
  relations: readonly RaceAestheticRelation[],
  races: readonly Pick<RaceDefinition, "key">[]
): string {
  const csv = `${headers.join(",")}\n${relations.map(r => `${r.observerKey},${r.targetKey},${r.readability}`).join("\n")}\n`;
  parseRaceRelationsCsv(csv, races);
  return csv;
}
