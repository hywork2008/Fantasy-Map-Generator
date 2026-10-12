/**
 * River-Port Lab L2 (docs/plan/river-port-lab.md §3, §6): generates one Province-scope lab map in
 * the open page and returns its statistics records, without saving a .fmg. The map server keeps
 * a page per worker and calls this once per seed (`window.fmg.lab.generate`).
 */
import { getGenerationProfile } from "../../generators/generationProfiler";
import { prepareWorldArchive } from "../../io/save";
import { generationProgressStore } from "../../store/generationProgressState";
import { useOptionsState } from "../../store/optionsState";
import { lock } from "../../utils/domUtils";
import { scopeTargetCells } from "../../utils/mapScope";
import { DEFAULT_LAB_OPTIONS, type RiverPortLabOptions, setLabOptions } from "./labOptions";
import { extractLabSample, type LabSampleFilter, type LabSampleInclude } from "./labSample";

export interface LabGenerateRequest {
  seed?: string;
  /** Province scope cells (mapScopeCells); the current value when omitted. */
  cells?: number;
  /** Merged over DEFAULT_LAB_OPTIONS, not over the page's previous request; `enabled: false` = control. */
  lab?: Partial<RiverPortLabOptions>;
  filter?: LabSampleFilter;
  include?: LabSampleInclude[];
  timeoutMs?: number;
}

/** regenerateMap's cooldown (250 ms) plus a margin. */
const REGENERATE_COOLDOWN_MS = 300;
let lastRegenerateAt = Number.NEGATIVE_INFINITY;

type Regenerate = (opts?: { seed?: string }) => void;

/** Resolves once a generation session newer than `afterId` reaches map-ready (or fails). */
function waitForMapReady(afterId: number, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const deadline = performance.now() + timeoutMs;
    const poll = () => {
      const profile = getGenerationProfile();
      if (profile && profile.id > afterId) {
        if ("failed" in profile.marks) return reject(new Error("generation failed"));
        if ("map-ready" in profile.marks) return resolve(Math.round(profile.marks["map-ready"]));
      }
      // A stage review left waiting (e.g. the page-load generation) is continued like "Generate entire map".
      const progress = generationProgressStore.getState();
      if (progress.resolver) progress.runAll();
      if (performance.now() > deadline) {
        const marks = profile
          ? `session ${profile.id} (${profile.entry}) marks ${Object.keys(profile.marks).join(",")}`
          : "no profile";
        return reject(
          new Error(
            `generation timed out after ${timeoutMs} ms: ${marks}; stage ${progress.currentStage} generating=${progress.isGenerating}`
          )
        );
      }
      setTimeout(poll, 20);
    };
    poll();
  });
}

async function archiveBase64(): Promise<string> {
  const bytes = new Uint8Array(await (await prepareWorldArchive()).arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function generateLabMap(request: LabGenerateRequest, regenerate: Regenerate) {
  const before = getGenerationProfile();
  if (!before) throw new Error("River-Port Lab needs the generation profiler (localStorage debug.generationProfile)");
  const timeoutMs = request.timeoutMs ?? 120000;
  // Finish whatever generation is in flight (the page-load one) before starting ours.
  if (!("map-ready" in before.marks) && !("failed" in before.marks))
    await waitForMapReady(before.id - 1, timeoutMs).catch(() => {});

  // Locked options survive randomizeOptions(): the lab runs on Province scope, Standard settlement.
  const options = useOptionsState.getState();
  lock("mapScope", "province");
  options.setOptions({ mapScope: "province" });
  if (request.cells !== undefined) {
    const cells = scopeTargetCells("province", request.cells)!;
    lock("mapScopeCells", String(cells));
    options.setOptions({ mapScopeCells: cells });
  }
  // Re-locked every time: a randomized fantasy culture set rewrites this lock to "marches"
  // (options.ts) and it would stick, making each seed depend on the page's earlier maps.
  // A fresh page (fmg:small) starts from "standard" for every seed, and so does each lab map.
  lock("initialSettlementPattern", "standard");
  options.setOptions({ initialSettlementPattern: "standard" });
  setLabOptions({ ...structuredClone(DEFAULT_LAB_OPTIONS), enabled: true, ...request.lab });
  generationProgressStore.setState({ autoRun: true });

  // regenerateMap drops calls within 250 ms of the previous one (commonUtils debounce), which a
  // tiny control map reaches: the seed was silently skipped and the wait timed out.
  const sinceLast = performance.now() - lastRegenerateAt;
  if (sinceLast < REGENERATE_COOLDOWN_MS) await new Promise(r => setTimeout(r, REGENERATE_COOLDOWN_MS - sinceLast));
  lastRegenerateAt = performance.now();
  const startId = getGenerationProfile()?.id ?? 0;
  regenerate(request.seed ? { seed: String(request.seed) } : undefined);
  const genMs = await waitForMapReady(startId, timeoutMs);
  const sample = extractLabSample(request.filter ?? { port: true }, request.include ?? []);
  return {
    map: { ...sample.map, genMs },
    burgs: sample.burgs,
    ...(request.include?.includes("fmg") ? { fmg: await archiveBase64() } : {})
  };
}
