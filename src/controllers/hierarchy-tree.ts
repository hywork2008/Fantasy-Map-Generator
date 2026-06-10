import * as d3 from "d3";
import { capitalize, ensureEl } from "../utils";

export interface HierarchyElement {
  i: number;
  name: string;
  code?: string;
  color?: string;
  cells?: number;
  origins: (number | null)[];
  removed?: boolean;
  [key: string]: unknown;
}

export interface HierarchyProps {
  type: string;
  data: HierarchyElement[];
  onNodeEnter: (d: d3.HierarchyPointNode<HierarchyElement>) => void;
  onNodeLeave: (d: d3.HierarchyPointNode<HierarchyElement>) => void;
  getDescription: (element: HierarchyElement) => string;
  getShape: (element: HierarchyElement) => string | undefined;
}

// DOM is inserted before d3 selections are made
appendStyleSheet();
insertHtml();

const MARGINS = { top: 10, right: 10, bottom: -5, left: 10 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handleZoom = () => viewboxEl.attr("transform", (d3 as any).event.transform);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zoom = (d3 as any).zoom().scaleExtent([0.2, 1.5]).on("zoom", handleZoom);

let oldRoot: d3.HierarchyPointNode<HierarchyElement> | null = null;

const svgEl = d3.select<SVGSVGElement, unknown>("#hierarchyTree > svg").call(zoom);
const viewboxEl = svgEl.select<SVGGElement>("g#hierarchyTree_viewbox");
const primaryLinks = viewboxEl.select<SVGGElement>("g#hierarchyTree_linksPrimary");
const secondaryLinks = viewboxEl.select<SVGGElement>("g#hierarchyTree_linksSecondary");
const nodesEl = viewboxEl.select<SVGGElement>("g#hierarchyTree_nodes");
const dragLine = viewboxEl.select<SVGPathElement>("path#hierarchyTree_dragLine");

let dataElements: HierarchyElement[] = [];
let validElements: HierarchyElement[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let onNodeEnter: (d: any) => void = () => {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let onNodeLeave: (d: any) => void = () => {};
let getDescription: (element: HierarchyElement) => string = () => "";
let getShape: (element: HierarchyElement) => string | undefined = () => undefined;

export function open(props: HierarchyProps): void {
  closeDialogs("#hierarchyTree, .stable");

  dataElements = props.data;
  validElements = cleanupOrigins(dataElements);
  if (validElements.length < 3) {
    tip(`Not enough ${props.type} to show hierarchy`, false, "error");
    return;
  }

  onNodeEnter = props.onNodeEnter;
  onNodeLeave = props.onNodeLeave;
  getDescription = props.getDescription;
  getShape = props.getShape;

  const root = getRoot();
  if (!root) return;

  const treeWidth = root.leaves().length * 50;
  const treeHeight = root.height * 50;

  const w = treeWidth - MARGINS.left - MARGINS.right;
  const h = treeHeight + 30 - MARGINS.top - MARGINS.bottom;
  const treeLayout = d3.tree<HierarchyElement>().size([w, h]);

  const width = minmax(treeWidth, 300, innerWidth * 0.75);
  const height = minmax(treeHeight, 200, innerHeight * 0.75);

  zoom.extent([Array(2).fill(0), [width, height]]);
  svgEl.attr("viewBox", `0, 0, ${width}, ${height}`);

  ($("#hierarchyTree") as any).dialog({
    title: `${capitalize(props.type)} tree`,
    position: { my: "left center", at: "left+10 center", of: "svg" },
    width
  });

  renderTree(root, treeLayout);
}

function appendStyleSheet(): void {
  const style = document.createElement("style");
  style.textContent = /* css */ `
    #hierarchyTree_selectedOrigins > button { margin: 0 2px; }
    #hierarchyTree { display: flex; flex-direction: column; justify-content: space-between; }
    #hierarchyTree > svg { height: 100%; }
    .hierarchyTree_selectedOrigins { margin-right: 15px; }
    .hierarchyTree_selectedOrigin { border: 1px solid #aaa; background: none; padding: 1px 4px; }
    .hierarchyTree_selectedOrigin:hover { border: 1px solid #333; }
    .hierarchyTree_selectedOrigin::after { content: "✕"; margin-left: 8px; color: #999; }
    .hierarchyTree_selectedOrigin:hover:after { color: #333; }
    #hierarchyTree_originSelector { display: none; }
    #hierarchyTree_originSelector > form > div { padding: 0.3em; margin: 1px 0; border-radius: 1em; }
    #hierarchyTree_originSelector > form > div:hover { background-color: #ddd; }
    #hierarchyTree_originSelector > form > div[checked] { background-color: #c6d6d6; }
    #hierarchyTree_nodes > g > text { pointer-events: none; stroke: none; font-size: 11px; }
    #hierarchyTree_nodes > g.selected { stroke: #c13119; stroke-width: 1; cursor: move; }
    #hierarchyTree_dragLine { marker-end: url(#end-arrow); stroke: #333333; stroke-dasharray: 5; stroke-dashoffset: 1000; animation: dash 80s linear backwards; }
  `;
  document.head.appendChild(style);
}

function insertHtml(): void {
  const html = /* html */ `<div id="hierarchyTree" class="dialog" style="overflow: hidden;">
    <svg>
      <g id="hierarchyTree_viewbox" style="text-anchor: middle; dominant-baseline: central">
        <g transform="translate(10, -45)">
          <g id="hierarchyTree_links" fill="none" stroke="#aaa">
            <g id="hierarchyTree_linksPrimary"></g>
            <g id="hierarchyTree_linksSecondary" stroke-dasharray="1"></g>
          </g>
          <g id="hierarchyTree_nodes"></g>
          <path id="hierarchyTree_dragLine" path='' />
        </g>
      </g>
    </svg>
    <div id="hierarchyTree_details" class='chartInfo'>
      <div id='hierarchyTree_infoLine' style="display: block">&#8205;</div>
      <div id='hierarchyTree_selected' style="display: none">
        <span><span id='hierarchyTree_selectedName'></span>. </span>
        <span data-name="Type short name (abbreviation)">Abbreviation: <input id='hierarchyTree_selectedCode' type='text' maxlength='3' size='3' /></span>
        <span>Origins: <span id='hierarchyTree_selectedOrigins'></span></span>
        <button data-tip='Edit this node&#39;s origins' class="hierarchyTree_selectedButton" id='hierarchyTree_selectedSelectButton'>Edit</button>
        <button data-tip='Unselect this node' class="hierarchyTree_selectedButton" id='hierarchyTree_selectedCloseButton'>Unselect</button>
      </div>
    </div>
    <div id="hierarchyTree_originSelector"></div>
  </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);
}

function cleanupOrigins(elements: HierarchyElement[]): HierarchyElement[] {
  const existingElements = elements.filter(d => !d.removed);
  return existingElements.map(d => {
    if (d.i === 0) d.origins = [null];
    else if (!d.origins.length) d.origins = [0];
    else if (!existingElements.find(el => d.origins[0] === el.i)) d.origins = [0];
    return d;
  });
}

function getRoot(): d3.HierarchyPointNode<HierarchyElement> | null {
  try {
    const root = d3
      .stratify<HierarchyElement>()
      .id(d => String(d.i))
      .parentId(d => (d.origins[0] !== null && d.origins[0] !== undefined ? String(d.origins[0]) : null))(
      validElements
    ) as unknown as d3.HierarchyPointNode<HierarchyElement>;
    oldRoot = root;
    return root;
  } catch (error) {
    tip(`Hierarchy data issue. ${error}`, false, "error", 6000);
    return oldRoot;
  }
}

function getLinkKey(d: d3.HierarchyPointLink<HierarchyElement>): string {
  return `${d.source.id}-${d.target.id}`;
}

function getNodeKey(d: d3.HierarchyPointNode<HierarchyElement>): string {
  return d.id ?? "";
}

function getLinkPath(d: d3.HierarchyPointLink<HierarchyElement>): string {
  const {
    source: { x: sx, y: sy },
    target: { x: tx, y: ty }
  } = d;
  return `M${sx},${sy} C${sx},${(sy * 3 + ty) / 4} ${tx},${(sy * 2 + ty) / 3} ${tx},${ty}`;
}

function getSecondaryLinks(root: d3.HierarchyPointNode<HierarchyElement>) {
  const nodes = root.descendants();
  const links: { source: d3.HierarchyPointNode<HierarchyElement>; target: d3.HierarchyPointNode<HierarchyElement> }[] =
    [];
  for (const node of nodes) {
    const origins = node.data.origins;
    for (let i = 1; i < origins.length; i++) {
      const source = nodes.find(n => n.data.i === origins[i]);
      if (source) links.push({ source, target: node });
    }
  }
  return links;
}

const shapesMap: Record<string, string> = {
  undefined: "M5,0A5,5,0,1,1,-5,0A5,5,0,1,1,5,0",
  circle: "M11.3,0A11.3,11.3,0,1,1,-11.3,0A11.3,11.3,0,1,1,11.3,0",
  square: "M-11,-11h22v22h-22Z",
  hexagon: "M-6.5,-11.26l13,0l6.5,11.26l-6.5,11.26l-13,0l-6.5,-11.26Z",
  diamond: "M0,-14L14,0L0,14L-14,0Z",
  concave: "M-11,-11l11,2l11,-2l-2,11l2,11l-11,-2l-11,2l2,-11Z",
  octagon: "M-4.97,-12.01 l9.95,0 l7.04,7.04 l0,9.95 l-7.04,7.04 l-9.95,0 l-7.04,-7.04 l0,-9.95Z",
  pentagon: "M0,-14l14,11l-6,14h-16l-6,-14Z"
};

const getSortIndex = (node: d3.HierarchyPointNode<HierarchyElement>): number => {
  const descendants = node.descendants();
  const secondaryOrigins = descendants.flatMap(({ data }) => data.origins.slice(1)) as unknown as number[];
  if (secondaryOrigins.length === 0) return node.data.i;
  return d3.mean(secondaryOrigins) ?? node.data.i;
};

function renderTree(root: d3.HierarchyPointNode<HierarchyElement>, treeLayout: d3.TreeLayout<HierarchyElement>): void {
  treeLayout(root.sort((a, b) => getSortIndex(a) - getSortIndex(b)));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  primaryLinks
    .selectAll("path")
    .data(root.links(), getLinkKey as any)
    .join("path")
    .attr("d", getLinkPath as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  secondaryLinks
    .selectAll("path")
    .data(getSecondaryLinks(root), getLinkKey as any)
    .join("path")
    .attr("d", getLinkPath as any);

  const node = nodesEl
    .selectAll("g")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .data(root.descendants(), getNodeKey as any)
    .join("g")
    .attr("data-id", d => d.data.i)
    .attr("stroke", "#333")
    .attr("transform", d => `translate(${d.x}, ${d.y})`)
    .on("mouseenter", handleNoteEnter as any)
    .on("mouseleave", handleNodeExit as any)
    .on("click", selectElement as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .call((d3 as any).drag().on("start", dragToReorigin));

  node
    .selectAll("path")
    .data(d => [d])
    .join("path")
    .attr("d", d => {
      const key = getShape(d.data) ?? "undefined";
      return shapesMap[key] ?? shapesMap.undefined;
    })
    .attr("fill", d => (d.data.color as string) || "#ffffff")
    .attr("stroke-dasharray", d => (d.data.cells ? "none" : "1"));

  node
    .selectAll("text")
    .data(d => [d])
    .join("text")
    .text(d => d.data.code ?? "");
}

function mapCoords(
  newRoot: d3.HierarchyPointNode<HierarchyElement>,
  prevRoot: d3.HierarchyPointNode<HierarchyElement>
): void {
  newRoot.x = prevRoot.x;
  newRoot.y = prevRoot.y;
  for (const node of newRoot.descendants()) {
    const prevNode = prevRoot.descendants().find(n => n.data.i === node.data.i);
    if (prevNode) {
      node.x = prevNode.x;
      node.y = prevNode.y;
    }
  }
}

function updateTree(): void {
  if (!oldRoot) return;
  const prevRoot = oldRoot;
  const root = getRoot();
  if (!root) return;
  mapCoords(root, prevRoot);

  const linksUpdateDuration = 50;
  const moveDuration = 1000;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkEnter = (enter: any) =>
    enter
      .append("path")
      .attr("d", getLinkPath)
      .attr("opacity", 0)
      .call((e: any) => e.transition().duration(linksUpdateDuration).attr("opacity", 1));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkUpdate = (update: any) =>
    update.call((u: any) => u.transition().duration(linksUpdateDuration).attr("d", getLinkPath));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkExit = (exit: any) =>
    exit.call((e: any) => e.transition().duration(linksUpdateDuration).attr("opacity", 0).remove());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  primaryLinks
    .selectAll("path")
    .data(root.links(), getLinkKey as any)
    .join(linkEnter, linkUpdate, linkExit);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  secondaryLinks
    .selectAll("path")
    .data(getSecondaryLinks(root), getLinkKey as any)
    .join(linkEnter, linkUpdate, linkExit);

  const treeWidth = root.leaves().length * 50;
  const treeHeight = root.height * 50;
  const w = treeWidth - MARGINS.left - MARGINS.right;
  const h = treeHeight + 30 - MARGINS.top - MARGINS.bottom;
  const treeLayout = d3.tree<HierarchyElement>().size([w, h]);
  treeLayout(root.sort((a, b) => getSortIndex(a) - getSortIndex(b)));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (primaryLinks.selectAll("path").data(root.links(), getLinkKey as any) as any)
    .transition()
    .duration(moveDuration)
    .delay(linksUpdateDuration)
    .attr("d", getLinkPath);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (secondaryLinks.selectAll("path").data(getSecondaryLinks(root), getLinkKey as any) as any)
    .transition()
    .duration(moveDuration)
    .delay(linksUpdateDuration)
    .attr("d", getLinkPath);

  nodesEl
    .selectAll("g")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .data(root.descendants(), getNodeKey as any)
    .transition()
    .delay(linksUpdateDuration)
    .duration(moveDuration)
    .attr(
      "transform",
      d =>
        `translate(${(d as d3.HierarchyPointNode<HierarchyElement>).x},${(d as d3.HierarchyPointNode<HierarchyElement>).y})`
    );
}

function selectElement(this: SVGGElement, d: d3.HierarchyPointNode<HierarchyElement>): void {
  const dataElement = d.data;
  if (d.id === "0") return;

  const node = nodesEl.select<SVGGElement>(`g[data-id="${d.id}"]`);
  nodesEl.selectAll("g").style("outline", "none");
  node.style("outline", "1px solid #c13119");

  ensureEl("hierarchyTree_selected").style.display = "block";
  ensureEl("hierarchyTree_infoLine").style.display = "none";
  (ensureEl("hierarchyTree_selectedName") as HTMLElement).innerText = dataElement.name;
  (ensureEl("hierarchyTree_selectedCode") as HTMLInputElement).value = dataElement.code ?? "";

  (ensureEl("hierarchyTree_selectedCode") as HTMLInputElement).onchange = function (this: GlobalEventHandlers): any {
    const input = this as unknown as HTMLInputElement;
    if (input.value.length > 3) return void tip("Abbreviation must be 3 characters or less", false, "error", 3000);
    if (!input.value.length) return void tip("Abbreviation cannot be empty", false, "error", 3000);
    node.select("text").text(input.value);
    dataElement.code = input.value;
  };

  const createOriginButtons = () => {
    ensureEl("hierarchyTree_selectedOrigins").innerHTML = dataElement.origins
      .filter(origin => origin)
      .map((origin, index) => {
        const { name, code } = validElements.find(r => r.i === origin) || { name: "", code: "" };
        const type = index ? "Secondary" : "Primary";
        const tipText = `${type} origin: ${name}. Click to remove link to that origin`;
        return `<button data-id="${origin}" class="hierarchyTree_selectedButton hierarchyTree_selectedOrigin" data-tip="${tipText}">${code}</button>`;
      })
      .join("");

    ensureEl("hierarchyTree_selectedOrigins").onclick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName !== "BUTTON") return;
      const origin = Number(target.dataset.id);
      const filtered = dataElement.origins.filter(elementOrigin => elementOrigin !== origin);
      dataElement.origins = filtered.length ? filtered : [0];
      target.remove();
      updateTree();
    };
  };

  createOriginButtons();

  ensureEl("hierarchyTree_selectedSelectButton").onclick = () => {
    const origins = dataElement.origins;
    const descendants = d.descendants().map(d => d.data.i);
    const selectableElements = validElements.filter(({ i }) => !descendants.includes(i));

    const selectableElementsHtml = selectableElements.map(({ i, name, code, color }) => {
      const isPrimary = origins[0] === i ? "checked" : "";
      const isChecked = origins.includes(i) ? "checked" : "";
      if (i === 0) {
        return `<div ${isChecked}><input data-tip="Set as primary origin" type="radio" name="primary" value="${i}" ${isPrimary} /> Top level</div>`;
      }
      return `<div ${isChecked}>
        <input data-tip="Set as primary origin" type="radio" name="primary" value="${i}" ${isPrimary} />
        <input data-id="${i}" id="selectElementOrigin${i}" class="checkbox" type="checkbox" ${isChecked} />
        <label data-tip="Check to set as a secondary origin" for="selectElementOrigin${i}" class="checkbox-label">
          <fill-box fill="${color as string}" size=".8em" disabled></fill-box>
          ${code as string}: ${name}
        </label>
      </div>`;
    });

    ensureEl("hierarchyTree_originSelector").innerHTML =
      `<form style="max-height: 35vh">${selectableElementsHtml.join("")}</form>`;

    ($("#hierarchyTree_originSelector") as any).dialog({
      title: "Select origins",
      position: { my: "center", at: "center", of: "svg" },
      buttons: {
        Select: () => {
          ($("#hierarchyTree_originSelector") as any).dialog("close");
          const $selector = ensureEl("hierarchyTree_originSelector");
          const selectedRadio = $selector.querySelector<HTMLInputElement>("input[type='radio']:checked");
          const selectedCheckboxes = $selector.querySelectorAll<HTMLInputElement>("input[type='checkbox']:checked");
          const primary = selectedRadio ? Number(selectedRadio.value) : 0;
          const secondary = Array.from(selectedCheckboxes)
            .map(input => Number(input.dataset.id))
            .filter(origin => origin !== primary);
          dataElement.origins = [primary, ...secondary];
          updateTree();
          createOriginButtons();
        },
        Cancel: () => {
          ($("#hierarchyTree_originSelector") as any).dialog("close");
        }
      }
    });
  };

  ensureEl("hierarchyTree_selectedCloseButton").onclick = () => {
    node.style("outline", "none");
    ensureEl("hierarchyTree_selected").style.display = "none";
    ensureEl("hierarchyTree_infoLine").style.display = "block";
  };
}

function handleNoteEnter(this: SVGGElement, d: d3.HierarchyPointNode<HierarchyElement>): void {
  if (d.depth === 0) return;
  this.classList.add("selected");
  onNodeEnter(d);
  (ensureEl("hierarchyTree_infoLine") as HTMLElement).innerText = getDescription(d.data);
  tip("Drag to other node to add parent, click to edit");
}

function handleNodeExit(this: SVGGElement, d: d3.HierarchyPointNode<HierarchyElement>): void {
  this.classList.remove("selected");
  onNodeLeave(d);
  ensureEl("hierarchyTree_infoLine").innerHTML = "&#8205;";
  tip("");
}

function dragToReorigin(this: SVGGElement, from: d3.HierarchyPointNode<HierarchyElement>): void {
  if (from.id === "0") return;

  dragLine.attr("d", `M${from.x},${from.y}L${from.x},${from.y}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (d3 as any).event.on("drag", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dragLine.attr("d", `M${from.x},${from.y}L${(d3 as any).event.x},${(d3 as any).event.y}`);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (d3 as any).event.on("end", function (this: SVGGElement) {
    dragLine.attr("d", "");
    const selected = nodesEl.select<SVGGElement>("g.selected");
    if (!selected.size()) return;

    const elementId = from.data.i;
    const newOrigin = (selected.datum() as d3.HierarchyPointNode<HierarchyElement>).data.i;
    if (elementId === newOrigin) return;
    if (from.data.origins.includes(newOrigin)) return;
    if (from.descendants().some(node => node.data.i === newOrigin)) return;

    const element = dataElements.find(({ i }) => i === elementId);
    if (!element) return;

    if (element.origins[0] === 0) element.origins = [];
    element.origins.push(newOrigin);

    selectElement.call(this, from);
    updateTree();
  });
}
