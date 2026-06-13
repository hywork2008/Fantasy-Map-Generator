

## 現況

現在 src/index.html から以下のファイルを読んで順次実行されている。

- utils/index.ts
- modules/index.ts
- renderers/index.ts
- controllers/index.ts

そのため実行順の制御が行えない。
これらのファイルから読み込まれるファイルをモジュール化し、それぞれに初期化用の関数を作成し、今までファイルが読み込まれた時点で実行されていた処理を初期化用関数に移動させたい。
即時設定されていた変数・定数は用途によって定義場所の変更も検討し、初期化用の関数内に設定したり、別の場所にまとめたりしたい。

## 参考資料

### データ構造

https://github.com/Azgaar/Fantasy-Map-Generator/wiki/Data-model-(in-progress)


### tsファイルの元となったjsファイル作成者の目的・ゴール

https://github.com/Azgaar/Fantasy-Map-Generator/pull/842

- full code decoupling using es6 modules
- removing most of global variables / functions
- codebase modernization
- full Typescript support
- production code minification


### README.md

The expected **future** architecture is based on a separation between **world data**, **procedural generation**, **interactive editing**, and **rendering**. The application is conceptually divided into four main layers: world data and styles (state), generators (model), editors (controllers), renderers (view).

Flow:
settings → generators → world data → renderer
UI → editors → world data → renderer.

The data layer must contain no logic and no rendering code. Generators implement the procedural world simulation. Editors implement interactive editing tools used by the user. They perform controlled mutations of the world state. Editors can be viewed as interactive generators. The renderer converts the world state into SVG or WebGl graphics. Renderer must be pure visualization step and not modify world data.

## このリポジトリ・ブランチの目的

- 冒頭のindex.tsファイルで読み込まれている各tsファイルを全てモジュール化する。
- src/app.tsにアプリのエントリーポイントを作成し、そこから現在順番に実行されていた処理と同等の初期化処理を行い、地図を表示できるようにする。
- 現在グローバル変数window.*にアタッチされているFMGの各関数は、各モジュールでimport/exportして使用し、外部jsライブラリなどから呼び出されているもの以外は登録しない。
- jQuery及びjquery-uiは将来的に廃止してreactが導入される予定なのでこれらについてはノータッチで良い。

## 原則

- worldContext にはmapファイル用のデータを格納する。
- viewState には表示に関する状態・設定を格納する。
- window.*への登録は避ける。
- git commitメッセージは英語で作成する。commit前に`npm run build` -> `npm run dev`を実行して、エラーが出ないことを確認するのでcommitはしない。