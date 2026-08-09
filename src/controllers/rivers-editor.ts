import { curveCatmullRom, type D3DragEvent, drag, pointer, select } from "d3";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { refreshRiverHydrology } from "../generators/riverHydrology";
import { removeRivers } from "../renderers/draw-rivers";
import { patchRiver, removeRiver, replaceRiverGeometry } from "../runtime/worldRuntime";
import { GenerationPipeline } from "../services/generationPipeline";
import { clearMainTip, tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { dialogStore } from "../store/dialogState";
import { type elSelected, setElSelected } from "../store/editorState";
import { useOptionsState } from "../store/optionsState";
import type { River } from "../types/models";
import { closeDialog, closeDialogs, openConfirm, openDialog } from "../ui/dialogs/dialogService";
import { findCell, getSegmentId, rand, rn } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { getPackPolygon } from "../utils/graphUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { openElevationProfile } from "./elevation-profile";
import { toggleCells, toggleRivers } from "./layers";
import { editNotes } from "./notes-editor";
import { createRiver } from "./rivers-creator";
import { editStyle } from "./style";

let worldContext: WorldContext;
let cellsWasForced = false;
let selectedRiverId: number | null = null;
let selectedRiverPath: SVGPathElement | null = null;

function getRiver(): River | null {
  if (selectedRiverId === null) return null;
  return worldContext.pack.rivers.find(r => r.i === selectedRiverId) || null;
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
  const { distanceUnit } = useOptionsState.getState();
  const unit = distanceUnit || "km";

  const points = GenerationPipeline.Rivers.addMeandering(r.cells, r.points ?? null);
  r.length = rn(GenerationPipeline.Rivers.getApproximateLength(points.map(([x, y]) => [x, y])) / 2, 2);
  const lengthUI = `${rn(r.length * worldContext.distanceScale)} ${unit}`;

  refreshRiverHydrology(r, worldContext);

  const { cells: riverCells, discharge, widthFactor, sourceWidth } = r;
  const meanderedPoints = GenerationPipeline.Rivers.addMeandering(riverCells);
  r.width = GenerationPipeline.Rivers.getWidth(
    GenerationPipeline.Rivers.getOffset({
      flux: discharge,
      pointIndex: meanderedPoints.length,
      widthFactor,
      startingWidth: sourceWidth
    })
  );
  const widthUI = `${rn(r.width * worldContext.distanceScale, 3)} ${distanceUnit}`;

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
      sourceElevation: r.sourceElevation ?? 0,
      sourceWaterTemperature: r.sourceWaterTemperature ?? 0,
      lengthUI,
      widthUI
    });
  });
}

function drawControlPoints(pts: [number, number][]): void {
  view.debug
    .select<SVGGElement>("#controlPoints")
    .selectAll<SVGCircleElement, [number, number]>("circle")
    .data(pts)
    .join("circle")
    .attr("cx", d => d[0])
    .attr("cy", d => d[1])
    .attr("r", 0.6)
    .call(drag<SVGCircleElement, [number, number]>().on("drag", dragControlPointDrag))
    .on("click", removeControlPoint);
}

function drawRiverCells(cellList: number[]): void {
  const validCells = [...new Set(cellList)].filter(i => worldContext.pack.cells.i[i]);
  view.debug
    .select("#controlCells")
    .selectAll("polygon")
    .data(validCells)
    .join("polygon")
    .attr("points", (d: number) => getPackPolygon(d, worldContext.pack).join(" "));
}

function dragControlPointDrag(
  this: SVGCircleElement,
  event: D3DragEvent<SVGCircleElement, [number, number], unknown>
): void {
  const { x, y } = event;
  this.setAttribute("cx", String(x));
  this.setAttribute("cy", String(y));
  select(this).datum([rn(x, 1), rn(y, 1)] as [number, number]);
  redrawRiver();
  const river = getRiver();
  if (river) drawRiverCells(river.cells);
}

function redrawRiver(): void {
  const river = getRiver();
  if (!river) return;
  const points = view.debug.selectAll("#controlPoints > *").data() as [number, number][];
  const cellIds = points.map(([x, y]) => findCell(x, y));
  replaceRiverGeometry({ riverId: river.i, points, cellIds });

  view.lineGen.curve(curveCatmullRom.alpha(0.1));
  const meanderedPoints = GenerationPipeline.Rivers.addMeandering(river.cells, river.points);
  const path = GenerationPipeline.Rivers.getRiverPath(meanderedPoints, river.widthFactor, river.sourceWidth);
  selectedRiverPath?.setAttribute("d", path);

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
  const points = river.points ?? (view.debug.selectAll("#controlPoints > *").data() as [number, number][]);

  const index = getSegmentId(points, point, 2);
  const updatedPoints = [...points.slice(0, index), point, ...points.slice(index)];
  const cellIds = updatedPoints.map(([x, y]) => findCell(x, y));
  if (!replaceRiverGeometry({ riverId: river.i, points: updatedPoints, cellIds })) return;
  drawControlPoints(river.points as [number, number][]);
  redrawRiver();
}

