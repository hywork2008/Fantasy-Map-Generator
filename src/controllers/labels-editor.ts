import { curveNatural, type D3DragEvent, drag, pointer, select } from "d3";
import { worldContext } from "../context/worldContext";
import { patchPresentation } from "../runtime/worldRuntime";
import { GenerationPipeline } from "../services/generationPipeline";
import { showMainTip, tip } from "../services/tooltipService";
import { viewLayerService as view } from "../services/viewLayerService";
import { elSelected, setElSelected } from "../store/editorState";
import { getLabelsEditorState, type LabelEditorSection, setLabelsEditorState } from "../store/labelsEditorState";
import { closeDialog, openConfirm, openDialog } from "../ui/dialogs/dialogService";
import { findCell, parseTransform, round } from "../utils";
import { EditorBus } from "../utils/editorBus";
import { layerIsOn } from "../utils/nodeUtils";
import { interactionManager } from "./interactionManager";
import { toggleLabels } from "./layers";
import { editNotes } from "./notes-editor";
import { editStyle } from "./style";

// Manual state-label edits (drag position, start offset, size, letter-spacing) must be
// persisted here, not just written to live DOM attributes. drawStateLabels() recreates
// the <text>/<textPath> elements from scratch on every redraw (including a render-mode
// toggle), so a DOM-only edit is silently lost the next time that happens.
function isStateLabel(id: string): boolean {
  return id.startsWith("stateLabel");
}

function patchStateLabelLayout(id: string, attributes: Record<string, string | number | null>): void {
  if (!isStateLabel(id)) return;
  patchPresentation({ labels: { [id]: attributes } });
}

export function editLabel(tspan?: Element): void {
  if (view.customization) return;
  if (!layerIsOn("toggleLabels")) toggleLabels();

  const textPath = tspan?.parentNode as SVGTextPathElement | undefined;
  const text = textPath?.parentNode as SVGTextElement | undefined;
  let _ldx = 0,
    _ldy = 0;

  setElSelected(select(text as Element))
    .call(
      drag<Element, unknown>()
        .on("start", (event: D3DragEvent<Element, unknown, unknown>) => {
          const tr = parseTransform(elSelected!.attr("transform"));
          _ldx = +tr[0] - event.x;
          _ldy = +tr[1] - event.y;
        })
        .on("drag", (event: D3DragEvent<Element, unknown, unknown>) => {
          const transform = `translate(${_ldx + event.x},${_ldy + event.y})`;
          elSelected!.attr("transform", transform);
          view.debug.select("#controlPoints").attr("transform", transform);
        })
        .on("end", () => {
          const [dx, dy] = parseTransform(elSelected!.attr("transform"));
          patchStateLabelLayout(elSelected!.attr("id"), { dx: +dx, dy: +dy });
        })
    )
    .classed("draggable", true);

  interactionManager.setMouseMoveHandler(showEditorTips);

  drawControlPointsAndLine();

  // Read Initial values
  const group = text!.parentNode ? (text!.parentNode as SVGGElement).id : "";
  const isBasicGroup = group === "states" || group === "burgLabels";
  const groupOptions: string[] = [];

  view.labels.selectAll<SVGGElement, unknown>(":scope > g").each(function (this: SVGGElement) {
    if (this.id === "states" || this.id === "burgLabels") return;
    groupOptions.push(this.id);
  });

  const textValue = [...textPath!.querySelectorAll("tspan")].map(ts => ts.textContent).join("|");
  const startOffset = parseFloat(textPath!.getAttribute("startOffset") || "0");
  const size = parseFloat(textPath!.getAttribute("font-size") || "100");
  const letterSpacing = parseFloat(textPath!.getAttribute("letter-spacing") || "0");

  setLabelsEditorState({
    isOpen: true,
    activeSection: null,
    group,
    groupOptions,
    isBasicGroup,
    isNewGroup: false,
    newGroupName: "",
    text: textValue,
    size,
    startOffset,
    letterSpacing
  });

  openDialog("labelEditor", { onClose: closeLabelEditor });
}

