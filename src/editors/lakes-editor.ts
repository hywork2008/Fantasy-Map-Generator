import { type D3DragEvent, drag, mean, min, polygonArea, polygonLength, type Selection, select } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { interactionManager } from "../controllers/interactionManager";
import { toggleCells } from "../controllers/layers";
import { editStyle } from "../controllers/style";
import { Lakes } from "../modules/lakes";
import { Names } from "../modules/names-generator";
import {
  BiomesRenderer,
  BordersRenderer,
  CulturesRenderer,
  ProvincesRenderer,
  ReligionsRenderer,
  StatesRenderer
} from "../renderers";
import { getFeaturePath } from "../renderers/index";
import { elSelected, modules, setElSelected } from "../store/editorState";
import { getLakeEditorState } from "../store/lakeEditorState";
import type { PackedGraphFeature } from "../types/models";
import { closeDialogs, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { rand, rn, unique } from "../utils";
import { alertMessage } from "../utils/alertMessageEl";
import { EditorBus } from "../utils/editorBus";
import { getPackPolygon } from "../utils/graphUtils";
import { layerIsOn } from "../utils/nodeUtils";
import { getArea, tip } from "../utils/uiHelpers";
import { editNotes } from "./notes-editor";

function getLake(): PackedGraphFeature {
  const lakeId = +elSelected!.attr("data-f");
  return worldContext.pack.features.find(feature => feature.i === lakeId)!;
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
    group: l.group,
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
  const groups: string[] = [];
  (viewContext.lakes as Selection<SVGGElement, unknown, null, undefined>).selectAll("g").each(function () {
    groups.push((this as SVGGElement).id);
  });
  getLakeEditorState().setGroups(groups);
}

export function editLake(event?: MouseEvent): void {
  if (viewContext.customization) return;
  closeDialogs(".stable");
  if (layerIsOn("toggleCells")) toggleCells();

  openDialog("lakeEditor", {
    title: "Edit Lake",
    resizable: false,
    position: { my: "center top+20", at: "top", of: event, collision: "fit" },
    onClose: closeLakesEditor
  });

  const node = (event?.target ?? document.querySelector(".lakes path")) as SVGElement;
  viewContext.debug.append("g").attr("id", "vertices");
  setElSelected(select(node as Element));

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
  viewContext.debug
    .select("#vertices")
    .selectAll("polygon")
    .data(neibCells)
    .enter()
    .append("polygon")
    .attr("points", (d: number) => getPackPolygon(d, worldContext.pack).join(" "))
    .attr("data-c", (d: number) => d);

  viewContext.debug
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
  worldContext.pack.vertices.p[vertexId] = [x, y];

  const feature = getLake();
  viewContext.defs
    .select(`#featurePaths > path#feature_${feature.i}`)
    .attr("d", getFeaturePath(worldContext, viewContext, appServices, feature));

  const points = feature.vertices!.map((vertex: number) => worldContext.pack.vertices.p[vertex]);
  feature.area = Math.abs(polygonArea(points));

  // Update Zustand state
  getLakeEditorState().updateLakeData({ area: getArea(feature.area!) });

  viewContext.debug
    .select("#vertices")
    .selectAll("polygon")
    .attr("points", (d: unknown) => getPackPolygon(d as number, worldContext.pack).join(" "));
}

function handleVertexDragEnd(): void {
  if (layerIsOn("toggleStates")) StatesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleProvinces")) ProvincesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBorders")) BordersRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleBiomes")) BiomesRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleReligions")) ReligionsRenderer.render(worldContext, viewContext, appServices);
  if (layerIsOn("toggleCultures")) CulturesRenderer.render(worldContext, viewContext, appServices);
}

function closeLakesEditor(): void {
  viewContext.debug.select("#vertices").remove();
  EditorBus.unselect();
  modules.editLake = false;
  getLakeEditorState().setLakeData(null);
}

// ─── Exported Actions for React Bridge ──────────────────────────────────────

export const lakeEditorActions = {
  changeName(newName: string): void {
    const lake = getLake();
    lake.name = newName;
    getLakeEditorState().updateLakeData({ name: newName });
  },

  generateNameCulture(): void {
    const lake = getLake();
    const newName = Lakes.getName(lake);
    lake.name = newName;
    getLakeEditorState().updateLakeData({ name: newName });
  },

  generateNameRandom(): void {
    const lake = getLake();
    const newName = Names.getBase(rand(worldContext.nameBases.length - 1));
    lake.name = newName;
    getLakeEditorState().updateLakeData({ name: newName });
  },

  changeLakeGroup(newGroup: string): void {
    const lake = getLake();
    const groupEl = document.getElementById(newGroup);
    if (groupEl && elSelected) {
      groupEl.appendChild(elSelected.node()!);
      lake.group = newGroup;
      getLakeEditorState().updateLakeData({ group: newGroup });
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

    if (document.getElementById(group)) {
      tip("Element with this id already exists. Please provide a unique name", false, "error");
      return;
    }

    if (Number.isFinite(+group.charAt(0))) {
      tip("Group name should start with a letter", false, "error");
      return;
    }

    const oldGroup = elSelected!.node()!.parentNode as SVGGElement;
    const basicGroups = ["freshwater", "salt", "sinkhole", "frozen", "lava", "dry"];
    const basic = basicGroups.includes(oldGroup.id);

    if (!basic && oldGroup.childElementCount === 1) {
      oldGroup.id = group;
      updateLakeGroups();
      getLakeEditorState().updateLakeData({ group });
      return;
    }

    const newGroup = oldGroup.cloneNode(false) as SVGGElement;
    newGroup.id = group;
    document.getElementById("lakes")?.appendChild(newGroup);
    document.getElementById(group)?.appendChild(elSelected!.node()!);

    updateLakeGroups();
    getLakeEditorState().updateLakeData({ group });
  },

  removeLakeGroup(): void {
    const group = (elSelected!.node()!.parentNode as SVGGElement).id;
    const basicGroups = ["freshwater", "salt", "sinkhole", "frozen", "lava", "dry"];
    if (basicGroups.includes(group)) {
      tip("This is one of the default groups, it cannot be removed", false, "error");
      return;
    }

    const count = (elSelected!.node()!.parentNode as SVGGElement).childElementCount;
    alertMessage.innerHTML = /* html */ `Are you sure you want to remove the group? All lakes of the group (${count}) will be turned into Freshwater`;
    openRichDialog({
      content: alertMessage.innerHTML,
      resizable: false,
      title: "Remove lake group",
      width: "26em",
      buttons: {
        Remove: () => {
          const freshwater = document.getElementById("freshwater");
          const groupEl = document.getElementById(group);
          if (groupEl && freshwater) {
            while (groupEl.childNodes.length) {
              freshwater.appendChild(groupEl.childNodes[0]);
            }
            groupEl.remove();

            updateLakeGroups();
            lakeEditorActions.changeLakeGroup("freshwater");
          }
        },
        Cancel: () => {}
      }
    });
  },

  editGroupStyle(): void {
    const g = (elSelected!.node()!.parentNode as SVGGElement).id;
    editStyle("lakes", g);
  },

  editLakeLegend(): void {
    const id = elSelected!.attr("id");
    const lake = getLake();
    editNotes(id, `${lake.name ?? id} ${lake.group} lake`);
  }
};

export function initLakesEditor(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}
