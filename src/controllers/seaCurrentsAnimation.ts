import { viewContext } from "../context/viewContext";
import { DeckGlRenderer } from "../renderers/webgl/deckRenderer";
import { useLayerState } from "../store/layerState";
import { scheduleWebglUpdate } from "./layers";

/**
 * Drives the continuous flowing-highlight animation for the "Sea Currents" WebGL layer
 * (see docs/plan/searoute-current-direction-visualization.md, Plan A). This is the one WebGL
 * layer in the app whose color is time-driven rather than data-driven, so it is the one case
 * that needs a real per-frame redraw loop instead of the normal on-demand `scheduleWebglUpdate()`
 * triggers. The loop must add zero ongoing cost whenever the layer isn't actually visible.
 */

let rafId: number | null = null;

function isActive(): boolean {
  return (
    useLayerState.getState().activeLayers.toggleSeaCurrents === true &&
    viewContext.renderMode === "webglHybrid" &&
    viewContext.webglDeck !== null &&
    !DeckGlRenderer.isSuspended()
  );
}

// Self-checking rather than externally cancelled: every tick re-reads isActive() and simply
// stops rescheduling itself the moment the toggle, render mode, or Deck instance stop supporting
// the effect (toggled off, switched to SVG mode, satellite view suspended the canvas, or the
// Deck instance was finalized/HMR-disposed) — so nothing elsewhere needs to call a "stop".
function tick(): void {
  if (!isActive()) {
    rafId = null;
    return;
  }
  rafId = requestAnimationFrame(tick);
  scheduleWebglUpdate();
}

function syncLoop(): void {
  if (isActive() && rafId === null) rafId = requestAnimationFrame(tick);
}

useLayerState.subscribe(syncLoop);
document.addEventListener("fmg:render-mode-changed", syncLoop);
syncLoop();
