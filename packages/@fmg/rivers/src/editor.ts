"use strict";
import { Rivers } from "@fmg/rivers";
import type { River } from "@fmg/rivers";
import { layerIsOn, toggleCells, toggleRivers } from "@legacy-ui-runtime/modules/ui/layers";
import { closeDialogs, unselect } from "@legacy-ui-runtime/modules/ui/editors";
import { clearMainTip, tip } from "@legacy-ui-runtime/modules/ui/general";
import { editNotes } from "@legacy-ui-runtime/modules/ui/notes-editor";
import { editStyle } from "@legacy-ui-runtime/modules/ui/style";

class RiverEditor {
  public open(id: string) {
    if (customization) return;
    if (elSelected && id === elSelected.attr("id")) return;
    closeDialogs(".stable");
    if (!layerIsOn("toggleRivers")) toggleRivers();

    ensureEl("toggleCells").dataset.forced = String(+!layerIsOn("toggleCells"));
    if (!layerIsOn("toggleCells")) toggleCells();

    elSelected = d3.select("#" + id).on("click", function (this: SVGPathElement) {
      riverEditorSelf.addControlPoint(this);
    });

    tip(
      "Drag control points to change the river course. Click on point to remove it. Click on river to add additional control point. For major changes please create a new river instead",
      true
    );
    debug.append("g").attr("id", "controlCells");
    debug.append("g").attr("id", "controlPoints");

    this.updateRiverData();

    const river = this.getRiver();
    const {cells, points} = river;
    const riverPoints = Rivers.getRiverPoints(cells, points);
    this.drawControlPoints(riverPoints);
    this.drawCells(cells);

    $("#riverEditor").dialog({
      title: "Edit River",
      resizable: false,
      position: {my: "left top", at: "left+10 top+10", of: "#map"},
      close: () => this.closeRiverEditor()
    });

    if (modules.editRiver) return;
    modules.editRiver = true;

    ensureEl("riverCreateSelectingCells").on("click", createRiver);
    ensureEl("riverEditStyle").on("click", () => editStyle("rivers"));
    ensureEl("riverElevationProfile").on("click", () => this.showRiverElevationProfile());
    ensureEl("riverLegend").on("click", () => this.editRiverLegend());
    ensureEl("riverRemove").on("click", () => this.removeRiver());
    ensureEl("riverName").on("input", () => this.changeName());
    ensureEl("riverType").on("input", () => this.changeType());
    ensureEl("riverNameCulture").on("click", () => this.generateNameCulture());
    ensureEl("riverNameRandom").on("click", () => this.generateNameRandom());
    ensureEl("riverMainstem").on("change", () => this.changeParent());
    ensureEl("riverSourceWidth").on("input", () => this.changeSourceWidth());
    ensureEl("riverWidthFactor").on("input", () => this.changeWidthFactor());
  }

  public getRiver(): River {
    const riverId = +elSelected.attr("id").slice(5);
    return pack.rivers.find((r: River) => r.i === riverId) as River;
  }

  public updateRiverData() {
    const r = this.getRiver();

    (ensureEl("riverName") as HTMLInputElement).value = r.name;
    (ensureEl("riverType") as HTMLInputElement).value = r.type;

    const parentSelect = ensureEl("riverMainstem") as HTMLSelectElement;
    parentSelect.options.length = 0;
    const parent = r.parent || r.i;
    const sortedRivers = pack.rivers.slice().sort((a: River, b: River) => (a.name > b.name ? 1 : -1));
    sortedRivers.forEach((river: River) => {
      const opt = new Option(river.name, String(river.i), false, river.i === parent);
      parentSelect.options.add(opt);
    });
    (ensureEl("riverBasin") as HTMLInputElement).value = pack.rivers.find((river: River) => river.i === r.basin)!.name;

    (ensureEl("riverDischarge") as HTMLInputElement).value = r.discharge + " m³/s";
    (ensureEl("riverSourceWidth") as HTMLInputElement).value = String(r.sourceWidth);
    (ensureEl("riverWidthFactor") as HTMLInputElement).value = String(r.widthFactor);

    this.updateRiverLength(r);
    this.updateRiverWidth(r);
  }

  private updateRiverLength(river: River) {
    river.length = rn((elSelected.node() as SVGPathElement).getTotalLength() / 2, 2);
    const lengthUI = `${rn(river.length * distanceScale)} ${distanceUnitInput.value}`;
    (ensureEl("riverLength") as HTMLInputElement).value = lengthUI;
  }

  private updateRiverWidth(river: River) {
    const {cells, discharge, widthFactor, sourceWidth} = river as {
      cells: number[];
      discharge: number;
      widthFactor: number;
      sourceWidth: number;
    };
    const meanderedPoints = Rivers.addMeandering(cells);
    river.width = Rivers.getWidth(
      Rivers.getOffset({
        flux: discharge,
        pointIndex: meanderedPoints.length,
        widthFactor,
        startingWidth: sourceWidth
      })
    );

    const width = `${rn(river.width * distanceScale, 3)} ${distanceUnitInput.value}`;
    (ensureEl("riverWidth") as HTMLInputElement).value = width;
  }

  public drawControlPoints(points: number[][]) {
    const self = this;
    debug
      .select("#controlPoints")
      .selectAll("circle")
      .data(points)
      .join("circle")
      .attr("cx", (d: number[]) => d[0])
      .attr("cy", (d: number[]) => d[1])
      .attr("r", 0.6)
      .call(d3.drag().on("start", () => self.dragControlPoint()))
      .on("click", function (this: SVGCircleElement) {
        this.remove();
        self.redrawRiver();
        self.drawCells(self.getRiver().cells);
      });
  }

