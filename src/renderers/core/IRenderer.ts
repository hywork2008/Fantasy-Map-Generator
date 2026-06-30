import type { AppServices } from "../../context/appServices";
import type { ViewContext } from "../../context/viewContext";
import type { WorldContext } from "../../context/worldContext";

export interface IRenderer {
  /**
   * レンダラーの一意識別子 (例: "biomes", "burgIcons")
   */
  readonly id: string;

  /**
   * 描画処理本体。状態 (Context) は Readonly で受け取り、描画のみを行う純粋な関数として振る舞う。
   * @param worldContext 世界の状態 (Pack, Gridなど)
   * @param viewContext 描画インフラの状態 (SVGレイヤーへの参照など)
   * @param appServices アプリケーションサービス (RNG, Historyなど)
   */
  render(
    worldContext: Readonly<WorldContext>,
    viewContext: Readonly<ViewContext>,
    appServices: AppServices
  ): void | Promise<void>;

  /**
   * 描画のクリア処理（Canvas等で再描画時に使用、SVGでは通常コンテナのinnerHTML消去で行う）
   */
  clear?(viewContext: Readonly<ViewContext>): void;
  [key: string]: unknown;
}
