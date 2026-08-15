import { tip } from "../services/tooltipService";
import { getGenerationOptions } from "../store/optionsState";
import { downloadFile, getFileName } from "../utils/editorHelpers";
import { VERSION } from "../versioning";

export const GENERATION_OPTIONS_KIND = "fmg-generation-options";

export interface GenerationOptionsExport {
  kind: typeof GENERATION_OPTIONS_KIND;
  version: string;
  exportedAt: string;
  options: ReturnType<typeof getGenerationOptions>;
}

export function buildGenerationOptionsExport(now = new Date()): GenerationOptionsExport {
  return {
    kind: GENERATION_OPTIONS_KIND,
    version: VERSION,
    exportedAt: now.toISOString(),
    options: getGenerationOptions()
  };
}

/** Download the current Zustand generation options as a JSON file. */
export function exportGenerationOptions(): void {
  const fileName = `${getFileName("GenerationOptions")}.json`;
  downloadFile(JSON.stringify(buildGenerationOptionsExport(), null, 2), fileName, "application/json");
  tip(`${fileName} is saved. Open "Downloads" screen (CTRL + J) to check`, true, "success", 7000);
}
