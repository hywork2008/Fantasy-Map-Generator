import { registerSimulationWatch } from "../../../runtime/simulationWatches";
import type { SimulationExtensionAPI } from "../../../types/extension-api";
import { advanceCharacterAging } from "../advanceAge";
import { advanceCharacterHealth } from "../characterHealth";
import { getCharacters } from "../charactersContext";
import { latestRoleSlot, nextRosterStop, stopKey } from "./model";
import {
  clockYear,
  ensureChildren,
  ensureRoster,
  ensureSlot,
  materializeSlots,
  readRoster,
  synchronizeFamily,
  synchronizeTitle,
  yearAfterDays
} from "./runtime";
import type { PersonSlot, WorldRoster } from "./types";

/** Shared by normal, fast, historical, server and direct command time advances. */
export function registerRosterWatches(api: SimulationExtensionAPI): () => void {
  let observedAlive = new Set<number>();
  return registerSimulationWatch({
    requiresDailySteps: simulation =>
      simulation === api.simulationContext &&
      !!readRoster()?.slots.some(
        s =>
          s.mode === "simulation" &&
          (s.protection.track !== "none" ||
            s.protection.watchAge !== undefined ||
            s.protection.stopBeforeDeath ||
            s.protection.stopOnBirth)
      ),
    beginRun: (simulation, days) => {
      if (simulation === api.simulationContext && readRoster() && !readRoster()!.pending)
        readRoster()!.remainingDays = days;
    },
    observeStep: simulation =>
      simulation === api.simulationContext &&
      !!readRoster()?.slots.some(s => s.mode === "simulation" && s.protection.stopBeforeDeath),
    afterStep: (simulation, days) => {
      if (simulation !== api.simulationContext) return { rollback: false };
      const r = readRoster();
      if (!r) return { rollback: false };
      for (const s of r.slots) {
        if (!s.protection.stopBeforeDeath || s.characterId === undefined || !observedAlive.has(s.characterId)) continue;
        const c = getCharacters().find(c => c.i === s.characterId);
        if (!c?.dead) continue;
        const event = { slotId: s.id, kind: "death" as const, year: clockYear(), message: "Observed death is pending" };
        if (r.acknowledged.includes(stopKey(event))) continue;
        return {
          rollback: true,
          topics: ["extension.characters"],
          afterRollback: () => {
            ensureRoster().pending = event;
            api.events.dispatchEvent(new CustomEvent("fmg:roster-stopped", { detail: event }));
          }
        };
      }
      r.remainingDays = Math.max(0, r.remainingDays - days);
      return { rollback: false };
    },
    paused: simulation => simulation === api.simulationContext && !!readRoster()?.pending,
    beforeStep: (simulation, days) => {
      if (simulation !== api.simulationContext || !api.isExtensionEnabled("characters")) return { allowed: true };
      const roster = readRoster();
      if (!roster) return { allowed: true };
      if (roster.pending) return { allowed: false, topics: ["extension.characters"] };
      observedAlive = new Set(
        getCharacters()
          .filter(c => !c.dead)
          .map(c => c.i)
      );
      const now = clockYear();
      // Prepare only the tracked branches. Their plans are persisted, never rerolled on resume.
      for (const slot of [...roster.slots])
        if (slot.mode === "simulation" && slot.protection.track !== "none") ensureChildren(roster, slot);
      const stop = nextRosterStop(roster, now, yearAfterDays(days));
      if (!stop) return { allowed: true };
      roster.pending = stop;
      api.events.dispatchEvent(new CustomEvent("fmg:roster-stopped", { detail: stop }));
      return { allowed: false, topics: ["extension.characters"] };
    }
  });
}
function closeAppointments(roster: WorldRoster, slot: PersonSlot, year: number): void {
  for (const a of roster.appointments) if (a.slotId === slot.id && a.endYear === undefined) a.endYear = year;
}
export function advanceRoster(): void {
  const roster = ensureRoster();
  const now = clockYear();
  // Iterate a queue so a long headless stride still follows every selected generation.
  const queue = [...roster.slots];
  for (let i = 0; i < queue.length; i++) {
    const slot = queue[i];
    if ((slot.mode !== "simulation" && slot.characterId !== undefined) || slot.cancelledBirth) continue;
    if (slot.protection.track !== "none") {
      const children = ensureChildren(roster, slot);
      for (const child of children) {
        if (child.protection.track !== "none" && child.birthYear <= now && !queue.includes(child)) queue.push(child);
        if (child.birthYear <= now && child.protection.materializeDescendants && child.characterId === undefined)
          materializeSlots({ slotIds: [child.id], mode: "simulation" });
      }
    }
    if (slot.deathYear === undefined && slot.plannedDeathYear <= now) {
      slot.deathYear = slot.plannedDeathYear;
      closeAppointments(roster, slot, slot.deathYear);
      if (slot.protection.track !== "none") {
        const surviving = roster.family.some(
          f =>
            f.parentId === slot.id &&
            roster.slots.some(s => s.id === f.childId && s.birthYear <= now && s.plannedDeathYear > slot.deathYear!)
        );
        if (!surviving) {
          const event = {
            slotId: slot.id,
            kind: "extinction" as const,
            year: slot.deathYear,
            message: "Tracked lineage has ended"
          };
          if (!roster.acknowledged.includes(stopKey(event))) roster.pending ??= event;
        }
      }
    }
    const character = getCharacters().find(c => c.i === slot.characterId);
    if (character) {
      character.age = Math.max(0, Math.floor((slot.deathYear ?? now) - slot.birthYear));
      if (slot.deathYear !== undefined) {
        character.dead = true;
        character.deathYear = Math.floor(slot.deathYear);
      } else if (character.dead) {
        slot.deathYear = now;
        closeAppointments(roster, slot, now);
      }
      if (slot.deathYear !== undefined && slot.childPlan) ensureChildren(roster, slot);
      synchronizeTitle(roster, slot, character);
    }
  }
  for (const role of roster.roles) {
    const org = roster.organizations.find(o => o.id === role.organizationId);
    if (!org || org.archived || !(role.simulate ?? org.simulate)) continue;
    for (let ordinal = 0; ordinal < role.count; ordinal++) {
      const previous = latestRoleSlot(roster, role.id, ordinal);
      if (previous && previous.deathYear === undefined) {
        const a = roster.appointments.find(
          a => a.slotId === previous.id && a.roleId === role.id && a.endYear === undefined
        );
        if (!a || !role.termYears || now - a.startYear < role.termYears) continue;
        a.endYear = now;
        const oldCharacter = getCharacters().find(c => c.i === previous.characterId);
        if (oldCharacter) synchronizeTitle(roster, previous, oldCharacter);
      }
      const slot = ensureSlot(roster, role, ordinal, now);
      if ((role.generateSuccessors ?? org.generateSuccessors) && slot.characterId === undefined)
        materializeSlots({ slotIds: [slot.id], mode: "simulation" });
    }
  }
  synchronizeFamily(roster);
  roster.lastYear = now;
}

