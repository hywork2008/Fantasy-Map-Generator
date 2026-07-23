import { getGoods } from "../economyContext";
import { isGoodEnabled } from "../generators/goods-generator";

let selectedGoodIds = new Set<number>();
let hasExplicitSelection = false;

function getDefaultSelection(): ReadonlySet<number> {
  const enabledGoods = getGoods().filter(isGoodEnabled);
  const wood = enabledGoods.find(good => good.name === "Wood");
  return wood ? new Set([wood.i]) : new Set(enabledGoods.map(good => good.i));
}

/**
 * Gets the goods currently shown on the map. Until the user changes the selection,
 * this preserves the established default of showing Wood (or all goods if absent).
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
