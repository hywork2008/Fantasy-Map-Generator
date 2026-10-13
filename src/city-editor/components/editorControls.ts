import { editorOptionText, editorText } from "../../i18n/editorMessages";
import type { EditorLifetime } from "../services/editorLifetime";
export interface FloatingWindow {
  root: HTMLDivElement;
  content: HTMLDivElement;
}
let highestPanelZIndex = 10;
export function bringPanelToFront(panel: HTMLElement): void {
  const allPanels = Array.from(document.querySelectorAll<HTMLElement>(".ce-panel"));
  let maxZ = highestPanelZIndex;
  allPanels.forEach(p => {
    const z = parseInt(p.style.zIndex || "", 10);
    if (!Number.isNaN(z) && z > maxZ) maxZ = z;
  });
  const currentZ = parseInt(panel.style.zIndex || "", 10);
  if (Number.isNaN(currentZ) || currentZ < maxZ) {
    if (maxZ > 9000) {
      const sorted = allPanels
        .map(p => ({ panel: p, z: parseInt(p.style.zIndex || "4", 10) }))
        .sort((a, b) => a.z - b.z);
      sorted.forEach((item, index) => {
        item.panel.style.zIndex = `${10 + index}`;
      });
      highestPanelZIndex = 10 + sorted.length;
      maxZ = highestPanelZIndex;
    }
    highestPanelZIndex = maxZ + 1;
    panel.style.zIndex = `${highestPanelZIndex}`;
  }
}
export function div(className = ""): HTMLDivElement {
  const node = document.createElement("div");
  node.className = className;
  return node;
}
export function heading(value: string): HTMLHeadingElement {
  const node = document.createElement("h1");
  node.textContent = value;
  return node;
}
export function text(value: string): HTMLSpanElement {
  const node = document.createElement("span");
  node.textContent = value;
  return node;
}
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
export function createEditorControls(scope: EditorLifetime) {
  function floatingWindow(className: string, title: string): FloatingWindow {
    const root = div(`ce-panel ${className}`);
    const titlebar = div("ce-panel-titlebar");
    const content = div("ce-panel-content");
    content.id = `${className.trim().split(/\s+/)[0]}-body`;
    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "ce-panel-collapse";
    collapse.setAttribute("aria-controls", content.id);
    const setCollapsed = (collapsed: boolean): void => {
      root.classList.toggle("ce-panel--collapsed", collapsed);
      content.hidden = collapsed;
      const label = collapsed ? editorText("cityEditor.messages.restore") : editorText("cityEditor.messages.minimize");
      collapse.textContent = collapsed ? "▲" : "▼";
      collapse.title = label;
      collapse.setAttribute("aria-label", label);
      collapse.setAttribute("aria-expanded", collapsed ? "false" : "true");
    };
    setCollapsed(false);
    scope.listen(collapse, "pointerdown", event => event.stopPropagation());
    scope.listen(collapse, "click", () => setCollapsed(!content.hidden));
    const actions = div("ce-panel-titlebar-actions");
    const grip = text("⠿");
    grip.setAttribute("aria-hidden", "true");
    actions.append(collapse, grip);
    titlebar.append(heading(title), actions);
    root.append(titlebar, content);
    scope.listen(root, "pointerdown", () => bringPanelToFront(root), true);
    scope.listen(root, "focusin", () => bringPanelToFront(root));
    makeWindowDraggable(root, titlebar);
    return { root, content };
  }
  function makeButton(value: string, onClick: () => void): HTMLButtonElement {
    const node = document.createElement("button");
    node.type = "button";
    node.textContent = value;
    scope.listen(node, "click", onClick);
    return node;
  }
  function makeIconButton(icon: string, label: string, onClick: () => void): HTMLButtonElement {
    const node = makeButton(icon, onClick);
    node.className = "ce-icon-button";
    node.title = label;
    node.setAttribute("aria-label", label);
    return node;
  }
  function makeWindowDraggable(windowNode: HTMLElement, handle: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    let left = 0;
    let top = 0;
    scope.listen(handle, "pointerdown", event => {
      if (event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea")) return;
      event.preventDefault();
      bringPanelToFront(windowNode);
      const bounds = windowNode.getBoundingClientRect();
      startX = event.clientX;
      startY = event.clientY;
      left = bounds.left;
      top = bounds.top;
      windowNode.classList.add("ce-panel--dragging");
      handle.setPointerCapture(event.pointerId);
    });
    scope.listen(handle, "pointermove", event => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      const bounds = windowNode.getBoundingClientRect();
      const nextLeft = clamp(left + event.clientX - startX, 8, Math.max(8, window.innerWidth - bounds.width - 8));
      const nextTop = clamp(top + event.clientY - startY, 8, Math.max(8, window.innerHeight - bounds.height - 8));
      windowNode.style.left = `${nextLeft}px`;
      windowNode.style.top = `${nextTop}px`;
      windowNode.style.right = "auto";
      windowNode.style.bottom = "auto";
    });
    const finish = (event: PointerEvent): void => {
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      windowNode.classList.remove("ce-panel--dragging");
    };
    scope.listen(handle, "pointerup", finish);
    scope.listen(handle, "pointercancel", finish);
  }
  function numberInput(value: string, min: string, step: string): HTMLInputElement {
    const node = document.createElement("input");
    node.type = "number";
    node.value = value;
    node.min = min;
    node.step = step;
    return node;
  }
  function rangeInput(value: string, min: string, max: string, step: string): HTMLInputElement {
    const node = document.createElement("input");
    node.type = "range";
    node.value = value;
    node.min = min;
    node.max = max;
    node.step = step;
    return node;
  }
  function checkbox(checked: boolean, onChange: (checked: boolean) => void): HTMLInputElement {
    const node = document.createElement("input");
    node.type = "checkbox";
    node.checked = checked;
    scope.listen(node, "change", () => onChange(node.checked));
    return node;
  }
  function toggleLabel(caption: string, input: HTMLInputElement): HTMLLabelElement {
    const node = document.createElement("label");
    node.className = "ce-toggle";
    node.append(input, document.createTextNode(caption));
    return node;
  }
  function select(values: string[], selected: string): HTMLSelectElement {
    const node = document.createElement("select");
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = editorOptionText(value);
      option.selected = value === selected;
      node.appendChild(option);
    }
    return node;
  }
  function label(value: string, control: HTMLElement): HTMLLabelElement {
    const node = document.createElement("label");
    node.textContent = `${value} `;
    node.appendChild(control);
    return node;
  }
  function divider(): HTMLHRElement {
    return document.createElement("hr");
  }
  return {
    floatingWindow,
    makeButton,
    makeIconButton,
    makeWindowDraggable,
    numberInput,
    rangeInput,
    checkbox,
    toggleLabel,
    select,
    label,
    divider
  };
}
