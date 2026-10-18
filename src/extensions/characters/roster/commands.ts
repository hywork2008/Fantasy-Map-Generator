import type { SimulationExtensionAPI } from "../../../types/extension-api";
import { getCharacters } from "../charactersContext";
import { resolveRaceAgeProfile } from "../raceAge";
import { buildWorldRoster } from "./build";
import { emptyProtection, LOCKABLE_FIELDS, validateWorldRoster } from "./model";
import {
  continueRoster,
  ensureChildren,
  ensureRoster,
  materializeSlots,
  putOrganization,
  putRole,
  selectedSlots,
  setScope,
  synchronizeFamily
} from "./runtime";
import type { PersonSlot, RosterSelection } from "./types";

function selectionFrom(value: unknown): RosterSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Roster selection required");
  const s = value as RosterSelection;
  if (
    (s.organizationId !== undefined && typeof s.organizationId !== "string") ||
    (s.roleId !== undefined && typeof s.roleId !== "string") ||
    (s.slotIds !== undefined && (!Array.isArray(s.slotIds) || !s.slotIds.every(id => typeof id === "string"))) ||
    (s.limit !== undefined && (!Number.isInteger(s.limit) || s.limit <= 0)) ||
    (s.descendants !== undefined && typeof s.descendants !== "boolean") ||
    (s.mode !== undefined && !["memo", "simulation"].includes(s.mode))
  )
    throw new Error("Invalid roster selection");
  return s;
}
export function registerRosterCommands(api: SimulationExtensionAPI): () => void {
  const unregister = api.registerExtensionCommand({
    extensionId: "characters",
    name: "roster",
    topics: ["extension.characters", "extension.nobility", "extension.economy"],
    execute: value => {
      if (!api.isExtensionEnabled("characters")) throw new Error("Characters must be enabled");
      if (!value || typeof value !== "object") throw new Error("Roster request required");
      const v = value as Record<string, unknown>;
      const roster = v.action === "build" ? buildWorldRoster() : ensureRoster();
      const slot = typeof v.slotId === "string" ? roster.slots.find(s => s.id === v.slotId) : undefined;
      const needSlot = (): PersonSlot => {
        if (!slot) throw new Error("Unknown person slot");
        return slot;
      };
      let result: unknown;
      switch (v.action) {
        case "build":
          break;
        case "slots":
          result = selectedSlots(roster, selectionFrom(v.selection)).map(s => s.id);
          break;
        case "materialize":
          result = materializeSlots(selectionFrom(v.selection));
          break;
        case "scope": {
          if (typeof v.simulate !== "boolean" || typeof v.successors !== "boolean")
            throw new Error("Simulation policy required");
          setScope(roster, selectionFrom(v.selection), v.simulate, v.successors);
          break;
        }
        case "children":
          result = ensureChildren(roster, needSlot()).map(s => s.id);
          break;
        case "child": {
          const parent = needSlot();
          if (parent.protection.fields.includes("familyRelations")) throw new Error("Family links are locked");
          if (
            typeof v.birthYear !== "number" ||
            !Number.isFinite(v.birthYear) ||
            v.birthYear < parent.birthYear + resolveRaceAgeProfile(parent.raceId).maturity ||
            v.birthYear >= parent.plannedDeathYear
          )
            throw new Error("Child birth is outside the parent's lifetime or maturity");
          ensureChildren(roster, parent);
          parent.childPlan!.push({ birthYear: v.birthYear, gender: v.gender === "male" ? "male" : "female" });
          ensureChildren(roster, parent);
          break;
        }
        case "watch": {
          const s = needSlot();
          if (v.track !== undefined && !["none", "branch", "all", "heir"].includes(String(v.track)))
            throw new Error("Invalid lineage policy");
          if (v.age !== undefined && (typeof v.age !== "number" || !Number.isFinite(v.age) || v.age < 0))
            throw new Error("Invalid observation age");
          s.protection.track = (v.track as PersonSlot["protection"]["track"]) ?? "branch";
          s.protection.watchAge = v.age as number | undefined;
          s.protection.stopBeforeDeath = v.death === true;
          s.protection.stopOnBirth = v.birth === true;
          s.protection.materializeDescendants = v.materialize === true;
          if (s.protection.track !== "none") ensureChildren(roster, s);
          if (s.protection.watchAge !== undefined || s.protection.stopBeforeDeath || s.protection.track !== "none")
            setScope(roster, { slotIds: [s.id] }, true, false);
          break;
        }
        case "lock": {
          const s = needSlot();
          const character = getCharacters().find(c => c.i === s.characterId);
          if (!Array.isArray(v.fields) || !v.fields.every(f => typeof f === "string" && LOCKABLE_FIELDS.has(f)))
            throw new Error("Invalid protected fields");
          s.protection.fields = v.fields as string[];
          const priorValues = s.protection.values;
          s.protection.values = {};
          for (const field of s.protection.fields) {
            if (Object.hasOwn(priorValues, field)) {
              s.protection.values[field] = priorValues[field];
              continue;
            }
            if (["notes", "birthYear", "organizationId"].includes(field))
              s.protection.values[field] = structuredClone((s as unknown as Record<string, unknown>)[field]);
            else if (field === "familyRelations")
              s.protection.values[field] = structuredClone(
                roster.family.filter(f => f.parentId === s.id || f.childId === s.id)
              );
            else if (character)
              s.protection.values[field] = structuredClone((character as unknown as Record<string, unknown>)[field]);
          }
          break;
        }
        case "notes": {
          if (
            typeof v.notes !== "string" ||
            (v.tags !== undefined && (!Array.isArray(v.tags) || !v.tags.every(t => typeof t === "string")))
          )
            throw new Error("Invalid notes");
          if (slot?.protection.fields.includes("notes")) throw new Error("Notes are locked");
          if (slot) {
            slot.notes = v.notes;
            if (v.tags) slot.tags = v.tags as string[];
          } else {
            const o = roster.organizations.find(o => o.id === v.organizationId);
            if (!o) throw new Error("Unknown organization");
            o.notes = v.notes;
          }
          break;
        }
        case "location": {
          const s = needSlot();
          if (s.protection.fields.includes("location")) throw new Error("Location is locked");
          if (
            typeof v.burgId !== "number" ||
            !Number.isInteger(v.burgId) ||
            v.burgId < 0 ||
            (v.burgId && !api.worldContext.pack.burgs[v.burgId])
          )
            throw new Error("Invalid settlement");
          for (const n of [v.x, v.y])
            if (n !== undefined && (typeof n !== "number" || !Number.isFinite(n)))
              throw new Error("Invalid coordinates");
          if (v.editor !== undefined && !["FMG", "RE", "CE"].includes(String(v.editor)))
            throw new Error("Invalid map reference");
          s.location = {
            burgId: v.burgId,
            editor: v.editor as "FMG" | "RE" | "CE" | undefined,
            x: v.x as number | undefined,
            y: v.y as number | undefined
          };
          const c = getCharacters().find(c => c.i === s.characterId);
          if (c) c.location = v.burgId;
          break;
        }
        case "organization": {
          if (typeof v.name !== "string" || !v.name.trim()) throw new Error("Organization name required");
          const parent = roster.organizations.find(o => o.id === v.parentId);
          if (v.parentId && !parent) throw new Error("Unknown parent organization");
          const id = `custom:${roster.organizations.length + 1}`;
          putOrganization(roster, { id, name: v.name.trim(), stateId: parent?.stateId ?? 0, parentId: parent?.id });
          result = id;
          break;
        }
        case "role": {
          const org = roster.organizations.find(o => o.id === v.organizationId);
          if (
            !org ||
            typeof v.name !== "string" ||
            !v.name.trim() ||
            !Number.isInteger(v.count) ||
            (v.count as number) < 0
          )
            throw new Error("Invalid role definition");
          putRole(roster, {
            id: `${org.id}:custom:${roster.roles.length + 1}`,
            organizationId: org.id,
            name: v.name.trim(),
            count: v.count as number,
            reason: "User-defined",
            roleClass: "ordinary",
            primarySkill: "stewardship",
            entityType: org.burgId ? "burg" : "state",
            entityId: org.burgId ?? org.stateId,
            landed: false,
            hereditary: false
          });
          break;
        }
        case "family":
        case "adopt": {
          const parent = needSlot(),
            child = roster.slots.find(s => s.id === v.childId);
          if (
            parent.protection.fields.includes("familyRelations") ||
            child?.protection.fields.includes("familyRelations")
          )
            throw new Error("Family links are locked");
          if (!child || child.id === parent.id || parent.birthYear >= child.birthYear)
            throw new Error("Invalid adoption");
          const kind = v.kind === "birth" ? "birth" : "adoption";
          const clone = structuredClone(roster);
          clone.family.push({ parentId: parent.id, childId: child.id, kind });
          validateWorldRoster(clone);
          if (!roster.family.some(f => f.parentId === parent.id && f.childId === child.id))
            roster.family.push({ parentId: parent.id, childId: child.id, kind });
          break;
        }
        case "spouse": {
          const person = needSlot(),
            partner = roster.slots.find(s => s.id === v.partnerId);
          if (!partner || partner.id === person.id) throw new Error("Invalid partner");
          if (
            person.protection.fields.includes("familyRelations") ||
            partner.protection.fields.includes("familyRelations")
          )
            throw new Error("Family links are locked");
          if (
            !roster.links.some(
              l =>
                l.kind === "spouse" &&
                ((l.fromId === person.id && l.toId === partner.id) || (l.toId === person.id && l.fromId === partner.id))
            )
          )
            roster.links.push({ fromId: person.id, toId: partner.id, kind: "spouse" });
          break;
        }
        case "rename": {
          const person = needSlot();
          if (person.protection.fields.includes("name")) throw new Error("Name is locked");
          if (typeof v.name !== "string" || !v.name.trim()) throw new Error("Person name required");
          const c = getCharacters().find(c => c.i === person.characterId);
          if (!c) throw new Error("Generate the person first");
          c.name = v.name.trim();
          break;
        }
        case "continue":
          continueRoster(roster);
          break;
        case "clearWatch": {
          const s = needSlot();
          s.protection = { ...emptyProtection(), fields: s.protection.fields, values: s.protection.values };
          break;
        }
        default:
          throw new Error("Unknown roster action");
      }
      synchronizeFamily(roster);
      api.events.dispatchEvent(new CustomEvent("fmg:roster-changed"));
      return { changed: true, result };
    }
  });
  return unregister;
}