function showEditorTips(this: SVGElement, event: MouseEvent): void {
  showMainTip();
  if ((event.target as SVGElement).parentNode?.parentNode === elSelected?.node()) tip("Drag to shift the label");
  else if (((event.target as SVGElement).parentNode as Element)?.id === "controlPoints") {
    if ((event.target as SVGElement).tagName === "circle") tip("Drag to move, click to delete the control point");
    if ((event.target as SVGElement).tagName === "path") tip("Click to add a control point");
  }
}

function drawControlPointsAndLine(): void {
  view.debug.select("#controlPoints").remove();
  view.debug.append("g").attr("id", "controlPoints").attr("transform", elSelected!.attr("transform"));
  const path = view.svg.select<SVGPathElement>(`#textPath_${elSelected!.attr("id")}`).node()!;
  view.debug
    .select("#controlPoints")
    .append("path")
    .attr("d", path.getAttribute("d"))
    .on("click", addInterimControlPoint);
  const l = path.getTotalLength();
  if (!l) return;
  const increment = l / Math.max(Math.ceil(l / 200), 2);
  for (let i = 0; i <= l; i += increment) {
    addControlPoint(path.getPointAtLength(i));
  }
}

function dragControlPoint(this: SVGCircleElement, event: D3DragEvent<SVGCircleElement, unknown, unknown>): void {
  this.setAttribute("cx", String(event.x));
  this.setAttribute("cy", String(event.y));
  redrawLabelPath();
}

function addControlPoint(pt: SVGPoint): void {
  view.debug
    .select("#controlPoints")
    .append("circle")
    .attr("cx", pt.x)
    .attr("cy", pt.y)
    .attr("r", 2.5)
    .attr("stroke-width", 0.8)
    .call(drag<SVGCircleElement, unknown>().on("drag", dragControlPoint).on("end", persistLabelPath))
    .on("click", clickControlPoint);
}

function redrawLabelPath(): void {
  const path = view.svg.select<SVGPathElement>(`#textPath_${elSelected!.attr("id")}`).node()!;
  view.lineGen.curve(curveNatural);
  const points: [number, number][] = [];
  view.debug
    .select("#controlPoints")
    .selectAll<SVGCircleElement, unknown>("circle")
    .each(function (this: SVGCircleElement) {
      points.push([+this.getAttribute("cx")!, +this.getAttribute("cy")!]);
    });
  const d = round(view.lineGen(points) ?? "");
  path.setAttribute("d", d);
  view.debug.select("#controlPoints > path").attr("d", d);
}

// persist the bent curve shape (start/interim/end control points), same rationale as
// patchStateLabelLayout above: drawStateLabels() rebuilds the path from state.pole/raycast
// geometry on every redraw, so a control-point edit is otherwise lost on the next one.
function persistLabelPath(): void {
  const id = elSelected!.attr("id");
  const path = view.svg.select<SVGPathElement>(`#textPath_${id}`).node();
  patchStateLabelLayout(id, { pathD: path?.getAttribute("d") ?? null });
}

function clickControlPoint(this: SVGCircleElement): void {
  this.remove();
  redrawLabelPath();
  persistLabelPath();
}

function addInterimControlPoint(this: SVGPathElement, event: MouseEvent): void {
  const pt = pointer(event, this) as [number, number];

  const dists: number[] = [];
  view.debug
    .select("#controlPoints")
    .selectAll<SVGCircleElement, unknown>("circle")
    .each(function (this: SVGCircleElement) {
      const x = +this.getAttribute("cx")!;
      const y = +this.getAttribute("cy")!;
      dists.push((pt[0] - x) ** 2 + (pt[1] - y) ** 2);
    });

  let index = dists.length;
  if (dists.length > 1) {
    const sorted = dists.slice(0).sort((a, b) => a - b);
    const closest = dists.indexOf(sorted[0]);
    const next = dists.indexOf(sorted[1]);
    if (closest <= next) index = closest + 1;
    else index = next + 1;
  }

  const before = `:nth-child(${index + 2})`;
  view.debug
    .select("#controlPoints")
    .insert("circle", before)
    .attr("cx", pt[0])
    .attr("cy", pt[1])
    .attr("r", 2.5)
    .attr("stroke-width", 0.8)
    .call(drag<SVGCircleElement, unknown>().on("drag", dragControlPoint).on("end", persistLabelPath))
    .on("click", clickControlPoint);

  redrawLabelPath();
  persistLabelPath();
}

