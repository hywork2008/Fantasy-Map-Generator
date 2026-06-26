import * as d3 from "d3";
import { zoomTo } from "../actions";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { elSelected, setElSelected } from "../store/editorState";

import { closeDialogs, openDialog } from "../ui/dialogs/dialogService";
import { parseTransform, rn } from "../utils";
import { TIME } from "../utils/debug";
import { EditorBus } from "../utils/editorBus";
import { onMouseMove, tip } from "../utils/uiHelpers";
import { interactionManager } from "./interactionManager";

// Re-export pure helpers so existing callers of controllers/editors still work
export { confirmationDialog, downloadFile, getFileName, listen, uploadFile } from "../utils/editorHelpers";

// ─── Default viewbox events ────────────────────────────────────────────────

function makePanDrag(filter?: (ev: Event) => boolean): d3.DragBehavior<SVGGElement, unknown, unknown> {
  let ox = 0,
    oy = 0,
    bw = 0,
    bh = 0;
  let drag = d3
    .drag<SVGGElement, unknown>()
    .on("start", function (this: SVGGElement, event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
      const tr = parseTransform(this.getAttribute("transform") ?? "");
      ox = +tr[0] - event.x;
      oy = +tr[1] - event.y;
      const bbox = this.getBBox();
      bw = bbox.width;
      bh = bbox.height;
    })
    .on("drag", function (this: SVGGElement, event: d3.D3DragEvent<SVGGElement, unknown, unknown>) {
      const px = rn(((ox + event.x + bw) / viewContext.svgWidth) * 100, 2);
      const py = rn(((oy + event.y + bh) / viewContext.svgHeight) * 100, 2);
      d3.select(this)
        .attr("transform", `translate(${ox + event.x},${oy + event.y})`)
        .attr("data-x", px)
        .attr("data-y", py);
    });
  if (filter) drag = drag.filter(filter);
  return drag;
}

export function restoreDefaultEvents(): void {
  viewContext.svg.call(viewContext.zoom);
  viewContext.viewbox.style("cursor", "default").on(".drag", null);
  interactionManager.init(
    viewContext.viewbox.node() as Element,
    clicked as (event: MouseEvent) => void,
    onMouseMove as (event: MouseEvent) => void
  );
  interactionManager.resetClickHandler();
  interactionManager.resetMouseMoveHandler();
  viewContext.legend.call(makePanDrag());
  viewContext.svg.call(viewContext.zoom);
}

function clicked(this: Element, event: MouseEvent): void {
  const el = event.target as Element | null;
  const parent = el?.parentElement;
  const grand = parent?.parentElement;
  const great = grand?.parentElement;
  const ancestor = great?.parentElement;
  if (!ancestor) return;

  if (grand?.id === "emblems") EmblemsEditor.editEmblem(undefined, undefined, el ?? undefined);
  else if (parent?.id === "rivers") RiversEditor.editRiver(el!.id);
  else if (grand?.id === "routes") RoutesEditor.editRoute(el!.id);
  else if (ancestor.id === "labels" && el?.tagName === "tspan") LabelsEditor.editLabel(el as Element);
  else if (grand?.id === "burgLabels") BurgEditor.editBurg(+(el as SVGElement).dataset.id!);
  else if (grand?.id === "burgIcons") BurgEditor.editBurg(+(el as SVGElement).dataset.id!);
  else if (parent?.id === "ice") IceEditor.editIce(el as SVGElement);
  else if (parent?.id === "terrain") ReliefEditor.editReliefIcon(el as SVGElement);
  else if (grand?.id === "markers" || great?.id === "markers") MarkersEditor.editMarker();
  else if (grand?.id === "coastline") CoastlineEditor.editCoastline(event);
  else if (grand?.id === "lakes") LakesEditor.editLake(event);
  else if (great?.id === "armies") RegimentEditor.editRegiment(el?.parentElement ?? undefined);
}

export function unselect(): void {
  EditorBus.restoreDefaultEvents();
  if (!elSelected) return;
  elSelected!.call(d3.drag<Element, unknown>().on("drag", null)).attr("class", null);
  viewContext.debug.selectAll("*").remove();
  viewContext.viewbox.style("cursor", "default");
  setElSelected(null);
}

export { closeDialogs };

// ─── Brush circle ──────────────────────────────────────────────────────────

