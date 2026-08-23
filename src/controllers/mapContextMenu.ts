import { worldContext } from "../context/worldContext";
import { hidePickChooser } from "../services/mapInteraction";
import { computeDirections, pickDefaultMode } from "../services/travelDirections";
import { viewLayerService as view } from "../services/viewLayerService";
import { useDirectionsDialogState } from "../store/directionsDialogState";
import { rulers, setRulers } from "../store/editorState";
import { generationProgressStore } from "../store/generationProgressState";
import {
  closeMapContextMenu,
  getMapContextMenuState,
  openMapContextMenu,
  resetDistanceSession,
  setActiveDistanceRulerId,
  setDistanceFromPoint
} from "../store/mapContextMenuState";
import { is3DViewActive } from "../store/viewModeState";
import { openDialog } from "../ui/dialogs/dialogService";
import { rn } from "../utils";
import { getElementById, layerIsOn } from "../utils/nodeUtils";
import { toggleRulers } from "./layers";
import { Ruler, Rulers } from "./measurers";

const PENDING_GROUP_CLASS = "distance-from-pending";

/** Screen-pixel hit radius for "did this click land on a burg icon", independent of zoom. */
const BURG_HIT_RADIUS_PX = 10;

/**
 * Resolves the live, non-removed burg nearest a map point, within a fixed on-screen radius.
 * Deliberately hit-tests against burg marker positions directly rather than routing through
 * findCell()/pack.cells.burg: a burg's rendered (x, y) is not always inside its own Voronoi
 * cell's centroid-nearest region (e.g. coastal burgs snapped to a bank — see
 * docs/plan/burg-site-descriptor.md), so a cell-based lookup can miss a click squarely on the
 * icon. view.scale is screen-pixels-per-map-unit, so BURG_HIT_RADIUS_PX / view.scale keeps the
 * hit area a constant apparent size on screen at any zoom.
 */
function resolveBurgAtMapPoint(mapX: number, mapY: number): { id: number; name: string } | null {
  const { burgs } = worldContext.pack;
  if (!burgs) return null;

  const radius = BURG_HIT_RADIUS_PX / Math.max(view.scale, 1e-6);
  let closest: { id: number; name: string } | null = null;
  let closestDist2 = radius * radius;

  for (let id = 1; id < burgs.length; id++) {
    const burg = burgs[id];
    if (!burg || burg.removed) continue;
    const dist2 = (burg.x - mapX) ** 2 + (burg.y - mapY) ** 2;
    if (dist2 <= closestDist2) {
      closestDist2 = dist2;
      closest = { id, name: burg.name || `Burg ${id}` };
    }
  }

  return closest;
}

export function clientToMapPoint(clientX: number, clientY: number): [number, number] | null {
  const mapSvg = getElementById<SVGSVGElement>("map");
  const viewbox = view.viewbox?.node() as SVGGraphicsElement | null;
  if (!mapSvg || !viewbox) return null;
  const ctm = viewbox.getScreenCTM();
  if (!ctm) return null;
  const pt = mapSvg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return [p.x, p.y];
}

export function handleMapContextMenu(event: MouseEvent): void {
  if (event.defaultPrevented) return;
  if (!isMapContextMenuTarget(event.target)) return;

  event.preventDefault();
  event.stopPropagation();

  if (is3DViewActive() || generationProgressStore.getState().isGenerating) return;

  const mapPoint = clientToMapPoint(event.clientX, event.clientY);
  if (!mapPoint) return;

  hidePickChooser();
  const targetBurg = resolveBurgAtMapPoint(mapPoint[0], mapPoint[1]);
  openMapContextMenu(
    event.clientX,
    event.clientY,
    mapPoint[0],
    mapPoint[1],
    targetBurg?.id ?? null,
    targetBurg?.name ?? null
  );
}

export function isMapContextMenuTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable='true']")) return false;
  return Boolean(target.closest("#map"));
}

export function setDistanceFromHere(mapX: number, mapY: number): void {
  const state = getMapContextMenuState();
  const point: [number, number] = [rn(mapX, 1), rn(mapY, 1)];
  setDistanceFromPoint(point, state.targetBurgId, state.targetBurgName);
  showPendingFrom(point);
  closeMapContextMenu();
}

export function setDistanceToHere(mapX: number, mapY: number): void {
  const state = getMapContextMenuState();
  if (!state.distanceFrom) {
    closeMapContextMenu();
    return;
  }

  // Burg-to-burg: open the routed Directions dialog instead of a straight-line ruler.
  if (
    state.distanceFromBurgId &&
    state.targetBurgId &&
    state.distanceFromBurgId !== state.targetBurgId &&
    openDirectionsForBurgs(state.distanceFromBurgId, state.targetBurgId)
  ) {
    hidePendingFrom();
    closeMapContextMenu();
    return;
  }

  const to: [number, number] = [rn(mapX, 1), rn(mapY, 1)];
  ensureRulersReady();
  hidePendingFrom();

  const existing = findActiveContextRuler(state.activeRulerId);
  if (existing) {
    const endIndex = existing.points.length - 1;
    existing.updatePoint(endIndex, to[0], to[1]);
    existing.draw();
  } else {
    const ruler = rulers.create(Ruler, [state.distanceFrom, to]).draw();
    setActiveDistanceRulerId(ruler.id);
  }

  closeMapContextMenu();
}

/** Computes directions between two burgs and opens the Directions dialog. Returns false (and
 * opens nothing) if neither burg resolves — the caller falls back to a straight-line ruler. */
function openDirectionsForBurgs(fromBurgId: number, toBurgId: number): boolean {
  const result = computeDirections(fromBurgId, toBurgId);
  if (!result) return false;

  const { burgs } = worldContext.pack;
  const fromName = burgs[fromBurgId]?.name || `Burg ${fromBurgId}`;
  const toName = burgs[toBurgId]?.name || `Burg ${toBurgId}`;

  useDirectionsDialogState.getState().open({
    fromBurgId,
    toBurgId,
    fromName,
    toName,
    result,
    selectedMode: pickDefaultMode(result)
  });
  openDialog("directions");
  return true;
}

export function clearDistanceSession(): void {
  hidePendingFrom();
  resetDistanceSession();
}

export function ensureRulersReady(): void {
  if (!rulers) setRulers(new Rulers());
  if (!layerIsOn("toggleRulers")) toggleRulers();
}

function findActiveContextRuler(id: number | null): InstanceType<typeof Ruler> | null {
  if (id === null || !rulers) return null;
  const measurer = rulers.data.find((item: { id: number }) => item.id === id);
  return measurer instanceof Ruler ? measurer : null;
}

function showPendingFrom(point: [number, number]): void {
  ensureRulersReady();
  if (!view.ruler) return;
  hidePendingFrom();

  const size = rn((1 / view.scale ** 0.3) * 2, 2);
  const group = view.ruler.append("g").attr("class", PENDING_GROUP_CLASS).attr("pointer-events", "none");
  group
    .append("circle")
    .attr("r", "1em")
    .attr("cx", point[0])
    .attr("cy", point[1])
    .attr("font-size", 2 * size);
}

function hidePendingFrom(): void {
  view.ruler?.selectAll(`.${PENDING_GROUP_CLASS}`).remove();
}

document.addEventListener("map:generated", () => clearDistanceSession());
document.addEventListener("fmg:create-default-ruler", () => clearDistanceSession());
