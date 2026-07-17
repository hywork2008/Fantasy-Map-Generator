import { type D3DragEvent, drag, mean, min, polygonLength, select } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";

import {
  BiomesRenderer,
  BordersRenderer,
  CulturesRenderer,
  FeaturesRenderer,
  ProvincesRenderer,
  ReligionsRenderer,
  StatesRenderer
} from "../renderers";
import { getFeaturePath } from "../renderers/index";
import { moveFeatureVertex, patchFeature } from "../runtime/worldRuntime";
import { GenerationPipeline } from "../services/generationPipeline";
import { tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { modules, setElSelected } from "../store/editorState";
import { getLakeEditorState } from "../store/lakeEditorState";
import type { PackedGraphFeature } from "../types/models";
import { closeDialogs, openConfirm, openDialog } from "../ui/dialogs/dialogService";
import { rn, unique } from "../utils";
import { debounce } from "../utils/commonUtils";
import { getArea } from "../utils/domUtils";
import { EditorBus } from "../utils/editorBus";
import { getPackPolygon } from "../utils/graphUtils";
import { generateRandomName } from "../utils/nameGenerator";
import { getElementBySelector, layerIsOn } from "../utils/nodeUtils";
import { interactionManager } from "./interactionManager";
import { drawLayers, toggleCells } from "./layers";
import { editNotes } from "./notes-editor";
import { editStyle } from "./style";

// Recoloring land fills (states/provinces/biomes/...) after a lake shape change is expensive, so
// during a drag it's throttled via debounce rather than run on every tick; the un-debounced call
// in handleVertexDragEnd guarantees the final position is always accurate.
const DRAG_LAND_FILL_REDRAW_MS = 50;
const DEFAULT_LAKE_GROUPS = ["freshwater", "salt", "sinkhole", "frozen", "lava", "dry"];
let selectedLakeId: number | null = null;

function getLake(): PackedGraphFeature {
  if (selectedLakeId === null) throw new Error("Lake editor has no selected feature");
  const lake = worldContext.pack.features.find(feature => feature.i === selectedLakeId && feature.type === "lake");
  if (!lake) throw new Error(`Lake editor could not find lake ${selectedLakeId}`);
  return lake;
}

function getLakeGroup(lake: PackedGraphFeature = getLake()): string {
  return lake.group || "freshwater";
}

function updateLakeValues(): void {
  const { cells, vertices, rivers } = worldContext.pack;
  const l = getLake();

  const length = polygonLength(l.vertices!.map((v: number) => vertices.p[v]));
  const lakeCells = Array.from(cells.i.filter(i => cells.f[i] === l.i));
  const heights = lakeCells.map(i => cells.h[i]);

  const inletsRaw = l.inlets?.map((inlet: number) => rivers.find(river => river.i === inlet)?.name) ?? [];
  const inlets = inletsRaw.filter((name): name is string => name !== undefined);
  const outlet = l.outlet ? rivers.find(river => river.i === l.outlet)?.name : null;

  getLakeEditorState().setLakeData({
    id: l.i,
    name: l.name ?? "",
    group: getLakeGroup(l),
    area: getArea(l.area!),
    shoreLength: length * worldContext.distanceScale,
    elevation: l.height ?? 0,
    averageDepth: mean(heights) ?? 0,
    maxDepth: min(heights) ?? 0,
    flux: l.flux ?? 0,
    evaporation: l.evaporation ?? 0,
    inlets,
    outlet: outlet ?? null
  });
}

function updateLakeGroups(): void {
  const groups = new Set(DEFAULT_LAKE_GROUPS);
  for (const feature of worldContext.pack.features) {
    if (feature?.type === "lake" && feature.group) groups.add(feature.group);
  }
  getLakeEditorState().setGroups([...groups]);
}

export function editLake(event?: MouseEvent): void {
  const node = (event?.target ?? getElementBySelector<SVGElement>(".lakes path")) as SVGElement;
  const featureId = Number(node?.getAttribute("data-f"));
  if (!Number.isInteger(featureId)) return;
  openLakeEditor(featureId, node, event);
}

/** Opens the Lake Editor for a feature id, without depending on a clicked SVG element (WebGL pick). */
export function editLakeById(featureId: number): void {
  openLakeEditor(featureId);
}

function openLakeEditor(featureId: number, node?: SVGElement, event?: MouseEvent): void {
  if (view.customization) return;
  if (!worldContext.pack.features.some(feature => feature.i === featureId && feature.type === "lake")) return;
  closeDialogs(".stable");
  if (layerIsOn("toggleCells")) toggleCells();

  openDialog("lakeEditor", {
    title: "Edit Lake",
    resizable: false,
    position: { my: "center top+20", at: "top", of: event ?? "#map", collision: "fit" },
    onClose: closeLakesEditor
  });

  view.debug.append("g").attr("id", "vertices");
  selectedLakeId = featureId;
  setElSelected(node ? select(node as Element) : null);

  updateLakeValues();
  updateLakeGroups();
  drawLakeVertices();

  interactionManager.setMouseMoveHandler(null);

  if (modules.editLake) return;
  modules.editLake = true;
}

function drawLakeVertices(): void {
  const feature = getLake();
  const verts = feature.vertices!;

  const neibCells = unique(verts.flatMap((v: number) => worldContext.pack.vertices.c[v]));
  view.debug
    .select("#vertices")
    .selectAll("polygon")
    .data(neibCells)
    .enter()
    .append("polygon")
    .attr("points", (d: number) => getPackPolygon(d, worldContext.pack).join(" "))
    .attr("data-c", (d: number) => d);

  view.debug
    .select("#vertices")
    .selectAll("circle")
    .data(verts)
    .enter()
    .append("circle")
    .attr("cx", (d: number) => worldContext.pack.vertices.p[d][0])
    .attr("cy", (d: number) => worldContext.pack.vertices.p[d][1])
    .attr("r", 0.4)
    .attr("data-v", (d: number) => d)
    .call(drag<SVGCircleElement, number>().on("drag", handleVertexDrag).on("end", handleVertexDragEnd))
    .on("mousemove", () =>
      tip("Drag to move the vertex. Please use for fine-tuning only! Edit heightmap to change actual cell heights")
    );
}

function handleVertexDrag(this: SVGCircleElement, event: D3DragEvent<SVGCircleElement, unknown, unknown>): void {
  const x = rn(event.x, 2);
  const y = rn(event.y, 2);
  this.setAttribute("cx", String(x));
  this.setAttribute("cy", String(y));

  const vertexId = select(this).datum() as number;
  const feature = getLake();
  if (!moveFeatureVertex({ featureId: feature.i, vertexId, x, y })) return;
  view.defs
    .select(`#featurePaths > path#feature_${feature.i}`)
    .attr("d", getFeaturePath(worldContext, viewContext, appServices, feature));

  // Update Zustand state
  getLakeEditorState().updateLakeData({ area: getArea(feature.area!) });

  view.debug
    .select("#vertices")
    .selectAll("polygon")
    .attr("points", (d: unknown) => getPackPolygon(d as number, worldContext.pack).join(" "));

  redrawLandFillsDebounced();
}

function redrawLandFills(): void {
  if (layerIsOn("toggleStates")) StatesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBiomes")) BiomesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleReligions")) ReligionsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCultures")) CulturesRenderer.render(worldContext, viewContext, appServices);

  // In webgl hybrid mode the lake fill is a deck.gl polygon layer, not the SVG #lakes/#water mask
  // touched above; its data must be rebuilt for the moved vertex to show live instead of only
  // appearing after the editor closes.
  if (viewContext.renderMode === "webglHybrid") {
    drawLayers();
  }
}

