export const tooltipExtensions: {
  showMapTooltip?: (
    point: [number, number],
    e: MouseEvent,
    i: number,
    g: number,
    group: string,
    subgroup: string
  ) => boolean;
  updateCellInfo?: (point: [number, number], i: number, g: number) => void;
} = {};
