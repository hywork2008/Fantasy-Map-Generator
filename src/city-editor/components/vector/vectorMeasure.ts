import { editorText } from "../../../i18n/editorMessages";
import { renderMeasureOverlay } from "../../renderers/overlays/editorOverlays";
import { element } from "../../renderers/svgPrimitives";
import type { EditorLifetime } from "../../services/editorLifetime";
import { formatDistance } from "../../utils/editorUnits";

type Point = [number, number];

/**
 * Right-click distance measurement for the meshless 2D view, ported from the mesh editor's
 * context menu. Points are world metres (y up); the SVG draws y flipped. The overlay survives
 * the frequent full SVG replacements by re-attaching whenever the map's children change.
 */
export function attachVectorMeasure(scope: EditorLifetime, map: HTMLElement, showNotice: (text: string) => void) {
  let from: Point | null = null,
    to: Point | null = null;
  const menu = document.createElement("div");
  menu.className = "ce-context-menu ce-vector-context-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  document.body.append(menu);
  scope.own(() => menu.remove());

  const svg = () => map.querySelector<SVGSVGElement>(".ce-vector-svg");
  const distance = () => (from && to ? Math.hypot(to[0] - from[0], to[1] - from[1]) : 0);

  function worldPoint(event: MouseEvent): Point | null {
    const target = svg(),
      matrix = target?.getScreenCTM();
    if (!target || !matrix) return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return [Math.round(p.x * 10) / 10, Math.round(-p.y * 10) / 10];
  }

  function update(): void {
    const target = svg();
    if (!target) return;
    let layer = target.querySelector<SVGGElement>(":scope > .ce-measure-layer");
    if (!layer) {
      layer = element("g", { class: "ce-measure-layer", "pointer-events": "none" }) as SVGGElement;
      target.append(layer);
    }
    const width = Number(target.getAttribute("viewBox")?.split(/\s+/)[2]) || 1;
    const metersPerPixel = width / Math.max(target.getBoundingClientRect().width, 1);
    const nodes = renderMeasureOverlay(from, to, metersPerPixel, from && to ? formatDistance(distance()) : "");
    layer.replaceChildren(...nodes);
    const label = layer.querySelector<SVGTextElement>(".ce-measure-label");
    if (label) {
      label.style.cursor = "pointer";
      label.setAttribute("role", "button");
      label.setAttribute("title", editorText("cityEditor.messages.clickToClearMeasurement"));
      label.addEventListener("click", clear);
    }
  }

  function hide(): void {
    menu.hidden = true;
  }

  function clear(): void {
    from = to = null;
    hide();
    update();
  }

  function show(event: MouseEvent, point: Point): void {
    const item = (label: string, run: () => void, disabled = false, title?: string) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.disabled = disabled;
      if (title) button.title = title;
      button.addEventListener("click", () => {
        hide();
        run();
      });
      return button;
    };
    const items = [
      item(editorText("cityEditor.messages.distanceFromHere"), () => {
        from = point;
        to = null;
        update();
        showNotice(editorText("cityEditor.messages.startingPointSet"));
      }),
      item(
        editorText("cityEditor.messages.distanceToHere"),
        () => {
          to = point;
          update();
          showNotice(editorText("cityEditor.messages.distance", { value0: formatDistance(distance()) }));
        },
        !from,
        from ? undefined : editorText("cityEditor.messages.setAStartingPointWithDistanceFromHereFirst")
      )
    ];
    if (from || to) items.push(item(editorText("cityEditor.messages.clearMeasurement"), clear));
    menu.replaceChildren(...items);
    menu.hidden = false;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - bounds.height - 8))}px`;
  }

  scope.listen(map, "contextmenu", event => {
    const point = worldPoint(event as MouseEvent);
    if (!point) return;
    event.preventDefault();
    show(event as MouseEvent, point);
  });
  scope.listen(document, "pointerdown", event => {
    if (!menu.hidden && !menu.contains(event.target as Node)) hide();
  });
  scope.listen(document, "keydown", event => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    if (!menu.hidden) hide();
    else if (from || to) clear();
  });
  // Marker sizes follow the zoom; the zoom handler is registered earlier and runs first.
  scope.listen(map, "wheel", () => (from ? update() : undefined));
  const observer = new MutationObserver(() => (from ? update() : undefined));
  observer.observe(map, { childList: true });
  scope.own(() => observer.disconnect());

  return { clear };
}
