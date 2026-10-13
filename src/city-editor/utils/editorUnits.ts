import { rn } from "../../utils/numberUtils";
export function niceScale(targetMeters: number): number {
  const exponent = 10 ** Math.floor(Math.log10(Math.max(targetMeters, 1)));
  const normalized = targetMeters / exponent;
  const unit = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return unit * exponent;
}
export function formatDistance(meters: number): string {
  const rounded = meters >= 1000 ? rn(meters / 1000, 2) : rn(meters, 1);
  return meters >= 1000 ? `${rounded} km` : `${rounded} m`;
}
export function formatClock(time: number): string {
  return new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}
