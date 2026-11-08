import { planPerimeterDistrict } from "../generators/vector/generation/perimeter";
import type { VectorDistrictReply, VectorDistrictRequest } from "./vectorDistrictPool";

self.onmessage = ({ data }: MessageEvent<VectorDistrictRequest>) => {
  try {
    self.postMessage({
      id: data.id,
      results: data.jobs.map(job => planPerimeterDistrict(data.context, job))
    } satisfies VectorDistrictReply);
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error)
    } satisfies VectorDistrictReply);
  }
};
