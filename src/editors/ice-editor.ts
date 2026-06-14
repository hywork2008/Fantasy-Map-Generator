import { type D3DragEvent, drag, pointer, select } from "d3";
import type { AppServices } from "../context/appServices";
import type { ViewContext } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import { interactionManager } from "../controllers/interactionManager";
import type { IceIceberg } from "../modules/ice";
import { Ice } from "../modules/ice";
import { redrawIceberg } from "../renderers/index";
import { closeDialog, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { parseTransform } from "../utils";

let worldContext: WorldContext;
let viewContext: Readonly<ViewContext>;
let appServices: AppServices;

export function editIce(element: SVGElement): void {
  if (customization) return;
  if (elSelected && element === elSelected.node()) return;

  closeDialogs(".stable");
  if (!layerIsOn("toggleIce")) toggleIce();

  elSelected = select(element as unknown as Element);
  const id = +elSelected!.attr("data-id");
  const iceElement = pack.ice.find(el => el.i === id);
  const isGlacier = elSelected!.attr("type") === "glacier";
  const type = isGlacier ? "Glacier" : "Iceberg";

  const iceRandomize = document.getElementById("iceRandomize") as HTMLElement;
  const iceSizeEl = document.getElementById("iceSize") as HTMLInputElement;

  iceRandomize.style.display = isGlacier ? "none" : "inline-block";
  iceSizeEl.style.display = isGlacier ? "none" : "inline-block";
  if (!isGlacier) iceSizeEl.value = String((iceElement as IceIceberg)?.size ?? "");

  // Declare before the early-return guard so drag handlers never see TDZ variables.
  // (function declarations are hoisted but `let` is not, so placing these after the
  // `if (modules.editIce) return` would leave them uninitialised on every call after the first.)
  let _idx = 0,
    _idy = 0,
    _iceId = 0;

  ice
    .selectAll<SVGElement, unknown>("*")
    .classed("draggable", true)
    .call(drag<SVGElement, unknown>().on("start", dragElementStart).on("drag", dragElementDrag));

  openDialog("iceEditor", {
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
    redrawIceberg(worldContext, viewContext, appServices, selectedId);
  }

  function changeSize(this: HTMLInputElement): void {
    const newSize = +this.value;
    const selectedId = +elSelected!.attr("data-id");
    Ice.changeIcebergSize(selectedId, newSize);
    redrawIceberg(worldContext, viewContext, appServices, selectedId);
  }

  function toggleAdd(): void {
    iceNew.classList.toggle("pressed");
    if (iceNew.classList.contains("pressed")) {
      viewbox.style("cursor", "crosshair");
      interactionManager.setClickHandler(addIcebergOnClick);
      tip("Click on map to create an iceberg. Hold Shift to add multiple", true);
    } else {
      clearMainTip();
      interactionManager.resetClickHandler();
      viewbox.style("cursor", "default");
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
    openRichDialog({
      content: window.alertMessage.innerHTML,
      resizable: false,
      title: `Remove ${iceType}`,
      buttons: {
        Remove: () => {
          /* $(this).dialog("close") removed */
          Ice.removeIce(+elSelected!.attr("data-id"));
          closeDialog("iceEditor");
        },
        Cancel: () => {
          /* $(this).dialog("close") removed */
        }
      }
    });
  }

  function dragElementStart(this: SVGElement, event: D3DragEvent<SVGElement, unknown, unknown>): void {
    _iceId = +elSelected!.attr("data-id");
    const initialTransform = parseTransform(this.getAttribute("transform") ?? "");
    _idx = +initialTransform[0] - event.x;
    _idy = +initialTransform[1] - event.y;
  }

  function dragElementDrag(this: SVGElement, event: D3DragEvent<SVGElement, unknown, unknown>): void {
    const x = event.x;
    const y = event.y;
    this.setAttribute("transform", `translate(${_idx + x},${_idy + y})`);
    const iceData = pack.ice.find(el => el.i === _iceId);
    if (iceData) iceData.offset = [_idx + x, _idy + y];
  }

  function closeEditor(): void {
    ice
      .selectAll<SVGElement, unknown>("*")
      .classed("draggable", false)
      .call(drag<SVGElement, unknown>().on("drag", null));
    clearMainTip();
    iceNew.classList.remove("pressed");
    unselect();
  }
}

export function initIceEditor(wc: WorldContext, vc: Readonly<ViewContext>, as: AppServices) {
  worldContext = wc;
  viewContext = vc;
  appServices = as;
}
