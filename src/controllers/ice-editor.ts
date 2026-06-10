import { drag, pointer, select } from "d3";
import { parseTransform } from "../utils";

function editIce(element: SVGElement): void {
  if (customization) return;
  if (elSelected && element === elSelected.node()) return;

  closeDialogs(".stable");
  if (!layerIsOn("toggleIce")) toggleIce();

  elSelected = select(element);
  const id = +elSelected.attr("data-id");
  const iceElement = pack.ice.find(el => el.i === id);
  const isGlacier = elSelected.attr("type") === "glacier";
  const type = isGlacier ? "Glacier" : "Iceberg";

  const iceRandomize = document.getElementById("iceRandomize") as HTMLElement;
  const iceSizeEl = document.getElementById("iceSize") as HTMLInputElement;

  iceRandomize.style.display = isGlacier ? "none" : "inline-block";
  iceSizeEl.style.display = isGlacier ? "none" : "inline-block";
  if (!isGlacier) iceSizeEl.value = String((iceElement as any)?.size || "");

  (ice.selectAll("*") as any).classed("draggable", true).call(drag<SVGElement, unknown>().on("start", dragElement));

  $("#iceEditor").dialog({
    title: `Edit ${type}`,
    resizable: false,
    position: { my: "center top+60", at: "top", of: "svg", collision: "fit" },
    close: closeEditor
  });

  if (modules.editIce) return;
  modules.editIce = true;

  document.getElementById("iceEditStyle")!.addEventListener("click", () => editStyle("ice"));
  iceRandomize.addEventListener("click", randomizeShape);
  iceSizeEl.addEventListener("input", changeSize);
  iceNew.addEventListener("click", toggleAdd);
  document.getElementById("iceRemove")!.addEventListener("click", removeIce);

  function randomizeShape(): void {
    const selectedId = +elSelected!.attr("data-id");
    Ice.randomizeIcebergShape(selectedId);
    redrawIceberg(selectedId);
  }

  function changeSize(this: HTMLInputElement): void {
    const newSize = +this.value;
    const selectedId = +elSelected!.attr("data-id");
    Ice.changeIcebergSize(selectedId, newSize);
    redrawIceberg(selectedId);
  }

  function toggleAdd(): void {
    iceNew.classList.toggle("pressed");
    if (iceNew.classList.contains("pressed")) {
      viewbox.style("cursor", "crosshair").on("click", addIcebergOnClick);
      tip("Click on map to create an iceberg. Hold Shift to add multiple", true);
    } else {
      clearMainTip();
      viewbox.on("click", clicked).style("cursor", "default");
    }
  }

  function addIcebergOnClick(this: SVGElement, event: MouseEvent): void {
    const [x, y] = pointer(event, this);
    const i = findGridCell(x, y, grid);
    const size = +((document.getElementById("iceSize") as HTMLInputElement)?.value || "1") || 1;

    Ice.addIceberg(i, size);

    if (event.shiftKey === false) toggleAdd();
  }

  function removeIce(): void {
    const iceType = elSelected!.attr("type") === "glacier" ? "Glacier" : "Iceberg";
    alertMessage.innerHTML = /* html */ `Are you sure you want to remove the ${iceType}?`;
    $("#alert").dialog({
      resizable: false,
      title: `Remove ${iceType}`,
      buttons: {
        Remove: function () {
          $(this).dialog("close");
          Ice.removeIce(+elSelected!.attr("data-id"));
          $("#iceEditor").dialog("close");
        },
        Cancel: function () {
          $(this).dialog("close");
        }
      }
    });
  }

  function dragElement(this: SVGElement, startEvent: any): void {
    const selectedId = +elSelected!.attr("data-id");
    const initialTransform = parseTransform(this.getAttribute("transform") ?? "");
    const dx = +initialTransform[0] - startEvent.x;
    const dy = +initialTransform[1] - startEvent.y;

    startEvent.on("drag", function (this: SVGElement, event: any) {
      const x = event.x;
      const y = event.y;
      const transform = `translate(${dx + x},${dy + y})`;
      this.setAttribute("transform", transform);

      const offset: [number, number] = [dx + x, dy + y];
      const iceData = pack.ice.find(el => el.i === selectedId);
      if (iceData) {
        (iceData as any).offset = offset;
      }
    });
  }

  function closeEditor(): void {
    (ice.selectAll("*") as any).classed("draggable", false).call(drag<SVGElement, unknown>().on("drag", null));
    clearMainTip();
    iceNew.classList.remove("pressed");
    unselect();
  }
}

window.editIce = editIce;
