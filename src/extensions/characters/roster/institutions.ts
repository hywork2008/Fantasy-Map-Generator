import { getWorldContext } from "../charactersContext";
import { invalidateRosterIndex } from "./model";
import { clockYear, putOrganization, putRole } from "./runtime";
import type { RosterRole, WorldRoster } from "./types";

export interface ChurchSetup {
  religionId: number;
  name: string;
  burgIds: number[];
  parishPopulation: number;
  citiesPerDiocese: number;
  adherentShare: number;
}
export function religiousSiteCandidates(religionId: number) {
  const world = getWorldContext();
  return world.pack.burgs
    .filter(b => b?.i && !b.removed && world.pack.cells.religion?.[b.cell] === religionId)
    .map(b => ({
      id: b.i!,
      name: b.name,
      stateId: b.state ?? 0,
      temple: !!b.temple,
      population: Math.max(
        0,
        Math.round((b.population ?? 0) * (world.populationRate || 1000) * (world.urbanization || 1))
      )
    }));
}
export function validateChurchSetup(value: unknown): asserts value is ChurchSetup {
  if (!value || typeof value !== "object") throw Error("Invalid church setup");
  const v = value as ChurchSetup,
    pack = getWorldContext().pack;
  if (
    !Number.isInteger(v.religionId) ||
    !pack.religions?.[v.religionId] ||
    pack.religions[v.religionId].removed ||
    v.religionId <= 0 ||
    typeof v.name !== "string" ||
    !v.name.trim() ||
    !Array.isArray(v.burgIds) ||
    !v.burgIds.length ||
    !v.burgIds.every(id => Number.isInteger(id) && id > 0 && pack.burgs[id] && !pack.burgs[id].removed) ||
    !Number.isInteger(v.parishPopulation) ||
    v.parishPopulation < 1 ||
    !Number.isInteger(v.citiesPerDiocese) ||
    v.citiesPerDiocese < 1 ||
    !Number.isFinite(v.adherentShare) ||
    v.adherentShare <= 0 ||
    v.adherentShare > 1
  )
    throw Error("Invalid church setup");
}
/** Explicit world-building operation. This creates institutions, never Characters or contracts. */
export function establishChurch(roster: WorldRoster, value: unknown): string {
  validateChurchSetup(value);
  const v = value,
    world = getWorldContext(),
    pack = world.pack;
  const burgs = [...new Set(v.burgIds)].map(id => pack.burgs[id]).sort((a, b) => a.i! - b.i!);
  for (const burg of burgs) {
    const priorShare = roster.organizations
      .filter(o => !o.archived && o.religiousKind === "urban" && o.burgId === burg.i && o.religionId === v.religionId)
      .reduce((sum, o) => sum + (o.adherentShare ?? 0), 0);
    if (priorShare + v.adherentShare > 1.000001)
      throw Error("Adherent shares for churches of the same religion exceed 100% in a city.");
  }
  const id = `religion:${v.religionId}:church:${roster.organizations.length + 1}`;
  const activityStateIds = [...new Set(burgs.map(b => b.state ?? 0))];
  const church = putOrganization(roster, {
    id,
    name: v.name.trim(),
    kind: "religious",
    religiousKind: "church",
    stateId: 0,
    activityStateIds,
    religionId: v.religionId,
    burgId: burgs[0].i
  });
  church.notes = "User-confirmed church profile. Adherent population is an estimate; this is not a census.";
  const role = (
    organizationId: string,
    key: string,
    name: string,
    count: number,
    purposes: RosterRole["purposes"],
    burgId: number
  ) =>
    putRole(roster, {
      id: `${organizationId}:${key}`,
      organizationId,
      name,
      count,
      purposes,
      primarySkill: "learning",
      reason: `Church profile: ${v.parishPopulation} estimated adherents/parish; ${v.citiesPerDiocese} cities/diocese`,
      roleClass: "central_officer",
      entityType: "burg",
      entityId: burgId,
      landed: false,
      hereditary: false
    });
  role(id, "head", "Religious Head", 1, ["religiousHead"], burgs[0].i!);
  const remaining = new Set(burgs);
  let dioceseIndex = 0;
  while (remaining.size) {
    const anchor = [...remaining][0];
    const cluster = [...remaining]
      .sort(
        (a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y) || a.i! - b.i!
      )
      .slice(0, v.citiesPerDiocese);
    const dioceseId = `${id}:diocese:${dioceseIndex++}`;
    putOrganization(roster, {
      id: dioceseId,
      name: `${anchor.name} Diocese`,
      parentId: id,
      stateId: 0,
      burgId: anchor.i,
      activityStateIds: [...new Set(cluster.map(b => b.state ?? 0))],
      kind: "religious",
      religiousKind: "diocese",
      religionId: v.religionId
    });
    role(dioceseId, "bishop", "Bishop", 1, ["bishop"], anchor.i!);
    for (const burg of cluster) {
      remaining.delete(burg);
      const siteId = `${id}:burg:${burg.i}`;
      putOrganization(roster, {
        id: siteId,
        name: `${burg.name} Parish`,
        parentId: dioceseId,
        stateId: burg.state ?? 0,
        activityStateIds: [burg.state ?? 0],
        burgId: burg.i,
        kind: "religious",
        religiousKind: "urban",
        adherentShare: v.adherentShare,
        religionId: v.religionId
      });
      const population =
        (burg.population ?? 0) * (world.populationRate || 1000) * (world.urbanization || 1) * v.adherentShare;
      const count = Math.max(1, Math.ceil(population / v.parishPopulation));
      const lead = role(siteId, "lead", "Parish Rector", 1, ["urbanClergyLead", "parishClergy"], burg.i!);
      if (count > 1) role(siteId, "priests", "Parish Priest", count - 1, ["parishClergy"], burg.i!);
      // Only unambiguously chosen single-church clergy can be migrated automatically.
      const old = roster.roles.find(r => r.id === `burg:${burg.i}:clergy` && r.unresolved);
      if (old) {
        for (const a of roster.appointments.filter(a => a.roleId === old.id && a.endYear === undefined)) {
          const slot = roster.slots.find(s => s.id === a.slotId);
          a.roleId = lead.id;
          a.ordinal = 0;
          if (slot) {
            slot.roleId = lead.id;
            slot.ordinal = 0;
          }
        }
        old.count = 0;
        old.unresolved = false;
      }
    }
  }
  invalidateRosterIndex(roster);
  return id;
}
export function addPatronage(roster: WorldRoster, value: Record<string, unknown>): void {
  const patron = roster.organizations.find(o => o.id === value.patronId && !o.archived);
  const supplier = roster.organizations.find(o => o.id === value.supplierId && !o.archived);
  const role = roster.roles.find(r => r.id === value.roleId && r.organizationId === supplier?.id);
  if (
    !patron ||
    !supplier ||
    patron.id === supplier.id ||
    !role ||
    !Number.isInteger(value.ordinal) ||
    (value.ordinal as number) < 0 ||
    (value.ordinal as number) >= role.count ||
    typeof value.domain !== "string" ||
    !value.domain.trim()
  )
    throw Error("Invalid patronage contract");
  roster.patronage ??= [];
  const contracts = roster.patronage;
  if (
    contracts.some(
      c =>
        c.patronId === patron.id &&
        c.supplierId === supplier.id &&
        c.roleId === role.id &&
        c.ordinal === value.ordinal &&
        c.domain === value.domain &&
        c.endYear === undefined
    )
  )
    return;
  contracts.push({
    id: `patronage:${contracts.length + 1}`,
    patronId: patron.id,
    supplierId: supplier.id,
    roleId: role.id,
    ordinal: value.ordinal as number,
    domain: value.domain.trim(),
    startYear: clockYear()
  });
}
