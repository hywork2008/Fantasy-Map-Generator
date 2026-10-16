import type { Character, TitleHolding } from "../../characters/characterTypes";
import { getCharacterRoleLabel, getCharacterTitleLabel } from "../../characters/utils/characterLabels";
import type { Burg, Province, State } from "../../hostTypes";
import { getWorldContext } from "../nobilityContext";
import { isLiving, playerCharacterIdFromStore } from "../playerCharacterFocus";

export {
  clearPlayerCharacterSelection,
  pickRandomPoliticalCharacterId,
  refreshPlayerCharacterSelection,
  selectRandomPlayerCharacter,
  setPlayerCharacter
} from "../playerCharacterFocus";

const FIELD_COMMAND_TITLES = new Set(["Commander", "Admiral"]);

export interface PlayerCharacterLocation {
  burgId: number;
  /** Full label, e.g. "Riverton (Aldoria)". */
  label: string;
  x: number;
  y: number;
}

export interface PlayerCharacterSummary {
  id: number;
  name: string;
  /** Personal held money (`Character.wealth`), distinct from state treasury. */
  wealth: number;
  /**
   * L2 public treasury of the character's political state (`state.treasury`).
   * Multi-ledger PR-1: shown beside personal wealth so rulers are not read as "broke nations".
   */
  publicTreasury: number;
  /**
   * L1 crown household purse (`state.householdPurse`). Institutional court cash for the realm.
   */
  householdPurse: number;
  /**
   * L3b domain treasury when the character is a province lord seated on a burg; otherwise null.
   */
  domainTreasury: number | null;
  /** True when the primary title is a landed state ruler (king/etc.). */
  isLandedRuler: boolean;
  /** Gender-resolved office title, e.g. "King", "Marshal", "Count". */
  title: string;
  stateId: number;
  stateName: string;
  /**
   * Which arm of the state the character belongs to — central government, a
   * provincial lordship, or a named field/fleet command.
   */
  organization: string;
  /** Settled burg when known; null if location is missing or invalid. */
  location: PlayerCharacterLocation | null;
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

function resolveLocation(
  character: Character,
  pack: { states?: State[]; burgs?: Burg[] }
): PlayerCharacterLocation | null {
  if (character.location === undefined) return null;
  const burg = pack.burgs?.[character.location];
  if (!burg || burg.removed) return null;
  const stateName =
    burg.state !== undefined && burg.state > 0 ? resolveStateName(pack.states, burg.state) : "Unknown State";
  const burgName = burg.name || `Burg ${character.location}`;
  return {
    burgId: burg.i ?? character.location,
    label: `${burgName} (${stateName})`,
    x: burg.x,
    y: burg.y
  };
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
  pack: { states?: State[]; provinces?: Province[]; burgs?: Burg[] }
): PlayerCharacterSummary | null {
  if (!isLiving(character)) return null;

  const holding = character.titles[0];
  const role = character.roles?.[0];
  let stateId = character.state ?? -1;
  if (holding) {
    stateId =
      holding.entityType === "state"
        ? holding.entityId
        : (character.state ?? pack.provinces?.[holding.entityId]?.state ?? -1);
  } else if (role?.entityType === "state") {
    stateId = role.entityId;
  }

  const state = stateId >= 0 ? pack.states?.[stateId] : undefined;
  const publicTreasury = state?.treasury || 0;
  const householdPurse = state?.householdPurse || 0;
  const isLandedRuler = Boolean(holding?.landed && holding.entityType === "state");

  let domainTreasury: number | null = null;
  if (holding?.entityType === "province") {
    const province = pack.provinces?.[holding.entityId];
    const burgId = province?.burg;
    if (burgId) {
      const burg = pack.burgs?.[burgId];
      if (burg && !burg.removed) domainTreasury = burg.treasury || 0;
    }
  }

  return {
    id: character.i,
    name: character.name,
    wealth: character.wealth ?? 0,
    publicTreasury,
    householdPurse,
    domainTreasury,
    isLandedRuler,
    title: holding ? getCharacterTitleLabel(holding.title) : role ? getCharacterRoleLabel(role) : "—",
    stateId,
    stateName: resolveStateName(pack.states, stateId),
    organization: holding ? resolveOrganization(character, holding, pack) : role ? getCharacterRoleLabel(role) : "—",
    location: resolveLocation(character, pack)
  };
}

/** Read the currently selected character's display summary, or null if none. */
export function getPlayerCharacterSummary(): PlayerCharacterSummary | null {
  const { pack } = getWorldContext();
  const id = playerCharacterIdFromStore();
  if (id === null) return null;
  const character = pack.characters?.find(c => c.i === id);
  if (!character) return null;
  return buildPlayerCharacterSummary(character, pack);
}
