"use strict";
import { Rivers } from "@fmg/core/modules/river-generator";

type RiverCell = number;

type D3Chain = {
  attr: (name: string, value: unknown) => D3Chain;
  remove: () => void;
  append: (tag: string) => D3Chain;
};

type RiversCreatorRuntime = {
  customization: number;
  modules: { createRiver?: boolean };
  pack: {
    rivers: Array<{ i: number; [key: string]: unknown }>;
    cells: {
      fl: ArrayLike<number> & { [index: number]: number };
      f: ArrayLike<number>;
      r: ArrayLike<number> & { [index: number]: number };
      routes?: unknown;
    };
  };
  viewbox: {
    style: (name: string, value: string) => { on: (event: string, handler: (this: SVGElement) => void) => unknown };
    select: (selector: string) => D3Chain;
  };
  debug: {
    append: (tag: string) => D3Chain;
    select: (selector: string) => {
      selectAll: (tag: string) => {
        data: (data: RiverCell[]) => {
          join: (tagName: string) => D3Chain;
        };
      };
      remove: () => void;
    };
  };
  d3: { mouse: (el: SVGElement) => [number, number] };
  pointsInput: { dataset: { cells: string } };
  $: (selector: string) => { dialog: (optionsOrAction: unknown) => unknown };
  rn: (value: number, digits?: number) => number;
  last: <T>(values: T[]) => T;
  findCell: (x: number, y: number) => number;
  getPackPolygon: (cellId: number) => string;
  closeDialogs: () => void;
  layerIsOn: (id: string) => boolean;
  toggleRivers: () => void;
  toggleCells: () => void;
  tip: (message: string, autoHide?: boolean, type?: string) => void;
  editRiver: (riverId: string) => void;
  restoreDefaultEvents: () => void;
  clearMainTip: () => void;
  createRiver?: () => void;
};

const riversCreatorRuntime = globalThis as unknown as RiversCreatorRuntime;

class RiverCreator {
  private cells: RiverCell[] = [];

