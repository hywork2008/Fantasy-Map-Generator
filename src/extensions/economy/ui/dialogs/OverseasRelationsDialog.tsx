import React from "react";
import { useTranslation } from "react-i18next";

import { Dialog, useDialogState } from "../../../hostUi";
import {
  close,
  refresh,
  selectState,
  sendColonizationExpedition,
  sendRaidExpedition,
  sendTradeExpedition,
  sendTributeExpedition
} from "../../controllers/overseasRelations";
import { useOverseasRelationsState } from "../../store/overseasRelationsState";

export const OverseasRelationsDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("overseasRelations"));
  const { stateOptions, selectedStateId, rows, activeExpeditionCount, lastActionMessage } = useOverseasRelationsState();
  const [escortCount, setEscortCount] = React.useState(0);

  React.useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen]);

  const renderStatus = (row: (typeof rows)[number]) => {
    if (row.activeExpedition) {
      return t("extensions.overseasRelations.outbound", {
        purpose: t(`extensions.overseasRelations.purpose.${row.activeExpedition.purpose}`),
        day: row.activeExpedition.etaTick,
        escorts: row.activeExpedition.escortCount
      });
    }
    if (row.lastOutcome) {
      if (row.lastOutcome.lost) {
        return t(
          row.lastOutcome.cause === "shipwreck"
            ? "extensions.overseasRelations.lostShipwreck"
            : row.lastOutcome.cause === "repelled"
              ? "extensions.overseasRelations.repelled"
              : "extensions.overseasRelations.lostPiracy"
        );
      }
      if (row.lastOutcome.purpose === "tribute") {
        return t("extensions.overseasRelations.tributeSuccess", { revenue: (row.lastOutcome.revenue ?? 0).toFixed(1) });
      }
      if (row.lastOutcome.purpose === "raid") {
        return t("extensions.overseasRelations.raidSuccess", { revenue: (row.lastOutcome.revenue ?? 0).toFixed(1) });
      }
      if (row.lastOutcome.purpose === "colonizeInitial") {
        return t("extensions.overseasRelations.colonyEstablished");
      }
      return t("extensions.overseasRelations.arrivedProfit", { profit: (row.lastOutcome.profit ?? 0).toFixed(1) });
    }
    return t("extensions.overseasRelations.neverSailed");
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.overseasRelations")}
      onClose={close}
      className="fmg-dialog--table"
    >
      <div id="overseasRelationsContainer">
        <div className="d-flex header">
          <label htmlFor="overseasRelationsStateSelect">{t("extensions.overseasRelations.state")}</label>
          <select
            id="overseasRelationsStateSelect"
            value={selectedStateId ?? ""}
            onChange={event => selectState(Number(event.target.value))}
          >
            {stateOptions.map(option => (
              <option key={option.stateId} value={option.stateId}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        {!stateOptions.length ? (
          <div className="dim">{t("extensions.overseasRelations.noEligibleStates")}</div>
        ) : (
          <>
            <div className="totalLine">
              {t("extensions.overseasRelations.activeCount", { count: activeExpeditionCount })}
              <label htmlFor="overseasEscortCount" style={{ marginLeft: "1em" }}>
                {t("extensions.overseasRelations.escortCount")}
              </label>
              <select
                id="overseasEscortCount"
                value={escortCount}
                onChange={event => setEscortCount(Number(event.target.value))}
              >
                {[0, 1, 2, 3].map(count => (
                  <option key={count} value={count}>
                    {t("extensions.overseasRelations.escortOption", { count })}
                  </option>
                ))}
              </select>
              {lastActionMessage && lastActionMessage !== "sent" ? (
                <div className="dim">{t(`extensions.overseasRelations.reason.${lastActionMessage}`)}</div>
              ) : null}
              {lastActionMessage === "sent" ? (
                <div className="dim">{t("extensions.overseasRelations.sentMessage")}</div>
              ) : null}
            </div>

            <table className="fmg-table">
              <thead className="header">
                <tr>
                  <th>{t("extensions.overseasRelations.realm")}</th>
                  <th>{t("extensions.overseasRelations.climate")}</th>
                  <th>{t("extensions.overseasRelations.distance")}</th>
                  <th>{t("extensions.overseasRelations.goods")}</th>
                  <th>{t("extensions.overseasRelations.power")}</th>
                  <th>{t("extensions.overseasRelations.relation")}</th>
                  <th>{t("extensions.overseasRelations.status")}</th>
                  <th>{t("extensions.overseasRelations.action")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.realmId}>
                    <td>{row.realmName}</td>
                    <td>{t(`extensions.overseasRelations.climateBand.${row.climateBand}`)}</td>
                    <td>{t(`extensions.overseasRelations.distanceBand.${row.distanceBand}`)}</td>
                    <td>{row.specialtyGoodNames.join(", ")}</td>
                    <td>{t(`extensions.overseasRelations.powerTier.${row.powerTier}`)}</td>
                    <td>
                      {t(`extensions.overseasRelations.relationLabel.${row.relation}`)}
                      {row.lastTributePaid > 0 ? (
                        <div className="dim">
                          {t("extensions.overseasRelations.monthlyTribute", {
                            revenue: row.lastTributePaid.toFixed(1)
                          })}
                        </div>
                      ) : null}
                      {row.colonyGarrisonRequired !== null && row.colonyGarrisonFunded !== null ? (
                        <div className="dim">
                          <progress
                            value={Math.min(row.colonyGarrisonFunded, row.colonyGarrisonRequired)}
                            max={row.colonyGarrisonRequired}
                          />
                          {t("extensions.overseasRelations.garrison", {
                            funded: row.colonyGarrisonFunded.toFixed(1),
                            required: row.colonyGarrisonRequired.toFixed(1),
                            months: row.monthsUnderfunded
                          })}
                          {row.lastColonyOutput > 0 ? (
                            <div>
                              {t("extensions.overseasRelations.colonyOutput", {
                                output: row.lastColonyOutput.toFixed(1)
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td>{renderStatus(row)}</td>
                    <td>
                      <div className="d-flex">
                        <button
                          type="button"
                          disabled={Boolean(row.activeExpedition)}
                          onClick={() => sendTradeExpedition(row.realmId, escortCount)}
                        >
                          {t("extensions.overseasRelations.sendExpedition")}
                        </button>
                        <button
                          type="button"
                          disabled={
                            Boolean(row.activeExpedition) || row.powerTier === "stronger" || row.relation === "hostile"
                          }
                          onClick={() => sendTributeExpedition(row.realmId, escortCount)}
                        >
                          {t("extensions.overseasRelations.sendTribute")}
                        </button>
                        <button
                          type="button"
                          disabled={
                            Boolean(row.activeExpedition) || row.powerTier !== "weaker" || row.relation === "hostile"
                          }
                          onClick={() => sendRaidExpedition(row.realmId, escortCount)}
                        >
                          {t("extensions.overseasRelations.sendRaid")}
                        </button>
                        <button
                          type="button"
                          disabled={
                            Boolean(row.activeExpedition) ||
                            row.powerTier !== "weaker" ||
                            row.relation === "hostile" ||
                            row.relation === "colony"
                          }
                          onClick={() => sendColonizationExpedition(row.realmId, escortCount)}
                        >
                          {t("extensions.overseasRelations.sendColonize")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Dialog>
  );
};
