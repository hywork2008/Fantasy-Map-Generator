"use strict";

import type { FmgGlobalContext } from "@fmg/types";
import { layerIsOn, toggleIce } from "./layers";
import { clicked, closeDialogs, unselect } from "./editors";
import { clearMainTip, tip } from "./general";
import { editStyle } from "./style";
import { redrawIcebergRenderer as redrawIceberg } from "#renderers/draw-ice";
import { Ice } from "@fmg/core/modules/ice";

type IceEditorFmgContext = FmgGlobalContext & {
  editIce?: (element: EventTarget | null) => void;
};

const iceEditorRuntime = window as Window & {
  [key: string]: any;
  fmg?: IceEditorFmgContext;
  editIce?: (element: EventTarget | null) => void;
};

class IceEditor {
  public open(element: EventTarget | null) {
  if (iceEditorRuntime.customization) return;
  if (iceEditorRuntime.elSelected && element === iceEditorRuntime.elSelected.node()) return;

  closeDialogs(".stable");
  if (!layerIsOn("toggleIce")) toggleIce();

  iceEditorRuntime.elSelected = iceEditorRuntime.d3.select(iceEditorRuntime.d3.event.target);
  const id = Number(iceEditorRuntime.elSelected.attr("data-id"));
  const iceElement = iceEditorRuntime.pack.ice.find((el: {i: number}) => el.i === id);
  const isGlacier = iceEditorRuntime.elSelected.attr("type") === "glacier";
  const type = isGlacier ? "Glacier" : "Iceberg";

  (document.getElementById("iceRandomize") as HTMLElement).style.display = isGlacier ? "none" : "inline-block";
  (document.getElementById("iceSize") as HTMLElement).style.display = isGlacier ? "none" : "inline-block";
  if (!isGlacier) (document.getElementById("iceSize") as HTMLInputElement).value = String(iceElement?.size || "");

  iceEditorRuntime.ice
    .selectAll("*")
    .classed("draggable", true)
    .call(iceEditorRuntime.d3.drag().on("drag", dragElement));

  iceEditorRuntime.$("#iceEditor").dialog({
    title: "Edit " + type,
    resizable: false,
    position: {my: "center top+60", at: "top", of: iceEditorRuntime.d3.event, collision: "fit"},
    close: closeEditor
  });

  if (iceEditorRuntime.modules.editIce) return;
  iceEditorRuntime.modules.editIce = true;
  document.getElementById("iceEditStyle")?.addEventListener("click", () => editStyle("ice"));
  document.getElementById("iceRandomize")?.addEventListener("click", randomizeShape);
  document.getElementById("iceSize")?.addEventListener("input", changeSize);
  document.getElementById("iceNew")?.addEventListener("click", toggleAdd);
  document.getElementById("iceRemove")?.addEventListener("click", removeIce);

  function randomizeShape() {
    const selectedId = Number(iceEditorRuntime.elSelected.attr("data-id"));
    Ice.randomizeIcebergShape(selectedId);
    redrawIceberg(selectedId);
  }

  function changeSize(this: HTMLInputElement) {
    const newSize = Number(this.value);
    const selectedId = Number(iceEditorRuntime.elSelected.attr("data-id"));
    Ice.changeIcebergSize(selectedId, newSize);
    redrawIceberg(selectedId);
  }

  function toggleAdd() {
    const iceNewEl = document.getElementById("iceNew") as HTMLElement;
    iceNewEl.classList.toggle("pressed");
    if (iceNewEl.classList.contains("pressed")) {
      iceEditorRuntime.viewbox.style("cursor", "crosshair").on("click", addIcebergOnClick);
      tip("Click on map to create an iceberg. Hold Shift to add multiple", true);
    } else {
      clearMainTip();
      iceEditorRuntime.viewbox.on("click", clicked).style("cursor", "default");
    }
  }

  function addIcebergOnClick(this: SVGElement) {
    const pos = iceEditorRuntime.d3.mouse(this) as [number, number];
    const [x, y] = pos;
    const i = iceEditorRuntime.fmg?.findGridCell
      ? iceEditorRuntime.fmg.findGridCell(x, y)
      : iceEditorRuntime.findGridCell(x, y, iceEditorRuntime.grid);
    const size = Number((document.getElementById("iceSize") as HTMLInputElement)?.value) || 1;

    Ice.addIceberg(i, size);

    if (iceEditorRuntime.d3.event.shiftKey === false) toggleAdd();
  }

  function removeIce() {
    const type = iceEditorRuntime.elSelected.attr("type") === "glacier" ? "Glacier" : "Iceberg";
    iceEditorRuntime.alertMessage.innerHTML = /* html */ `Are you sure you want to remove the ${type}?`;
    iceEditorRuntime.$("#alert").dialog({
      resizable: false,
      title: "Remove " + type,
      buttons: {
        Remove: function () {
          iceEditorRuntime.$(this).dialog("close");
          Ice.removeIce(Number(iceEditorRuntime.elSelected.attr("data-id")));
          iceEditorRuntime.$("#iceEditor").dialog("close");
        },
        Cancel: function () {
          iceEditorRuntime.$(this).dialog("close");
        }
      }
    });
  }

  function dragElement(this: SVGElement) {
    const selectedId = Number(iceEditorRuntime.elSelected.attr("data-id"));
    const initialTransform = iceEditorRuntime.fmg?.parseTransform
      ? iceEditorRuntime.fmg.parseTransform(this.getAttribute("transform") || "")
      : iceEditorRuntime.parseTransform(this.getAttribute("transform"));
    const dx = initialTransform[0] - iceEditorRuntime.d3.event.x;
    const dy = initialTransform[1] - iceEditorRuntime.d3.event.y;

    iceEditorRuntime.d3.event.on("drag", function (this: SVGElement) {
      const x = iceEditorRuntime.d3.event.x;
      const y = iceEditorRuntime.d3.event.y;
      const transform = `translate(${dx + x},${dy + y})`;
      this.setAttribute("transform", transform);

      const offset = [dx + x, dy + y];
      const iceData = iceEditorRuntime.pack.ice.find((element: {i: number}) => element.i === selectedId);
      if (iceData) {
        iceData.offset = offset;
      }
    });
  }

  function closeEditor() {
    iceEditorRuntime.ice
      .selectAll("*")
      .classed("draggable", false)
      .call(iceEditorRuntime.d3.drag().on("drag", null));
    clearMainTip();
    iceEditorRuntime.iceNew.classList.remove("pressed");
    unselect();
  }
}

}

const iceEditor = new IceEditor();

export function editIce(element: EventTarget | null) {
  iceEditor.open(element);
}

iceEditorRuntime.editIce = editIce;