  public drawCells(cells: number[]) {
    const validCells = [...new Set(cells)].filter((i: number) => pack.cells.i[i]);
    debug
      .select("#controlCells")
      .selectAll("polygon")
      .data(validCells)
      .join("polygon")
      .attr("points", (d: number) => getPackPolygon(d));
  }

  private dragControlPoint() {
    const {r, fl} = pack.cells;
    const river = this.getRiver();

    const {x: x0, y: y0} = d3.event;
    const initCell = findCell(x0, y0);
    let movedToCell: number | null = null;

    d3.event.on("drag", function (this: SVGCircleElement) {
      const {x, y} = d3.event;
      const currentCell = findCell(x, y);
      movedToCell = initCell !== currentCell ? currentCell : null;
      this.setAttribute("cx", String(x));
      this.setAttribute("cy", String(y));
      (this as unknown as { __data__?: [number, number] }).__data__ = [rn(x, 1), rn(y, 1)];
      riverEditorSelf.redrawRiver();
      riverEditorSelf.drawCells(river.cells);
    });

    d3.event.on("end", () => {
      if (movedToCell && !r[movedToCell]) {
        r[initCell] = 0;
        r[movedToCell] = river.i;
        const sourceFlux = fl[initCell];
        fl[initCell] = fl[movedToCell];
        fl[movedToCell] = sourceFlux;
        this.redrawRiver();
      }
    });
  }

  public redrawRiver() {
    const river = this.getRiver();
    river.points = debug.selectAll("#controlPoints > *").data();
    river.cells = river.points.map(([x, y]: [number, number]) => findCell(x, y));

    lineGen.curve(d3.curveCatmullRom.alpha(0.1));
    const meanderedPoints = Rivers.addMeandering(river.cells, river.points);
    const path = Rivers.getRiverPath(meanderedPoints, river.widthFactor, river.sourceWidth);
    elSelected.attr("d", path);

    this.updateRiverLength(river);
    if ((ensureEl("elevationProfile") as HTMLElement).offsetParent) this.showRiverElevationProfile();
  }

  public addControlPoint(element: SVGPathElement) {
    const [x, y] = d3.mouse(element);
    const point: [number, number] = [rn(x, 1), rn(y, 1)];

    const river = this.getRiver();
    if (!river.points) river.points = debug.selectAll("#controlPoints > *").data();

    const index = getSegmentId(river.points, point, 2);
    river.points.splice(index, 0, point);
    this.drawControlPoints(river.points);
    this.redrawRiver();
  }

  private changeName() {
    this.getRiver().name = (ensureEl("riverName") as HTMLInputElement).value;
  }

  private changeType() {
    this.getRiver().type = (ensureEl("riverType") as HTMLInputElement).value;
  }

  private generateNameCulture() {
    const r = this.getRiver();
    r.name = (ensureEl("riverName") as HTMLInputElement).value = Rivers.getName(r.mouth);
  }

  private generateNameRandom() {
    const r = this.getRiver();
    if (r) r.name = (ensureEl("riverName") as HTMLInputElement).value = Names.getBase(rand(nameBases.length - 1));
  }

  private changeParent() {
    const r = this.getRiver();
    r.parent = +(ensureEl("riverMainstem") as HTMLSelectElement).value;
    r.basin = pack.rivers.find((river: River) => river.i === r.parent)!.basin;
    (ensureEl("riverBasin") as HTMLInputElement).value = pack.rivers.find((river: River) => river.i === r.basin)!.name;
  }

  private changeSourceWidth() {
    const river = this.getRiver();
    river.sourceWidth = +(ensureEl("riverSourceWidth") as HTMLInputElement).value;
    this.updateRiverWidth(river);
    this.redrawRiver();
  }

  private changeWidthFactor() {
    const river = this.getRiver();
    river.widthFactor = +(ensureEl("riverWidthFactor") as HTMLInputElement).value;
    this.updateRiverWidth(river);
    this.redrawRiver();
  }

  private showRiverElevationProfile() {
    const points = debug
      .selectAll("#controlPoints > *")
      .data()
      .map(([x, y]: [number, number]) => findCell(x, y));
    const river = this.getRiver();
    const riverLen = rn(river.length * distanceScale);
    ElevationProfile.open(points, riverLen, true);
  }

  private editRiverLegend() {
    const id = elSelected.attr("id");
    const river = this.getRiver();
    editNotes(id, river.name + " " + river.type);
  }

  private removeRiver() {
    alertMessage.innerHTML = "Are you sure you want to remove the river and all its tributaries";
    $("#alert").dialog({
      resizable: false,
      width: "22em",
      title: "Remove river and tributaries",
      buttons: {
        Remove: function () {
          $(this).dialog("close");
          const river = +elSelected.attr("id").slice(5);
          Rivers.remove(river);
          elSelected.remove();
          $("#riverEditor").dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  private closeRiverEditor() {
    debug.select("#controlPoints").remove();
    debug.select("#controlCells").remove();

    elSelected.on("click", null);
    unselect();
    clearMainTip();

    const forced = +(ensureEl("toggleCells").dataset.forced ?? "0");
    (ensureEl("toggleCells") as HTMLElement).dataset.forced = "0";
    if (forced && layerIsOn("toggleCells")) toggleCells();
  }
}

const riverEditor = new RiverEditor();
// alias for d3 callbacks that need a stable reference before singleton is declared
const riverEditorSelf = riverEditor;

export function editRiver(id: string) {
  riverEditor.open(id);
}
