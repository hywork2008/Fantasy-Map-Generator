"use strict";
class LabelsEditor {
  public open() {
    if (customization) return;
    closeDialogs();
    if (!layerIsOn("toggleLabels")) toggleLabels();

    const tspan = d3.event.target;
    const textPath = tspan.parentNode;
    const text = textPath.parentNode;
    elSelected = d3.select(text).call(d3.drag().on("start", () => this.dragLabel())).classed("draggable", true);
    viewbox.on("touchmove mousemove", () => this.showEditorTips());

    $("#labelEditor").dialog({
      title: "Edit Label",
      resizable: false,
      width: fitContent(),
      position: {my: "center top+10", at: "bottom", of: text, collision: "fit"},
      close: () => this.closeLabelEditor()
    });

    this.drawControlPointsAndLine();
    this.selectLabelGroup(text);
    this.updateValues(textPath);

    if (modules.editLabel) return;
    modules.editLabel = true;

    ensureEl("labelGroupShow").on("click", () => this.showGroupSection());
    ensureEl("labelGroupHide").on("click", () => this.hideGroupSection());
    ensureEl("labelGroupSelect").on("click", () => this.changeGroup());
    ensureEl("labelGroupInput").on("change", () => this.createNewGroup());
    ensureEl("labelGroupNew").on("click", () => this.toggleNewGroupInput());
    ensureEl("labelGroupRemove").on("click", () => this.removeLabelsGroup());

    ensureEl("labelTextShow").on("click", () => this.showTextSection());
    ensureEl("labelTextHide").on("click", () => this.hideTextSection());
    ensureEl("labelText").on("input", () => this.changeText());
    ensureEl("labelTextRandom").on("click", () => this.generateRandomName());

    ensureEl("labelEditStyle").on("click", () => this.editGroupStyle());

    ensureEl("labelSizeShow").on("click", () => this.showSizeSection());
    ensureEl("labelSizeHide").on("click", () => this.hideSizeSection());
    ensureEl("labelOffsetShow").on("click", () => this.showOffsetSection());
    ensureEl("labelOffsetHide").on("click", () => this.hideOffsetSection());
    ensureEl("labelStartOffset").on("input", () => this.changeStartOffset());
    ensureEl("labelStartOffsetValue").on("input", () => this.changeStartOffsetFromValue());
    ensureEl("labelRelativeSize").on("input", () => this.changeRelativeSize());

    ensureEl("labelLetterSpacingShow").on("click", () => this.showLetterSpacingSection());
    ensureEl("labelLetterSpacingHide").on("click", () => this.hideLetterSpacingSection());
    ensureEl("labelLetterSpacingSize").on("input", () => this.changeLetterSpacingSize());

    ensureEl("labelAlign").on("click", () => this.editLabelAlign());
    ensureEl("labelLegend").on("click", () => this.editLabelLegend());
    ensureEl("labelRemoveSingle").on("click", () => this.removeLabel());
  }

  private showEditorTips() {
    showMainTip();
    if (d3.event.target.parentNode.parentNode.id === elSelected.attr("id")) tip("Drag to shift the label");
    else if (d3.event.target.parentNode.id === "controlPoints") {
      if (d3.event.target.tagName === "circle") tip("Drag to move, click to delete the control point");
      if (d3.event.target.tagName === "path") tip("Click to add a control point");
    }
  }

  private selectLabelGroup(text: Element) {
    const group = (text.parentNode as Element).id;

    if (group === "states" || group === "burgLabels") {
      (ensureEl("labelGroupShow") as HTMLElement).style.display = "none";
      return;
    }

    this.hideGroupSection();
    const select = ensureEl("labelGroupSelect") as HTMLSelectElement;
    select.options.length = 0;

    labels.selectAll(":scope > g").each(function(this: SVGGElement) {
      if (this.id === "states") return;
      if (this.id === "burgLabels") return;
      select.options.add(new Option(this.id, this.id, false, this.id === group));
    });
  }

