import React from "react";
import { useTranslation } from "react-i18next";

import { closeDialog, Dialog, useDialogState } from "../../../hostUi";
import {
  openCouncilSession,
  refreshCouncilSession,
  selectCouncilReplaySession,
  selectCouncilSessionState
} from "../../controllers/councilSession";
import { useCouncilSessionState } from "../../store/councilSessionState";

/**
 * PR-13/14/15 — assembly chronicle, faction vote bars, and session replay scrubber.
 */
export const CouncilSessionDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useDialogState(state => state.openDialogs.has("councilSession"));
  const rows = useCouncilSessionState(state => state.rows);
  const selectedStateId = useCouncilSessionState(state => state.selectedStateId);
  const replaySessionNumber = useCouncilSessionState(state => state.replaySessionNumber);

  React.useEffect(() => {
    if (isOpen) setTimeout(() => openCouncilSession(), 0);
  }, [isOpen]);

  const selected = rows.find(r => r.stateId === selectedStateId) ?? rows[0] ?? null;
  const log = selected ? [...selected.log].reverse() : [];

  const replaySnap =
    selected && replaySessionNumber != null
      ? (selected.snapshots.find(s => s.sessionNumber === replaySessionNumber) ?? null)
      : selected?.snapshots.length
        ? selected.snapshots[selected.snapshots.length - 1]!
        : null;

  const graphFactions = replaySnap?.factions?.length ? replaySnap.factions : (selected?.factionVotes ?? []);
  const graphLineVotes = replaySnap?.lineVotes ?? selected?.lineVotes;
  const graphSupport = replaySnap?.support ?? selected?.support ?? 0;
  const graphDebtYes = replaySnap?.debtVoteYes ?? selected?.debtVoteYes ?? 0;

  return (
    <Dialog
      isOpen={isOpen}
      title={t("extensions.titles.councilSession")}
      onClose={() => closeDialog("councilSession")}
      className="fmg-dialog--table"
    >
      <div style={{ padding: "0.5rem 0.75rem", minWidth: 540 }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap" }}>
          <label>
            {t("extensions.councilSession.state")}{" "}
            <select value={selected?.stateId ?? ""} onChange={e => selectCouncilSessionState(Number(e.target.value))}>
              {rows.map(r => (
                <option key={r.stateId} value={r.stateId}>
                  {r.stateName} (#{r.sessionNumber})
                </option>
              ))}
            </select>
          </label>
          {selected && selected.snapshots.length > 0 ? (
            <label>
              {t("extensions.councilSession.replay")}{" "}
              <select
                value={replaySessionNumber ?? selected.snapshots[selected.snapshots.length - 1]!.sessionNumber}
                onChange={e => selectCouncilReplaySession(Number(e.target.value))}
              >
                {selected.snapshots.map(s => (
                  <option key={s.sessionNumber} value={s.sessionNumber}>
                    #{s.sessionNumber} · {t("extensions.councilSession.dateFmt", { year: s.year, month: s.month })}
                    {s.councilFailed ? ` · ${t("extensions.councilSession.veto")}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            className="icon-cw"
            data-tip={t("extensions.councilSession.refreshTip")}
            aria-label={t("extensions.councilSession.refreshAria")}
            onClick={() => refreshCouncilSession(selected?.stateId)}
          />
        </div>

        {!selected ? (
          <div className="empty-message">{t("extensions.councilSession.empty")}</div>
        ) : (
          <>
            <div style={{ fontSize: "0.9em", marginBottom: "0.5rem" }}>
              <strong>{selected.stateName}</strong> · {selected.form} ·{" "}
              {t("extensions.councilSession.support", { value: graphSupport })}
              {graphDebtYes > 0
                ? ` · ${t("extensions.councilSession.debtVote", { pct: (graphDebtYes * 100).toFixed(0) })}`
                : ""}
              {selected.coupLegitimacy != null
                ? ` · ${t("extensions.councilSession.legitimacy", { value: selected.coupLegitimacy })}`
                : ""}
              {selected.civilUnrest ? ` · ${t("extensions.councilSession.civilUnrest")}` : ""}
              {selected.legitimacyWarActive
                ? ` · ${t("extensions.councilSession.legitWar")}${selected.pretenderName ? ` (${selected.pretenderName})` : ""}`
                : ""}
              {selected.foreignDebtInDefault ? ` · ${t("extensions.councilSession.fxDefault")}` : ""}
              {selected.tradeSanctionMult < 1
                ? ` · ${t("extensions.councilSession.trade", { value: selected.tradeSanctionMult.toFixed(2) })}`
                : ""}
              {selected.creditRating
                ? ` · ${t("extensions.councilSession.rating", { value: selected.creditRating })}`
                : ""}
            </div>

            {/* PR-15 faction vote bar graph */}
            {graphFactions.length > 0 ? (
              <div style={{ marginBottom: "0.75rem" }}>
                <div style={{ fontWeight: 600, fontSize: "0.85em", marginBottom: "0.35rem" }}>
                  {t("extensions.councilSession.graph")}
                  {replaySnap
                    ? t("extensions.councilSession.graphSession", {
                        n: replaySnap.sessionNumber,
                        year: replaySnap.year,
                        month: replaySnap.month
                      })
                    : t("extensions.councilSession.graphLive")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  {graphFactions.map(f => {
                    const leanPct = Math.max(0, Math.min(100, f.lean * 100));
                    const sharePct = Math.max(0, Math.min(100, f.share * 100));
                    return (
                      <div key={f.faction} style={{ fontSize: "0.8em" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>
                            {t("extensions.councilSession.share", {
                              faction: councilFactionLabel(f.faction, t),
                              pct: sharePct.toFixed(0)
                            })}
                          </span>
                          <span>{t("extensions.councilSession.yesLean", { pct: leanPct.toFixed(0) })}</span>
                        </div>
                        <div
                          style={{
                            height: 10,
                            background: "var(--bg-secondary, #2a2a2a)",
                            borderRadius: 3,
                            overflow: "hidden",
                            position: "relative"
                          }}
                        >
                          <div
                            style={{
                              width: `${leanPct}%`,
                              height: "100%",
                              background: leanPct >= 50 ? "#4caf50" : "#e57373",
                              opacity: 0.35 + sharePct / 200
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {graphLineVotes ? (
                  <div style={{ fontSize: "0.8em", marginTop: "0.4rem", opacity: 0.9 }}>
                    {t("extensions.councilSession.lineYes", {
                      debt: (graphLineVotes.debtIssue * 100).toFixed(0),
                      war: (graphLineVotes.warFooting * 100).toFixed(0),
                      tax: (graphLineVotes.extraordinaryTax * 100).toFixed(0),
                      mil: (graphLineVotes.militaryExpansion * 100).toFixed(0)
                    })}
                  </div>
                ) : null}
                {replaySnap?.notes ? (
                  <div style={{ fontSize: "0.75em", marginTop: "0.25rem", opacity: 0.75 }}>{replaySnap.notes}</div>
                ) : null}
              </div>
            ) : null}

            <table className="fmg-table" style={{ width: "100%", fontSize: "0.85em" }}>
              <thead>
                <tr>
                  <th>{t("extensions.councilSession.when")}</th>
                  <th>{t("extensions.councilSession.kind")}</th>
                  <th>{t("extensions.councilSession.summary")}</th>
                </tr>
              </thead>
              <tbody>
                {log.length === 0 ? (
                  <tr>
                    <td colSpan={3}>{t("extensions.councilSession.emptyLog")}</td>
                  </tr>
                ) : (
                  log.map(entry => (
                    <tr key={entry.id}>
                      <td>{t("extensions.councilSession.dateFmt", { year: entry.year, month: entry.month })}</td>
                      <td>{councilKindLabel(entry.kind, t)}</td>
                      <td data-tip={localizeFactionDetail(entry.factionDetail, t) || councilLogSummary(entry, t)}>
                        {councilLogSummary(entry, t)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Dialog>
  );
};

const FACTION_KEYS: Record<string, string> = {
  court: "extensions.councilSession.factionCourt",
  merchants: "extensions.councilSession.factionMerchants",
  military: "extensions.councilSession.factionMilitary",
  clergy: "extensions.councilSession.factionClergy"
};

const KIND_KEYS: Record<string, string> = {
  session: "extensions.councilSession.kindSession",
  vote: "extensions.councilSession.kindVote",
  veto: "extensions.councilSession.kindVeto",
  tax_farm: "extensions.councilSession.kindTaxFarm",
  debt_issue: "extensions.councilSession.kindDebtIssue",
  debt_service: "extensions.councilSession.kindDebtService",
  default: "extensions.councilSession.kindDefault",
  coup_risk: "extensions.councilSession.kindCoupRisk",
  coup: "extensions.councilSession.kindCoup",
  foreign_debt: "extensions.councilSession.kindForeignDebt",
  diplomacy: "extensions.councilSession.kindDiplomacy",
  bond_market: "extensions.councilSession.kindBondMarket",
  note: "extensions.councilSession.kindNote"
};

function councilFactionLabel(faction: string, t: (key: string) => string): string {
  return FACTION_KEYS[faction] ? t(FACTION_KEYS[faction]) : faction;
}

function councilKindLabel(kind: string, t: (key: string) => string): string {
  return KIND_KEYS[kind] ? t(KIND_KEYS[kind]) : kind;
}

function councilLogSummary(
  entry: { summary: string; messageKey?: string; messageParams?: Record<string, string | number> },
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!entry.messageKey) return entry.summary;
  return t(`extensions.councilSession.logs.${entry.messageKey}`, entry.messageParams);
}

function localizeFactionDetail(detail: string | undefined, t: (key: string) => string): string | undefined {
  if (!detail) return undefined;
  return detail.replace(/\b(court|merchants|military|clergy)\b/g, match =>
    FACTION_KEYS[match] ? t(FACTION_KEYS[match]) : match
  );
}