export function moveCircle(x: number, y: number, r = 20): void {
  const circle = document.getElementById("brushCircle");
  if (!circle) {
    viewContext.debug
      .node()!
      .insertAdjacentHTML("afterBegin" as InsertPosition, `<circle id="brushCircle" cx=${x} cy=${y} r=${r}></circle>`);
  } else {
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    circle.setAttribute("r", String(r));
  }
}

import * as BurgEditor from "../editors/burg-editor";
import * as CoastlineEditor from "../editors/coastline-editor";
import * as CulturesEditor from "../editors/cultures-editor";
import * as EmblemsEditor from "../editors/emblems-editor";
import * as IceEditor from "../editors/ice-editor";
import * as LabelsEditor from "../editors/labels-editor";
import * as LakesEditor from "../editors/lakes-editor";
import * as MarkersEditor from "../editors/markers-editor";
import * as RegimentEditor from "../editors/regiment-editor";
import * as ReliefEditor from "../editors/relief-editor";
import * as ReligionsEditor from "../editors/religions-editor";
import * as RiversEditor from "../editors/rivers-editor";
import * as RoutesEditor from "../editors/routes-editor";
import * as StatesEditor from "../editors/states-editor";
import { removeCircle } from "../utils/uiHelpers";

export { removeCircle } from "../utils/uiHelpers";

// ─── Misc editor utilities ────────────────────────────────────────────────

// ─── Legend ────────────────────────────────────────────────────────────────

export function drawLegend(name: string, data: Array<[string | number, string, string]>): void {
  viewContext.legend.selectAll("*").remove();
  viewContext.legend.attr("data", data.join("|"));

  const itemsInCol = +(document.getElementById("styleLegendColItems") as HTMLInputElement).value;
  const fontSize = +viewContext.legend.attr("font-size");
  const backClr = (document.getElementById("styleLegendBack") as HTMLInputElement).value;
  const opacity = +(document.getElementById("styleLegendOpacity") as HTMLInputElement).value;

  const lineHeight = Math.round(fontSize * 1.7);
  const colorBoxSize = Math.round(fontSize / 1.7);
  const colOffset = fontSize;
  const vOffset = fontSize / 2;

  const boxes = viewContext.legend
    .append("g")
    .attr("stroke-width", 0.5)
    .attr("stroke", "#111111")
    .attr("stroke-dasharray", "none");
  const labels = viewContext.legend.append("g").attr("fill", "#000000").attr("stroke", "none");

  const columns = Math.ceil(data.length / itemsInCol);
  for (let column = 0, i = 0; column < columns; column++) {
    const linesInColumn = Math.ceil(data.length / columns);
    const offset = column ? colOffset * 2 + (viewContext.legend.node() as SVGGElement).getBBox().width : colOffset;

    for (let l = 0; l < linesInColumn && data[i]; l++, i++) {
      boxes
        .append("rect")
        .attr("fill", data[i][1])
        .attr("x", offset)
        .attr("y", lineHeight + l * lineHeight + vOffset)
        .attr("width", colorBoxSize)
        .attr("height", colorBoxSize);

      labels
        .append("text")
        .attr("text-rendering", "optimizeSpeed")
        .text(data[i][2])
        .attr("x", offset + colorBoxSize * 1.6)
        .attr("y", fontSize / 1.6 + lineHeight + l * lineHeight + vOffset);
    }
  }

  const labelOffset = colOffset + (viewContext.legend.node() as SVGGElement).getBBox().width / 2;
  labels
    .append("text")
    .attr("text-rendering", "optimizeSpeed")
    .attr("text-anchor", "middle")
    .attr("font-weight", "bold")
    .attr("font-size", "1.2em")
    .attr("id", "legendLabel")
    .text(name)
    .attr("x", labelOffset)
    .attr("y", fontSize * 1.1 + vOffset / 2);

  const bbox = (viewContext.legend.node() as SVGGElement).getBBox();
  const width = bbox.width + colOffset * 2;
  const height = bbox.height + colOffset / 2 + vOffset;

  viewContext.legend
    .insert("rect", ":first-child")
    .attr("id", "legendBox")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", height)
    .attr("fill", backClr)
    .attr("fill-opacity", opacity);

  fitLegendBox();
}

