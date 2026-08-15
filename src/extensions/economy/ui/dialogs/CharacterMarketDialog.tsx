import React from "react";
import { useTranslation } from "react-i18next";
import { tip } from "../../../hostServices";
import { closeDialog, Dialog, isDialogOpen, useDialogState } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";
import {
  type CharacterMarketMerchantFilter,
  filterCharacterMarketRows,
  getCharacterMarketSnapshot,
  openCharacterMarket
} from "../../controllers/characterMarket";
import { getApi } from "../../economyContext";
import { formatRetailQuantity } from "../../generators/goodsTradeLots";
import { useCharacterMarketState } from "../../store/characterMarketState";

export const CharacterMarketDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("characterMarket"));
  const characterId = useCharacterMarketState(state => state.characterId);
  const refreshToken = useCharacterMarketState(state => state.refreshToken);
  const refresh = useCharacterMarketState(state => state.refresh);
  const [quantities, setQuantities] = React.useState<Record<number, string>>({});
  const [tagFilter, setTagFilter] = React.useState<string | null>(null);
  const [merchantFilter, setMerchantFilter] = React.useState<CharacterMarketMerchantFilter>(null);
  const [inStockOnly, setInStockOnly] = React.useState(false);

  React.useEffect(() => {
    const onPlayerCharacterChanged = (event: Event) => {
      if (!isDialogOpen("characterMarket")) return;
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      const nextCharacterId =
        detail && typeof detail === "object" ? (detail as { characterId?: unknown }).characterId : null;
      closeDialog("characterMarket");
      setQuantities({});
      setTagFilter(null);
      setMerchantFilter(null);
      setInStockOnly(false);
      if (typeof nextCharacterId === "number" && Number.isInteger(nextCharacterId))
        openCharacterMarket(nextCharacterId);
    };
    document.addEventListener("fmg:player-character-changed", onPlayerCharacterChanged);
    return () => document.removeEventListener("fmg:player-character-changed", onPlayerCharacterChanged);
  }, []);

  // refreshToken deliberately re-reads mutable economy/character state after a command.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mutable extension data is not a React dependency
  const snapshot = React.useMemo(() => getCharacterMarketSnapshot(characterId), [characterId, refreshToken]);
  const tagOptions = React.useMemo(
    () => [...new Set(snapshot?.rows.flatMap(row => row.tags) ?? [])].toSorted((a, b) => a.localeCompare(b)),
    [snapshot]
  );
  const merchantOptions = React.useMemo(() => {
    const merchantsById = new Map<number, { id: number; name: string }>();
    for (const row of snapshot?.rows ?? []) {
      if (row.merchantId !== null) {
        merchantsById.set(row.merchantId, { id: row.merchantId, name: row.merchantName });
      }
    }
    return [...merchantsById.values()].toSorted((a, b) => a.name.localeCompare(b.name));
  }, [snapshot]);

  React.useEffect(() => {
    if (tagFilter !== null && !tagOptions.includes(tagFilter)) setTagFilter(null);
    if (typeof merchantFilter === "number" && !merchantOptions.some(option => option.id === merchantFilter)) {
      setMerchantFilter(null);
    }
  }, [merchantFilter, merchantOptions, tagFilter, tagOptions]);

  const rows = React.useMemo(
    () =>
      filterCharacterMarketRows(snapshot?.rows ?? [], {
        tag: tagFilter,
        merchant: merchantFilter,
        inStockOnly
      }),
    [inStockOnly, merchantFilter, snapshot, tagFilter]
  );

  const execute = (goodId: number, direction: "buy" | "sell", unitsText?: string) => {
    if (characterId === null) return;
    const units = Number(unitsText ?? quantities[goodId] ?? "1");
    const commit = getApi().dispatchExtensionCommand({
      extensionId: "economy",
      name: "commerce.trade",
      payload: { characterId, goodId, units, direction }
    });
    const result = commit?.result as { ok?: boolean; message?: string } | undefined;
    if (result?.message) tip(result.message, false, result.ok ? "success" : "error");
    refresh();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.characterMarket")}
      onClose={() => closeDialog("characterMarket")}
      className="fmg-dialog--table"
    >
      {!snapshot ? (
        <p>{t("extensions.characterMarket.empty")}</p>
      ) : (
        <div id="characterMarketContainer">
          <p className="header">
            {t("extensions.characterMarket.header", {
              character: snapshot.characterName,
              burg: snapshot.burgName,
              market: snapshot.marketName,
              wealth: formatPrice(snapshot.wealth),
              count: snapshot.rows.length
            })}
          </p>
          <div id="characterMarketFilters" data-tip={t("extensions.characterMarket.filterTip")} className="d-flex">
            <label htmlFor="characterMarketFilterTag">
              {t("extensions.characterMarket.tag")}
              <select
                id="characterMarketFilterTag"
                value={tagFilter ?? ""}
                onChange={event => setTagFilter(event.target.value || null)}
              >
                <option value="">{t("extensions.characterMarket.all")}</option>
                {tagOptions.map(tag => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="characterMarketFilterMerchant">
              {t("extensions.characterMarket.merchant")}
              <select
                id="characterMarketFilterMerchant"
                value={merchantFilter ?? ""}
                onChange={event => {
                  const value = event.target.value;
                  setMerchantFilter(value === "" ? null : value === "unassigned" ? "unassigned" : Number(value));
                }}
              >
                <option value="">{t("extensions.characterMarket.all")}</option>
                <option value="unassigned">{t("extensions.characterMarket.unassigned")}</option>
                {merchantOptions.map(merchant => (
                  <option key={merchant.id} value={merchant.id}>
                    {merchant.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="characterMarketInStock">
              <input
                id="characterMarketInStock"
                type="checkbox"
                className="native"
                checked={inStockOnly}
                onChange={event => setInStockOnly(event.target.checked)}
              />{" "}
              {t("extensions.characterMarket.inStockOnly")}
            </label>
          </div>
          <section
            className="table"
            aria-label={t("extensions.characterMarket.ariaGoods")}
            style={{ overflowY: "scroll", scrollbarGutter: "stable" }}
          >
            <table className="fmg-table">
              <thead>
                <tr className="header">
                  <th>{t("extensions.characterMarket.good")}</th>
                  <th>{t("extensions.characterMarket.merchantCol")}</th>
                  <th>{t("extensions.characterMarket.available")}</th>
                  <th>{t("extensions.characterMarket.ask")}</th>
                  <th>{t("extensions.characterMarket.bid")}</th>
                  <th>{t("extensions.characterMarket.owned")}</th>
                  <th>{t("extensions.characterMarket.units")}</th>
                  <th>{t("extensions.characterMarket.trade")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const localizedGoodName = t(`economy.goods.names.${row.goodName}`, { defaultValue: row.goodName });
                  return (
                    <tr key={row.goodId}>
                      <td title={row.unit}>
                        <svg aria-hidden="true" width="1.3em" height="1.3em" className="goodIcon">
                          <use href={`#${row.goodIcon}`} x="10%" y="10%" width="80%" height="80%" />
                        </svg>{" "}
                        {localizedGoodName}
                      </td>
                      <td>{row.merchantName}</td>
                      <td>{formatRetailQuantity(row.availableStock, row.retailLotSize)}</td>
                      <td>{formatPrice(row.buyPrice)}</td>
                      <td>{formatPrice(row.sellPrice)}</td>
                      <td>{formatRetailQuantity(row.playerUnits, row.retailLotSize)}</td>
                      <td>
                        <input
                          aria-label={t("extensions.characterMarket.unitsAria", { name: localizedGoodName })}
                          type="number"
                          min={row.retailLotSize}
                          step={row.retailLotSize}
                          value={quantities[row.goodId] ?? formatRetailQuantity(row.retailLotSize, row.retailLotSize)}
                          onChange={event =>
                            setQuantities(current => ({ ...current, [row.goodId]: event.target.value }))
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => execute(row.goodId, "buy")}
                          disabled={row.availableStock <= 0}
                        >
                          {t("extensions.characterMarket.buy")}
                        </button>{" "}
                        <button
                          type="button"
                          onClick={() =>
                            execute(row.goodId, "buy", formatRetailQuantity(row.availableStock, row.retailLotSize))
                          }
                          disabled={row.availableStock <= 0}
                        >
                          {t("extensions.characterMarket.buyAll")}
                        </button>{" "}
                        <button
                          type="button"
                          onClick={() => execute(row.goodId, "sell")}
                          disabled={row.playerUnits <= 0}
                        >
                          {t("extensions.characterMarket.sell")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          {!snapshot.rows.length ? <p>{t("extensions.characterMarket.noTraded")}</p> : null}
          {snapshot.rows.length > 0 && rows.length === 0 ? <p>{t("extensions.characterMarket.noMatch")}</p> : null}
        </div>
      )}
    </Dialog>
  );
};
