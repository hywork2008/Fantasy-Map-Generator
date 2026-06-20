import { type D3DragEvent, drag, mean, min, polygonArea, polygonLength, type Selection, select } from "d3";
import type { AppServices } from "../context/appServices";
import { appServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import { viewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { worldContext } from "../context/worldContext";
import { unselect } from "../controllers/editors";
import { interactionManager } from "../controllers/interactionManager";
import { layerIsOn, toggleCells } from "../controllers/layers";
import { editStyle } from "../controllers/style";
import type { PackedGraphFeature } from "../modules/features";
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
import { closeDialogs, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { ensureEl, rand, rn, si, unique } from "../utils";
import { alertMessage } from "../utils/alertMessageEl";
import { getPackPolygon } from "../utils/graphUtils";
import { getArea, getAreaUnit, getHeight, tip } from "../utils/uiHelpers";
import { editNotes } from "./notes-editor";

export function editLake(event?: MouseEvent): void {
  if (viewContext.customization) return;
  closeDialogs(".stable");
  if (layerIsOn("toggleCells")) toggleCells();

  openDialog("lakeEditor", {
    title: "Edit Lake",
    resizable: false,
    position: { my: "center top+20", at: "top", of: event, collision: "fit" },
    close: closeLakesEditor
  });

  const node = (event?.target ?? document.querySelector(".lakes path")) as SVGElement;
  viewContext.debug.append("g").attr("id", "vertices");
  elSelected = select(node as Element);
  updateLakeValues();
  selectLakeGroup();
  drawLakeVertices();
  interactionManager.setMouseMoveHandler(null);

  if (modules.editLake) return;
  modules.editLake = true;

  // add listeners
  ensureEl("lakeName").addEventListener("input", changeName);
  ensureEl("lakeNameCulture").addEventListener("click", generateNameCulture);
  ensureEl("lakeNameRandom").addEventListener("click", generateNameRandom);
  ensureEl("lakeGroup").addEventListener("change", changeLakeGroup);
  ensureEl("lakeGroupAdd").addEventListener("click", toggleNewGroupInput);
  ensureEl("lakeGroupName").addEventListener("change", createNewGroup);
  ensureEl("lakeGroupRemove").addEventListener("click", removeLakeGroup);
  ensureEl("lakeEditStyle").addEventListener("click", editGroupStyle);
  ensureEl("lakeLegend").addEventListener("click", editLakeLegend);

  function getLake(): PackedGraphFeature {
    const lakeId = +elSelected!.attr("data-f");
    return worldContext.pack.features.find(feature => feature.i === lakeId)!;
  }

  function updateLakeValues(): void {
    const { cells, vertices, rivers } = worldContext.pack;

    const l = getLake();
    (ensureEl("lakeName") as HTMLInputElement).value = l.name ?? "";
    ensureEl("lakeArea").textContent = `${si(getArea(l.area!))} ${getAreaUnit()}`;

    const length = polygonLength(l.vertices!.map((v: number) => vertices.p[v]));
    ensureEl("lakeShoreLength").textContent = `${si(length * worldContext.distanceScale)} ${distanceUnitInput.value}`;

    const lakeCells = Array.from(cells.i.filter(i => cells.f[i] === l.i));
    const heights = lakeCells.map(i => cells.h[i]);

    ensureEl("lakeElevation").textContent = getHeight(l.height ?? 0);
    ensureEl("lakeAverageDepth").textContent = getHeight(mean(heights) ?? 0, "abs");
    ensureEl("lakeMaxDepth").textContent = getHeight(min(heights) ?? 0, "abs");

    ensureEl("lakeFlux").textContent = String(l.flux ?? 0);
    ensureEl("lakeEvaporation").textContent = String(l.evaporation ?? 0);

    const inlets = l.inlets?.map((inlet: number) => rivers.find(river => river.i === inlet)?.name);
    const outlet = l.outlet ? rivers.find(river => river.i === l.outlet)?.name : "no";
    const inletsEl = ensureEl("lakeInlets") as HTMLElement;
    inletsEl.textContent = inlets ? String(inlets.length) : "no";
    inletsEl.title = inlets ? (inlets as string[]).join(", ") : "";
    ensureEl("lakeOutlet").textContent = outlet ?? "no";
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
    ensureEl("lakeArea").textContent = `${si(getArea(feature.area!))} ${getAreaUnit()}`;

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

  function changeName(this: HTMLInputElement): void {
    getLake().name = this.value;
  }

  function generateNameCulture(): void {
    const lake = getLake();
    lake.name = (ensureEl("lakeName") as HTMLInputElement).value = Lakes.getName(lake);
  }

  function generateNameRandom(): void {
    const lake = getLake();
    lake.name = (ensureEl("lakeName") as HTMLInputElement).value = Names.getBase(
      rand(worldContext.nameBases.length - 1)
    );
  }

  function selectLakeGroup(): void {
    const lake = getLake();
    const select = ensureEl<HTMLSelectElement>("lakeGroup");
    select.options.length = 0;
    (viewContext.lakes as Selection<SVGGElement, unknown, null, undefined>).selectAll("g").each(function () {
      const g = this as SVGGElement;
      select.options.add(new Option(g.id, g.id, false, g.id === lake.group));
    });
  }

  function changeLakeGroup(this: HTMLSelectElement): void {
    ensureEl(this.value).appendChild(elSelected!.node()!);
    getLake().group = this.value;
  }

  function toggleNewGroupInput(): void {
    const lakeGroupName = ensureEl("lakeGroupName") as HTMLElement;
    const lakeGroup = ensureEl("lakeGroup") as HTMLElement;
    if (lakeGroupName.style.display === "none") {
      lakeGroupName.style.display = "inline-block";
      (lakeGroupName as HTMLInputElement).focus?.();
      lakeGroup.style.display = "none";
    } else {
      lakeGroupName.style.display = "none";
      lakeGroup.style.display = "inline-block";
    }
  }

  function createNewGroup(this: HTMLInputElement): void {
    if (!this.value) {
      tip("Please provide a valid group name");
      return;
    }
    const group = this.value
      .toLowerCase()
      .replace(/ /g, "_")
      .replace(/[^\w\s]/gi, "");

    if (ensureEl(group)) {
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
      ensureEl<HTMLSelectElement>("lakeGroup").selectedOptions[0].remove();
      ensureEl<HTMLSelectElement>("lakeGroup").options.add(new Option(group, group, false, true));
      oldGroup.id = group;
      toggleNewGroupInput();
      (ensureEl("lakeGroupName") as HTMLInputElement).value = "";
      return;
    }

    const newGroup = elSelected!.node()!.parentNode!.cloneNode(false) as SVGGElement;
    ensureEl("lakes").appendChild(newGroup);
    newGroup.id = group;
    ensureEl<HTMLSelectElement>("lakeGroup").options.add(new Option(group, group, false, true));
    ensureEl(group).appendChild(elSelected!.node()!);

    toggleNewGroupInput();
    (ensureEl("lakeGroupName") as HTMLInputElement).value = "";
  }

  function removeLakeGroup(): void {
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
          /* $(this).dialog("close") removed */
          const freshwater = ensureEl("freshwater");
          const groupEl = ensureEl(group);
          while (groupEl.childNodes.length) {
            freshwater.appendChild(groupEl.childNodes[0]);
          }
          groupEl.remove();
          ensureEl<HTMLSelectElement>("lakeGroup").selectedOptions[0].remove();
          (ensureEl("lakeGroup") as HTMLSelectElement).value = "freshwater";
        },
        Cancel: () => {
          /* $(this).dialog("close") removed */
        }
      }
    });
  }

  function editGroupStyle(): void {
    const g = (elSelected!.node()!.parentNode as SVGGElement).id;
    editStyle("lakes", g);
  }

  function editLakeLegend(): void {
    const id = elSelected!.attr("id");
    const lake = getLake();
    const lakeGroup = ensureEl<HTMLSelectElement>("lakeGroup");
    editNotes(id, `${lake.name ?? id} ${lakeGroup.value} lake`);
  }

  function closeLakesEditor(): void {
    viewContext.debug.select("#vertices").remove();
    unselect();
    modules.editLake = false;
  }
}

export function initLakesEditor(_wc: WorldContext, _vc: Readonly<ViewContext>, _as: AppServices) {}
