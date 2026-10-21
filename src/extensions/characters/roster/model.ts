import Alea from "alea";
import { validatePresetData } from "./presetValidation";
import type {
  PersonSlot,
  RosterAppointment,
  RosterProtection,
  RosterSelection,
  RosterStop,
  WorldRoster
} from "./types";

export const LOCKABLE_FIELDS = new Set([
  "name",
  "looks",
  "appearance",
  "location",
  "family",
  "culture",
  "race",
  "gender",
  "skills",
  "notes",
  "birthYear",
  "familyRelations",
  "organizationId"
]);

export const emptyProtection = (): RosterProtection => ({
  fields: [],
  values: {},
  track: "none",
  stopBeforeDeath: false,
  stopOnBirth: false,
  stopOnAppointment: false,
  materializeDescendants: false
});
export function createRoster(seed: string, year: number): WorldRoster {
  return {
    version: 1,
    seed,
    organizations: [],
    roles: [],
    slots: [],
    appointments: [],
    family: [],
    links: [],
    acknowledged: [],
    remainingDays: 0,
    lastYear: year
  };
}
export function rosterRandom(roster: WorldRoster, key: string): () => number {
  return Alea(`${roster.seed}:roster:v1:${key}`);
}
export function organizationScope(roster: WorldRoster, id?: string, descendants = false): Set<string> {
  if (!id) return new Set(roster.organizations.filter(o => !o.archived).map(o => o.id));
  const ids = new Set([id]);
  if (descendants) {
    for (let changed = true; changed; ) {
      changed = false;
      for (const organization of roster.organizations) {
        if (
          !organization.archived &&
          organization.parentId &&
          ids.has(organization.parentId) &&
          !ids.has(organization.id)
        ) {
          ids.add(organization.id);
          changed = true;
        }
      }
    }
  }
  return ids;
}
export function selectedRoles(roster: WorldRoster, selection: RosterSelection) {
  const ids = organizationScope(roster, selection.organizationId, selection.descendants);
  return roster.roles.filter(
    role => ids.has(role.organizationId) && (!selection.roleId || role.id === selection.roleId)
  );
}
interface RosterIndex {
  slotRecords: PersonSlot[];
  appointmentRecords: RosterAppointment[];
  slotsSeen: number;
  appointmentsSeen: number;
  byId: Map<string, PersonSlot>;
  latest: Map<string, PersonSlot>;
  generations: Map<string, number>;
  appointments: Map<string, RosterAppointment>;
}
const indexes = new WeakMap<WorldRoster, RosterIndex>();
export function invalidateRosterIndex(roster: WorldRoster): void {
  indexes.delete(roster);
}
function rosterIndex(roster: WorldRoster): RosterIndex {
  let index = indexes.get(roster);
  if (!index || index.slotRecords !== roster.slots || index.appointmentRecords !== roster.appointments) {
    index = {
      slotRecords: roster.slots,
      appointmentRecords: roster.appointments,
      slotsSeen: 0,
      appointmentsSeen: 0,
      byId: new Map(),
      latest: new Map(),
      generations: new Map(),
      appointments: new Map()
    };
    indexes.set(roster, index);
  }
  for (; index.slotsSeen < roster.slots.length; index.slotsSeen++) {
    const slot = roster.slots[index.slotsSeen];
    index.byId.set(slot.id, slot);
  }
  for (; index.appointmentsSeen < roster.appointments.length; index.appointmentsSeen++) {
    const a = roster.appointments[index.appointmentsSeen],
      slot = index.byId.get(a.slotId);
    const ordinal = a.ordinal ?? slot?.ordinal;
    if (slot && ordinal !== undefined) {
      const key = `${a.roleId}:${ordinal}`;
      index.appointments.set(key, a);
      index.latest.set(key, slot);
      index.generations.set(key, (index.generations.get(key) ?? 0) + 1);
    }
  }
  return index;
}
export function rosterSlotById(roster: WorldRoster, id: string): PersonSlot | undefined {
  return rosterIndex(roster).byId.get(id);
}
export function currentAppointment(roster: WorldRoster, roleId: string, ordinal: number) {
  const appointment = rosterIndex(roster).appointments.get(`${roleId}:${ordinal}`);
  return appointment?.endYear === undefined ? appointment : undefined;
}
export function latestRoleSlot(roster: WorldRoster, roleId: string, ordinal: number): PersonSlot | undefined {
  return rosterIndex(roster).latest.get(`${roleId}:${ordinal}`);
}
export function roleGenerationCount(roster: WorldRoster, roleId: string, ordinal: number): number {
  return rosterIndex(roster).generations.get(`${roleId}:${ordinal}`) ?? 0;
}

