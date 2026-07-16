import { worldContext } from "../context/worldContext";
import type { Burg } from "../types/models";
import { openDialog } from "../ui/dialogs/dialogService";
import type { PopulationChangeConfig } from "../ui/dialogs/PopulationChangeDialog";
import { rn } from "./index";

/**
 * Common configuration interface for population change dialogs.
 */
export interface PopulationChangeConfigParams {
  title: string;
  description: string;
  oldRural: number;
  oldUrban: number;
  cells:
    | number[]
    | Uint16Array
    | Uint32Array
    | Int32Array
    | Float32Array
    | Float64Array
    | Uint8Array
    | Int8Array
    | Int16Array;
  burgs: Burg[];
  onSuccess?: () => void;
}

export function openPopulationChangeDialog({
  title,
  description,
  oldRural,
  oldUrban,
  cells,
  burgs,
  onSuccess
}: PopulationChangeConfigParams): void {
  const config: PopulationChangeConfig = {
    title,
    description,
    initialRural: oldRural,
    initialUrban: oldUrban,
    urbanDisabled: burgs.length === 0,
    onApply: (newRural: number | string, newUrban: number | string) => {
      applyPopulationChange(oldRural, oldUrban, newRural, newUrban, cells, burgs);
      if (onSuccess) onSuccess();
    }
  };
  openDialog("populationChangeDialog", config);
}

function applyPopulationChange(
  oldRural: number,
  oldUrban: number,
  newRural: string | number,
  newUrban: string | number,
  cells: Iterable<number>,
  burgList: Burg[]
): void {
  const cellsArr = Array.from(cells);
  const ruralChange = +newRural / oldRural;
  if (Number.isFinite(ruralChange) && ruralChange !== 1) {
    cellsArr.forEach((i: number) => {
      worldContext.pack.cells.pop[i] *= ruralChange;
    });
  }
  if (!Number.isFinite(ruralChange) && +newRural > 0) {
    const points = +newRural / worldContext.populationRate;
    const pop = rn(points / cellsArr.length);
    cellsArr.forEach((i: number) => {
      worldContext.pack.cells.pop[i] = pop;
    });
  }

  const urbanChange = +newUrban / oldUrban;
  if (Number.isFinite(urbanChange) && urbanChange !== 1) {
    burgList.forEach((b: Burg) => {
      b.population = rn((b.population ?? 0) * urbanChange, 4);
    });
  }
  if (!Number.isFinite(urbanChange) && +newUrban > 0) {
    const points = +newUrban / worldContext.populationRate / worldContext.urbanization;
    const population = rn(points / burgList.length, 4);
    burgList.forEach((b: Burg) => {
      b.population = population;
    });
  }
}
