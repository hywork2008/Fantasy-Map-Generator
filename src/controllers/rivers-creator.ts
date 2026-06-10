import { pointer } from "d3";
import { last, rn } from "../utils";

function createRiver(): void {
  if (customization) return;
  closeDialogs();
  if (!layerIsOn("toggleRivers")) toggleRivers();

  document.getElementById("toggleCells")!.dataset.forced = String(+!layerIsOn("toggleCells"));
  if (!layerIsOn("toggleCells")) toggleCells();

  tip("Click to add river point, click again to remove", true);
  debug.append("g").attr("id", "controlCells");
  viewbox.style("cursor", "crosshair").on("click", onCellClick);

  (createRiver as any).cells = [];
  const body = document.getElementById("riverCreatorBody") as HTMLElement;

  $("#riverCreator").dialog({
    title: "Create River",
    resizable: false,
    position: { my: "left top", at: "left+10 top+10", of: "#map" },
    close: closeRiverCreator
  });

  if (modules.createRiver) return;
  modules.createRiver = true;

  document.getElementById("riverCreatorComplete")!.addEventListener("click", addRiver);
  document.getElementById("riverCreatorCancel")!.addEventListener("click", () => $("#riverCreator").dialog("close"));
  body.addEventListener("click", ev => {
    const el = ev.target as HTMLElement;
    const cl = el.classList;
    const cell = +el.parentElement!.dataset.cell!;
    if (cl.contains("editFlux")) pack.cells.fl[cell] = +(el as HTMLInputElement).value;
    else if (cl.contains("icon-trash-empty")) removeCell(cell);
  });

  function onCellClick(this: SVGElement, event: MouseEvent): void {
    const [px, py] = pointer(event, this);
    const cell = findCell(px, py);

    const cells: number[] = (createRiver as any).cells;
    if (cells.includes(cell)) removeCell(cell);
    else addCell(cell);
  }

  function addCell(cell: number): void {
    const cells: number[] = (createRiver as any).cells;
    cells.push(cell);
    drawCells(cells);

    const flux = pack.cells.fl[cell];
    const lineHtml = `<div class="editorLine" data-cell="${cell}">
      <span>Cell ${cell}</span>
      <span data-tip="Set flux affects river width" style="margin-left: 0.4em">Flux</span>
      <input type="number" min=0 value="${flux}" class="editFlux" style="width: 5em"/>
      <span data-tip="Remove the cell" class="icon-trash-empty pointer"></span>
    </div>`;
    body.innerHTML += lineHtml;
  }

  function removeCell(cell: number): void {
    (createRiver as any).cells = ((createRiver as any).cells as number[]).filter((c: number) => c !== cell);
    drawCells((createRiver as any).cells);
    body.querySelector(`div[data-cell='${cell}']`)?.remove();
  }

  function drawCells(cells: number[]): void {
    debug
      .select("#controlCells")
      .selectAll("polygon")
      .data(cells)
      .join("polygon")
      .attr("points", d => getPackPolygon(d).join(" "))
      .attr("class", "current");
  }

  function addRiver(): void {
    const { rivers, cells } = pack;
    const riverCells: number[] = (createRiver as any).cells;
    if (riverCells.length < 2) {
      tip("Add at least 2 cells", false, "error");
      return;
    }

    const riverId = Rivers.getNextId(rivers);
    const parent = cells.r[last(riverCells)] || riverId;

    riverCells.forEach(cell => {
      if (!cells.r[cell]) cells.r[cell] = riverId;
    });

    const source = riverCells[0];
    const mouth = parent === riverId ? last(riverCells) : riverCells[riverCells.length - 2];
    const sourceWidth = Rivers.getSourceWidth(cells.fl[source]);
    const defaultWidthFactor = rn(
      1 / ((pointsInput.dataset.cells ? +pointsInput.dataset.cells : 10000) / 10000) ** 0.25,
      2
    );
    const widthFactor = 1.2 * defaultWidthFactor;

    const meanderedPoints = Rivers.addMeandering(riverCells);

    const discharge = cells.fl[mouth];
    const length = Rivers.getApproximateLength(meanderedPoints as any);
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
    const id = `river${riverId}`;

    viewbox
      .select("#rivers")
      .append("path")
      .attr("id", id)
      .attr("d", Rivers.getRiverPath(meanderedPoints as any, widthFactor, sourceWidth));

    editRiver(id);
  }

  function closeRiverCreator(): void {
    body.innerHTML = "";
    debug.select("#controlCells").remove();
    restoreDefaultEvents?.();
    clearMainTip();

    const forced = +document.getElementById("toggleCells")!.dataset.forced!;
    document.getElementById("toggleCells")!.dataset.forced = "0";
    if (forced && layerIsOn("toggleCells")) toggleCells();
  }
}

window.createRiver = createRiver;
