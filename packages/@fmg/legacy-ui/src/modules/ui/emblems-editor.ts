"use strict";

import { COA } from "@fmg/core/modules/emblem/generator";
import { COArenderer } from "@fmg/core/modules/emblem/renderer";
import { clearMainTip, tip } from "./general";

type UploadedCustomCoa = {
  custom: true;
  size?: number;
  x?: number;
  y?: number;
};

class EmblemsEditor {
  private currentType: string = "";
  private currentId: string = "";
  private currentEl: any = null;

  public open(type: string, id: string, el: any) {
    if (customization) return;
    if (!id && d3.event) {
      const data = this.defineEmblemData(d3.event);
      type = data.type;
      id = data.id;
      el = data.el;
    }

    this.currentType = type;
    this.currentId = id;
    this.currentEl = el;

    emblems.selectAll("use").call(
      d3.drag().on("drag", function(this: SVGUseElement) { emblemsEditorSelf.dragEmblem(this); })
    ).classed("draggable", true);

    this.updateElementSelectors(type, id, el);

    $("#emblemEditor").dialog({
      title: "Edit Emblem",
      resizable: true,
      width: "18.2em",
      height: "auto",
      position: {my: "left top", at: "left+10 top+10", of: "svg", collision: "fit"},
      close: () => this.closeEmblemEditor()
    });

    const emblemStates = document.getElementById("emblemStates") as HTMLSelectElement;
    const emblemProvinces = document.getElementById("emblemProvinces") as HTMLSelectElement;
    const emblemBurgs = document.getElementById("emblemBurgs") as HTMLSelectElement;
    const emblemShapeSelector = document.getElementById("emblemShapeSelector") as HTMLSelectElement;

    emblemStates.oninput = () => this.selectState();
    emblemProvinces.oninput = () => this.selectProvince();
    emblemBurgs.oninput = () => this.selectBurg();
    emblemShapeSelector.oninput = () => this.changeShape();
    document.getElementById("emblemSizeSlider")!.oninput = () => this.changeSize();
    document.getElementById("emblemSizeNumber")!.oninput = () => this.changeSize();
    document.getElementById("emblemsRegenerate")!.onclick = () => this.regenerate();
    document.getElementById("emblemsArmoria")!.onclick = () => this.openInArmoria();
    document.getElementById("emblemsUpload")!.onclick = () => this.toggleUpload();
    document.getElementById("emblemsUploadImage")!.onclick = () => (document.getElementById("emblemImageToLoad") as HTMLInputElement).click();
    document.getElementById("emblemsUploadSVG")!.onclick = () => (document.getElementById("emblemSVGToLoad") as HTMLInputElement).click();
    document.getElementById("emblemImageToLoad")!.onchange = () => this.upload("image");
    document.getElementById("emblemSVGToLoad")!.onchange = () => this.upload("svg");
    document.getElementById("emblemsDownload")!.onclick = () => this.toggleDownload();
    document.getElementById("emblemsDownloadSVG")!.onclick = () => this.download("svg");
    document.getElementById("emblemsDownloadPNG")!.onclick = () => this.download("png");
    document.getElementById("emblemsDownloadJPG")!.onclick = () => this.download("jpeg");
    document.getElementById("emblemsGallery")!.onclick = () => this.downloadGallery();
    document.getElementById("emblemsFocus")!.onclick = () => this.showArea();
  }

  private defineEmblemData(e: any) {
    const parent = e.target.parentNode;
    const [g, t] =
      parent.id === "burgEmblems"
        ? [pack.burgs, "burg"]
        : parent.id === "provinceEmblems"
        ? [pack.provinces, "province"]
        : [pack.states, "state"];
    const i = +e.target.dataset.i;
    return {type: t, id: t + "COA" + i, el: g[i]};
  }