/** Protect memo sheets and selected immutable fields from every downstream tick system. */
export function registerRosterLifecycle(api: SimulationExtensionAPI): () => void {
  let memo = new Map<number, ReturnType<typeof structuredClone>>();
  const unregisterBefore = api.registerSimulationSystem({
    id: "characters.roster.prepare",
    phase: "clock",
    cadence: { every: 1 },
    reads: ["extension.characters"],
    writes: ["extension.characters"],
    run: context => {
      if (!api.isExtensionEnabled("characters")) return;
      memo = new Map(
        getCharacters()
          .filter(c => c.rosterMode === "memo")
          .map(c => [c.i, structuredClone(c)])
      );
      if (!api.isExtensionEnabled("nobility")) {
        const years = context.delta.years + context.delta.months / 12 + context.delta.days / 365.2425;
        advanceCharacterHealth(years);
        advanceCharacterAging(years);
      }
    }
  });
  const unregisterAfter = api.registerSimulationSystem({
    id: "characters.roster.finalize",
    phase: "finalize",
    cadence: { every: 1 },
    after: ["characters.expertise"],
    reads: ["simulation.clock", "extension.characters"],
    writes: ["extension.characters", "extension.economy"],
    run: (_context, writer) => {
      if (!api.isExtensionEnabled("characters")) return;
      advanceRoster();
      for (const c of getCharacters()) {
        const saved = memo.get(c.i);
        if (saved) {
          for (const key of Object.keys(c)) delete (c as unknown as Record<string, unknown>)[key];
          Object.assign(c, saved);
        }
        const slot = readRoster()?.slots.find(s => s.characterId === c.i);
        if (!slot) continue;
        for (const field of slot.protection.fields) {
          if (["notes", "birthYear", "organizationId", "familyRelations"].includes(field)) continue;
          if (Object.hasOwn(slot.protection.values, field))
            (c as unknown as Record<string, unknown>)[field] = structuredClone(slot.protection.values[field]);
        }
      }
      writer.markChanged("extension.characters", "extension.economy");
    }
  });
  return () => {
    unregisterAfter();
    unregisterBefore();
  };
}