  private updateValues(textPath: Element) {
    (ensureEl("labelText") as HTMLInputElement).value = [...textPath.querySelectorAll("tspan")].map((t: Element) => t.textContent).join("|");
    const startOffset = parseFloat(textPath.getAttribute("startOffset") || "0");
    (ensureEl("labelStartOffset") as HTMLInputElement).value = String(startOffset);
    (ensureEl("labelStartOffsetValue") as HTMLInputElement).value = String(startOffset);
    (ensureEl("labelRelativeSize") as HTMLInputElement).value = String(parseFloat(textPath.getAttribute("font-size") || "0"));
    const letterSpacing = textPath.getAttribute("letter-spacing") || "0";
    (ensureEl("labelLetterSpacingSize") as HTMLInputElement).value = String(parseFloat(letterSpacing));
  }

  private drawControlPointsAndLine() {
    debug.select("#controlPoints").remove();
    debug.append("g").attr("id", "controlPoints").attr("transform", elSelected.attr("transform"));
    const path = ensureEl("textPath_" + elSelected.attr("id")) as SVGPathElement;
    debug.select("#controlPoints").append("path").attr("d", path.getAttribute("d")).on("click", () => this.addInterimControlPoint());
    const l = path.getTotalLength();
    if (!l) return;
    const increment = l / Math.max(Math.ceil(l / 200), 2);
    for (let i = 0; i <= l; i += increment) {
      this.addControlPoint(path.getPointAtLength(i));
    }
  }

  private addControlPoint(point: DOMPoint) {
    debug
      .select("#controlPoints")
      .append("circle")
      .attr("cx", point.x)
      .attr("cy", point.y)
      .attr("r", 2.5)
      .attr("stroke-width", 0.8)
      .call(d3.drag().on("drag", function(this: SVGCircleElement) {
        this.setAttribute("cx", String(d3.event.x));
        this.setAttribute("cy", String(d3.event.y));
        labelsEditorSelf.redrawLabelPath();
      }))
      .on("click", function(this: SVGCircleElement) {
        this.remove();
        labelsEditorSelf.redrawLabelPath();
      });
  }

  public redrawLabelPath() {
    const path = ensureEl("textPath_" + elSelected.attr("id")) as SVGPathElement;
    lineGen.curve(d3.curveNatural);
    const points: [string, string][] = [];
    debug
      .select("#controlPoints")
      .selectAll("circle")
      .each(function(this: SVGCircleElement) {
        points.push([this.getAttribute("cx")!, this.getAttribute("cy")!]);
      });
    const d = round(lineGen(points));
    path.setAttribute("d", d);
    debug.select("#controlPoints > path").attr("d", d);
  }

  private addInterimControlPoint() {
    const point = d3.mouse(viewbox.node());

    const dists: number[] = [];
    debug
      .select("#controlPoints")
      .selectAll("circle")
      .each(function(this: SVGCircleElement) {
        const x = +this.getAttribute("cx")!;
        const y = +this.getAttribute("cy")!;
        dists.push((point[0] - x) ** 2 + (point[1] - y) ** 2);
      });

    let index = dists.length;
    if (dists.length > 1) {
      const sorted = dists.slice(0).sort((a: number, b: number) => a - b);
      const closest = dists.indexOf(sorted[0]);
      const next = dists.indexOf(sorted[1]);
      if (closest <= next) index = closest + 1;
      else index = next + 1;
    }

    const before = ":nth-child(" + (index + 2) + ")";
    debug
      .select("#controlPoints")
      .insert("circle", before)
      .attr("cx", point[0])
      .attr("cy", point[1])
      .attr("r", 2.5)
      .attr("stroke-width", 0.8)
      .call(d3.drag().on("drag", function(this: SVGCircleElement) {
        this.setAttribute("cx", String(d3.event.x));
        this.setAttribute("cy", String(d3.event.y));
        labelsEditorSelf.redrawLabelPath();
      }))
      .on("click", function(this: SVGCircleElement) {
        this.remove();
        labelsEditorSelf.redrawLabelPath();
      });

    this.redrawLabelPath();
  }

  private dragLabel() {
    const tr = parseTransform(elSelected.attr("transform"));
    const dx = +tr[0] - d3.event.x,
      dy = +tr[1] - d3.event.y;

    d3.event.on("drag", () => {
      const x = d3.event.x,
        y = d3.event.y;
      const transform = `translate(${dx + x},${dy + y})`;
      elSelected.attr("transform", transform);
      debug.select("#controlPoints").attr("transform", transform);
    });
  }

  private showGroupSection() {
    document.querySelectorAll("#labelEditor > button").forEach((el: Element) => ((el as HTMLElement).style.display = "none"));
    (ensureEl("labelGroupSection") as HTMLElement).style.display = "inline-block";
  }