  private updateElementSelectors(type: string, id: string, el: any) {
    const emblemStates = document.getElementById("emblemStates") as HTMLSelectElement;
    const emblemProvinces = document.getElementById("emblemProvinces") as HTMLSelectElement;
    const emblemBurgs = document.getElementById("emblemBurgs") as HTMLSelectElement;

    let state = 0,
      province = 0,
      burg = 0;

    emblemStates.parentElement!.className = type === "state" ? "active" : "";
    emblemProvinces.parentElement!.className = type === "province" ? "active" : "";
    emblemBurgs.parentElement!.className = type === "burg" ? "active" : "";

    if (type === "state") state = el.i;
    else if (type === "province") {
      province = el.i;
      state = pack.states[el.state].i;
    } else {
      burg = el.i;
      province = pack.cells.province[el.cell] ? pack.provinces[pack.cells.province[el.cell]].i : 0;
      state = el.state;
    }

    const validBurgs = pack.burgs.filter((b: any) => b.i && !b.removed && b.coa);

    emblemStates.options.length = 0;
    const neutralBurgs = validBurgs.filter((b: any) => !b.state);
    if (neutralBurgs.length) emblemStates.options.add(new Option(pack.states[0].name, "0", false, !state));
    const stateList = pack.states.filter((s: any) => s.i && !s.removed);
    stateList.forEach((s: any) => emblemStates.options.add(new Option(s.name, String(s.i), false, s.i === state)));

    emblemProvinces.options.length = 0;
    emblemProvinces.options.add(new Option("", "0", false, !province));
    const provinceList = pack.provinces.filter((p: any) => !p.removed && p.state === state);
    provinceList.forEach((p: any) => emblemProvinces.options.add(new Option(p.name, String(p.i), false, p.i === province)));

    emblemBurgs.options.length = 0;
    emblemBurgs.options.add(new Option("", "0", false, !burg));
    const burgList = validBurgs.filter((b: any) =>
      province ? pack.cells.province[b.cell] === province : b.state === state
    );
    burgList.forEach((b: any) =>
      emblemBurgs.options.add(new Option(b.capital ? "👑 " + b.name : b.name, String(b.i), false, b.i === burg))
    );
    emblemBurgs.options[0].disabled = true;

    COArenderer.trigger(id, el.coa);
    this.updateEmblemData(type, id, el);
  }

  private updateEmblemData(type: string, id: string, el: any) {
    const emblemShapeSelector = document.getElementById("emblemShapeSelector") as HTMLSelectElement;
    if (!el.coa) return;
    document.getElementById("emblemImage")!.setAttribute("href", "#" + id);
    let name = el.fullName || el.name;
    if (type === "burg") name = "Burg of " + name;
    (document.getElementById("emblemArmiger") as HTMLElement).innerText = name;

    if (el.coa.custom) emblemShapeSelector.disabled = true;
    else {
      emblemShapeSelector.disabled = false;
      emblemShapeSelector.value = el.coa.shield;
    }

    const size = el.coa.size || 1;
    (document.getElementById("emblemSizeSlider") as HTMLInputElement).value = size;
    (document.getElementById("emblemSizeNumber") as HTMLInputElement).value = size;
  }

  private selectState() {
    const emblemStates = document.getElementById("emblemStates") as HTMLSelectElement;
    const state = +emblemStates.value;
    if (state) {
      this.currentType = "state";
      this.currentEl = pack.states[state];
      this.currentId = "stateCOA" + state;
    } else {
      const neutralBurgs = pack.burgs.filter((b: any) => b.i && !b.removed && !b.state);
      if (!neutralBurgs.length) return;
      this.currentType = "burg";
      this.currentEl = neutralBurgs[0];
      this.currentId = "burgCOA" + neutralBurgs[0].i;
    }
    this.updateElementSelectors(this.currentType, this.currentId, this.currentEl);
  }

  private selectProvince() {
    const emblemStates = document.getElementById("emblemStates") as HTMLSelectElement;
    const emblemProvinces = document.getElementById("emblemProvinces") as HTMLSelectElement;
    const province = +emblemProvinces.value;

    if (province) {
      this.currentType = "province";
      this.currentEl = pack.provinces[province];
      this.currentId = "provinceCOA" + province;
    } else {
      const state = +emblemStates.value;
      this.currentType = "state";
      this.currentEl = pack.states[state];
      this.currentId = "stateCOA" + state;
    }

    this.updateElementSelectors(this.currentType, this.currentId, this.currentEl);
  }

  private selectBurg() {
    const emblemBurgs = document.getElementById("emblemBurgs") as HTMLSelectElement;
    const burg = +emblemBurgs.value;
    this.currentType = "burg";
    this.currentEl = pack.burgs[burg];
    this.currentId = "burgCOA" + burg;
    this.updateElementSelectors(this.currentType, this.currentId, this.currentEl);
  }

