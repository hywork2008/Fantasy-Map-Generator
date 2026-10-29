# CE樹木LOD・都市全体性能の全量観測一覧

実施日：2026-10-29。固定入力と再生成可能なフレームごとの全量JSONはGit管理外の `docs/analytics/raw/` に置く。条件・派生比較・判定は [計測記録](ce-tree-city-performance-20261029.md)。

| ファイル | bytes | SHA-256 |
| --- | ---: | --- |
| `docs/analytics/raw/ce-forest-f0/medium-flat.json` | 13,084,986 | `b6b071b85f5d441203cd4be00a042c5d366f75a9d14352d477f8f4a08a9de8be` |
| `docs/analytics/raw/ce-forest-f0/small-flat.json` | 3,281,983 | `4220c49105da9d78a10d73e71122bc8f3d0f5ab597ed0f56b20bbac9946bc856` |
| `docs/analytics/raw/ce-forest-f0/small-river-valley.json` | 3,867,491 | `dbbb94af849c0be827ca8fc69ef9ddccbe66e5e86de121bda23cd2ad3cca78db` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/bounded-control-plain/results.json` | 1,410,576 | `5e4bc13fb5045b4aeeb568c7e877419b6be6831ebe7ba207d763b1c1e10715ed` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/bounded-control-shadow/shadows-results.json` | 1,411,320 | `47e8f7536cb25dc4d92c573de00ece92ef086b84fb864f10e45d3b9676466daf` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/native-plain/results.json` | 1,431,733 | `e3fa1c61842a596398590daefa60a6891c2e2a8c47207078571a32daacf9729b` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/native-shadow/shadows-results.json` | 1,431,647 | `2e95d8a5895a54cbb17c9fafcdcc523dd0663c3464dab3b2b13227018d483c63` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/bounded-control-plain/results.json` | 1,409,855 | `d1f63b37e6593ff532f20375883f36bf061d5d653049801b45f1b47b36293e41` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/native-plain/results.json` | 955,078 | `8ce156c6a56d428568974b65bc3b1d49baacfa3dfea46d412ef8712414ba4af5` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/native-plain/small-flat-results.json` | 477,619 | `4fc92f979745da6bf5e24630e6f5317f45b273589fb167c6d762b39b486db697` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/native-shadow/shadows-results.json` | 1,431,703 | `e23225b28a76f5321124d5d738a6a2fa3dabf80fd5689e4e00209903c72136fd` |

`-before` はフレーム内の採用モデル検索共有を導入する前。native・影なしの小都市は先行計測を別ファイルへ保存し、同じ条件の中都市・河川谷都市を後続のresults.jsonに保存した。その他のresultsは各3都市を含む。固定入力は2026-10-28の森林F0で作製したものをそのまま使用した。

計測後の各条件は1000×720・DPR 1、標準住宅・森林standard、都市部と郊外の簡略化auto。nativeは製品の品質優先方針、bounded-controlは検証プロセス内だけ全樹種のprofileをboundedにした対照条件で、製品設定の追加ではない。

## 全量比較画像

全84枚をGit管理外のrawへ保存し、代表8枚だけを派生比較としてanalyticsへ残す。

