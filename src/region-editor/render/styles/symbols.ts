import type { SymbolType } from "../../core/types";

/**
 * 手描き風・アイソメトリック風の地勢シンボル SVG パス定義集
 * 原点はシンボルの底面中心 (0, 0)
 */

export interface SymbolDefinition {
  viewBox: string;
  width: number;
  height: number;
  originX: number;
  originY: number;
  renderSvg: (fill: string, stroke: string, highlight?: string) => string;
}

export const SYMBOL_DEFINITIONS: Record<SymbolType, SymbolDefinition> = {
  mountain_peak_major: {
    viewBox: "-30 -50 60 55",
    width: 60,
    height: 55,
    originX: 0,
    originY: 0,
    renderSvg: (fill, stroke, highlight = "#ffffff") => `
      <g class="symbol-mountain">
        <!-- 峰の本体（左側のハイライト面） -->
        <polygon points="0,-48 -28,0 0,0" fill="${highlight}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" />
        <!-- 峰の本体（右側のシャドウ面） -->
        <polygon points="0,-48 0,0 28,0" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" />
        <!-- 尾根線と陰影ハッチング -->
        <line x1="0" y1="-48" x2="0" y2="0" stroke="${stroke}" stroke-width="2" stroke-linecap="round" />
        <line x1="4" y1="-28" x2="16" y2="-12" stroke="${stroke}" stroke-width="1" opacity="0.6" />
        <line x1="8" y1="-18" x2="22" y2="-4" stroke="${stroke}" stroke-width="1" opacity="0.6" />
      </g>
    `
  },

  mountain_peak_minor: {
    viewBox: "-20 -35 40 40",
    width: 40,
    height: 40,
    originX: 0,
    originY: 0,
    renderSvg: (fill, stroke, highlight = "#ffffff") => `
      <g class="symbol-mountain-minor">
        <polygon points="0,-32 -18,0 0,0" fill="${highlight}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <polygon points="0,-32 0,0 18,0" fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round" />
        <line x1="0" y1="-32" x2="0" y2="0" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" />
        <line x1="3" y1="-18" x2="11" y2="-8" stroke="${stroke}" stroke-width="0.8" opacity="0.6" />
      </g>
    `
  },

  mountain_snow: {
    viewBox: "-32 -54 64 60",
    width: 64,
    height: 60,
    originX: 0,
    originY: 0,
    renderSvg: (fill, stroke, _highlight) => `
      <g class="symbol-mountain-snow">
        <polygon points="0,-50 -30,0 0,0" fill="#e8edf2" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" />
        <polygon points="0,-50 0,0 30,0" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round" />
        <!-- 雪冠（スノーキャップ） -->
        <polygon points="0,-50 -12,-28 -4,-32 6,-30 12,-26 0,-50" fill="#ffffff" stroke="${stroke}" stroke-width="1.2" />
        <line x1="0" y1="-50" x2="0" y2="0" stroke="${stroke}" stroke-width="2" stroke-linecap="round" />
      </g>
    `
  },

  hill_single: {
    viewBox: "-20 -18 40 22",
    width: 40,
    height: 22,
    originX: 0,
    originY: 0,
    renderSvg: (fill, stroke) => `
      <g class="symbol-hill">
        <path d="M -18 0 C -12 -16, 12 -16, 18 0 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.2" />
        <path d="M -6 -12 C 0 -14, 6 -12, 10 -4" fill="none" stroke="${stroke}" stroke-width="0.8" opacity="0.5" />
      </g>
    `
  },

  hill_cluster: {
    viewBox: "-30 -22 60 26",
    width: 60,
    height: 26,
    originX: 0,
    originY: 0,
    renderSvg: (fill, stroke) => `
      <g class="symbol-hills">
        <path d="M -26 0 C -20 -14, -2 -14, 4 0 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.1" />
        <path d="M -6 0 C 2 -18, 22 -18, 28 0 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.2" />
      </g>
    `
  },

  tree_deciduous: {
    viewBox: "-14 -26 28 30",
    width: 28,
    height: 30,
    originX: 0,
    originY: 0,
    renderSvg: (fill, stroke) => `
      <g class="symbol-tree-deciduous">
        <!-- 幹 -->
        <line x1="0" y1="0" x2="0" y2="-10" stroke="#5a3d28" stroke-width="2" stroke-linecap="round" />
        <!-- 葉冠 -->
        <circle cx="0" cy="-15" r="9" fill="${fill}" stroke="${stroke}" stroke-width="1.1" />
        <path d="M -4 -17 C -3 -21, 3 -21, 4 -17" fill="none" stroke="${stroke}" stroke-width="0.7" opacity="0.6" />
      </g>
    `
  },

  tree_pine: {
    viewBox: "-12 -30 24 34",
    width: 24,
    height: 34,
    originX: 0,
    originY: 0,
    renderSvg: (fill, stroke) => `
      <g class="symbol-tree-pine">
        <line x1="0" y1="0" x2="0" y2="-6" stroke="#4a3320" stroke-width="1.8" stroke-linecap="round" />
        <polygon points="0,-28 -8,-16 -4,-16 -10,-6 10,-6 4,-16 8,-16" fill="${fill}" stroke="${stroke}" stroke-width="1.1" stroke-linejoin="round" />
      </g>
    `
  },

  tree_jungle: {
    viewBox: "-16 -28 32 32",
    width: 32,
    height: 32,
    originX: 0,
    originY: 0,
    renderSvg: (fill, stroke) => `
      <g class="symbol-tree-jungle">
        <line x1="0" y1="0" x2="0" y2="-8" stroke="#3b2d1d" stroke-width="2" />
        <ellipse cx="0" cy="-16" rx="12" ry="9" fill="${fill}" stroke="${stroke}" stroke-width="1.2" />
      </g>
    `
  },

  tree_dead: {
    viewBox: "-12 -25 24 28",
    width: 24,
    height: 28,
    originX: 0,
    originY: 0,
    renderSvg: (_fill, stroke) => `
      <g class="symbol-tree-dead">
        <path d="M 0 0 L 0 -18 M 0 -14 L -6 -20 M 0 -10 L 6 -16" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" />
      </g>
    `
  },

  swamp_grass: {
    viewBox: "-12 -14 24 16",
    width: 24,
    height: 16,
    originX: 0,
    originY: 0,
    renderSvg: (_fill, stroke) => `
      <g class="symbol-swamp">
        <path d="M -8 0 L -6 -10 M 0 0 L 0 -12 M 8 0 L 6 -9" stroke="${stroke}" stroke-width="1.1" stroke-linecap="round" />
        <line x1="-10" y1="0" x2="10" y2="0" stroke="${stroke}" stroke-width="0.8" opacity="0.7" />
      </g>
    `
  },

  marsh_reed: {
    viewBox: "-10 -18 20 20",
    width: 20,
    height: 20,
    originX: 0,
    originY: 0,
    renderSvg: (_fill, stroke) => `
      <g class="symbol-marsh">
        <line x1="-3" y1="0" x2="-2" y2="-15" stroke="${stroke}" stroke-width="1.1" />
        <line x1="3" y1="0" x2="2" y2="-13" stroke="${stroke}" stroke-width="1.1" />
        <circle cx="-2" cy="-15" r="1.5" fill="${stroke}" />
        <circle cx="2" cy="-13" r="1.5" fill="${stroke}" />
      </g>
    `
  },

  sand_dune: {
    viewBox: "-24 -12 48 16",
    width: 48,
    height: 16,
    originX: 0,
    originY: 0,
    renderSvg: (fill, stroke) => `
      <g class="symbol-dune">
        <path d="M -20 0 C -10 -8, 8 -8, 20 0" fill="none" stroke="${stroke}" stroke-width="1.2" stroke-linecap="round" />
        <path d="M -12 2 C -4 -4, 12 -4, 16 2" fill="none" stroke="${fill}" stroke-width="1" opacity="0.6" />
      </g>
    `
  }
};
