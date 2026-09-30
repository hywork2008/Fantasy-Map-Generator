import { accessSummary } from "../core/connectivity";
import { boundaryPoints, distance, labelPoint, pointAlong, spacePolygon } from "../core/geometry";
import type { DungeonDocument, Point } from "../core/types";

export const escapeXml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!
  );
const fmt = (value: number): string => Number(value.toFixed(3)).toString();
const coords = (point: Point): string => point.map(fmt).join(",");
export interface RenderOptions {
  grid?: boolean;
  labels?: boolean;
  uses?: boolean;
  selectedId?: string;
  /** Hit targets belong to the live editor, never to exported SVG. */
  interactive?: boolean;
}

export function renderDungeonSvg(document: DungeonDocument, options: RenderOptions = {}): string {
  const level = document.levels[0];
  const { widthMeters: w, depthMeters: h } = document.frame;
  const { reachable } = accessSummary(level);
  const spaces = Object.values(level.spaces);
  let roomNumber = 0;
  const floors = spaces
    .map(space => {
      const polygon = spacePolygon(level, space.id);
      const id = escapeXml(space.id);
      const selected = options.selectedId === space.id;
      const number = space.kind === "room" ? String(++roomNumber).padStart(2, "0") : "";
      const title = `${number} ${space.label || space.use}`.trim();
      const center = labelPoint(polygon);
      const fill = space.roof === "open" ? "#dce5d2" : space.kind === "corridor" ? "#e9e3d5" : "#faf6eb";
      const label = space.label || (space.kind === "room" ? number : "");
      return `<g><polygon ${options.interactive ? `data-space-id="${id}" tabindex="0" role="button" aria-label="${escapeXml(title)}"` : ""} points="${polygon.map(coords).join(" ")}" fill="${selected ? "#d7ece9" : fill}" stroke="${!reachable.has(space.id) ? "#bf644b" : selected ? "#168377" : "none"}" stroke-width="0.18"><title>${escapeXml(title)}</title></polygon>${options.labels !== false && label ? `<text x="${fmt(center[0])}" y="${fmt(center[1])}" text-anchor="middle" dominant-baseline="central" font-size="${space.kind === "courtyard" ? 1.5 : 0.95}" fill="#34463e" pointer-events="none">${escapeXml(label)}</text>` : ""}${options.uses && space.kind === "room" ? `<text x="${fmt(center[0])}" y="${fmt(center[1] + 1.1)}" text-anchor="middle" font-size="0.65" fill="#707369" pointer-events="none">${escapeXml(space.use)}</text>` : ""}</g>`;
    })
    .join("");
  const walls = Object.values(level.boundaries)
    .map(boundary => {
      if (boundary.barrier !== "wall") return "";
      const [a, b] = boundaryPoints(level, boundary);
      const len = distance(a, b);
      const openings = Object.values(level.openings)
        .filter(opening => opening.boundaryId === boundary.id)
        .sort((a, b) => a.offsetMeters - b.offsetMeters);
      const intervals: Array<[number, number]> = [];
      let offset = 0;
      for (const opening of openings) {
        intervals.push([offset, opening.offsetMeters]);
        offset = opening.offsetMeters + opening.widthMeters;
      }
      intervals.push([offset, len]);
      const selected = options.selectedId === boundary.id;
      const ink = intervals
        .filter(([start, end]) => end > start)
        .map(
          ([start, end]) =>
            `<path d="M${coords(pointAlong(a, b, start))} L${coords(pointAlong(a, b, end))}" fill="none" stroke="${selected ? "#168377" : "#4a4e47"}" stroke-width="${fmt(boundary.thicknessMeters)}" stroke-linecap="butt"/>`
        )
        .join("");
      return `<g>${ink}${options.interactive ? `<path data-boundary-id="${escapeXml(boundary.id)}" tabindex="0" role="button" aria-label="壁 ${escapeXml(boundary.id)}" d="M${coords(a)} L${coords(b)}" fill="none" stroke="transparent" stroke-width="${Math.max(0.9, boundary.thicknessMeters)}" pointer-events="stroke"><title>壁 ${escapeXml(boundary.id)}</title></path>` : ""}</g>`;
    })
    .join("");
  const doors = Object.values(level.openings)
    .map(opening => {
      const edge = level.boundaries[opening.boundaryId];
      const [a, b] = boundaryPoints(level, edge);
      const start = pointAlong(a, b, opening.offsetMeters);
      const end = pointAlong(a, b, opening.offsetMeters + opening.widthMeters);
      const vertical = a[0] === b[0];
      const selected = options.selectedId === opening.id;
      const ink = selected ? "#168377" : opening.visibility === "secret" ? "#9b6955" : "#756c54";
      const door =
        opening.kind === "arch" || opening.state === "open"
          ? `<path d="M${coords(start)} L${coords([start[0] + (vertical ? opening.widthMeters : 0), start[1] + (vertical ? 0 : opening.widthMeters)])}" fill="none" stroke="${ink}" stroke-width="0.12"/>`
          : `<path d="M${coords(start)} L${coords(end)}" fill="none" stroke="${ink}" stroke-width="${opening.kind === "gate" ? 0.3 : 0.16}" ${opening.visibility === "secret" ? 'stroke-dasharray="0.2 0.15"' : ""}/>`;
      const mid = pointAlong(a, b, opening.offsetMeters + opening.widthMeters / 2);
      return `<g>${door}${opening.state === "locked" ? `<circle cx="${fmt(mid[0])}" cy="${fmt(mid[1])}" r="0.15" fill="${ink}"/>` : ""}${options.interactive ? `<path data-opening-id="${escapeXml(opening.id)}" tabindex="0" role="button" aria-label="扉 ${escapeXml(opening.id)}" d="M${coords(start)} L${coords(end)}" fill="none" stroke="transparent" stroke-width="1.15" pointer-events="stroke"><title>${escapeXml(opening.kind === "gate" ? "門" : "扉")} ${escapeXml(opening.id)}</title></path>` : ""}</g>`;
    })
    .join("");
  const fixtures = Object.values(level.fixtures)
    .map(fixture => {
      const center = labelPoint(fixture.footprint);
      return `<circle cx="${fmt(center[0])}" cy="${fmt(center[1])}" r="0.9" fill="#f4eee0" stroke="#7e8c7d" stroke-width="0.15"/><circle cx="${fmt(center[0])}" cy="${fmt(center[1])}" r="0.5" fill="#b8ced1"/>`;
    })
    .join("");
  const main = level.entrances.find(entrance => entrance.role === "main");
  let entranceMark = "";
  if (main) {
    const opening = level.openings[main.openingId];
    const edge = level.boundaries[opening.boundaryId];
    const [a, b] = boundaryPoints(level, edge);
    const middle = pointAlong(a, b, opening.offsetMeters + opening.widthMeters / 2);
    const direction = edge.leftSpaceId ? -1 : 1;
    const len = distance(a, b);
    const nx = (-(b[1] - a[1]) / len) * direction;
    const ny = ((b[0] - a[0]) / len) * direction;
    const tip: Point = [middle[0] + nx * 1, middle[1] + ny * 1];
    const tail: Point = [middle[0] + nx * 3, middle[1] + ny * 3];
    entranceMark = `<path d="M${coords(tail)} L${coords(tip)} M${coords([tip[0] + nx + ny * 0.5, tip[1] + ny - nx * 0.5])} L${coords(tip)} L${coords([tip[0] + nx - ny * 0.5, tip[1] + ny + nx * 0.5])}" fill="none" stroke="#168377" stroke-width="0.2"/>`;
  }
  const scale = Math.min(10, Math.floor(w / 3));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -7 ${fmt(w + 10)} ${fmt(h + 15)}" width="${Math.round((w + 10) * 12)}" height="${Math.round((h + 15) * 12)}" role="${options.interactive ? "group" : "img"}" aria-label="${escapeXml(document.title)}" style="font-family:system-ui,sans-serif"><title>${escapeXml(document.title)}</title><defs><pattern id="de-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0 H0 V1" fill="none" stroke="#8c9489" stroke-width="0.025" opacity="0.3"/></pattern></defs><rect x="-5" y="-7" width="${fmt(w + 10)}" height="${fmt(h + 15)}" fill="#f2eddf"/><text x="0" y="-3.1" fill="#34463e" font-size="2" font-weight="600">${escapeXml(document.title)}</text><g class="de-floors">${floors}</g>${options.grid ? `<rect width="${fmt(w)}" height="${fmt(h)}" fill="url(#de-grid)" pointer-events="none"/>` : ""}<g class="de-walls">${walls}</g><g class="de-doors">${doors}</g><g pointer-events="none">${fixtures}${entranceMark}<path d="M0 ${fmt(h + 4)} v0.6 h${scale} v-0.6" fill="none" stroke="#4a4e47" stroke-width="0.15"/><text x="${scale / 2}" y="${fmt(h + 6)}" text-anchor="middle" font-size="1" fill="#707369">${scale} m</text><text x="${fmt(w)}" y="${fmt(h + 5)}" text-anchor="end" font-size="0.75" fill="#707369">${escapeXml(document.generation.seed)}</text></g></svg>`;
}