  public open() {
    const creator = this;

    if (riversCreatorRuntime.customization) return;
    riversCreatorRuntime.closeDialogs();
    if (!riversCreatorRuntime.layerIsOn("toggleRivers")) riversCreatorRuntime.toggleRivers();

    const toggleCellsButton = document.getElementById("toggleCells") as HTMLElement;
    toggleCellsButton.dataset.forced = String(+!riversCreatorRuntime.layerIsOn("toggleCells"));
    if (!riversCreatorRuntime.layerIsOn("toggleCells")) riversCreatorRuntime.toggleCells();

    riversCreatorRuntime.tip("Click to add river point, click again to remove", true);
    riversCreatorRuntime.debug.append("g").attr("id", "controlCells");
    riversCreatorRuntime.viewbox.style("cursor", "crosshair").on("click", onCellClick);

    creator.cells = [];
    const body = document.getElementById("riverCreatorBody") as HTMLElement;

    riversCreatorRuntime.$("#riverCreator").dialog({
      title: "Create River",
      resizable: false,
      position: {my: "left top", at: "left+10 top+10", of: "#map"},
      close: closeRiverCreator
    });

    if (riversCreatorRuntime.modules.createRiver) return;
    riversCreatorRuntime.modules.createRiver = true;

    document.getElementById("riverCreatorComplete")?.addEventListener("click", addRiver);
    document
      .getElementById("riverCreatorCancel")
      ?.addEventListener("click", () => riversCreatorRuntime.$("#riverCreator").dialog("close"));
    body.addEventListener("click", ev => {
      const el = ev.target as HTMLElement;
      const cell = Number(el.parentElement?.dataset.cell || 0);
      if (el.classList.contains("editFlux")) riversCreatorRuntime.pack.cells.fl[cell] = Number((el as HTMLInputElement).value);
      else if (el.classList.contains("icon-trash-empty")) removeCell(cell);
    });

    function onCellClick(this: SVGElement) {
      const cell = riversCreatorRuntime.findCell(...riversCreatorRuntime.d3.mouse(this));

      if (creator.cells.includes(cell)) removeCell(cell);
      else addCell(cell);
    }

    function addCell(cell: RiverCell) {
      creator.cells.push(cell);
      drawCells(creator.cells);

      const flux = riversCreatorRuntime.pack.cells.fl[cell];
      const line = `<div class="editorLine" data-cell="${cell}">
      <span>Cell ${cell}</span>
      <span data-tip="Set flux affects river width" style="margin-left: 0.4em">Flux</span>
      <input type="number" min=0 value="${flux}" class="editFlux" style="width: 5em"/>
      <span data-tip="Remove the cell" class="icon-trash-empty pointer"></span>
    </div>`;
      body.innerHTML += line;
    }

    function removeCell(cell: RiverCell) {
      creator.cells = creator.cells.filter(c => c !== cell);
      drawCells(creator.cells);
      body.querySelector(`div[data-cell='${cell}']`)?.remove();
    }

    function drawCells(cells: RiverCell[]) {
      riversCreatorRuntime.debug
        .select("#controlCells")
        .selectAll("polygon")
        .data(cells)
        .join("polygon")
        .attr("points", (d: RiverCell) => riversCreatorRuntime.getPackPolygon(d))
        .attr("class", "current");
    }

    function addRiver() {
      const {rivers, cells} = riversCreatorRuntime.pack;
      const riverCells = creator.cells;
      if (riverCells.length < 2) return riversCreatorRuntime.tip("Add at least 2 cells", false, "error");

      const riverId = Rivers.getNextId(rivers);
      const parent = cells.r[riversCreatorRuntime.last(riverCells)] || riverId;

      riverCells.forEach(cell => {
        if (!cells.r[cell]) cells.r[cell] = riverId;
      });

      const source = riverCells[0];
      const mouth = parent === riverId ? riversCreatorRuntime.last(riverCells) : riverCells[riverCells.length - 2];
      const sourceWidth = Rivers.getSourceWidth(cells.fl[source]);
      const defaultWidthFactor = riversCreatorRuntime.rn(
        1 / ((Number(riversCreatorRuntime.pointsInput.dataset.cells) / 10000) ** 0.25),
        2
      );
      const widthFactor = 1.2 * defaultWidthFactor;

      const meanderedPoints = Rivers.addMeandering(riverCells);

      const discharge = cells.fl[mouth];
      const length = Rivers.getApproximateLength(meanderedPoints.map(([x, y]) => [x, y] as [number, number]));
      const width = Rivers.getWidth(
        Rivers.getOffset({
          flux: discharge,
          pointIndex: meanderedPoints.length,
          widthFactor,
          startingWidth: sourceWidth
        })
      );
      const name = Rivers.getName(mouth);
      const basin = Rivers.getBasin(parent);

      rivers.push({
        i: riverId,
        source,
        mouth,
        discharge,
        length,
        width,
        widthFactor,
        sourceWidth,
        parent,
        cells: riverCells,
        basin,
        name,
        type: "River"
      });
      const id = "river" + riverId;

      riversCreatorRuntime.viewbox
        .select("#rivers")
        .append("path")
        .attr("id", id)
        .attr("d", Rivers.getRiverPath(meanderedPoints, widthFactor, sourceWidth));

      riversCreatorRuntime.editRiver(id);
    }

    function closeRiverCreator() {
      body.innerHTML = "";
      riversCreatorRuntime.debug.select("#controlCells").remove();
      riversCreatorRuntime.restoreDefaultEvents();
      riversCreatorRuntime.clearMainTip();

      const forced = Number(toggleCellsButton.dataset.forced || 0);
      toggleCellsButton.dataset.forced = "0";
      if (forced && riversCreatorRuntime.layerIsOn("toggleCells")) riversCreatorRuntime.toggleCells();
    }
  }
}

const riverCreator = new RiverCreator();

function createRiver() {
  riverCreator.open();
}

riversCreatorRuntime.createRiver = createRiver;
