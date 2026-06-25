import type { D3DragEvent, Quadtree } from "d3";
import { drag, pointer, quadtree, range, select } from "d3";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { toggleRelief } from "../controllers/layers";
import { editStyle } from "../controllers/style";
import { elSelected, modules, setElSelected } from "../store/editorState";
import type { ReliefIconSet } from "../store/reliefEditorState";
import { getReliefEditorState, setReliefEditorState } from "../store/reliefEditorState";
import { closeDialog, closeDialogs, openDialog, openRichDialog } from "../ui/dialogs/dialogService";
import { findAllInQuadtree, findCell, rn } from "../utils";
import { alertMessage } from "../utils/alertMessageEl";
import { EditorBus } from "../utils/editorBus";
import { layerIsOn } from "../utils/nodeUtils";
import { clearMainTip, showMainTip, tip } from "../utils/uiHelpers";

interface DragAddState {
  type: string;
  r: number;
  spacing: number;
  size: number;
  tree: Quadtree<number[]>;
  positions: number[];
}

interface DragRemoveState {
  r: number;
  tree: Quadtree<[number, number, SVGUseElement]>;
}

let d3DragAddState: DragAddState | null = null;
let d3DragRemoveState: DragRemoveState | null = null;

export function editReliefIcon(clickedEl?: Element): void {
  if (viewContext.customization) return;
  closeDialogs(".stable");
  if (!layerIsOn("toggleRelief")) toggleRelief();

  let _rdx = 0,
    _rdy = 0;
  viewContext.terrain
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
  setElSelected(select(clickedEl ?? (document.querySelector("#terrain use") as Element)));

  updateReliefIconSelected();
  updateReliefSizeInput();

  setReliefEditorState({ isOpen: true, mode: "individual" });

  openDialog("reliefEditor", {
    title: "Relief Icons Editor",
    resizable: false,
    position: { my: "left top", at: "left+10 top+10", of: "#map" },
    onClose: closeReliefEditor
  });

  modules.editReliefIcon = true;
}

function updateReliefIconSelected(): void {
  const type = elSelected!.attr("href") || elSelected!.attr("data-type");
  const button = document.querySelector(`#reliefIconsDiv svg[data-type='${type}']`) as SVGElement | null;
  if (!button) return;
  const iconSet = (button.parentNode as HTMLElement).dataset.type as ReliefIconSet;
  setReliefEditorState({ selectedIconType: type, iconSet });
}

function updateReliefSizeInput(): void {
  const size = +elSelected!.attr("width");
  setReliefEditorState({ size: rn(size) });
}

function moveBrush(this: SVGElement, event: MouseEvent): void {
  showMainTip();
  const pt = pointer(event, this) as [number, number];
  const radius = getReliefEditorState().radius;
  EditorBus.moveCircle(pt[0], pt[1], radius);
}

function closeReliefEditor(): void {
  viewContext.terrain
    .selectAll<SVGUseElement, unknown>("use")
    .call(drag<SVGUseElement, unknown>().on("drag", null))
    .classed("draggable", false);
  EditorBus.removeCircle();
  EditorBus.unselect();
  clearMainTip();
  setReliefEditorState({ isOpen: false });
}

