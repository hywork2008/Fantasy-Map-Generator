import { registerRosterCommands } from "./roster/commands";
import { registerRosterLifecycle, registerRosterWatches } from "./roster/lifecycle";
import "./types"; // activate module augmentation for PackedGraph.characters

import type { SimulationExtension, SimulationExtensionAPI } from "../../types/extension-api";
import { clearCharacters } from "./advanceAge";
import { applyPrepTemplateLoadout, PREP_TEMPLATES, type PrepTemplateId } from "./adventurerTemplates";
import { clearCharactersContext, getCharacters, initCharactersContext } from "./charactersContext";
import type { CharacterLoadout, CharacterSkills, LoadoutSlotId } from "./characterTypes";
import {
  equipFromInventory,
  isLoadoutSlotId,
  notifyLoadoutChanged,
  setLoadoutEditor,
  setSlotQuality,
  unequipSlot
} from "./loadoutEquip";
import { buildLoadoutGoodsCatalog, FALLBACK_LOADOUT_GOOD_IDS, type NamedGoodRef } from "./loadoutSeed";
import { SPECIALIZATIONS } from "./specializationCatalog";
import {
  readEconomyPractice,
  registerSpecializationCommands,
  registerSpecializationSimulation
} from "./specializationRuntime";
import { evaluateExpertise } from "./specializations";

/**
 * Characters simulation entry (docs/plan/simulation-core-separation.md §7, S5): commands, the
 * specialization system and the skill modifier. Dialogs and actions stay in `index.ts`.
 */

export const CHARACTERS_EXTENSION_ID = "characters";

/** Fired after a specialization command changed a character, so open views can refresh. */
export const CHARACTERS_SPECIALIZATIONS_CHANGED_EVENT = "fmg:characters-specializations-changed";

function resolveGoodsCatalogForEquip(api: SimulationExtensionAPI): NamedGoodRef[] {
  try {
    const pack = api.worldContext.pack as { goods?: NamedGoodRef[] };
    if (Array.isArray(pack.goods) && pack.goods.length) return pack.goods;
  } catch {
    // Context may be incomplete in tests.
  }

  const economyGoods = api.simulationContext?.extensions?.economy?.goods;
  if (Array.isArray(economyGoods)) {
    return economyGoods.filter(
      (g): g is NamedGoodRef =>
        !!g &&
        typeof g === "object" &&
        typeof (g as NamedGoodRef).i === "number" &&
        typeof (g as NamedGoodRef).name === "string"
    );
  }
  return [];
}

function isEquipFromInventoryRequest(value: unknown): value is {
  characterId: number;
  slot: LoadoutSlotId;
  goodId: number;
  quality?: number;
  goodName?: string;
} {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.characterId !== "number" || !Number.isInteger(v.characterId)) return false;
  if (!isLoadoutSlotId(v.slot)) return false;
  if (typeof v.goodId !== "number" || !Number.isInteger(v.goodId)) return false;
  if (v.quality !== undefined && (typeof v.quality !== "number" || !Number.isFinite(v.quality))) return false;
  if (v.goodName !== undefined && typeof v.goodName !== "string") return false;
  return true;
}

function isUnequipSlotRequest(value: unknown): value is { characterId: number; slot: LoadoutSlotId } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.characterId === "number" && Number.isInteger(v.characterId) && isLoadoutSlotId(v.slot);
}

function isSetSlotQualityRequest(
  value: unknown
): value is { characterId: number; slot: LoadoutSlotId; quality: number } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.characterId === "number" &&
    Number.isInteger(v.characterId) &&
    isLoadoutSlotId(v.slot) &&
    typeof v.quality === "number" &&
    Number.isFinite(v.quality)
  );
}

function isSetLoadoutEditorRequest(
  value: unknown
): value is { characterId: number; loadout: CharacterLoadout | null; replaceAll?: boolean } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.characterId !== "number" || !Number.isInteger(v.characterId)) return false;
  if (v.loadout !== null && (typeof v.loadout !== "object" || Array.isArray(v.loadout))) return false;
  if (v.replaceAll !== undefined && typeof v.replaceAll !== "boolean") return false;
  return true;
}

const PREP_TEMPLATE_IDS = new Set(PREP_TEMPLATES.map(t => t.id));

