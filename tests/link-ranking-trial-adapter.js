/* 試験iframe限定の順位差替え。本番の学習・predict・resolveはそのまま使用する。 */
(() => {
  if (!globalThis.linkTrialMemoryStorage || parent === window || !parent.linkTrialHost) throw Error('Isolated trial required');
  const legacy = LinkRankingLegacy, production = selectLinkGuideCandidate, render = renderDirectionLines, forecast = updateAdjustmentForecast;
  // Historical single-stage experiment: keep its selector hook independent of
  // the new production two-stage integration, without replacing production ranking.
  const selectNumbers = selectGuideNumberCandidate;
  selectGuideNumberCandidate = function(candidates, selectBest) {
    return selectNumbers(candidates, selectBest === selectLinkGuideCandidate ? pool => selectBest(pool) : selectBest);
  };
  const drawForecast = renderAdjustmentForecast;
  const uncertaintyNotice = document.createElement('p');
  uncertaintyNotice.id = 'trialPredictionUncertainty';
  uncertaintyNotice.setAttribute('role', 'status');
  document.getElementById('forecastLearningNotice').after(uncertaintyNotice);
  renderAdjustmentForecast = function(...args) {
    const result = drawForecast(...args);
    uncertaintyNotice.hidden = currentChartPage !== 0 || !pitchAutoMode;
    const points = adjustmentForecast?.points ?? [];
    uncertaintyNotice.textContent = !points.length ? '試験環境：予測待ち'
      : points.some(p => p.source !== 'learned') || adjustmentForecast.waiting?.length
        ? '試験環境：予測不確実（学習不足・参考距離／予測欠測。0.2 IPS達成は未確認）'
        : '試験環境：学習予測（予測誤差・0.2 IPS境界の実機精度は未確認）';
    return result;
  };
  const policy = LinkRankingPolicy;
  let mode = parent.linkTrialHost.mode, rendering = false, evaluatedAmount = null, fullPool = [];
  const predictionTarget = () => mode === 'target20' ? .2 : policy.target;
  const measured = () => [dotSets.at(-1)?.red?.radius ?? null, dotSets.at(-1)?.blue?.radius ?? null];
  const actionKey = c => c ? `No.${c.blade} ${c.direction}` : null;
  function normalize(candidates) {
    const amountText = getSharedAdjustmentAmount(0);
    const action = BalanceLearning.adjustment(['1', 'LINK', amountText, 'UP']);
    if (!action) return [];
    const target = dotSets.at(-1);
    // 学習済み候補の探索量を表示中の量へ揃える。線・モデルは既存候補を使う。
    return candidates.filter(c => !c.amountText || c.amountText === amountText).map(original => {
      const action = { type: 'LINK', blade: original.blade, direction: original.direction,
        amount: BalanceLearning.adjustment([String(original.blade), 'LINK', amountText, original.direction]).amount };
      const predictions = ['red', 'blue'].flatMap(color => {
        if (!target?.[color]) return [];
        const start = getDotCoordinates(target[color]);
        const line = original.line ? color === 'red' ? original.line : original.blue
          : original.predictions.find(p => p.color === color);
        const guide = original.line ? line : line ? getPredictionGuideLine(line) : null;
        const prediction = learning.predict('LINK', color, action.blade, action.direction, action.amount, start);
        const estimate = BalanceDistancePrior.resolve(action, color, prediction, prediction ? [] : learning.inspect().samples, CHART_RADIUS);
        const unit = guide ? getGuideMovementUnit(guide) : null;
        const valid = estimate && Number.isFinite(estimate.distance) && estimate.distance >= 0
          && unit && Math.hypot(unit.x, unit.y) > 0;
        const position = valid ? { x: start.x + unit.x * estimate.distance, y: start.y + unit.y * estimate.distance } : null;
        const currentDistance = Math.hypot(start.x - CHART_CENTER_X, start.y - CHART_CENTER_Y) / CHART_RADIUS;
        const predictedDistance = position ? Math.hypot(position.x - CHART_CENTER_X, position.y - CHART_CENTER_Y) / CHART_RADIUS : null;
        return [{ color, start, position, currentDistance, predictedDistance,
          improvement: position ? currentDistance - predictedDistance : null, source: valid ? estimate.source : 'missing',
          uncertain: !valid || estimate.source !== 'learned' }];
      });
      const distances = predictions.map(p => p.predictedDistance ?? Infinity);
      return { ...original, original, amount: action.amount, amountText, predictions,
        maxCenterDistance: Math.max(...distances), distance: distances.reduce((sum, value) => sum + value, 0) };
    });
  }
  selectLinkGuideCandidate = function(candidates) {
    if (currentChartPage !== 0 || !pitchAutoMode) return production(candidates);
    const normalized = normalize(candidates);
    if (candidates.length >= (fullPool.length ? fullPool.length : 0)) fullPool = candidates;
    if (mode === 'legacy') return legacy(candidates);
    // 予測欠測時は旧候補を診断表示に残し、達成・推奨とは表示しない。
    return policy.select(normalized, ...measured(), predictionTarget())?.original ?? legacy(candidates);
  };
  function publish() {
    if (currentChartPage !== 0 || !pitchAutoMode) {
      parent.showLinkTrialComparison({ notice: '試験環境：TAB／手動は既存方式', rows: null }); return;
    }
    const pool = normalize(fullPool), [hov, cruise] = measured();
    const old = pool.length ? legacy(pool) : null, next = policy.select(pool, hov, cruise);
    const next20 = policy.select(pool, hov, cruise, .2);
    const selected = guideNumberChoices[guideCandidateIndex]?.candidate;
    const displayed = pool.find(c => c.original === selected) ?? pool.find(c => c.blade === selected?.blade && c.direction === selected?.direction);
    const actual = policy.assess(displayed, hov, cruise, predictionTarget());
    const rows = [ ['旧規則・同量終点', old], ['新規則・目標0.18／合格0.2', next, .18],
      ['新規則・目標0.2／合格0.2', next20, .2],
      [mode === 'legacy' ? '旧画面選択・表示量の終点' : '新画面選択', displayed],
      ['比較のみ：旧達成時・距離増加を制限',policy.selectComparison(pool,hov,cruise,'legacy-cap',old)],
      ['比較のみ：HOV未達時・両色非悪化',policy.selectComparison(pool,hov,cruise,'unmet-no-regression',old)],
      ['比較のみ：両方未達時・最大優先',policy.selectComparison(pool,hov,cruise,'unmet-minimax',old)],
      ['比較のみ：両達成時・合計優先',policy.selectComparison(pool,hov,cruise,'achieved-sum',old)],
      ['比較のみ：距離制限＋両色非悪化',policy.selectComparison(pool,hov,cruise,'combined-guard',old)] ]
      .map(([label, candidate, goal = predictionTarget()]) => ({ label, action: actionKey(candidate), assessment: policy.assess(candidate, hov, cruise, goal) }));
    const sources = displayed?.predictions.map(p => `${p.color === 'red' ? 'HOV' : '巡航'}:${p.source}`).join('／') ?? '予測なし';
    const notice = `試験環境・${mode === 'legacy' ? '旧' : '新'}方式／予測目標${predictionTarget()}・合格≤0.2／調整量${getSharedAdjustmentAmount(0)}：`
      + (actual.uncertain ? '予測不確実（暫定順位、達成未確認）' : actual.nominalGoalMet ? `学習予測上0.2合格・${predictionTarget()}目標${actual.nominalTargetMet ? '達成' : '未達'}（実機未確認）` : '0.2未合格（診断順位）')
      + (actual.nearBoundary ? '／0.2境界付近・予測誤差未検証' : '') + `／${sources}`;
    linkRankingTrial.report = { mode, predictionTarget:predictionTarget(), notice, rows, pool, selected: displayed, actual, rawSelected: selected };
    parent.showLinkTrialComparison({ mode, notice, rows });
  }
  renderDirectionLines = function(...args) {
    rendering = true; fullPool = [];
    try { return render(...args); }
    finally { rendering = false; evaluatedAmount = getSharedAdjustmentAmount(0); publish(); }
  };
  updateAdjustmentForecast = function(...args) {
    const result = forecast(...args);
    // pickerの仮選択は共有量を変えない。確定した共有量が変わった時だけ再順位付け。
    if (!rendering && currentChartPage === 0 && pitchAutoMode && evaluatedAmount !== getSharedAdjustmentAmount(0)) {
      if (mode !== 'legacy') renderDirectionLines();
      else { evaluatedAmount = getSharedAdjustmentAmount(0); publish(); }
    }
    return result;
  };
  globalThis.linkRankingTrial = {
    normalize, legacySelector: legacy, policy,
    setMode(value) {
      if (!['legacy', 'target', 'target20'].includes(value)) throw Error('Unknown ranking mode');
      mode = value;
      parent.linkTrialHost.mode = value;
      parent.document.getElementById('mode').value = value;
      renderDirectionLines();
    },
    get mode() { return mode; }, report: null
  };
  renderDirectionLines();
})();
