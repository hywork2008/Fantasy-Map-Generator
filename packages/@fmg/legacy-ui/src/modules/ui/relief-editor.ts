"use strict";
import { removeCircle } from "./editors";
class ReliefEditor {
  public open() {
    if (customization) return;
    closeDialogs(".stable");
    if (!layerIsOn("toggleRelief")) toggleRelief();

    terrain.selectAll("use").call(
      d3.drag().on("drag", function (this: SVGUseElement) {
        const dx = +this.getAttribute("x")! - d3.event.x;
        const dy = +this.getAttribute("y")! - d3.event.y;
        d3.event.on("drag", function (this: SVGUseElement) {
          this.setAttribute("x", String(dx + d3.event.x));
          this.setAttribute("y", String(dy + d3.event.y));
        });
      })
    ).classed("draggable", true);
    elSelected = d3.select(d3.event.target);

    this.restoreEditMode();
    this.updateReliefIconSelected();
    this.updateReliefSizeInput();

    $("#reliefEditor").dialog({
      title: "Edit Relief Icons",
      resizable: false,
      width: "27em",
      position: {my: "left top", at: "left+10 top+10", of: "#map"},
      close: () => this.closeReliefEditor()
    });

    if (modules.editReliefIcon) return;
    modules.editReliefIcon = true;

    document.getElementById("reliefIndividual")!.addEventListener("click", () => this.enterIndividualMode());
    document.getElementById("reliefBulkAdd")!.addEventListener("click", () => this.enterBulkAddMode());
    document.getElementById("reliefBulkRemove")!.addEventListener("click", () => this.enterBulkRemoveMode());

    document.getElementById("reliefSize")!.addEventListener("input", () => this.changeIconSize());
    document.getElementById("reliefSizeNumber")!.addEventListener("input", () => this.changeIconSize());
    document.getElementById("reliefEditorSet")!.addEventListener("change", () => this.changeIconsSet());
    reliefIconsDiv.querySelectorAll("svg").forEach((el: SVGElement) => el.addEventListener("click", () => this.changeIcon(el)));

    document.getElementById("reliefEditStyle")!.addEventListener("click", () => editStyle("terrain"));
    document.getElementById("reliefCopy")!.addEventListener("click", () => this.copyIcon());
    document.getElementById("reliefMoveFront")!.addEventListener("click", () => elSelected.raise());
    document.getElementById("reliefMoveBack")!.addEventListener("click", () => elSelected.lower());
    document.getElementById("reliefRemove")!.addEventListener("click", () => this.removeIcon());
  }

  private restoreEditMode() {
    if (!reliefTools.querySelector("button.pressed")) this.enterIndividualMode();
    else if (reliefBulkAdd.classList.contains("pressed")) this.enterBulkAddMode();
    else if (reliefBulkRemove.classList.contains("pressed")) this.enterBulkRemoveMode();
  }

  private updateReliefIconSelected() {
    const type = elSelected.attr("href") || elSelected.attr("data-type");
    const button = reliefIconsDiv.querySelector("svg[data-type='" + type + "']") as unknown as HTMLElement;

    reliefIconsDiv.querySelectorAll("svg.pressed").forEach((b: Element) => b.classList.remove("pressed"));
    button.classList.add("pressed");
    reliefIconsDiv.querySelectorAll("div").forEach((b: HTMLElement) => (b.style.display = "none"));
    (button.parentNode as HTMLElement).style.display = "block";
    reliefEditorSet.value = (button.parentNode as HTMLElement).dataset.type;
  }

  private updateReliefSizeInput() {
    const size = +elSelected.attr("width");
    reliefSize.value = reliefSizeNumber.value = rn(size);
  }

  private enterIndividualMode() {
    reliefTools.querySelectorAll("button.pressed").forEach((b: Element) => b.classList.remove("pressed"));
    reliefIndividual.classList.add("pressed");

    reliefSizeDiv.style.display = "block";
    reliefRadiusDiv.style.display = "none";
    reliefSpacingDiv.style.display = "none";
    reliefIconsSeletionAny.style.display = "none";

    removeCircle();
    this.updateReliefSizeInput();
    restoreDefaultEvents();
    clearMainTip();
  }

