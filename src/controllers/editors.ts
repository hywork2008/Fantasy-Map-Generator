import * as d3 from "d3";
import { ensureEl, parseTransform, rn } from "../utils";
import { editBurg } from "./burg-editor";
import { coastlineEditor, editCoastline } from "./coastline-editor";
import { open as openCulturesEditor } from "./cultures-editor";
import { editEmblem } from "./emblems-editor";
import { editIce } from "./ice-editor";
import { editLabel } from "./labels-editor";
import { editLake } from "./lakes-editor";
import { editMarker } from "./markers-editor";
import { editRegiment } from "./regiment-editor";
import { editReliefIcon } from "./relief-editor";
import { open as openReligionsEditor } from "./religions-editor";
import { editRiver } from "./rivers-editor";
import { editRoute } from "./routes-editor";
import { open as openStatesEditor } from "./states-editor";

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
      const px = rn(((ox + event.x + bw) / svgWidth) * 100, 2);
      const py = rn(((oy + event.y + bh) / svgHeight) * 100, 2);
      d3.select(this)
        .attr("transform", `translate(${ox + event.x},${oy + event.y})`)
        .attr("data-x", px)
        .attr("data-y", py);
    });
  if (filter) drag = drag.filter(filter);
  return drag;
}

export function restoreDefaultEvents(): void {
  svg.call(zoom as any);
  viewbox.style("cursor", "default").on(".drag", null).on("click", clicked).on("touchmove mousemove", onMouseMove);
  legend.call(makePanDrag());
  svg.call(zoom as any);
}

function clicked(this: Element, event: MouseEvent): void {
  const el = event.target as Element | null;
  const parent = el?.parentElement;
  const grand = parent?.parentElement;
  const great = grand?.parentElement;
  const ancestor = great?.parentElement;
  if (!ancestor) return;

  if (grand?.id === "emblems") editEmblem(undefined, undefined, el);
  else if (parent?.id === "rivers") editRiver(el!.id);
  else if (grand?.id === "routes") editRoute(el!.id);
  else if (ancestor.id === "labels" && el?.tagName === "tspan") editLabel(el);
  else if (grand?.id === "burgLabels") editBurg(+(el as SVGElement).dataset.id!);
  else if (grand?.id === "burgIcons") editBurg(+(el as SVGElement).dataset.id!);
  else if (parent?.id === "ice") editIce(el as SVGElement);
  else if (parent?.id === "terrain") editReliefIcon(el as SVGElement);
  else if (grand?.id === "markers" || great?.id === "markers") editMarker();
  else if (grand?.id === "coastline") editCoastline(event);
  else if (grand?.id === "lakes") editLake(event);
  else if (great?.id === "armies") editRegiment(el?.parentElement ?? undefined);
}

export function unselect(): void {
  restoreDefaultEvents();
  if (!elSelected) return;
  elSelected!.call(d3.drag<any, unknown>().on("drag", null)).attr("class", null);
  debug.selectAll("*").remove();
  viewbox.style("cursor", "default");
  elSelected = null;
}

export function closeDialogs(except = "#except"): void {
  try {
    $(".dialog:visible")
      .not(except)
      .each(function (this: Element) {
        $(this).dialog("close");
      });
  } catch (_) {}
}

// ─── Brush circle ──────────────────────────────────────────────────────────

export function moveCircle(x: number, y: number, r = 20): void {
  const circle = document.getElementById("brushCircle");
  if (!circle) {
    ensureEl("debug").insertAdjacentHTML(
      "afterBegin" as InsertPosition,
      `<circle id="brushCircle" cx=${x} cy=${y} r=${r}></circle>`
    );
  } else {
    circle.setAttribute("cx", String(x));
    circle.setAttribute("cy", String(y));
    circle.setAttribute("r", String(r));
  }
}

export function removeCircle(): void {
  document.getElementById("brushCircle")?.remove();
}

// ─── Misc editor utilities ────────────────────────────────────────────────

export function fitContent(): string {
  return !("chrome" in window) ? "-moz-max-content" : "fit-content";
}

// ─── Legend ────────────────────────────────────────────────────────────────