  private hideGroupSection() {
    document.querySelectorAll("#labelEditor > button").forEach((el: Element) => ((el as HTMLElement).style.display = "inline-block"));
    (ensureEl("labelGroupSection") as HTMLElement).style.display = "none";
    (ensureEl("labelGroupInput") as HTMLElement).style.display = "none";
    (ensureEl("labelGroupInput") as HTMLInputElement).value = "";
    (ensureEl("labelGroupSelect") as HTMLElement).style.display = "inline-block";
  }

  private changeGroup() {
    const value = (ensureEl("labelGroupSelect") as HTMLSelectElement).value;
    ensureEl(value).appendChild(elSelected.node());
  }

  private toggleNewGroupInput() {
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

  private createNewGroup() {
    const labelGroupInput = ensureEl("labelGroupInput") as HTMLInputElement;
    const labelGroupSelect = ensureEl("labelGroupSelect") as HTMLSelectElement;
    if (!labelGroupInput.value) {
      tip("Please provide a valid group name");
      return;
    }
    const group = labelGroupInput.value
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

    const oldGroup = elSelected.node().parentNode;
    if (oldGroup !== "states" && oldGroup !== "addedLabels" && oldGroup.childElementCount === 1) {
      labelGroupSelect.selectedOptions[0].remove();
      labelGroupSelect.options.add(new Option(group, group, false, true));
      oldGroup.id = group;
      this.toggleNewGroupInput();
      labelGroupInput.value = "";
      return;
    }

    const newGroup = elSelected.node().parentNode.cloneNode(false);
    ensureEl("labels").appendChild(newGroup);
    (newGroup as Element).id = group;
    labelGroupSelect.options.add(new Option(group, group, false, true));
    ensureEl(group).appendChild(elSelected.node());

    this.toggleNewGroupInput();
    labelGroupInput.value = "";
  }

  private removeLabelsGroup() {
    const group = elSelected.node().parentNode.id;
    const basic = group === "states" || group === "addedLabels";
    const count = elSelected.node().parentNode.childElementCount;
    alertMessage.innerHTML = /* html */ `Are you sure you want to remove ${
      basic ? "all elements in the group" : "the entire label group"
    }? <br /><br />Labels to be
      removed: ${count}`;
    $("#alert").dialog({
      resizable: false,
      title: "Remove route group",
      buttons: {
        Remove: () => {
          $("#alert").dialog("close");
          $("#labelEditor").dialog("close");
          this.hideGroupSection();
          labels
            .select("#" + group)
            .selectAll("text")
            .each(function(this: SVGTextElement) {
              ensureEl("textPath_" + this.id).remove();
              this.remove();
            });
          if (!basic) labels.select("#" + group).remove();
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  private showTextSection() {
    document.querySelectorAll("#labelEditor > button").forEach((el: Element) => ((el as HTMLElement).style.display = "none"));
    (ensureEl("labelTextSection") as HTMLElement).style.display = "inline-block";
  }

  private hideTextSection() {
    document.querySelectorAll("#labelEditor > button").forEach((el: Element) => ((el as HTMLElement).style.display = "inline-block"));
    (ensureEl("labelTextSection") as HTMLElement).style.display = "none";
  }

  private changeText() {
    const input = (ensureEl("labelText") as HTMLInputElement).value;
    const el = elSelected.select("textPath").node();

    const lines = input.split("|");
    if (lines.length > 1) {
      const top = (lines.length - 1) / -2;
      el.innerHTML = lines.map((line: string, index: number) => `<tspan x="0" dy="${index ? 1 : top}em">${line}</tspan>`).join("");
    } else el.innerHTML = `<tspan x="0">${lines}</tspan>`;

    if (elSelected.attr("id").slice(0, 10) === "stateLabel")
      tip("Use States Editor to change an actual state name, not just a label", false, "warn");
  }

  private generateRandomName() {
    let name = "";
    if (elSelected.attr("id").slice(0, 10) === "stateLabel") {
      const id = +elSelected.attr("id").slice(10);
      const culture = pack.states[id].culture;
      name = Names.getState(Names.getCulture(culture, 4, 7, ""), culture);
    } else {
      const box = elSelected.node().getBBox();
      const cell = findCell((box.x + box.width) / 2, (box.y + box.height) / 2);
      const culture = pack.cells.culture[cell];
      name = Names.getCulture(culture);
    }
    (ensureEl("labelText") as HTMLInputElement).value = name;
    this.changeText();
  }

  private editGroupStyle() {
    const g = elSelected.node().parentNode.id;
    editStyle("labels", g);
  }

  private showSizeSection() {
    document.querySelectorAll("#labelEditor > button").forEach((el: Element) => ((el as HTMLElement).style.display = "none"));
    (ensureEl("labelSizeSection") as HTMLElement).style.display = "inline-block";
  }

  private hideSizeSection() {
    document.querySelectorAll("#labelEditor > button").forEach((el: Element) => ((el as HTMLElement).style.display = "inline-block"));
    (ensureEl("labelSizeSection") as HTMLElement).style.display = "none";
  }

  private showOffsetSection() {
    document.querySelectorAll("#labelEditor > button").forEach((el: Element) => ((el as HTMLElement).style.display = "none"));
    (ensureEl("labelOffsetSection") as HTMLElement).style.display = "inline-block";
  }

  private hideOffsetSection() {
    document.querySelectorAll("#labelEditor > button").forEach((el: Element) => ((el as HTMLElement).style.display = "inline-block"));
    (ensureEl("labelOffsetSection") as HTMLElement).style.display = "none";
  }

  private showLetterSpacingSection() {
    document.querySelectorAll("#labelEditor > button").forEach((el: Element) => ((el as HTMLElement).style.display = "none"));
    (ensureEl("labelLetterSpacingSection") as HTMLElement).style.display = "inline-block";
  }

  private hideLetterSpacingSection() {
    document.querySelectorAll("#labelEditor > button").forEach((el: Element) => ((el as HTMLElement).style.display = "inline-block"));
    (ensureEl("labelLetterSpacingSection") as HTMLElement).style.display = "none";
  }

  private changeStartOffset() {
    const value = (ensureEl("labelStartOffset") as HTMLInputElement).value;
    (ensureEl("labelStartOffsetValue") as HTMLInputElement).value = value;
    elSelected.select("textPath").attr("startOffset", value + "%");
    tip("Label offset: " + value + "%");
  }

  private changeStartOffsetFromValue() {
    const raw = +(ensureEl("labelStartOffsetValue") as HTMLInputElement).value;
    const value = Math.min(80, Math.max(20, raw));
    (ensureEl("labelStartOffset") as HTMLInputElement).value = String(value);
    (ensureEl("labelStartOffsetValue") as HTMLInputElement).value = String(value);
    elSelected.select("textPath").attr("startOffset", value + "%");
    tip("Label offset: " + value + "%");
  }

  private changeRelativeSize() {
    const value = (ensureEl("labelRelativeSize") as HTMLInputElement).value;
    elSelected.select("textPath").attr("font-size", value + "%");
    tip("Label relative size: " + value + "%");
    this.changeText();
  }

  private changeLetterSpacingSize() {
    const value = (ensureEl("labelLetterSpacingSize") as HTMLInputElement).value;
    elSelected.select("textPath").attr("letter-spacing", value + "px");
    tip("Label letter-spacing size: " + value + "px");
    this.changeText();
  }

  private editLabelAlign() {
    const bbox = elSelected.node().getBBox();
    const c = [bbox.x + bbox.width / 2, bbox.y + bbox.height / 2];
    const path = defs.select("#textPath_" + elSelected.attr("id"));
    path.attr("d", `M${c[0] - bbox.width},${c[1]}h${bbox.width * 2}`);
    this.drawControlPointsAndLine();
  }

  private editLabelLegend() {
    const id = elSelected.attr("id");
    const name = elSelected.text();
    editNotes(id, name);
  }

  private removeLabel() {
    alertMessage.innerHTML = "Are you sure you want to remove the label?";
    $("#alert").dialog({
      resizable: false,
      title: "Remove label",
      buttons: {
        Remove: () => {
          $("#alert").dialog("close");
          defs.select("#textPath_" + elSelected.attr("id")).remove();
          elSelected.remove();
          $("#labelEditor").dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  private closeLabelEditor() {
    debug.select("#controlPoints").remove();
    unselect();
  }
}

const labelsEditorController = new LabelsEditor();
const labelsEditorSelf = labelsEditorController;

function editLabel() {
  labelsEditorController.open();
}
