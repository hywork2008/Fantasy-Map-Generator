import { pointer } from "d3";
import { usePlayerCharacterState } from "../../characters/store/playerCharacterState";
import type { TradeRouteSegment } from "../../economy/generators/marketTypes";
import { TradeAnimation } from "../../economy/generators/trade-animation";
import { calculateRouteDurationDays } from "../../economy/generators/tradeRouteDuration";
import { clearMainTip, tip } from "../../hostServices";
import { openConfirm } from "../../hostUi";
import { findCell } from "../../hostUtils";
import { getApi, getWorldContext } from "../nobilityContext";

export interface TravelEstimate {
  sourceBurgId: number;
  destinationBurgId: number;
  /** Whole simulation days (ceiled caravan-route duration). */
  durationDays: number;
  destinationName: string;
}

/** True when the map is in pure SVG mode (move selection uses SVG viewbox clicks). */
export function isSvgRenderMode(): boolean {
  try {
    return getApi().viewContext.renderMode === "svg";
  } catch {
    return false;
  }
}

/**
 * Estimate travel between two burgs using the economy trade-route pathfinder and
 * caravan duration model (land/sea speeds + port transfer penalties).
 */
export function estimateTravelBetweenBurgs(sourceBurgId: number, destinationBurgId: number): TravelEstimate | null {
  if (sourceBurgId === destinationBurgId) {
    const { pack } = getWorldContext();
    const burg = pack.burgs?.[destinationBurgId];
    return {
      sourceBurgId,
      destinationBurgId,
      durationDays: 0,
      destinationName: burg?.name || `Burg ${destinationBurgId}`
    };
  }

  const world = getWorldContext();
  const source = world.pack.burgs?.[sourceBurgId];
  const target = world.pack.burgs?.[destinationBurgId];
  if (!source || source.removed || !target || target.removed) return null;
  if (source.cell === undefined || target.cell === undefined) return null;

  if (source.cell === target.cell) {
    return {
      sourceBurgId,
      destinationBurgId,
      durationDays: 0,
      destinationName: target.name || `Burg ${destinationBurgId}`
    };
  }

  if (!world.pack.cells?.routes) return null;

  const routePath = TradeAnimation.findRoutePath(source.cell, target.cell);
  if (!routePath || routePath.segments.length === 0) return null;

  const routeSegments: TradeRouteSegment[] = routePath.segments.map(segment => ({
    type: segment.type,
    points: segment.points.map(point => [point[0], point[1], point[2]] as [number, number, number])
  }));

  const durationDays = calculateRouteDurationDays(routeSegments, world.distanceScale);
  if (!Number.isFinite(durationDays) || durationDays < 0) return null;

  return {
    sourceBurgId,
    destinationBurgId,
    durationDays: Math.max(0, durationDays),
    destinationName: target.name || `Burg ${destinationBurgId}`
  };
}

export function enterPlayerMoveMode(): void {
  if (!isSvgRenderMode()) {
    tip("Character movement is only available in SVG map mode", false, "error");
    return;
  }

  const store = usePlayerCharacterState.getState();
  if (store.pendingTravel) {
    tip("This character is already travelling", false, "error");
    return;
  }

  const characterId = store.playerCharacterId;
  if (characterId === null) {
    tip("No player character selected", false, "error");
    return;
  }

  const { pack } = getWorldContext();
  const character = pack.characters?.find(c => c.i === characterId);
  if (!character || character.dead) {
    tip("Player character is not available for travel", false, "error");
    return;
  }
  if (character.location === undefined) {
    tip("Player character has no known location", false, "error");
    return;
  }

  const view = getApi().viewContext;
  view.viewbox.style("cursor", "crosshair").on("click", onDestinationMapClick);
  store.setMoveMode(true);
  tip("Click a burg on the map to set the travel destination. Click Move again to cancel.", true);
}

export function exitPlayerMoveMode(): void {
  const store = usePlayerCharacterState.getState();
  if (!store.isMoveMode) return;

  try {
    const view = getApi().viewContext;
    view.viewbox.on("click", null);
    getApi().restoreDefaultEvents();
  } catch {
    // Context may already be torn down during cleanup.
  }
  clearMainTip();
  store.setMoveMode(false);
}

export function togglePlayerMoveMode(): void {
  if (usePlayerCharacterState.getState().isMoveMode) {
    exitPlayerMoveMode();
    tip("Travel cancelled", false, "success");
    return;
  }
  enterPlayerMoveMode();
}

