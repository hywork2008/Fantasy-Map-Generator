import React from "react";
import { useTranslation } from "react-i18next";
import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import { rn } from "../../../hostUtils";

import { liveCorridorNeeds } from "../../generators/tradeCorridorLedger";

const MODE_KEY = {
  land: "extensions.tradeCorridors.modeLand",
  river: "extensions.tradeCorridors.modeRiver",
  sea: "extensions.tradeCorridors.modeSea"
} as const;

/**
 * Yearly burg-pair ledger: which towns trade, how late the journey is, and whether a
 * ferry or a thin harbour is holding it up (docs/plan/fmg-economy-to-city-editor.md §6.3).
 */
export const TradeCorridorsDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("tradeCorridors"));
  const rows = React.useMemo(() => (isOpen ? liveCorridorNeeds() : []), [isOpen]);

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.tradeCorridors.title")}
      className="fmg-dialog--table"
      onClose={() => closeDialog("tradeCorridors")}
    >
      <div id="tradeCorridorsContainer">
        {rows.length === 0 ? (
          <p>{t("extensions.tradeCorridors.empty")}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t("extensions.tradeCorridors.towns")}</th>
                <th>{t("extensions.tradeCorridors.mode")}</th>
                <th>{t("extensions.tradeCorridors.slots")}</th>
                <th>{t("extensions.tradeCorridors.demand")}</th>
                <th>{t("extensions.tradeCorridors.delay")}</th>
                <th>{t("extensions.tradeCorridors.threat")}</th>
                <th>{t("extensions.tradeCorridors.ferry")}</th>
                <th>{t("extensions.tradeCorridors.harbor")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={`${row.burgA}-${row.burgB}`}>
                  <td>
                    {row.nameA} — {row.nameB}
                  </td>
                  <td>{t(MODE_KEY[row.mode])}</td>
                  <td>{rn(row.cargoSlots, 1)}</td>
                  <td>{rn(row.demand, 2)}</td>
                  <td>{rn(row.delay, 2)}</td>
                  <td>{rn(row.threat, 2)}</td>
                  <td>{rn(row.ferryShare, 2)}</td>
                  <td>{row.harborShort ? t("extensions.tradeCorridors.harborShort") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  );
};
