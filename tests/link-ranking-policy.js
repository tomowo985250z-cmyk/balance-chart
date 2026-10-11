/* 試験専用。学習・予測を行わず、渡された同量の終点だけを順位付けする。 */
(() => {
  const limit = .2, target = .18, epsilon = 1e-9; // epsilonは順位の同値比較専用。合格・目標の境界には使わない。
  const finite = value => Number.isFinite(value) && value >= 0;
  const endpoint = (candidate, color) => {
    const p = candidate?.predictions.find(item => item.color === color);
    return p && !p.fallbackLine && finite(p.predictedDistance) ? p.predictedDistance : null;
  };
  function validateTarget(value) {
    if (!finite(value) || value > limit) throw RangeError('Prediction target must be between 0 and 0.2 IPS');
  }
  function select(candidates, currentHov, currentCruise, predictionTarget = target) {
    validateTarget(predictionTarget);
    if (!finite(currentHov)) return null;
    const h = c => endpoint(c, 'red');
    const b = c => endpoint(c, 'blue') ?? Infinity;
    const known = candidates.filter(c => h(c) !== null);
    const safe = known.filter(c => h(c) <= limit);
    const both = finite(currentCruise) ? safe.filter(c => b(c) <= limit) : [];
    // 合格圏の優先を先に守る。HOVだけ0.18以内でも、両方0.2以内の候補を後回しにしない。
    const qualified = both.length ? both : safe.length ? safe : known;
    // 0.18は参考目標のみ。順位へ影響させない。
    const pool = qualified;
    const max = c => Math.max(h(c), b(c)), sum = c => h(c) + b(c);
    const fields = !finite(currentCruise) ? [h] : both.length ? [max, sum]
      : safe.length ? [max, sum, h] : [h, b];
    return [...pool].sort((a, b) => {
      for (const field of fields) {
        const x = field(a), y = field(b);
        if (x === y || (field !== h && safe.length && Math.abs(x - y) <= epsilon)) continue;
        return x < y ? -1 : 1;
      }
      return a.blade - b.blade || Number(a.direction === 'DOWN') - Number(b.direction === 'DOWN')
        || a.amount - b.amount;
    })[0] ?? null;
  }
  function assess(candidate, currentHov, currentCruise, predictionTarget = target) {
    validateTarget(predictionTarget);
    const hov = endpoint(candidate, 'red'), cruise = endpoint(candidate, 'blue');
    const measuredCruise = finite(currentCruise);
    const required = measuredCruise ? ['red', 'blue'] : ['red'];
    const uncertain = required.some(color => {
      const p = candidate?.predictions.find(item => item.color === color);
      return endpoint(candidate, color) === null || p.uncertain || p.source !== 'learned';
    });
    const nominalGoalMet = finite(currentHov) && hov !== null && hov <= limit
      && (!measuredCruise || (cruise !== null && cruise <= limit));
    const nominalTargetMet = finite(currentHov) && hov !== null && hov <= predictionTarget
      && (!measuredCruise || (cruise !== null && cruise <= predictionTarget));
    return { currentHov, currentCruise: currentCruise ?? null, hov, cruise, limit, target:predictionTarget,
      hovImprovement: hov === null || !finite(currentHov) ? null : currentHov - hov,
      cruiseImprovement: cruise === null || !measuredCruise ? null : currentCruise - cruise,
      maximum: hov === null ? null : measuredCruise ? cruise === null ? null : Math.max(hov, cruise) : hov,
      total: hov === null ? null : measuredCruise ? cruise === null ? null : hov + cruise : hov,
      nominalGoalMet, nominalTargetMet, uncertain, learnedGoalMet: nominalGoalMet && !uncertain,
      learnedTargetMet: nominalTargetMet && !uncertain,
      nominalHovWithin: hov !== null && hov <= limit,
      nominalCruiseWithin: !measuredCruise || cruise === null ? null : cruise <= limit,
      nominalHovTargetMet: hov !== null && hov <= predictionTarget,
      nominalCruiseTargetMet: !measuredCruise || cruise === null ? null : cruise <= predictionTarget,
      nearTargetBoundary: required.some(color => {
        const d = endpoint(candidate, color);
        return d !== null && Math.abs(d - predictionTarget) <= 1e-6 + epsilon;
      }),
      nearBoundary: required.some(color => {
        const d = endpoint(candidate, color);
        return d !== null && Math.abs(d - limit) <= 1e-6 + epsilon;
      }) };
  }
  // 比較専用。selectの優先順は変更せず、試験画面の比較行と分析からのみ呼ぶ。
  function selectComparison(candidates, currentHov, currentCruise, variant, legacyCandidate = null) {
    const original = select(candidates, currentHov, currentCruise);
    const variants = ['pareto', 'legacy-cap', 'unmet-no-regression', 'unmet-minimax', 'achieved-sum', 'combined-guard'];
    if (!variants.includes(variant)) throw Error('Unknown comparison variant');
    if (!original || !finite(currentCruise)) return original;
    if (variant === 'combined-guard') return selectComparison(candidates,currentHov,currentCruise,
      assess(legacyCandidate,currentHov,currentCruise).nominalGoalMet?'legacy-cap':'unmet-no-regression',legacyCandidate);
    const h = c => endpoint(c, 'red'), b = c => endpoint(c, 'blue');
    const complete = candidates.filter(c => h(c) !== null && b(c) !== null);
    const safe = candidates.filter(c => h(c) !== null && h(c) <= limit);
    const both = complete.filter(c => h(c) <= limit && b(c) <= limit);
    const max = c => Math.max(h(c), b(c)), sum = c => h(c) + b(c);
    const ranked = (pool, fields) => [...pool].sort((a, b) => {
      for (const field of fields) {
        const difference = field(a) - field(b);
        if (Math.abs(difference) > epsilon) return difference;
      }
      return a.blade - b.blade || Number(a.direction === 'DOWN') - Number(b.direction === 'DOWN') || a.amount - b.amount;
    })[0] ?? original;
    if (variant === 'pareto') {
      const pool = candidates.filter(c => !complete.includes(c) || !complete.some(other =>
        h(other) <= h(c) && b(other) <= b(c) && (h(other) < h(c) - epsilon || b(other) < b(c) - epsilon)));
      return select(pool, currentHov, currentCruise);
    }
    if (variant === 'legacy-cap' && assess(legacyCandidate, currentHov, currentCruise).nominalGoalMet) {
      // 両達成済みの旧候補が保証する最大・合計を上限にする。最大最小化は一部緩和する。
      const pool = both.filter(c => max(c) <= max(legacyCandidate) + epsilon && sum(c) <= sum(legacyCandidate) + epsilon);
      return select(pool, currentHov, currentCruise) ?? original;
    }
    if (variant === 'unmet-no-regression' && !both.length && !safe.length) {
      // HOV到達候補もない場合だけ、両色とも現在値以下の候補から最大→合計。
      const pool = complete.filter(c => h(c) <= currentHov + epsilon && b(c) <= currentCruise + epsilon);
      return ranked(pool, [max, sum, h]);
    }
    if (variant === 'unmet-minimax' && !both.length) return ranked(complete, [max, sum, h]);
    if (variant === 'achieved-sum' && both.length) return ranked(both, [sum, max]);
    return original;
  }
  globalThis.LinkRankingPolicy = Object.freeze({ select, selectComparison, endpoint, assess, limit, target, epsilon });
})();