function onDestinationMapClick(this: SVGGElement, event: MouseEvent): void {
  const [x, y] = pointer(event, this);
  const cellId = findCell(x, y);
  if (cellId === undefined) return;

  const { pack } = getWorldContext();
  const destinationBurgId = pack.cells?.burg?.[cellId] ?? 0;
  if (!destinationBurgId) {
    tip("Click on a burg to choose a destination", false, "error");
    return;
  }

  // Leave selection mode before the confirm dialog so map clicks resume normal behaviour.
  exitPlayerMoveMode();
  requestTravelToBurg(destinationBurgId);
}

/**
 * Offer travel from the current player character's location to `destinationBurgId`.
 * Used by map Move mode and Edit Burg's travel footer button. Works in any render mode.
 */
export function requestTravelToBurg(destinationBurgId: number): void {
  if (!Number.isFinite(destinationBurgId) || destinationBurgId <= 0) {
    tip("Invalid destination burg", false, "error");
    return;
  }

  const store = usePlayerCharacterState.getState();
  if (store.pendingTravel) {
    tip("This character is already travelling", false, "error");
    return;
  }

  const characterId = store.playerCharacterId;
  if (characterId === null) {
    tip("No player character selected", false, "error");
    return;
  }

  const { pack } = getWorldContext();
  const character = pack.characters?.find(c => c.i === characterId);
  if (!character || character.dead) {
    tip("Player character is not available for travel", false, "error");
    return;
  }
  if (character.location === undefined) {
    tip("Player character has no known location", false, "error");
    return;
  }

  const destination = pack.burgs?.[destinationBurgId];
  if (!destination || destination.removed) {
    tip("That burg is not available", false, "error");
    return;
  }

  const estimate = estimateTravelBetweenBurgs(character.location, destinationBurgId);
  if (!estimate) {
    tip("No trade route connects the current location to that burg", false, "error");
    return;
  }

  if (estimate.durationDays === 0) {
    if (character.location === destinationBurgId) {
      tip("Already at this location", false, "warn");
      return;
    }
    // Same cell, different burg id (rare) — treat as instantaneous relocation.
    applyCharacterArrival(characterId, destinationBurgId);
    tip(`Arrived at ${estimate.destinationName}`, false, "success");
    return;
  }

  const dayLabel = estimate.durationDays === 1 ? "1 day" : `${estimate.durationDays} days`;
  openConfirm(`Travel will take ${dayLabel}. Move to ${estimate.destinationName}?`, {
    title: "Travel",
    confirm: "Move",
    cancel: "Cancel",
    onConfirm: () => beginPlayerTravel(characterId, destinationBurgId, estimate.durationDays)
  });
}

/**
 * Register a pending journey and advance the simulation by the travel duration.
 * Location updates once the remaining days have been fully consumed.
 */
export function beginPlayerTravel(characterId: number, destinationBurgId: number, durationDays: number): void {
  if (durationDays <= 0) {
    applyCharacterArrival(characterId, destinationBurgId);
    return;
  }

  const store = usePlayerCharacterState.getState();
  if (store.pendingTravel) {
    tip("This character is already travelling", false, "error");
    return;
  }

  store.setPendingTravel({
    characterId,
    destinationBurgId,
    remainingDays: durationDays
  });

  // Same path as Tools → Advance Day: progress UI + day-batch stepping.
  document.dispatchEvent(
    new CustomEvent("react-tool-action", {
      detail: { action: "advanceTimeButton", years: 0, months: 0, days: durationDays }
    })
  );
}

/**
 * Called from the nobility tick system each day. Decrements remaining travel and
 * applies the destination when the journey completes.
 */
export function tickPlayerTravel(deltaDays: number): void {
  if (!(deltaDays > 0)) return;
  const store = usePlayerCharacterState.getState();
  const pending = store.pendingTravel;
  if (!pending) return;

  const remaining = pending.remainingDays - deltaDays;
  if (remaining > 0) {
    store.setPendingTravel({ ...pending, remainingDays: remaining });
    return;
  }

  store.setPendingTravel(null);
  applyCharacterArrival(pending.characterId, pending.destinationBurgId);
}

export function applyCharacterArrival(characterId: number, destinationBurgId: number): void {
  const { pack } = getWorldContext();
  const character = pack.characters?.find(c => c.i === characterId);
  if (!character || character.dead) return;

  const burg = pack.burgs?.[destinationBurgId];
  if (!burg || burg.removed) return;

  character.location = destinationBurgId;
  usePlayerCharacterState.getState().bumpRefreshToken();

  const name = burg.name || `Burg ${destinationBurgId}`;
  tip(`${character.name} arrived at ${name}`, false, "success");
}

export function clearPlayerTravel(): void {
  exitPlayerMoveMode();
  usePlayerCharacterState.getState().setPendingTravel(null);
}
