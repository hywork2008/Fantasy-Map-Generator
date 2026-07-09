# 距離とかかる労力と儲けと

`Trade Opportunities`ダイアログに`Buy at`と`Sell at`という項目があり、これらは都市を指している。
この2点間の距離を計算し、ランダムで出されたであろう、労力に合わない交易を是正する。
距離に見合った儲けがあれば遠距離でも良いが、基本的には近場でやり取り出来るものが、遠い距離を運ばれて同じ価格というようなものが多い(はず)。

`Relations history`も最初は国と国をいくつも跨いだ敵対関係があったが、ありえない戦争は起こり得ないように修正した。

`AGENTS.md`の`4-Layer Rule`では一部例外はあるが、基本的には`Renderer Layer`だけがSVGを描いて良い。
なのでベジェ曲線を使った正確なroutesの距離計算は裏方のレイヤーでは出来ない。
そのため都市から都市と、その間に張り巡らされたroutesを辿る、Nodes間の直線距離で近似値を求める。
`approximate`でソースコード内を検索するといくつか例が出るので、2つのBurgs間のノードを直線的に辿って距離を出す。

src/extensions/economy/ui/dialogs/MarketTradeOpportunitiesDialog.tsx
実装済み
