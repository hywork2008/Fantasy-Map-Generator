/**
 * Underground realm overlay — docs/plan/underground-realm-and-supernatural-areas.md §5.2.
 *
 * Deliberately not a solid fill: a Dwarf hold's face sits *under* a surface political border, and
 * a flat color would fight the state fill for the same pixels. Uses a diagonal-hatch pattern per
 * domain kind (one <pattern> per kind, shared across every domain of that kind) plus a dashed
 * outline, closer to the "something is under here" convention of a geological cross-section map
 * than to a political choropleth. `getVertexPath` (draw-zones.ts's technique) draws each domain's
 * outer boundary from its cell membership. Entrances get a small marker so they read as the
 * domain's surface mouths, sharing the "caves" marker icon (markers-generator.ts).
 *
 * Empty on non-Fantasy maps: `pack.subterraneanDomains` is `[]` there (main.ts's generation
 * gate), so this renders nothing — no separate Fantasy check needed here.
 */
import type { AppServices } from "../context/appServices";
import type { EnvironmentLayers, FocusFields, RootLayers } from "../context/viewContext";
import type { WorldContext } from "../context/worldContext";
import type { SubterraneanDomain, SubterraneanDomainKind } from "../types/models";
import { getVertexPath } from "../utils";
import { isCellInScope } from "./core/focusScope";
import type { IRenderer } from "./core/IRenderer";

const KIND_COLOR: Record<SubterraneanDomainKind, string> = {
  dwarfHold: "#b8863b",
  wildCavern: "#6b6f76",
  chasmHive: "#c9a227",
  wormReach: "#8a3b3b"
};

const PATTERN_SIZE = 8;

function ensureHatchPattern(defs: RootLayers["defs"], kind: SubterraneanDomainKind) {
  const id = `undergroundHatch-${kind}`;
  if (!(defs.select(`#${id}`).node() as SVGElement | null)) {
    const pattern = defs
      .append("pattern")
      .attr("id", id)
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", PATTERN_SIZE)
      .attr("height", PATTERN_SIZE)
      .attr("patternTransform", "rotate(45)");
    pattern
      .append("line")
      .attr("x1", 0)
      .attr("y1", 0)
      .attr("x2", 0)
      .attr("y2", PATTERN_SIZE)
      .attr("stroke", KIND_COLOR[kind])
      .attr("stroke-width", 2)
      .attr("stroke-opacity", 0.55);
  }
  return id;
}

function drawDomain(pack: WorldContext["pack"], domain: SubterraneanDomain, patternId: string): string {
  const path = getVertexPath(domain.cells, pack);
  const color = KIND_COLOR[domain.kind];
  const outline = `<path data-underground-domain="${domain.i}" data-kind="${domain.kind}" d="${path}" fill="url(#${patternId})" stroke="${color}" stroke-width="1" stroke-dasharray="4 3" fill-opacity="0.9" />`;
  const entranceMarkers = domain.entrances
    .map(cell => {
      const [x, y] = pack.cells.p[cell] ?? [];
      if (x === undefined || y === undefined) return "";
      return `<circle data-underground-entrance="${cell}" cx="${x}" cy="${y}" r="2.2" fill="${color}" stroke="#fff" stroke-width="0.6" />`;
    })
    .join("");
  return outline + entranceMarkers;
}

export const UndergroundRenderer: IRenderer = {
  id: "underground",

  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<EnvironmentLayers & FocusFields & Pick<RootLayers, "defs">>,
    _appServices: AppServices
  ): void {
    const { pack } = worldContext;
    const { underground, defs, focusScope } = viewContext;
    const domains = pack.subterraneanDomains ?? [];
    const visible = domains.filter(
      domain => domain.cells.length && (!focusScope || domain.cells.some(cell => isCellInScope(focusScope, cell)))
    );

    if (!visible.length) {
      underground.html("");
      return;
    }

    const usedKinds = new Set(visible.map(domain => domain.kind));
    const patternIdByKind = new Map<SubterraneanDomainKind, string>();
    for (const kind of usedKinds) patternIdByKind.set(kind, ensureHatchPattern(defs, kind));

    underground.html(visible.map(domain => drawDomain(pack, domain, patternIdByKind.get(domain.kind)!)).join(""));
  },

  clear(viewContext: Readonly<EnvironmentLayers>): void {
    viewContext.underground.html("");
  }
};