export function fitLegendBox(): void {
  if (!viewContext.legend.selectAll("*").size()) return;
  const px = Number.isNaN(+viewContext.legend.attr("data-x")) ? 99 : +viewContext.legend.attr("data-x") / 100;
  const py = Number.isNaN(+viewContext.legend.attr("data-y")) ? 93 : +viewContext.legend.attr("data-y") / 100;
  const bbox = (viewContext.legend.node() as SVGGElement).getBBox();
  const x = rn(viewContext.svgWidth * px - bbox.width);
  const y = rn(viewContext.svgHeight * py - bbox.height);
  viewContext.legend.attr("transform", `translate(${x},${y})`);
}

export function redrawLegend(): void {
  if (viewContext.legend.select("rect").size()) {
    const name = viewContext.legend.select("#legendLabel").text();
    const data = viewContext.legend
      .attr("data")
      .split("|")
      .map((l: string) => l.split(",") as [string, string, string]);
    EditorBus.drawLegend(name, data);
  }
}

export function clearLegend(): void {
  viewContext.legend.selectAll("*").remove();
  viewContext.legend.attr("data", null);
}

// ─── Color picker ─────────────────────────────────────────────────────────

function createPicker(): void {
  const pos = () => tip("Drag to change the picker position");
  const cl = () => tip("Click to close the picker");
  const closePicker = () => container.style("display", "none");

  const container = d3
    .select("body")
    .append("svg")
    .attr("id", "pickerContainer")
    .attr("width", "100%")
    .attr("height", "100%");

  container
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("opacity", 0.2)
    .on("mousemove", cl)
    .on("click", closePicker);

  const picker = container
    .append("g")
    .attr("id", "picker")
    .call(makePanDrag((ev: Event) => (ev.target as Element).tagName !== "INPUT"));

  const controls = picker.append("g").attr("id", "pickerControls");
  const h = controls.append("g");
  h.append("text").attr("x", 4).attr("y", 14).text("H:");
  h.append("line").attr("x1", 18).attr("y1", 10).attr("x2", 107).attr("y2", 10);
  h.append("circle").attr("cx", 75).attr("cy", 10).attr("r", 5).attr("id", "pickerH");
  h.on("mousemove", () => tip("Set palette hue"));

  const s = controls.append("g");
  s.append("text").attr("x", 113).attr("y", 14).text("S:");
  s.append("line").attr("x1", 124).attr("y1", 10).attr("x2", 206).attr("y2", 10);
  s.append("circle").attr("cx", 181.4).attr("cy", 10).attr("r", 5).attr("id", "pickerS");
  s.on("mousemove", () => tip("Set palette saturation"));

  const l = controls.append("g");
  l.append("text").attr("x", 213).attr("y", 14).text("L:");
  l.append("line").attr("x1", 226).attr("y1", 10).attr("x2", 306).attr("y2", 10);
  l.append("circle").attr("cx", 282).attr("cy", 10).attr("r", 5).attr("id", "pickerL");
  l.on("mousemove", () => tip("Set palette lightness"));

  controls.selectAll<SVGLineElement, unknown>("line").on("click", clickPickerControl);
  let circDragMin = 0,
    circDragMax = 0;
  controls.selectAll<SVGCircleElement, unknown>("circle").call(
    d3
      .drag<SVGCircleElement, unknown>()
      .on("start", function (this: SVGCircleElement) {
        circDragMin = +(this.previousSibling as Element).getAttribute("x1")!;
        circDragMax = +(this.previousSibling as Element).getAttribute("x2")!;
      })
      .on("drag", function (this: SVGCircleElement, event: d3.D3DragEvent<SVGCircleElement, unknown, unknown>) {
        const x = Math.max(Math.min(event.x, circDragMax), circDragMin);
        this.setAttribute("cx", String(x));
        updateSpaces();
        updatePickerColors();
        openPicker.updateFill?.();
      })
  );

  const spaces = picker
    .append("foreignObject")
    .attr("id", "pickerSpaces")
    .attr("x", 4)
    .attr("y", 20)
    .attr("width", 303)
    .attr("height", 20)
    .on("mousemove", () => tip("Color value in different color spaces. Edit to change"));

  (spaces.node() as Element).insertAdjacentHTML(
    "beforeend",
    /* html */ `<label style="margin-right: 6px">HSL:
      <input type="number" id="pickerHSL_H" data-space="hsl" min="0" max="360" value="231" />,
      <input type="number" id="pickerHSL_S" data-space="hsl" min="0" max="100" value="70" />,
      <input type="number" id="pickerHSL_L" data-space="hsl" min="0" max="100" value="70" />
    </label>
    <label style="margin-right: 6px">RGB:
      <input type="number" id="pickerRGB_R" data-space="rgb" min="0" max="255" value="125" />,
      <input type="number" id="pickerRGB_G" data-space="rgb" min="0" max="255" value="142" />,
      <input type="number" id="pickerRGB_B" data-space="rgb" min="0" max="255" value="232" />
    </label>
    <label>HEX: <input type="text" id="pickerHEX" data-space="hex" style="width:42px" autocorrect="off" spellcheck="false" value="#7d8ee8" /></label>`
  );
  spaces.selectAll<HTMLInputElement, unknown>("input").on("change", changePickerSpace);

  const colors = picker.append("g").attr("id", "pickerColors").attr("stroke", "#333333");
  const hatches = picker.append("g").attr("id", "pickerHatches").attr("stroke", "#333333");
  const hatching = d3.selectAll<Element, unknown>("g#defs-hatching > pattern");
  const number = hatching.size();

  const clr = d3.range(number).map(i => d3.hsl((i / number) * 360, 0.7, 0.7).formatHex());
  clr.forEach((c, i) => {
    colors
      .append("rect")
      .attr("id", `picker_${c}`)
      .attr("fill", c)
      .attr("class", i ? "" : "selected")
      .attr("x", (i % 14) * 22 + 4)
      .attr("y", 40 + Math.floor(i / 14) * 20)
      .attr("width", 16)
      .attr("height", 16);
  });

  hatching.each(function (this: Element, _d, i) {
    hatches
      .append("rect")
      .attr("id", `picker_${this.id}`)
      .attr("fill", `url(#${this.id})`)
      .attr("x", (i % 14) * 22 + 4)
      .attr("y", Math.floor(i / 14) * 20 + 20 + number * 2)
      .attr("width", 16)
      .attr("height", 16);
  });

  colors
    .selectAll<SVGRectElement, unknown>("rect")
    .on("click", pickerFillClicked)
    .on("mouseover", () => tip("Click to fill with the color"));
  hatches
    .selectAll<SVGRectElement, unknown>("rect")
    .on("click", pickerFillClicked)
    .on("mouseover", function (this: SVGRectElement) {
      tip(`Click to fill with the hatching ${this.id}`);
    });

  const bbox = (picker.node() as SVGGElement).getBBox();
  const width = bbox.width + 8;
  const height = bbox.height + 9;

  picker
    .insert("rect", ":first-child")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#ffffff")
    .attr("stroke", "#5d4651")
    .on("mousemove", pos);
  picker
    .insert("text", ":first-child")
    .attr("x", width - 20)
    .attr("y", -10)
    .attr("id", "pickerCloseText")
    .text("✕");
  picker
    .insert("rect", ":first-child")
    .attr("x", width - 23)
    .attr("y", -21)
    .attr("id", "pickerCloseRect")
    .attr("width", 14)
    .attr("height", 14)
    .on("mousemove", cl)
    .on("click", closePicker);
  picker
    .insert("text", ":first-child")
    .attr("x", 12)
    .attr("y", -10)
    .attr("id", "pickerLabel")
    .text("Color Picker")
    .on("mousemove", pos);
  picker
    .insert("rect", ":first-child")
    .attr("x", 0)
    .attr("y", -30)
    .attr("width", width)
    .attr("height", 30)
    .attr("id", "pickerHeader")
    .on("mousemove", pos);
  picker.attr("transform", `translate(${(viewContext.svgWidth - width) / 2},${(viewContext.svgHeight - height) / 2})`);
}