| ファイル | bytes | SHA-256 |
| --- | ---: | --- |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-plain/medium-flat-3d-edge.png` | 384,529 | `652f959ac680ee3a17e3e09a293d33e3fa2a803a55044cd95d065261205714ca` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-plain/medium-flat-3d-low.png` | 378,477 | `40bc12a379ac1e00bd5dde1c7f5e7def7657793946ae1238ec3bdc8cd6c83bee` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-plain/medium-flat-3d-overview.png` | 463,213 | `9361bcb0f1b3377caaf81392c235bd627eda3a67825044db983d431815b49477` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-plain/medium-flat-3d-urban.png` | 178,169 | `0caa58f3dc4ec7c3f2be678333a28cd1517653cda0e1a13166aeca32793b7243` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-plain/small-flat-3d-edge.png` | 364,718 | `94eafe74f4c2ae371dbdbab2af5df341ba89decc26db055c70dc0117bd7462af` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-plain/small-flat-3d-low.png` | 284,229 | `6629c97b10835f719134a1775302fd248f29df91e4b4ccd7ed95e11d6f2bc975` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-plain/small-flat-3d-overview.png` | 329,127 | `5932f6840c305e007838ff626218f67c74591de725e310035028325fa392cee8` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-plain/small-flat-3d-urban.png` | 176,226 | `a1bf9d066820998ccf6e7798cca1c75256f03d3794c45e3a8c034c7b7252f839` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-plain/small-river-valley-3d-edge.png` | 444,165 | `dd96430e6c5ff7bf43d44d4458bc175994f7edc292e36be921c95d0e87d2d802` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-plain/small-river-valley-3d-low.png` | 411,595 | `a01ac4c3217efc780687c34f0ebe349ad0398f3085323ffefd03b00143b5ae25` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-plain/small-river-valley-3d-overview.png` | 478,791 | `8fc8ea4605ee0bbf53379fa8d43daf72793f3fcdcd93e4075af4d4482749a08a` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-plain/small-river-valley-3d-urban.png` | 190,536 | `05c8ac86763db8bdd966c5381f261f9b73649238af6817f5977eddec236ff2ca` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-shadow/medium-flat-3d-edge.png` | 518,164 | `f7aa5b673e996db1ccdd1a0f598182aeca81bb0597d91e1bf8428a3f4ddd60eb` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-shadow/medium-flat-3d-low.png` | 473,936 | `162ce5ae766e83bca0b11f7802d4d1a6aa6480f252e8e35cc291eff98567daa2` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-shadow/medium-flat-3d-overview.png` | 477,900 | `a979e841c822b4fededdc9a21e281f6ad57c315c64a82d3826a0a51c1910b448` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-shadow/medium-flat-3d-urban.png` | 237,813 | `314252be540583450cf5d5e07fda3434fdd63761e33c37ae74c59cad3134bea6` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-shadow/small-flat-3d-edge.png` | 369,999 | `b5940a5b5f5d07d0b606def7d53f73f3f6b46fece6137733714afeadb0fc9808` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-shadow/small-flat-3d-low.png` | 292,878 | `3dcff8f7f8f7e2b5aacfa5a79b7d9f39ae9010cf9ef11ebd4648b792b1039bee` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-shadow/small-flat-3d-overview.png` | 338,056 | `55de7511ddfb9a49695a0389c0f053990e00888c8e0b2f13d8939a686cf1b635` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-shadow/small-flat-3d-urban.png` | 234,934 | `aacc116dfc39c72e6f4b1222c2e55ba0b1deda9a71574a379e78d3521faa327e` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-shadow/small-river-valley-3d-edge.png` | 467,547 | `6fef3ee03a2b19596f80a2c3808f2be557219994e60494c64ace320085236f2b` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-shadow/small-river-valley-3d-low.png` | 420,827 | `a5a777d03e51d6d63c724faa8cf0ac300ca4bbbfe1bb4439dd51f0c113327263` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-shadow/small-river-valley-3d-overview.png` | 504,434 | `516dcef3ac79391da20da8cd81e35a1ea57f3e21b2e2440c19a597507f82e498` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/bounded-control-shadow/small-river-valley-3d-urban.png` | 248,406 | `791f40312e3d2442ae0eeb41ae93b15da696564991da9d8948762a86cb4993a7` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-plain/medium-flat-3d-edge.png` | 725,892 | `0ee87922630ab7dd6b4c624cb2124d55c4074219a51f2c9caea9ebdaed0b1ac4` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-plain/medium-flat-3d-low.png` | 699,075 | `1815cdcf8024e6e5436a991b2b1deed987bfd4683f920b898ce870abbbacea56` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-plain/medium-flat-3d-overview.png` | 802,880 | `419c838c2263a4078363fbc9237d4dda2fc09381bf0fae6d82bf294dc2c0fa35` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-plain/medium-flat-3d-urban.png` | 201,642 | `2a6534a8492361f7ead4fdbb3d73c64552737f705b24921521d2fc75eafc753e` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-plain/small-flat-3d-edge.png` | 699,783 | `88079d751af392e872ea93eeda373fefe11d217ba4e6f265f846e1c412cc7a92` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-plain/small-flat-3d-low.png` | 717,213 | `3984a2a931b8e9b92c6fe52f677e34aca6537e4e61f89fbdc93f65430b9450d5` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-plain/small-flat-3d-overview.png` | 558,274 | `c027c1e65067b2ad271ed6225a42a1cad4a0e51348183a03727b957df948afde` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-plain/small-flat-3d-urban.png` | 187,733 | `d87242048c97447782dba825b0679c7eb356ee3ba6582ba143dd10308bfda8b6` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-plain/small-river-valley-3d-edge.png` | 829,677 | `495e331301bb8638d6c34ae3320ee46bcd8a99f6a72745b03daeee2a4582a9aa` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-plain/small-river-valley-3d-low.png` | 794,904 | `e0ca083658be0a60f164ab4849f9efb2987739793b12559076050cf9d89a61b0` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-plain/small-river-valley-3d-overview.png` | 755,162 | `2a5b7cc48ef364a75cf4535ca2f661de0e2856442e8b4e6b54e2555d97261dcd` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-plain/small-river-valley-3d-urban.png` | 199,715 | `6c795dfe1c16e34642f8285bba86ce4a241a5e736773f9dcc5a5e35dfb21f2c9` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-shadow/medium-flat-3d-edge.png` | 736,501 | `79f20600cbff0ca53562242555cf41d667e29f0fbcb0497f470f7ada495fcb91` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-shadow/medium-flat-3d-low.png` | 706,077 | `68063cad4c65c9a50d33ba49a48db98840bd857e13f54df8e8a3b4cfc3385c8b` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-shadow/medium-flat-3d-overview.png` | 819,813 | `9f8367291308d50e6897cae849d577dbdf3bdc76e355c8ecb114d33546186adf` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-shadow/medium-flat-3d-urban.png` | 261,698 | `493ecda1326c91bb2e9a6cd02d2c9ce9b994f78879bd247ec36fc50e881d2406` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-shadow/small-flat-3d-edge.png` | 704,440 | `6e45df6bf5a42dd544e2477efeaf52256e97d676578107c2d523833c9bb90f70` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-shadow/small-flat-3d-low.png` | 718,496 | `9ee9855f5c560442cca2ba9e04e17e98baa0fcc9677f9128082d33fbdaeba3ff` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-shadow/small-flat-3d-overview.png` | 580,513 | `ad4a74f7d81987702a7740612056b58bb2fc59dd119a172374da3304c64a66cb` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-shadow/small-flat-3d-urban.png` | 246,082 | `26a4b4fdd322d966030a6224994f6d2302e0dca0824d47309fc22616da8750f7` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-shadow/small-river-valley-3d-edge.png` | 834,597 | `68165c9e131683e002d52e144885eb3a2846a760044c5a35f535276c13c0ffb9` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-shadow/small-river-valley-3d-low.png` | 796,640 | `4dbac7ea98541330bed69bb751687b06793fd56f7b5108a4017750959bca6e07` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-shadow/small-river-valley-3d-overview.png` | 791,370 | `4e3ce535cffc7f43a40fe821db81808b5cb81d361b911f02b1bc10de35145ad4` |
| `docs/analytics/raw/ce-tree-city-performance-20261029/images/native-shadow/small-river-valley-3d-urban.png` | 257,660 | `b535091aa7a5db1cfbb7329456ac3f2bf366789289fc8e4ae278b34e39ce0ab8` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/bounded-control-plain/medium-flat-3d-edge.png` | 384,529 | `652f959ac680ee3a17e3e09a293d33e3fa2a803a55044cd95d065261205714ca` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/bounded-control-plain/medium-flat-3d-low.png` | 378,477 | `40bc12a379ac1e00bd5dde1c7f5e7def7657793946ae1238ec3bdc8cd6c83bee` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/bounded-control-plain/medium-flat-3d-overview.png` | 463,213 | `9361bcb0f1b3377caaf81392c235bd627eda3a67825044db983d431815b49477` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/bounded-control-plain/medium-flat-3d-urban.png` | 178,169 | `0caa58f3dc4ec7c3f2be678333a28cd1517653cda0e1a13166aeca32793b7243` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/bounded-control-plain/small-flat-3d-edge.png` | 364,718 | `94eafe74f4c2ae371dbdbab2af5df341ba89decc26db055c70dc0117bd7462af` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/bounded-control-plain/small-flat-3d-low.png` | 284,229 | `6629c97b10835f719134a1775302fd248f29df91e4b4ccd7ed95e11d6f2bc975` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/bounded-control-plain/small-flat-3d-overview.png` | 329,127 | `5932f6840c305e007838ff626218f67c74591de725e310035028325fa392cee8` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/bounded-control-plain/small-flat-3d-urban.png` | 176,226 | `a1bf9d066820998ccf6e7798cca1c75256f03d3794c45e3a8c034c7b7252f839` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/bounded-control-plain/small-river-valley-3d-edge.png` | 444,165 | `dd96430e6c5ff7bf43d44d4458bc175994f7edc292e36be921c95d0e87d2d802` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/bounded-control-plain/small-river-valley-3d-low.png` | 411,595 | `a01ac4c3217efc780687c34f0ebe349ad0398f3085323ffefd03b00143b5ae25` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/bounded-control-plain/small-river-valley-3d-overview.png` | 478,791 | `8fc8ea4605ee0bbf53379fa8d43daf72793f3fcdcd93e4075af4d4482749a08a` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/bounded-control-plain/small-river-valley-3d-urban.png` | 190,536 | `05c8ac86763db8bdd966c5381f261f9b73649238af6817f5977eddec236ff2ca` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-plain/medium-flat-3d-edge.png` | 725,892 | `0ee87922630ab7dd6b4c624cb2124d55c4074219a51f2c9caea9ebdaed0b1ac4` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-plain/medium-flat-3d-low.png` | 699,075 | `1815cdcf8024e6e5436a991b2b1deed987bfd4683f920b898ce870abbbacea56` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-plain/medium-flat-3d-overview.png` | 802,880 | `419c838c2263a4078363fbc9237d4dda2fc09381bf0fae6d82bf294dc2c0fa35` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-plain/medium-flat-3d-urban.png` | 201,642 | `2a6534a8492361f7ead4fdbb3d73c64552737f705b24921521d2fc75eafc753e` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-plain/small-flat-3d-edge.png` | 699,783 | `88079d751af392e872ea93eeda373fefe11d217ba4e6f265f846e1c412cc7a92` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-plain/small-flat-3d-low.png` | 717,213 | `3984a2a931b8e9b92c6fe52f677e34aca6537e4e61f89fbdc93f65430b9450d5` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-plain/small-flat-3d-overview.png` | 558,274 | `c027c1e65067b2ad271ed6225a42a1cad4a0e51348183a03727b957df948afde` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-plain/small-flat-3d-urban.png` | 187,733 | `d87242048c97447782dba825b0679c7eb356ee3ba6582ba143dd10308bfda8b6` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-plain/small-river-valley-3d-edge.png` | 829,677 | `495e331301bb8638d6c34ae3320ee46bcd8a99f6a72745b03daeee2a4582a9aa` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-plain/small-river-valley-3d-low.png` | 794,904 | `e0ca083658be0a60f164ab4849f9efb2987739793b12559076050cf9d89a61b0` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-plain/small-river-valley-3d-overview.png` | 755,162 | `2a5b7cc48ef364a75cf4535ca2f661de0e2856442e8b4e6b54e2555d97261dcd` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-plain/small-river-valley-3d-urban.png` | 199,715 | `6c795dfe1c16e34642f8285bba86ce4a241a5e736773f9dcc5a5e35dfb21f2c9` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-shadow/medium-flat-3d-edge.png` | 731,259 | `2bd03a60d6977568d769bb47e2d810e26162477aafbb8a1d1f7ce2b801b23349` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-shadow/medium-flat-3d-low.png` | 706,077 | `68063cad4c65c9a50d33ba49a48db98840bd857e13f54df8e8a3b4cfc3385c8b` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-shadow/medium-flat-3d-overview.png` | 819,719 | `45f037371f702a733a72b15a2b6ccea6d1df513be98d7fc80ca570eadbfeb2c8` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-shadow/medium-flat-3d-urban.png` | 261,698 | `493ecda1326c91bb2e9a6cd02d2c9ce9b994f78879bd247ec36fc50e881d2406` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-shadow/small-flat-3d-edge.png` | 704,204 | `d25b6f49df03c3b8bde14aa52f4306d3c7f99429aabeab15b1126c87f2f5d313` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-shadow/small-flat-3d-low.png` | 720,166 | `f5c00969af60ed7b6d3166e40523fd55e8b1ddffae28203e4457eb5670277249` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-shadow/small-flat-3d-overview.png` | 580,211 | `c573ef19b52d9ca73294ae298b8fce4631c51689feba98ab036cdd547b0f95c6` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-shadow/small-flat-3d-urban.png` | 246,067 | `47a3f109c782cdedf686f7c490ecee11d10b52b2b26f7cb8cb7ada091e0dd5ff` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-shadow/small-river-valley-3d-edge.png` | 834,220 | `1f5f4cf7262260b613d9b9c68df17315c4dadeb75540bba6ca2394ff41f65f41` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-shadow/small-river-valley-3d-low.png` | 798,026 | `395d3f65ab66142f5434022aa730825ff6f053ac5615a9f7610e610e16711b51` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-shadow/small-river-valley-3d-overview.png` | 791,440 | `66ccb3ec5d84bac307c9373f95ca6823ebac67b6fee987d502ea3de6e676701a` |
| `docs/analytics/raw/ce-tree-city-performance-20261029-before/images/native-shadow/small-river-valley-3d-urban.png` | 257,660 | `b535091aa7a5db1cfbb7329456ac3f2bf366789289fc8e4ae278b34e39ce0ab8` |