function isApplyPrepTemplateRequest(value: unknown): value is { characterId: number; templateId: PrepTemplateId } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.characterId === "number" &&
    Number.isInteger(v.characterId) &&
    typeof v.templateId === "string" &&
    PREP_TEMPLATE_IDS.has(v.templateId as PrepTemplateId)
  );
}

function register(api: SimulationExtensionAPI): () => void {
  initCharactersContext(api);
  const unregisterSpecializations = registerSpecializationCommands(api, () =>
    api.events.dispatchEvent(new CustomEvent(CHARACTERS_SPECIALIZATIONS_CHANGED_EVENT))
  );
  const unregisterExpertiseSimulation = registerSpecializationSimulation(api);
  const unregisterRosterCommands = registerRosterCommands(api);
  const unregisterRosterWatches = registerRosterWatches(api);
  const unregisterRosterLifecycle = registerRosterLifecycle(api);
  const unregisterRosterInitialization = api.registerMapReadyTask({
    id: "characters.roster",
    label: "Preparing organizations",
    run: context => {
      if (context.isCurrent() && api.isExtensionEnabled("characters")) {
        api.dispatchExtensionCommand({ extensionId: "characters", name: "roster", payload: { action: "build" } });
      }
    }
  });
  const onWorldLoaded = () => {
    if (api.isExtensionEnabled("characters")) api.requestMapReadyTask("characters.roster");
  };
  api.events.addEventListener("fmg:world-loaded", onWorldLoaded);

  const unregisterClearCommand = api.registerExtensionCommand({
    extensionId: CHARACTERS_EXTENSION_ID,
    name: "clear",
    execute: value => {
      if (value !== undefined) throw new Error("characters.clear does not accept a payload");
      const characters = getCharacters();
      if (!characters?.length) return { changed: false };
      clearCharacters();
      return { changed: true };
    }
  });

  const unregisterEquip = api.registerExtensionCommand({
    extensionId: CHARACTERS_EXTENSION_ID,
    name: "equipFromInventory",
    topics: ["extension.characters"],
    execute: value => {
      if (!isEquipFromInventoryRequest(value)) {
        throw new Error("characters.equipFromInventory requires characterId, slot, and goodId");
      }
      const character = getCharacters().find(c => c.i === value.characterId);
      if (!character) throw new Error(`characters.equipFromInventory: character ${value.characterId} not found`);
      const result = equipFromInventory({
        character,
        slot: value.slot,
        goodId: value.goodId,
        quality: value.quality,
        goodName: value.goodName,
        goods: resolveGoodsCatalogForEquip(api)
      });
      if (!result.ok) throw new Error(result.message ?? result.code ?? "equip failed");
      if (result.changed) notifyLoadoutChanged(character.i);
      return { changed: result.changed, result: { characterId: character.i, slot: value.slot } };
    }
  });

  const unregisterUnequip = api.registerExtensionCommand({
    extensionId: CHARACTERS_EXTENSION_ID,
    name: "unequipSlot",
    topics: ["extension.characters"],
    execute: value => {
      if (!isUnequipSlotRequest(value)) {
        throw new Error("characters.unequipSlot requires characterId and slot");
      }
      const character = getCharacters().find(c => c.i === value.characterId);
      if (!character) throw new Error(`characters.unequipSlot: character ${value.characterId} not found`);
      const result = unequipSlot({ character, slot: value.slot });
      if (!result.ok) throw new Error(result.message ?? result.code ?? "unequip failed");
      if (result.changed) notifyLoadoutChanged(character.i);
      return { changed: result.changed, result: { characterId: character.i, slot: value.slot } };
    }
  });

  const unregisterSetQuality = api.registerExtensionCommand({
    extensionId: CHARACTERS_EXTENSION_ID,
    name: "setSlotQuality",
    topics: ["extension.characters"],
    execute: value => {
      if (!isSetSlotQualityRequest(value)) {
        throw new Error("characters.setSlotQuality requires characterId, slot, and quality");
      }
      const character = getCharacters().find(c => c.i === value.characterId);
      if (!character) throw new Error(`characters.setSlotQuality: character ${value.characterId} not found`);
      const result = setSlotQuality({ character, slot: value.slot, quality: value.quality });
      if (!result.ok) throw new Error(result.message ?? result.code ?? "set quality failed");
      if (result.changed) notifyLoadoutChanged(character.i);
      return { changed: result.changed, result: { characterId: character.i, slot: value.slot } };
    }
  });

  const unregisterSetLoadout = api.registerExtensionCommand({
    extensionId: CHARACTERS_EXTENSION_ID,
    name: "setLoadoutEditor",
    topics: ["extension.characters"],
    execute: value => {
      if (!isSetLoadoutEditorRequest(value)) {
        throw new Error("characters.setLoadoutEditor requires characterId and loadout");
      }
      const character = getCharacters().find(c => c.i === value.characterId);
      if (!character) throw new Error(`characters.setLoadoutEditor: character ${value.characterId} not found`);
      const result = setLoadoutEditor({
        character,
        loadout: value.loadout,
        replaceAll: value.replaceAll
      });
      if (!result.ok) throw new Error(result.message ?? result.code ?? "set loadout failed");
      if (result.changed) notifyLoadoutChanged(character.i);
      return { changed: result.changed, result: { characterId: character.i } };
    }
  });

  const unregisterPrepTemplate = api.registerExtensionCommand({
    extensionId: CHARACTERS_EXTENSION_ID,
    name: "applyPrepTemplate",
    topics: ["extension.characters"],
    execute: value => {
      if (!isApplyPrepTemplateRequest(value)) {
        throw new Error("characters.applyPrepTemplate requires characterId and a known templateId");
      }
      const character = getCharacters().find(c => c.i === value.characterId);
      if (!character) throw new Error(`characters.applyPrepTemplate: character ${value.characterId} not found`);
      const goods = resolveGoodsCatalogForEquip(api);
      const catalog = buildLoadoutGoodsCatalog(goods) ?? { ...FALLBACK_LOADOUT_GOOD_IDS };
      const result = applyPrepTemplateLoadout(character, value.templateId, catalog);
      if (!result.ok) throw new Error(result.message ?? "apply prep template failed");
      if (result.changed) notifyLoadoutChanged(character.i);
      return {
        changed: result.changed,
        result: { characterId: character.i, templateId: value.templateId, ok: true }
      };
    }
  });

  const unregisterLoadoutCommands = () => {
    unregisterEquip();
    unregisterUnequip();
    unregisterSetQuality();
    unregisterSetLoadout();
    unregisterPrepTemplate();
  };
  // Supplies each character's base skill value to the generic cross-extension skill
  // registry (see src/services/skillModifierService.ts) — e.g. Shipbuilding reads a
  // state's ruler's Engineering skill via api.getEffectiveSkill() without importing
  // Nobility or Characters directly.
  const unregisterSkillModifier = api.registerSkillModifier(
    CHARACTERS_EXTENSION_ID,
    (characterId, skill, currentValue) => {
      const character = getCharacters().find(c => c.i === characterId);
      if (!character) return currentValue;
      if (SPECIALIZATIONS.has(skill))
        return evaluateExpertise(
          character,
          [{ domainId: skill, axis: "knowledge", weight: 1 }],
          [],
          readEconomyPractice
        ).score;
      const value = character.skills[skill as keyof CharacterSkills];
      return value ?? currentValue;
    }
  );

  const unsubscribe = api.subscribeExtensionState((state, prevState) => {
    const isEnabled = state.enabledExtensions[CHARACTERS_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[CHARACTERS_EXTENSION_ID];
    if (isEnabled && !wasEnabled) api.requestMapReadyTask("characters.roster");
    if (!isEnabled && wasEnabled) {
      // Turning off an extension does not erase authored settings or family history.
    }
  });

  return () => {
    unsubscribe();
    unregisterSkillModifier();
    api.events.removeEventListener("fmg:world-loaded", onWorldLoaded);
    unregisterRosterInitialization();
    unregisterRosterLifecycle();
    unregisterRosterWatches();
    unregisterRosterCommands();
    unregisterExpertiseSimulation();
    unregisterSpecializations();
    unregisterClearCommand();
    unregisterLoadoutCommands();
    clearCharactersContext();
  };
}

export const charactersSimulation: SimulationExtension = {
  id: CHARACTERS_EXTENSION_ID,
  register
};
