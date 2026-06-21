import type * as d3 from "d3";
import { drag } from "d3";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { downloadFile, getFileName } from "../controllers/editors";
import type { Burg } from "../modules/burgs-generator";
import { COA, type Emblem } from "../modules/emblem/generator";
import type { Province } from "../modules/provinces-generator";
import type { State } from "../modules/states-generator";
import { COArenderer } from "../renderers/emblem-renderer";
import {
  type BurgOptionItem,
  getEmblemEditorState,
  type OptionItem,
  setEmblemEditorState
} from "../store/emblemEditorState";
import { openURL, rn } from "../utils";
import { clearMainTip, type EmblemEl, highlightEmblemElement, tip } from "../utils/uiHelpers";

export function editEmblem(type?: string, id?: string, elInput?: Element | Burg | Province | State): void {
  if (viewContext.customization) return;
  let el: Burg | Province | State | undefined = elInput instanceof Element ? undefined : elInput;
  if (!id && elInput instanceof Element) {
    const parent = elInput.parentNode as Element;
    const [g, t] =
      parent.id === "burgEmblems"
        ? [worldContext.pack.burgs, "burg"]
        : parent.id === "provinceEmblems"
          ? [worldContext.pack.provinces, "province"]
          : [worldContext.pack.states, "state"];
    const i = +(elInput as SVGElement).dataset.i!;
    type = t;
    id = `${type}COA${i}`;
    el = (g as (Burg | Province | State)[])[i];
  }

  let _ex = 0,
    _ey = 0;
  viewContext.emblems
    .selectAll<SVGUseElement, unknown>("use")
    .call(
      drag<SVGUseElement, unknown>()
        .on("start", function (this: SVGUseElement, event: d3.D3DragEvent<SVGUseElement, unknown, unknown>) {
          _ex = Number(this.getAttribute("x")) - event.x;
          _ey = Number(this.getAttribute("y")) - event.y;
        })
        .on("drag", function (this: SVGUseElement, event: d3.D3DragEvent<SVGUseElement, unknown, unknown>) {
          this.setAttribute("x", String(_ex + event.x));
          this.setAttribute("y", String(_ey + event.y));
        })
        .on("end", function (this: SVGUseElement, event: d3.D3DragEvent<SVGUseElement, unknown, unknown>) {
          const categorySize = Number(this.parentNode ? (this.parentNode as SVGGElement).getAttribute("font-size") : 1);
          const size = el?.coa?.size || 1;
          const shift = (categorySize * size) / 2;
          if (el?.coa) {
            el.coa.x = rn(_ex + event.x + shift, 2);
            el.coa.y = rn(_ey + event.y + shift, 2);
          }
        })
    )
    .classed("draggable", true);

  updateElementSelectors(type!, id!, el);

  setEmblemEditorState({ isOpen: true, uploadMode: false, downloadMode: false });
}

export function closeEmblemEditor(): void {
  setEmblemEditorState({ isOpen: false });
  viewContext.emblems
    .selectAll<SVGUseElement, unknown>("use")
    .call(drag<SVGUseElement, unknown>().on("drag", null))
    .attr("class", null);
}