function toggleSection(section: LabelEditorSection): void {
  const current = getLabelsEditorState().activeSection;
  setLabelsEditorState({ activeSection: current === section ? null : section });
}

function changeGroup(newGroup: string): void {
  view.labels.select<SVGGElement>(`#${newGroup}`).node()!.appendChild(elSelected!.node()!);
  setLabelsEditorState({ group: newGroup });
}

function toggleNewGroupInput(): void {
  const { isNewGroup } = getLabelsEditorState();
  setLabelsEditorState({ isNewGroup: !isNewGroup, newGroupName: "" });
}

function changeNewGroupName(name: string): void {
  setLabelsEditorState({ newGroupName: name });
}

function createNewGroup(): void {
  const { newGroupName } = getLabelsEditorState();
  if (!newGroupName) {
    tip("Please provide a valid group name");
    return;
  }
  const groupName = newGroupName
    .toLowerCase()
    .replace(/ /g, "_")
    .replace(/[^\w\s]/gi, "");

  if (view.labels.select(`#${groupName}`).node()) {
    tip("Element with this id already exists. Please provide a unique name", false, "error");
    return;
  }

  if (Number.isFinite(+groupName.charAt(0))) {
    tip("Group name should start with a letter", false, "error");
    return;
  }

  const oldGroup = elSelected!.node()!.parentNode as SVGGElement;
  let { groupOptions } = getLabelsEditorState();

  // just rename if only 1 element left
  if (oldGroup.id !== "states" && oldGroup.id !== "addedLabels" && oldGroup.childElementCount === 1) {
    oldGroup.id = groupName;
    groupOptions = groupOptions.filter(g => g !== oldGroup.id).concat(groupName);
  } else {
    const newGroup = elSelected!.node()!.parentNode!.cloneNode(false) as SVGGElement;
    view.labels.node()!.appendChild(newGroup);
    newGroup.id = groupName;
    newGroup.appendChild(elSelected!.node()!);
    groupOptions = [...groupOptions, groupName];
  }

  setLabelsEditorState({ group: groupName, groupOptions, isNewGroup: false, newGroupName: "" });
}

function removeLabelsGroup(): void {
  const { group, isBasicGroup } = getLabelsEditorState();
  const count = elSelected!.node()!.parentNode ? (elSelected!.node()!.parentNode as SVGGElement).childElementCount : 0;

  openConfirm(
    `Are you sure you want to remove ${
      isBasicGroup ? "all elements in the group" : "the entire label group"
    }? <br /><br />Labels to be removed: ${count}`,
    {
      title: "Remove route group",
      confirm: "Remove",
      onConfirm: () => {
        closeLabelEditor();
        view.labels
          .select(`#${group}`)
          .selectAll<SVGTextElement, unknown>("text")
          .each(function (this: SVGTextElement) {
            view.defs.select(`#textPath_${this.id}`).remove();
            this.remove();
          });
        if (!isBasicGroup) view.labels.select(`#${group}`).remove();
      }
    }
  );
}

