import { accessSummary } from "../connectivity";
import { validateDocument } from "../document";
import { snap } from "../geometry";
import type { Diagnostic, DungeonDocument, GenerationResult, GenerationSettings } from "../types";
import { buildLevel } from "./boundaries";
import { planCaravanserai } from "./caravanserai";
import { makeRng } from "./prng";
import { planRoomCorridor } from "./roomCorridor";
import { validateSettings } from "./settings";

export function generateDungeon(input: GenerationSettings): GenerationResult {
  const errors = validateSettings(input);
  if (errors.length) return { ok: false, diagnostics: errors, attempts: 0 };
  const settings = { ...input, widthMeters: snap(input.widthMeters), depthMeters: snap(input.depthMeters) };
  if (settings.strategy === "caravanserai") {
    // Centered courtyard edges must both land on the quarter-metre lattice.
    settings.courtyardWidthMeters =
      settings.widthMeters - 2 * snap((settings.widthMeters - settings.courtyardWidthMeters) / 2);
    settings.courtyardDepthMeters =
      settings.depthMeters - 2 * snap((settings.depthMeters - settings.courtyardDepthMeters) / 2);
  }
  let diagnostics: Diagnostic[] = [];
  for (let attempt = 0; attempt < 32; attempt++) {
    try {
      const random = makeRng(`${settings.seed}:layout:${attempt}`);
      const plan =
        settings.strategy === "caravanserai" ? planCaravanserai(settings, random) : planRoomCorridor(settings, random);
      if (plan.spaces.length > 128)
        return {
          ok: false,
          diagnostics: [
            { severity: "error", message: "空間の合計が上限の 128 を超えます。部屋数・周回路数を減らしてください。" }
          ],
          attempts: attempt + 1
        };
      const level = buildLevel(plan, settings);
      const document: DungeonDocument = {
        format: "fmg-dungeon-editor",
        version: 1,
        id: "dungeon-1",
        title: settings.strategy === "caravanserai" ? "隊商宿" : "部屋と通路のダンジョン",
        units: "meters",
        frame: { widthMeters: settings.widthMeters, depthMeters: settings.depthMeters },
        levels: [level],
        generation: {
          algorithmVersion: "dungeon-v1",
          seed: settings.seed,
          strategy: settings.strategy,
          settings,
          attempt
        }
      };
      diagnostics = validateDocument(document);
      if (settings.strategy === "room-corridor" && accessSummary(level).loops !== settings.loopCount)
        diagnostics.push({ severity: "error", message: "指定した周回路数を満たせませんでした。" });
      if (!diagnostics.length) return { ok: true, document, diagnostics: [], attempts: attempt + 1 };
    } catch (error) {
      diagnostics = [
        { severity: "error", message: error instanceof Error ? error.message : "平面の生成に失敗しました。" }
      ];
    }
  }
  return { ok: false, diagnostics, attempts: 32 };
}