export function summarizeRoster(roster: WorldRoster, selection: RosterSelection) {
  const roles = selectedRoles(roster, selection);
  const roleIds = new Set(roles.map(r => r.id));
  const scope = organizationScope(roster, selection.organizationId, selection.descendants);
  const appointments = roster.appointments.filter(a => roleIds.has(a.roleId) && a.endYear === undefined);
  const assigned = new Set(appointments.map(a => a.slotId));
  const slots = roster.slots.filter(s => scope.has(s.organizationId) && s.deathYear === undefined);
  return {
    required: roles.reduce((sum, r) => sum + r.count, 0),
    assigned: roles.reduce((sum, r) => sum + r.count, 0),
    vacant: 0,
    people: roles.reduce((sum, r) => sum + r.count, 0) - (appointments.length - assigned.size),
    materialized: slots.filter(s => s.characterId !== undefined).length,
    detailedRoles: new Set(
      appointments.filter(a => roster.slots.find(s => s.id === a.slotId)?.characterId !== undefined).map(a => a.slotId)
    ).size,
    unmaterialized:
      roles.reduce((sum, r) => sum + r.count, 0) -
      new Set(
        appointments
          .filter(a => roster.slots.find(s => s.id === a.slotId)?.characterId !== undefined)
          .map(a => a.slotId)
      ).size
  };
}
export function stopKey(stop: RosterStop): string {
  return `${stop.slotId}:${stop.kind}:${stop.year}`;
}
export function nextRosterStop(roster: WorldRoster, fromYear: number, toYear: number): RosterStop | undefined {
  if (roster.pending) return roster.pending;
  const events: RosterStop[] = [];
  for (const slot of roster.slots) {
    if (slot.cancelledBirth || slot.deathYear !== undefined || slot.mode !== "simulation") continue;
    const p = slot.protection;
    const add = (kind: RosterStop["kind"], year: number, message: string) => {
      const event = { slotId: slot.id, kind, year, message };
      if (year >= fromYear - 1e-8 && year <= toYear + 1e-8 && !roster.acknowledged.includes(stopKey(event)))
        events.push(event);
    };
    if (p.watchAge !== undefined) add("age", slot.birthYear + p.watchAge, `Observed age ${p.watchAge}`);
    if (p.stopBeforeDeath) add("death", slot.plannedDeathYear, "Observed death is pending");
    if (p.stopOnBirth)
      for (const child of slot.childPlan ?? []) add("birth", child.birthYear, "Observed birth is pending");
    if (p.stopOnAppointment) {
      for (const a of roster.appointments)
        if (a.slotId === slot.id) add("appointment", a.startYear, "Observed appointment");
    }
  }
  return events.sort((a, b) => a.year - b.year || a.slotId.localeCompare(b.slotId) || a.kind.localeCompare(b.kind))[0];
}