  private enterBulkAddMode() {
    reliefTools.querySelectorAll("button.pressed").forEach((b: Element) => b.classList.remove("pressed"));
    reliefBulkAdd.classList.add("pressed");

    reliefSizeDiv.style.display = "block";
    reliefRadiusDiv.style.display = "block";
    reliefSpacingDiv.style.display = "block";
    reliefIconsSeletionAny.style.display = "none";

    const pressedType = reliefIconsDiv.querySelector("svg.pressed") as unknown as HTMLElement;
    if (pressedType.id === "reliefIconsSeletionAny") {
      reliefIconsSeletionAny.classList.remove("pressed");
      (reliefIconsDiv.querySelector("svg") as unknown as HTMLElement).classList.add("pressed");
    }

    viewbox
      .style("cursor", "crosshair")
      .call(d3.drag().on("start", () => this.dragToAdd()))
      .on("touchmove mousemove", function (this: SVGElement) {
        showMainTip();
        const point = d3.mouse(this);
        moveCircle(point[0], point[1], +reliefRadiusNumber.value);
      });
    tip("Drag to place relief icons within radius", true);
  }

  private dragToAdd() {
    const pressed = reliefIconsDiv.querySelector("svg.pressed") as unknown as HTMLElement;
    if (!pressed) return tip("Please select an icon", false, "error");

    const type = pressed.dataset.type;
    const r = +reliefRadiusNumber.value;
    const spacing = +reliefSpacingNumber.value;
    const size = +reliefSizeNumber.value;

    const tree = d3.quadtree();
    const positions: number[] = [];
    terrain.selectAll("use").each(function (this: SVGUseElement) {
      const x = +this.getAttribute("x")! + +this.getAttribute("width")! / 2;
      const y = +this.getAttribute("y")! + +this.getAttribute("height")! / 2;
      tree.add([x, y, x]);
      const box = this.getBBox();
      positions.push(box.y + box.height);
    });

    d3.event.on("drag", function (this: SVGElement) {
      const p = d3.mouse(this);
      moveCircle(p[0], p[1], r);

      d3.range(Math.ceil(r / 10)).forEach(function () {
        const a = Math.PI * 2 * Math.random();
        const rad = r * Math.random();
        const cx = p[0] + rad * Math.cos(a);
        const cy = p[1] + rad * Math.sin(a);

        if (tree.find(cx, cy, spacing)) return;
        if (pack.cells.h[findCell(cx, cy)] < 20) return;

        const h = rn((size / 2) * (Math.random() * 0.4 + 0.8), 2);
        const x = rn(cx - h, 2);
        const y = rn(cy - h, 2);
        const z = y + h * 2;
        const s = rn(h * 2, 2);

        let nth = 1;
        while (positions[nth] && z > positions[nth]) nth++;

        tree.add([cx, cy]);
        positions.push(z);
        terrain
          .insert("use", ":nth-child(" + nth + ")")
          .attr("href", type)
          .attr("x", x)
          .attr("y", y)
          .attr("width", s)
          .attr("height", s);
      });
    });
  }

  private enterBulkRemoveMode() {
    reliefTools.querySelectorAll("button.pressed").forEach((b: Element) => b.classList.remove("pressed"));
    reliefBulkRemove.classList.add("pressed");

    reliefSizeDiv.style.display = "none";
    reliefRadiusDiv.style.display = "block";
    reliefSpacingDiv.style.display = "none";
    reliefIconsSeletionAny.style.display = "inline-block";

    viewbox
      .style("cursor", "crosshair")
      .call(d3.drag().on("start", () => this.dragToRemove()))
      .on("touchmove mousemove", function (this: SVGElement) {
        showMainTip();
        const point = d3.mouse(this);
        moveCircle(point[0], point[1], +reliefRadiusNumber.value);
      });
    tip("Drag to remove relief icons in radius", true);
  }

