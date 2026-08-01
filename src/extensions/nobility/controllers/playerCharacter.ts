import type { Character, TitleHolding } from "../../characters/characterTypes";
import type { Province, State } from "../../hostTypes";
import { getWorldContext } from "../nobilityContext";
import { usePlayerCharacterState } from "../store/playerCharacterState";

const FIELD_COMMAND_TITLES = new Set(["Commander", "Admiral"]);

export interface PlayerCharacterSummary {
  id: number;
  name: string;
  /** Personal held money (`Character.wealth`), distinct from state treasury. */
  wealth: number;
  /** Gender-resolved office title, e.g. "King", "Marshal", "Count". */
  title: string;
  stateId: number;
  stateName: string;
  /**
   * Which arm of the state the character belongs to — central government, a
   * provincial lordship, or a named field/fleet command.
   */
  organization: string;
}

function isLivingPolitician(character: Character): boolean {
  return !character.dead && character.titles.length > 0;
}

function listPoliticalCandidates(characters: Character[] | undefined): Character[] {
  if (!characters?.length) return [];
  return characters.filter(isLivingPolitician);
}

function resolveStateName(states: State[] | undefined, stateId: number): string {
  return states?.[stateId]?.name ?? "Unknown";
}

function resolveProvinceLabel(provinces: Province[] | undefined, provinceId: number): string {
  const province = provinces?.[provinceId];
  if (!province) return "Province";
  return province.fullName || province.name || `Province ${provinceId}`;
}

function resolveRegimentName(states: State[] | undefined, stateId: number, characterId: number): string | null {
  const regiments = states?.[stateId]?.military;
  if (!regiments?.length) return null;
  const regiment = regiments.find(r => r.commanderId === characterId);
  return regiment?.name ?? null;
}

/**
 * Maps a title holding to a human-readable organization label within its state.
 * Central court offices share one bucket; provincial lords and field officers get
 * their specific seat of power so the HUD answers "which part of the state?".
 */
export function resolveOrganization(
  character: Character,
  title: TitleHolding,
  pack: { states?: State[]; provinces?: Province[] }
): string {
  if (title.entityType === "province") {
    return resolveProvinceLabel(pack.provinces, title.entityId);
  }

  if (FIELD_COMMAND_TITLES.has(title.title)) {
    const regimentName = resolveRegimentName(pack.states, title.entityId, character.i);
    return regimentName ? `Military · ${regimentName}` : "Military Command";
  }

  if (title.landed) return "Ruling Court";
  return "Central Government";
}

export function buildPlayerCharacterSummary(
  character: Character,
  pack: { states?: State[]; provinces?: Province[] }
): PlayerCharacterSummary | null {
  if (!isLivingPolitician(character)) return null;

  const holding = character.titles[0];
  const stateId =
    holding.entityType === "state"
      ? holding.entityId
      : (character.state ?? pack.provinces?.[holding.entityId]?.state ?? -1);

  return {
    id: character.i,
    name: character.name,
    wealth: character.wealth ?? 0,
    title: holding.title,
    stateId,
    stateName: resolveStateName(pack.states, stateId),
    organization: resolveOrganization(character, holding, pack)
  };
}

/**
 * Pick a living titled character at random. Uses Math.random so it follows the
 * same seeded stream used by nobility generation when called during map gen.
 * When `excludeId` is set and other candidates exist, that id is skipped so the
 * HUD "reroll" button actually changes the focus character.
 */
export function pickRandomPoliticalCharacterId(
  characters: Character[] | undefined,
  excludeId?: number | null
): number | null {
  let candidates = listPoliticalCandidates(characters);
  if (!candidates.length) return null;
  if (excludeId != null && candidates.length > 1) {
    candidates = candidates.filter(c => c.i !== excludeId);
  }
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index]?.i ?? null;
}

/**
 * Assign a fresh random focus character. Call after nobility generation or when
 * the current selection is no longer a living politician.
 * Pass `excludeCurrent: true` for the HUD reroll control.
 */
export function selectRandomPlayerCharacter(options?: { excludeCurrent?: boolean }): number | null {
  const { pack } = getWorldContext();
  const store = usePlayerCharacterState.getState();
  const excludeId = options?.excludeCurrent ? store.playerCharacterId : null;
  const id = pickRandomPoliticalCharacterId(pack.characters, excludeId);
  store.setPlayerCharacterId(id);
  store.bumpRefreshToken();
  return id;
}

/**
 * Keep the HUD selection valid after succession / death ticks.
 * - Missing or dead / title-less selection → re-roll.
 * - Still valid → just bump the refresh token so live title/age changes re-render.
 */
export function refreshPlayerCharacterSelection(): void {
  const { pack } = getWorldContext();
  const store = usePlayerCharacterState.getState();
  const currentId = store.playerCharacterId;
  const current = currentId !== null ? pack.characters?.find(c => c.i === currentId) : undefined;

  if (!current || !isLivingPolitician(current)) {
    selectRandomPlayerCharacter();
    return;
  }

  store.bumpRefreshToken();
}

export function clearPlayerCharacterSelection(): void {
  usePlayerCharacterState.getState().clear();
}

/** Read the currently selected character's display summary, or null if none. */
export function getPlayerCharacterSummary(): PlayerCharacterSummary | null {
  const { pack } = getWorldContext();
  const id = usePlayerCharacterState.getState().playerCharacterId;
  if (id === null) return null;
  const character = pack.characters?.find(c => c.i === id);
  if (!character) return null;
  return buildPlayerCharacterSummary(character, pack);
}