function updateElementSelectors(typeVal: string, idVal: string, elVal: Burg | Province | State | undefined): void {
  let state = 0;
  let province = 0;
  let burg = 0;

  // define selected values
  if (typeVal === "state") state = (elVal as State).i;
  else if (typeVal === "province") {
    const p = elVal as Province;
    province = p.i;
    state = worldContext.pack.states[p.state].i;
  } else if (elVal) {
    const b = elVal as Burg;
    burg = b.i!;
    const p = worldContext.pack.cells.province[b.cell];
    if (p) province = worldContext.pack.provinces[p].i;
    state = worldContext.pack.states[b.state!].i;
  }

  const validBurgs = worldContext.pack.burgs.filter(b => b.i && !b.removed && b.coa);

  // update option list and select actual values
  const states: OptionItem[] = [];
  const neutralBurgs = validBurgs.filter(b => !b.state);
  if (neutralBurgs.length) {
    states.push({ i: 0, name: worldContext.pack.states[0].name });
  }
  const stateList = (worldContext.pack.states as State[]).filter(s => s.i && !s.removed);
  stateList.forEach(s => {
    states.push({ i: s.i, name: s.name ?? "" });
  });

  const provinces: OptionItem[] = [{ i: 0, name: "" }];
  const provinceList = (worldContext.pack.provinces as Province[]).filter(p => !p.removed && p.state === state);
  provinceList.forEach(p => {
    provinces.push({ i: p.i, name: p.name ?? "" });
  });

  const burgs: BurgOptionItem[] = [{ i: 0, name: "", isCapital: false, isDisabled: true }];
  const burgList = validBurgs.filter(b =>
    province ? worldContext.pack.cells.province[b.cell] === province : b.state === state
  );
  burgList.forEach(b => {
    burgs.push({ i: b.i!, name: b.name ?? "", isCapital: !!b.capital });
  });

  if (elVal) COArenderer.trigger(idVal, elVal.coa!);

  let armigerName = "";
  let shape = "";
  let size = 1;
  let isCustom = false;

  if (elVal?.coa) {
    armigerName = ("fullName" in elVal ? elVal.fullName : undefined) || elVal.name || "Unknown";
    isCustom = !!elVal.coa.custom;
    shape = elVal.coa.shield || "";
    size = elVal.coa.size || 1;
  }

  setEmblemEditorState({
    targetType: typeVal as "state" | "province" | "burg",
    targetId: idVal,
    targetElement: elVal || null,
    states,
    provinces,
    burgs,
    selectedState: state,
    selectedProvince: province,
    selectedBurg: burg,
    armigerName,
    shape,
    size,
    isCustom
  });
}

function selectState(stateId: number): void {
  let type = "state";
  let el: Burg | Province | State | undefined;
  let id = "";

  if (stateId) {
    el = worldContext.pack.states[stateId];
    id = `stateCOA${stateId}`;
  } else {
    const neutralBurgs = worldContext.pack.burgs.filter(b => b.i && !b.removed && !b.state);
    if (!neutralBurgs.length) return;
    type = "burg";
    el = neutralBurgs[0];
    id = `burgCOA${neutralBurgs[0].i}`;
  }
  updateElementSelectors(type, id, el);
}

function selectProvince(provinceId: number): void {
  let type = "province";
  let el: Burg | Province | State | undefined;
  let id = "";

  if (provinceId) {
    el = worldContext.pack.provinces[provinceId];
    id = `provinceCOA${provinceId}`;
  } else {
    const stateId = getEmblemEditorState().selectedState;
    type = "state";
    el = worldContext.pack.states[stateId];
    id = `stateCOA${stateId}`;
  }
  updateElementSelectors(type, id, el);
}

function selectBurg(burgId: number): void {
  if (!burgId) return;
  const el = worldContext.pack.burgs[burgId];
  updateElementSelectors("burg", `burgCOA${burgId}`, el);
}

function changeShape(newShape: string): void {
  const { targetElement, targetId } = getEmblemEditorState();
  if (!targetElement?.coa) return;
  targetElement.coa.shield = newShape;
  const coaEl = document.getElementById(targetId);
  if (coaEl) coaEl.remove();
  COArenderer.trigger(targetId, targetElement.coa);
  setEmblemEditorState({ shape: newShape });
}

function showArea(): void {
  const { targetType, targetElement } = getEmblemEditorState();
  if (targetElement) highlightEmblemElement(targetType, targetElement as EmblemEl);
}

function changeSize(size: number): void {
  const { targetType, targetId, targetElement } = getEmblemEditorState();
  if (!targetElement?.coa) return;

  targetElement.coa.size = size;
  setEmblemEditorState({ size });

  const g = viewContext.emblems.select(`#${targetType}Emblems`);
  g.select(`[data-i='${targetElement.i}']`).remove();
  if (!size) return;

  // re-append use element
  const categotySize = +g.attr("font-size");
  const shift = (categotySize * size) / 2;
  const x =
    targetElement.coa.x ||
    ("x" in targetElement ? (targetElement as Burg).x : ((targetElement as State | Province).pole?.[0] ?? 0));
  const y =
    targetElement.coa.y ||
    ("y" in targetElement ? (targetElement as Burg).y : ((targetElement as State | Province).pole?.[1] ?? 0));

  g.append("use")
    .attr("data-i", targetElement.i!)
    .attr("x", rn(x - shift, 2))
    .attr("y", rn(y - shift, 2))
    .attr("width", `${size}em`)
    .attr("height", `${size}em`)
    .attr("href", `#${targetId}`);
}

