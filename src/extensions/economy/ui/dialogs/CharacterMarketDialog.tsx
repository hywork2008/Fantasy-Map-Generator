import React from "react";
import { tip } from "../../../hostServices";
import { Dialog, useDialogState } from "../../../hostUi";
import { formatPrice, rn } from "../../../hostUtils";
import { getCharacterMarketSnapshot } from "../../controllers/characterMarket";
import { getApi } from "../../economyContext";
import { useCharacterMarketState } from "../../store/characterMarketState";

export const CharacterMarketDialog: React.FC = () => {
  const isOpen = useDialogState(state => state.openDialogs.has("characterMarket"));
  const characterId = useCharacterMarketState(state => state.characterId);
  const refreshToken = useCharacterMarketState(state => state.refreshToken);
  const refresh = useCharacterMarketState(state => state.refresh);
  const [quantities, setQuantities] = React.useState<Record<number, string>>({});

  // refreshToken deliberately re-reads mutable economy/character state after a command.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mutable extension data is not a React dependency
  const snapshot = React.useMemo(() => getCharacterMarketSnapshot(characterId), [characterId, refreshToken]);

  const execute = (goodId: number, direction: "buy" | "sell") => {
    if (characterId === null) return;
    const units = Number(quantities[goodId] ?? "1");
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
    <Dialog isOpen={isOpen} title="Character Market" className="fmg-dialog--table">
      {!snapshot ? (
        <p>This character is not currently in a burg with an active market.</p>
      ) : (
        <div id="characterMarketContainer">
          <p>
            <b>{snapshot.characterName}</b> · {snapshot.burgName} · {snapshot.marketName} · Wealth:{" "}
            {formatPrice(snapshot.wealth)}
          </p>
          <table className="fmg-table">
            <thead>
              <tr className="header">
                <th>Good</th>
                <th>Merchant</th>
                <th>On shelves</th>
                <th>Ask</th>
                <th>Bid</th>
                <th>Owned</th>
                <th>Units</th>
                <th>Trade</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.rows.map(row => (
                <tr key={row.goodId}>
                  <td title={row.unit}>
                    <span aria-hidden="true">{row.goodIcon}</span> {row.goodName}
                  </td>
                  <td>{row.merchantName}</td>
                  <td>{rn(row.retailStock, 2)}</td>
                  <td>{formatPrice(row.buyPrice)}</td>
                  <td>{formatPrice(row.sellPrice)}</td>
                  <td>{rn(row.playerUnits, 2)}</td>
                  <td>
                    <input
                      aria-label={`${row.goodName} units`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={quantities[row.goodId] ?? "1"}
                      onChange={event => setQuantities(current => ({ ...current, [row.goodId]: event.target.value }))}
                    />
                  </td>
                  <td>
                    <button type="button" onClick={() => execute(row.goodId, "buy")} disabled={row.retailStock <= 0}>
                      Buy
                    </button>{" "}
                    <button type="button" onClick={() => execute(row.goodId, "sell")} disabled={row.playerUnits <= 0}>
                      Sell
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!snapshot.rows.length ? <p>No goods are currently traded in this market.</p> : null}
        </div>
      )}
    </Dialog>
  );
};
