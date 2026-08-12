import { getGoods } from "../economyContext";
import { isGoodEnabled } from "../generators/goods-generator";

let selectedGoodIds = new Set<number>();
let hasExplicitSelection = false;

// "Cheese", "Grapes", "Milk", "Pomace Wine", "Raisins", "Wine"
const DEFAULT_DISPLAYED_GOOD_NAMES = new Set(["Apples", "Figs", "Grapes", "Lemons", "Pears", "Plums"]);

function getDefaultSelection(): ReadonlySet<number> {
  return new Set(
    getGoods()
      .filter(isGoodEnabled)
      .filter(good => DEFAULT_DISPLAYED_GOOD_NAMES.has(good.name))
      .map(good => good.i)
  );
}

/**
 * Gets the goods currently shown on the map. Until the user changes the selection,
 * this preserves the default food-production selection.
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
