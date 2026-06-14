import { curveCatmullRom, type D3DragEvent, drag, pointer, select } from "d3";
import type { WorldContext } from "../context/worldContext";
import type { River } from "../modules/river-generator";
import { Rivers } from "../modules/river-generator";
import type { TypedArray } from "../types/PackedGraph";
import { ensureEl, findCell, getSegmentId, rand, rn } from "../utils";
import { getPackPolygon } from "../utils/graphUtils";
import { editNotes } from "./notes-editor";

let worldContext: WorldContext;

export function editRiver(id: string): void {
  if (customization) return;
  if (elSelected && id === elSelected.attr("id")) return;
  closeDialogs(".stable");
  if (!layerIsOn("toggleRivers")) toggleRivers();

  ensureEl("toggleCells").dataset.forced = String(+!layerIsOn("toggleCells"));
  if (!layerIsOn("toggleCells")) toggleCells();

  elSelected = select<SVGPathElement, unknown>(`#${id}`).on("click", addControlPoint) as unknown as typeof elSelected;

  tip(
    "Drag control points to change the river course. Click on point to remove it. Click on river to add additional control point. For major changes please create a new river instead",
    true
  );
  debug.append("g").attr("id", "controlCells");
  debug.append("g").attr("id", "controlPoints");

  updateRiverData();

  const river = getRiver();
  const { cells: riverCells, points } = river;
  const riverPoints = Rivers.getRiverPoints(riverCells, points ?? null) as [number, number][];
  drawControlPoints(riverPoints);
  drawRiverCells(riverCells);

  $("#riverEditor").dialog({
    title: "Edit River",
    resizable: false,
    position: { my: "left top", at: "left+10 top+10", of: "#map" },
    close: closeRiverEditor
  });

  if (modules.editRiver) return;
  modules.editRiver = true;

  // add listeners
  ensureEl("riverCreateSelectingCells").on("click", createRiver);
  ensureEl("riverEditStyle").on("click", () => editStyle("rivers"));
  ensureEl("riverElevationProfile").on("click", showRiverElevationProfile);
  ensureEl("riverLegend").on("click", editRiverLegend);
  ensureEl("riverRemove").on("click", removeRiver);
  ensureEl("riverName").on("input", changeName);
  ensureEl("riverType").on("input", changeType);
  ensureEl("riverNameCulture").on("click", generateNameCulture);
  ensureEl("riverNameRandom").on("click", generateNameRandom);
  ensureEl("riverMainstem").on("change", changeParent);
  ensureEl("riverSourceWidth").on("input", changeSourceWidth);
  ensureEl("riverWidthFactor").on("input", changeWidthFactor);

  function getRiver(): River {
    const riverId = +elSelected!.attr("id").slice(5);
    return pack.rivers.find(r => r.i === riverId)!;
  }

  function updateRiverData(): void {
    const r = getRiver();

    (ensureEl("riverName") as HTMLInputElement).value = r.name;
    (ensureEl("riverType") as HTMLInputElement).value = r.type;

    const parentSelect = ensureEl<HTMLSelectElement>("riverMainstem");
    parentSelect.options.length = 0;
    const parent = r.parent || r.i;
    const sortedRivers = pack.rivers.slice().sort((a: River, b: River) => (a.name > b.name ? 1 : -1));
    sortedRivers.forEach((river: River) => {
      const opt = new Option(river.name, String(river.i), false, river.i === parent);
      parentSelect.options.add(opt);
    });
    ensureEl("riverBasin").textContent = pack.rivers.find((river: River) => river.i === r.basin)?.name ?? "";

    ensureEl("riverDischarge").textContent = `${r.discharge} m³/s`;
    (ensureEl("riverSourceWidth") as HTMLInputElement).value = String(r.sourceWidth);
    (ensureEl("riverWidthFactor") as HTMLInputElement).value = String(r.widthFactor);

    updateRiverLength(r);
    updateRiverWidth(r);
  }

  function updateRiverLength(river: River): void {
    river.length = rn((elSelected!.node() as unknown as SVGPathElement).getTotalLength() / 2, 2);
    const lengthUI = `${rn(river.length * distanceScale)} ${distanceUnitInput.value}`;
    ensureEl("riverLength").textContent = lengthUI;
  }

  function updateRiverWidth(river: River): void {
    const { cells: riverCells, discharge, widthFactor, sourceWidth } = river;
    const meanderedPoints = Rivers.addMeandering(riverCells);
    river.width = Rivers.getWidth(
      Rivers.getOffset({
        flux: discharge,
        pointIndex: meanderedPoints.length,
        widthFactor,
        startingWidth: sourceWidth
      })
    );

    const width = `${rn(river.width * distanceScale, 3)} ${distanceUnitInput.value}`;
    ensureEl("riverWidth").textContent = width;
  }

  function drawControlPoints(pts: [number, number][]): void {
    debug
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
    const validCells = [...new Set(cellList)].filter(i => pack.cells.i[i]);
    debug
      .select("#controlCells")
      .selectAll("polygon")
      .data(validCells)
      .join("polygon")
      .attr("points", (d: number) => getPackPolygon(d, worldContext.pack).join(" "));
  }

  let _rInitCell = 0,
    _rMovedToCell: number | null = null,
    _rRiver: River | null = null,
    _rFlCells: TypedArray | null = null;

  function dragControlPointStart(
    this: SVGCircleElement,
    event: D3DragEvent<SVGCircleElement, [number, number], unknown>
  ): void {
    _rRiver = getRiver();
    _rFlCells = pack.cells.fl;
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
    const { r } = pack.cells;
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
    river.points = debug.selectAll("#controlPoints > *").data() as [number, number][];
    river.cells = river.points.map(([x, y]) => findCell(x, y));

    lineGen.curve(curveCatmullRom.alpha(0.1));
    const meanderedPoints = Rivers.addMeandering(river.cells, river.points);
    const path = Rivers.getRiverPath(meanderedPoints, river.widthFactor, river.sourceWidth);
    elSelected!.attr("d", path);

    updateRiverLength(river);
    if ((ensureEl("elevationProfile") as HTMLElement).offsetParent) showRiverElevationProfile();
  }

  function addControlPoint(this: SVGPathElement, event: MouseEvent): void {
    const [x, y] = pointer(event, this);
    const point: [number, number] = [rn(x, 1), rn(y, 1)];

    const river = getRiver();
    if (!river.points) river.points = debug.selectAll("#controlPoints > *").data() as [number, number][];

    const index = getSegmentId(river.points, point, 2);
    river.points.splice(index, 0, point);
    drawControlPoints(river.points);
    redrawRiver();
  }

  function removeControlPoint(this: SVGCircleElement): void {
    this.remove();
    redrawRiver();

    const { cells: riverCells } = getRiver();
    drawRiverCells(riverCells);
  }

  function changeName(this: HTMLInputElement): void {
    getRiver().name = this.value;
  }

  function changeType(this: HTMLInputElement): void {
    getRiver().type = this.value;
  }

  function generateNameCulture(): void {
    const r = getRiver();
    r.name = (ensureEl("riverName") as HTMLInputElement).value = Rivers.getName(r.mouth);
  }

  function generateNameRandom(): void {
    const r = getRiver();
    if (r) r.name = (ensureEl("riverName") as HTMLInputElement).value = Names.getBase(rand(nameBases.length - 1));
  }

  function changeParent(this: HTMLSelectElement): void {
    const r = getRiver();
    r.parent = +this.value;
    r.basin = pack.rivers.find((river: River) => river.i === r.parent)?.basin ?? r.i;
    ensureEl("riverBasin").textContent = pack.rivers.find((river: River) => river.i === r.basin)?.name ?? "";
  }

  function changeSourceWidth(this: HTMLInputElement): void {
    const river = getRiver();
    river.sourceWidth = +this.value;
    updateRiverWidth(river);
    redrawRiver();
  }

  function changeWidthFactor(this: HTMLInputElement): void {
    const river = getRiver();
    river.widthFactor = +this.value;
    updateRiverWidth(river);
    redrawRiver();
  }

  function showRiverElevationProfile(): void {
    const pts = debug
      .selectAll<Element, [number, number]>("#controlPoints > *")
      .data()
      .map(([x, y]) => findCell(x, y));
    const river = getRiver();
    const riverLen = rn(river.length * distanceScale);
    ElevationProfile.open(pts, riverLen, true);
  }

  function editRiverLegend(): void {
    const rid = elSelected!.attr("id");
    const river = getRiver();
    editNotes(rid, `${river.name} ${river.type}`);
  }

  function removeRiver(): void {
    alertMessage.innerHTML = "Are you sure you want to remove the river and all its tributaries";
    $("#alert").dialog({
      resizable: false,
      width: "22em",
      title: "Remove river and tributaries",
      buttons: {
        Remove: function () {
          $(this).dialog("close");
          const river = +elSelected!.attr("id").slice(5);
          Rivers.remove(river);
          elSelected!.remove();
          $("#riverEditor").dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  function closeRiverEditor(): void {
    debug.select("#controlPoints").remove();
    debug.select("#controlCells").remove();

    elSelected?.on("click", null);
    unselect();
    clearMainTip();

    const forced = +ensureEl("toggleCells").dataset.forced!;
    ensureEl("toggleCells").dataset.forced = "0";
    if (forced && layerIsOn("toggleCells")) toggleCells();
  }
}

export function initRiversEditor(wc: WorldContext) {
  worldContext = wc;
}
