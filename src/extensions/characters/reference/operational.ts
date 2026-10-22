import type { SimulationContext } from "../../../context/simulationContext";
import type { WorldContext } from "../../../context/worldContext";
import type { Character } from "../characterTypes";
import { synchronizeCharacterFinance } from "../financialLifecycle";
import { flushReference, readReference, referencePeople } from "./model";

export function operationalCharacters(
  simulation: Pick<SimulationContext, "extensions">,
  visible: Character[]
): Character[] {
  const plan = readReference(simulation);
  if (!plan) return visible;
  const ids = new Set(visible.map(c => c.i));
  const roster = simulation.extensions.characters?.roster as
    | { slots?: { referenceId?: number; removedFromWorld?: boolean }[] }
    | undefined;
  const removed = new Set(roster?.slots?.filter(s => s.removedFromWorld).map(s => s.referenceId));
  const projected = synchronizeCharacterFinance([
    ...referencePeople(plan).filter(c => !ids.has(c.i) && !removed.has(c.i)),
    ...visible
  ]);
  // Legacy explicit creators append to their simulation view. Publish only those new people.
  Object.defineProperty(projected, "push", {
    value: (...people: Character[]) => {
      visible.push(...people);
      return Array.prototype.push.apply(projected, people);
    }
  });
  return projected;
}
const worldViews = new WeakMap<
  WorldContext,
  { plan: object; pack: WorldContext["pack"]; simulation: SimulationContext; view: WorldContext }
>();
/** Simulation-only world projection; the public pack never contains dormant Characters. */
export function operationalWorld(world: WorldContext, simulation: SimulationContext): WorldContext {
  const plan = readReference(simulation);
  if (!plan) return world;
  const cached = worldViews.get(world);
  if (cached?.plan === plan && cached.pack === world.pack && cached.simulation === simulation) return cached.view;
  const pack = new Proxy(world.pack, {
    get(target, key, receiver) {
      if (key === "characters")
        return operationalCharacters(simulation, (simulation.extensions.characters?.characters ?? []) as Character[]);
      return Reflect.get(target, key, receiver);
    },
    set(target, key, value, receiver) {
      if (key !== "characters") return Reflect.set(target, key, value, receiver);
      flushReference(simulation);
      const plan = readReference(simulation)!;
      const kept = new Set((value as Character[]).map(c => c.i));
      const reserved = new Set(plan.people.map(p => p.id));
      for (const person of plan.people) if (!kept.has(person.id)) person.retired = true;
      simulation.extensions.characters!.characters = (value as Character[]).filter(
        c =>
          !reserved.has(c.i) || (simulation.extensions.characters!.characters as Character[]).some(old => old.i === c.i)
      );
      return true;
    }
  });
  const view = new Proxy(world, {
    get(target, key, receiver) {
      return key === "pack" ? pack : Reflect.get(target, key, receiver);
    }
  });
  worldViews.set(world, { plan, pack: world.pack, simulation, view });
  return view;
}
