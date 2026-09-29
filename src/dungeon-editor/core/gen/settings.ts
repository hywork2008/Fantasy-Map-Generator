import { snap } from "../geometry";
import type { Diagnostic, GenerationSettings } from "../types";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length <= 256;

export function isGenerationSettings(value: unknown): value is GenerationSettings {
  if (!record(value)) return false;
  return (
    ["caravanserai", "room-corridor"].includes(String(value.strategy)) &&
    text(value.seed) &&
    value.seed.length > 0 &&
    value.seed.length <= 128 &&
    [
      "widthMeters",
      "depthMeters",
      "courtyardWidthMeters",
      "courtyardDepthMeters",
      "roomBandDepthMeters",
      "minRoomWidthMeters",
      "corridorWidthMeters",
      "entranceWidthMeters",
      "outerWallMeters",
      "partitionWallMeters",
      "roomCount",
      "loopCount"
    ].every(key => finite(value[key])) &&
    ["north", "east", "south", "west"].includes(String(value.entranceSide)) &&
    typeof value.symmetric === "boolean" &&
    typeof value.fixtures === "boolean"
  );
}

export function validateSettings(settings: GenerationSettings): Diagnostic[] {
  const messages: string[] = [];
  if (!isGenerationSettings(settings)) return [{ severity: "error", message: "生成設定の形式が不正です。" }];
  for (const key of ["widthMeters", "depthMeters"] as const)
    if (settings[key] < 12 || settings[key] > 250 || snap(settings[key]) !== settings[key])
      messages.push("外周寸法は 12〜250 m を 0.25 m 単位で指定してください。");
  for (const key of [
    "courtyardWidthMeters",
    "courtyardDepthMeters",
    "roomBandDepthMeters",
    "minRoomWidthMeters",
    "corridorWidthMeters",
    "entranceWidthMeters",
    "outerWallMeters",
    "partitionWallMeters"
  ] as const)
    if (settings[key] <= 0 || settings[key] > 250 || snap(settings[key]) !== settings[key])
      messages.push("寸法は正の値を 0.25 m 単位で指定してください。");
  if (settings.corridorWidthMeters < 0.75 || settings.corridorWidthMeters > 10)
    messages.push("通路有効幅は 0.75〜10 m にしてください。");
  if (settings.entranceWidthMeters < 0.75 || settings.entranceWidthMeters > 10)
    messages.push("入口有効幅は 0.75〜10 m にしてください。");
  if (settings.minRoomWidthMeters < 2 || settings.roomBandDepthMeters < 2)
    messages.push("部屋幅・部屋帯の奥行は 2 m 以上にしてください。");
  if (
    settings.outerWallMeters < 0.25 ||
    settings.outerWallMeters > 2 ||
    settings.partitionWallMeters < 0.25 ||
    settings.partitionWallMeters > 2
  )
    messages.push("壁厚は 0.25〜2 m にしてください。");
  if (
    !Number.isInteger(settings.roomCount) ||
    settings.roomCount < 1 ||
    settings.roomCount > 50 ||
    !Number.isInteger(settings.loopCount) ||
    settings.loopCount < 0 ||
    settings.loopCount > 12
  )
    messages.push("部屋数は 1〜50、周回路数は 0〜12 の整数にしてください。");
  if (
    settings.strategy === "caravanserai" &&
    (settings.courtyardWidthMeters < settings.entranceWidthMeters + 2 * settings.minRoomWidthMeters ||
      settings.courtyardDepthMeters < settings.entranceWidthMeters + 2 * settings.minRoomWidthMeters)
  )
    messages.push("中庭は入口と両側の部屋が収まる寸法にしてください。");
  return [...new Set(messages)].map(message => ({ severity: "error", message }));
}
