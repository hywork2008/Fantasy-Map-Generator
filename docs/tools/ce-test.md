# CEテストと依存検査

```sh
npx vitest run city-editor --maxWorkers=4
npx tsc --noEmit
npm run lint:architecture
```

テストは担当する役割の近くに配置する。IOは`src/city-editor/services/io/`、Workerは`services/`、UIは`components/`、生成は`generators/`、描画は`renderers/`。依存検査の境界テストは`src/city-editor/architecture.test.ts`。FMGのpreview利用者は`npx vitest run ui/components/BurgCityPreview --maxWorkers=4`で確認する。

サンドボックスでtsx CLIのIPCが拒否される場合は、同じ検査を`node --import tsx scripts/lint-architecture.ts`で実行できる。代表都市の出力比較は[scripts/city-editor/phase0/README.md](../../scripts/city-editor/phase0/README.md)を参照する。
