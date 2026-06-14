import type { D3DragEvent, Quadtree } from "d3";
import { drag, pointer, quadtree, range, select } from "d3";
import { closeDialog, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { findAllInQuadtree, findCell, rn } from "../utils";

interface DragAddState {
  type: string;
  r: number;
  spacing: number;
  size: number;
  tree: Quadtree<number[]>;
  positions: number[];
  el: SVGElement;
}

interface DragRemoveState {
  r: number;
  tree: Quadtree<[number, number, SVGUseElement]>;
}

export function editReliefIcon(clickedEl?: Element): void {
  if (customization) return;
  closeDialogs(".stable");
  if (!layerIsOn("toggleRelief")) toggleRelief();

  let _rdx = 0,
    _rdy = 0;
  terrain
    .selectAll<SVGUseElement, unknown>("use")
    .call(
      drag<SVGUseElement, unknown>()
        .on("start", function (this: SVGUseElement, event: D3DragEvent<SVGUseElement, unknown, unknown>) {
          _rdx = +this.getAttribute("x")! - event.x;
          _rdy = +this.getAttribute("y")! - event.y;
        })
        .on("drag", function (this: SVGUseElement, event: D3DragEvent<SVGUseElement, unknown, unknown>) {
          this.setAttribute("x", String(_rdx + event.x));
          this.setAttribute("y", String(_rdy + event.y));
        })
    )
    .classed("draggable", true);
  elSelected = select(clickedEl ?? (document.querySelector("#terrain use") as Element));

  restoreEditMode();
  updateReliefIconSelected();
  updateReliefSizeInput();

  openDialog("reliefEditor", {
    title: "Edit Relief Icons",
    resizable: false,
    width: "27em",
    position: { my: "left top", at: "left+10 top+10", of: "#map" },
    close: closeReliefEditor
  });

  if (modules.editReliefIcon) return;
  modules.editReliefIcon = true;

  // add listeners
  document.getElementById("reliefIndividual")!.addEventListener("click", enterIndividualMode);
  document.getElementById("reliefBulkAdd")!.addEventListener("click", enterBulkAddMode);
  document.getElementById("reliefBulkRemove")!.addEventListener("click", enterBulkRemoveMode);

  document.getElementById("reliefSize")!.addEventListener("input", changeIconSize);
  document.getElementById("reliefSizeNumber")!.addEventListener("input", changeIconSize);
  document.getElementById("reliefEditorSet")!.addEventListener("change", changeIconsSet);
  reliefIconsDiv.querySelectorAll("svg").forEach(el => {
    el.addEventListener("click", changeIcon);
  });

  document.getElementById("reliefEditStyle")!.addEventListener("click", () => editStyle("terrain"));
  document.getElementById("reliefCopy")!.addEventListener("click", copyIcon);
  document.getElementById("reliefMoveFront")!.addEventListener("click", () => elSelected!.raise());
  document.getElementById("reliefMoveBack")!.addEventListener("click", () => elSelected!.lower());
  document.getElementById("reliefRemove")!.addEventListener("click", removeIcon);

  function restoreEditMode(): void {
    if (!reliefTools.querySelector("button.pressed")) enterIndividualMode();
    else if (reliefBulkAdd.classList.contains("pressed")) enterBulkAddMode();
    else if (reliefBulkRemove.classList.contains("pressed")) enterBulkRemoveMode();
  }

  function updateReliefIconSelected(): void {
    const type = elSelected!.attr("href") || elSelected!.attr("data-type");
    const button = reliefIconsDiv.querySelector(`svg[data-type='${type}']`) as SVGElement;

    reliefIconsDiv.querySelectorAll("svg.pressed").forEach(b => {
      b.classList.remove("pressed");
    });
    button.classList.add("pressed");
    reliefIconsDiv.querySelectorAll("div").forEach(b => {
      (b as HTMLElement).style.display = "none";
    });
    (button.parentNode as HTMLElement).style.display = "block";
    reliefEditorSet.value = (button.parentNode as HTMLElement).dataset.type!;
  }

  function updateReliefSizeInput(): void {
    const size = +elSelected!.attr("width");
    reliefSize.value = reliefSizeNumber.value = String(rn(size));
  }

  function enterIndividualMode(): void {
    reliefTools.querySelectorAll("button.pressed").forEach(b => {
      b.classList.remove("pressed");
    });
    reliefIndividual.classList.add("pressed");

    (document.getElementById("reliefSizeDiv") as HTMLElement).style.display = "block";
    (document.getElementById("reliefRadiusDiv") as HTMLElement).style.display = "none";
    (document.getElementById("reliefSpacingDiv") as HTMLElement).style.display = "none";
    reliefIconsSeletionAny.style.display = "none";

    removeCircle();
    updateReliefSizeInput();
    restoreDefaultEvents?.();
    clearMainTip();
  }

  function enterBulkAddMode(): void {
    reliefTools.querySelectorAll("button.pressed").forEach(b => {
      b.classList.remove("pressed");
    });
    reliefBulkAdd.classList.add("pressed");

    (document.getElementById("reliefSizeDiv") as HTMLElement).style.display = "block";
    (document.getElementById("reliefRadiusDiv") as HTMLElement).style.display = "block";
    (document.getElementById("reliefSpacingDiv") as HTMLElement).style.display = "block";
    reliefIconsSeletionAny.style.display = "none";

    const pressedType = reliefIconsDiv.querySelector("svg.pressed") as SVGElement;
    if (pressedType.id === "reliefIconsSeletionAny") {
      reliefIconsSeletionAny.classList.remove("pressed");
      (reliefIconsDiv.querySelector("svg") as SVGElement).classList.add("pressed");
    }

    viewbox
      .style("cursor", "crosshair")
      .call(
        drag<SVGGElement, unknown>()
          .on("start", function (this: SVGElement, _startEvent: D3DragEvent<SVGElement, unknown, unknown>) {
            const pressed = reliefIconsDiv.querySelector("svg.pressed") as SVGElement | null;
            if (!pressed) {
              tip("Please select an icon", false, "error");
              return;
            }
            const type = pressed.dataset.type!;
            const r = +reliefRadiusNumber.value;
            const spacing = +reliefSpacingNumber.value;
            const size = +reliefSizeNumber.value;
            const tree = quadtree<number[]>();
            const positions: number[] = [];
            terrain.selectAll<SVGUseElement, unknown>("use").each(function (this: SVGUseElement) {
              const x = +this.getAttribute("x")! + +this.getAttribute("width")! / 2;
              const y = +this.getAttribute("y")! + +this.getAttribute("height")! / 2;
              tree.add([x, y, x]);
              const box = this.getBBox();
              positions.push(box.y + box.height);
            });

            d3DragAddState = { type, r, spacing, size, tree, positions, el: this };
          })
          .on("drag", function (this: SVGElement, event: D3DragEvent<SVGElement, unknown, unknown>) {
            if (!d3DragAddState) return;
            const { type, r, spacing, size, tree, positions } = d3DragAddState;
            const p = pointer(event, this) as [number, number];
            moveCircle(p[0], p[1], r);
            range(Math.ceil(r / 10)).forEach(() => {
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
                .insert("use", `:nth-child(${nth})`)
                .attr("href", type)
                .attr("x", x)
                .attr("y", y)
                .attr("width", s)
                .attr("height", s);
            });
          })
      )
      .on("touchmove mousemove", moveBrush);
    tip("Drag to place relief icons within radius", true);
  }

  let d3DragAddState: DragAddState | null = null;

  function moveBrush(this: SVGElement, event: MouseEvent): void {
    showMainTip();
    const pt = pointer(event, this) as [number, number];
    const radius = +reliefRadiusNumber.value;
    moveCircle(pt[0], pt[1], radius);
  }

  function enterBulkRemoveMode(): void {
    reliefTools.querySelectorAll("button.pressed").forEach(b => {
      b.classList.remove("pressed");
    });
    reliefBulkRemove.classList.add("pressed");

    (document.getElementById("reliefSizeDiv") as HTMLElement).style.display = "none";
    (document.getElementById("reliefRadiusDiv") as HTMLElement).style.display = "block";
    (document.getElementById("reliefSpacingDiv") as HTMLElement).style.display = "none";
    reliefIconsSeletionAny.style.display = "inline-block";

    viewbox
      .style("cursor", "crosshair")
      .call(
        drag<SVGGElement, unknown>()
          .on("start", function (this: SVGElement) {
            const pressed = reliefIconsDiv.querySelector("svg.pressed") as SVGElement | null;
            if (!pressed) {
              tip("Please select an icon", false, "error");
              return;
            }
            const r = +reliefRadiusNumber.value;
            const type = pressed.dataset.type;
            const icons = type
              ? terrain.selectAll<SVGUseElement, unknown>(`use[href='${type}']`)
              : terrain.selectAll<SVGUseElement, unknown>("use");
            const tree = quadtree<[number, number, SVGUseElement]>();
            icons.each(function (this: SVGUseElement) {
              const x = +this.getAttribute("x")! + +this.getAttribute("width")! / 2;
              const y = +this.getAttribute("y")! + +this.getAttribute("height")! / 2;
              tree.add([x, y, this]);
            });
            d3DragRemoveState = { r, tree };
          })
          .on("drag", function (this: SVGElement, event: D3DragEvent<SVGElement, unknown, unknown>) {
            if (!d3DragRemoveState) return;
            const { r, tree } = d3DragRemoveState;
            const p = pointer(event, this) as [number, number];
            moveCircle(p[0], p[1], r);
            findAllInQuadtree(p[0], p[1], r, tree).forEach(f => {
              f[2].remove();
            });
          })
      )
      .on("touchmove mousemove", moveBrush);
    tip("Drag to remove relief icons in radius", true);
  }

  let d3DragRemoveState: DragRemoveState | null = null;

  function changeIconSize(this: HTMLInputElement): void {
    reliefSizeNumber.value = this.value;
    reliefSize.value = this.value;
    const size = +this.value;
    if (!reliefIndividual.classList.contains("pressed")) return;

    const shift = (size - +elSelected!.attr("width")) / 2;
    elSelected!.attr("width", size).attr("height", size);
    const x = +elSelected!.attr("x");
    const y = +elSelected!.attr("y");
    elSelected!.attr("x", x - shift).attr("y", y - shift);
  }

  function changeIconsSet(this: HTMLSelectElement): void {
    const set = this.value;
    reliefIconsDiv.querySelectorAll("div").forEach(b => {
      (b as HTMLElement).style.display = "none";
    });
    (reliefIconsDiv.querySelector(`div[data-type='${set}']`) as HTMLElement).style.display = "block";
  }

  function changeIcon(this: SVGElement): void {
    if (this.classList.contains("pressed")) return;

    reliefIconsDiv.querySelectorAll("svg.pressed").forEach(b => {
      b.classList.remove("pressed");
    });
    this.classList.add("pressed");

    if (reliefIndividual.classList.contains("pressed")) {
      const type = this.dataset.type!;
      elSelected!.attr("href", type);
    }
  }

  function copyIcon(): void {
    const parent = elSelected!.node()!.parentNode as Element;
    const copy = elSelected!.node()!.cloneNode(true) as SVGUseElement;

    let x = +elSelected!.attr("x") - 3;
    let y = +elSelected!.attr("y") - 3;
    while (parent.querySelector(`[x='${x}']`)) {
      x -= 3;
      y -= 3;
    }

    copy.setAttribute("x", String(x));
    copy.setAttribute("y", String(y));
    parent.insertBefore(copy, null);
  }

  function removeIcon(): void {
    let selection: { remove(): unknown; size(): number } | null = null;
    const pressed = reliefTools.querySelector("button.pressed") as HTMLButtonElement;
    if (pressed.id === "reliefIndividual") {
      alertMessage.innerHTML = "Are you sure you want to remove the icon?";
      selection = elSelected;
    } else {
      const type = (reliefIconsDiv.querySelector("svg.pressed") as SVGElement)?.dataset.type;
      selection = type
        ? terrain.selectAll<SVGUseElement, unknown>(`use[href='${type}']`)
        : terrain.selectAll<SVGUseElement, unknown>("use");
      const size = selection.size();
      alertMessage.innerHTML = type
        ? `Are you sure you want to remove all ${type} icons (${size})?`
        : `Are you sure you want to remove all icons (${size})?`;
    }

    openRichDialog({
      content: window.alertMessage.innerHTML,
      resizable: false,
      title: "Remove relief icons",
      buttons: {
        Remove: () => {
          if (selection) selection.remove();
          /* $(this).dialog("close") removed */
          closeDialog("reliefEditor");
        },
        Cancel: () => {
          /* $(this).dialog("close") removed */
        }
      }
    });
  }

  function closeReliefEditor(): void {
    terrain
      .selectAll<SVGUseElement, unknown>("use")
      .call(drag<SVGUseElement, unknown>().on("drag", null))
      .classed("draggable", false);
    removeCircle();
    unselect();
    clearMainTip();
  }
}
