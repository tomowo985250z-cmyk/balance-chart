/* 元のHTMLを利用するが、本番の保存領域は起動前にメモリStorageへ置換する。 */
(() => {
  const frame = document.getElementById('app'), mode = document.getElementById('mode');
  const requestedMode = new URLSearchParams(location.search).get('mode');
  if (['legacy','target20'].includes(requestedMode)) mode.value = requestedMode;
  globalThis.linkTrialHost = { mode: mode.value, ready: false };
  const root = new URL('../', location.href).href;
  const request = new XMLHttpRequest();
  request.open('GET', new URL('index.html', root));
  request.onload = () => {
    if ((request.status && request.status !== 200) || !request.responseText.includes('src="app.js')) {
      document.getElementById('status').textContent = '起動失敗：元のHTMLを読み取れません'; return;
    }
    const bootstrap = `<base href="${root}"><script src="tests/link-ranking-trial-storage.js"><\/script>`;
    // Storage分離が失敗・読込不能なら本体を実行しないよう、元のscriptを一旦不活性化する。
    const inert = request.responseText.replace(/<script src="([^"]+)"\s*><\/script>/g,
      '<script type="application/x-link-trial" data-trial-src="$1"><\/script>');
    const loader = '<script src="tests/link-ranking-trial-loader.js"><\/script>';
    frame.srcdoc = inert.replace(/<head[^>]*>/i, '$&' + bootstrap).replace(/<\/body>/i, loader + '</body>');
  };
  request.onerror = () => { document.getElementById('status').textContent = '起動失敗：HTTPサーバーからtests/link-ranking-trial.htmlを開いてください'; };
  mode.addEventListener('change', () => {
    linkTrialHost.mode = mode.value;
    frame.contentWindow.linkRankingTrial?.setMode(mode.value);
  });
  globalThis.showLinkTrialComparison = report => {
    linkTrialHost.ready = true;
    linkTrialHost.report = report;
    document.getElementById('status').textContent = report.notice;
    const container = document.getElementById('comparison');
    container.replaceChildren();
    if (!report.rows) return;
    const table = document.createElement('table');
    const tr = document.createElement('tr');
    ['比較対象（同じ調整量）', 'No.／方向', 'HOV終点', '巡航終点', '最大', '合計', '判定'].forEach(label => {
      const th = document.createElement('th'); th.textContent = label; tr.append(th);
    });
    table.append(tr);
    // 境界付近は丸め表示でも合否が紛れないよう、元の数値を見せる。計算結果は変えない。
    const number = value => value === null || value === undefined ? '未予測'
      : [.18,.2].some(boundary=>Math.abs(value-boundary)<=1e-6) ? String(value) : value.toFixed(6);
    for (const row of report.rows) {
      const tr = document.createElement('tr'), a = row.assessment;
      [row.label, row.action ?? '未評価', number(a.hov), number(a.cruise), number(a.maximum), number(a.total),
        `${a.nominalGoalMet ? '0.2予測合格' : '0.2未合格'}／${a.target}目標${a.nominalTargetMet ? '達成' : '未達'}${a.uncertain ? '・予測不確実' : '・学習予測'}${a.nearBoundary ? '・合格境界付近' : ''}${a.nearTargetBoundary ? '・目標境界付近' : ''}`].forEach(value => {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      });
      table.append(tr);
    }
    container.append(table);
  };
  request.send();
})();
