import React from "react";
import { useTranslation } from "react-i18next";
import { tip } from "../../../hostServices";
import { closeDialog, Dialog, isDialogOpen, useDialogState } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";
import { getApi } from "../../economyContext";
import { getOutfitterSnapshot, quoteOutfitterPurchase } from "../../generators/outfitterShop";
import { useOutfitterState } from "../../store/outfitterState";
import { openOutfitter } from "../outfitterActions";

function formatPence(pence: number): string {
  return `${pence}d`;
}

/** Pence is the recorded price. Coinage hides a piece cheaper than half a copper. */
function formatKitPrice(pence: number, value: number): string {
  const coins = formatPrice(value);
  if (coins === "⚪0") return formatPence(pence);
  return `${formatPence(pence)} (${coins})`;
}

export const OutfitterDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("outfitter"));
  const characterId = useOutfitterState(state => state.characterId);
  const refreshToken = useOutfitterState(state => state.refreshToken);
  const refresh = useOutfitterState(state => state.refresh);
  const [counts, setCounts] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const onPlayerCharacterChanged = (event: Event) => {
      if (!isDialogOpen("outfitter")) return;
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      const nextCharacterId =
        detail && typeof detail === "object" ? (detail as { characterId?: unknown }).characterId : null;
      closeDialog("outfitter");
      setCounts({});
      if (typeof nextCharacterId === "number" && Number.isInteger(nextCharacterId)) openOutfitter(nextCharacterId);
    };
    document.addEventListener("fmg:player-character-changed", onPlayerCharacterChanged);
    return () => document.removeEventListener("fmg:player-character-changed", onPlayerCharacterChanged);
  }, []);

  // refreshToken re-reads mutable character wealth and kit after a purchase.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mutable extension data is not a React dependency
  const snapshot = React.useMemo(() => getOutfitterSnapshot(characterId), [characterId, refreshToken]);

  const buy = (pieceId: string) => {
    if (characterId === null) return;
    const count = Number(counts[pieceId] ?? "1");
    // A refused buy changes nothing, so the runtime returns no commit and no message.
    let result: { ok?: boolean; message?: string } | undefined;
    try {
      const commit = getApi().dispatchExtensionCommand({
        extensionId: "economy",
        name: "outfitter.buy",
        payload: { characterId, pieceId, count }
      });
      result = commit?.result as { ok?: boolean; message?: string } | undefined;
    } catch (error) {
      result = { ok: false, message: error instanceof Error ? error.message : "Purchase failed." };
    }
    if (!result?.message) {
      const quote = quoteOutfitterPurchase(characterId, pieceId, count);
      result = quote.ok ? { ok: false, message: "Purchase failed." } : quote;
    }
    if (result.message) tip(result.message, false, result.ok ? "success" : "error");
    refresh();
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.outfitter")}
      onClose={() => closeDialog("outfitter")}
      className="fmg-dialog--table"
    >
      {!snapshot ? (
        <p>{t("extensions.outfitter.empty")}</p>
      ) : (
        <div id="outfitterContainer">
          <p className="header">
            {t("extensions.outfitter.header", {
              character: snapshot.characterName,
              burg: snapshot.burgName,
              wealth: formatPrice(snapshot.wealth)
            })}
          </p>
          <p>{t("extensions.outfitter.note")}</p>
          <table aria-label={t("extensions.outfitter.ariaGoods")}>
            <thead>
              <tr>
                <th>{t("extensions.outfitter.piece")}</th>
                <th>{t("extensions.outfitter.price")}</th>
                <th>{t("extensions.outfitter.held")}</th>
                <th>{t("extensions.outfitter.count")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {snapshot.rows.map(row => (
                <tr key={row.id}>
                  <td title={row.source}>{t(`extensions.outfitter.pieces.${row.id}`, { defaultValue: row.name })}</td>
                  <td>{formatKitPrice(row.pence, row.value)}</td>
                  <td>{row.held}</td>
                  <td>
                    <input
                      aria-label={t("extensions.outfitter.countAria", {
                        name: t(`extensions.outfitter.pieces.${row.id}`, { defaultValue: row.name })
                      })}
                      inputMode="numeric"
                      value={counts[row.id] ?? "1"}
                      onChange={event => setCounts(current => ({ ...current, [row.id]: event.target.value }))}
                    />
                  </td>
                  <td>
                    <button type="button" onClick={() => buy(row.id)}>
                      {t("extensions.outfitter.buy")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
};
