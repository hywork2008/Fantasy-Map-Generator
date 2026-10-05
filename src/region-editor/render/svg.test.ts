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
});
