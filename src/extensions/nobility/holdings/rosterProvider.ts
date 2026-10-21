import type { RolePurpose } from "../../characters/roster/presetTypes";
import { putOrganization, putRole } from "../../characters/roster/runtime";
import type { RosterRole, WorldRoster } from "../../characters/roster/types";
import { analyzeFrontiers, getProvinceThreats } from "../../hostCore";
import { CENTRAL_OFFICES, resolveProvinceLordTitle, resolveRulerTitle } from "../data/titleTable";
import { getApi, getCurrentYear, getHoldingsLedger, getWorldContext, setHoldingsLedger } from "../nobilityContext";
import { allocateEuropeanHoldings } from "./allocateEuropean";
import { assignGaelicProvinceLords, readHoldingInput, regimeForState } from "./assignGaelicHoldings";
import { gaelicTitles } from "./titles";
import type { GaelicPeriod, NobleHolding } from "./types";

export function buildNobilityRoster(roster: WorldRoster): void {
  const world = getWorldContext(),
    pack = world.pack;
  const frontiers = analyzeFrontiers(pack, getCurrentYear());
  for (const holding of getHoldingsLedger())
    if (holding.retiredYear !== undefined) {
      const org = roster.organizations.find(o => o.id === `holding:${holding.id}`);
      if (org) org.archived = true;
    }
  for (const state of pack.states) {
    if (!state.i || state.removed) continue;
    const court = `state:${state.i}:court`;
    const role = (
      id: string,
      name: string,
      count: number,
      skill: RosterRole["primarySkill"],
      organizationId = court,
      entityType: RosterRole["entityType"] = "state",
      entityId = state.i,
      landed = false,
      femaleName = name,
      hereditary = false,
      purposes: RolePurpose[] = [id.endsWith(":ruler") ? "headOfState" : "centralExecutive"],
      majorLord = false
    ) =>
      putRole(roster, {
        id,
        organizationId,
        name,
        femaleName,
        count,
        primarySkill: skill,
        entityType,
        entityId,
        landed,
        hereditary,
        reason: "Government, population and territorial institutions",
        purposes,
        majorLord,
        roleClass: id.endsWith(":ruler") ? "ruler" : landed ? "province_lord" : "central_officer"
      });
    if (state.form !== "Anarchy")
      role(
        `${court}:ruler`,
        resolveRulerTitle(state, "male"),
        1,
        "diplomacy",
        court,
        "state",
        state.i,
        true,
        resolveRulerTitle(state, "female"),
        state.form === "Monarchy"
      );
    for (const office of state.form === "Anarchy" ? [] : CENTRAL_OFFICES)
      role(`${court}:${office.title}`, office.title, 1, office.primarySkill ?? "stewardship");
    const regime = regimeForState(state);
    if (regime) {
      if (regime === "gaelicProvincial") assignGaelicProvinceLords(state, frontiers.get(state.i), false);
      else {
        const input = readHoldingInput(state, world.options.historicalPeriod as GaelicPeriod, frontiers.get(state.i));
        if (input) {
          const slice = getApi().simulationContext.extensions.nobility!;
          slice.rosterHoldingFingerprints ??= {};
          const fingerprints = slice.rosterHoldingFingerprints as Record<string, string>;
          const fingerprint = `${regime}:${input.period}:${input.cells.map(c => c.id).join(",")}`;
          if (fingerprints[state.i] !== fingerprint) {
            const existing = getHoldingsLedger();
            const nextId = existing.reduce((max, h) => Math.max(max, h.id), 0) + 1;
            for (const h of existing)
              if (h.stateId === state.i && h.retiredYear === undefined) h.retiredYear = getCurrentYear();
            const fresh = allocateEuropeanHoldings(input, regime).map((h, i) => ({ ...h, id: nextId + i }));
            setHoldingsLedger([...existing, ...fresh]);
            fingerprints[state.i] = fingerprint;
          }
        }
      }
      for (const holding of getHoldingsLedger().filter(h => h.stateId === state.i && h.retiredYear === undefined)) {
        const names =
          regime === "gaelicProvincial" ? (gaelicTitles(holding) ?? holdingTitles(holding)) : holdingTitles(holding);
        if (!names) continue;
        const id = `holding:${holding.id}`;
        putOrganization(roster, {
          id,
          name: holding.seatName || `Holding ${holding.id}`,
          kind: "territory",
          stateId: state.i,
          parentId: `state:${state.i}`,
          burgId: holding.seatBurgId
        });
        const r = role(
          `${id}:holder`,
          regime === "englishHonour" && holding.dignity === "count" ? "Earl" : names.male,
          1,
          holding.office === "sheriff" ? "stewardship" : "martial",
          id,
          "holding",
          holding.id,
          holding.cellIds.length > 0 || !!holding.shares?.length,
          names.female,
          holding.hereditary,
          holding.office === "bishopTemporal"
            ? ["bishop"]
            : holding.office === "abbotTemporal"
              ? ["abbot"]
              : holding.office === "orderMaster"
                ? ["orderMaster"]
                : [
                      "sheriff",
                      "bailli",
                      "seneschal",
                      "sysselman",
                      "ispan",
                      "podesta",
                      "consuls",
                      "mayor",
                      "castellan",
                      "burgrave"
                    ].includes(holding.office)
                  ? ["territorialAdministrator"]
                  : ["secularLord"],
          !!holding.dignity && !["banneret", "knight"].includes(holding.dignity)
        );
        if (holding.holderCharacterId !== undefined) {
          const old = roster.slots.find(s => s.characterId === holding.holderCharacterId);
          if (old) {
            old.roleId = r.id;
            old.organizationId = id;
          }
        }
      }
    } else {
      const threats = getProvinceThreats(pack, frontiers.get(state.i) ?? []);
      const provinces = pack.provinces.filter(p => p?.i && !p.removed && p.state === state.i);
      for (const province of provinces) {
        if (!regime && !threats.has(province.i)) continue;
        const id = `province:${province.i}`;
        putOrganization(roster, {
          id,
          name: province.name,
          kind: "territory",
          stateId: state.i,
          parentId: `state:${state.i}`,
          burgId: province.burg
        });
        const appointed = [
          "englishHonour",
          "nordicOfficer",
          "hungarianCounty",
          "urbanCommunal",
          "italianCommunal"
        ].includes(regime ?? "");
        const name =
          regime === "englishHonour"
            ? "Sheriff"
            : regime === "nordicOfficer"
              ? "Sysselman"
              : regime === "hungarianCounty"
                ? "Ispan"
                : appointed
                  ? "Rector"
                  : resolveProvinceLordTitle(province, "male");
        role(
          `${id}:governor`,
          name,
          1,
          "stewardship",
          id,
          "province",
          province.i,
          !appointed,
          appointed ? name : resolveProvinceLordTitle(province, "female"),
          !appointed,
          ["territorialAdministrator"]
        );
      }
    }
    const army = `state:${state.i}:military`;
    putOrganization(roster, {
      id: army,
      name: `${state.name} Military`,
      kind: "military",
      stateId: state.i,
      parentId: `state:${state.i}`
    });
    for (const regiment of state.military ?? []) {
      const strength = Math.max(
        0,
        Math.floor(regiment.a ?? Object.values(regiment.u ?? {}).reduce((sum, n) => sum + n, 0))
      );
      const id = `${army}:regiment:${regiment.i}`;
      putOrganization(roster, {
        id,
        name: regiment.name || `Regiment ${regiment.i}`,
        kind: "military",
        formation: regiment.n ? "sea" : "land",
        stateId: state.i,
        parentId: army,
        burgId: pack.cells.burg[regiment.cell]
      });
      if (strength > 0) {
        const command = role(
          `${id}:commander`,
          regiment.n ? "Admiral" : strength < 80 ? "Captain" : "Commander",
          1,
          "martial",
          id
        );
        command.count = 1;
        command.regimentId = regiment.i;
        command.roleClass = "commander";
        command.purposes = ["unitCommander"];
      }
      if (strength === 0) {
        const commander = roster.roles.find(r => r.id === `${id}:commander`);
        if (commander) commander.count = 0;
      }
      const soldiers = role(
        `${id}:soldiers`,
        regiment.n ? "Sailor" : "Soldier",
        Math.max(0, strength - (strength > 0 ? 1 : 0)),
        "prowess",
        id
      );
      soldiers.count = Math.max(0, strength - (strength > 0 ? 1 : 0));
      soldiers.roleClass = "ordinary";
      soldiers.purposes = ["militaryMember"];
      soldiers.characterRole = {
        source: "characters",
        kind: "militaryMember",
        entityType: "state",
        entityId: state.i,
        organizationId: regiment.i,
        label: soldiers.name
      };
    }
    const household = `state:${state.i}:household`;
    putOrganization(roster, {
      id: household,
      name: `${state.name} Household`,
      kind: "household",
      stateId: state.i,
      parentId: court,
      burgId: state.capital
    });
    role(
      `${household}:knights`,
      "Household Knight",
      Math.max(3, Math.round(((state.rural ?? 0) + (state.urban ?? 0)) / 150)),
      "martial",
      household,
      "state",
      state.i,
      false,
      "Household Knight",
      false,
      ["member"]
    );
  }
}

function holdingTitles(h: NobleHolding): { male: string; female: string } | null {
  const office: Record<string, string> = {
    sheriff: "Sheriff",
    sysselman: "Sysselman",
    ispan: "Ispan",
    podesta: "Podesta",
    consuls: "Consul",
    castellan: "Castellan",
    burgrave: "Burgrave",
    orderMaster: "Order Master",
    bishopTemporal: "Bishop",
    abbotTemporal: "Abbot",
    borderCommand: "Margrave"
  };
  if (h.holderKind === "crown" || h.holderKind === "odal" || h.holderKind === "kindred") return null;
  if (h.office !== "none" && office[h.office])
    return { male: office[h.office], female: h.office === "abbotTemporal" ? "Abbess" : office[h.office] };
  const dignity: Record<string, [string, string]> = {
    duke: ["Duke", "Duchess"],
    count: ["Count", "Countess"],
    earl: ["Earl", "Countess"],
    baron: ["Baron", "Baroness"],
    banneret: ["Knight Banneret", "Knight Banneret"],
    landgrave: ["Landgrave", "Landgravine"],
    magnate: ["Magnate", "Magnate"]
  };
  const names = h.dignity && dignity[h.dignity];
  return names ? { male: names[0], female: names[1] } : null;
}
