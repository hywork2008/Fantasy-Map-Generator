import type { SimulationExtensionAPI } from "../../../types/extension-api";
import { inferRoleClass } from "../backstoryProfile";
import type { CharacterSkills } from "../characterTypes";
import { emptyProtection, invalidateRosterIndex } from "../roster/model";
import type { RolePurpose } from "../roster/presetTypes";
import { putOrganization, putRole } from "../roster/runtime";
import type { PersonSlot, RosterRole, WorldRoster } from "../roster/types";
import { readReference, referencePeople } from "./model";

type TitleNames = (title: CharacterTitle, stateId: number) => { name: string; femaleName: string } | undefined;
type CharacterTitle = import("../characterTypes").TitleHolding;
let titleNames: TitleNames | undefined;
export function registerReferenceTitleNames(resolver: TitleNames): () => void {
  titleNames = resolver;
  return () => {
    if (titleNames === resolver) titleNames = undefined;
  };
}

const OFFICE_SKILLS: Record<string, keyof CharacterSkills> = {
  Chancellor: "diplomacy",
  Marshal: "martial",
  Steward: "stewardship",
  Spymaster: "intrigue",
  "Court Chaplain": "learning"
};
function purpose(kind: string): RolePurpose[] {
  return kind === "marketManager"
    ? ["marketHead"]
    : kind === "marketRivalMerchant"
      ? ["marketMerchant"]
      : kind === "merchantOrganizationHead"
        ? ["companyHead"]
        : kind === "guildMaster"
          ? ["guildHead"]
          : ["member"];
}
/** Attach the actual master cohort to institutional seats, without publishing Characters. */
export function attachReferenceRoster(roster: WorldRoster, api: SimulationExtensionAPI): void {
  const plan = readReference(api.simulationContext);
  if (!plan) return;
  roster.referenceProfile = {
    id: plan.profile,
    commit: plan.commit,
    inputHash: plan.inputHash,
    year: plan.year,
    month: plan.month,
    day: plan.day
  };
  const people = referencePeople(plan),
    byId = new Map(people.map(c => [c.i, c]));
  const { pack } = api.worldContext;
  for (const c of people) {
    const id = `master:${c.i}`;
    if (roster.slots.some(s => s.id === id)) continue;
    const stateId = c.state || c.nationalityStateId || 0;
    const court = stateId ? `state:${stateId}:court` : `master:independent`;
    if (!roster.organizations.some(o => o.id === court))
      putOrganization(roster, {
        id: court,
        name: pack.states[stateId]?.name ?? "Independent people",
        stateId,
        kind: "government",
        burgId: c.location
      });
    const slot: PersonSlot = {
      id,
      referenceId: c.i,
      retainedCharacterId: c.i,
      organizationId: court,
      generation: 0,
      cultureId: c.culture,
      raceId: c.race,
      gender: c.gender,
      birthYear: plan.year - c.age,
      plannedDeathYear: plan.year + 10000,
      deathYear: c.dead ? (c.deathYear ?? plan.year) : undefined,
      mode: "simulation",
      notes: "",
      tags: c.demonInfiltration ? ["master:covert"] : [],
      location: { burgId: c.location },
      protection: emptyProtection(),
      unresolvedFamily: {
        spouses: c.family?.spouses ?? 0,
        children: c.family?.children ?? 0,
        grandchildren: c.family?.grandchildren ?? 0,
        greatGrandchildren: c.family?.greatGrandchildren ?? 0
      }
    };
    roster.slots.push(slot);
    c.rosterSlotId = id;
    c.rosterMode = "simulation";
    const add = (role: RosterRole, startYear = plan.year, endYear?: number) => {
      const ordinal = Object.keys(role.referenceSeats ?? {}).length;
      role.count = Math.max(role.count, ordinal + 1);
      role.simulate = true;
      const organization = roster.organizations.find(o => o.id === role.organizationId);
      if (organization) organization.simulate = true;
      role.referenceSeats ??= {};
      role.referenceSeats[String(ordinal)] = id;
      roster.appointments.push({ roleId: role.id, ordinal, slotId: id, startYear, endYear });
      slot.roleId ??= role.id;
      slot.ordinal ??= ordinal;
      if (slot.roleId === role.id) slot.organizationId = role.organizationId;
    };
    for (const title of c.titles) {
      const ruler = title.entityType === "state" && title.landed;
      const orgId =
        title.entityType === "holding"
          ? `holding:${title.entityId}`
          : title.entityType === "province"
            ? `province:${title.entityId}`
            : court;
      if (!roster.organizations.some(o => o.id === orgId))
        putOrganization(roster, {
          id: orgId,
          name:
            title.seatName ??
            pack.provinces?.[title.entityType === "province" ? title.entityId : 0]?.name ??
            title.title,
          stateId,
          parentId: stateId ? `state:${stateId}` : undefined,
          burgId: c.location,
          kind: orgId === court ? "government" : "territory"
        });
      const names = titleNames?.(title, stateId);
      let role = roster.roles.find(
        r =>
          r.entityType === title.entityType &&
          r.entityId === title.entityId &&
          (r.name === title.title || r.femaleName === title.title)
      );
      if (!role)
        role = putRole(roster, {
          id: ruler ? `state:${stateId}:court:ruler` : `${orgId}:master:${title.title}`,
          organizationId: orgId,
          name: names?.name ?? title.title,
          femaleName: names?.femaleName,
          count: 1,
          reason: "Master initial generation",
          primarySkill: OFFICE_SKILLS[title.title] ?? (title.landed ? "martial" : "stewardship"),
          roleClass: inferRoleClass(c),
          entityType: title.entityType,
          entityId: title.entityId,
          landed: title.landed,
          hereditary: ruler && pack.states[stateId]?.form === "Monarchy",
          purposes: ruler
            ? ["headOfState"]
            : OFFICE_SKILLS[title.title]
              ? ["centralExecutive"]
              : title.landed
                ? ["secularLord", "territorialAdministrator"]
                : ["territorialAdministrator"],
          majorLord: title.landed
        });
      add(role, title.startYear ?? plan.year, title.endYear);
    }
    for (const descriptor of c.roles ?? []) {
      if (descriptor.endYear !== undefined) continue;
      let role = roster.roles.find(
        r =>
          r.characterRole?.source === descriptor.source &&
          r.characterRole.kind === descriptor.kind &&
          r.characterRole.entityId === descriptor.entityId &&
          r.characterRole.domain === descriptor.domain &&
          (descriptor.kind === "guildApprentice" || r.characterRole.organizationId === descriptor.organizationId)
      );
      if (!role)
        role = putRole(roster, {
          id: `master:role:${descriptor.source}:${descriptor.kind}:${descriptor.entityId}:${descriptor.organizationId ?? ""}:${descriptor.domain ?? ""}`,
          organizationId: court,
          name: descriptor.label,
          count: 1,
          reason: "Master initial generation",
          primarySkill: descriptor.kind.startsWith("guild") ? "engineering" : "stewardship",
          roleClass: inferRoleClass(c),
          entityType: "burg",
          entityId: c.location ?? 0,
          landed: false,
          hereditary: false,
          purposes: purpose(descriptor.kind),
          characterRole: { ...descriptor }
        });
      if (!roster.appointments.some(a => a.slotId === id && a.roleId === role!.id))
        add(role, descriptor.startYear ?? plan.year);
    }
    for (const state of pack.states)
      for (const regiment of state?.military ?? []) {
        if (regiment.commanderId !== c.i) continue;
        const orgId = `state:${state.i}:regiment:${regiment.i}`;
        putOrganization(roster, {
          id: orgId,
          name: regiment.name ?? `Regiment ${regiment.i}`,
          stateId: state.i,
          parentId: `state:${state.i}`,
          kind: "military",
          formation: regiment.n ? "sea" : "land",
          burgId: c.location
        });
        add(
          putRole(roster, {
            id: `${orgId}:commander`,
            organizationId: orgId,
            name: regiment.n ? "Admiral" : "Commander",
            count: 1,
            reason: "Master appointed command",
            primarySkill: "martial",
            roleClass: "commander",
            entityType: "state",
            entityId: state.i,
            landed: false,
            hereditary: false,
            regimentId: regiment.i,
            purposes: ["unitCommander"],
            referenceOnly: true
          })
        );
      }
    if (!slot.roleId)
      add(
        putRole(roster, {
          id: `master:person:${c.i}`,
          organizationId: court,
          name: c.roles?.[0]?.label ?? "Independent character",
          count: 1,
          reason: "Master initial generation",
          primarySkill: "stewardship",
          roleClass: inferRoleClass(c),
          entityType: "burg",
          entityId: c.location ?? 0,
          landed: false,
          hereditary: false,
          referenceOnly: true,
          purposes: ["member"]
        })
      );
  }
  for (const c of people) {
    const slot = roster.slots.find(s => s.referenceId === c.i)!;
    if (!slot.unresolvedFamily) continue;
    for (const child of c.family?.childIds ?? [])
      if (byId.has(child) && !roster.family.some(f => f.parentId === slot.id && f.childId === `master:${child}`)) {
        roster.family.push({ parentId: slot.id, childId: `master:${child}`, kind: "birth" });
        slot.unresolvedFamily.children = Math.max(0, slot.unresolvedFamily.children - 1);
      }
    for (const partner of c.family?.spouseIds ?? [])
      if (
        byId.has(partner) &&
        !roster.links.some(
          l =>
            l.kind === "spouse" &&
            ((l.fromId === slot.id && l.toId === `master:${partner}`) ||
              (l.toId === slot.id && l.fromId === `master:${partner}`))
        )
      ) {
        roster.links.push({ fromId: slot.id, toId: `master:${partner}`, kind: "spouse" });
        slot.unresolvedFamily.spouses = Math.max(0, slot.unresolvedFamily.spouses - 1);
        const other = roster.slots.find(s => s.referenceId === partner);
        if (other?.unresolvedFamily) other.unresolvedFamily.spouses = Math.max(0, other.unresolvedFamily.spouses - 1);
      }
  }
  invalidateRosterIndex(roster);
}
