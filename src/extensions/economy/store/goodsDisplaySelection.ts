import { getGoods, getWorldContext } from "../economyContext";
import { isGoodEnabled } from "../generators/goods-generator";

let selectedGoodIds = new Set<number>();
let hasExplicitSelection = false;

/**
 * Default Goods Editor checkbox selection for Early/High/Late Medieval maps: staple
 * agricultural/dairy trade goods rather than the Age of Exploration's military/colonial set.
 */
const MEDIEVAL_DEFAULT_GOOD_NAMES = new Set(["Cheese", "Grapes", "Milk", "Pomace Wine", "Raisins", "Wine"]);

/**
 * Default Goods Editor checkbox selection for Age of Exploration maps (the default
 * historicalPeriod — see its doc comment in optionsState.ts): gunpowder-era military goods
 * and the colonial trade/shipping chain they depend on.
 */
const AGE_OF_EXPLORATION_DEFAULT_GOOD_NAMES = new Set([
  "Artillery",
  "Bullets",
  "Caravel",
  "Charcoal",
  "Galleon",
  "Gunpowder",
  "Iron Ingot",
  "Iron Ore",
  "Lead Ingot",
  "Muskets",
  "Obsidian",
  "Pumice",
  "Roman Concrete",
  "Slaves",
  "Sloop",
  "Sulfur"
]);

/** Picks the default Goods Editor selection for the map's historicalPeriod (AGENTS.md). */
function getDefaultDisplayedGoodNames(): ReadonlySet<string> {
  switch (getWorldContext().options.historicalPeriod) {
    case "earlyMedieval":
    case "highMedieval":
    case "lateMedieval":
      return MEDIEVAL_DEFAULT_GOOD_NAMES;
    default:
      // "ageOfExploration" and any unset/unrecognized period fall back to this default
      // (the default historicalPeriod — see its doc comment in optionsState.ts).
      return AGE_OF_EXPLORATION_DEFAULT_GOOD_NAMES;
  }
}

function getDefaultSelection(): ReadonlySet<number> {
  const defaultGoodNames = getDefaultDisplayedGoodNames();
  return new Set(
    getGoods()
      .filter(isGoodEnabled)
      .filter(good => defaultGoodNames.has(good.name))
      .map(good => good.i)
  );
}

/**
 * Gets the goods currently shown on the map. Until the user changes the selection,
 * this preserves the period-dependent default selection (see getDefaultDisplayedGoodNames).
 */
export function getDisplayedGoodIds(): ReadonlySet<number> {
  return hasExplicitSelection ? selectedGoodIds : getDefaultSelection();
}

/** Starts from the default map selection before applying an editor interaction. */
export function initializeDisplayedGoodIds(): void {
  if (hasExplicitSelection) return;
  selectedGoodIds = new Set(getDefaultSelection());
  hasExplicitSelection = true;
}

export function setGoodDisplayed(goodId: number, displayed: boolean): void {
  initializeDisplayedGoodIds();
  if (displayed) selectedGoodIds.add(goodId);
  else selectedGoodIds.delete(goodId);
}

export function setAllGoodsDisplayed(displayed: boolean): void {
  initializeDisplayedGoodIds();
  selectedGoodIds = displayed
    ? new Set(
        getGoods()
          .filter(isGoodEnabled)
          .map(good => good.i)
      )
    : new Set();
}