  private dragToRemove() {
    const pressed = reliefIconsDiv.querySelector("svg.pressed") as unknown as HTMLElement;
    if (!pressed) return tip("Please select an icon", false, "error");

    const r = +reliefRadiusNumber.value;
    const type = pressed.dataset.type;
    const icons = type ? terrain.selectAll("use[href='" + type + "']") : terrain.selectAll("use");
    const tree = d3.quadtree();
    icons.each(function (this: SVGUseElement) {
      const x = +this.getAttribute("x")! + +this.getAttribute("width")! / 2;
      const y = +this.getAttribute("y")! + +this.getAttribute("height")! / 2;
      tree.add([x, y, this]);
    });

    d3.event.on("drag", function (this: SVGElement) {
      const p = d3.mouse(this);
      moveCircle(p[0], p[1], r);
      findAllInQuadtree(p[0], p[1], r, tree).forEach((f: [number, number, SVGElement]) => f[2].remove());
    });
  }

  private changeIconSize() {
    const size = +reliefSizeNumber.value;
    if (!reliefIndividual.classList.contains("pressed")) return;

    const shift = (size - +elSelected.attr("width")) / 2;
    elSelected.attr("width", size).attr("height", size);
    const x = +elSelected.attr("x"),
      y = +elSelected.attr("y");
    elSelected.attr("x", x - shift).attr("y", y - shift);
  }

  private changeIconsSet() {
    const set = reliefEditorSet.value;
    reliefIconsDiv.querySelectorAll("div").forEach((b: HTMLElement) => (b.style.display = "none"));
    (reliefIconsDiv.querySelector("div[data-type='" + set + "']") as HTMLElement).style.display = "block";
  }

  private changeIcon(el: SVGElement) {
    if (el.classList.contains("pressed")) return;

    reliefIconsDiv.querySelectorAll("svg.pressed").forEach((b: Element) => b.classList.remove("pressed"));
    el.classList.add("pressed");

    if (reliefIndividual.classList.contains("pressed")) {
      const type = (el as unknown as HTMLElement).dataset.type;
      elSelected.attr("href", type);
    }
  }

  private copyIcon() {
    const node = elSelected.node() as SVGUseElement;
    const parent = node.parentNode!;
    const copy = node.cloneNode(true) as SVGUseElement;

    let x = +elSelected.attr("x") - 3,
      y = +elSelected.attr("y") - 3;
    while (parent.querySelector("[x='" + x + "']")) {
      x -= 3;
      y -= 3;
    }

    copy.setAttribute("x", String(x));
    copy.setAttribute("y", String(y));
    parent.insertBefore(copy, null);
  }

  private removeIcon() {
    let selection: unknown = null;
    const pressed = reliefTools.querySelector("button.pressed") as HTMLElement;
    if (pressed.id === "reliefIndividual") {
      alertMessage.innerHTML = "Are you sure you want to remove the icon?";
      selection = elSelected;
    } else {
      const type = (reliefIconsDiv.querySelector("svg.pressed") as unknown as HTMLElement)?.dataset.type;
      selection = type ? terrain.selectAll("use[href='" + type + "']") : terrain.selectAll("use");
    const size = (selection as {size(): number}).size();
      alertMessage.innerHTML = type
        ? `Are you sure you want to remove all ${type} icons (${size})?`
        : `Are you sure you want to remove all icons (${size})?`;
    }

    $("#alert").dialog({
      resizable: false,
      title: "Remove relief icons",
      buttons: {
        Remove: function () {
          if (selection) (selection as {remove(): void}).remove();
          $(this).dialog("close");
          $("#reliefEditor").dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  private closeReliefEditor() {
    terrain.selectAll("use").call(d3.drag().on("drag", null)).classed("draggable", false);
    removeCircle();
    unselect();
    clearMainTip();
  }
}

const reliefEditor = new ReliefEditor();

function editReliefIcon() {
  reliefEditor.open();
}
