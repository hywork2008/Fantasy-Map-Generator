/**
 * Lightweight adventurer prep templates (EQ-5).
 * Spec: docs/plan/character-loadout-and-readiness.md §8.3.
 *
 * Rearranges this character's loadout only (source: editor). Does not mint market goods
 * or spend wealth (open-question default: free rearrange).
 */
import type { Character, CharacterLoadout, EquipmentQuality, EquippedItem } from "./characterTypes";
import { setLoadoutEditor } from "./loadoutEquip";
import { FALLBACK_LOADOUT_GOOD_IDS, type LoadoutGoodsCatalog } from "./loadoutSeed";

export type PrepTemplateId = "peasant" | "militia" | "hireling" | "court_officer" | "sovereign";

export interface PrepTemplateDomainSeeds {
  swordsmanship?: number;
  archery?: number;
}

export interface PrepTemplateDef {
  id: PrepTemplateId;
  /** English UI label. */
  label: string;
  /** English tooltip. */
  description: string;
  body?: { quality: EquipmentQuality; good: "garments" | "cloth" | "silk" | "furs"; styleKey: string };
  weapon?: { quality: EquipmentQuality; styleKey: string };
  accessory?: { quality: EquipmentQuality; styleKey: string };
  /** Floor proficiency for individualSkills (applied by economy helper). */
  domainSeeds?: PrepTemplateDomainSeeds;
}

export const PREP_TEMPLATES: readonly PrepTemplateDef[] = [
  {
    id: "peasant",
    label: "Peasant laborer",
    description: "Plain garments, unarmed day laborer kit.",
    body: { quality: 2, good: "garments", styleKey: "work_clothes" }
  },
  {
    id: "militia",
    label: "Town militia",
    description: "Work clothes and militia arms; light sword practice.",
    body: { quality: 2, good: "garments", styleKey: "work_clothes" },
    weapon: { quality: 2, styleKey: "militia_arms" },
    domainSeeds: { swordsmanship: 25 }
  },
  {
    id: "hireling",
    label: "Hireling adventurer",
    description: "Town dress, soldier arms, modest sword and bow practice.",
    body: { quality: 3, good: "garments", styleKey: "town_dress" },
    weapon: { quality: 3, styleKey: "soldier_arms" },
    domainSeeds: { swordsmanship: 40, archery: 25 }
  },
  {
    id: "court_officer",
    label: "Court officer",
    description: "Court attire and officer arms; solid sword practice.",
    body: { quality: 4, good: "garments", styleKey: "court_attire" },
    weapon: { quality: 4, styleKey: "officer_arms" },
    domainSeeds: { swordsmanship: 45 }
  },
  {
    id: "sovereign",
    label: "Sovereign",
    description: "Regalia, ceremonial arms, court jewel; light practice unless already martial.",
    body: { quality: 5, good: "silk", styleKey: "regalia" },
    weapon: { quality: 4, styleKey: "ceremonial_arms" },
    accessory: { quality: 5, styleKey: "court_jewel" },
    domainSeeds: { swordsmanship: 20 }
  }
] as const;

export function getPrepTemplate(id: PrepTemplateId): PrepTemplateDef | undefined {
  return PREP_TEMPLATES.find(t => t.id === id);
}

function item(goodId: number, quality: EquipmentQuality, styleKey: string): EquippedItem {
  return { goodId, quality, source: "editor", styleKey };
}

/** Build a full loadout for a template (does not mutate the character). */
export function buildTemplateLoadout(
  templateId: PrepTemplateId,
  catalog: LoadoutGoodsCatalog = FALLBACK_LOADOUT_GOOD_IDS
): CharacterLoadout | null {
  const def = getPrepTemplate(templateId);
  if (!def) return null;

  const loadout: CharacterLoadout = {};
  if (def.body) {
    const goodId =
      def.body.good === "silk"
        ? catalog.silk
        : def.body.good === "cloth"
          ? catalog.cloth
          : def.body.good === "furs"
            ? catalog.furs
            : catalog.garments;
    loadout.body = item(goodId, def.body.quality, def.body.styleKey);
  }
  if (def.weapon) {
    loadout.weapon = item(catalog.arms, def.weapon.quality, def.weapon.styleKey);
  }
  if (def.accessory && catalog.jewelry !== undefined) {
    loadout.accessory = item(catalog.jewelry, def.accessory.quality, def.accessory.styleKey);
  }
  return loadout;
}

/**
 * Apply template loadout via editor path (returns equipped inventory items to bag when replaced).
 * Domain skills are applied separately by the economy helper.
 */
export function applyPrepTemplateLoadout(
  character: Character,
  templateId: PrepTemplateId,
  catalog: LoadoutGoodsCatalog = FALLBACK_LOADOUT_GOOD_IDS
): { ok: boolean; changed: boolean; message?: string } {
  if (character.dead) return { ok: false, changed: false, message: "Cannot kit a deceased character." };
  const loadout = buildTemplateLoadout(templateId, catalog);
  if (!loadout) return { ok: false, changed: false, message: "Unknown prep template." };
  const result = setLoadoutEditor({ character, loadout, replaceAll: true });
  return { ok: result.ok, changed: result.changed, message: result.message };
}