function changeText(newText: string): void {
  setLabelsEditorState({ text: newText });
  const el = elSelected!.select("textPath").node() as SVGTextPathElement;
  const lines = newText.split("|");
  if (lines.length > 1) {
    const top = (lines.length - 1) / -2;
    /* ignore-legacy-dom */ el.innerHTML = lines
      .map((line, index) => `<tspan x="0" dy="${index ? 1 : top}em">${line}</tspan>`)
      .join("");
  } else {
    // ignore-legacy-dom
    el.replaceChildren();
    el.insertAdjacentHTML("beforeend", `<tspan x="0">${lines}</tspan>`);
  }

  if (elSelected!.attr("id").slice(0, 10) === "stateLabel") {
    tip("Use States Editor to change an actual state name, not just a label", false, "warn");
  }
}

function generateRandomName(): void {
  let name = "";
  if (elSelected!.attr("id").slice(0, 10) === "stateLabel") {
    const id = +elSelected!.attr("id").slice(10);
    const culture = worldContext.pack.states[id].culture;
    name = GenerationPipeline.Names.getState(GenerationPipeline.Names.getCulture(culture, 4, 7, ""), culture);
  } else {
    const box = (elSelected!.node() as SVGGraphicsElement).getBBox();
    const cell = findCell((box.x + box.width) / 2, (box.y + box.height) / 2);
    const culture = worldContext.pack.cells.culture[cell];
    name = GenerationPipeline.Names.getCulture(culture);
  }
  changeText(name);
}

function editGroupStyle(): void {
  const g = (elSelected!.node()!.parentNode as SVGGElement).id;
  editStyle("labels", g);
}

function changeStartOffset(value: number): void {
  const val = Math.min(80, Math.max(20, value));
  setLabelsEditorState({ startOffset: val });
  elSelected!.select("textPath").attr("startOffset", `${val}%`);
  patchStateLabelLayout(elSelected!.attr("id"), { startOffset: val });
  tip(`Label offset: ${val}%`);
}

function changeRelativeSize(value: number): void {
  setLabelsEditorState({ size: value });
  elSelected!.select("textPath").attr("font-size", `${value}%`);
  patchStateLabelLayout(elSelected!.attr("id"), { size: value });
  tip(`Label relative size: ${value}%`);
  changeText(getLabelsEditorState().text);
}

function changeLetterSpacingSize(value: number): void {
  setLabelsEditorState({ letterSpacing: value });
  elSelected!.select("textPath").attr("letter-spacing", `${value}px`);
  patchStateLabelLayout(elSelected!.attr("id"), { letterSpacing: value });
  tip(`Label letter-spacing size: ${value}px`);
  changeText(getLabelsEditorState().text);
}

function editLabelAlign(): void {
  const bbox = (elSelected!.node() as SVGGraphicsElement).getBBox();
  const c = [bbox.x + bbox.width / 2, bbox.y + bbox.height / 2];
  const path = view.defs.select(`#textPath_${elSelected!.attr("id")}`);
  path.attr("d", `M${c[0] - bbox.width},${c[1]}h${bbox.width * 2}`);
  drawControlPointsAndLine();
}

function editLabelLegend(): void {
  const id = elSelected!.attr("id");
  const name = elSelected!.text();
  editNotes(id, name);
}

function removeLabel(): void {
  openConfirm("Are you sure you want to remove the label?", {
    title: "Remove label",
    confirm: "Remove",
    onConfirm: () => {
      view.defs.select(`#textPath_${elSelected!.attr("id")}`).remove();
      elSelected!.remove();
      closeLabelEditor();
    }
  });
}

export function closeLabelEditor(): void {
  if (!getLabelsEditorState().isOpen) return;
  view.debug.select("#controlPoints").remove();
  EditorBus.unselect();
  setLabelsEditorState({ isOpen: false });
  closeDialog("labelEditor");
}

export const labelsEditorActions = {
  toggleSection,
  changeGroup,
  toggleNewGroupInput,
  changeNewGroupName,
  createNewGroup,
  removeLabelsGroup,
  changeText,
  generateRandomName,
  editGroupStyle,
  changeStartOffset,
  changeRelativeSize,
  changeLetterSpacingSize,
  editLabelAlign,
  editLabelLegend,
  removeLabel
};
