import { worldContext } from "../context/worldContext";
import { getAllowedCharacterRaceKeys, getSelectedAbilityPresetId } from "../extensions/characters/charactersContext";
import { isReferenceEvaluation } from "../extensions/characters/reference/evaluation";
import { readReference, validateReference } from "../extensions/characters/reference/model";
import type { MapReadyTaskContext } from "../runtime/mapReadyTaskCoordinator";
import { worldRuntime } from "../runtime/worldRuntime";
import { optionsStore } from "../state/optionsStore";
import { uiPreferencesStore } from "../state/uiPreferencesStore";
import type { SimulationExtensionAPI } from "../types/extension-api";
import type { MasterReferenceMessage, MasterReferenceRequest } from "./masterReferenceProtocol";
import { simulationSettings } from "./ports";
import { WORLD_SETTING_KEYS } from "./worldSettings";

export type MasterReferenceRunner = (
  request: MasterReferenceRequest,
  progress: (message: MasterReferenceMessage) => void,
  current: () => boolean
) => Promise<import("../runtime/worldArchive").WorldDocument>;
let installedRunner: MasterReferenceRunner | undefined;
export function installMasterReferenceRunner(runner: MasterReferenceRunner): void {
  installedRunner = runner;
}
/** Called at the opening economy task, before any ordinary initial production is applied. */
export async function prepareMasterReference(
  api: SimulationExtensionAPI,
  context: MapReadyTaskContext
): Promise<boolean> {
  if (isReferenceEvaluation() || api.worldContext !== worldContext || !api.isExtensionEnabled("characters"))
    return false;
  const slice = api.simulationContext.extensions;
  const reference = readReference(api.simulationContext);
  if (reference) return !api.isExtensionEnabled("economy") || reference.tasks.includes("economy.initialization");
  if (!context.generation || api.simulationContext.tickCount > 0) return false;
  // Existing worlds keep their actual wallets and institutions. No silent profile migration.
  const cash = slice.economy?.personalCash as { initialized?: boolean; accounts?: object; pools?: object } | undefined;
  const funded =
    cash &&
    (cash.initialized || Object.keys(cash.accounts ?? {}).length > 0 || Object.keys(cash.pools ?? {}).length > 0);
  if (
    (slice.characters?.characters as unknown[] | undefined)?.length ||
    (slice.economy?.markets as unknown[] | undefined)?.length ||
    funded
  )
    return false;
  const preset = getSelectedAbilityPresetId();
  if (!["ck3e", "dnd5e"].includes(preset)) throw Error("Master opening generation requires a built-in ability preset");
  const allowedRaces = [...getAllowedCharacterRaceKeys()];
  const document = worldRuntime.captureRollbackDocument();
  document.simulation.extensions.characters ??= {};
  document.simulation.extensions.characters.abilityPresetId = preset;
  document.simulation.extensions.characters.allowedRaceKeys = allowedRaces;
  // A roster can have been opened before generation finished; it is not a master input.
  if (document.simulation.extensions.characters) delete document.simulation.extensions.characters.roster;
  const settings: Record<string, string> = {};
  for (const key of [...WORLD_SETTING_KEYS, "allowedRaceKeys"]) {
    const value = simulationSettings.getItem(key);
    if (value !== null) settings[key] = value;
  }
  const plain = (value: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(value));
  const request: MasterReferenceRequest = {
    document,
    extensions: ["economy", "characters", "nobility", "shipbuilding"].filter(id => api.isExtensionEnabled(id)),
    settings,
    options: plain(optionsStore.getState()),
    preferences: plain(uiPreferencesStore.getState())
  };
  if (!installedRunner) throw Error("The host has no master reference worker installed");
  const result = await installedRunner(
    request,
    message => {
      if (message.kind === "progress") context.reportProgress(message.total ? message.done / message.total : 0);
    },
    context.isCurrent
  );
  if (!context.isCurrent()) return true;
  validateReference(result.simulation.extensions.characters?.referenceGeneration);
  worldRuntime.restoreRollbackDocument(result);
  return true;
}