export function drawLegend(name: string, data: Array<[string | number, string, string]>): void {
  legend.selectAll("*").remove();
  legend.attr("data", data.join("|"));

  const itemsInCol = +(document.getElementById("styleLegendColItems") as HTMLInputElement).value;
  const fontSize = +legend.attr("font-size");
  const backClr = (document.getElementById("styleLegendBack") as HTMLInputElement).value;
  const opacity = +(document.getElementById("styleLegendOpacity") as HTMLInputElement).value;

  const lineHeight = Math.round(fontSize * 1.7);
  const colorBoxSize = Math.round(fontSize / 1.7);
  const colOffset = fontSize;
  const vOffset = fontSize / 2;

  const boxes = legend.append("g").attr("stroke-width", 0.5).attr("stroke", "#111111").attr("stroke-dasharray", "none");
  const labels = legend.append("g").attr("fill", "#000000").attr("stroke", "none");

  const columns = Math.ceil(data.length / itemsInCol);
  for (let column = 0, i = 0; column < columns; column++) {
    const linesInColumn = Math.ceil(data.length / columns);
    const offset = column ? colOffset * 2 + (legend.node() as SVGGElement).getBBox().width : colOffset;

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

  const labelOffset = colOffset + (legend.node() as SVGGElement).getBBox().width / 2;
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

  const bbox = (legend.node() as SVGGElement).getBBox();
  const width = bbox.width + colOffset * 2;
  const height = bbox.height + colOffset / 2 + vOffset;

  legend
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
  if (!legend.selectAll("*").size()) return;
  const px = Number.isNaN(+legend.attr("data-x")) ? 99 : +legend.attr("data-x") / 100;
  const py = Number.isNaN(+legend.attr("data-y")) ? 93 : +legend.attr("data-y") / 100;
  const bbox = (legend.node() as SVGGElement).getBBox();
  const x = rn(svgWidth * px - bbox.width);
  const y = rn(svgHeight * py - bbox.height);
  legend.attr("transform", `translate(${x},${y})`);
}

export function redrawLegend(): void {
  if (legend.select("rect").size()) {
    const name = legend.select("#legendLabel").text();
    const data = legend
      .attr("data")
      .split("|")
      .map((l: string) => l.split(",") as [string, string, string]);
    drawLegend(name, data);
  }
}

export function clearLegend(): void {
  legend.selectAll("*").remove();
  legend.attr("data", null);
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
  picker.attr("transform", `translate(${(svgWidth - width) / 2},${(svgHeight - height) / 2})`);
}

function updateSelectedRect(fill: string): void {
  ensureEl("picker").querySelector<Element>("rect.selected")!.classList.remove("selected");
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

  const clr = d3.rgb(d3.hsl(h, s, l) as unknown as string);
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

export const openPicker: OpenPickerFn = (fill: string, callback: (fill: string) => void): void => {
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
    const selected = ensureEl("picker").querySelector<Element>("rect.selected");
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

  const clr = d3.hsl(fill as unknown as string);
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
  if (defs.select(`#fog #${id}`).size()) return;
  const fadeIn = d3.transition().duration(2000).ease(d3.easeSinInOut);
  if (defs.select("#fog path").size()) {
    defs
      .select("#fog")
      .append("path")
      .attr("d", path)
      .attr("id", id)
      .attr("opacity", 0)
      .transition(fadeIn)
      .attr("opacity", 1);
  } else {
    defs.select("#fog").append("path").attr("d", path).attr("id", id).attr("opacity", 1);
    const opacity = fogging.attr("opacity");
    fogging.style("display", "block").attr("opacity", 0).transition(fadeIn).attr("opacity", opacity);
  }
}

export function unfog(id?: string): void {
  let el = id ? defs.select(`#fog #${id}`) : (defs.select(null) as ReturnType<typeof defs.select>);
  if (!id || !el.size()) el = defs.select("#fog").selectAll("path") as typeof el;
  el.remove();
  if (!defs.selectAll("#fog path").size()) fogging.style("display", "none");
}

// ─── File utilities ────────────────────────────────────────────────────────

export function getFileName(dataType?: string): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const name = mapName.value;
  const type = dataType ? `${dataType} ` : "";
  const date = new Date();
  const dateString = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes())
  ].join("-");
  return `${name} ${type}${dateString}`;
}

export function downloadFile(data: string | Blob, name: string, type = "text/plain"): void {
  const dataBlob = data instanceof Blob ? data : new Blob([data], { type });
  const url = window.URL.createObjectURL(dataBlob);
  const link = document.createElement("a");
  link.download = name;
  link.href = url;
  link.click();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 2000);
}

export function uploadFile(el: HTMLInputElement, callback: (data: string) => void): void {
  const fileReader = new FileReader();
  fileReader.readAsText(el.files![0], "UTF-8");
  el.value = "";
  fileReader.onload = loaded => callback((loaded.target as FileReader).result as string);
}

function getBBox(element: SVGRectElement): { x: number; y: number; width: number; height: number } {
  return {
    x: +element.getAttribute("x")!,
    y: +element.getAttribute("y")!,
    width: +element.getAttribute("width")!,
    height: +element.getAttribute("height")!
  };
}

export function highlightElement(element: Element, zoom?: number): void {
  if (debug.select(".highlighted").size()) return;
  const box =
    element.tagName === "svg" ? getBBox(element as SVGRectElement) : (element as SVGGraphicsElement).getBBox();
  const transform = element.getAttribute("transform") ?? null;
  const enter = d3.transition().duration(1000).ease(d3.easeBounceOut);

  const highlight = debug
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
    zoomTo(x, y, scale > 2 ? scale : zoom, 1600);
  }
}

// ─── Icon selector ─────────────────────────────────────────────────────────

