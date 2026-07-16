import { appServices } from "../context/appServices";
import { viewContext } from "../context/viewContext";
import { worldContext } from "../context/worldContext";
import { GenerationPipeline } from "../services/generationPipeline";
import { getAdjective } from "./index";

export function generateShortCultureName(culture: number): string {
  return GenerationPipeline.Names.getState(
    GenerationPipeline.Names.getCultureShort(worldContext, viewContext, appServices, culture),
    culture
  );
}

export function regenerateFullName(
  shortName: string,
  formName: string,
  togglePattern: boolean,
  tick: number = 0
): string {
  if (!formName) return shortName;
  if (!shortName) return `The ${formName}`;
  if (togglePattern) {
    return tick % 2 ? `${getAdjective(shortName)} ${formName}` : `${formName} of ${shortName}`;
  }
  return `${shortName} ${formName}`;
}