const redrawLandFillsDebounced = debounce(redrawLandFills, DRAG_LAND_FILL_REDRAW_MS);

function handleVertexDragEnd(): void {
  redrawLandFills();
}

function closeLakesEditor(): void {
  view.debug.select("#vertices").remove();
  selectedLakeId = null;
  EditorBus.unselect();
  modules.editLake = false;
  getLakeEditorState().setLakeData(null);
}

// ─── Exported Actions for React Bridge ──────────────────────────────────────

export const lakeEditorActions = {
  changeName(newName: string): void {
    const lake = getLake();
    if (patchFeature({ featureId: lake.i, name: newName })) getLakeEditorState().updateLakeData({ name: newName });
  },

  generateNameCulture(): void {
    const lake = getLake();
    const newName = GenerationPipeline.Lakes.getName(lake);
    if (patchFeature({ featureId: lake.i, name: newName })) getLakeEditorState().updateLakeData({ name: newName });
  },

  generateNameRandom(): void {
    const lake = getLake();
    const newName = generateRandomName();
    if (patchFeature({ featureId: lake.i, name: newName })) getLakeEditorState().updateLakeData({ name: newName });
  },

  changeLakeGroup(newGroup: string): void {
    const lake = getLake();
    if (newGroup && patchFeature({ featureId: lake.i, group: newGroup })) {
      getLakeEditorState().updateLakeData({ group: newGroup });
      updateLakeGroups();
      refreshLakePresentation();
    }
  },

  createNewGroup(newGroupName: string): void {
    if (!newGroupName) {
      tip("Please provide a valid group name");
      return;
    }
    const group = newGroupName
      .toLowerCase()
      .replace(/ /g, "_")
      .replace(/[^\w\s]/gi, "");

    if (getLakeEditorState().groups.includes(group)) {
      tip("Element with this id already exists. Please provide a unique name", false, "error");
      return;
    }

    if (Number.isFinite(+group.charAt(0))) {
      tip("Group name should start with a letter", false, "error");
      return;
    }

    lakeEditorActions.changeLakeGroup(group);
    getLakeEditorState().setIsNewGroupInputOpen(false);
  },

  removeLakeGroup(): void {
    const group = getLakeGroup();
    if (DEFAULT_LAKE_GROUPS.includes(group)) {
      tip("This is one of the default groups, it cannot be removed", false, "error");
      return;
    }

    const lakesInGroup = worldContext.pack.features.filter(
      feature => feature?.type === "lake" && feature.group === group
    );
    openConfirm(
      `Are you sure you want to remove the group? All lakes of the group (${lakesInGroup.length}) will be turned into Freshwater`,
      {
        title: "Remove lake group",
        confirm: "Remove",
        onConfirm: () => {
          for (const lake of lakesInGroup) patchFeature({ featureId: lake.i, group: "freshwater" });
          getLakeEditorState().updateLakeData({ group: "freshwater" });
          updateLakeGroups();
          refreshLakePresentation();
        }
      }
    );
  },

  editGroupStyle(): void {
    editStyle("lakes", getLakeGroup());
  },

  editLakeLegend(): void {
    const lake = getLake();
    const id = `lake${lake.i}`;
    editNotes(id, `${lake.name ?? id} ${getLakeGroup(lake)} lake`);
  }
};

function refreshLakePresentation(): void {
  if (viewContext.renderMode === "webglHybrid") drawLayers();
  else FeaturesRenderer.render(worldContext, viewContext, appServices);
}

export function initLakesEditor(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}
