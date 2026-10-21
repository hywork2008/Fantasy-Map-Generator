import { getApi, getWorldContext } from "../charactersContext";
import { ensureRoster, migrateCharacters, putOrganization, putRole } from "./runtime";
import type { RosterRole, WorldRoster } from "./types";

const providers = new Set<(roster: WorldRoster) => void>();
export function registerRosterProvider(provider: (roster: WorldRoster) => void): () => void {
  providers.add(provider);
  return () => providers.delete(provider);
}
export function buildWorldRoster(): WorldRoster {
  const roster = ensureRoster();
  const world = getWorldContext(),
    pack = world.pack;
  const states = new Set(pack.states.filter(s => s.i && !s.removed).map(s => s.i));
  for (const o of roster.organizations) if (o.stateId && !states.has(o.stateId)) o.archived = true;
  for (const state of pack.states) {
    if (!state.i || state.removed) continue;
    const root = `state:${state.i}`;
    putOrganization(roster, { id: root, name: state.name, stateId: state.i, kind: "government", polity: state.form });
    putOrganization(roster, {
      id: `${root}:court`,
      name: `${state.name} Court`,
      kind: "government",
      stateId: state.i,
      parentId: root,
      burgId: state.capital
    });
  }
  for (const burg of pack.burgs) {
    if (!burg?.i || burg.removed) continue;
    const stateId = burg.state ?? 0;
    const id = `burg:${burg.i}`;
    putOrganization(roster, {
      id,
      name: burg.name || `Burg ${burg.i}`,
      kind: "settlement",
      stateId,
      parentId: states.has(stateId) ? `state:${stateId}` : undefined,
      burgId: burg.i
    });
    const people = (burg.population ?? 0) * (world.populationRate || 1000) * (world.urbanization || 1);
    const role = (key: string, name: string, skill: RosterRole["primarySkill"], count = 1) =>
      putRole(roster, {
        id: `${id}:${key}`,
        organizationId: id,
        name,
        count,
        reason: "Settlement administration",
        purposes: [
          key === "mayor"
            ? "urbanExecutive"
            : key === "castellan"
              ? "castellan"
              : key === "council"
                ? "urbanCouncil"
                : "urbanClergyLead"
        ],
        unresolved: key === "clergy",
        roleClass: "central_officer",
        primarySkill: skill,
        entityType: "burg",
        entityId: burg.i!,
        landed: false,
        hereditary: false
      });
    if (people >= 1000) role("mayor", "Mayor", "stewardship");
    if (burg.citadel || burg.walls) role("castellan", "Castellan", "martial");
    if (people >= 5000 || burg.capital) role("council", "Councilor", "diplomacy", 6);
    if (burg.temple) role("clergy", "Cleric", "learning");
  }
  // Economic organizations remain usable before individual staff have been detailed.
  const economy = pack as unknown as {
    markets?: { i: number; centerBurgId: number; managerCharacterId?: number }[];
    merchantOrganizations?: { i: number; name: string; homeStateId: number; homeBurgId: number }[];
  };
  for (const market of economy.markets ?? []) {
    const burg = pack.burgs[market.centerBurgId];
    if (!burg || burg.removed) continue;
    const id = `market:${market.i}`;
    putOrganization(roster, {
      id,
      name: `${burg.name} Market`,
      kind: "market",
      stateId: burg.state ?? 0,
      parentId: `burg:${burg.i}`,
      burgId: burg.i
    });
    for (const name of ["Market Manager", "Merchant"])
      putRole(roster, {
        id: `${id}:${name}`,
        organizationId: id,
        name,
        count: name === "Merchant" ? 2 : 1,
        reason: "Market administration and trade",
        purposes: [name === "Market Manager" ? "marketHead" : "marketMerchant"],
        roleClass: "merchant",
        primarySkill: "stewardship",
        entityType: "burg",
        entityId: burg.i!,
        landed: false,
        hereditary: false,
        characterRole: {
          source: "economy",
          kind: name === "Market Manager" ? "marketManager" : "marketRivalMerchant",
          entityType: "market",
          entityId: market.i,
          label: name
        }
      });
  }
  for (const company of economy.merchantOrganizations ?? []) {
    const id = `company:${company.i}`;
    putOrganization(roster, {
      id,
      name: company.name,
      kind: "company",
      stateId: company.homeStateId,
      parentId: `burg:${company.homeBurgId}`,
      burgId: company.homeBurgId
    });
    for (const name of ["Company Head", "Secretary", "Bodyguard"])
      putRole(roster, {
        id: `${id}:${name}`,
        organizationId: id,
        name,
        count: 1,
        reason: "Merchant organization staffing",
        purposes: [name === "Company Head" ? "companyHead" : "companyOfficer"],
        roleClass: "merchant",
        primarySkill: name === "Bodyguard" ? "prowess" : "stewardship",
        entityType: "burg",
        entityId: company.homeBurgId,
        landed: false,
        hereditary: false,
        characterRole: {
          source: "economy",
          kind:
            name === "Company Head"
              ? "merchantOrganizationHead"
              : name === "Secretary"
                ? "merchantOrganizationSecretary"
                : "merchantOrganizationBodyguard",
          entityType: "burg",
          entityId: company.homeBurgId,
          organizationId: company.i,
          label: name
        }
      });
  }
  const guilds = getApi().simulationContext.extensions.economy?.guildKnowledgeStocks;
  if (Array.isArray(guilds))
    for (const record of guilds) {
      if (!record || typeof record !== "object") continue;
      const entry = record as { burgId: number; domain: string; stock: number };
      const burg = pack.burgs[entry.burgId];
      if (!burg || burg.removed || entry.stock <= 0) continue;
      const id = `guild:${entry.burgId}:${entry.domain}`;
      putOrganization(roster, {
        id,
        name: `${burg.name} ${entry.domain} Guild`,
        kind: "guild",
        stateId: burg.state ?? 0,
        parentId: `burg:${burg.i}`,
        burgId: burg.i
      });
      for (const [name, count] of [
        ["Guild Master", 1],
        ["Guild Apprentice", 2]
      ] as const)
        putRole(roster, {
          id: `${id}:${name}`,
          organizationId: id,
          name,
          count,
          reason: "Active craft guild",
          purposes: [name === "Guild Master" ? "guildHead" : "member"],
          occupation: entry.domain,
          roleClass: "ordinary",
          primarySkill: "engineering",
          entityType: "burg",
          entityId: burg.i!,
          landed: false,
          hereditary: false,
          characterRole: {
            source: "economy",
            kind: name === "Guild Master" ? "guildMaster" : "guildApprentice",
            entityType: "burg",
            entityId: burg.i!,
            label: name,
            domain: entry.domain
          }
        });
    }
  for (const provider of providers) provider(roster);
  migrateCharacters(roster);
  return roster;
}