export function selectIcon(initial: string, callback: (value: string) => void): void {
  if (!callback) return;
  $("#iconSelector").dialog();

  const table = ensureEl<HTMLTableElement>("iconTable");
  const iconInput = ensureEl<HTMLInputElement>("iconInput");
  iconInput.value = initial;

  if (!table.innerHTML) {
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
      row!.insertCell(i % 17).innerHTML = icons[i];
    }

    const externalResources = new Set<string>();
    const isExternal = (url: string) => url.startsWith("http") || url.startsWith("data:image");

    (options.military as Array<{ icon: string }>)?.forEach(unit => {
      if (isExternal(unit.icon)) externalResources.add(unit.icon);
    });
    pack.states.forEach(state => {
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
    const addedIcons = ensureEl("addedIcons");
    const image = document.createElement("div");
    image.style.cssText = `width: 2.2em; height: 2.2em; background-size: cover; background-image: url(${url})`;
    addedIcons.appendChild(image);
    image.onclick = () => callback(url);
  }

  const addImageBtn = ensureEl<HTMLButtonElement>("addImage");
  addImageBtn.onclick = () => {
    const urlInput = addImageBtn.previousElementSibling as HTMLInputElement;
    const url = urlInput.value;
    if (!url) return tip("Enter image URL to add", false, "error", 4000);
    if (!url.match(/^((http|https):\/\/)|data:image\//)) return tip("Enter valid URL", false, "error", 4000);
    addExternalImage(url);
    callback(url);
    urlInput.value = "";
  };

  ensureEl("addedIcons")
    .querySelectorAll<HTMLElement>("div")
    .forEach(div => {
      div.onclick = () => callback(div.style.backgroundImage.slice(5, -2));
    });

  $("#iconSelector").dialog({
    width: fitContent(),
    title: "Select Icon",
    buttons: {
      Apply: function (this: Element) {
        $(this).dialog("close");
      },
      Close: function (this: Element) {
        callback(initial);
        $(this).dialog("close");
      }
    }
  });
}

// ─── Area / units ──────────────────────────────────────────────────────────

export function getAreaUnit(squareMark = "²"): string {
  const areaUnitEl = ensureEl<HTMLSelectElement>("areaUnit");
  return areaUnitEl.value === "square"
    ? ensureEl<HTMLInputElement>("distanceUnitInput").value + squareMark
    : areaUnitEl.value;
}

export function getArea(rawArea: number): number {
  return rawArea * distanceScale ** 2;
}

// ─── Confirmation dialog ───────────────────────────────────────────────────

export function confirmationDialog(opts: {
  title?: string;
  message?: string;
  cancel?: string;
  confirm?: string;
  onCancel?: () => void;
  onConfirm?: () => void;
}): void {
  const {
    title = "Confirm action",
    message = "Are you sure you want to continue? <br>The action cannot be reverted",
    cancel = "Cancel",
    confirm = "Continue",
    onCancel,
    onConfirm
  } = opts;

  const buttons: Record<string, (this: Element) => void> = {
    [confirm]: function (this: Element) {
      onConfirm?.();
      $(this).dialog("close");
    },
    [cancel]: function (this: Element) {
      onCancel?.();
      $(this).dialog("close");
    }
  };

  ensureEl("alertMessage").innerHTML = message;
  $("#alert").dialog({ resizable: false, title, buttons });
}

// ─── Event listener helper ─────────────────────────────────────────────────

export function listen(element: EventTarget, event: string, handler: EventListener): () => void {
  element.addEventListener(event, handler);
  return () => element.removeEventListener(event, handler);
}

// ─── Refresh all open editors ─────────────────────────────────────────────

export function refreshAllEditors(): void {
  TIME && console.time("refreshAllEditors");
  if (document.getElementById("culturesEditorRefresh")?.offsetParent)
    (document.getElementById("culturesEditorRefresh") as HTMLButtonElement).click();
  if (ensureEl("biomesEditorRefresh").offsetParent) ensureEl<HTMLButtonElement>("biomesEditorRefresh").click();
  if (ensureEl("diplomacyEditorRefresh").offsetParent) ensureEl<HTMLButtonElement>("diplomacyEditorRefresh").click();
  if (ensureEl("provincesEditorRefresh").offsetParent) ensureEl<HTMLButtonElement>("provincesEditorRefresh").click();
  if (document.getElementById("religionsEditorRefresh")?.offsetParent)
    (document.getElementById("religionsEditorRefresh") as HTMLButtonElement).click();
  if (document.getElementById("statesEditorRefresh")?.offsetParent)
    (document.getElementById("statesEditorRefresh") as HTMLButtonElement).click();
  if (ensureEl("zonesEditorRefresh").offsetParent) ensureEl<HTMLButtonElement>("zonesEditorRefresh").click();
  TIME && console.timeEnd("refreshAllEditors");
}

// ─── Dynamic editor launchers ─────────────────────────────────────────────

export function editStates(): void {
  if (customization) return;
  openStatesEditor();
}

export function editCultures(): void {
  if (customization) return;
  openCulturesEditor();
}

export function editReligions(): void {
  if (customization) return;
  openReligionsEditor();
}

export function editCoastlineSettings(): void {
  if (customization) return;
  coastlineEditor.open();
}

// ─── Global registration ───────────────────────────────────────────────────

if (!window.modules) window.modules = {};
window.modules.editors = true;