function updateSelectedRect(fill: string): void {
  document.getElementById("picker")!.querySelector<Element>("rect.selected")!.classList.remove("selected");
  document
    .getElementById("picker")!
    .querySelector<Element>(`rect[fill='${fill.toLowerCase()}']`)!
    .classList.add("selected");
}

function updateSpaces(): void {
  const pickerH = document.getElementById("pickerH")!;
  const pickerS = document.getElementById("pickerS")!;
  const pickerL = document.getElementById("pickerL")!;

  const h = getPickerControl(pickerH, 360);
  const s = getPickerControl(pickerS, 1);
  const l = getPickerControl(pickerL, 1);

  (document.getElementById("pickerHSL_H") as HTMLInputElement).value = String(rn(h));
  (document.getElementById("pickerHSL_S") as HTMLInputElement).value = String(rn(s * 100));
  (document.getElementById("pickerHSL_L") as HTMLInputElement).value = String(rn(l * 100));

  const clr = d3.rgb(d3.hsl(h, s, l));
  (document.getElementById("pickerRGB_R") as HTMLInputElement).value = String(clr.r);
  (document.getElementById("pickerRGB_G") as HTMLInputElement).value = String(clr.g);
  (document.getElementById("pickerRGB_B") as HTMLInputElement).value = String(clr.b);
  (document.getElementById("pickerHEX") as HTMLInputElement).value = clr.formatHex();
}