/** Archive boundary: reject malformed records before any graph traversal or materialization. */
export function validateWorldRoster(value: unknown): asserts value is WorldRoster {
  const fail = (): never => {
    throw new Error("Invalid character organization roster");
  };
  if (!value || typeof value !== "object") fail();
  const r = value as WorldRoster;
  if (
    r.version !== 1 ||
    typeof r.seed !== "string" ||
    !Number.isFinite(r.lastYear) ||
    !Number.isFinite(r.remainingDays) ||
    r.remainingDays < 0
  )
    fail();
  for (const field of ["organizations", "roles", "slots", "appointments", "family", "links", "acknowledged"] as const) {
    if (!Array.isArray(r[field])) fail();
  }
  const unique = (items: { id: string }[]) => {
    const ids = new Set<string>();
    for (const item of items) {
      if (!item || typeof item.id !== "string" || !item.id || ids.has(item.id)) fail();
      ids.add(item.id);
    }
    return ids;
  };
  const orgs = unique(r.organizations),
    roles = unique(r.roles),
    slots = unique(r.slots);
  const assertAcyclic = (edges: [string, string][]) => {
    const parents = new Map<string, string[]>();
    for (const [a, b] of edges) parents.set(a, [...(parents.get(a) ?? []), b]);
    const visiting = new Set<string>(),
      visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) fail();
      if (visited.has(id)) return;
      visiting.add(id);
      for (const parent of parents.get(id) ?? []) visit(parent);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of parents.keys()) visit(id);
  };
  for (const o of r.organizations) {
    if (
      typeof o.name !== "string" ||
      typeof o.notes !== "string" ||
      !Number.isInteger(o.stateId) ||
      o.stateId < 0 ||
      typeof o.simulate !== "boolean" ||
      typeof o.generateSuccessors !== "boolean" ||
      (o.parentId && !orgs.has(o.parentId))
    )
      fail();
  }
  assertAcyclic(r.organizations.filter(o => o.parentId).map(o => [o.id, o.parentId!]));
  for (const role of r.roles) {
    if (
      !orgs.has(role.organizationId) ||
      typeof role.roleClass !== "string" ||
      typeof role.primarySkill !== "string" ||
      typeof role.reason !== "string" ||
      typeof role.landed !== "boolean" ||
      typeof role.hereditary !== "boolean" ||
      !Number.isInteger(role.count) ||
      role.count < 0 ||
      typeof role.name !== "string" ||
      !["state", "province", "burg", "holding"].includes(role.entityType) ||
      !Number.isInteger(role.entityId)
    )
      fail();
  }
  const characterIds = new Set<number>();
  for (const slot of r.slots) {
    if (
      !orgs.has(slot.organizationId) ||
      (slot.roleId && !roles.has(slot.roleId)) ||
      !Number.isFinite(slot.birthYear) ||
      !Number.isFinite(slot.plannedDeathYear) ||
      slot.plannedDeathYear < slot.birthYear ||
      (slot.deathYear !== undefined && (!Number.isFinite(slot.deathYear) || slot.deathYear < slot.birthYear)) ||
      !["memo", "simulation"].includes(slot.mode) ||
      typeof slot.notes !== "string" ||
      !Array.isArray(slot.tags) ||
      !slot.tags.every(t => typeof t === "string") ||
      !slot.protection ||
      !Array.isArray(slot.protection.fields) ||
      !slot.protection.values ||
      typeof slot.protection.values !== "object" ||
      Array.isArray(slot.protection.values) ||
      !slot.protection.fields.every(f => LOCKABLE_FIELDS.has(f)) ||
      ![
        slot.protection.stopBeforeDeath,
        slot.protection.stopOnBirth,
        slot.protection.stopOnAppointment,
        slot.protection.materializeDescendants
      ].every(v => typeof v === "boolean") ||
      !["none", "branch", "all", "heir"].includes(slot.protection.track) ||
      (slot.protection.watchAge !== undefined &&
        (!Number.isFinite(slot.protection.watchAge) || slot.protection.watchAge < 0))
    )
      fail();
    if (slot.characterId !== undefined) {
      if (!Number.isInteger(slot.characterId) || slot.characterId < 1 || characterIds.has(slot.characterId)) fail();
      characterIds.add(slot.characterId);
    }
    if (
      slot.childPlan &&
      (!Array.isArray(slot.childPlan) ||
        slot.childPlan.some(c => !Number.isFinite(c.birthYear) || c.birthYear <= slot.birthYear))
    )
      fail();
  }
  for (const link of r.family) {
    if (!slots.has(link.parentId) || !slots.has(link.childId) || !["birth", "adoption"].includes(link.kind)) fail();
    if (
      link.kind === "birth" &&
      r.slots.find(s => s.id === link.parentId)!.birthYear >= r.slots.find(s => s.id === link.childId)!.birthYear
    )
      fail();
  }
  assertAcyclic(r.family.map(f => [f.childId, f.parentId]));
  const assigned = new Set<string>();
  const roleCounts = new Map<string, number>();
  for (const a of r.appointments) {
    if (
      !slots.has(a.slotId) ||
      !roles.has(a.roleId) ||
      !Number.isFinite(a.startYear) ||
      (a.endYear !== undefined && (!Number.isFinite(a.endYear) || a.endYear < a.startYear))
    )
      fail();
    if (a.endYear === undefined) {
      const key = `${a.roleId}:${a.slotId}`;
      if (assigned.has(key)) fail();
      assigned.add(key);
      roleCounts.set(a.roleId, (roleCounts.get(a.roleId) ?? 0) + 1);
    }
  }
  for (const [id, count] of roleCounts) if (count > r.roles.find(role => role.id === id)!.count) fail();
  for (const link of r.links) {
    const ids = link.kind === "spouse" ? slots : orgs;
    if (!ids.has(link.fromId) || !ids.has(link.toId) || link.fromId === link.toId) fail();
  }
  validatePresetData(r);
  if (!r.acknowledged.every(k => typeof k === "string")) fail();
  if (
    r.pending &&
    (!slots.has(r.pending.slotId) ||
      !Number.isFinite(r.pending.year) ||
      !["age", "death", "birth", "appointment", "extinction", "conflict"].includes(r.pending.kind) ||
      typeof r.pending.message !== "string")
  )
    fail();
}
export function slotLabel(slot: PersonSlot): string {
  return slot.roleId ? `${slot.roleId.split(":").at(-1)} #${(slot.ordinal ?? 0) + 1}` : slot.id;
}
