import { reconcileVectorEdit } from "../generators/vector/editing/dependencies";
import type { VectorEditReply, VectorEditRequest } from "./vectorEditWorkerClient";

self.onmessage = ({ data }: MessageEvent<VectorEditRequest>) => {
  let reply: VectorEditReply;
  try {
    reply = {
      id: data.id,
      inputRevision: data.inputRevision,
      result: reconcileVectorEdit(data.source, data.candidate)
    };
  } catch (error) {
    reply = {
      id: data.id,
      inputRevision: data.inputRevision,
      error: error instanceof Error ? error.message : String(error)
    };
  }
  self.postMessage(reply);
};