function updatePickerColors(): void {
  const colors = d3.select<SVGGElement, unknown>("#picker > #pickerColors").selectAll<SVGRectElement, unknown>("rect");
  const number = colors.size();

  const h = getPickerControl(document.getElementById("pickerH")!, 360);
  const s = getPickerControl(document.getElementById("pickerS")!, 1);
  const l = getPickerControl(document.getElementById("pickerL")!, 1);

  colors.each(function (this: SVGRectElement, _d, i) {
    const c = d3.hsl((i / number) * 180 + h, s, l).formatHex();
    this.setAttribute("id", `picker_${c}`);
    this.setAttribute("fill", c);
  });
}

// openPicker holds a mutable updateFill callback
interface OpenPickerFn {
  (fill: string, callback: (fill: string) => void): void;
  updateFill?: () => void;
}

const openPicker: OpenPickerFn = (fill: string, callback: (fill: string) => void): void => {
  const picker = d3.select("#picker");
  if (!picker.size()) createPicker();
  d3.select("#pickerContainer").style("display", "block");

  if (fill[0] === "#") {
    const clr = d3.hsl(fill);
    const pickerH = document.getElementById("pickerH")!;
    const pickerS = document.getElementById("pickerS")!;
    const pickerL = document.getElementById("pickerL")!;
    if (!Number.isNaN(clr.h)) setPickerControl(pickerH, clr.h, 360);
    if (!Number.isNaN(clr.s)) setPickerControl(pickerS, clr.s, 1);
    if (!Number.isNaN(clr.l)) setPickerControl(pickerL, clr.l, 1);
    updateSpaces();
    updatePickerColors();
  }

  updateSelectedRect(fill);

  openPicker.updateFill = () => {
    const selected = document.getElementById("picker")?.querySelector<Element>("rect.selected");
    if (!selected) return;
    callback(selected.getAttribute("fill")!);
  };
};

function setPickerControl(control: Element, value: number, max: number): void {
  const line = control.previousSibling as Element;
  const min = +line.getAttribute("x1")!;
  const delta = +line.getAttribute("x2")! - min;
  control.setAttribute("cx", String(min + delta * (value / max)));
}

function getPickerControl(control: Element, max: number): number {
  const line = control.previousSibling as Element;
  const min = +line.getAttribute("x1")!;
  const delta = +line.getAttribute("x2")! - min;
  const current = +control.getAttribute("cx")! - min;
  return (current / delta) * max;
}

function pickerFillClicked(this: Element): void {
  const fill = this.getAttribute("fill")!;
  updateSelectedRect(fill);
  openPicker.updateFill?.();

  const clr = d3.hsl(fill);
  if (Number.isNaN(clr.h)) return;
  setPickerControl(document.getElementById("pickerH")!, clr.h, 360);
  updateSpaces();
}

function clickPickerControl(this: SVGLineElement, event: MouseEvent): void {
  const min = this.getScreenCTM()!.e;
  (this.nextSibling as Element).setAttribute("cx", String(event.x - min));
  updateSpaces();
  updatePickerColors();
  openPicker.updateFill?.();
}

function changePickerSpace(this: HTMLInputElement): void {
  if (!this.checkValidity()) {
    tip("You must provide a correct value", false, "error");
    return;
  }

  const space = this.dataset.space!;
  const inputs = Array.from(this.parentNode!.querySelectorAll<HTMLInputElement>("input")).map(i => i.value);
  const fill =
    space === "hex"
      ? d3.rgb(this.value)
      : space === "rgb"
        ? d3.rgb(+inputs[0], +inputs[1], +inputs[2])
        : d3.hsl(+inputs[0], +inputs[1] / 100, +inputs[2] / 100);

  const clr = d3.hsl(fill);
  if (Number.isNaN(clr.l)) {
    tip("You must provide a correct value", false, "error");
    return;
  }

  const pickerH = document.getElementById("pickerH")!;
  const pickerS = document.getElementById("pickerS")!;
  const pickerL = document.getElementById("pickerL")!;
  if (!Number.isNaN(clr.h)) setPickerControl(pickerH, clr.h, 360);
  if (!Number.isNaN(clr.s)) setPickerControl(pickerS, clr.s, 1);
  if (!Number.isNaN(clr.l)) setPickerControl(pickerL, clr.l, 1);

  updateSpaces();
  updatePickerColors();
  openPicker.updateFill?.();
}