export const reliefEditorActions = {
  enterIndividualMode(): void {
    setReliefEditorState({ mode: "individual" });
    EditorBus.removeCircle();
    updateReliefSizeInput();
    EditorBus.restoreDefaultEvents();
    clearMainTip();
  },

  enterBulkAddMode(): void {
    const state = getReliefEditorState();
    // If "any" icon was selected (only valid in bulkRemove), switch to first icon in current set
    const newSelectedType =
      state.selectedIconType === null
        ? ((
            document.querySelector(
              `#reliefIconsDiv div[data-type='${state.iconSet}'] svg:first-child`
            ) as SVGElement | null
          )?.dataset.type ?? null)
        : state.selectedIconType;
    setReliefEditorState({ mode: "bulkAdd", selectedIconType: newSelectedType });

    viewContext.viewbox
      .style("cursor", "crosshair")
      .call(
        drag<SVGGElement, unknown>()
          .on("start", function (this: SVGElement) {
            const { selectedIconType, radius, spacing, size } = getReliefEditorState();
            if (!selectedIconType) {
              tip("Please select an icon", false, "error");
              return;
            }
            const tree = quadtree<number[]>();
            const positions: number[] = [];
            viewContext.terrain.selectAll<SVGUseElement, unknown>("use").each(function (this: SVGUseElement) {
              const x = +this.getAttribute("x")! + +this.getAttribute("width")! / 2;
              const y = +this.getAttribute("y")! + +this.getAttribute("height")! / 2;
              tree.add([x, y, x]);
              const box = this.getBBox();
              positions.push(box.y + box.height);
            });
            d3DragAddState = { type: selectedIconType, r: radius, spacing, size, tree, positions };
          })
          .on("drag", function (this: SVGElement, event: D3DragEvent<SVGElement, unknown, unknown>) {
            if (!d3DragAddState) return;
            const { type, r, spacing, size, tree, positions } = d3DragAddState;
            const p = pointer(event, this) as [number, number];
            EditorBus.moveCircle(p[0], p[1], r);
            range(Math.ceil(r / 10)).forEach(() => {
              const a = Math.PI * 2 * Math.random();
              const rad = r * Math.random();
              const cx = p[0] + rad * Math.cos(a);
              const cy = p[1] + rad * Math.sin(a);
              if (tree.find(cx, cy, spacing)) return;
              if (worldContext.pack.cells.h[findCell(cx, cy)] < 20) return;
              const h = rn((size / 2) * (Math.random() * 0.4 + 0.8), 2);
              const x = rn(cx - h, 2);
              const y = rn(cy - h, 2);
              const z = y + h * 2;
              const s = rn(h * 2, 2);
              let nth = 1;
              while (positions[nth] && z > positions[nth]) nth++;
              tree.add([cx, cy]);
              positions.push(z);
              viewContext.terrain
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
  },

  enterBulkRemoveMode(): void {
    setReliefEditorState({ mode: "bulkRemove" });

    viewContext.viewbox
      .style("cursor", "crosshair")
      .call(
        drag<SVGGElement, unknown>()
          .on("start", function (this: SVGElement) {
            const { selectedIconType, radius } = getReliefEditorState();
            const icons = selectedIconType
              ? viewContext.terrain.selectAll<SVGUseElement, unknown>(`use[href='${selectedIconType}']`)
              : viewContext.terrain.selectAll<SVGUseElement, unknown>("use");
            const tree = quadtree<[number, number, SVGUseElement]>();
            icons.each(function (this: SVGUseElement) {
              const x = +this.getAttribute("x")! + +this.getAttribute("width")! / 2;
              const y = +this.getAttribute("y")! + +this.getAttribute("height")! / 2;
              tree.add([x, y, this]);
            });
            d3DragRemoveState = { r: radius, tree };
          })
          .on("drag", function (this: SVGElement, event: D3DragEvent<SVGElement, unknown, unknown>) {
            if (!d3DragRemoveState) return;
            const { r, tree } = d3DragRemoveState;
            const p = pointer(event, this) as [number, number];
            EditorBus.moveCircle(p[0], p[1], r);
            findAllInQuadtree(p[0], p[1], r, tree).forEach(f => {
              f[2].remove();
            });
          })
      )
      .on("touchmove mousemove", moveBrush);
    tip("Drag to remove relief icons in radius", true);
  },

  changeIconSet(iconSet: ReliefIconSet): void {
    setReliefEditorState({ iconSet });
  },

  changeIconSize(value: number): void {
    const { mode } = getReliefEditorState();
    setReliefEditorState({ size: value });
    if (mode !== "individual") return;
    const shift = (value - +elSelected!.attr("width")) / 2;
    elSelected!.attr("width", value).attr("height", value);
    const x = +elSelected!.attr("x");
    const y = +elSelected!.attr("y");
    elSelected!.attr("x", x - shift).attr("y", y - shift);
  },

  changeRadius(value: number): void {
    setReliefEditorState({ radius: value });
  },

  changeSpacing(value: number): void {
    setReliefEditorState({ spacing: value });
  },

  changeIcon(type: string): void {
    const { mode } = getReliefEditorState();
    setReliefEditorState({ selectedIconType: type });
    if (mode === "individual") {
      elSelected!.attr("href", type);
    }
  },

  selectAnyIcon(): void {
    setReliefEditorState({ selectedIconType: null });
  },

  copyIcon(): void {
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
  },

  moveIconFront(): void {
    elSelected!.raise();
  },

  moveIconBack(): void {
    elSelected!.lower();
  },

  editStyle(): void {
    editStyle("terrain");
  },

  removeIcon(): void {
    const { mode, selectedIconType } = getReliefEditorState();
    let selection: { remove(): unknown; size(): number } | null = null;
    if (mode === "individual") {
      alertMessage.innerHTML = "Are you sure you want to remove the icon?";
      selection = elSelected;
    } else {
      selection = selectedIconType
        ? viewContext.terrain.selectAll<SVGUseElement, unknown>(`use[href='${selectedIconType}']`)
        : viewContext.terrain.selectAll<SVGUseElement, unknown>("use");
      const size = selection.size();
      alertMessage.innerHTML = selectedIconType
        ? `Are you sure you want to remove all ${selectedIconType} icons (${size})?`
        : `Are you sure you want to remove all icons (${size})?`;
    }

    openRichDialog({
      content: alertMessage.innerHTML,
      resizable: false,
      title: "Remove relief icons",
      buttons: {
        Remove: () => {
          if (selection) selection.remove();
          closeDialog("reliefEditor");
        },
        Cancel: () => {}
      }
    });
  }
};
