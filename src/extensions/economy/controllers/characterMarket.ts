import { tip } from "../../hostServices";
import { openDialog } from "../../hostUi";
import { getMarkets, getWorldContext } from "../economyContext";
import { Goods, isGoodEnabled } from "../generators/goods-generator";
import { Markets } from "../generators/markets-generator";
import { getMerchantPortfolio, syncMarketMerchantPortfolios } from "../generators/merchantPortfolios";
import { getRetailGoodStock, reconcileRetailInventory } from "../generators/retailInventory";
import { setCharacterMarketCharacterId, useCharacterMarketState } from "../store/characterMarketState";

export interface CharacterMarketRow {
  goodId: number;
  goodName: string;
  goodIcon: string;
  unit: string;
  merchantName: string;
  retailStock: number;
  buyPrice: number;
  sellPrice: number;
  playerUnits: number;
}

export interface CharacterMarketSnapshot {
  characterName: string;
  wealth: number;
  burgName: string;
  marketName: string;
  rows: CharacterMarketRow[];
}

export function openCharacterMarket(characterId: number): boolean {
  const character = getWorldContext().pack.characters?.find(
    candidate => candidate.i === characterId && !candidate.dead
  );
  const burg = character?.location === undefined ? undefined : getWorldContext().pack.burgs[character.location];
  if (!character || !burg || burg.removed || !burg.market || !getMarkets().some(market => market.i === burg.market)) {
    tip("The selected character is not in a burg with an active market.", false, "error");
    return false;
  }
  setCharacterMarketCharacterId(characterId);
  useCharacterMarketState.getState().refresh();
  openDialog("characterMarket");
  return true;
}

export function getCharacterMarketSnapshot(characterId: number | null): CharacterMarketSnapshot | null {
  if (characterId === null) return null;
  const { pack } = getWorldContext();
  const character = pack.characters?.find(candidate => candidate.i === characterId && !candidate.dead);
  const burg = character?.location === undefined ? undefined : pack.burgs[character.location];
  if (!character || !burg || burg.removed || !burg.market) return null;
  const market = getMarkets().find(candidate => candidate.i === burg.market);
  if (!market) return null;

  reconcileRetailInventory();
  syncMarketMerchantPortfolios();
  const rows = Object.keys(market.goods)
    .map(Number)
    .map(goodId => Goods.get(goodId))
    .filter((good): good is NonNullable<typeof good> => Boolean(good && isGoodEnabled(good)))
    .map(good => {
      const merchant = getMerchantPortfolio(market.i, good);
      const merchantName = merchant
        ? pack.characters?.find(candidate => candidate.i === merchant.merchantId)?.name
        : undefined;
      return {
        goodId: good.i,
        goodName: good.name,
        goodIcon: good.icon,
        unit: good.unit,
        merchantName: merchantName ?? "Unassigned",
        retailStock: getRetailGoodStock(burg.i ?? character.location!, market.i, good.i)?.onHand ?? 0,
        buyPrice: Markets.retailBuyPrice(market.goods[good.i].price, burg.i ?? character.location!, market.i, good.i),
        sellPrice: Markets.retailSellPrice(market.goods[good.i].price, burg.i ?? character.location!, market.i, good.i),
        playerUnits: character.inventory?.[good.i] ?? 0
      };
    })
    .sort((a, b) => a.goodName.localeCompare(b.goodName));

  return {
    characterName: character.name,
    wealth: character.wealth ?? 0,
    burgName: burg.name ?? `Burg ${character.location}`,
    marketName: market.name ?? `Market ${market.i}`,
    rows
  };
}
