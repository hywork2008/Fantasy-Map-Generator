import { describe, expect, it } from "vitest";
import { createEmptyRegionDocument } from "../core/document";
import { DEFAULT_REGION_SETTINGS, type RegionRiver, type RegionRoute } from "../core/types";
import { renderRegionSvg } from "./svg";

describe("renderRegionSvg - River widths and Routes rendering", () => {
  it("幅が変化する河川において、水理幅に応じたセグメントと川幅情報タイトルが描画されること", () => {
    const doc = createEmptyRegionDocument(DEFAULT_REGION_SETTINGS);
    const river: RegionRiver = {
      id: "river-test",
      name: "River Chionthar",
      points: [
        [100, 100],
        [200, 150],
        [300, 180]
      ],
      widths: [60, 180, 400],
      dischargeM3s: 250
    };
    doc.rivers = [river];

    const svg = renderRegionSvg(doc);

    // 河川グループとタイトルタグの検証
    expect(svg).toContain('data-kind="river"');
    expect(svg).toContain('data-id="river-test"');
    expect(svg).toContain("<title>River Chionthar (川幅: 60m〜400m)</title>");

    // 水理幅を反映したベジェ曲線ポリゴンとセンターライン
    expect(svg).toContain('class="river-polygon"');
    expect(svg).toContain('class="river-centerline"');

    // 3点以上のスプライン補間により三次ベジェ曲線コマンド "C" が含まれること
    expect(svg).toContain("C");
  });

  it("3点以上の街道がCatmull-Romベジェ曲線(Cコマンド)として滑らかに描画されること", () => {
    const doc = createEmptyRegionDocument(DEFAULT_REGION_SETTINGS);
    const curvedHighway: RegionRoute = {
      id: "rt-curved",
      name: "Curved Highway",
      kind: "highway",
      points: [
        [50, 50],
        [100, 80],
        [150, 60],
        [200, 120]
      ]
    };
    doc.routes = [curvedHighway];

    const svg = renderRegionSvg(doc);
    expect(svg).toContain('class="route-highway "');
    expect(svg).toContain("C"); // 三次ベジェ曲線コマンドが含まれること
  });

  it("都市間街道が種別（highway, road, trail）に応じたスタイルと名称で描画されること", () => {
    const doc = createEmptyRegionDocument(DEFAULT_REGION_SETTINGS);
    const highway: RegionRoute = {
      id: "rt-high",
      name: "High Road",
      kind: "highway",
      points: [
        [50, 50],
        [150, 150]
      ]
    };
    const road: RegionRoute = {
      id: "rt-road",
      name: "Coast Road",
      kind: "road",
      points: [
        [150, 150],
        [250, 200]
      ]
    };
    const trail: RegionRoute = {
      id: "rt-trail",
      name: "Mountain Trail",
      kind: "trail",
      points: [
        [250, 200],
        [300, 250]
      ]
    };
    doc.routes = [highway, road, trail];

    const svg = renderRegionSvg(doc);

    // Highway: 二重線構造
    expect(svg).toContain('class="route-highway "');
    expect(svg).toContain("<title>High Road</title>");
    expect(svg).toContain('stroke-width="3.2"');

    // Road: 破線 7,2
    expect(svg).toContain('class="route-road "');
    expect(svg).toContain("<title>Coast Road</title>");
    expect(svg).toContain('stroke-dasharray="7,2"');

    // Trail: 点線 3,3
    expect(svg).toContain('class="route-trail "');
    expect(svg).toContain("<title>Mountain Trail</title>");
    expect(svg).toContain('stroke-dasharray="3,3"');
  });

  it("選択された街道や河川がハイライト表示されること", () => {
    const doc = createEmptyRegionDocument(DEFAULT_REGION_SETTINGS);
    doc.rivers = [
      {
        id: "river-sel",
        name: "Selected River",
        points: [
          [10, 10],
          [20, 20]
        ],
        widths: [100],
        dischargeM3s: 50
      }
    ];
    doc.routes = [
      {
        id: "route-sel",
        name: "Selected Route",
        kind: "road",
        points: [
          [30, 30],
          [40, 40]
        ]
      }
    ];

    const svgRiverSel = renderRegionSvg(doc, "river-sel");
    expect(svgRiverSel).toContain('class="river-group selected"');
    expect(svgRiverSel).toContain('stroke="#d4a373"');

    const svgRouteSel = renderRegionSvg(doc, "route-sel");
    expect(svgRouteSel).toContain('class="route-road selected"');
    expect(svgRouteSel).toContain('stroke="#d4a373"');
  });

  describe("Forest Canopy Rendering & Clearings", () => {
    it("森林バイオームが存在する場合、一体化した茂み・陰影フィルター・クリアリングマスクが描画されること", () => {
      const doc = createEmptyRegionDocument(DEFAULT_REGION_SETTINGS);
      // 森林セルを追加
      doc.biomes = [
        {
          id: "bio-forest-1",
          kind: "deciduous_forest",
          polygon: [
            [50, 50],
            [150, 50],
            [150, 150],
            [50, 150]
          ]
        },
        {
          id: "bio-forest-2",
          kind: "coniferous_forest",
          polygon: [
            [150, 50],
            [250, 50],
            [250, 150],
            [150, 150]
          ]
        }
      ];

      // 街道
      doc.routes = [
        {
          id: "rt-forest",
          name: "Forest Highway",
          kind: "highway",
          points: [
            [100, 20],
            [100, 180]
          ]
        }
      ];

      // 都市・集落
      doc.settlements = [
        {
          id: "set-woodland",
          burgId: 10,
          name: "Woodland Haven",
          position: [120, 100],
          type: "city",
          group: "town",
          population: 3000,
          isCapital: false,
          hasWalls: false,
          hasCitadel: false,
          hasPort: false
        }
      ];

      const svg = renderRegionSvg(doc, null, { quality: "high" });

      // 低品質（デフォルト）はタイル描画で、樹冠を1本ずつは描かない
      const low = renderRegionSvg(doc);
      expect(low).toContain('id="re-forest-crowns-deciduous"');
      expect(low).toContain('class="forest-pattern-overlay"');
      expect(low).not.toContain('class="forest-crown"');
      expect(low).not.toContain("re-wetland-bank");

      // 1. 森林レイヤー・林床・樹冠（影/本体/陰影/ハイライト）が存在すること
      expect(svg).toContain('id="layer-forests"');
      expect(svg).toContain('class="re-forest-layer"');
      expect(svg).toContain('class="re-forest-floor"');
      expect(svg).toContain('class="forest-crown-shadow"');
      expect(svg).toContain('class="forest-crown"');
      expect(svg).toContain('class="forest-crown-light"');

      // 2. 重いSVGフィルター（ノイズ照明・ディスプレイスメント）には依存しないこと
      expect(svg).not.toContain("feDiffuseLighting");
      expect(svg).not.toContain("feDisplacementMap");

      // 3. 街道や都市周辺をくり抜くクリアリングマスク（re-forest-clearing-mask）が定義され、街道と都市がくり抜かれていること
      expect(svg).toContain('mask="url(#re-forest-clearing-mask)"');
      expect(svg).toContain('id="re-forest-clearing-mask"');

      // 通行面のみを物理幅 (8m / 100m) で除外する
      expect(svg).toContain('stroke-width="0.08"');
      // アイコン固定半径を物理開地に転用しない
      expect(svg).not.toContain('cx="120.00" cy="100.00" r="28"');
    });

    it("森林バイオームが存在しない場合は森林レイヤーが空であること", () => {
      const doc = createEmptyRegionDocument(DEFAULT_REGION_SETTINGS);
      doc.biomes = [
        {
          id: "bio-grass",
          kind: "grassland",
          polygon: [
            [0, 0],
            [100, 0],
            [100, 100],
            [0, 100]
          ]
        }
      ];

      const svg = renderRegionSvg(doc);
      expect(svg).not.toContain('id="re-forest-shading"');
      expect(svg).toContain('<g id="layer-forests"></g>');
    });
  });

  it("clips wetlands to the smoothed coastline so the rounding cannot push them into the sea", () => {
    const doc = createEmptyRegionDocument(DEFAULT_REGION_SETTINGS);
    doc.biomes = [
      {
        id: "land",
        kind: "swamp",
        polygon: [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100]
        ],
        wetlandPatches: [
          {
            kind: "mud",
            level: 0,
            polygon: [
              [10, 10],
              [90, 10],
              [90, 90],
              [10, 90]
            ]
          }
        ]
      },
      {
        id: "sea",
        kind: "ocean",
        isWater: true,
        polygon: [
          [100, 0],
          [200, 0],
          [200, 100],
          [100, 100]
        ]
      }
    ];
    expect(renderRegionSvg(doc)).not.toContain("re-wetland-coast-mask");
    doc.terrain.coastlinePolygons = [
      [
        [100, 0],
        [100, 50]
      ],
      [
        [100, 50],
        [100, 100]
      ]
    ];
    const svg = renderRegionSvg(doc);
    expect(svg).toContain('<mask id="re-wetland-coast-mask"');
    expect(svg).toContain('<g id="layer-wetlands" mask="url(#re-wetland-coast-mask)">');
  });
});