  private changeShape() {
    const emblemShapeSelector = document.getElementById("emblemShapeSelector") as HTMLSelectElement;
    this.currentEl.coa.shield = emblemShapeSelector.value;
    const coaEl = document.getElementById(this.currentId);
    if (coaEl) coaEl.remove();
    COArenderer.trigger(this.currentId, this.currentEl.coa);
  }

  private showArea() {
    highlightEmblemElement(this.currentType, this.currentEl);
  }

  private changeSize() {
    const size = +(document.getElementById("emblemSizeSlider") as HTMLInputElement).value;
    this.currentEl.coa.size = size;

    (document.getElementById("emblemSizeSlider") as HTMLInputElement).value = String(size);
    (document.getElementById("emblemSizeNumber") as HTMLInputElement).value = String(size);

    const g = emblems.select("#" + this.currentType + "Emblems");
    g.select("[data-i='" + this.currentEl.i + "']").remove();
    if (!size) return;

    const categotySize = +g.attr("font-size");
    const shift = (categotySize * size) / 2;
    const x = this.currentEl.coa.x || this.currentEl.x || this.currentEl.pole[0];
    const y = this.currentEl.coa.y || this.currentEl.y || this.currentEl.pole[1];

    g.append("use")
      .attr("data-i", this.currentEl.i)
      .attr("x", rn(x - shift, 2))
      .attr("y", rn(y - shift, 2))
      .attr("width", size + "em")
      .attr("height", size + "em")
      .attr("href", "#" + this.currentId);
  }

  private regenerate() {
    const emblemShapeSelector = document.getElementById("emblemShapeSelector") as HTMLSelectElement;
    let parent = null;
    if (this.currentType === "province") parent = pack.states[this.currentEl.state];
    else if (this.currentType === "burg") {
      const province = pack.cells.province[this.currentEl.cell];
      parent = province ? pack.provinces[province] : pack.states[this.currentEl.state];
    }

    const shield = this.currentEl.coa.shield || COA.getShield(this.currentEl.culture || parent?.culture || 0, this.currentEl.state);
    this.currentEl.coa = COA.generate(parent ? parent.coa : null, 0.3, 0.1, null);
    this.currentEl.coa.shield = shield;
    emblemShapeSelector.disabled = false;
    emblemShapeSelector.value = this.currentEl.coa.shield;

    const coaEl = document.getElementById(this.currentId);
    if (coaEl) coaEl.remove();
    COArenderer.trigger(this.currentId, this.currentEl.coa);
  }

  private openInArmoria() {
    const coa = this.currentEl.coa && !this.currentEl.coa.custom ? this.currentEl.coa : {t1: "sable"};
    const json = JSON.stringify(coa).replaceAll("#", "%23");
    const url = `https://azgaar.github.io/Armoria/?coa=${json}&from=FMG`;
    openURL(url);
  }

  private toggleUpload() {
    document.getElementById("emblemDownloadControl")!.classList.add("hidden");
    const buttons = document.getElementById("emblemUploadControl")!;
    buttons.classList.toggle("hidden");
  }

  private upload(uploadType: string) {
    const input =
      uploadType === "image"
        ? document.getElementById("emblemImageToLoad") as HTMLInputElement
        : document.getElementById("emblemSVGToLoad") as HTMLInputElement;
    const file = input.files![0];
    input.value = "";

    if (file.size > 500000) {
      const message =
        "File is too big, please optimize file size up to 500kB and re-upload. Recommended size is 200x200 px and up to 100kB";
      tip(message, true, "error", 5000);
      return;
    }

    const reader = new FileReader();

    reader.onload = (readerEvent: ProgressEvent<FileReader>) => {
      const result = readerEvent.target!.result;
      if (typeof result !== "string") return;
      const defsEl = document.getElementById("defs-emblems")!;
      const oldEmblem = document.getElementById(this.currentId);

      let href = result;
      if (uploadType === "svg") {
        const tmpEl = document.createElement("html");
        tmpEl.innerHTML = result;

        tmpEl.querySelectorAll("*").forEach((e: Element) => {
          if (e.id === "adobe_illustrator_pgf") e.remove();

          e.getAttributeNames().forEach((attr: string) => {
            if (attr.includes("inkscape") || attr.includes("sodipodi")) e.removeAttribute(attr);
          });
        });

        const svgEl = tmpEl.querySelector("svg");
        if (!svgEl) {
          const message = "The file is not a valid SVG. Please use Armoria or other relevant tools";
          tip(message, false, "error");
          return;
        }

        const serialized = new XMLSerializer().serializeToString(svgEl);
        href = "data:image/svg+xml;base64," + window.btoa(serialized);
      }

      const svgStr = `<svg id="${this.currentId}" viewBox="0 0 200 200"><image width="200" height="200" href="${href}"/></svg>`;
      defsEl.insertAdjacentHTML("beforeend", svgStr);

      if (oldEmblem) oldEmblem.remove();

      const customCoa: UploadedCustomCoa = {custom: true};
      if (this.currentEl.coa.size) customCoa.size = this.currentEl.coa.size;
      if (this.currentEl.coa.x) customCoa.x = this.currentEl.coa.x;
      if (this.currentEl.coa.y) customCoa.y = this.currentEl.coa.y;
      this.currentEl.coa = customCoa;

      (document.getElementById("emblemShapeSelector") as HTMLSelectElement).disabled = true;
    };

    if (uploadType === "image") reader.readAsDataURL(file);
    else reader.readAsText(file);
  }