// ─── Fogging ───────────────────────────────────────────────────────────────

export function fog(id: string, path: string): void {
  if (viewContext.defs.select(`#fog #${id}`).size()) return;
  const fadeIn = d3.transition().duration(2000).ease(d3.easeSinInOut);
  if (viewContext.defs.select("#fog path").size()) {
    viewContext.defs
      .select("#fog")
      .append("path")
      .attr("d", path)
      .attr("id", id)
      .attr("opacity", 0)
      .transition(fadeIn)
      .attr("opacity", 1);
  } else {
    viewContext.defs.select("#fog").append("path").attr("d", path).attr("id", id).attr("opacity", 1);
    const opacity = viewContext.fogging!.attr("opacity");
    viewContext.fogging!.style("display", "block").attr("opacity", 0).transition(fadeIn).attr("opacity", opacity);
  }
}

export function unfog(id?: string): void {
  let el = id
    ? viewContext.defs.select(`#fog #${id}`)
    : (viewContext.defs.select(null) as ReturnType<typeof viewContext.defs.select>);
  if (!id || !el.size()) el = viewContext.defs.select("#fog").selectAll("path") as typeof el;
  el.remove();
  if (!viewContext.defs.selectAll("#fog path").size()) viewContext.fogging!.style("display", "none");
}

// getFileName, downloadFile, uploadFile are re-exported from ../utils/editorHelpers

function getBBox(element: SVGRectElement): { x: number; y: number; width: number; height: number } {
  return {
    x: +element.getAttribute("x")!,
    y: +element.getAttribute("y")!,
    width: +element.getAttribute("width")!,
    height: +element.getAttribute("height")!
  };
}

export function highlightElement(element: Element, zoom?: number): void {
  if (viewContext.debug.select(".highlighted").size()) return;
  const box =
    element.tagName === "svg" ? getBBox(element as SVGRectElement) : (element as SVGGraphicsElement).getBBox();
  const transform = element.getAttribute("transform") ?? null;
  const enter = d3.transition().duration(1000).ease(d3.easeBounceOut);

  const highlight = viewContext.debug
    .append("rect")
    .attr("x", box.x)
    .attr("y", box.y)
    .attr("width", box.width)
    .attr("height", box.height);
  highlight.classed("highlighted", true).attr("transform", transform);
  highlight
    .transition(enter)
    .style("outline-offset", "0px")
    .transition()
    .duration(500)
    .ease(d3.easeLinear)
    .style("outline-color", "transparent")
    .delay(1000)
    .remove();

  if (zoom) {
    const tr = parseTransform(transform ?? "");
    let x = box.x + box.width / 2;
    if (tr[0]) x += +tr[0];
    let y = box.y + box.height / 2;
    if (tr[1]) y += +tr[1];
    zoomTo(x, y, viewContext.scale > 2 ? viewContext.scale : zoom, 1600);
  }
}

// ─── Icon selector ─────────────────────────────────────────────────────────

