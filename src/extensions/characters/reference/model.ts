import type { SimulationContext } from "../../../context/simulationContext";
import type { Character } from "../characterTypes";

export const MASTER_PROFILE = "master-20261022-v1";
export const MASTER_COMMIT = "8622cd2449a0ce93ec6d8409a7437ef54864802b";
export interface ReferencePerson {
  key: string;
  id: number;
  values: unknown[];
  initialWealth: number;
  family: Character["family"];
  retired?: boolean;
}
export interface ReferenceGeneration {
  version: 1;
  profile: typeof MASTER_PROFILE;
  commit: typeof MASTER_COMMIT;
  year: number;
  month: number;
  day: number;
  inputHash: string;
  fields: string[];
  people: ReferencePerson[];
  tasks: string[];
}
export function readReference(simulation: Pick<SimulationContext, "extensions">): ReferenceGeneration | undefined {
  return simulation.extensions?.characters?.referenceGeneration as ReferenceGeneration | undefined;
}
export function encodeReference(
  people: Character[],
  clock: Pick<SimulationContext, "currentYear" | "currentMonth" | "currentDay">,
  inputHash: string,
  tasks: string[]
): ReferenceGeneration {
  const fields = [...new Set(people.flatMap(c => Object.keys(c)))].sort();
  return {
    version: 1,
    profile: MASTER_PROFILE,
    commit: MASTER_COMMIT,
    year: clock.currentYear,
    month: clock.currentMonth,
    day: clock.currentDay,
    inputHash,
    fields,
    tasks,
    people: people.map(c => ({
      key: `master:${c.i}`,
      id: c.i,
      values: fields.map(f => structuredClone((c as unknown as Record<string, unknown>)[f])),
      initialWealth: c.wealth || 0,
      family: structuredClone(c.family)
    }))
  };
}
const caches = new WeakMap<ReferenceGeneration, Map<number, Character>>();
export function referencePeople(plan: ReferenceGeneration): Character[] {
  let cache = caches.get(plan);
  if (!cache) {
    cache = new Map();
    caches.set(plan, cache);
  }
  return plan.people
    .filter(p => !p.retired)
    .map(p => {
      let person = cache!.get(p.id);
      if (!person) {
        person = Object.fromEntries(
          plan.fields.flatMap((field, i) => (p.values[i] === undefined ? [] : [[field, p.values[i]]]))
        ) as unknown as Character;
        cache!.set(p.id, person);
      }
      return person;
    });
}
/** Flush runtime projections before snapshots; nested values already share the column store. */
export function flushReference(simulation: Pick<SimulationContext, "extensions">): void {
  const plan = readReference(simulation);
  if (!plan) return;
  const cache = caches.get(plan);
  const visible = simulation.extensions.characters?.characters as Character[] | undefined;
  for (const person of visible ?? []) if (plan.people.some(p => p.id === person.i)) cache?.set(person.i, person);
  const people = new Map([...(cache?.entries() ?? []), ...(visible ?? []).map(c => [c.i, c] as const)]);
  for (const record of plan.people) {
    const person = people.get(record.id);
    if (!person) continue;
    for (const key of Object.keys(person)) if (!plan.fields.includes(key)) plan.fields.push(key);
    record.values = plan.fields.map(key => (person as unknown as Record<string, unknown>)[key]);
  }
}
export function referenceCharacter(plan: ReferenceGeneration, id: number): Character | undefined {
  return referencePeople(plan).find(c => c.i === id);
}
export function validateReference(value: unknown): asserts value is ReferenceGeneration {
  const p = value as ReferenceGeneration;
  const fail = () => {
    throw Error("Invalid master reference generation");
  };
  if (
    p?.version !== 1 ||
    p.profile !== MASTER_PROFILE ||
    p.commit !== MASTER_COMMIT ||
    !Array.isArray(p.fields) ||
    !p.fields.every(f => typeof f === "string" && !["__proto__", "constructor", "prototype"].includes(f)) ||
    new Set(p.fields).size !== p.fields.length ||
    !Array.isArray(p.people) ||
    !Array.isArray(p.tasks) ||
    !p.tasks.every(t => typeof t === "string") ||
    ![p.year, p.month, p.day].every(Number.isInteger) ||
    p.month < 1 ||
    p.month > 12 ||
    p.day < 1 ||
    p.day > 31 ||
    typeof p.inputHash !== "string"
  )
    fail();
  const ids = new Set<number>(),
    keys = new Set<string>();
  for (const r of p.people) {
    if (
      !r ||
      !Number.isSafeInteger(r.id) ||
      r.id < 1 ||
      ids.has(r.id) ||
      typeof r.key !== "string" ||
      keys.has(r.key) ||
      !Array.isArray(r.values) ||
      r.values.length > p.fields.length ||
      !Number.isFinite(r.initialWealth) ||
      r.initialWealth < 0 ||
      (r.retired !== undefined && typeof r.retired !== "boolean")
    )
      fail();
    const field = (key: string) => r.values[p.fields.indexOf(key)];
    if (
      field("i") !== r.id ||
      typeof field("name") !== "string" ||
      !Number.isFinite(field("age")) ||
      Number(field("age")) < 0 ||
      !Number.isInteger(field("culture")) ||
      Number(field("culture")) < 0 ||
      !Array.isArray(field("titles")) ||
      !Array.isArray(field("pastTitles")) ||
      !field("skills") ||
      typeof field("skills") !== "object"
    )
      fail();
    const household = field("family") as Character["family"];
    if (
      !household ||
      ![household.spouses, household.children, household.grandchildren, household.greatGrandchildren].every(
        n => Number.isSafeInteger(n) && n >= 0
      )
    )
      fail();
    if (
      !r.family ||
      ![r.family.spouses, r.family.children, r.family.grandchildren, r.family.greatGrandchildren].every(
        n => Number.isSafeInteger(n) && n >= 0
      )
    )
      fail();
    ids.add(r.id);
    keys.add(r.key);
  }
}
