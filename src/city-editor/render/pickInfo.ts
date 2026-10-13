import type { SvgPickInfo } from "../types/selection";

export function parsePickInfo(raw: string | null): SvgPickInfo | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as SvgPickInfo;
  } catch {
    return null;
  }
}

export type { SvgPickInfo } from "../types/selection";
