import type { CityDocument } from "../types/document";
import { copyLegacyCity } from "./io/vector/legacyCopy";

self.onmessage = ({ data }: MessageEvent<CityDocument>) => {
  try {
    self.postMessage(copyLegacyCity(data));
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
