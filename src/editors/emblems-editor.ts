import type * as d3 from "d3";
import { drag } from "d3";
import type { Burg } from "../modules/burgs-generator";
import { COA } from "../modules/emblem/generator";
import { COArenderer } from "../modules/emblem/renderer";
import type { Province } from "../modules/provinces-generator";
import type { State } from "../modules/states-generator";
import { openDialog } from "../ui/dialogs/dialogService";
import { openURL, rn } from "../utils";
import { type EmblemEl, highlightEmblemElement } from "../utils/uiHelpers";

export function editEmblem(type?: string, id?: string, elInput?: Element | Burg | Province | State): void {
  if (customization) return;
  let el: Burg | Province | State | undefined = elInput instanceof Element ? undefined : elInput;
  if (!id && elInput instanceof Element) defineEmblemData(elInput);

  let _ex = 0,
    _ey = 0;
  emblems
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

  const emblemStates = document.getElementById("emblemStates") as HTMLSelectElement;
  const emblemProvinces = document.getElementById("emblemProvinces") as HTMLSelectElement;
  const emblemBurgs = document.getElementById("emblemBurgs") as HTMLSelectElement;
  const emblemShapeSelector = document.getElementById("emblemShapeSelector") as HTMLSelectElement;

  updateElementSelectors(type!, id!, el);

  openDialog("emblemEditor", {
    title: "Edit Emblem",
    resizable: true,
    width: "18.2em",
    height: "auto",
    position: { my: "left top", at: "left+10 top+10", of: "svg", collision: "fit" },
    close: closeEmblemEditor
  });

  // add listeners, then remove on closure
  emblemStates.oninput = selectState;
  emblemProvinces.oninput = selectProvince;
  emblemBurgs.oninput = selectBurg;
  emblemShapeSelector.oninput = changeShape;
  document.getElementById("emblemSizeSlider")!.oninput = changeSize;
  document.getElementById("emblemSizeNumber")!.oninput = changeSize;
  document.getElementById("emblemsRegenerate")!.onclick = regenerate;
  document.getElementById("emblemsArmoria")!.onclick = openInArmoria;
  document.getElementById("emblemsUpload")!.onclick = toggleUpload;
  document.getElementById("emblemsUploadImage")!.onclick = () =>
    (document.getElementById("emblemImageToLoad") as HTMLInputElement).click();
  document.getElementById("emblemsUploadSVG")!.onclick = () =>
    (document.getElementById("emblemSVGToLoad") as HTMLInputElement).click();
  document.getElementById("emblemImageToLoad")!.onchange = () => upload("image");
  document.getElementById("emblemSVGToLoad")!.onchange = () => upload("svg");
  document.getElementById("emblemsDownload")!.onclick = toggleDownload;
  document.getElementById("emblemsDownloadSVG")!.onclick = () => download("svg");
  document.getElementById("emblemsDownloadPNG")!.onclick = () => download("png");
  document.getElementById("emblemsDownloadJPG")!.onclick = () => download("jpeg");
  document.getElementById("emblemsGallery")!.onclick = downloadGallery;
  document.getElementById("emblemsFocus")!.onclick = showArea;

  function defineEmblemData(clickedEl: Element): void {
    const parent = clickedEl.parentNode as Element;
    const [g, t] =
      parent.id === "burgEmblems"
        ? [pack.burgs, "burg"]
        : parent.id === "provinceEmblems"
          ? [pack.provinces, "province"]
          : [pack.states, "state"];
    const i = +(clickedEl as SVGElement).dataset.i!;
    type = t;
    id = `${type}COA${i}`;
    el = g[i];
  }

  function updateElementSelectors(typeVal: string, idVal: string, elVal: Burg | Province | State | undefined): void {
    let state = 0;
    let province = 0;
    let burg = 0;

    // set active type
    emblemStates.parentElement!.className = typeVal === "state" ? "active" : "";
    emblemProvinces.parentElement!.className = typeVal === "province" ? "active" : "";
    emblemBurgs.parentElement!.className = typeVal === "burg" ? "active" : "";

    // define selected values
    if (typeVal === "state") state = (elVal as State).i;
    else if (typeVal === "province") {
      const p = elVal as Province;
      province = p.i;
      state = pack.states[p.state].i;
    } else {
      const b = elVal as Burg;
      burg = b.i!;
      const p = pack.cells.province[b.cell];
      if (p) province = pack.provinces[p].i;
      state = pack.states[b.state!].i;
    }

    const validBurgs = pack.burgs.filter(b => b.i && !b.removed && b.coa);

    // update option list and select actual values
    emblemStates.options.length = 0;
    const neutralBurgs = validBurgs.filter(b => !b.state);
    if (neutralBurgs.length) emblemStates.options.add(new Option(pack.states[0].name, "0", false, !state));
    const stateList = (pack.states as State[]).filter(s => s.i && !s.removed);
    stateList.forEach(s => {
      emblemStates.options.add(new Option(s.name ?? "", String(s.i), false, s.i === state));
    });

    emblemProvinces.options.length = 0;
    emblemProvinces.options.add(new Option("", "0", false, !province));
    const provinceList = (pack.provinces as Province[]).filter(p => !p.removed && p.state === state);
    provinceList.forEach(p => {
      emblemProvinces.options.add(new Option(p.name, String(p.i), false, p.i === province));
    });

    emblemBurgs.options.length = 0;
    emblemBurgs.options.add(new Option("", "0", false, !burg));
    const burgList = validBurgs.filter(b => (province ? pack.cells.province[b.cell] === province : b.state === state));
    burgList.forEach(b => {
      emblemBurgs.options.add(new Option(b.capital ? `👑 ${b.name}` : b.name, String(b.i), false, b.i === burg));
    });
    emblemBurgs.options[0].disabled = true;

    if (elVal) COArenderer.trigger(idVal, elVal.coa!);
    if (elVal) updateEmblemData(typeVal, idVal, elVal);
  }

  function updateEmblemData(_typeVal: string, idVal: string, elVal: Burg | Province | State): void {
    if (!elVal.coa) return;
    document.getElementById("emblemImage")!.setAttribute("href", `#${idVal}`);
    const name = ("fullName" in elVal ? elVal.fullName : undefined) || elVal.name || "Unknown";
    document.getElementById("emblemArmiger")!.innerText = name;

    if (elVal.coa.custom) emblemShapeSelector.disabled = true;
    else {
      emblemShapeSelector.disabled = false;
      emblemShapeSelector.value = elVal.coa.shield || "";
    }

    const size = elVal.coa.size || 1;
    (document.getElementById("emblemSizeSlider") as HTMLInputElement).value = String(size);
    (document.getElementById("emblemSizeNumber") as HTMLInputElement).value = String(size);
  }

  function selectState(): void {
    const stateId = +emblemStates.value;
    if (stateId) {
      type = "state";
      el = pack.states[stateId];
      id = `stateCOA${stateId}`;
    } else {
      const neutralBurgs = pack.burgs.filter(b => b.i && !b.removed && !b.state);
      if (!neutralBurgs.length) return;
      type = "burg";
      el = neutralBurgs[0];
      id = `burgCOA${neutralBurgs[0].i}`;
    }
    updateElementSelectors(type!, id!, el);
  }

  function selectProvince(): void {
    const provinceId = +emblemProvinces.value;

    if (provinceId) {
      type = "province";
      el = pack.provinces[provinceId];
      id = `provinceCOA${provinceId}`;
    } else {
      const stateId = +emblemStates.value;
      type = "state";
      el = pack.states[stateId];
      id = `stateCOA${stateId}`;
    }

    updateElementSelectors(type!, id!, el);
  }

  function selectBurg(): void {
    const burgId = +emblemBurgs.value;
    type = "burg";
    el = pack.burgs[burgId];
    id = `burgCOA${burgId}`;
    updateElementSelectors(type!, id!, el);
  }

  function changeShape(): void {
    if (!el?.coa) return;
    el.coa.shield = emblemShapeSelector.value;
    const coaEl = document.getElementById(id!);
    if (coaEl) coaEl.remove();
    COArenderer.trigger(id!, el.coa);
  }

  function showArea(): void {
    highlightEmblemElement(type!, el! as EmblemEl);
  }

  function changeSize(event: Event): void {
    if (!el?.coa) return;
    const size = +(event.target as HTMLInputElement).value;
    el.coa.size = size;

    (document.getElementById("emblemSizeSlider") as HTMLInputElement).value = String(size);
    (document.getElementById("emblemSizeNumber") as HTMLInputElement).value = String(size);

    const g = emblems.select(`#${type}Emblems`);
    g.select(`[data-i='${el.i}']`).remove();
    if (!size) return;

    // re-append use element
    const categotySize = +g.attr("font-size");
    const shift = (categotySize * size) / 2;
    const x = el.coa.x || ("x" in el ? (el as Burg).x : ((el as State | Province).pole?.[0] ?? 0));
    const y = el.coa.y || ("y" in el ? (el as Burg).y : ((el as State | Province).pole?.[1] ?? 0));

    g.append("use")
      .attr("data-i", el.i!)
      .attr("x", rn(x - shift, 2))
      .attr("y", rn(y - shift, 2))
      .attr("width", `${size}em`)
      .attr("height", `${size}em`)
      .attr("href", `#${id}`);
  }

  function regenerate(): void {
    if (!el?.coa) return;
    let parent: Province | State | null = null;
    if (type === "province") parent = pack.states[(el as Province).state] as State;
    else if (type === "burg") {
      const b = el as Burg;
      const province = pack.cells.province[b.cell];
      parent = province ? (pack.provinces[province] as Province) : (pack.states[b.state!] as State);
    }

    const parentCulture = parent && "culture" in parent ? (parent as State).culture : 0;
    const elCulture = "culture" in el ? ((el as Burg | State).culture ?? 0) : 0;
    const elState = "state" in el ? (el as Province | Burg).state : undefined;
    const shield = el.coa.shield || COA.getShield(elCulture || parentCulture, elState);
    el.coa = COA.generate(parent ? parent.coa : null, 0.3, 0.1, undefined);
    el.coa.shield = shield;
    emblemShapeSelector.disabled = false;
    emblemShapeSelector.value = el.coa.shield as string;

    const coaEl = document.getElementById(id!);
    if (coaEl) coaEl.remove();
    COArenderer.trigger(id!, el.coa);
  }

  function openInArmoria(): void {
    if (!el?.coa) return;
    const coa = el.coa && !el.coa.custom ? el.coa : { t1: "sable" };
    const json = JSON.stringify(coa).replaceAll("#", "%23");
    const url = `https://azgaar.github.io/Armoria/?coa=${json}&from=FMG`;
    openURL(url);
  }

  function toggleUpload(): void {
    document.getElementById("emblemDownloadControl")!.classList.add("hidden");
    const buttons = document.getElementById("emblemUploadControl")!;
    buttons.classList.toggle("hidden");
  }

  function upload(uploadType: string): void {
    const input =
      uploadType === "image"
        ? (document.getElementById("emblemImageToLoad") as HTMLInputElement)
        : (document.getElementById("emblemSVGToLoad") as HTMLInputElement);
    const file = input.files![0];
    input.value = "";

    if (file.size > 500000) {
      const message =
        "File is too big, please optimize file size up to 500kB and re-upload. Recommended size is 200x200 px and up to 100kB";
      tip(message, true, "error", 5000);
      return;
    }

    const reader = new FileReader();

    reader.onload = readerEvent => {
      if (!el?.coa) return;
      const result = (readerEvent.target as FileReader).result as string;
      const defsEmblems = document.getElementById("defs-emblems")!;
      const oldEmblem = document.getElementById(id!);

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

      const svgStr = `<svg id="${id}" viewBox="0 0 200 200"><image width="200" height="200" href="${href}"/></svg>`;
      defsEmblems.insertAdjacentHTML("beforeend", svgStr);

      if (oldEmblem) oldEmblem.remove();

      const customCoa: { custom: boolean; size?: number; x?: number; y?: number } = { custom: true };
      if (el.coa.size) customCoa.size = el.coa.size;
      if (el.coa.x) customCoa.x = el.coa.x;
      if (el.coa.y) customCoa.y = el.coa.y;
      el.coa = customCoa as unknown as import("../modules/emblem/generator").Emblem;

      emblemShapeSelector.disabled = true;
    };

    if (uploadType === "image") reader.readAsDataURL(file);
    else reader.readAsText(file);
  }

  function toggleDownload(): void {
    document.getElementById("emblemUploadControl")!.classList.add("hidden");
    const buttons = document.getElementById("emblemDownloadControl")!;
    buttons.classList.toggle("hidden");
  }

  async function download(format: string): Promise<void> {
    const coa = document.getElementById(id!) as unknown as SVGElement;
    const size = +emblemsDownloadSize.value;
    const url = await getURL(coa, size);
    const link = document.createElement("a");
    const name = el ? ("fullName" in el && el.fullName ? el.fullName : el.name) : "unknown";
    link.download = `${getFileName(`Emblem ${name}`)}.${format}`;

    if (format === "svg") downloadSVG(url, link);
    else downloadRaster(format, url, link, size);
    document.getElementById("emblemDownloadControl")!.classList.add("hidden");
  }

  function downloadSVG(url: string, link: HTMLAnchorElement): void {
    link.href = url;
    link.click();
  }

  function downloadRaster(format: string, url: string, link: HTMLAnchorElement, size: number): void {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = size;
    canvas.height = size;

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
    const name = getFileName("Emblems Gallery");
    const validStates = (pack.states as State[]).filter(s => s.i && !s.removed && s.coa);
    const validProvinces = (pack.provinces as Province[]).filter(p => p.i && !p.removed && p.coa);
    const validBurgs = pack.burgs.filter(b => b.i && !b.removed && b.coa);
    await renderAllEmblems(validStates, validProvinces, validBurgs);
    runDownload();

    function runDownload(): void {
      const back = `<a href="javascript:history.back()">Go Back</a>`;

      const stateSection =
        `<div><h2>States</h2>` +
        validStates
          .map(state => {
            const stateEl = document.getElementById(`stateCOA${state.i}`) as unknown as SVGElement;
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
              const provEl = document.getElementById(`provinceCOA${province.i}`) as unknown as SVGElement;
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
              const provinceBurgs = stateBurgs.filter(b => pack.cells.province[b.cell] === province.i);
              const provinceBurgFigures = provinceBurgs
                .map(burg => {
                  const burgEl = document.getElementById(`burgCOA${burg.i}`) as unknown as SVGElement;
                  return `<figure id="burg_${burg.i}"><figcaption>${burg.name}</figcaption>${getSVG(burgEl, 200)}</figure>`;
                })
                .join("");
              return provinceBurgs.length
                ? `<div id="burgs_${province.i}">${back}<h2>${province.fullName} burgs</h2>${provinceBurgFigures}</div>`
                : "";
            })
            .join("");

          const stateBurgOutOfProvinces = stateBurgs.filter(b => !pack.cells.province[b.cell]);
          const stateBurgOutOfProvincesFigures = stateBurgOutOfProvinces
            .map(burg => {
              const burgEl = document.getElementById(`burgCOA${burg.i}`) as unknown as SVGElement;
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
              const burgEl = document.getElementById(`burgCOA${burg.i}`) as unknown as SVGElement;
              return `<figure id="burg_${burg.i}"><figcaption>${burg.name}</figcaption>${getSVG(burgEl, 200)}</figure>`;
            })
            .join("") +
          "</div>"
        : "";

      const FMG = `<a href="https://azgaar.github.io/Fantasy-Map-Generator" target="_blank">Azgaar's Fantasy Map Generator</a>`;
      const license = `<a target="_blank" href="https://github.com/Azgaar/Armoria#license">the license</a>`;
      const html = /* html */ `<!DOCTYPE html>
        <html>
          <head>
            <title>${mapName.value} Emblems Gallery</title>
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
            <div><h1>${mapName.value} Emblems Gallery</h1></div>
            ${stateSection} ${provinceSections} ${burgSections} ${neutralsSection}
            <address>Generated by ${FMG}. The tool is free, but images may be copyrighted, see ${license}</address>
          </body>
        </html>`;
      downloadFile(html, `${name}.html`, "text/plain");
    }
  }

  async function renderAllEmblems(states: State[], provinces: Province[], burgs: Burg[]): Promise<void> {
    tip("Preparing for download...", true, "warn");

    const statePromises = states.map(state => COArenderer.trigger(`stateCOA${state.i}`, state.coa!));
    const provincePromises = provinces.map(province => COArenderer.trigger(`provinceCOA${province.i}`, province.coa!));
    const burgPromises = burgs.map(burg => COArenderer.trigger(`burgCOA${burg.i}`, burg.coa!));
    const promises = [...statePromises, ...provincePromises, ...burgPromises];

    return Promise.allSettled(promises).then(() => clearMainTip());
  }

  function closeEmblemEditor(): void {
    emblems
      .selectAll<SVGUseElement, unknown>("use")
      .call(drag<SVGUseElement, unknown>().on("drag", null))
      .attr("class", null);
  }
}
