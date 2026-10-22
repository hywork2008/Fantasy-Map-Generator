import { currentAppointment, latestRoleSlot, organizationScope, rosterSlotById } from "./model";
import {
  type PresetPreview,
  type PresetQuery,
  type PresetSeat,
  type RolePurpose,
  validatePresetQuery
} from "./presetTypes";
import type { RosterRole, WorldRoster } from "./types";

/** A plan freezes institutional inputs as well as the occupant of each selected seat. */
export function seatSignature(roster: WorldRoster, role: RosterRole): string {
  const org = roster.organizations.find(o => o.id === role.organizationId);
  return JSON.stringify([role, org]);
}

export function previewPreset(roster: WorldRoster, query: PresetQuery, year: number): PresetPreview {
  validatePresetQuery(query);
  const master = (query.profile ?? roster.referenceProfile?.id) === "master-20261022-v1";
  const scope = query.organizationId ? organizationScope(roster, query.organizationId, query.descendants) : undefined;
  const orgs = new Map(roster.organizations.map(o => [o.id, o]));
  const suppliers = new Set(
    (roster.patronage ?? [])
      .filter(c => c.startYear <= year && (c.endYear === undefined || c.endYear > year))
      .filter(c => {
        const patron = orgs.get(c.patronId);
        return (
          patron &&
          !patron.archived &&
          (!scope || scope.has(patron.id)) &&
          (!query.stateIds || query.stateIds.includes(patron.stateId))
        );
      })
      .map(c => `${c.roleId}:${c.ordinal}`)
  );
  const matches = (role: RosterRole, ordinal?: number): boolean => {
    const org = orgs.get(role.organizationId);
    if (!org || org.archived || (master && !role.referenceSeats)) return false;
    const inScope =
      (!scope || scope.has(org.id)) &&
      (!query.stateIds ||
        (query.geography === "activity"
          ? (org.activityStateIds ?? [org.stateId]).some(id => query.stateIds!.includes(id))
          : query.stateIds.includes(org.stateId)));
    const has = (...purposes: RolePurpose[]) => purposes.some(p => role.purposes?.includes(p));
    return query.presets.some(preset => {
      if (preset === "court-suppliers")
        return ordinal === undefined
          ? [...suppliers].some(key => key.startsWith(`${role.id}:`))
          : suppliers.has(`${role.id}:${ordinal}`);
      if (!inScope) return false;
      switch (preset) {
        case "master-all":
          return !!role.referenceSeats;
        case "master-markets":
          return !!role.referenceSeats && has("marketHead", "marketMerchant", "companyHead");
        case "master-guilds":
          return !!role.referenceSeats && (has("guildHead") || role.characterRole?.kind === "guildApprentice");
        case "master-nobility":
          return !!role.referenceSeats && has("secularLord", "territorialAdministrator");
        case "master-covert":
          return (
            !!role.referenceSeats &&
            Object.entries(role.referenceSeats).some(
              ([i, id]) =>
                (ordinal === undefined || Number(i) === ordinal) &&
                roster.slots.some(s => s.id === id && s.tags.includes("master:covert"))
            )
          );
        case "state-heads":
          return (master || orgs.get(`state:${org.stateId}`)?.polity !== "Anarchy") && has("headOfState");
        case "national-leadership":
          return (
            (master || orgs.get(`state:${org.stateId}`)?.polity !== "Anarchy") &&
            has("headOfState", "headOfGovernment", "centralExecutive")
          );
        case "field-commanders":
          return (
            (has("unitCommander") || (query.depth !== "heads" && has("militaryStaff"))) &&
            (query.military === "all" ||
              org.formation === query.military ||
              (query.military === "land" && org.formation === "corps"))
          );
        case "major-feudal-lords":
        case "all-feudal-lords": {
          const state = orgs.get(`state:${org.stateId}`);
          return (
            state?.polity === "Monarchy" &&
            ((has("secularLord") && (preset === "all-feudal-lords" || role.majorLord)) ||
              (query.includeReligiousLords && role.landed && has("bishop", "abbot", "orderMaster")))
          );
        }
        case "regional-administrators":
          return has("territorialAdministrator");
        case "urban-leadership":
          return has("urbanExecutive", "castellan") || (query.depth !== "heads" && has("urbanCouncil"));
        case "religious-leaders":
          return has("religiousHead", "bishop", "abbot", "orderMaster");
        case "urban-clergy":
          return query.clergy === "parishes" ? has("parishClergy") : has("urbanClergyLead");
        case "merchant-leaders":
          return (
            has("companyHead", "marketHead") || (query.depth !== "heads" && has("companyOfficer", "marketMerchant"))
          );
        case "guild-leaders":
          return has("guildHead") || (query.depth !== "heads" && has("guildOfficer"));
        case "institution-heads":
          return has("institutionHead");
        case "organization":
          return (
            query.depth === "all" ||
            (query.depth === "leaders"
              ? has(
                  "headOfState",
                  "headOfGovernment",
                  "centralExecutive",
                  "unitCommander",
                  "militaryStaff",
                  "secularLord",
                  "territorialAdministrator",
                  "urbanExecutive",
                  "urbanCouncil",
                  "castellan",
                  "religiousHead",
                  "bishop",
                  "abbot",
                  "orderMaster",
                  "urbanClergyLead",
                  "companyHead",
                  "companyOfficer",
                  "marketHead",
                  "guildHead",
                  "guildOfficer",
                  "institutionHead",
                  "householdOfficer"
                )
              : has(
                  "headOfState",
                  "headOfGovernment",
                  "unitCommander",
                  "secularLord",
                  "territorialAdministrator",
                  "urbanExecutive",
                  "castellan",
                  "religiousHead",
                  "bishop",
                  "abbot",
                  "orderMaster",
                  "urbanClergyLead",
                  "companyHead",
                  "marketHead",
                  "guildHead",
                  "institutionHead"
                ))
          );
      }
      return false;
    });
  };
  const roles = roster.roles
    .filter(role => matches(role))
    .sort((a, b) => {
      const ao = orgs.get(a.organizationId)!,
        bo = orgs.get(b.organizationId)!;
      return ao.name.localeCompare(bo.name) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
  const seats: PresetSeat[] = [];
  const people = new Set<string>(),
    existing = new Set<string>(),
    generate = new Set<string>();
  let vacant = 0,
    unresolved = 0;
  for (const role of roles) {
    const signature = seatSignature(roster, role);
    for (let ordinal = 0; ordinal < role.count; ordinal++) {
      if (master && !role.referenceSeats?.[String(ordinal)]) continue;
      // Contract-only selection selects the actual representative, not every merchant in the role.
      if (!matches(role, ordinal)) continue;
      const appointment = currentAppointment(roster, role.id, ordinal);
      const slot = appointment && rosterSlotById(roster, appointment.slotId);
      const status = role.unresolved
        ? "unresolved"
        : slot
          ? slot.deathYear !== undefined || slot.removedFromWorld || slot.cancelledBirth || slot.birthYear > year
            ? "vacant"
            : slot.characterId === undefined
              ? "new"
              : "existing"
          : latestRoleSlot(roster, role.id, ordinal)
            ? "vacant"
            : "new";
      seats.push({ roleId: role.id, ordinal, slotId: slot?.id, status, signature });
      if (status === "vacant") {
        vacant++;
        continue;
      }
      if (status === "unresolved") {
        unresolved++;
        continue;
      }
      const key = slot?.id ?? `${role.id}:${ordinal}`;
      people.add(key);
      if (status === "existing") existing.add(key);
      else generate.add(key);
    }
  }
  const warnings: string[] = [];
  if (master && !roster.referenceProfile) warnings.push("masterUnavailable");
  if (
    query.presets.some(p =>
      ["state-heads", "national-leadership", "field-commanders", "major-feudal-lords", "all-feudal-lords"].includes(p)
    ) &&
    !roster.roles.some(r => r.purposes?.includes("headOfState"))
  )
    warnings.push("governmentUnavailable");
  if (
    query.presets.some(p => ["merchant-leaders", "guild-leaders"].includes(p)) &&
    !roster.organizations.some(o => !o.archived && ["company", "guild", "market"].includes(o.kind ?? ""))
  )
    warnings.push("economyUnavailable");
  if (query.presets.includes("court-suppliers") && !suppliers.size) warnings.push("noContracts");
  if (query.presets.includes("urban-clergy") && !roster.roles.some(r => r.purposes?.includes("urbanClergyLead")))
    warnings.push("noReligiousSites");
  if (query.presets.includes("field-commanders") && query.military === "corps" && !seats.length)
    warnings.push("noCorps");
  return {
    seats,
    required: seats.length,
    people: people.size,
    existing: existing.size,
    generate: generate.size,
    vacant,
    unresolved,
    warnings
  };
}

export { validatePresetQuery } from "./presetTypes";
