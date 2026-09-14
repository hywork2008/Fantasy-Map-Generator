import type React from "react";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { zoomTo } from "../../actions";
import { worldContext } from "../../context/worldContext";
import { getCharacters } from "../../extensions/characters/charactersContext";
import { useCharactersUiState } from "../../extensions/characters/ui/charactersUiState";
import { dialogStore } from "../../store/dialogState";
import { useWarDetailsDialogState, warDetailsDialogStore } from "../../store/warDetailsDialogState";
import type { WarNonBelligerent, WarParticipant } from "../../types/models";
import { si } from "../../utils";
import { Dialog } from "./Dialog";

const DIALOG_ID = "warDetails";

export const WarDetailsDialog: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useWarDetailsDialogState(s => s.isOpen);
  const warDetails = useWarDetailsDialogState(s => s.warDetails);

  const close = useCallback(() => warDetailsDialogStore.getState().close(), []);

  useEffect(() => {
    if (!isOpen) return;
    dialogStore.getState().openDialog(DIALOG_ID, { onClose: close });
    return () => {
      dialogStore.getState().closeDialog(DIALOG_ID);
    };
  }, [isOpen, close]);

  if (!warDetails) return null;

  const states = worldContext.pack.states;
  const burgs = worldContext.pack.burgs;

  const attackers = warDetails.participants.filter(p => p.side === "attacker");
  const defenders = warDetails.participants.filter(p => p.side === "defender");

  const totalAttackerTroops = attackers.reduce((acc, p) => acc + p.forces.total, 0);
  const totalDefenderTroops = defenders.reduce((acc, p) => acc + p.forces.total, 0);
  const grandTotal = totalAttackerTroops + totalDefenderTroops || 1;
  const attackerRatio = Math.round((totalAttackerTroops / grandTotal) * 100);
  const defenderRatio = 100 - attackerRatio;

  const handleBurgZoom = (burgId: number) => {
    const burg = burgs[burgId];
    if (burg) zoomTo(burg.x, burg.y, 8, 1000);
  };

  const getOfficersForState = (stateId: number) => {
    try {
      const allCharacters = getCharacters();
      return allCharacters.filter(c => {
        if (c.state !== stateId || !c.militaryRecord?.services) return false;
        return c.militaryRecord.services.some(s => {
          if (s.warId && s.warId === warDetails.id) return true;
          return s.campaignName === warDetails.name && Math.abs(s.year - warDetails.startYear) <= 2;
        });
      });
    } catch {
      return [];
    }
  };

  const getNonBelligerents = (): WarNonBelligerent[] => {
    if (warDetails.nonBelligerents && warDetails.nonBelligerents.length > 0) {
      return warDetails.nonBelligerents;
    }
    // Fallback extraction from states[0].diplomacy
    // biome-ignore lint/suspicious/noExplicitAny: chronicle structure
    const chronicle = states[0]?.diplomacy as any[];
    if (!Array.isArray(chronicle)) return [];
    const results: WarNonBelligerent[] = [];
    for (const group of chronicle) {
      if (!Array.isArray(group) || group.length < 2) continue;
      const groupName = typeof group[0] === "string" ? group[0] : "";
      if (groupName !== warDetails.name) continue;

      for (let i = 1; i < group.length; i++) {
        const ev = group[i];
        if (ev && typeof ev === "object") {
          if (ev.action === "severed the defense pact") {
            results.push({
              stateId: ev.from,
              targetStateId: ev.to,
              action: "severed_defense_pact",
              reason: ev.rawText || "Severed defense pact"
            });
          } else if (
            ev.action === "avoided entering the war" ||
            ev.action?.includes("avoided") ||
            ev.action?.includes("did not join")
          ) {
            results.push({
              stateId: ev.from,
              targetStateId: ev.to,
              action: "avoided_war",
              reason: ev.rawText || "Avoided entering the war"
            });
          }
        }
      }
    }
    return results;
  };

  const renderParticipantCard = (p: WarParticipant) => {
    const state = states[p.stateId];
    const stateName = state?.name || `State ${p.stateId}`;
    const stateColor = state?.color || "#888888";

    let roleBadgeColor = "#4a5568";
    let roleText = "Ally";
    if (p.role === "leader") {
      roleBadgeColor = p.side === "attacker" ? "#c53030" : "#2b6cb0";
      roleText = "Leader";
    } else if (p.role === "vassal") {
      roleBadgeColor = "#744210";
      roleText = "Vassal";
    }

    let transitIcon = "⚔️";
    let transitBadgeColor = "#2d3748";
    let transitText = "Direct Border";
    if (p.transitType === "naval_expedition") {
      transitIcon = "🚢";
      transitBadgeColor = "#2b6cb0";
      transitText = `Naval (${p.vesselsUsed || 12} ships)`;
    } else if (p.transitType === "military_transit") {
      transitIcon = "🛡️";
      transitBadgeColor = "#553c9a";
      transitText = "Military Transit";
    }

    const officers = getOfficersForState(p.stateId);

    return (
      <div
        key={p.stateId}
        style={{
          background: "var(--color-bg-secondary, rgba(255, 255, 255, 0.05))",
          border: "1px solid var(--color-border, rgba(255, 255, 255, 0.15))",
          borderRadius: "6px",
          padding: "10px 12px",
          marginBottom: "10px",
          position: "relative",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "5px",
            height: "100%",
            backgroundColor: stateColor
          }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg className="coaIcon" viewBox="0 0 200 200" style={{ width: "24px", height: "24px", flexShrink: 0 }}>
              <title>{stateName}</title>
              <use href={`#stateCOA${p.stateId}`} />
            </svg>
            <span style={{ fontWeight: "bold", fontSize: "1.05em" }}>{stateName}</span>
          </div>

          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span
              style={{
                backgroundColor: roleBadgeColor,
                color: "#ffffff",
                fontSize: "0.75em",
                fontWeight: "bold",
                padding: "2px 6px",
                borderRadius: "4px",
                textTransform: "uppercase"
              }}
            >
              {roleText}
            </span>
            <span
              style={{
                backgroundColor: transitBadgeColor,
                color: "#ffffff",
                fontSize: "0.75em",
                padding: "2px 6px",
                borderRadius: "4px"
              }}
            >
              {transitIcon} {transitText}
            </span>
          </div>
        </div>

        {/* Transit Detail */}
        {p.transitDetail && (
          <div style={{ fontSize: "0.82em", opacity: 0.85, marginBottom: "6px", fontStyle: "italic" }}>
            {p.transitDetail}
          </div>
        )}

        {/* Motivation & Pledge */}
        {(p.motivationLabel || p.pledge) && (
          <div
            style={{
              background: "var(--color-bg-tertiary, rgba(0, 0, 0, 0.2))",
              borderRadius: "4px",
              padding: "6px 8px",
              marginBottom: "8px",
              fontSize: "0.85em"
            }}
          >
            {p.motivationLabel && (
              <div style={{ marginBottom: "2px" }}>
                <span style={{ fontWeight: "bold", color: "#1e40af" }}>Motivation: </span>
                <span>{p.motivationLabel}</span>
              </div>
            )}
            {p.pledge && p.pledge.type !== "none" && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <span style={{ fontWeight: "bold", color: "#b45309" }}>Pledge/Reward: </span>
                <span>{p.pledge.description}</span>
                {p.pledge.burgId !== undefined && (
                  <span
                    className="icon-search"
                    title="Zoom to target city"
                    style={{ cursor: "pointer", color: "#1e40af", marginLeft: "4px" }}
                    onClick={() => handleBurgZoom(p.pledge!.burgId!)}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Mobilized Forces */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(75px, 1fr))",
            gap: "6px",
            fontSize: "0.8em",
            textAlign: "center"
          }}
        >
          <div style={{ background: "rgba(0, 0, 0, 0.06)", padding: "4px", borderRadius: "3px" }}>
            <div style={{ opacity: 0.8 }}>Infantry</div>
            <div style={{ fontWeight: "bold" }}>{si(p.forces.infantry)}</div>
          </div>
          {p.forces.cavalry ? (
            <div style={{ background: "rgba(0, 0, 0, 0.06)", padding: "4px", borderRadius: "3px" }}>
              <div style={{ opacity: 0.8 }}>Cavalry</div>
              <div style={{ fontWeight: "bold" }}>{si(p.forces.cavalry)}</div>
            </div>
          ) : null}
          {p.forces.naval ? (
            <div style={{ background: "rgba(0, 0, 0, 0.06)", padding: "4px", borderRadius: "3px" }}>
              <div style={{ opacity: 0.8 }}>Naval Forces</div>
              <div style={{ fontWeight: "bold" }}>{si(p.forces.naval)}</div>
            </div>
          ) : null}
          <div
            style={{
              background: "rgba(0, 0, 0, 0.09)",
              padding: "4px",
              borderRadius: "3px",
              border: "1px solid rgba(0, 0, 0, 0.15)"
            }}
          >
            <div style={{ opacity: 0.8 }}>Total Forces</div>
            <div style={{ fontWeight: "bold", color: "#15803d" }}>{si(p.forces.total)}</div>
          </div>
        </div>

        {/* Participating Officers */}
        {officers.length > 0 && (
          <div
            style={{
              marginTop: "8px",
              paddingTop: "6px",
              borderTop: "1px dashed rgba(0, 0, 0, 0.2)",
              fontSize: "0.85em"
            }}
          >
            <div
              style={{
                fontWeight: "bold",
                color: "var(--color-text, currentColor)",
                marginBottom: "5px",
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <span>🎖️ {t("characters.participatingOfficers") || "Participating Officers"}:</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {officers.map(officer => {
                const service = officer.militaryRecord!.services.find(
                  s =>
                    (s.warId && s.warId === warDetails.id) ||
                    (s.campaignName === warDetails.name && Math.abs(s.year - warDetails.startYear) <= 2)
                );
                const conductLabel = service ? t(`characters.warConduct.${service.conduct}`) : "";
                const title = officer.titles?.[0]?.title || officer.roles?.[0]?.label || "Officer";
                return (
                  <div
                    key={officer.i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      background: "rgba(0, 0, 0, 0.06)",
                      border: "1px solid rgba(0, 0, 0, 0.12)",
                      padding: "3px 8px",
                      borderRadius: "4px",
                      gap: "6px"
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        useCharactersUiState.getState().openCharacterDetails(officer.i);
                        dialogStore.getState().openDialog("characterDetails");
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        margin: 0,
                        cursor: "pointer",
                        color: "#1e3a8a",
                        fontWeight: 600,
                        textAlign: "left",
                        textDecoration: "underline",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px"
                      }}
                      title={t("characters.openCharacterDetails")}
                    >
                      <span>👤 {officer.name}</span>
                      <span style={{ fontSize: "0.88em", color: "#475569", fontWeight: "normal" }}>({title})</span>
                    </button>
                    {conductLabel && (
                      <span
                        style={{
                          fontSize: "0.85em",
                          color: "#1e293b",
                          backgroundColor: "rgba(0, 0, 0, 0.07)",
                          padding: "1px 6px",
                          borderRadius: "3px",
                          fontStyle: "italic",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {conductLabel}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={`⚔️ ${warDetails.name}`}
      onClose={close}
      buttons={[{ label: "Close", onClick: close }]}
      style={{ width: "720px", maxWidth: "95vw" }}
    >
      <div style={{ maxHeight: "75vh", overflowY: "auto", padding: "4px 6px" }}>
        {/* Header summary */}
        <div
          style={{
            background: "var(--color-bg-secondary, rgba(255, 255, 255, 0.05))",
            border: "1px solid var(--color-border, rgba(255, 255, 255, 0.15))",
            borderRadius: "8px",
            padding: "12px 14px",
            marginBottom: "14px"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span
              style={{
                backgroundColor: "#dd6b20",
                color: "#ffffff",
                padding: "3px 8px",
                borderRadius: "4px",
                fontSize: "0.8em",
                fontWeight: "bold",
                textTransform: "uppercase"
              }}
            >
              Casus Belli: {warDetails.casusBelliCategory}
            </span>
            <span style={{ fontSize: "0.85em", opacity: 0.8 }}>Began in Year {warDetails.startYear}</span>
          </div>

          <div style={{ fontSize: "0.95em", fontWeight: 500, marginBottom: "4px" }}>{warDetails.casusBelliAction}</div>
          <div style={{ fontSize: "0.85em", opacity: 0.8, fontStyle: "italic" }}>"{warDetails.casusBelliReason}"</div>
        </div>

        {/* Force Balance Bar */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85em", marginBottom: "4px" }}>
            <span style={{ fontWeight: "bold", color: "#c53030" }}>
              Attackers: {si(totalAttackerTroops)} ({attackerRatio}%)
            </span>
            <span style={{ fontWeight: "bold", color: "#1d4ed8" }}>
              Defenders: {si(totalDefenderTroops)} ({defenderRatio}%)
            </span>
          </div>
          <div
            style={{
              height: "10px",
              width: "100%",
              borderRadius: "5px",
              overflow: "hidden",
              display: "flex",
              backgroundColor: "rgba(0, 0, 0, 0.3)"
            }}
          >
            <div style={{ width: `${attackerRatio}%`, backgroundColor: "#e53e3e" }} />
            <div style={{ width: `${defenderRatio}%`, backgroundColor: "#3182ce" }} />
          </div>
        </div>

        {/* Belligerent Columns */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          {/* Attackers column */}
          <div>
            <div
              style={{
                fontWeight: "bold",
                fontSize: "1.05em",
                color: "#c53030",
                marginBottom: "8px",
                borderBottom: "2px solid #e53e3e",
                paddingBottom: "4px"
              }}
            >
              Attacking Coalition ({attackers.length})
            </div>
            {attackers.map(renderParticipantCard)}
          </div>

          {/* Defenders column */}
          <div>
            <div
              style={{
                fontWeight: "bold",
                fontSize: "1.05em",
                color: "#1d4ed8",
                marginBottom: "8px",
                borderBottom: "2px solid #3182ce",
                paddingBottom: "4px"
              }}
            >
              Defending Coalition ({defenders.length})
            </div>
            {defenders.map(renderParticipantCard)}
          </div>
        </div>

        {/* Dishonored Pacts & Non-Belligerents Section */}
        {(() => {
          const nonBelligerents = getNonBelligerents();
          if (!nonBelligerents.length) return null;
          return (
            <div
              style={{
                marginTop: "16px",
                background: "rgba(229, 62, 62, 0.08)",
                border: "1px solid rgba(229, 62, 62, 0.25)",
                borderRadius: "8px",
                padding: "10px 12px"
              }}
            >
              <div
                style={{
                  fontWeight: "bold",
                  fontSize: "0.95em",
                  color: "#991b1b",
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <span>💔 {t("characters.dishonoredPacts") || "Dishonored Pacts & Non-Belligerents"}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "8px" }}>
                {nonBelligerents.map(nb => {
                  const state = states[nb.stateId];
                  const stateName = state?.name || `State ${nb.stateId}`;
                  const isSevered = nb.action === "severed_defense_pact";
                  const badgeBg = isSevered ? "#9b2c2c" : "#744210";
                  const badgeText = isSevered
                    ? t("characters.severedDefensePact") || "Severed Defense Pact"
                    : t("characters.avoidedWar") || "Avoided War";
                  return (
                    <div
                      key={`${nb.stateId}-${nb.action}-${nb.targetStateId ?? ""}`}
                      style={{
                        background: "rgba(0, 0, 0, 0.07)",
                        border: "1px solid rgba(0, 0, 0, 0.15)",
                        borderRadius: "6px",
                        padding: "8px 10px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              width: "12px",
                              height: "12px",
                              borderRadius: "50%",
                              backgroundColor: state?.color || "#888888"
                            }}
                          />
                          <span style={{ fontWeight: "bold", fontSize: "0.9em" }}>{stateName}</span>
                        </div>
                        <span
                          style={{
                            backgroundColor: badgeBg,
                            color: "#ffffff",
                            fontSize: "0.72em",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontWeight: "bold"
                          }}
                        >
                          {badgeText}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.8em", color: "#334155", fontStyle: "italic" }}>{nb.reason}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </Dialog>
  );
};
