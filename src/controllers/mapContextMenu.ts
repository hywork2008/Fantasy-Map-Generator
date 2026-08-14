import { hidePickChooser } from "../services/mapInteraction";
import { viewLayerService as view } from "../services/viewLayerService";
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
import { rn } from "../utils";
import { getElementById, layerIsOn } from "../utils/nodeUtils";
import { toggleRulers } from "./layers";
import { Ruler, Rulers } from "./measurers";

const PENDING_GROUP_CLASS = "distance-from-pending";

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
  openMapContextMenu(event.clientX, event.clientY, mapPoint[0], mapPoint[1]);
}

export function isMapContextMenuTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable='true']")) return false;
  return Boolean(target.closest("#map"));
}

export function setDistanceFromHere(mapX: number, mapY: number): void {
  const point: [number, number] = [rn(mapX, 1), rn(mapY, 1)];
  setDistanceFromPoint(point);
  showPendingFrom(point);
  closeMapContextMenu();
}

export function setDistanceToHere(mapX: number, mapY: number): void {
  const state = getMapContextMenuState();
  if (!state.distanceFrom) {
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

export function clearDistanceSession(): void {
  hidePendingFrom();
  resetDistanceSession();
}

function ensureRulersReady(): void {
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
