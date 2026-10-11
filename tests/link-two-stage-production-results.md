# LINK 2段階順位の本番反映・回帰結果

2026-10-12。検証済み `improvement-aware` 方式を採用。採用前比較基準は `874964a` の順位実装を固定した `link-ranking-before-two-stage.js`。試験用実装は通常の `index.html` から読み込まない。

## 本番動作

同じ共有調整量でNo.1～3のUP/DOWNをそれぞれ比較し、各No.から1候補を選ぶ。その3候補だけを順位付けし、順位付け中に方向を選び直さない。

両予測終点が厳密に0.2 IPS以内の候補を最優先。HOVが現在0.2以内なら既知の維持予測を優先し、圏内候補同士のHOV中心距離・中心接近量を順位にも同順位比較にも使わない。方向選択では巡航の既知改善、欠測だが中心向きの幾何学的可能性、既知同距離、既知悪化、改善方向の根拠なしを区別する。既知終点同士は行き過ぎを含む終点距離を比較する。

No.順位では両達成予測・HOV維持を守り、巡航の中心向きを優先。同じ方向区分では既知終点、次に幾何学的可能性を比較する。HOV圏外では従来の回復評価を各No.の方向選択とNo.順位の両段階に使う。巡航未測定・終点欠測は両達成予測に含めず、幾何学的最接近点を予測終点に置換しない。

本番変更は `link-ranking.js`、`app.js` の順位統合・幾何情報追加、`index.html` のキャッシュ更新のみ。既存UI、予測点、ガイド線、調整量、学習・距離推定・保存処理を維持。`learning.js`、`distance-prior.js`、`app-state.js`、`state-storage.js`、`style.css`、`chart.svg` は差分なし。

## 比較確認

独立した試験方式との3候補の方向・全順位一致を、HOV圏内の合成2,592条件と7条件群×9量の63条件で確認。実画面でも圏内/圏外、学習済み/フォールバック、巡航あり/未測定、量変更、No.切替、手動入力、確定予測保持、学習・記録不変性を検証した。

合成2,592条件の両達成予測は421件を維持し、利用可能な両達成・HOV維持予測の喪失は0件。最終1位の巡航欠測は486→144件、既知巡航終点が既存より悪化する条件は2件。3方向全体では欠測2,328→2,670件となる制約は残る。詳細は[採用前比較](link-two-stage-results.md)と[再実行JSON](link-maintenance-results.json)に記録。

画像近似・1/8の方向選択はNo.1 DOWN、No.2 UP、No.3 UP。順位はNo.3 UP→No.2 UP→No.1 DOWN。No.1 DOWNはHOV維持予測と巡航の幾何学的改善可能性で残り、巡航終点欠測のため両達成予測・合格確定とはしない。実測精度の検証は今回の回帰テストに含まない。

## 全回帰

専用一時Edgeプロファイルで全21群、**99,340チェックPASS**。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./tests/run-browser-tests.ps1 -Tests all
```

| 群 | チェック |
|---|---:|
| dot-numbers | 3,504 |
| forecast-candidates | 532 |
| forecast-display | 218 |
| forecast-lifecycle | 54 |
| guide-direction | 2,780 |
| guide-edge | 21 |
| guide-numbers | 328 |
| guide-selection | 90 |
| initial-position | 32 |
| learning | 725 |
| link-direction-consistency | 72 |
| link-direction-geometry | 11,772 |
| link-direction-priority | 16 |
| link-hov-priority | 351 |
| link-maintenance | 71,611 |
| link-ranking-production | 1,185 |
| link-ranking-trial.test | 5,462 |
| minute-focus | 106 |
| rotation-continuity | 41 |
| shared-amount | 371 |
| state | 69 |

学習テストは現行のTAB単調補正、確認済み実測距離、共有量、No.表示、保存先、参考推定と保存済み表示に合わせた。起動復元は同時に2つの書き込み画面を開かず再読み込みで確認し、既存の複数タブ保存保護との競合を避けた。歴史的な0.15・有向線の合成ケースは維持される手動評価に限定し、新しい自動順位は独立実装と実画面の専用テストで検証する。

dot-numbersは実際のラベル衝突を作って修復を検証し、初期位置登録はヘッドレス環境のclose通知を明示した。これらと学習テスト冒頭の旧TAB期待値の失敗は採用前 `874964a` でも再現しており、本番の学習・距離・配置・保存コードを変更せずテスト条件を修正した。
