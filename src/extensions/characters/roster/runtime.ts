import { getDayOfYear, getDaysInMonth, isLeapYear } from "../../../utils/seasonUtils";
import { getApi, getCharacters, getWorldContext, hasCharactersContext, nextCharacterId } from "../charactersContext";
import type { Character } from "../characterTypes";
import { lifetimeExpectedBirths, resolveFertilityForRace } from "../fertility";
import { prepareCharacterFinance } from "../financialLifecycle";
import { createPerson } from "../personFactory";
import { resolveRaceAgeProfile } from "../raceAge";
import {
  createRoster,
  currentAppointment,
  emptyProtection,
  invalidateRosterIndex,
  latestRoleSlot,
  organizationScope,
  roleGenerationCount,
  rosterRandom,
  rosterSlotById,
  selectedRoles,
  stopKey
} from "./model";
import type { PersonSlot, RosterOrganization, RosterRole, RosterSelection, WorldRoster } from "./types";

export function clockYear(): number {
  const s = getApi().simulationContext;
  const y = s.currentYear ?? (Number(getWorldContext().options.year) || 1000);
  return y + (getDayOfYear(y, s.currentMonth ?? 1, s.currentDay ?? 1) - 1) / (isLeapYear(y) ? 366 : 365);
}
export function yearAfterDays(days: number): number {
  const s = getApi().simulationContext;
  let year = s.currentYear,
    month = s.currentMonth,
    day = s.currentDay + days;
  while (day > getDaysInMonth(year, month)) {
    day -= getDaysInMonth(year, month);
    if (++month > 12) {
      month = 1;
      year++;
    }
  }
  return year + (getDayOfYear(year, month, day) - 1) / (isLeapYear(year) ? 366 : 365);
}
export function readRoster(): WorldRoster | undefined {
  if (!hasCharactersContext()) return undefined;
  return getApi().simulationContext?.extensions?.characters?.roster as WorldRoster | undefined;
}
export function ensureRoster(): WorldRoster {
  const extensions = getApi().simulationContext.extensions;
  extensions.characters ??= {};
  const existing = readRoster();
  if (existing) return existing;
  const roster = createRoster(String(getWorldContext().seed), clockYear());
  extensions.characters.roster = roster;
  return roster;
}
export function putOrganization(
  roster: WorldRoster,
  input: Omit<RosterOrganization, "notes" | "simulate" | "generateSuccessors">
) {
  let org = roster.organizations.find(o => o.id === input.id);
  if (!org) {
    org = { ...input, notes: "", simulate: false, generateSuccessors: false };
    roster.organizations.push(org);
  } else {
    // Names and hierarchy become user settings after their first definition.
    org.archived = input.archived;
    org.kind ??= input.kind;
    org.formation ??= input.formation;
    org.polity = input.polity ?? org.polity;
  }
  return org;
}
export function putRole(roster: WorldRoster, role: RosterRole) {
  const existing = roster.roles.find(r => r.id === role.id);
  if (!existing) roster.roles.push(role);
  else {
    existing.purposes ??= role.purposes;
    existing.majorLord ??= role.majorLord;
    existing.occupation ??= role.occupation;
    existing.unresolved ??= role.unresolved;
  }
  return existing ?? role;
}
export function ensureSlot(roster: WorldRoster, role: RosterRole, ordinal: number, year = clockYear()): PersonSlot {
  const appointment = currentAppointment(roster, role.id, ordinal);
  if (appointment) return rosterSlotById(roster, appointment.slotId)!;
  const previous = latestRoleSlot(roster, role.id, ordinal);
  if (previous && role.hereditary) {
    const children = ensureChildren(roster, previous)
      .filter(s => s.birthYear <= year && s.plannedDeathYear > year && s.deathYear === undefined)
      .sort((a, b) => a.birthYear - b.birthYear || a.id.localeCompare(b.id));
    const child = children[0];
    if (
      child &&
      !roster.appointments.some(a => a.roleId === role.id && a.slotId === child.id && a.endYear === undefined)
    ) {
      invalidateRosterIndex(roster);
      child.roleId = role.id;
      child.ordinal = ordinal;
      if (!child.protection.fields.includes("organizationId")) child.organizationId = role.organizationId;
      roster.appointments.push({ roleId: role.id, ordinal, slotId: child.id, startYear: year });
      const org = roster.organizations.find(o => o.id === role.organizationId);
      child.mode = (role.simulate ?? org?.simulate) ? "simulation" : child.mode;
      const person = getCharacters().find(c => c.i === child.characterId);
      if (person) {
        person.rosterMode = child.mode;
        synchronizeTitle(roster, child, person);
      }
      return child;
    }
  }
  const generation = roleGenerationCount(roster, role.id, ordinal);
  const id = `${role.id}:${ordinal}:g${generation}`;
  const world = getWorldContext();
  const organization = roster.organizations.find(o => o.id === role.organizationId)!;
  const state = world.pack.states[organization.stateId];
  const cultureId =
    (organization.stateId ? state?.culture : undefined) ?? world.pack.burgs[organization.burgId ?? 0]?.culture ?? 0;
  const raceId = world.pack.cultures[cultureId]?.race;
  const random = rosterRandom(roster, id);
  const profile = resolveRaceAgeProfile(raceId);
  const age = Math.floor(profile.maturity + (profile.lifespan - profile.maturity) * (0.15 + random() * 0.45));
  const slot: PersonSlot = {
    id,
    organizationId: organization.id,
    roleId: role.id,
    ordinal,
    generation,
    cultureId,
    raceId,
    gender: random() < 0.5 ? "female" : "male",
    birthYear: Math.floor(year) - age,
    plannedDeathYear: Math.floor(year) + Math.max(1, Math.floor((profile.lifespan - age) * (0.5 + random()))),
    mode: (role.simulate ?? organization.simulate) ? "simulation" : "memo",
    notes: "",
    tags: [],
    location: { burgId: organization.burgId ?? state?.capital },
    protection: emptyProtection()
  };
  roster.slots.push(slot);
  roster.appointments.push({ roleId: role.id, ordinal, slotId: id, startYear: year });
  return slot;
}
export function selectedSlots(roster: WorldRoster, selection: RosterSelection): PersonSlot[] {
  if (selection.slotIds) {
    return selection.slotIds.map(id => {
      const slot = roster.slots.find(s => s.id === id);
      if (!slot) throw new Error(`Unknown person slot ${id}`);
      return slot;
    });
  }
  const result: PersonSlot[] = [];
  const limit = selection.limit ?? Infinity;
  if (!(limit > 0) || (limit !== Infinity && !Number.isInteger(limit))) throw new Error("Invalid generation count");
  for (const role of selectedRoles(roster, selection)) {
    for (let i = 0; i < role.count; i++) {
      const slot = ensureSlot(roster, role, i);
      if (slot.characterId !== undefined) continue;
      result.push(slot);
      if (result.length >= limit) return result;
    }
  }
  return result;
}
export function materializeSlots(selection: RosterSelection): number[] {
  const roster = ensureRoster();
  const ids: number[] = [];
  for (const slot of selectedSlots(roster, selection)) {
    if (slot.cancelledBirth || slot.removedFromWorld || slot.birthYear > clockYear()) continue;
    if (slot.characterId !== undefined) {
      ids.push(slot.characterId);
      continue;
    }
    const originalRandom = Math.random;
    Math.random = rosterRandom(roster, `${slot.id}:person`);
    try {
      const characters = getCharacters();
      const id = slot.retainedCharacterId ?? nextCharacterId();
      if (characters.some(c => c.i === id)) throw Error("Retained character id is already occupied");
      const role = roster.roles.find(r => r.id === slot.roleId);
      const org = roster.organizations.find(o => o.id === slot.organizationId)!;
      const targetYear = slot.deathYear ?? clockYear();
      const character = createPerson(id, slot.cultureId, {
        homeStateId: org.stateId,
        ageOverride: Math.max(0, Math.floor(targetYear - slot.birthYear)),
        genderOverride: slot.gender,
        raceOverride: slot.raceId,
        primarySkill: role?.primarySkill,
        roleClass: role?.roleClass ?? "ordinary",
        formName: getWorldContext().pack.states[org.stateId]?.formName
      });
      character.rosterSlotId = slot.id;
      character.rosterMode = selection.mode ?? slot.mode;
      slot.mode = character.rosterMode;
      character.location = slot.location?.burgId;
      character.titles = [];
      character.pastTitles = [];
      character.family = {
        spouses: 0,
        children: 0,
        grandchildren: 0,
        greatGrandchildren: 0,
        childIds: [],
        spouseIds: []
      };
      if (slot.deathYear !== undefined) {
        character.dead = true;
        character.deathYear = slot.deathYear;
      }
      if (slot.retainedAssets) Object.assign(character, structuredClone(slot.retainedAssets));
      prepareCharacterFinance(character, slot);
      // Assign to the canonical slot before exposing the person, so retries reuse it.
      slot.characterId = id;
      characters.push(character);
      for (const field of slot.protection.fields) {
        if (["notes", "birthYear", "organizationId", "familyRelations"].includes(field)) continue;
        slot.protection.values[field] ??= structuredClone((character as unknown as Record<string, unknown>)[field]);
      }
      synchronizeFamily(roster);
      synchronizeTitle(roster, slot, character);
      ids.push(id);
    } finally {
      Math.random = originalRandom;
    }
  }
  return ids;
}
export function synchronizeTitle(roster: WorldRoster, slot: PersonSlot, character: Character): void {
  const roleIds = new Set(
    roster.appointments.filter(a => a.slotId === slot.id && a.endYear === undefined).map(a => a.roleId)
  );
  if (slot.roleId) roleIds.add(slot.roleId);
  for (const role of roster.roles.filter(r => roleIds.has(r.id))) synchronizeRoleTitle(roster, slot, character, role);
}
function synchronizeRoleTitle(roster: WorldRoster, slot: PersonSlot, character: Character, role: RosterRole): void {
  const org = roster.organizations.find(o => o.id === role.organizationId)!;
  const live =
    !character.dead &&
    slot.mode === "simulation" &&
    roster.appointments.some(a => a.slotId === slot.id && a.roleId === role.id && a.endYear === undefined);
  if (role.id === `state:${org.stateId}:court:ruler`) {
    const extensions = getApi().simulationContext.extensions;
    extensions.nobility ??= {};
    extensions.nobility.rulerIdByState ??= {};
    const rulers = extensions.nobility.rulerIdByState as Record<number, number>;
    if (live) rulers[org.stateId] = character.i;
    else if (rulers[org.stateId] === character.i) delete rulers[org.stateId];
  }
  if (role.regimentId !== undefined) {
    const regiment = getWorldContext().pack.states[org.stateId]?.military?.find(r => r.i === role.regimentId);
    if (regiment) regiment.commanderId = live ? character.i : undefined;
  }
  if (role.characterRole) {
    character.roles ??= [];
    const match = character.roles.find(
      r =>
        r.source === role.characterRole!.source &&
        r.kind === role.characterRole!.kind &&
        r.entityId === role.characterRole!.entityId &&
        r.domain === role.characterRole!.domain &&
        r.organizationId === role.characterRole!.organizationId &&
        r.endYear === undefined
    );
    if (live && !match) character.roles.push({ ...role.characterRole, startYear: Math.floor(clockYear()) });
    if (!live && match) match.endYear = Math.floor(clockYear());
    if (role.characterRole.kind === "marketManager" || role.characterRole.kind === "marketRivalMerchant") {
      const economy = getApi().simulationContext.extensions.economy;
      const market = (
        economy?.markets as { i: number; managerCharacterId?: number; rivalCharacterIds?: number[] }[] | undefined
      )?.find(m => m.i === role.characterRole!.entityId);
      if (market) {
        if (role.characterRole.kind === "marketManager") market.managerCharacterId = live ? character.i : undefined;
        else
          market.rivalCharacterIds = [
            ...new Set([
              ...(market.rivalCharacterIds ?? []).filter(id => id !== character.i),
              ...(live ? [character.i] : [])
            ])
          ];
      }
    }
    if (role.characterRole.kind.startsWith("merchantOrganization")) {
      const companies = getApi().simulationContext.extensions.economy?.merchantOrganizations as
        | {
            i: number;
            chairpersonCharacterId: number;
            secretaryCharacterId?: number;
            bodyguardCharacterId?: number;
            memberCharacterIds: number[];
          }[]
        | undefined;
      const company = companies?.find(o => o.i === role.characterRole!.organizationId);
      if (company) {
        if (role.characterRole.kind === "merchantOrganizationHead")
          company.chairpersonCharacterId = live ? character.i : 0;
        if (role.characterRole.kind === "merchantOrganizationSecretary")
          company.secretaryCharacterId = live ? character.i : undefined;
        if (role.characterRole.kind === "merchantOrganizationBodyguard")
          company.bodyguardCharacterId = live ? character.i : undefined;
        company.memberCharacterIds = [
          ...new Set([...company.memberCharacterIds.filter(id => id !== character.i), ...(live ? [character.i] : [])])
        ];
      }
    }
    return;
  }
  const existing = character.titles.find(
    t =>
      t.entityType === role.entityType &&
      t.entityId === role.entityId &&
      t.title === (character.gender === "female" ? (role.femaleName ?? role.name) : role.name)
  );
  if (!live) {
    if (existing) {
      character.titles.splice(character.titles.indexOf(existing), 1);
      character.pastTitles.push({ ...existing, endYear: Math.floor(clockYear()) });
    }
  } else if (!existing) {
    character.titles.push({
      title: character.gender === "female" ? (role.femaleName ?? role.name) : role.name,
      entityType: role.entityType,
      entityId: role.entityId,
      landed: role.landed,
      startYear: Math.floor(clockYear()),
      seatName: org.name
    });
  }
}
export function synchronizeFamily(roster: WorldRoster): void {
  const byId = new Map(getCharacters().map(c => [c.i, c]));
  const slots = new Map(roster.slots.map(s => [s.id, s]));
  for (const s of roster.slots) {
    const c = byId.get(s.characterId ?? -1);
    if (!c?.family) continue;
    const children = roster.family
      .filter(f => f.parentId === s.id)
      .map(f => slots.get(f.childId)!)
      .filter(child => !child.cancelledBirth && child.birthYear <= clockYear());
    c.family.children = children.length;
    c.family.childIds = children.flatMap(child => (child.characterId !== undefined ? [child.characterId] : []));
    const partners = roster.links
      .filter(l => l.kind === "spouse" && (l.fromId === s.id || l.toId === s.id))
      .map(l => slots.get(l.fromId === s.id ? l.toId : l.fromId)!);
    c.family.spouses = partners.length;
    c.family.spouseIds = partners.flatMap(partner => (partner.characterId !== undefined ? [partner.characterId] : []));
    for (const f of roster.family.filter(f => f.childId === s.id && f.kind === "birth")) {
      const parent = slots.get(f.parentId)!;
      if (parent.characterId === undefined) continue;
      if (parent.gender === "female") c.family.motherId = parent.characterId;
      else c.family.fatherId = parent.characterId;
    }
  }
}
export function ensureChildren(roster: WorldRoster, parent: PersonSlot): PersonSlot[] {
  if (parent.protection.fields.includes("familyRelations")) {
    return roster.family.filter(f => f.parentId === parent.id).map(f => roster.slots.find(s => s.id === f.childId)!);
  }
  if (!parent.childPlan) {
    const fertility = resolveFertilityForRace(parent.raceId);
    const random = rosterRandom(roster, `${parent.id}:family`);
    const count = Math.max(0, Math.round(lifetimeExpectedBirths(fertility) * random() * 0.75));
    parent.childPlan = Array.from({ length: count }, () => ({
      birthYear: Math.floor(
        parent.birthYear +
          fertility.fertilityStart +
          random() *
            Math.max(
              0,
              Math.min(fertility.fertilityEnd, parent.plannedDeathYear - parent.birthYear) - fertility.fertilityStart
            )
      ),
      gender: random() < 0.5 ? ("female" as const) : ("male" as const)
    }))
      .filter(c => c.birthYear < parent.plannedDeathYear)
      .sort((a, b) => a.birthYear - b.birthYear);
  }
  const profile = resolveRaceAgeProfile(parent.raceId);
  for (const f of roster.family.filter(f => f.parentId === parent.id && f.kind === "birth")) {
    const child = roster.slots.find(s => s.id === f.childId);
    if (child && parent.deathYear !== undefined && child.birthYear > parent.deathYear) child.cancelledBirth = true;
  }
  for (const [i, plan] of parent.childPlan.entries()) {
    if (parent.deathYear !== undefined && plan.birthYear > parent.deathYear) continue;
    const id = `${parent.id}:child:${i}`;
    if (roster.slots.some(s => s.id === id)) continue;
    const random = rosterRandom(roster, id);
    const protection = emptyProtection();
    if (parent.protection.track === "all" || (parent.protection.track !== "none" && i === 0)) {
      protection.track = parent.protection.track;
      protection.materializeDescendants = parent.protection.materializeDescendants;
    }
    roster.slots.push({
      id,
      organizationId: parent.organizationId,
      generation: parent.generation + 1,
      cultureId: parent.cultureId,
      raceId: parent.raceId,
      gender: plan.gender,
      birthYear: plan.birthYear,
      plannedDeathYear: plan.birthYear + Math.max(profile.maturity, Math.floor(profile.lifespan * (0.5 + random()))),
      mode: parent.mode,
      notes: "",
      tags: [],
      location: { ...parent.location },
      protection
    });
    roster.family.push({ parentId: parent.id, childId: id, kind: "birth" });
  }
  synchronizeFamily(roster);
  return roster.family.filter(f => f.parentId === parent.id).map(f => roster.slots.find(s => s.id === f.childId)!);
}
export function migrateCharacters(roster: WorldRoster): void {
  for (const character of getCharacters()) {
    if (roster.slots.some(s => s.characterId === character.i)) continue;
    const stateId = character.state || character.nationalityStateId || 0;
    const matchingRoles = roster.roles.filter(
      r =>
        character.titles.some(
          t =>
            t.entityType === r.entityType &&
            t.entityId === r.entityId &&
            (t.title === r.name || t.title === r.femaleName)
        ) ||
        (r.characterRole &&
          character.roles?.some(
            cr =>
              cr.endYear === undefined &&
              cr.source === r.characterRole!.source &&
              cr.kind === r.characterRole!.kind &&
              cr.entityId === r.characterRole!.entityId &&
              cr.domain === r.characterRole!.domain
          ))
    );
    const org =
      roster.organizations.find(o => o.id === matchingRoles[0]?.organizationId) ??
      roster.organizations.find(o => o.id === `state:${stateId}:court`) ??
      putOrganization(roster, { id: `legacy:${stateId}`, name: "Independent people", stateId });
    const id = `legacy:${character.i}`;
    const profile = resolveRaceAgeProfile(character.race);
    const random = rosterRandom(roster, id);
    const birthYear = Math.floor(clockYear()) - character.age;
    const role = matchingRoles[0];
    const slot: PersonSlot = {
      id,
      organizationId: org.id,
      roleId: role?.id,
      ordinal: role
        ? roster.appointments.filter(a => a.roleId === role.id && a.endYear === undefined).length
        : undefined,
      generation: 0,
      cultureId: character.culture,
      raceId: character.race,
      gender: character.gender,
      birthYear,
      plannedDeathYear: Math.max(clockYear() + 1, birthYear + profile.lifespan * (0.75 + random() * 0.5)),
      deathYear: character.dead ? (character.deathYear ?? Math.floor(clockYear())) : undefined,
      characterId: character.i,
      mode: "simulation",
      notes: "",
      tags: [],
      location: { burgId: character.location },
      protection: emptyProtection()
    };
    roster.slots.push(slot);
    for (const match of matchingRoles) {
      match.count = Math.max(match.count, (slot.ordinal ?? 0) + 1);
      roster.appointments.push({
        roleId: match.id,
        ordinal: slot.ordinal,
        slotId: id,
        startYear: birthYear + profile.maturity,
        endYear: slot.deathYear
      });
    }
    character.rosterSlotId = id;
    character.rosterMode = "simulation";
  }
  const migrated = [...roster.slots];
  for (const slot of migrated) {
    const character = getCharacters().find(c => c.i === slot.characterId);
    if (!character) continue;
    const relate = (parentId: string, childId: string) => {
      if (parentId !== childId && !roster.family.some(f => f.parentId === parentId && f.childId === childId))
        roster.family.push({ parentId, childId, kind: "birth" });
    };
    for (const childId of character.family?.childIds ?? []) {
      const child = roster.slots.find(s => s.characterId === childId);
      if (child) relate(slot.id, child.id);
    }
    for (const id of [character.family?.fatherId, character.family?.motherId]) {
      const parent = id === undefined ? undefined : roster.slots.find(s => s.characterId === id);
      if (parent) relate(parent.id, slot.id);
    }
    for (const id of character.family?.spouseIds ?? []) {
      const partner = roster.slots.find(s => s.characterId === id);
      if (
        partner &&
        !roster.links.some(
          l =>
            l.kind === "spouse" &&
            ((l.fromId === slot.id && l.toId === partner.id) || (l.toId === slot.id && l.fromId === partner.id))
        )
      )
        roster.links.push({ fromId: slot.id, toId: partner.id, kind: "spouse" });
    }
    const knownPartners = roster.links.filter(
      l => l.kind === "spouse" && (l.fromId === slot.id || l.toId === slot.id)
    ).length;
    if (slot.id.startsWith("legacy:"))
      for (let i = knownPartners; i < (character.family?.spouses ?? 0); i++) {
        const id = `${slot.id}:partner:${i}`;
        if (!roster.slots.some(s => s.id === id))
          roster.slots.push({
            id,
            organizationId: slot.organizationId,
            generation: slot.generation,
            cultureId: slot.cultureId,
            raceId: slot.raceId,
            gender: slot.gender === "female" ? "male" : "female",
            birthYear: slot.birthYear,
            plannedDeathYear: slot.plannedDeathYear,
            mode: slot.mode,
            notes: "",
            tags: [],
            protection: emptyProtection()
          });
        if (!roster.links.some(l => l.kind === "spouse" && l.fromId === slot.id && l.toId === id))
          roster.links.push({ fromId: slot.id, toId: id, kind: "spouse" });
      }
    if (slot.id.startsWith("legacy:") && slot.childPlan === undefined) {
      const known = roster.family.filter(f => f.parentId === slot.id).length;
      const missing = Math.max(0, (character.family?.children ?? 0) - known);
      const random = rosterRandom(roster, `${slot.id}:legacy-family`);
      const fertility = resolveFertilityForRace(slot.raceId);
      const start = slot.birthYear + fertility.fertilityStart;
      const end = Math.min(clockYear(), slot.plannedDeathYear, slot.birthYear + fertility.fertilityEnd);
      slot.childPlan =
        end >= start
          ? Array.from({ length: missing }, () => ({
              birthYear: Math.floor(start + random() * (end - start)),
              gender: random() < 0.5 ? ("female" as const) : ("male" as const)
            })).sort((a, b) => a.birthYear - b.birthYear)
          : [];
    }
  }
  // Create only lightweight records for anonymous children already mentioned by old saves.
  for (const slot of migrated)
    if (slot.id.startsWith("legacy:") && slot.childPlan?.length) ensureChildren(roster, slot);
}
export function setScope(
  roster: WorldRoster,
  selection: RosterSelection,
  simulate: boolean,
  successors: boolean
): void {
  const scope = organizationScope(roster, selection.organizationId, selection.descendants);
  if (!selection.slotIds && !selection.roleId)
    for (const o of roster.organizations)
      if (scope.has(o.id)) {
        o.simulate = simulate;
        o.generateSuccessors = successors;
      }
  if (selection.roleId)
    for (const role of selectedRoles(roster, selection)) {
      role.simulate = simulate;
      role.generateSuccessors = successors;
    }
  for (const slot of roster.slots) {
    if (
      selection.slotIds
        ? !selection.slotIds.includes(slot.id)
        : !scope.has(slot.organizationId) || (selection.roleId !== undefined && slot.roleId !== selection.roleId)
    )
      continue;
    slot.mode = simulate ? "simulation" : "memo";
    const character = getCharacters().find(c => c.i === slot.characterId);
    if (character) {
      character.rosterMode = slot.mode;
      synchronizeTitle(roster, slot, character);
    }
  }
}
export function continueRoster(roster: WorldRoster): void {
  if (roster.pending) {
    roster.acknowledged.push(stopKey(roster.pending));
    delete roster.pending;
  }
}
