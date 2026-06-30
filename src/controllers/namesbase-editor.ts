import { max as d3max, min as d3min, mean, median } from "d3";
import { worldContext } from "../context/worldContext";
import { GenerationPipeline } from "../services/generationPipeline";
import { viewLayerService as view } from "../services/viewLayerService";
import { openConfirm, openDialog } from "../ui/dialogs/dialogService";
import { rn, unique } from "../utils";
import { ERROR } from "../utils/debug";
import { downloadFile, getFileName } from "../utils/editorHelpers";

const unsafe = /[|/]/g;

export interface ParseError {
  id: number;
  line: string;
  error: string;
}

export interface NamesbaseAnalysisData {
  length: number;
  variety: number;
  minLength: number | undefined;
  maxLength: number | undefined;
  meanLength: number;
  medianLength: number | undefined;
  nonBasicLatinChars: string;
  doubledStr: string;
  duplicates: string;
  multiwordRate: number;
}

class NamesbaseEditorModule {
  init(): void {}

  open(): void {
    if (view.customization) return;
    openDialog("namesbaseEditor");
  }

  analyzeNamesbase(namesSourceString: string): NamesbaseAnalysisData | null {
    const namesArray = namesSourceString
      .toLowerCase()
      .split(",")
      .map(n => n.trim())
      .filter(Boolean);
    const length = namesArray.length;
    if (!namesSourceString || !length) {
      return null;
    }

    const chain = GenerationPipeline.Names.calculateChain(namesSourceString);
    const chainValues = Object.values(chain) as string[][];
    const variety = rn(mean(chainValues.map(kv => kv.length)) ?? 0);

    const wordsLength = namesArray.map(n => n.length);

    const nonLatin = namesSourceString.match(/[\u0080-\uFFFF]/gu);
    const nonBasicLatinChars = nonLatin
      ? unique(
          namesSourceString
            .match(/[\u0080-\uFFFF]/gu)!
            .join("")
            .toLowerCase()
            .split("")
        ).join("")
      : "none";

    const geminate = namesArray.flatMap(name => name.match(/[^\w\s]|(.)(?=\1)/g) ?? []);
    const doubled = unique(geminate).filter(char => geminate.filter(d => d === char).length > 3);
    const doubledStr = doubled.length ? doubled.join("") : "none";

    const duplicates = unique(namesArray.filter((e, i, a) => a.indexOf(e) !== i)).join(", ") || "none";
    const multiwordRate = mean(namesArray.map(n => +n.includes(" "))) ?? 0;

    return {
      length,
      variety,
      minLength: d3min(wordsLength),
      maxLength: d3max(wordsLength),
      meanLength: rn(mean(wordsLength) ?? 0, 1),
      medianLength: median(wordsLength),
      nonBasicLatinChars,
      doubledStr,
      duplicates,
      multiwordRate
    };
  }

  namesbaseAdd(): number {
    const baseId = worldContext.nameBases.length;
    const b =
      "This,is,an,example,of,name,base,showing,correct,format,It,should,have,at,least,one,hundred,names,separated,with,comma";
    worldContext.nameBases.push({
      name: `Base${baseId}`,
      i: baseId,
      min: 5,
      max: 12,
      d: "",
      m: 0,
      b
    });
    return baseId;
  }

  namesbaseRestoreDefault(onConfirm: () => void): void {
    openConfirm(`Are you sure you want to restore default namesbase?`, {
      title: "Restore default data",
      confirm: "Restore",
      onConfirm: () => {
        GenerationPipeline.Names.clearChains();
        worldContext.nameBases = GenerationPipeline.Names.getNameBases();
        onConfirm();
      }
    });
  }

  namesbaseDownload(): void {
    const data = worldContext.nameBases.map(b => `${b.name}|${b.min}|${b.max}|${b.d}|${b.m}|${b.b}`).join("\r\n");
    const name = `${getFileName("Namesbase")}.txt`;
    downloadFile(data, name);
  }

  namesbaseUpload(dataLoaded: string, override = true): { errors: ParseError[]; totalCount: number } {
    const lines = dataLoaded
      .replace(/\r\n|\r/g, "\n")
      .split("\n")
      .filter(Boolean);

    if (!lines.length) {
      return {
        errors: [{ id: 0, line: "", error: "Cannot load a namesbase. Please check the data format" }],
        totalCount: 0
      };
    }

    GenerationPipeline.Names.clearChains();
    if (override) worldContext.nameBases = [];

    const errors: ParseError[] = [];
    lines.forEach((line, index) => {
      try {
        const [rawName, min, max, d, m, rawNames] = line.split("|");
        const name = rawName?.replace(unsafe, "");
        if (!name) throw new Error("Name is missing");
        const names = rawNames?.replace(unsafe, "");
        if (!names) throw new Error("Names are missing");
        worldContext.nameBases.push({
          name,
          i: worldContext.nameBases.length,
          min: +min,
          max: +max,
          d: d || "",
          m: m ? +m : 0,
          b: names
        });
      } catch (e) {
        errors.push({ id: index + 1, line, error: (e as Error).message });
        ERROR && console.error(e);
      }
    });

    return { errors, totalCount: lines.length };
  }
}

export const NamesbaseEditor = new NamesbaseEditorModule();
export function initNamesbaseEditor(): void {
  NamesbaseEditor.init();
}