  private toggleDownload() {
    document.getElementById("emblemUploadControl")!.classList.add("hidden");
    const buttons = document.getElementById("emblemDownloadControl")!;
    buttons.classList.toggle("hidden");
  }

  private async download(format: string) {
    const coa = document.getElementById(this.currentId)!;
    const size = +(emblemsDownloadSize as unknown as HTMLInputElement).value;
    const url = await this.getURL(coa, size);
    const link = document.createElement("a");
    link.download = getFileName(`Emblem ${this.currentEl.fullName || this.currentEl.name}`) + "." + format;

    if (format === "svg") this.downloadSVG(url, link);
    else this.downloadRaster(format, url, link, size);
    document.getElementById("emblemDownloadControl")!.classList.add("hidden");
  }

  private downloadSVG(url: string, link: HTMLAnchorElement) {
    link.href = url;
    link.click();
  }

  private downloadRaster(format: string, url: string, link: HTMLAnchorElement, size: number) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = size;
    canvas.height = size;

    const img = new Image();
    img.src = url;
    img.onload = function () {
      if (format === "jpeg") {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataURL = canvas.toDataURL("image/" + format, 0.92);
      link.href = dataURL;
      link.click();
      window.setTimeout(() => window.URL.revokeObjectURL(dataURL), 6000);
    };
  }

  private async getURL(svgEl: HTMLElement, size: number) {
    const serialized = this.getSVG(svgEl, size);
    const blob = new Blob([serialized], {type: "image/svg+xml;charset=utf-8"});
    const url = window.URL.createObjectURL(blob);
    window.setTimeout(() => window.URL.revokeObjectURL(url), 6000);
    return url;
  }

  private getSVG(svgEl: HTMLElement, size: number) {
    const clone = svgEl.cloneNode(true) as HTMLElement;
    clone.setAttribute("width", String(size));
    clone.setAttribute("height", String(size));
    return new XMLSerializer().serializeToString(clone);
  }

  private async downloadGallery() {
    const name = getFileName("Emblems Gallery");
    const validStates = pack.states.filter((s: any) => s.i && !s.removed && s.coa);
    const validProvinces = pack.provinces.filter((p: any) => p.i && !p.removed && p.coa);
    const validBurgs = pack.burgs.filter((b: any) => b.i && !b.removed && b.coa);
    await this.renderAllEmblems(validStates, validProvinces, validBurgs);
    this.runGalleryDownload(name, validStates, validProvinces, validBurgs);
  }

