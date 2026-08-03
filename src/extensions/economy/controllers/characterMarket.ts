import { tip } from "../../hostServices";
import { openDialog } from "../../hostUi";
import { getMarkets, getWorldContext } from "../economyContext";
import { Goods, isGoodEnabled } from "../generators/goods-generator";
import { floorToRetailLot, getRetailLotSize } from "../generators/goodsTradeLots";
import { Markets } from "../generators/markets-generator";
import { getMerchantPortfolio, syncMarketMerchantPortfolios } from "../generators/merchantPortfolios";
import { getBurgTradeableGoodStock, reconcileRetailInventory } from "../generators/retailInventory";
import { setCharacterMarketCharacterId, useCharacterMarketState } from "../store/characterMarketState";

export interface CharacterMarketRow {
  goodId: number;
  goodName: string;
  goodIcon: string;
  tags: readonly string[];
  unit: string;
  retailLotSize: number;
  merchantId: number | null;
  merchantName: string;
  availableStock: number;
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

export type CharacterMarketMerchantFilter = number | "unassigned" | null;

export interface CharacterMarketFilters {
  tag: string | null;
  merchant: CharacterMarketMerchantFilter;
  inStockOnly: boolean;
}

/** Applies the Character Market's composable, client-side catalogue filters. */
export function filterCharacterMarketRows(
  rows: readonly CharacterMarketRow[],
  filters: CharacterMarketFilters
): CharacterMarketRow[] {
  return rows.filter(row => {
    if (filters.tag !== null && !row.tags.includes(filters.tag)) return false;
    if (typeof filters.merchant === "number" && row.merchantId !== filters.merchant) return false;
    if (filters.merchant === "unassigned" && row.merchantId !== null) return false;
    return !filters.inStockOnly || row.availableStock > 0;
  });
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
  const burgId = burg.i;
  if (burgId === undefined) return null;

  reconcileRetailInventory();
  syncMarketMerchantPortfolios();
  const rows = Object.keys(market.goods)
    .map(Number)
    .map(goodId => Goods.get(goodId))
    .filter((good): good is NonNullable<typeof good> => Boolean(good && isGoodEnabled(good)))
    .map(good => {
      const retailLotSize = getRetailLotSize(good);
      const merchant = getMerchantPortfolio(market.i, good);
      const merchantName = merchant
        ? pack.characters?.find(candidate => candidate.i === merchant.merchantId)?.name
        : undefined;
      return {
        goodId: good.i,
        goodName: good.name,
        goodIcon: good.icon,
        tags: good.tags,
        unit: good.unit,
        retailLotSize,
        merchantId: merchant?.merchantId ?? null,
        merchantName: merchantName ?? "Unassigned",
        availableStock: floorToRetailLot(getBurgTradeableGoodStock(burgId, market.i, good.i), retailLotSize),
        buyPrice: Markets.retailBuyPrice(market.goods[good.i].price, burgId, market.i, good.i),
        sellPrice: Markets.retailSellPrice(market.goods[good.i].price, burgId, market.i, good.i),
        playerUnits: floorToRetailLot(character.inventory?.[good.i] ?? 0, retailLotSize)
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
