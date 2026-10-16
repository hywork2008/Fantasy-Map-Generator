export const FUNERAL_RITES = [
  "inhumation",
  "cremation",
  "skyBurial",
  "waterBurial",
  "mummification",
  "exposure"
] as const;

export type FuneralRite = (typeof FUNERAL_RITES)[number];
