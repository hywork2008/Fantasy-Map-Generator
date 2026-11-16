import { tip } from "../../hostServices";
import { openDialog } from "../../hostUi";
import { getOutfitterSnapshot } from "../generators/outfitterShop";
import { setOutfitterCharacterId, useOutfitterState } from "../store/outfitterState";

/** Opens the piece counter. UI only; the purchase itself stays in the generator. */
export function openOutfitter(characterId: number): boolean {
  if (!getOutfitterSnapshot(characterId)) {
    tip("The outfitter sells only to a living character in a burg.", false, "error");
    return false;
  }
  setOutfitterCharacterId(characterId);
  useOutfitterState.getState().refresh();
  openDialog("outfitter");
  return true;
}