function regenerate(): void {
  const { targetType, targetId, targetElement } = getEmblemEditorState();
  const el = targetElement;
  if (!el?.coa) return;

  let parent: Province | State | null = null;
  if (targetType === "province") parent = worldContext.pack.states[(el as Province).state] as State;
  else if (targetType === "burg") {
    const b = el as Burg;
    const province = worldContext.pack.cells.province[b.cell];
    parent = province
      ? (worldContext.pack.provinces[province] as Province)
      : (worldContext.pack.states[b.state!] as State);
  }

  const parentCulture = parent && "culture" in parent ? (parent as State).culture : 0;
  const elCulture = "culture" in el ? ((el as Burg | State).culture ?? 0) : 0;
  const elState = "state" in el ? (el as Province | Burg).state : undefined;
  const shield = el.coa.shield || COA.getShield(elCulture || parentCulture, elState);

  el.coa = COA.generate(parent ? parent.coa : null, 0.3, 0.1, undefined);
  el.coa.shield = shield;

  const coaEl = document.getElementById(targetId);
  if (coaEl) coaEl.remove();
  COArenderer.trigger(targetId, el.coa);

  setEmblemEditorState({ shape: shield as string, isCustom: false });
}

function openInArmoria(): void {
  const { targetElement } = getEmblemEditorState();
  if (!targetElement?.coa) return;
  const coa = targetElement.coa && !targetElement.coa.custom ? targetElement.coa : { t1: "sable" };
  const json = JSON.stringify(coa).replaceAll("#", "%23");
  const url = `https://azgaar.github.io/Armoria/?coa=${json}&from=FMG`;
  openURL(url);
}

function toggleUpload(): void {
  const { uploadMode } = getEmblemEditorState();
  setEmblemEditorState({ uploadMode: !uploadMode, downloadMode: false });
}

function toggleDownload(): void {
  const { downloadMode } = getEmblemEditorState();
  setEmblemEditorState({ downloadMode: !downloadMode, uploadMode: false });
}

function uploadImage(file: File, uploadType: "image" | "svg"): void {
  if (file.size > 500000) {
    const message =
      "File is too big, please optimize file size up to 500kB and re-upload. Recommended size is 200x200 px and up to 100kB";
    tip(message, true, "error", 5000);
    return;
  }

  const reader = new FileReader();
  reader.onload = readerEvent => {
    const { targetId, targetElement } = getEmblemEditorState();
    const el = targetElement;
    if (!el?.coa) return;

    const result = (readerEvent.target as FileReader).result as string;
    const defsEmblems = document.getElementById("defs-emblems")!;
    const oldEmblem = document.getElementById(targetId);

    let href = result;
    if (uploadType === "svg") {
      const htmlEl = document.createElement("html");
      htmlEl.innerHTML = result;

      htmlEl.querySelectorAll("*").forEach(elem => {
        if (elem.id === "adobe_illustrator_pgf") elem.remove();

        elem.getAttributeNames().forEach(attr => {
          if (attr.includes("inkscape") || attr.includes("sodipodi")) elem.removeAttribute(attr);
        });
      });

      const svgEl = htmlEl.querySelector("svg");
      if (!svgEl) {
        const message = "The file is not a valid SVG. Please use Armoria or other relevant tools";
        tip(message, false, "error");
        return;
      }

      const serialized = new XMLSerializer().serializeToString(svgEl);
      href = `data:image/svg+xml;base64,${window.btoa(serialized)}`;
    }

    const svgStr = `<svg id="${targetId}" viewBox="0 0 200 200"><image width="200" height="200" href="${href}"/></svg>`;
    defsEmblems.insertAdjacentHTML("beforeend", svgStr);

    if (oldEmblem) oldEmblem.remove();

    const customCoa: { custom: boolean; size?: number; x?: number; y?: number } = { custom: true };
    if (el.coa.size) customCoa.size = el.coa.size;
    if (el.coa.x) customCoa.x = el.coa.x;
    if (el.coa.y) customCoa.y = el.coa.y;
    el.coa = customCoa as unknown as Emblem;

    setEmblemEditorState({ isCustom: true, uploadMode: false });
  };

  if (uploadType === "image") reader.readAsDataURL(file);
  else reader.readAsText(file);
}