export function selectIcon(initial: string, callback: (value: string) => void): void {
  if (!callback) return;
  openDialog("iconSelector", { title: "Select Icon", onClose: () => callback(initial) });

  const table = document.getElementById("iconTable") as HTMLTableElement;
  const iconInput = document.getElementById("iconInput") as HTMLInputElement;
  iconInput.value = initial;

  if (table.rows.length === 0) {
    const icons = [
      "⚔️",
      "🏹",
      "🐴",
      "💣",
      "🌊",
      "🎯",
      "⚓",
      "🔮",
      "📯",
      "⚒️",
      "🛡️",
      "👑",
      "⚜️",
      "☠️",
      "🎆",
      "🗡️",
      "🔪",
      "⛏️",
      "🔥",
      "🩸",
      "💧",
      "🐾",
      "🎪",
      "🏰",
      "🏯",
      "⛓️",
      "❤️",
      "💘",
      "💜",
      "📜",
      "🔔",
      "🔱",
      "💎",
      "🌈",
      "🌠",
      "✨",
      "💥",
      "☀️",
      "🌙",
      "⚡",
      "❄️",
      "♨️",
      "🎲",
      "🚨",
      "🌉",
      "🗻",
      "🌋",
      "🧱",
      "⚖️",
      "✂️",
      "🎵",
      "👗",
      "🎻",
      "🎨",
      "🎭",
      "⛲",
      "💉",
      "📖",
      "📕",
      "🎁",
      "💍",
      "⏳",
      "🕸️",
      "⚗️",
      "☣️",
      "☢️",
      "🔰",
      "🎖️",
      "🚩",
      "🏳️",
      "🏴",
      "💪",
      "✊",
      "👊",
      "🤜",
      "🤝",
      "🙏",
      "🧙",
      "🧙‍♀️",
      "💂",
      "🤴",
      "🧛",
      "🧟",
      "🧞",
      "🧝",
      "👼",
      "👻",
      "👺",
      "👹",
      "🦄",
      "🐲",
      "🐉",
      "🐎",
      "🦓",
      "🐺",
      "🦊",
      "🐱",
      "🐈",
      "🦁",
      "🐯",
      "🐅",
      "🐆",
      "🐕",
      "🦌",
      "🐵",
      "🐒",
      "🦍",
      "🦅",
      "🕊️",
      "🐓",
      "🦇",
      "🦜",
      "🐦",
      "🦉",
      "🐮",
      "🐄",
      "🐂",
      "🐃",
      "🐷",
      "🐖",
      "🐗",
      "🐏",
      "🐑",
      "🐐",
      "🐫",
      "🦒",
      "🐘",
      "🦏",
      "🐭",
      "🐁",
      "🐀",
      "🐹",
      "🐰",
      "🐇",
      "🦔",
      "🐸",
      "🐊",
      "🐢",
      "🦎",
      "🐍",
      "🐳",
      "🐬",
      "🦈",
      "🐠",
      "🐙",
      "🦑",
      "🐌",
      "🦋",
      "🐜",
      "🐝",
      "🐞",
      "🦗",
      "🕷️",
      "🦂",
      "🦀",
      "🌳",
      "🌲",
      "🎄",
      "🌴",
      "🍂",
      "🍁",
      "🌵",
      "☘️",
      "🍀",
      "🌿",
      "🌱",
      "🌾",
      "🍄",
      "🌽",
      "🌸",
      "🌹",
      "🌻",
      "🍒",
      "🍏",
      "🍇",
      "🍉",
      "🍅",
      "🍓",
      "🥔",
      "🥕",
      "🥩",
      "🍗",
      "🍞",
      "🍻",
      "🍺",
      "🍲",
      "🍷"
    ];

    let row: HTMLTableRowElement | undefined;
    for (let i = 0; i < icons.length; i++) {
      if (i % 17 === 0) row = table.insertRow((i / 17) | 0);
      row!.insertCell(i % 17).textContent = icons[i];
    }

    const externalResources = new Set<string>();
    const isExternal = (url: string) => url.startsWith("http") || url.startsWith("data:image");

    (worldContext.options.military as Array<{ icon: string }>)?.forEach(unit => {
      if (isExternal(unit.icon)) externalResources.add(unit.icon);
    });
    worldContext.pack.states.forEach(state => {
      state?.military?.forEach(regiment => {
        if (regiment.icon && isExternal(regiment.icon)) externalResources.add(regiment.icon);
      });
    });
    externalResources.forEach(addExternalImage);
  }

  iconInput.oninput = () => callback(iconInput.value);

  table.onclick = (e: MouseEvent) => {
    const td = e.target as HTMLElement;
    if (td.tagName === "TD") {
      iconInput.value = td.textContent!;
      callback(iconInput.value);
    }
  };

  table.onmouseover = (e: MouseEvent) => {
    const td = e.target as HTMLElement;
    if (td.tagName === "TD") tip(`Click to select ${td.textContent} icon`);
  };

  function addExternalImage(url: string) {
    const addedIcons = document.getElementById("addedIcons")!;
    const image = document.createElement("div");
    image.style.cssText = `width: 2.2em; height: 2.2em; background-size: cover; background-image: url(${url})`;
    addedIcons.appendChild(image);
    image.onclick = () => callback(url);
  }

  const addImageBtn = document.getElementById("addImage") as HTMLButtonElement;
  addImageBtn.onclick = () => {
    const urlInput = addImageBtn.previousElementSibling as HTMLInputElement;
    const url = urlInput.value;
    if (!url) return tip("Enter image URL to add", false, "error", 4000);
    if (!url.match(/^((http|https):\/\/)|data:image\//)) return tip("Enter valid URL", false, "error", 4000);
    addExternalImage(url);
    callback(url);
    urlInput.value = "";
  };

  document
    .getElementById("addedIcons")!
    .querySelectorAll<HTMLElement>("div")
    .forEach(div => {
      div.onclick = () => callback(div.style.backgroundImage.slice(5, -2));
    });

  openDialog("iconSelector"); // Refresh dialog bounds if needed
}

// ─── Area / units ──────────────────────────────────────────────────────────

export { fitContent, getArea, getAreaUnit } from "../utils/uiHelpers";

// confirmationDialog and listen are re-exported from ../utils/editorHelpers

// ─── Refresh all open editors ─────────────────────────────────────────────

export function refreshAllEditors(): void {
  TIME && console.time("refreshAllEditors");
  if (document.getElementById("culturesEditorRefresh")?.offsetParent)
    (document.getElementById("culturesEditorRefresh") as HTMLButtonElement).click();
  if (document.getElementById("biomesEditorRefresh")?.offsetParent)
    (document.getElementById("biomesEditorRefresh") as HTMLButtonElement).click();
  if (document.getElementById("diplomacyEditorRefresh")?.offsetParent)
    (document.getElementById("diplomacyEditorRefresh") as HTMLButtonElement).click();
  if (document.getElementById("provincesEditorRefresh")?.offsetParent)
    (document.getElementById("provincesEditorRefresh") as HTMLButtonElement).click();
  if (document.getElementById("religionsEditorRefresh")?.offsetParent)
    (document.getElementById("religionsEditorRefresh") as HTMLButtonElement).click();
  if (document.getElementById("statesEditorRefresh")?.offsetParent)
    (document.getElementById("statesEditorRefresh") as HTMLButtonElement).click();
  if (document.getElementById("zonesEditorRefresh")?.offsetParent)
    (document.getElementById("zonesEditorRefresh") as HTMLButtonElement).click();
  TIME && console.timeEnd("refreshAllEditors");
}

// ─── Dynamic editor launchers ─────────────────────────────────────────────

export function editStates(): void {
  if (viewContext.customization) return;
  StatesEditor.open();
}

export function editCultures(): void {
  if (viewContext.customization) return;
  CulturesEditor.open();
}

export function editReligions(): void {
  if (viewContext.customization) return;
  ReligionsEditor.open();
}

export function editCoastlineSettings(): void {
  if (viewContext.customization) return;
  CoastlineEditor.coastlineEditor.open();
}

// CustomEvent Listeners
document.addEventListener("fmg:unfog", () => unfog());
document.addEventListener("fmg:clear-legend", () => clearLegend());
document.addEventListener("fmg:redraw-legend", () => redrawLegend());
document.addEventListener("fmg:restore-default-events", () => restoreDefaultEvents());
document.addEventListener("fmg:unselect", () => unselect());
document.addEventListener("fmg:move-circle", (e: Event) => {
  const { x, y, r } = (e as CustomEvent<{ x: number; y: number; r: number }>).detail;
  moveCircle(x, y, r);
});
document.addEventListener("fmg:edit-river", (e: Event) => {
  const { id } = (e as CustomEvent<{ id: string }>).detail;
  RiversEditor.editRiver(id);
});
document.addEventListener("fmg:edit-states", () => editStates());
document.addEventListener("fmg:remove-circle", () => removeCircle());
document.addEventListener("fmg:highlight-element", (e: Event) => {
  const { element, zoom } = (e as CustomEvent<{ element: Element; zoom?: number }>).detail;
  highlightElement(element, zoom);
});
document.addEventListener("fmg:select-icon", (e: Event) => {
  const { initial } = (e as CustomEvent<{ initial: string }>).detail;
  const cb = EditorBus._iconCallback;
  if (cb) EditorBus.selectIcon(initial, cb);
});

// Register calculate-friendly-grid-size

// Register fit-legend-box event
document.addEventListener("fmg:fit-legend-box", () => {
  fitLegendBox();
});
