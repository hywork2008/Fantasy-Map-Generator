export const MIN_CANVAS_WIDTH = 240;
export const MIN_CANVAS_HEIGHT = 135;

export interface CanvasSize {
  mapWidth: number;
  mapHeight: number;
}

export function isValidCanvasDimension(value: number, minimum: number): boolean {
  return Number.isFinite(value) && value >= minimum;
}

export function isValidCanvasSize({ mapWidth, mapHeight }: CanvasSize): boolean {
  return isValidCanvasDimension(mapWidth, MIN_CANVAS_WIDTH) && isValidCanvasDimension(mapHeight, MIN_CANVAS_HEIGHT);
}
