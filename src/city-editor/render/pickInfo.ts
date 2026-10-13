export interface SvgPickInfo {
  layer: string;
  kind: string;
  id?: number | string;
  label: string;
  [key: string]: unknown;
}

export function parsePickInfo(raw: string | null): SvgPickInfo | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as SvgPickInfo;
  } catch {
    return null;
  }
}
