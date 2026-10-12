# 回転モード分離・予測2列表示・学習UI整理の検証（2026-10-12）

赤・青六角形は自動へ切り替えるたびに既存の角度算出を実行し、算出できない色は初期位置を使う。手動位置は初回だけ初期位置から始め、赤・青の回転位置を個別に保存する。切替だけで上書きせず、測定追加・削除・全件削除・画面切替・再読み込み・バックアップ移行でも保持する。回転ロックは手動操作だけを止める。紫六角形の動作は維持する。

LINK/TAB共通の予測エリアは2列とし、識別色付きの見出し、増減の矢印と説明、予測IPS、独立した0.2 IPS以内判定を表示する。現在IPSとの増減は丸め前の値を使う。欠測時はグレーの「予測なし」とし、矢印とIPSを消す。信頼度バッジ・注意文・保存済み予測の説明を維持する。

学習は「学習」内の「過去の実調整を学習」に統一し、リセット操作も同じ欄へ移動する。実調整チェックと、結果登録・巡航後入力・調整追加／編集・手動回転からの学習呼び出しを削除する。既存のモデル・補正・確定済みサンプルを保持し、旧保存データの学習待ち指定からも自動学習を再開しない。

`learning.js`・`distance-prior.js`・`link-ranking.js`・`chart.svg`は変更していない。保存形式には任意の手動初回フラグだけを追加し、旧形式の手動位置と元データを保持する。順位検証の固定角度は登録済み初期位置として設定し、従来の検証条件を維持する。

実行環境はWindows / Edge headless。専用一時プロファイルで実行し、通常の保存データを使用しない。320・375・390・430・1000px幅で列配置・文字の折り返し・重なり・はみ出しを確認し、375px幅の画像でも確認した。iPhone実機での操作は今回の検証に含まない。

実行コマンド:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./tests/run-browser-tests.ps1 -Tests all
```

最終一括実行は全28群・101,032チェックPASS（終了コード0）。途中で`dot-numbers`が一度UI保存状態の未取得で失敗したため、診断表示を追加し、単独再実行と最終一括実行の両方でPASSを確認した。

| テスト | チェック数 |
| --- | ---: |
| adjustment-lock | 498 |
| dot-numbers | 3,504 |
| forecast-candidates | 540 |
| forecast-compact | 93 |
| forecast-deletion | 583 |
| forecast-display | 218 |
| forecast-lifecycle | 54 |
| forecast-status | 133 |
| guide-direction | 2,780 |
| guide-edge | 21 |
| guide-numbers | 328 |
| guide-selection | 90 |
| historical-learning-only | 58 |
| initial-position | 32 |
| learning | 727 |
| link-direction-consistency | 72 |
| link-direction-geometry | 11,772 |
| link-direction-priority | 16 |
| link-hov-priority | 351 |
| link-maintenance | 71,611 |
| link-ranking-production | 1,185 |
| link-ranking-trial.test | 5,462 |
| minute-focus | 106 |
| rotation-continuity | 41 |
| rotation-modes | 129 |
| shared-amount | 366 |
| state | 69 |
| ui-refinement | 193 |

新規の回転テストはSVGのメッセージと親ページのポインタ操作の両方を確認する。最初の手動切替前に自動位置が初期位置から動いた場合、ロック中の測定追加・自動再計算、色別の欠測、旧形式のバックアップも含む。

新規の予測表示テストは、改善しても0.2超・悪化しても0.2以内、ゼロ、変化なし、同じ表示丸め値での増減、欠測時の古い表示消去を確認する。表示更新前後で予測・候補・学習・保存値が不変であること、実フォームで生成した予測と信頼度が再読み込みで保持されることも確認する。

学習UIテストは、LINK/TABそれぞれで旧版の学習待ち保存を再現し、通常の登録・後入力・回転から学習が増えないことを確認する。履歴の色別学習、重複学習防止、モデルが予測に利用できること、保存済み手動補正・サンプル・確認状態とバックアップの保持も検証する。`learning.js`内の学習計算や予測APIは変更していない。