  private runGalleryDownload(name: string, validStates: any[], validProvinces: any[], validBurgs: any[]) {
    const back = `<a href="javascript:history.back()">Go Back</a>`;

    const stateSection =
      `<div><h2>States</h2>` +
      validStates
        .map((state: any) => {
          const el = document.getElementById("stateCOA" + state.i)!;
          return `<figure id="state_${state.i}"><a href="#provinces_${state.i}"><figcaption>${
            state.fullName
          }</figcaption>${this.getSVG(el, 200)}</a></figure>`;
        })
        .join("") +
      `</div>`;

    const provinceSections = validStates
      .map((state: any) => {
        const stateProvinces = validProvinces.filter((p: any) => p.state === state.i);
        const figures = stateProvinces
          .map((province: any) => {
            const el = document.getElementById("provinceCOA" + province.i)!;
            return `<figure id="province_${province.i}"><a href="#burgs_${province.i}"><figcaption>${
              province.fullName
            }</figcaption>${this.getSVG(el, 200)}</a></figure>`;
          })
          .join("");
        return stateProvinces.length
          ? `<div id="provinces_${state.i}">${back}<h2>${state.fullName} provinces</h2>${figures}</div>`
          : "";
      })
      .join("");

    const burgSections = validStates
      .map((state: any) => {
        const stateBurgs = validBurgs.filter((b: any) => b.state === state.i);
        let stateBurgSections = validProvinces
          .filter((p: any) => p.state === state.i)
          .map((province: any) => {
            const provinceBurgs = stateBurgs.filter((b: any) => pack.cells.province[b.cell] === province.i);
            const provinceBurgFigures = provinceBurgs
              .map((burg: any) => {
                const el = document.getElementById("burgCOA" + burg.i)!;
                return `<figure id="burg_${burg.i}"><figcaption>${burg.name}</figcaption>${this.getSVG(el, 200)}</figure>`;
              })
              .join("");
            return provinceBurgs.length
              ? `<div id="burgs_${province.i}">${back}<h2>${province.fullName} burgs</h2>${provinceBurgFigures}</div>`
              : "";
          })
          .join("");

        const stateBurgOutOfProvinces = stateBurgs.filter((b: any) => !pack.cells.province[b.cell]);
        const stateBurgOutOfProvincesFigures = stateBurgOutOfProvinces
          .map((burg: any) => {
            const el = document.getElementById("burgCOA" + burg.i)!;
            return `<figure id="burg_${burg.i}"><figcaption>${burg.name}</figcaption>${this.getSVG(el, 200)}</figure>`;
          })
          .join("");
        if (stateBurgOutOfProvincesFigures)
          stateBurgSections += `<div><h2>${state.fullName} burgs under direct control</h2>${stateBurgOutOfProvincesFigures}</div>`;
        return stateBurgSections;
      })
      .join("");

    const neutralBurgs = validBurgs.filter((b: any) => !b.state);
    const neutralsSection = neutralBurgs.length
      ? "<div><h2>Independent burgs</h2>" +
        neutralBurgs
          .map((burg: any) => {
            const el = document.getElementById("burgCOA" + burg.i)!;
            return `<figure id="burg_${burg.i}"><figcaption>${burg.name}</figcaption>${this.getSVG(el, 200)}</figure>`;
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
    (downloadFile as any)(html, name + ".html", "text/plain");
  }

  private async renderAllEmblems(states: any[], provinces: any[], burgs: any[]) {
    tip("Preparing for download...", true, "warn");

    const statePromises = states.map((state: any) => COArenderer.trigger("stateCOA" + state.i, state.coa));
    const provincePromises = provinces.map((province: any) => COArenderer.trigger("provinceCOA" + province.i, province.coa));
    const burgPromises = burgs.map((burg: any) => COArenderer.trigger("burgCOA" + burg.i, burg.coa));
    const promises = [...statePromises, ...provincePromises, ...burgPromises];

    return Promise.allSettled(promises).then(() => clearMainTip());
  }

  public dragEmblem(element: SVGUseElement) {
    const x = Number(element.getAttribute("x")) - d3.event.x;
    const y = Number(element.getAttribute("y")) - d3.event.y;

    d3.event.on("drag", function(this: SVGUseElement) {
      this.setAttribute("x", String(x + d3.event.x));
      this.setAttribute("y", String(y + d3.event.y));
    });

    d3.event.on("end", function(this: SVGUseElement) {
      const categotySize = Number(this.parentNode ? (this.parentNode as Element).getAttribute("font-size") : 0);
      const size = emblemsEditorSelf.currentEl?.coa?.size || 1;
      const shift = (categotySize * size) / 2;

      emblemsEditorSelf.currentEl.coa.x = rn(x + d3.event.x + shift, 2);
      emblemsEditorSelf.currentEl.coa.y = rn(y + d3.event.y + shift, 2);
    });
  }

  private closeEmblemEditor() {
    emblems.selectAll("use").call(d3.drag().on("drag", null)).attr("class", null);
  }
}

const emblemsEditorController = new EmblemsEditor();
const emblemsEditorSelf = emblemsEditorController;

export function editEmblem(type: string, id: string, el: any) {
  emblemsEditorController.open(type, id, el);
}
