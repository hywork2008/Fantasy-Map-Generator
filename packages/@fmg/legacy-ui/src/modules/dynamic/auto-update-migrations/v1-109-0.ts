"use strict";

import type { AutoUpdateMigrationContext } from "./types";
import * as d3 from "d3";

export function migrateToV1_109_0(context: AutoUpdateMigrationContext): void {
  // v1.109.0 added customizable burg groups and icons
  const { pack, api, helpers, dom } = context as any;
  const options = (context as any).options ?? (typeof window !== "undefined" ? (window as any).options : undefined);
  if (options) (options as any).burgs = { groups: [] };

  const burgIcons = dom?.burgIcons ?? d3.select("#burgIcons");
  const anchors = dom?.anchors ?? d3.select("#anchors");
  const burgLabels = dom?.burgLabels ?? d3.select("#burgLabels");

  burgIcons.selectAll("circle, use").each(function () {
    const group = this.parentNode.id;
    const id = this.id.replace(/^burg/, "");
    const burg = pack.burgs[id];
    if (group && burg) burg.group = group;
  });

  burgIcons.selectAll("g").each(function (_el, index) {
    const name = this.id;
    const isDefault = name === "towns";
    (options as any).burgs.groups.push({ name, active: true, order: index + 1, isDefault, preview: "watabou-city" });
    if (!this.dataset.icon) this.dataset.icon = "#icon-circle";

    const size = Number(this.getAttribute("size") || 2) * 2;
    this.removeAttribute("size");
    this.setAttribute("font-size", size);

    this.setAttribute("stroke-width", 1);
  });

  if ((options as any).burgs.groups.filter((g: any) => g.isDefault).length === 0) {
    (options as any).burgs.groups[0].isDefault = true;
  }

  anchors.selectAll("g").each(function () {
    const size = Number(this.getAttribute("size") || 1);
    this.removeAttribute("size");
    this.setAttribute("font-size", size);
  });

  burgLabels.selectAll("g").each(function () {
    if (!this.dataset.dy) this.dataset.dy = -0.4;
  });

  // Local ensureEl replacement limited to symbol creation inside defs
  function ensureElLocal(id: string): Element | null {
    const defs = dom?.defs ? (dom.defs.node ? (dom.defs.node() as Element) : dom.defs) : (d3.select("#defs").node() as Element | null);
    if (!defs) return null;
    let el = defs.querySelector(`#${id}`);
    if (!el) {
      defs.insertAdjacentHTML("beforeend", `<symbol id="${id}"></symbol>`);
      el = defs.querySelector(`#${id}`);
    }
    return el;
  }

  const anchorSymbol = ensureElLocal("icon-anchor");
  if (anchorSymbol) {
    anchorSymbol.outerHTML = /* html */ `<symbol id="icon-anchor" viewBox="0 0 30 30" width="1em" height="1em" overflow="visible">
        <path d="m 1.003,-9.873 c 0,-0.547 -0.453,-1 -1,-1 -0.547,0 -1,0.453 -1,1 0,0.547 0.453,1 1,1 0.547,0 1,-0.453 1,-1 z m 13,14.5 v 5.5 c 0,0.203 -0.125,0.391 -0.313,0.469 -0.063,0.016 -0.125,0.031 -0.187,0.031 -0.125,0 -0.25,-0.047 -0.359,-0.141 L 11.691,9.033 c -2.453,2.953 -6.859,4.844 -11.688,4.844 -4.829,0 -9.234,-1.891 -11.688,-4.844 l -1.453,1.453 c -0.094,0.094 -0.234,0.141 -0.359,0.141 -0.063,0 -0.125,-0.016 -0.187,-0.031 -0.187,-0.078 -0.313,-0.266 -0.313,-0.469 v -5.5 c 0,-0.281 0.219,-0.5 0.5,-0.5 h 5.5 c 0.203,0 0.391,0.125 0.469,0.313 0.078,0.188 0.031,0.391 -0.109,0.547 L -9.2,6.55 c 1.406,1.891 4.109,3.266 7.203,3.687 V 0.128 h -3 c -0.547,0 -1,-0.453 -1,-1 v -2 c 0,-0.547 0.453,-1 1,-1 h 3 v -2.547 c -1.188,-0.688 -2,-1.969 -2,-3.453 0,-2.203 1.797,-4 4,-4 2.203,0 4,1.797 4,4 0,1.484 -0.812,2.766 -2,3.453 v 2.547 h 3 c 0.547,0 1,0.453 1,1 v 2 c 0,0.547 -0.453,1 -1,1 h -3 V 10.237 C 5.097,9.815 7.8,8.44 9.206,6.55 L 7.643,4.987 C 7.502,4.831 7.456,4.628 7.534,4.44 7.612,4.252 7.8,4.127 8.003,4.127 h 5.5 c 0.281,0 0.5,0.219 0.5,0.5 z"/>
      </symbol>`;
  }

  const validBurgs = pack.burgs.filter(b => b.i && !b.removed);
  const populations = validBurgs.map(b => b.population).sort((a, b) => a - b);
  validBurgs.forEach(burg => {
    if (!burg.group) (api as any).Burgs.defineGroup(burg, populations);

    if (burg.MFCG) {
      burg.link = (api as any).Burgs.getPreview(burg)?.link;
      delete burg.MFCG;
    }
  });

  if (helpers?.layerIsOn && helpers.layerIsOn("toggleBurgIcons")) helpers.burgIconsRenderer?.();
  if (helpers?.layerIsOn && helpers.layerIsOn("toggleLabels")) helpers.burgLabelsRenderer?.();

  delete (options as any).showBurgPreview;
  delete (options as any).showMFCGMap;
  delete (options as any).villageMaxPopulation;
}
