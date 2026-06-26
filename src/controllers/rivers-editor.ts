import { curveCatmullRom, type D3DragEvent, drag, pointer, select } from "d3";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { Names } from "../generators/names-generator";
import { Rivers } from "../generators/river-generator";
import { dialogStore } from "../store/dialogState";
import { elSelected, setElSelected } from "../store/editorState";
import type { River } from "../types/models";
import type { TypedArray } from "../types/PackedGraph";
import { closeDialog, closeDialogs, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { findCell, getSegmentId, rand, rn } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { getPackPolygon } from "../utils/graphUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, tip } from "../utils/uiHelpers";
import { openElevationProfile } from "./elevation-profile";
import { toggleCells, toggleRivers } from "./layers";
import { editNotes } from "./notes-editor";
import { createRiver } from "./rivers-creator";
import { editStyle } from "./style";

let worldContext: WorldContext;

let _rInitCell = 0;
let _rMovedToCell: number | null = null;
let _rRiver: River | null = null;
let _rFlCells: TypedArray | null = null;

function getRiver(): River | null {
  if (!elSelected) return null;
  const idStr = elSelected.attr("id");
  if (!idStr?.startsWith("river")) return null;
  const riverId = +idStr.slice(5);
  return worldContext.pack.rivers.find(r => r.i === riverId) || null;
}

function updateRiverData(): void {
  const r = getRiver();
  if (!r) return;

  const parent = r.parent || r.i;
  const sortedRivers = worldContext.pack.rivers.slice().sort((a: River, b: River) => (a.name > b.name ? 1 : -1));
  const parentOptions = sortedRivers.map((river: River) => ({
    label: river.name,
    value: String(river.i)
  }));

  const basinName = worldContext.pack.rivers.find((river: River) => river.i === r.basin)?.name ?? "";
  const distanceUnitInput = document.getElementById("distanceUnitInput") as HTMLSelectElement | null;

  r.length = rn((elSelected!.node() as SVGPathElement).getTotalLength() / 2, 2);
  const lengthUI = `${rn(r.length * worldContext.distanceScale)} ${distanceUnitInput?.value ?? "km"}`;

  const { cells: riverCells, discharge, widthFactor, sourceWidth } = r;
  const meanderedPoints = Rivers.addMeandering(riverCells);
  r.width = Rivers.getWidth(
    Rivers.getOffset({
      flux: discharge,
      pointIndex: meanderedPoints.length,
      widthFactor,
      startingWidth: sourceWidth
    })
  );
  const widthUI = `${rn(r.width * worldContext.distanceScale, 3)} ${distanceUnitInput?.value ?? "km"}`;

  import("../store/riverEditorState").then(({ getRiverEditorState }) => {
    getRiverEditorState().setRiverData({
      name: r.name,
      type: r.type,
      parent: String(parent),
      parentOptions,
      basin: basinName,
      discharge: `${r.discharge} m³/s`,
      sourceWidth: r.sourceWidth,
      widthFactor: r.widthFactor,
      lengthUI,
      widthUI
    });
  });
}

function drawControlPoints(pts: [number, number][]): void {
  viewContext.debug
    .select<SVGGElement>("#controlPoints")
    .selectAll<SVGCircleElement, [number, number]>("circle")
    .data(pts)
    .join("circle")
    .attr("cx", d => d[0])
    .attr("cy", d => d[1])
    .attr("r", 0.6)
    .call(
      drag<SVGCircleElement, [number, number]>()
        .on("start", dragControlPointStart)
        .on("drag", dragControlPointDrag)
        .on("end", dragControlPointEnd)
    )
    .on("click", removeControlPoint);
}

function drawRiverCells(cellList: number[]): void {
  const validCells = [...new Set(cellList)].filter(i => worldContext.pack.cells.i[i]);
  viewContext.debug
    .select("#controlCells")
    .selectAll("polygon")
    .data(validCells)
    .join("polygon")
    .attr("points", (d: number) => getPackPolygon(d, worldContext.pack).join(" "));
}

function dragControlPointStart(
  this: SVGCircleElement,
  event: D3DragEvent<SVGCircleElement, [number, number], unknown>
): void {
  _rRiver = getRiver();
  _rFlCells = worldContext.pack.cells.fl;
  _rInitCell = findCell(event.x, event.y);
  _rMovedToCell = null;
}

function dragControlPointDrag(
  this: SVGCircleElement,
  event: D3DragEvent<SVGCircleElement, [number, number], unknown>
): void {
  const { x, y } = event;
  const currentCell = findCell(x, y);
  _rMovedToCell = _rInitCell !== currentCell ? currentCell : null;
  this.setAttribute("cx", String(x));
  this.setAttribute("cy", String(y));
  select(this).datum([rn(x, 1), rn(y, 1)] as [number, number]);
  redrawRiver();
  drawRiverCells(_rRiver!.cells);
}

function dragControlPointEnd(this: SVGCircleElement): void {
  const { r } = worldContext.pack.cells;
  if (_rMovedToCell !== null && !r[_rMovedToCell]) {
    r[_rInitCell] = 0;
    r[_rMovedToCell] = _rRiver!.i;
    const sourceFlux = _rFlCells![_rInitCell];
    _rFlCells![_rInitCell] = _rFlCells![_rMovedToCell];
    _rFlCells![_rMovedToCell] = sourceFlux;
    redrawRiver();
  }
}

function redrawRiver(): void {
  const river = getRiver();
  if (!river) return;
  river.points = viewContext.debug.selectAll("#controlPoints > *").data() as [number, number][];
  river.cells = river.points.map(([x, y]) => findCell(x, y));

  viewContext.lineGen.curve(curveCatmullRom.alpha(0.1));
  const meanderedPoints = Rivers.addMeandering(river.cells, river.points);
  const path = Rivers.getRiverPath(meanderedPoints, river.widthFactor, river.sourceWidth);
  elSelected!.attr("d", path);

  updateRiverData();
  if (dialogStore.getState().openDialogs.has("elevationProfile")) {
    riverEditorActions.showRiverElevationProfile();
  }
}

function addControlPoint(this: SVGPathElement, event: MouseEvent): void {
  const [x, y] = pointer(event, this);
  const point: [number, number] = [rn(x, 1), rn(y, 1)];

  const river = getRiver();
  if (!river) return;
  if (!river.points) river.points = viewContext.debug.selectAll("#controlPoints > *").data() as [number, number][];

  const index = getSegmentId(river.points, point, 2);
  river.points.splice(index, 0, point);
  drawControlPoints(river.points);
  redrawRiver();
}

function removeControlPoint(this: SVGCircleElement): void {
  this.remove();
  redrawRiver();

  const r = getRiver();
  if (r) drawRiverCells(r.cells);
}

function closeRiverEditor(): void {
  viewContext.debug.select("#controlPoints").remove();
  viewContext.debug.select("#controlCells").remove();

  elSelected?.on("click", null);
  EditorBus.unselect();
  clearMainTip();

  const toggleCellsEl = document.getElementById("toggleCells");
  if (toggleCellsEl) {
    const forced = +(toggleCellsEl.dataset.forced || "0");
    toggleCellsEl.dataset.forced = "0";
    if (forced && layerIsOn("toggleCells")) toggleCells();
  }
}

export const riverEditorActions = {
  changeName: (name: string): void => {
    const r = getRiver();
    if (!r) return;
    r.name = name;
    updateRiverData();
  },

  changeType: (type: string): void => {
    const r = getRiver();
    if (!r) return;
    r.type = type;
    updateRiverData();
  },

  generateNameCulture: (): void => {
    const r = getRiver();
    if (!r) return;
    r.name = Rivers.getName(r.mouth);
    updateRiverData();
  },

  generateNameRandom: (): void => {
    const r = getRiver();
    if (!r) return;
    r.name = Names.getBase(rand(worldContext.nameBases.length - 1));
    updateRiverData();
  },

  changeParent: (parentIdStr: string): void => {
    const r = getRiver();
    if (!r) return;
    r.parent = +parentIdStr;
    r.basin = worldContext.pack.rivers.find((river: River) => river.i === r.parent)?.basin ?? r.i;
    updateRiverData();
  },

  changeSourceWidth: (width: number): void => {
    const r = getRiver();
    if (!r) return;
    r.sourceWidth = width;
    redrawRiver();
  },

  changeWidthFactor: (factor: number): void => {
    const r = getRiver();
    if (!r) return;
    r.widthFactor = factor;
    redrawRiver();
  },

  createRiver: (): void => {
    createRiver();
  },

  editStyle: (): void => {
    editStyle("rivers");
  },

  showRiverElevationProfile: (): void => {
    const pts = viewContext.debug
      .selectAll<Element, [number, number]>("#controlPoints > *")
      .data()
      .map(([x, y]) => findCell(x, y));
    const r = getRiver();
    if (!r) return;
    const riverLen = rn(r.length * worldContext.distanceScale);
    openElevationProfile(pts, riverLen, true);
  },

  editRiverLegend: (): void => {
    const rid = elSelected!.attr("id");
    const r = getRiver();
    if (!r) return;
    editNotes(rid, `${r.name} ${r.type}`);
  },

  removeRiver: (): void => {
    const alertContent = "Are you sure you want to remove the river and all its tributaries";
    openRichDialog({
      content: alertContent,
      resizable: false,
      width: "22em",
      title: "Remove river and tributaries",
      buttons: {
        Remove: () => {
          const r = getRiver();
          if (r) Rivers.remove(r.i);
          elSelected!.remove();
          closeDialog("riverEditor");
        },
        Cancel: () => {}
      }
    });
  }
};

export function editRiver(id: string): void {
  if (viewContext.customization) return;
  if (elSelected && id === elSelected.attr("id")) return;
  closeDialogs(".stable");
  if (!layerIsOn("toggleRivers")) toggleRivers();

  const toggleCellsEl = document.getElementById("toggleCells");
  if (toggleCellsEl) toggleCellsEl.dataset.forced = String(+!layerIsOn("toggleCells"));
  if (!layerIsOn("toggleCells")) toggleCells();

  setElSelected(select<SVGPathElement, unknown>(`#${id}`).on("click", addControlPoint) as typeof elSelected);

  tip(
    "Drag control points to change the river course. Click on point to remove it. Click on river to add additional control point. For major changes please create a new river instead",
    true
  );
  viewContext.debug.append("g").attr("id", "controlCells");
  viewContext.debug.append("g").attr("id", "controlPoints");

  updateRiverData();

  const river = getRiver();
  if (river) {
    const { cells: riverCells, points } = river;
    const riverPoints = Rivers.getRiverPoints(riverCells, points ?? null) as [number, number][];
    drawControlPoints(riverPoints);
    drawRiverCells(riverCells);
  }

  openDialog("riverEditor", {
    title: "Edit River",
    resizable: false,
    position: { my: "left top", at: "left+10 top+10", of: "#map" },
    onClose: closeRiverEditor
  });
}

export function initRiversEditor(wc: WorldContext) {
  worldContext = wc;
}
