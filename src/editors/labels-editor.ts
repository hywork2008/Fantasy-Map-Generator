import { curveNatural, type D3DragEvent, drag, pointer, select } from "d3";
import { ensureEl, findCell, parseTransform, round } from "../utils";
import { editNotes } from "./notes-editor";

export function editLabel(tspan?: Element): void {
  if (customization) return;
  closeDialogs();
  if (!layerIsOn("toggleLabels")) toggleLabels();

  const textPath = tspan?.parentNode as SVGTextPathElement | undefined;
  const text = textPath?.parentNode as SVGTextElement | undefined;
  let _ldx = 0,
    _ldy = 0;
  elSelected = select(text as SVGTextElement)
    .call(
      drag<SVGTextElement, unknown>()
        .on("start", (event: D3DragEvent<SVGTextElement, unknown, unknown>) => {
          const tr = parseTransform(elSelected!.attr("transform"));
          _ldx = +tr[0] - event.x;
          _ldy = +tr[1] - event.y;
        })
        .on("drag", (event: D3DragEvent<SVGTextElement, unknown, unknown>) => {
          const transform = `translate(${_ldx + event.x},${_ldy + event.y})`;
          elSelected!.attr("transform", transform);
          debug.select("#controlPoints").attr("transform", transform);
        })
    )
    .classed("draggable", true);
  viewbox.on("touchmove mousemove", showEditorTips);

  $("#labelEditor").dialog({
    title: "Edit Label",
    resizable: false,
    width: fitContent(),
    position: { my: "center top+10", at: "bottom", of: text, collision: "fit" },
    close: closeLabelEditor
  });

  drawControlPointsAndLine();
  selectLabelGroup(text!);
  updateValues(textPath!);

  if (modules.editLabel) return;
  modules.editLabel = true;

  // add listeners
  ensureEl("labelGroupShow").on("click", showGroupSection);
  ensureEl("labelGroupHide").on("click", hideGroupSection);
  ensureEl("labelGroupSelect").on("click", changeGroup);
  ensureEl("labelGroupInput").on("change", createNewGroup);
  ensureEl("labelGroupNew").on("click", toggleNewGroupInput);
  ensureEl("labelGroupRemove").on("click", removeLabelsGroup);

  ensureEl("labelTextShow").on("click", showTextSection);
  ensureEl("labelTextHide").on("click", hideTextSection);
  ensureEl("labelText").on("input", changeText);
  ensureEl("labelTextRandom").on("click", generateRandomName);

  ensureEl("labelEditStyle").on("click", editGroupStyle);

  ensureEl("labelSizeShow").on("click", showSizeSection);
  ensureEl("labelSizeHide").on("click", hideSizeSection);
  ensureEl("labelOffsetShow").on("click", showOffsetSection);
  ensureEl("labelOffsetHide").on("click", hideOffsetSection);
  ensureEl("labelStartOffset").on("input", changeStartOffset);
  ensureEl("labelStartOffsetValue").on("input", changeStartOffsetFromValue);
  ensureEl("labelRelativeSize").on("input", changeRelativeSize);

  ensureEl("labelLetterSpacingShow").on("click", showLetterSpacingSection);
  ensureEl("labelLetterSpacingHide").on("click", hideLetterSpacingSection);
  ensureEl("labelLetterSpacingSize").on("input", changeLetterSpacingSize);

  ensureEl("labelAlign").on("click", editLabelAlign);
  ensureEl("labelLegend").on("click", editLabelLegend);
  ensureEl("labelRemoveSingle").on("click", removeLabel);

  function showEditorTips(this: SVGElement, event: MouseEvent): void {
    showMainTip();
    if ((event.target as SVGElement).parentNode?.parentNode === elSelected?.node()) tip("Drag to shift the label");
    else if (((event.target as SVGElement).parentNode as Element)?.id === "controlPoints") {
      if ((event.target as SVGElement).tagName === "circle") tip("Drag to move, click to delete the control point");
      if ((event.target as SVGElement).tagName === "path") tip("Click to add a control point");
    }
  }

  function selectLabelGroup(textEl: SVGTextElement): void {
    const group = textEl.parentNode ? (textEl.parentNode as SVGGElement).id : "";

    if (group === "states" || group === "burgLabels") {
      ensureEl("labelGroupShow").style.display = "none";
      return;
    }

    hideGroupSection();
    const select = ensureEl("labelGroupSelect") as HTMLSelectElement;
    select.options.length = 0;

    labels.selectAll<SVGGElement, unknown>(":scope > g").each(function (this: SVGGElement) {
      if (this.id === "states") return;
      if (this.id === "burgLabels") return;
      select.options.add(new Option(this.id, this.id, false, this.id === group));
    });
  }

  function updateValues(textPathEl: SVGTextPathElement): void {
    (ensureEl("labelText") as HTMLInputElement).value = [...textPathEl.querySelectorAll("tspan")]
      .map(ts => ts.textContent)
      .join("|");
    const startOffset = parseFloat(textPathEl.getAttribute("startOffset") || "0");
    (ensureEl("labelStartOffset") as HTMLInputElement).value = String(startOffset);
    (ensureEl("labelStartOffsetValue") as HTMLInputElement).value = String(startOffset);
    (ensureEl("labelRelativeSize") as HTMLInputElement).value = String(
      parseFloat(textPathEl.getAttribute("font-size") || "100")
    );
    const letterSpacingSize = textPathEl.getAttribute("letter-spacing")
      ? textPathEl.getAttribute("letter-spacing")
      : "0";
    (ensureEl("labelLetterSpacingSize") as HTMLInputElement).value = String(parseFloat(letterSpacingSize!));
  }

  function drawControlPointsAndLine(): void {
    debug.select("#controlPoints").remove();
    debug.append("g").attr("id", "controlPoints").attr("transform", elSelected!.attr("transform"));
    const path = ensureEl(`textPath_${elSelected!.attr("id")}`) as unknown as SVGPathElement;
    debug.select("#controlPoints").append("path").attr("d", path.getAttribute("d")).on("click", addInterimControlPoint);
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
    debug
      .select("#controlPoints")
      .append("circle")
      .attr("cx", pt.x)
      .attr("cy", pt.y)
      .attr("r", 2.5)
      .attr("stroke-width", 0.8)
      .call(drag<SVGCircleElement, unknown>().on("drag", dragControlPoint))
      .on("click", clickControlPoint);
  }

  function redrawLabelPath(): void {
    const path = ensureEl(`textPath_${elSelected!.attr("id")}`) as unknown as SVGPathElement;
    lineGen.curve(curveNatural);
    const points: [number, number][] = [];
    debug
      .select("#controlPoints")
      .selectAll<SVGCircleElement, unknown>("circle")
      .each(function (this: SVGCircleElement) {
        points.push([+this.getAttribute("cx")!, +this.getAttribute("cy")!]);
      });
    const d = round(lineGen(points) ?? "");
    path.setAttribute("d", d);
    debug.select("#controlPoints > path").attr("d", d);
  }

  function clickControlPoint(this: SVGCircleElement): void {
    this.remove();
    redrawLabelPath();
  }

  function addInterimControlPoint(this: SVGPathElement, event: MouseEvent): void {
    const pt = pointer(event, this) as [number, number];

    const dists: number[] = [];
    debug
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
    debug
      .select("#controlPoints")
      .insert("circle", before)
      .attr("cx", pt[0])
      .attr("cy", pt[1])
      .attr("r", 2.5)
      .attr("stroke-width", 0.8)
      .call(drag<SVGCircleElement, unknown>().on("drag", dragControlPoint))
      .on("click", clickControlPoint);

    redrawLabelPath();
  }

  function showGroupSection(): void {
    document.querySelectorAll<HTMLElement>("#labelEditor > button").forEach(el => {
      el.style.display = "none";
    });
    ensureEl("labelGroupSection").style.display = "inline-block";
  }

  function hideGroupSection(): void {
    document.querySelectorAll<HTMLElement>("#labelEditor > button").forEach(el => {
      el.style.display = "inline-block";
    });
    (ensureEl("labelGroupSection") as HTMLElement).style.display = "none";
    (ensureEl("labelGroupInput") as HTMLInputElement).style.display = "none";
    (ensureEl("labelGroupInput") as HTMLInputElement).value = "";
    (ensureEl("labelGroupSelect") as HTMLSelectElement).style.display = "inline-block";
  }

  function changeGroup(this: HTMLSelectElement): void {
    ensureEl(this.value).appendChild(elSelected!.node()!);
  }

  function toggleNewGroupInput(): void {
    const labelGroupInput = ensureEl("labelGroupInput") as HTMLInputElement;
    const labelGroupSelect = ensureEl("labelGroupSelect") as HTMLSelectElement;
    if (labelGroupInput.style.display === "none") {
      labelGroupInput.style.display = "inline-block";
      labelGroupInput.focus();
      labelGroupSelect.style.display = "none";
    } else {
      labelGroupInput.style.display = "none";
      labelGroupSelect.style.display = "inline-block";
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

    if (document.getElementById(group)) {
      tip("Element with this id already exists. Please provide a unique name", false, "error");
      return;
    }

    if (Number.isFinite(+group.charAt(0))) {
      tip("Group name should start with a letter", false, "error");
      return;
    }

    // just rename if only 1 element left
    const oldGroup = elSelected!.node()!.parentNode as SVGGElement;
    const labelGroupSelect = ensureEl("labelGroupSelect") as HTMLSelectElement;
    if (oldGroup.id !== "states" && oldGroup.id !== "addedLabels" && oldGroup.childElementCount === 1) {
      labelGroupSelect.selectedOptions[0].remove();
      labelGroupSelect.options.add(new Option(group, group, false, true));
      oldGroup.id = group;
      toggleNewGroupInput();
      (ensureEl("labelGroupInput") as HTMLInputElement).value = "";
      return;
    }

    const newGroup = elSelected!.node()!.parentNode!.cloneNode(false) as SVGGElement;
    ensureEl("labels").appendChild(newGroup);
    newGroup.id = group;
    labelGroupSelect.options.add(new Option(group, group, false, true));
    ensureEl(group).appendChild(elSelected!.node()!);

    toggleNewGroupInput();
    (ensureEl("labelGroupInput") as HTMLInputElement).value = "";
  }

  function removeLabelsGroup(): void {
    const group = elSelected!.node()!.parentNode ? (elSelected!.node()!.parentNode as SVGGElement).id : "";
    const basic = group === "states" || group === "addedLabels";
    const count = elSelected!.node()!.parentNode
      ? (elSelected!.node()!.parentNode as SVGGElement).childElementCount
      : 0;
    alertMessage.innerHTML = /* html */ `Are you sure you want to remove ${
      basic ? "all elements in the group" : "the entire label group"
    }? <br /><br />Labels to be
      removed: ${count}`;
    $("#alert").dialog({
      resizable: false,
      title: "Remove route group",
      buttons: {
        Remove: function () {
          $(this).dialog("close");
          $("#labelEditor").dialog("close");
          hideGroupSection();
          labels
            .select(`#${group}`)
            .selectAll<SVGTextElement, unknown>("text")
            .each(function (this: SVGTextElement) {
              ensureEl(`textPath_${this.id}`).remove();
              this.remove();
            });
          if (!basic) labels.select(`#${group}`).remove();
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  function showTextSection(): void {
    document.querySelectorAll<HTMLElement>("#labelEditor > button").forEach(el => {
      el.style.display = "none";
    });
    (ensureEl("labelTextSection") as HTMLElement).style.display = "inline-block";
  }

  function hideTextSection(): void {
    document.querySelectorAll<HTMLElement>("#labelEditor > button").forEach(el => {
      el.style.display = "inline-block";
    });
    (ensureEl("labelTextSection") as HTMLElement).style.display = "none";
  }

  function changeText(): void {
    const input = (ensureEl("labelText") as HTMLInputElement).value;
    const el = elSelected!.select("textPath").node() as SVGTextPathElement;

    const lines = input.split("|");
    if (lines.length > 1) {
      const top = (lines.length - 1) / -2;
      el.innerHTML = lines.map((line, index) => `<tspan x="0" dy="${index ? 1 : top}em">${line}</tspan>`).join("");
    } else el.innerHTML = `<tspan x="0">${lines}</tspan>`;

    if (elSelected!.attr("id").slice(0, 10) === "stateLabel")
      tip("Use States Editor to change an actual state name, not just a label", false, "warn");
  }

  function generateRandomName(): void {
    let name = "";
    if (elSelected!.attr("id").slice(0, 10) === "stateLabel") {
      const id = +elSelected!.attr("id").slice(10);
      const culture = pack.states[id].culture;
      name = Names.getState(Names.getCulture(culture, 4, 7, ""), culture);
    } else {
      const box = elSelected!.node()!.getBBox();
      const cell = findCell((box.x + box.width) / 2, (box.y + box.height) / 2);
      const culture = pack.cells.culture[cell];
      name = Names.getCulture(culture);
    }
    (ensureEl("labelText") as HTMLInputElement).value = name;
    changeText();
  }

  function editGroupStyle(): void {
    const g = (elSelected!.node()!.parentNode as SVGGElement).id;
    editStyle("labels", g);
  }

  function showSizeSection(): void {
    document.querySelectorAll<HTMLElement>("#labelEditor > button").forEach(el => {
      el.style.display = "none";
    });
    (ensureEl("labelSizeSection") as HTMLElement).style.display = "inline-block";
  }

  function hideSizeSection(): void {
    document.querySelectorAll<HTMLElement>("#labelEditor > button").forEach(el => {
      el.style.display = "inline-block";
    });
    (ensureEl("labelSizeSection") as HTMLElement).style.display = "none";
  }

  function showOffsetSection(): void {
    document.querySelectorAll<HTMLElement>("#labelEditor > button").forEach(el => {
      el.style.display = "none";
    });
    (ensureEl("labelOffsetSection") as HTMLElement).style.display = "inline-block";
  }

  function hideOffsetSection(): void {
    document.querySelectorAll<HTMLElement>("#labelEditor > button").forEach(el => {
      el.style.display = "inline-block";
    });
    (ensureEl("labelOffsetSection") as HTMLElement).style.display = "none";
  }

  function showLetterSpacingSection(): void {
    document.querySelectorAll<HTMLElement>("#labelEditor > button").forEach(el => {
      el.style.display = "none";
    });
    (ensureEl("labelLetterSpacingSection") as HTMLElement).style.display = "inline-block";
  }

  function hideLetterSpacingSection(): void {
    document.querySelectorAll<HTMLElement>("#labelEditor > button").forEach(el => {
      el.style.display = "inline-block";
    });
    (ensureEl("labelLetterSpacingSection") as HTMLElement).style.display = "none";
  }

  function changeStartOffset(this: HTMLInputElement): void {
    const value = this.value;
    (ensureEl("labelStartOffsetValue") as HTMLInputElement).value = value;
    elSelected!.select("textPath").attr("startOffset", `${value}%`);
    tip(`Label offset: ${value}%`);
  }

  function changeStartOffsetFromValue(this: HTMLInputElement): void {
    const value = Math.min(80, Math.max(20, +this.value));
    (ensureEl("labelStartOffset") as HTMLInputElement).value = String(value);
    this.value = String(value);
    elSelected!.select("textPath").attr("startOffset", `${value}%`);
    tip(`Label offset: ${value}%`);
  }

  function changeRelativeSize(this: HTMLInputElement): void {
    elSelected!.select("textPath").attr("font-size", `${this.value}%`);
    tip(`Label relative size: ${this.value}%`);
    changeText();
  }

  function changeLetterSpacingSize(this: HTMLInputElement): void {
    elSelected!.select("textPath").attr("letter-spacing", `${this.value}px`);
    tip(`Label letter-spacing size: ${this.value}px`);
    changeText();
  }

  function editLabelAlign(): void {
    const bbox = elSelected!.node()!.getBBox();
    const c = [bbox.x + bbox.width / 2, bbox.y + bbox.height / 2];
    const path = defs.select(`#textPath_${elSelected!.attr("id")}`);
    path.attr("d", `M${c[0] - bbox.width},${c[1]}h${bbox.width * 2}`);
    drawControlPointsAndLine();
  }

  function editLabelLegend(): void {
    const id = elSelected!.attr("id");
    const name = elSelected!.text();
    editNotes(id, name);
  }

  function removeLabel(): void {
    alertMessage.innerHTML = "Are you sure you want to remove the label?";
    $("#alert").dialog({
      resizable: false,
      title: "Remove label",
      buttons: {
        Remove: function () {
          $(this).dialog("close");
          defs.select(`#textPath_${elSelected!.attr("id")}`).remove();
          elSelected!.remove();
          $("#labelEditor").dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  function closeLabelEditor(): void {
    debug.select("#controlPoints").remove();
    unselect();
  }
}
