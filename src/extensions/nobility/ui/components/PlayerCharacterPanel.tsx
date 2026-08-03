import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCharactersUiState } from "../../../characters/ui/charactersUiState";
import { openCharacterMarket } from "../../../economy/controllers/characterMarket";
import {
  getCharacterConstructionEmployment,
  getCharacterPendingConstructionApplication
} from "../../../economy/generators/constructionHire";
import { getConstructionJobPosting } from "../../../economy/generators/constructionJobPostings";
import {
  cycleDomainPolicyForLord,
  DOMAIN_REMIT_ACTION_CAP,
  DOMAIN_SPEND_ACTION_CAP,
  drawHouseholdPurseToPersonal,
  getFiscalAuthorityView,
  HOUSEHOLD_DRAW_ACTION_CAP,
  PUBLIC_SEIZE_ACTION_CAP,
  remitDomainToStateTreasury,
  seizePublicTreasuryToPersonal,
  spendDomainTreasury,
  toggleWarFootingForRuler
} from "../../../economy/generators/fiscalAuthority";
import { tip } from "../../../hostServices";
import { Dialog, isDialogOpen, openDialog } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";
import { buildPlayerCharacterSummary, selectRandomPlayerCharacter } from "../../controllers/playerCharacter";
import { isSvgRenderMode, togglePlayerMoveMode } from "../../controllers/playerCharacterTravel";
import { getApi, getWorldContext } from "../../nobilityContext";
import { usePlayerCharacterState } from "../../store/playerCharacterState";
import "./playerCharacterPanel.css";

const ECONOMY_EXTENSION_ID = "economy";

/**
 * Always-visible top-right HUD for the nobility focus character.
 * Mounted via registerDialog so it only exists while the extension is enabled.
 * Uses the shared Dialog shell for drag, resize, and minimize like other UI panels.
 */
