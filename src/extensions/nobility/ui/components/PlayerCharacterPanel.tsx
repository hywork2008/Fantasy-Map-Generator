import type React from "react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PREP_TEMPLATES, type PrepTemplateId } from "../../../characters/adventurerTemplates";
import { usePlayerCharacterState } from "../../../characters/store/playerCharacterState";
import { useCharactersUiState } from "../../../characters/ui/charactersUiState";
import { openCharacterMarket } from "../../../economy/controllers/characterMarket";
import { getCullCooldowns, getEscortCooldowns } from "../../../economy/economyContext";
import { buildCharacterReadiness } from "../../../economy/generators/characterReadiness";
import {
  getCharacterConstructionEmployment,
  getCharacterPendingConstructionApplication
} from "../../../economy/generators/constructionHire";
import { getConstructionJobPosting } from "../../../economy/generators/constructionJobPostings";
import {
  getCharacterEscortContract,
  getCharacterPendingEscortApplication
} from "../../../economy/generators/escortHire";
import {
  ESCORT_PLAYER_HIRE_LAG_DAYS,
  getEscortJobPostingsForBurg,
  getLiveEscortOpenSeats
} from "../../../economy/generators/escortJobPostings";
import {
  adjustDomainLevyForLord,
  cycleDomainPolicyForLord,
  cycleDomainWorksTargetForLord,
  DOMAIN_REMIT_ACTION_CAP,
  DOMAIN_SPEND_ACTION_CAP,
  drawHouseholdPurseToPersonal,
  fundDomainWorksForLord,
  getFiscalAuthorityView,
  HOUSEHOLD_DRAW_ACTION_CAP,
  issueForeignDebtForRuler,
  issuePublicDebtForRuler,
  negotiateDebtRateForRuler,
  PUBLIC_SEIZE_ACTION_CAP,
  remitDomainToStateTreasury,
  repayPublicDebtForRuler,
  seizePublicTreasuryToPersonal,
  spendDomainTreasury,
  toggleWarFootingForRuler
} from "../../../economy/generators/fiscalAuthority";
import { applyPrepTemplateSkills } from "../../../economy/generators/prepTemplateSkills";
import { targetDifficulty } from "../../../economy/generators/threatCullCombat";
import {
  getCharacterCullContract,
  getCharacterPendingCullApplication
} from "../../../economy/generators/threatCullHire";
import {
  CULL_PLAYER_HIRE_LAG_DAYS,
  getCullJobPostingsForBurg,
  getLiveOpenSeats,
  getSimulationOrdinalDay
} from "../../../economy/generators/threatCullJobPostings";
import { tip } from "../../../hostServices";
import { Dialog, isDialogOpen, openDialog } from "../../../hostUi";
import { formatPrice } from "../../../hostUtils";
import { buildPlayerCharacterSummary, selectRandomPlayerCharacter } from "../../controllers/playerCharacter";
import { isSvgRenderMode, togglePlayerMoveMode } from "../../controllers/playerCharacterTravel";
import { getApi, getWorldContext } from "../../nobilityContext";
import "./playerCharacterPanel.css";

const ECONOMY_EXTENSION_ID = "economy";
const CHARACTERS_EXTENSION_ID = "characters";

