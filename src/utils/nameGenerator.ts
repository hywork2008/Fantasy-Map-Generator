import { worldContext } from "../context/worldContext";
import { GenerationPipeline } from "../services/generationPipeline";
import { rand } from "./index";

export function generateRandomName(): string {
  if (!worldContext.nameBases || worldContext.nameBases.length === 0) return "";
  const base = rand(worldContext.nameBases.length - 1);
  return GenerationPipeline.Names.getBase(base);
}