async function download(format: string): Promise<void> {
  const { targetId, targetElement, downloadSize } = getEmblemEditorState();
  const el = targetElement;
  const coa = document.getElementById(targetId) as Element as SVGElement;
  const url = await getURL(coa, downloadSize);
  const link = document.createElement("a");
  const name = el ? ("fullName" in el && el.fullName ? el.fullName : el.name) : "unknown";
  link.download = `${getFileName(`Emblem ${name}`)}.${format}`;

  if (format === "svg") {
    link.href = url;
    link.click();
  } else {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = downloadSize;
    canvas.height = downloadSize;

    const img = new Image();
    img.src = url;
    img.onload = () => {
      if (format === "jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataURL = canvas.toDataURL(`image/${format}`, 0.92);
      link.href = dataURL;
      link.click();
      window.setTimeout(() => window.URL.revokeObjectURL(dataURL), 6000);
    };
  }
  setEmblemEditorState({ downloadMode: false });
}

async function getURL(svgEl: SVGElement, size: number): Promise<string> {
  const serialized = getSVG(svgEl, size);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  window.setTimeout(() => window.URL.revokeObjectURL(url), 6000);
  return url;
}

function getSVG(svgEl: SVGElement, size: number): string {
  const clone = svgEl.cloneNode(true) as SVGElement;
  clone.setAttribute("width", String(size));
  clone.setAttribute("height", String(size));
  return new XMLSerializer().serializeToString(clone);
}

async function downloadGallery(): Promise<void> {
  const validStates = (worldContext.pack.states as State[]).filter(s => s.i && !s.removed && s.coa);
  const validProvinces = (worldContext.pack.provinces as Province[]).filter(p => p.i && !p.removed && p.coa);
  const validBurgs = worldContext.pack.burgs.filter(b => b.i && !b.removed && b.coa);

  tip("Preparing for download...", true, "warn");

  const statePromises = validStates.map(state => COArenderer.trigger(`stateCOA${state.i}`, state.coa!));
  const provincePromises = validProvinces.map(province =>
    COArenderer.trigger(`provinceCOA${province.i}`, province.coa!)
  );
  const burgPromises = validBurgs.map(burg => COArenderer.trigger(`burgCOA${burg.i}`, burg.coa!));
  const promises = [...statePromises, ...provincePromises, ...burgPromises];

  await Promise.allSettled(promises);
  clearMainTip();

  const back = `<a href="javascript:history.back()">Go Back</a>`;

  const stateSection =
    `<div><h2>States</h2>` +
    validStates
      .map(state => {
        const stateEl = document.getElementById(`stateCOA${state.i}`) as Element as SVGElement;
        return `<figure id="state_${state.i}"><a href="#provinces_${state.i}"><figcaption>${
          state.fullName
        }</figcaption>${getSVG(stateEl, 200)}</a></figure>`;
      })
      .join("") +
    `</div>`;

  const provinceSections = validStates
    .map(state => {
      const stateProvinces = validProvinces.filter(p => p.state === state.i);
      const figures = stateProvinces
        .map(province => {
          const provEl = document.getElementById(`provinceCOA${province.i}`) as Element as SVGElement;
          return `<figure id="province_${province.i}"><a href="#burgs_${province.i}"><figcaption>${
            province.fullName
          }</figcaption>${getSVG(provEl, 200)}</a></figure>`;
        })
        .join("");
      return stateProvinces.length
        ? `<div id="provinces_${state.i}">${back}<h2>${state.fullName} provinces</h2>${figures}</div>`
        : "";
    })
    .join("");

  const burgSections = validStates
    .map(state => {
      const stateBurgs = validBurgs.filter(b => b.state === state.i);
      let stateBurgSections = validProvinces
        .filter(p => p.state === state.i)
        .map(province => {
          const provinceBurgs = stateBurgs.filter(b => worldContext.pack.cells.province[b.cell] === province.i);
          const provinceBurgFigures = provinceBurgs
            .map(burg => {
              const burgEl = document.getElementById(`burgCOA${burg.i}`) as Element as SVGElement;
              return `<figure id="burg_${burg.i}"><figcaption>${burg.name}</figcaption>${getSVG(burgEl, 200)}</figure>`;
            })
            .join("");
          return provinceBurgs.length
            ? `<div id="burgs_${province.i}">${back}<h2>${province.fullName} burgs</h2>${provinceBurgFigures}</div>`
            : "";
        })
        .join("");

      const stateBurgOutOfProvinces = stateBurgs.filter(b => !worldContext.pack.cells.province[b.cell]);
      const stateBurgOutOfProvincesFigures = stateBurgOutOfProvinces
        .map(burg => {
          const burgEl = document.getElementById(`burgCOA${burg.i}`) as Element as SVGElement;
          return `<figure id="burg_${burg.i}"><figcaption>${burg.name}</figcaption>${getSVG(burgEl, 200)}</figure>`;
        })
        .join("");
      if (stateBurgOutOfProvincesFigures)
        stateBurgSections += `<div><h2>${state.fullName} burgs under direct control</h2>${stateBurgOutOfProvincesFigures}</div>`;
      return stateBurgSections;
    })
    .join("");

  const neutralBurgs = validBurgs.filter(b => !b.state);
  const neutralsSection = neutralBurgs.length
    ? "<div><h2>Independent burgs</h2>" +
      neutralBurgs
        .map(burg => {
          const burgEl = document.getElementById(`burgCOA${burg.i}`) as Element as SVGElement;
          return `<figure id="burg_${burg.i}"><figcaption>${burg.name}</figcaption>${getSVG(burgEl, 200)}</figure>`;
        })
        .join("") +
      "</div>"
    : "";

  const mapName = (document.getElementById("mapName") as HTMLInputElement)?.value || "Map";
  const FMG = `<a href="https://azgaar.github.io/Fantasy-Map-Generator" target="_blank">Azgaar's Fantasy Map Generator</a>`;
  const license = `<a target="_blank" href="https://github.com/Azgaar/Armoria#license">the license</a>`;
  const html = /* html */ `<!DOCTYPE html>
    <html>
      <head>
        <title>${mapName} Emblems Gallery</title>
      </head>
      <style type="text/css">
        body { margin: 0; padding: 1em; font-family: serif; }
        h1, h2 { font-family: "Forum"; }
        div { width: 100%; max-width: 1018px; margin: 0 auto; border-bottom: 1px solid #ddd; }
        figure { margin: 0 0 2em; display: inline-block; transition: 0.2s; }
        figure:hover { background-color: #f6f6f6; }
        figcaption { text-align: center; margin: 0.4em 0; width: 200px; font-family: "Overlock SC"; }
        address { width: 100%; max-width: 1018px; margin: 0 auto; }
        a { color: black; }
        figure > a { text-decoration: none; }
        div > a { float: right; font-family: var(--monospace); margin-top: 0.8em; }
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Forum&family=Overlock+SC" rel="stylesheet" />
      <body>
        <div><h1>${mapName} Emblems Gallery</h1></div>
        ${stateSection} ${provinceSections} ${burgSections} ${neutralsSection}
        <address>Generated by ${FMG}. The tool is free, but images may be copyrighted, see ${license}</address>
      </body>
    </html>`;
  downloadFile(html, `${getFileName("Emblems Gallery")}.html`, "text/plain");
}

export const emblemEditorActions = {
  selectState,
  selectProvince,
  selectBurg,
  changeShape,
  changeSize,
  regenerate,
  openInArmoria,
  toggleUpload,
  toggleDownload,
  uploadImage,
  download,
  downloadGallery,
  showArea
};