export const PlayerCharacterPanel: React.FC = () => {
  const { i18n } = useTranslation();
  const playerCharacterId = usePlayerCharacterState(state => state.playerCharacterId);
  // Intentionally subscribed so in-place mutations (aging, succession) re-render the HUD.
  const refreshToken = usePlayerCharacterState(state => state.refreshToken);
  const isMoveMode = usePlayerCharacterState(state => state.isMoveMode);
  const pendingTravel = usePlayerCharacterState(state => state.pendingTravel);
  const openCharacterDetails = useCharactersUiState(state => state.openCharacterDetails);

  // refreshToken is an intentional extra dep: characters mutate in place on ticks.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  const summary = useMemo(() => {
    if (playerCharacterId === null) return null;
    const { pack } = getWorldContext();
    const character = pack.characters?.find(c => c.i === playerCharacterId);
    if (!character) return null;
    return buildPlayerCharacterSummary(character, pack);
  }, [playerCharacterId, refreshToken, i18n.language]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken forces recompute after fiscal draws
  const fiscal = useMemo(() => {
    if (!summary) return null;
    const { pack } = getWorldContext();
    const state = pack.states?.[summary.stateId];
    if (!state?.i) return null;
    const character = pack.characters?.find(c => c.i === summary.id);
    return getFiscalAuthorityView(state, character);
  }, [summary, refreshToken]);

  // Render mode is sticky session state; read live so a mid-session switch updates the toolbar.
  const showMoveAction = isSvgRenderMode();
  const canMove = Boolean(summary?.location) && !pendingTravel;

  const handleOpenDetails = () => {
    if (playerCharacterId === null) return;
    openCharacterDetails(playerCharacterId);
    openDialog("characterDetails");
  };

  const handleReroll = () => {
    const newId = selectRandomPlayerCharacter({ excludeCurrent: true });
    // Keep Character Details in sync when it is already open, so the user sees the new pick.
    if (newId !== null && isDialogOpen("characterDetails")) {
      openCharacterDetails(newId);
    }
  };

  const handleZoomToLocation = () => {
    if (!summary?.location) return;
    getApi().zoomTo(summary.location.x, summary.location.y, 20, 2000);
  };

  const handleToggleMove = () => {
    togglePlayerMoveMode();
  };

  // refreshToken also refreshes job board / hire state read from economy slices.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  const workStatus = useMemo(() => {
    if (playerCharacterId === null) return null;
    const seat = getCharacterConstructionEmployment(playerCharacterId);
    const pendingApp = getCharacterPendingConstructionApplication(playerCharacterId);
    const burgId = summary?.location?.burgId;
    const posting = burgId != null ? getConstructionJobPosting(burgId) : null;
    return { seat, pendingApp, posting, burgId: burgId ?? null };
  }, [playerCharacterId, refreshToken, summary?.location?.burgId]);

  const handleApplyConstruction = () => {
    if (playerCharacterId === null || workStatus?.burgId == null) return;
    const result = getApi().dispatchExtensionCommand({
      extensionId: ECONOMY_EXTENSION_ID,
      name: "jobs.applyConstruction",
      payload: { characterId: playerCharacterId, burgId: workStatus.burgId }
    });
    const outcome = result?.result as { ok?: boolean; message?: string } | undefined;
    if (outcome?.message) tip(outcome.message, false, outcome.ok ? "success" : "error");
    else if (!result) tip("Enable the Economy extension to apply for work.", false, "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleResignConstruction = () => {
    if (playerCharacterId === null) return;
    const result = getApi().dispatchExtensionCommand({
      extensionId: ECONOMY_EXTENSION_ID,
      name: "jobs.resignConstruction",
      payload: { characterId: playerCharacterId }
    });
    const outcome = result?.result as { ok?: boolean; message?: string } | undefined;
    if (outcome?.message) tip(outcome.message, false, outcome.ok ? "success" : "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const pendingLabel =
    pendingTravel && pendingTravel.remainingDays > 0 ? `Travelling · ${pendingTravel.remainingDays}d left` : null;

  const workLabel = workStatus?.seat
    ? `${workStatus.seat.role} @ burg ${workStatus.seat.burgId}`
    : workStatus?.pendingApp
      ? `Applying (${workStatus.pendingApp.role}, ${Math.ceil(workStatus.pendingApp.daysRemaining)}d)`
      : workStatus?.posting && workStatus.posting.openSeats > 0
        ? `${workStatus.posting.openSeats} construction job(s) here`
        : "No construction opening here";

  const canApplyConstruction =
    Boolean(summary?.location) &&
    !pendingTravel &&
    !workStatus?.seat &&
    !workStatus?.pendingApp &&
    (workStatus?.posting?.openSeats ?? 0) > 0;

  const canResignConstruction = Boolean(workStatus?.seat);
  const canCancelApplication = Boolean(workStatus?.pendingApp);
  const canTrade = Boolean(summary?.location) && !pendingTravel && getApi().isExtensionEnabled(ECONOMY_EXTENSION_ID);

  const handleCancelApplication = () => {
    if (playerCharacterId === null) return;
    const result = getApi().dispatchExtensionCommand({
      extensionId: ECONOMY_EXTENSION_ID,
      name: "jobs.cancelConstructionApplication",
      payload: { characterId: playerCharacterId }
    });
    const outcome = result?.result as { ok?: boolean; message?: string } | undefined;
    if (outcome?.message) tip(outcome.message, false, outcome.ok ? "success" : "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleTrade = () => {
    if (playerCharacterId === null) return;
    openCharacterMarket(playerCharacterId);
  };

  const handleDrawHousehold = () => {
    if (playerCharacterId === null || !summary) return;
    const { pack } = getWorldContext();
    const state = pack.states?.[summary.stateId];
    if (!state?.i) {
      tip("No state ledger for this character.", false, "error");
      return;
    }
    const result = drawHouseholdPurseToPersonal(state, playerCharacterId, HOUSEHOLD_DRAW_ACTION_CAP);
    if (result.ok) tip(`Drew ${formatPrice(result.paid)} from the household purse.`, false, "success");
    else tip(result.error || "Could not draw household funds.", false, "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleSeizePublic = () => {
    if (playerCharacterId === null || !summary) return;
    const { pack } = getWorldContext();
    const state = pack.states?.[summary.stateId];
    if (!state?.i) {
      tip("No state ledger for this character.", false, "error");
      return;
    }
    const result = seizePublicTreasuryToPersonal(state, playerCharacterId, PUBLIC_SEIZE_ACTION_CAP);
    if (result.ok) tip(`Seized ${formatPrice(result.paid)} from the public treasury.`, false, "success");
    else tip(result.error || "Could not seize public funds.", false, "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleSpendDomain = () => {
    if (playerCharacterId === null) return;
    const result = spendDomainTreasury(playerCharacterId, DOMAIN_SPEND_ACTION_CAP);
    if (result.ok) tip(`Spent ${formatPrice(result.paid)} from the domain treasury.`, false, "success");
    else tip(result.error || "Could not spend domain funds.", false, "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleRemitDomain = () => {
    if (playerCharacterId === null) return;
    const result = remitDomainToStateTreasury(playerCharacterId, DOMAIN_REMIT_ACTION_CAP);
    if (result.ok) tip(`Remitted ${formatPrice(result.paid)} from the domain to the state treasury.`, false, "success");
    else tip(result.error || "Could not remit domain funds.", false, "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleToggleWarFooting = () => {
    if (playerCharacterId === null || !summary) return;
    const { pack } = getWorldContext();
    const state = pack.states?.[summary.stateId];
    if (!state?.i) {
      tip("No state ledger for this character.", false, "error");
      return;
    }
    const result = toggleWarFootingForRuler(state, playerCharacterId);
    if (result.ok) {
      tip(
        result.warFooting
          ? "War footing enabled — next tax cycle favors marshalcy (AI will not override while locked)."
          : "War footing disabled.",
        false,
        "success"
      );
    } else {
      tip(result.error || "Could not change war footing.", false, "error");
    }
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleCycleDomainPolicy = () => {
    if (playerCharacterId === null) return;
    const result = cycleDomainPolicyForLord(playerCharacterId);
    if (result.ok && result.policy) {
      tip(`Domain policy set to ${result.policy}.`, false, "success");
    } else {
      tip(result.error || "Could not change domain policy.", false, "error");
    }
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  return (
    <Dialog isOpen title="Player Character" showCloseAllDialogsButton={false} className="player-character-panel">
      {!summary ? (
        <div className="pcp-empty">No ruling character available yet. Generate or enable Characters & Nobility.</div>
      ) : (
        <div className="pcp-content">
          <div className="pcp-name-row">
            <h2 className="pcp-name">{summary.name}</h2>
            <button
              type="button"
              className="icon-cw"
              data-tip="Select a different random character"
              aria-label="Select a different random character"
              onClick={handleReroll}
            />
          </div>
          <dl className="pcp-fields">
            <dt>Personal</dt>
            <dd title="L0 personal wealth (Character.wealth) — pocket money, not the state treasury">
              {formatPrice(summary.wealth)}
            </dd>
            <dt>Public treasury</dt>
            <dd
              title={
                summary.isLandedRuler
                  ? "L2 state.treasury — institutional cash for the realm. A thin personal purse does not mean a poor state."
                  : "L2 state.treasury of this character's political state (read-only here)"
              }
            >
              {formatPrice(summary.publicTreasury)}
            </dd>
            <dt>Household purse</dt>
            <dd
              title={
                summary.isLandedRuler
                  ? "L1 crown household purse — court/institutional household cash. Personal stipend is paid from here, not the full purse."
                  : "L1 crown household purse of this character's state (read-only here)"
              }
            >
              {formatPrice(summary.householdPurse)}
            </dd>
            {summary.domainTreasury !== null ? (
              <>
                <dt>Domain treasury</dt>
                <dd title="L3b burg.treasury at the lord's seat — domain operating funds (stipend source), not personal cash">
                  {formatPrice(summary.domainTreasury)}
                </dd>
              </>
            ) : null}
            {fiscal ? (
              <>
                <dt>Spendable</dt>
                <dd
                  title={[
                    `Personal ${formatPrice(fiscal.spendableBreakdown.personal)}`,
                    `Household ${formatPrice(fiscal.spendableBreakdown.household)}`,
                    `Public ${formatPrice(fiscal.spendableBreakdown.public)}`,
                    `Domain ${formatPrice(fiscal.spendableBreakdown.domain)}`,
                    ...fiscal.notes
                  ].join(" · ")}
                >
                  {formatPrice(fiscal.spendableAsRuler)}
                  <span className="dim" style={{ marginLeft: "0.35em", fontSize: "0.9em" }}>
                    ({fiscal.form})
                  </span>
                </dd>
              </>
            ) : null}
            <dt>Location</dt>
            <dd className="pcp-location" title={summary.location?.label ?? "Unknown"}>
              {summary.location ? (
                <>
                  <span
                    data-tip="Click to zoom into view"
                    className="icon-dot-circled pointer"
                    onClick={handleZoomToLocation}
                  />
                  <span className="pcp-location-label">{summary.location.label}</span>
                </>
              ) : (
                "Unknown"
              )}
            </dd>
            {pendingLabel ? (
              <>
                <dt>Travel</dt>
                <dd title={pendingLabel}>{pendingLabel}</dd>
              </>
            ) : null}
            <dt>Title</dt>
            <dd title={summary.title}>{summary.title}</dd>
            <dt>State</dt>
            <dd title={summary.stateName}>{summary.stateName}</dd>
            <dt>Organization</dt>
            <dd title={summary.organization}>{summary.organization}</dd>
            <dt>Work</dt>
            <dd title={workLabel}>{workLabel}</dd>
          </dl>
        </div>
      )}

      {/* Information / inspection — not world actions. */}
      <div className="pcp-actions" role="toolbar" aria-label="Player character information">
        <button
          type="button"
          className="pcp-action"
          data-tip="Open character details"
          disabled={!summary}
          onClick={handleOpenDetails}
        >
          Character Details
        </button>
      </div>

      {/* Multi-ledger PR-4: first form-gated spend hooks */}
      {summary && fiscal && getApi().isExtensionEnabled(ECONOMY_EXTENSION_ID) ? (
        <div className="pcp-actions pcp-actions-fiscal" role="toolbar" aria-label="Fiscal authority actions">
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canDrawHouseholdToPersonal
                ? `Draw up to ${HOUSEHOLD_DRAW_ACTION_CAP} SP from the crown household purse into personal wealth`
                : fiscal.notes.join(" ")
            }
            disabled={!fiscal.canDrawHouseholdToPersonal || fiscal.householdPurse <= 0 || !summary.isLandedRuler}
            onClick={handleDrawHousehold}
          >
            Draw household
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canSpendPublicDirectly
                ? `Seize up to ${PUBLIC_SEIZE_ACTION_CAP} SP from the public treasury (Anarchy war-chest)`
                : "This polity does not allow free public-treasury spending from the ruler HUD"
            }
            disabled={!fiscal.canSpendPublicDirectly || fiscal.publicTreasury <= 0 || !summary.isLandedRuler}
            onClick={handleSeizePublic}
          >
            Seize public
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canSpendDomain
                ? `Spend up to ${DOMAIN_SPEND_ACTION_CAP} SP from the domain (burg) treasury — consumed, not pocketed`
                : "No provincial domain seat with treasury"
            }
            disabled={!fiscal.canSpendDomain}
            onClick={handleSpendDomain}
          >
            Spend domain
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canRemitDomainToState
                ? `Remit up to ${DOMAIN_REMIT_ACTION_CAP} SP from the domain seat to the state's public treasury (L3b→L2)`
                : "No provincial domain seat with treasury"
            }
            disabled={!fiscal.canRemitDomainToState}
            onClick={handleRemitDomain}
          >
            Remit domain
          </button>
          <button
            type="button"
            className={`pcp-action${fiscal.warFooting ? " pcp-action-active" : ""}`}
            data-tip={
              fiscal.canToggleWarFooting
                ? fiscal.warFooting
                  ? "Disable war footing (restore peacetime department shares next tax cycle)"
                  : "Enable war footing — reweights budgets toward marshalcy; overfund can boost troop targets"
                : "Only the living ruler may set war footing"
            }
            disabled={!fiscal.canToggleWarFooting}
            aria-pressed={fiscal.warFooting}
            onClick={handleToggleWarFooting}
          >
            {fiscal.warFooting ? "War footing ON" : "War footing"}
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canSetDomainPolicy
                ? `Cycle domain policy (now ${fiscal.domainFiscalPolicy ?? "balanced"}): balanced → extract → fortify`
                : "No provincial domain seat"
            }
            disabled={!fiscal.canSetDomainPolicy}
            onClick={handleCycleDomainPolicy}
          >
            Domain: {fiscal.domainFiscalPolicy ?? "—"}
          </button>
        </div>
      ) : null}

      {/* World actions (travel, future diplomacy / military). SVG map mode only for Move. */}
      {showMoveAction ? (
        <div className="pcp-actions pcp-actions-world" role="toolbar" aria-label="Player character actions">
          <button
            type="button"
            className={`pcp-action${isMoveMode ? " pcp-action-active" : ""}`}
            data-tip={
              isMoveMode
                ? "Cancel destination selection"
                : pendingTravel
                  ? "Travel already in progress"
                  : "Select a destination burg on the map"
            }
            disabled={!canMove && !isMoveMode}
            aria-pressed={isMoveMode}
            onClick={handleToggleMove}
          >
            {isMoveMode ? "Cancel Move" : "Move"}
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Buy or sell goods available on this burg's market shelves"
            disabled={!canTrade}
            onClick={handleTrade}
          >
            Trade
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Apply for a construction job in this burg (Economy). Hire resolves after 14 days."
            disabled={!canApplyConstruction}
            onClick={handleApplyConstruction}
          >
            Apply Construction
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Withdraw a pending construction application"
            disabled={!canCancelApplication}
            onClick={handleCancelApplication}
          >
            Cancel Application
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Leave construction work at this burg"
            disabled={!canResignConstruction}
            onClick={handleResignConstruction}
          >
            Resign Construction
          </button>
        </div>
      ) : (
        <div className="pcp-actions pcp-actions-world" role="toolbar" aria-label="Player character work">
          <button
            type="button"
            className="pcp-action"
            data-tip="Buy or sell goods available on this burg's market shelves"
            disabled={!canTrade}
            onClick={handleTrade}
          >
            Trade
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Apply for a construction job in this burg (Economy). Hire resolves after 14 days."
            disabled={!canApplyConstruction}
            onClick={handleApplyConstruction}
          >
            Apply Construction
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Withdraw a pending construction application"
            disabled={!canCancelApplication}
            onClick={handleCancelApplication}
          >
            Cancel Application
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Leave construction work at this burg"
            disabled={!canResignConstruction}
            onClick={handleResignConstruction}
          >
            Resign Construction
          </button>
        </div>
      )}
    </Dialog>
  );
};
