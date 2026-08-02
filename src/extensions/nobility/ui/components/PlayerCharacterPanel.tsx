import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCharactersUiState } from "../../../characters/ui/charactersUiState";
import {
  getCharacterConstructionEmployment,
  getCharacterPendingConstructionApplication
} from "../../../economy/generators/constructionHire";
import { getConstructionJobPosting } from "../../../economy/generators/constructionJobPostings";
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
            <dt>Wealth</dt>
            <dd title="Personal wealth (held money)">{formatPrice(summary.wealth)}</dd>
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
