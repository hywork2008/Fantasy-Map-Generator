export type RiverSectionPoint = { point: [number, number]; physicalWidth: number; renderedWidth: number };

/** Project onto the actual local river section, never the river's mouth width. */
export function riverBankCandidates(origin: [number, number], sections: RiverSectionPoint[], margin: number) {
  let best:
    | {
        point: [number, number];
        normal: [number, number];
        physicalWidth: number;
        renderedWidth: number;
        distance: number;
      }
    | undefined;
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i],
      b = sections[i + 1];
    const dx = b.point[0] - a.point[0],
      dy = b.point[1] - a.point[1];
    const length = Math.hypot(dx, dy);
    if (!length) continue;
    const t = Math.max(
      0,
      Math.min(1, ((origin[0] - a.point[0]) * dx + (origin[1] - a.point[1]) * dy) / (length * length))
    );
    const point: [number, number] = [a.point[0] + t * dx, a.point[1] + t * dy];
    const distance = Math.hypot(point[0] - origin[0], point[1] - origin[1]);
    if (best && best.distance <= distance) continue;
    best = {
      point,
      distance,
      normal: [dy / length, -dx / length],
      physicalWidth: a.physicalWidth + t * (b.physicalWidth - a.physicalWidth),
      renderedWidth: a.renderedWidth + t * (b.renderedWidth - a.renderedWidth)
    };
  }
  if (!best) return [];
  const section = best;
  const offset = Math.max(section.physicalWidth, section.renderedWidth) / 2 + margin;
  return [1, -1]
    .map(side => ({
      point: [
        section.point[0] + section.normal[0] * offset * side,
        section.point[1] + section.normal[1] * offset * side
      ] as [number, number],
      bank: side === 1 ? ("left" as const) : ("right" as const),
      width: section.physicalWidth
    }))
    .sort(
      (a, b) =>
        Math.hypot(a.point[0] - origin[0], a.point[1] - origin[1]) -
        Math.hypot(b.point[0] - origin[0], b.point[1] - origin[1])
    );
}