const PEST_HUNT_TIP = "Hinterland pests (local pressure; may not show on the danger map unless Rural threats is on).";

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
  const requestDetailsTab = useCharactersUiState(state => state.requestDetailsTab);

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

  // Mission lag/countdown advances in economy.tick — re-read work status without a click.
  useEffect(() => {
    const onSimUpdated = () => {
      usePlayerCharacterState.getState().bumpRefreshToken();
    };
    const onLoadoutOrInventory = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      if (!detail || typeof detail !== "object") return;
      if ((detail as { characterId?: unknown }).characterId === playerCharacterId) {
        usePlayerCharacterState.getState().bumpRefreshToken();
      }
    };
    document.addEventListener("fmg:simulation-updated", onSimUpdated);
    document.addEventListener("fmg:character-loadout-changed", onLoadoutOrInventory);
    document.addEventListener("fmg:character-inventory-changed", onLoadoutOrInventory);
    return () => {
      document.removeEventListener("fmg:simulation-updated", onSimUpdated);
      document.removeEventListener("fmg:character-loadout-changed", onLoadoutOrInventory);
      document.removeEventListener("fmg:character-inventory-changed", onLoadoutOrInventory);
    };
  }, [playerCharacterId]);

  const handleOpenDetails = () => {
    if (playerCharacterId === null) return;
    openCharacterDetails(playerCharacterId);
    openDialog("characterDetails");
  };

  const handlePrepare = () => {
    if (playerCharacterId === null) return;
    requestDetailsTab("loadout");
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
    const cullContract = getCharacterCullContract(playerCharacterId);
    const cullPendingApp = getCharacterPendingCullApplication(playerCharacterId);
    const escortContract = getCharacterEscortContract(playerCharacterId);
    const escortPendingApp = getCharacterPendingEscortApplication(playerCharacterId);
    const burgId = summary?.location?.burgId;
    const posting = burgId != null ? getConstructionJobPosting(burgId) : null;
    const cullPosts = burgId != null ? getCullJobPostingsForBurg(burgId) : [];
    const openCullPosts = cullPosts.filter(p => getLiveOpenSeats(p.i) > 0);
    const escortPosts = burgId != null ? getEscortJobPostingsForBurg(burgId) : [];
    const openEscortPosts = escortPosts.filter(p => getLiveEscortOpenSeats(p.i) > 0);
    const cullCooldownUntil = getCullCooldowns()[String(playerCharacterId)];
    const escortCooldownUntil = getEscortCooldowns()[String(playerCharacterId)];
    const ordinal = getSimulationOrdinalDay();
    const onCullInjuryCooldown = typeof cullCooldownUntil === "number" && ordinal < cullCooldownUntil;
    const onEscortInjuryCooldown = typeof escortCooldownUntil === "number" && ordinal < escortCooldownUntil;
    const onInjuryCooldown = onCullInjuryCooldown || onEscortInjuryCooldown;
    const cooldownUntil = onCullInjuryCooldown
      ? cullCooldownUntil
      : onEscortInjuryCooldown
        ? escortCooldownUntil
        : undefined;
    return {
      seat,
      pendingApp,
      posting,
      burgId: burgId ?? null,
      cullContract,
      cullPendingApp,
      openCullPosts,
      escortContract,
      escortPendingApp,
      openEscortPosts,
      onInjuryCooldown,
      cooldownDaysLeft: onInjuryCooldown && cooldownUntil != null ? Math.max(0, Math.ceil(cooldownUntil - ordinal)) : 0
    };
  }, [playerCharacterId, refreshToken, summary?.location?.burgId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken / loadout events recompute readiness
  const readiness = useMemo(() => {
    if (playerCharacterId === null) return null;
    const { pack } = getWorldContext();
    const character = pack.characters?.find(c => c.i === playerCharacterId);
    if (!character) return null;
    const compareTarget = workStatus?.openCullPosts?.[0]?.target ?? workStatus?.cullContract?.target ?? null;
    return buildCharacterReadiness(character, { compareTarget });
  }, [playerCharacterId, refreshToken, workStatus?.openCullPosts, workStatus?.cullContract?.target]);

  const huntUndergearedAdvisory = useMemo(() => {
    if (!readiness || !workStatus?.openCullPosts?.[0]) return null;
    const target = workStatus.openCullPosts[0].target;
    const difficulty = targetDifficulty(target);
    if (readiness.combatScoreEstimate >= difficulty - 15) return null;
    return `Undergunned for ${target.label} (est. ${Math.round(readiness.combatScoreEstimate)} vs difficulty ${Math.round(difficulty)}). Day laborers may still apply.`;
  }, [readiness, workStatus?.openCullPosts]);

  const hasConstructionCommitment = Boolean(workStatus?.seat || workStatus?.pendingApp);
  const hasCullCommitment = Boolean(workStatus?.cullContract || workStatus?.cullPendingApp);
  const hasEscortCommitment = Boolean(workStatus?.escortContract || workStatus?.escortPendingApp);
  // Panel-only: on active hunt/escort, block Move so the player does not leave mid-mission by accident.
  const canMove =
    Boolean(summary?.location) && !pendingTravel && !workStatus?.cullContract && !workStatus?.escortContract;

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

  const handleApplyCull = () => {
    if (playerCharacterId === null || !workStatus?.openCullPosts.length) return;
    const postingId = workStatus.openCullPosts[0].i;
    const result = getApi().dispatchExtensionCommand({
      extensionId: ECONOMY_EXTENSION_ID,
      name: "jobs.applyCull",
      payload: { characterId: playerCharacterId, postingId }
    });
    const outcome = result?.result as { ok?: boolean; message?: string } | undefined;
    if (outcome?.message) tip(outcome.message, false, outcome.ok ? "success" : "error");
    else if (!result) tip("Enable the Economy extension to apply for hunt work.", false, "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleCancelCullApplication = () => {
    if (playerCharacterId === null) return;
    const result = getApi().dispatchExtensionCommand({
      extensionId: ECONOMY_EXTENSION_ID,
      name: "jobs.cancelCullApplication",
      payload: { characterId: playerCharacterId }
    });
    const outcome = result?.result as { ok?: boolean; message?: string } | undefined;
    if (outcome?.message) tip(outcome.message, false, outcome.ok ? "success" : "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleResignCull = () => {
    if (playerCharacterId === null) return;
    const result = getApi().dispatchExtensionCommand({
      extensionId: ECONOMY_EXTENSION_ID,
      name: "jobs.resignCull",
      payload: { characterId: playerCharacterId }
    });
    const outcome = result?.result as { ok?: boolean; message?: string } | undefined;
    if (outcome?.message) tip(outcome.message, false, outcome.ok ? "success" : "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleApplyEscort = () => {
    if (playerCharacterId === null || !workStatus?.openEscortPosts.length) return;
    const postingId = workStatus.openEscortPosts[0].i;
    const result = getApi().dispatchExtensionCommand({
      extensionId: ECONOMY_EXTENSION_ID,
      name: "jobs.applyEscort",
      payload: { characterId: playerCharacterId, postingId }
    });
    const outcome = result?.result as { ok?: boolean; message?: string } | undefined;
    if (outcome?.message) tip(outcome.message, false, outcome.ok ? "success" : "error");
    else if (!result) tip("Enable the Economy extension to apply for escort work.", false, "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleCancelEscortApplication = () => {
    if (playerCharacterId === null) return;
    const result = getApi().dispatchExtensionCommand({
      extensionId: ECONOMY_EXTENSION_ID,
      name: "jobs.cancelEscortApplication",
      payload: { characterId: playerCharacterId }
    });
    const outcome = result?.result as { ok?: boolean; message?: string } | undefined;
    if (outcome?.message) tip(outcome.message, false, outcome.ok ? "success" : "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleResignEscort = () => {
    if (playerCharacterId === null) return;
    const result = getApi().dispatchExtensionCommand({
      extensionId: ECONOMY_EXTENSION_ID,
      name: "jobs.resignEscort",
      payload: { characterId: playerCharacterId }
    });
    const outcome = result?.result as { ok?: boolean; message?: string } | undefined;
    if (outcome?.message) tip(outcome.message, false, outcome.ok ? "success" : "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const pendingLabel =
    pendingTravel && pendingTravel.remainingDays > 0 ? `Travelling · ${pendingTravel.remainingDays}d left` : null;

  const workLabel = (() => {
    if (workStatus?.escortContract) {
      const c = workStatus.escortContract;
      const days = Math.ceil(c.missionDaysRemaining);
      return `Escort: ${c.label} · ${days}d left`;
    }
    if (workStatus?.escortPendingApp) {
      return `Applying escort (${Math.ceil(workStatus.escortPendingApp.daysRemaining)}d)`;
    }
    if (workStatus?.cullContract) {
      const c = workStatus.cullContract;
      const days = Math.ceil(c.missionDaysRemaining);
      return `Hunt: ${c.target.label} · ${days}d left`;
    }
    if (workStatus?.cullPendingApp) {
      return `Applying hunt (${Math.ceil(workStatus.cullPendingApp.daysRemaining)}d)`;
    }
    if (workStatus?.onInjuryCooldown) {
      return `Recovering from injury (${workStatus.cooldownDaysLeft}d)`;
    }
    if (workStatus?.seat) {
      return `${workStatus.seat.role} @ burg ${workStatus.seat.burgId}`;
    }
    if (workStatus?.pendingApp) {
      return `Applying (${workStatus.pendingApp.role}, ${Math.ceil(workStatus.pendingApp.daysRemaining)}d)`;
    }
    const parts: string[] = [];
    if (workStatus?.posting && workStatus.posting.openSeats > 0) {
      parts.push(`${workStatus.posting.openSeats} construction`);
    }
    if (workStatus?.openCullPosts?.length) {
      parts.push(`${workStatus.openCullPosts.length} hunt`);
    }
    if (workStatus?.openEscortPosts?.length) {
      parts.push(`${workStatus.openEscortPosts.length} escort`);
    }
    if (parts.length) return `${parts.join(" · ")} job(s) here`;
    return "No job openings here";
  })();

  const workTip = (() => {
    if (workStatus?.escortContract) {
      const c = workStatus.escortContract;
      return `On escort: ${c.label} (fee ${c.fee}). Arrive at destination on success.`;
    }
    if (workStatus?.cullContract) {
      const c = workStatus.cullContract;
      const pestNote = c.target.kind === "pest" || c.target.kind === "biomePredator" ? ` ${PEST_HUNT_TIP}` : "";
      return `On mission: ${c.target.label} (bounty ${c.bounty}).${pestNote}`;
    }
    if (workStatus?.openEscortPosts?.length) {
      const labels = workStatus.openEscortPosts
        .slice(0, 3)
        .map(p => `${p.label} · fee ${p.fee} (${p.marketRate})`)
        .join("; ");
      return labels;
    }
    if (workStatus?.openCullPosts?.length) {
      const labels = workStatus.openCullPosts
        .slice(0, 3)
        .map(p => {
          const kind =
            p.target.kind === "pest" || p.target.kind === "biomePredator"
              ? "pest"
              : p.macroCellId != null
                ? "royal hunt"
                : "cull";
          return `${p.target.label} (${kind}, ${p.bounty})`;
        })
        .join("; ");
      const hasPest = workStatus.openCullPosts.some(p => p.target.kind === "pest" || p.target.kind === "biomePredator");
      return `${labels}${hasPest ? ` — ${PEST_HUNT_TIP}` : ""}`;
    }
    return workLabel;
  })();

  const canApplyConstruction =
    Boolean(summary?.location) &&
    !pendingTravel &&
    !hasConstructionCommitment &&
    !hasCullCommitment &&
    !hasEscortCommitment &&
    !workStatus?.onInjuryCooldown &&
    (workStatus?.posting?.openSeats ?? 0) > 0;

  const canApplyCull =
    Boolean(summary?.location) &&
    !pendingTravel &&
    !hasConstructionCommitment &&
    !hasCullCommitment &&
    !hasEscortCommitment &&
    !workStatus?.onInjuryCooldown &&
    (workStatus?.openCullPosts?.length ?? 0) > 0;

  const canApplyEscort =
    Boolean(summary?.location) &&
    !pendingTravel &&
    !hasConstructionCommitment &&
    !hasCullCommitment &&
    !hasEscortCommitment &&
    !workStatus?.onInjuryCooldown &&
    (workStatus?.openEscortPosts?.length ?? 0) > 0;

  const canResignConstruction = Boolean(workStatus?.seat);
  const canCancelApplication = Boolean(workStatus?.pendingApp);
  const canCancelCullApplication = Boolean(workStatus?.cullPendingApp);
  const canResignCull = Boolean(workStatus?.cullContract);
  const canCancelEscortApplication = Boolean(workStatus?.escortPendingApp);
  const canResignEscort = Boolean(workStatus?.escortContract);
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

  const handleApplyPrepTemplate = (templateId: PrepTemplateId) => {
    if (playerCharacterId === null) return;
    const { pack } = getWorldContext();
    const character = pack.characters?.find(c => c.i === playerCharacterId);
    if (!character || character.dead) {
      tip("Cannot kit this character.", false, "error");
      return;
    }

    try {
      const result = getApi().dispatchExtensionCommand({
        extensionId: CHARACTERS_EXTENSION_ID,
        name: "applyPrepTemplate",
        payload: { characterId: playerCharacterId, templateId }
      });
      if (!result) {
        tip("Enable the Characters extension to apply prep kits.", false, "error");
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      tip(message, false, "error");
      return;
    }

    if (getApi().isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
      applyPrepTemplateSkills(character, templateId);
    }

    const def = PREP_TEMPLATES.find(t => t.id === templateId);
    tip(`Applied prep kit: ${def?.label ?? templateId}.`, false, "success");
    usePlayerCharacterState.getState().bumpRefreshToken();
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

  const handleDomainLevy = (direction: 1 | -1) => {
    if (playerCharacterId === null) return;
    const result = adjustDomainLevyForLord(playerCharacterId, direction);
    if (result.ok && result.levyRate != null) {
      tip(`Domain levy set to ×${result.levyRate}.`, false, "success");
    } else {
      tip(result.error || "Could not change domain levy.", false, "error");
    }
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleIssueDebt = () => {
    if (playerCharacterId === null || !summary) return;
    const { pack } = getWorldContext();
    const state = pack.states?.[summary.stateId];
    if (!state?.i) {
      tip("No state ledger for this character.", false, "error");
      return;
    }
    const result = issuePublicDebtForRuler(state, playerCharacterId);
    if (result.ok) tip(`Issued ${formatPrice(result.paid)} public debt into the treasury.`, false, "success");
    else tip(result.error || "Could not issue debt.", false, "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleRepayDebt = () => {
    if (playerCharacterId === null || !summary) return;
    const { pack } = getWorldContext();
    const state = pack.states?.[summary.stateId];
    if (!state?.i) {
      tip("No state ledger for this character.", false, "error");
      return;
    }
    const result = repayPublicDebtForRuler(state, playerCharacterId);
    if (result.ok) tip(`Repaid ${formatPrice(result.paid)} public debt.`, false, "success");
    else tip(result.error || "Could not repay debt.", false, "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleNegotiateRate = (direction: 1 | -1) => {
    if (playerCharacterId === null || !summary) return;
    const { pack } = getWorldContext();
    const state = pack.states?.[summary.stateId];
    if (!state?.i) {
      tip("No state ledger for this character.", false, "error");
      return;
    }
    const result = negotiateDebtRateForRuler(state, playerCharacterId, direction);
    if (result.ok && result.rate != null) {
      tip(
        direction < 0
          ? `Negotiated cheaper credit (${(result.rate * 100).toFixed(2)}%/cycle).`
          : `Accepted harsher terms (${(result.rate * 100).toFixed(2)}%/cycle).`,
        false,
        "success"
      );
    } else {
      tip(result.error || "Could not renegotiate.", false, "error");
    }
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleOpenDebtNegotiation = () => {
    openDialog("debtNegotiation");
  };

  const handleOpenCouncilLog = () => {
    openDialog("councilSession");
  };

  const handleOpenDomainPoll = () => {
    openDialog("domainPollDetail");
  };

  const handleIssueForeignDebt = () => {
    if (playerCharacterId === null || !summary) return;
    const { pack } = getWorldContext();
    const state = pack.states?.[summary.stateId];
    if (!state?.i) {
      tip("No state ledger for this character.", false, "error");
      return;
    }
    const result = issueForeignDebtForRuler(state, playerCharacterId);
    if (result.ok) {
      tip(
        `Borrowed ${formatPrice(result.paid)} from ${result.creditorName || "a foreign creditor"}.`,
        false,
        "success"
      );
    } else {
      tip(result.error || "Could not issue foreign debt.", false, "error");
    }
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleCycleWorksTarget = () => {
    if (playerCharacterId === null) return;
    const result = cycleDomainWorksTargetForLord(playerCharacterId);
    if (result.ok && result.target) tip(`Domain works target: ${result.target}.`, false, "success");
    else tip(result.error || "Could not change works target.", false, "error");
    usePlayerCharacterState.getState().bumpRefreshToken();
  };

  const handleFundWorks = () => {
    if (playerCharacterId === null) return;
    const result = fundDomainWorksForLord(playerCharacterId, 5);
    if (result.ok) {
      if (result.completed) {
        tip(`Works completed — built ${result.target ?? "structure"}.`, false, "success");
      } else {
        tip(`Funded works (${formatPrice(result.paid)}); progress ${result.progress ?? 0}/100.`, false, "success");
      }
    } else {
      tip(result.error || "Could not fund works.", false, "error");
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
            <dd title={workTip}>{workLabel}</dd>
            {readiness ? (
              <>
                <dt>Readiness</dt>
                <dd
                  title={[readiness.summaryLine, ...readiness.readinessTips].join("\n")}
                  data-tip={[readiness.summaryLine, ...readiness.readinessTips].join(" · ")}
                >
                  {readiness.summaryLine}
                </dd>
              </>
            ) : null}
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
        <button
          type="button"
          className="pcp-action"
          data-tip="Open the Loadout tab to equip garments and arms from inventory"
          disabled={!summary}
          onClick={handlePrepare}
        >
          Prepare…
        </button>
        <select
          className="pcp-action"
          aria-label="Apply adventurer prep template"
          data-tip="Rearrange this character's kit and practice floors (does not spend wealth or mint goods)"
          disabled={!summary}
          defaultValue=""
          onChange={event => {
            const id = event.target.value as PrepTemplateId | "";
            event.target.value = "";
            if (id) handleApplyPrepTemplate(id);
          }}
        >
          <option value="" disabled>
            Prep kit…
          </option>
          {PREP_TEMPLATES.map(t => (
            <option key={t.id} value={t.id} title={t.description}>
              {t.label}
            </option>
          ))}
        </select>
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
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canSetDomainPolicy
                ? `Raise domain levy (now ×${fiscal.domainLevyRate ?? 1}) — scales extract/fortify intensity`
                : "No provincial domain seat"
            }
            disabled={!fiscal.canSetDomainPolicy}
            onClick={() => handleDomainLevy(1)}
          >
            Levy+
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canSetDomainPolicy
                ? `Lower domain levy (now ×${fiscal.domainLevyRate ?? 1})`
                : "No provincial domain seat"
            }
            disabled={!fiscal.canSetDomainPolicy}
            onClick={() => handleDomainLevy(-1)}
          >
            Levy-
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canIssuePublicDebt
                ? `Borrow from credit pool into L2 (pool ${formatPrice(fiscal.creditPoolBalance)}; support ${fiscal.councilSupport}/100)`
                : "Cannot issue debt (need ruler, assembly support, and non-empty credit pool)"
            }
            disabled={!fiscal.canIssuePublicDebt}
            onClick={handleIssueDebt}
          >
            Issue debt
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canRepayPublicDebt
                ? `Repay public debt from L2 (owed ${formatPrice(fiscal.publicDebt)})`
                : "No debt to repay or empty public treasury"
            }
            disabled={!fiscal.canRepayPublicDebt}
            onClick={handleRepayDebt}
          >
            Repay debt
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canNegotiateDebtRate
                ? `Press ${fiscal.primaryMoneylenderName} for cheaper credit (costs public treasury bribe)`
                : fiscal.debtInDefault
                  ? "Cannot renegotiate while in default"
                  : "Only the living ruler may negotiate debt terms"
            }
            disabled={!fiscal.canNegotiateDebtRate}
            onClick={() => handleNegotiateRate(-1)}
          >
            Rate −
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canNegotiateDebtRate
                ? "Accept harsher credit terms (no bribe; raises interest)"
                : "Only the living ruler may negotiate debt terms"
            }
            disabled={!fiscal.canNegotiateDebtRate}
            onClick={() => handleNegotiateRate(1)}
          >
            Rate +
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canNegotiateDebtRate || fiscal.publicDebt > 0 || fiscal.creditPoolBalance > 0
                ? `Open debt negotiation with ${fiscal.primaryMoneylenderName}`
                : "Open debt negotiation dialog (Banker / syndicate / votes)"
            }
            onClick={handleOpenDebtNegotiation}
          >
            Terms…
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canIssueForeignDebt
                ? `Borrow from Ally/Friendly foreign treasury (owed ${formatPrice(fiscal.foreignDebt)})`
                : "Cannot issue foreign debt (need ruler, friendly creditor with surplus, not in default)"
            }
            disabled={!fiscal.canIssueForeignDebt}
            onClick={handleIssueForeignDebt}
          >
            Foreign debt
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={`Open assembly session log${fiscal.councilSessionNumber ? ` (${fiscal.councilSessionNumber} sessions)` : ""}`}
            onClick={handleOpenCouncilLog}
          >
            Council log
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Open domain poll detail — per-burg levy contribution to state poll tax"
            onClick={handleOpenDomainPoll}
          >
            Domain poll
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canSetDomainPolicy
                ? `Cycle construction target (now ${fiscal.domainWorksTarget ?? "walls"}): walls → citadel → plaza`
                : "No provincial domain seat"
            }
            disabled={!fiscal.canSetDomainPolicy}
            onClick={handleCycleWorksTarget}
          >
            Works: {fiscal.domainWorksTarget ?? "—"}
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              fiscal.canFundDomainWorks
                ? `Fund domain works from L3b (5 SP → progress; now ${fiscal.domainWorksProgress ?? 0}/100)`
                : "No domain cash to fund works"
            }
            disabled={!fiscal.canFundDomainWorks}
            onClick={handleFundWorks}
          >
            Fund works
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
                  : workStatus?.cullContract
                    ? "Cannot travel while on an active hunt mission (resign first)"
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
            data-tip="Apply for a construction job in this burg (Economy). Hire resolves after 14 days. Cannot combine with a hunt."
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
          <button
            type="button"
            className="pcp-action"
            data-tip={
              workStatus?.openCullPosts?.[0]
                ? `Apply for the top hunt/pest contract here (Economy). Decision in ${CULL_PLAYER_HIRE_LAG_DAYS} days. Cannot combine with construction.${
                    workStatus.openCullPosts[0].target.kind === "pest" ||
                    workStatus.openCullPosts[0].target.kind === "biomePredator"
                      ? ` ${PEST_HUNT_TIP}`
                      : ""
                  }${huntUndergearedAdvisory ? ` ${huntUndergearedAdvisory}` : ""}`
                : "Apply for a hunt or pest-control contract in this burg when the board has openings"
            }
            disabled={!canApplyCull}
            onClick={handleApplyCull}
          >
            Apply Hunt
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Withdraw a pending hunt application"
            disabled={!canCancelCullApplication}
            onClick={handleCancelCullApplication}
          >
            Cancel Hunt App
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Resign an active hunt mission (forfeits escrow; no bounty)"
            disabled={!canResignCull}
            onClick={handleResignCull}
          >
            Resign Hunt
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              workStatus?.openEscortPosts?.[0]
                ? `Apply for the top escort contract (Economy). Decision in ${ESCORT_PLAYER_HIRE_LAG_DAYS} days. Fee ${workStatus.openEscortPosts[0].fee} (${workStatus.openEscortPosts[0].marketRate}). Protects trade or travelers; cannot combine with construction/hunt.`
                : "Apply for an escort job in this burg when the board has openings (all culture sets)"
            }
            disabled={!canApplyEscort}
            onClick={handleApplyEscort}
          >
            Apply Escort
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Withdraw a pending escort application"
            disabled={!canCancelEscortApplication}
            onClick={handleCancelEscortApplication}
          >
            Cancel Escort App
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Resign an active escort mission (forfeits escrow; no fee)"
            disabled={!canResignEscort}
            onClick={handleResignEscort}
          >
            Resign Escort
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
            data-tip="Apply for a construction job in this burg (Economy). Hire resolves after 14 days. Cannot combine with a hunt."
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
          <button
            type="button"
            className="pcp-action"
            data-tip={
              workStatus?.openCullPosts?.[0]
                ? `Apply for the top hunt/pest contract here (Economy). Decision in ${CULL_PLAYER_HIRE_LAG_DAYS} days. Cannot combine with construction.${
                    workStatus.openCullPosts[0].target.kind === "pest" ||
                    workStatus.openCullPosts[0].target.kind === "biomePredator"
                      ? ` ${PEST_HUNT_TIP}`
                      : ""
                  }${huntUndergearedAdvisory ? ` ${huntUndergearedAdvisory}` : ""}`
                : "Apply for a hunt or pest-control contract in this burg when the board has openings"
            }
            disabled={!canApplyCull}
            onClick={handleApplyCull}
          >
            Apply Hunt
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Withdraw a pending hunt application"
            disabled={!canCancelCullApplication}
            onClick={handleCancelCullApplication}
          >
            Cancel Hunt App
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Resign an active hunt mission (forfeits escrow; no bounty)"
            disabled={!canResignCull}
            onClick={handleResignCull}
          >
            Resign Hunt
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip={
              workStatus?.openEscortPosts?.[0]
                ? `Apply for the top escort contract (Economy). Decision in ${ESCORT_PLAYER_HIRE_LAG_DAYS} days. Fee ${workStatus.openEscortPosts[0].fee} (${workStatus.openEscortPosts[0].marketRate}). Protects trade or travelers; cannot combine with construction/hunt.`
                : "Apply for an escort job in this burg when the board has openings (all culture sets)"
            }
            disabled={!canApplyEscort}
            onClick={handleApplyEscort}
          >
            Apply Escort
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Withdraw a pending escort application"
            disabled={!canCancelEscortApplication}
            onClick={handleCancelEscortApplication}
          >
            Cancel Escort App
          </button>
          <button
            type="button"
            className="pcp-action"
            data-tip="Resign an active escort mission (forfeits escrow; no fee)"
            disabled={!canResignEscort}
            onClick={handleResignEscort}
          >
            Resign Escort
          </button>
        </div>
      )}
    </Dialog>
  );
};