function removeControlPoint(this: SVGCircleElement): void {
  this.remove();
  redrawRiver();

  const r = getRiver();
  if (r) drawRiverCells(r.cells);
}

function closeRiverEditor(): void {
  view.debug.select("#controlPoints").remove();
  view.debug.select("#controlCells").remove();

  if (selectedRiverPath) select(selectedRiverPath).on("click", null);
  selectedRiverPath = null;
  selectedRiverId = null;
  EditorBus.unselect();
  clearMainTip();

  if (cellsWasForced && layerIsOn("toggleCells")) toggleCells();
  cellsWasForced = false;
}

export const riverEditorActions = {
  changeName: (name: string): void => {
    const r = getRiver();
    if (!r) return;
    if (patchRiver({ riverId: r.i, name })) updateRiverData();
  },

  changeType: (type: string): void => {
    const r = getRiver();
    if (!r) return;
    if (patchRiver({ riverId: r.i, type })) updateRiverData();
  },

  generateNameCulture: (): void => {
    const r = getRiver();
    if (!r) return;
    const name = GenerationPipeline.Rivers.getName(r.mouth);
    if (patchRiver({ riverId: r.i, name })) updateRiverData();
  },

  generateNameRandom: (): void => {
    const r = getRiver();
    if (!r) return;
    const name = GenerationPipeline.Names.getBase(rand(worldContext.nameBases.length - 1));
    if (patchRiver({ riverId: r.i, name })) updateRiverData();
  },

  changeParent: (parentIdStr: string): void => {
    const r = getRiver();
    if (!r) return;
    if (patchRiver({ riverId: r.i, parentId: +parentIdStr })) updateRiverData();
  },

  changeSourceWidth: (width: number): void => {
    const r = getRiver();
    if (!r) return;
    if (patchRiver({ riverId: r.i, sourceWidth: width })) redrawRiver();
  },

  changeWidthFactor: (factor: number): void => {
    const r = getRiver();
    if (!r) return;
    if (patchRiver({ riverId: r.i, widthFactor: factor })) redrawRiver();
  },

  changeSourceElevation: (elevation: number): void => {
    const r = getRiver();
    if (!r || !Number.isFinite(elevation)) return;
    if (patchRiver({ riverId: r.i, sourceElevation: elevation })) updateRiverData();
  },

  changeSourceWaterTemperature: (temperature: number): void => {
    const r = getRiver();
    if (!r || !Number.isFinite(temperature)) return;
    if (patchRiver({ riverId: r.i, sourceWaterTemperature: temperature })) updateRiverData();
  },

  createRiver: (): void => {
    createRiver();
  },

  editStyle: (): void => {
    editStyle("rivers");
  },

  showRiverElevationProfile: (): void => {
    const pts = view.debug
      .selectAll<Element, [number, number]>("#controlPoints > *")
      .data()
      .map(([x, y]) => findCell(x, y));
    const r = getRiver();
    if (!r) return;
    const riverLen = rn(r.length * worldContext.distanceScale);
    openElevationProfile(pts, riverLen, true);
  },

  editRiverLegend: (): void => {
    const r = getRiver();
    if (!r) return;
    editNotes(`river${r.i}`, `${r.name} ${r.type}`);
  },

  removeRiver: (): void => {
    openConfirm("Are you sure you want to remove the river and all its tributaries", {
      title: "Remove river and tributaries",
      confirm: "Remove",
      onConfirm: () => {
        const r = getRiver();
        const commit = r ? removeRiver({ riverId: r.i }) : null;
        if (commit) removeRivers(viewContext, [...commit.result.riverIds]);
        closeDialog("riverEditor");
      }
    });
  }
};

export function editRiver(id: string): void {
  if (view.customization) return;
  const riverId = Number(id.replace(/^river/, ""));
  if (!Number.isInteger(riverId) || !worldContext.pack.rivers.some(river => river.i === riverId)) return;
  if (selectedRiverId === riverId) return;
  closeDialogs(".stable");
  if (!layerIsOn("toggleRivers")) toggleRivers();

  cellsWasForced = !layerIsOn("toggleCells");
  if (cellsWasForced) toggleCells();

  selectedRiverId = riverId;
  selectedRiverPath = view.rivers.select<SVGPathElement>(`#${id}`).node() ?? null;
  if (selectedRiverPath) {
    setElSelected(select(selectedRiverPath).on("click", addControlPoint) as typeof elSelected);
  } else {
    setElSelected(null);
  }

  tip(
    "Drag control points to change the river course. Click on point to remove it. Click on river to add additional control point. For major changes please create a new river instead",
    true
  );
  view.debug.append("g").attr("id", "controlCells");
  view.debug.append("g").attr("id", "controlPoints");

  updateRiverData();

  const river = getRiver();
  if (river) {
    const { cells: riverCells, points } = river;
    const riverPoints = GenerationPipeline.Rivers.getRiverPoints(riverCells, points ?? null) as [number, number][];
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
