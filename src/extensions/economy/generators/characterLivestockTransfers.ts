/** Optional Economy consumer of committed character inventory transfers. */
import {
  CHARACTER_INVENTORY_TRANSFER_EVENT,
  type CharacterInventoryContainer,
  isCharacterInventoryTransfer
} from "../../../simulation/characterInventoryEvents";
import { getGoods } from "../economyContext";
import { moveOwnedLivestock } from "./livestockLots";

function location(container: CharacterInventoryContainer): string {
  return container.container === "inventory"
    ? `character:${container.characterId}`
    : `loadout:${container.characterId}:${container.slot}`;
}
export function registerCharacterLivestockTransfers(events: EventTarget, isEnabled: () => boolean): () => void {
  const listener = (event: Event) => {
    if (!isEnabled()) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isCharacterInventoryTransfer(detail)) return;
    const good = getGoods().find(row => row.i === detail.goodId && row.tags.includes("liveAnimal"));
    if (!good || location(detail.from) === location(detail.to)) return;
    moveOwnedLivestock({
      species: good.name,
      units: detail.units,
      openingUnits: detail.fromOpeningUnits,
      destinationOpeningUnits: detail.toOpeningUnits,
      fromOwnerId: `character:${detail.from.characterId}`,
      fromLocationId: location(detail.from),
      toOwnerId: `character:${detail.to.characterId}`,
      locationId: location(detail.to)
    });
  };
  events.addEventListener(CHARACTER_INVENTORY_TRANSFER_EVENT, listener);
  return () => events.removeEventListener(CHARACTER_INVENTORY_TRANSFER_EVENT, listener);
}
