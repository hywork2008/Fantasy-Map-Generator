# 生の観測出力の所在とハッシュ（2026-10-23）

`docs/analytics/raw/`の観測JSONは数MB〜数十MBの全量出力なので、Gitで管理しない（`.gitignore`）。各記録mdのコマンドで固定入力`docs/analytics/inputs/salt-s0-aligned-20261023/`から再生成できる。コミットするのは記録md・派生比較JSON（概ね2 MB以下）・固定入力と、下表のハッシュである。再生成した出力はSHA-256で照合する。ソースハッシュは各JSONの`sourceHashes`に含まれるため、照合は同じコミットで行う。

| ファイル（docs/analytics/raw/） | バイト数 | SHA-256 |
| --- | ---: | --- |
| economy-e0-diagnostics-province-101-20261023.json | 1423088 | `1bf3e4fdc68fccf73fd2761ecc3aab6af18988c639ee111f43655749c9c547f1` |
| economy-e0-diagnostics-world-102-20261023.json | 38591109 | `5930c72079450113e9af892d50fd9184431169e2132bd00698a88389a37a8ac7` |
| economy-e0-food-boundaries-comparison-20261023.json | 5996211 | `9cb2f38d4bc15b59c70c456d153849fdc39c871a03cf5d8855f17c7acbb62e28` |
| economy-e0-food-boundaries-province-101-20261023.json | 2096928 | `4a4bbc7040963e3b287e4750ab922143ad004d0517f67b5ccec9b4c916405d64` |
| economy-e0-food-boundaries-world-102-20261023.json | 49491035 | `f0c5b94e7aaf5bbb5698c54d3999ed66e8c9a95e14d21d3d144674dcf7793213` |
| economy-e0-food-transition-world-102-20261023.json | 2476085 | `aabe24db39d3ce628bbe26b744bd55a94abb21b47cd0c67d2c0d5dba868e8d45` |
| economy-e0-fresh-processing-comparison-20261023.json | 5996528 | `c2fb630df11d28198e00fc00373c4d8fd79b5f0fac32d3c31272449cb725f857` |
| economy-e0-fresh-processing-province-101-20261023.json | 2098043 | `5ed00aee4c41df2367fe62f183db3f60305a4aadd30697a4d69ca3dc0bd1a4f7` |
| economy-e0-fresh-processing-world-102-20261023.json | 49492773 | `5cf1549ee252a63f846ffb071f8887bccfcb0f0a210b136459bee4c3a592fbc3` |
| economy-e0-planner-home-comparison-20261023.json | 6259185 | `fb0f1668212ffd79a2e60ce4389950ca5dcd113d61aaaf6d83a13a8acc2e8abb` |
| economy-e0-planner-home-province-101-20261023.json | 2480461 | `368b81ed0160420ee3d71ffd627e1a48bb2634beabee8247ad9b36155b1308c3` |
| economy-e0-planner-home-world-102-20261023.json | 55781674 | `83589b9abc1fb0b543595f9419890459f88c7e8c7f69e5a6aecf393dccf6249f` |
| economy-e0-province-101-20261023.json | 1143903 | `238efa5b2c43310cb8135ca8ca76d64a2b9ede44e388d65e46ae4e091d1ca755` |
| economy-e0-world-102-20261023.json | 13528438 | `7d74619a53e2d76ef2685f9370ec30784b5ccaf068c9f3612e75fe729ae01f12` |
| salt-s0-aligned-province-101-20261023.json | 154820 | `2b76a129116c2bf911242ccc6e04e5f054fe3a0e65047e0299ca432e8b3e876f` |
| salt-s0-aligned-world-102-20261023.json | 3813584 | `326bfabe343293a1ca07abaaf2c7fb42f7d0c0bf55e0cd9347a8b0f1d4fd691b` |
| salt-s0-province-101-20261023.json | 2264779 | `08e3003f94dc0fac0498c3d5d3e9e97db7941707a6e4b7bdaab6f204818dda28` |
| salt-s0-world-102-20261023.json | 3261214 | `f144315b3d5c6b9127aab3677b7cd2c772227d30550e37d33a4da8c0017a2872` |
| salt-s1-province-101-20261023.json | 211182 | `c8c6b242afb010ffd27f6fb275b01dbeb52ec660e5e4271a77b3a45e29d570cf` |
| salt-s1-world-102-20261023.json | 4133234 | `41d9bc3f52607528dc04d9e70a94c8c5d79bd9a59a327b217b8aa256e7f050a4` |
| salt-s2-province-101-20261023.json | 319333 | `48bb313030ed7554d516947e9cad7f835ceba9c8ee762817768fa420a737d41c` |
| salt-s2-world-102-20261023.json | 7481127 | `f06ec0c9c1ffae12c04b06982ae8fc437ecfd2f01a840837bfdf6c5fc816a0d2` |
| salt-s3-province-101-20261023.json | 396388 | `29a9a06e134155d87fb3e40e663f9411a2e47601f233d571ded65de9a77dac8d` |
| salt-s3-world-102-20261023.json | 9568026 | `60ede63b9fb31a0e9b1354db176f114726b0eb1e2c1f63fbac8ac3b852db0c0b` |
| salt-s5-province-101-20261023.json | 517933 | `b91464176e84969f1e67b7ec0adee72578dc150c25d3da9b0ab5dd848e31cecd` |
| salt-s5-world-102-20261023.json | 12536078 | `855e6985daf0cf1b9690e9bd0d3d5cc465a1fd61ee0d3b0b55fb0ee090a8d796` |
