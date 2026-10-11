/* Frozen 2026-10-11 production baseline, test only. */
/* LINK自動順位。0.2合格予測を保護し、未達候補はガイドの中心接近を優先する。 */
(() => {
  const limit = .2, target = .18, epsilon = 1e-9;
  const finite = value => Number.isFinite(value) && value >= 0;
  const endpoint = (candidate, color) => {
    const p = candidate?.predictions?.find(item => item.color === color);
    return p && !p.fallbackLine && finite(p.predictedDistance) ? p.predictedDistance : null;
  };
  const directionTier = (candidate, cruiseMeasured) => {
    const projection = color => candidate.predictions?.find(p => p.color === color)?.inwardProjection;
    const hov = projection('red'), cruise = projection('blue');
    // 欠測は中心向き／遠ざかる向きに置換しない。接線は中心向きに含めない。
    if (!Number.isFinite(hov)) return 4;
    if (!cruiseMeasured) return hov > 0 ? 0 : 1;
    if (!Number.isFinite(cruise)) return 4;
    return hov > 0 ? cruise > 0 ? 0 : 1 : cruise > 0 ? 2 : 3;
  };
  function select(candidates, currentHov, currentCruise) {
    if (!finite(currentHov)) return null;
    const h = c => endpoint(c, 'red'), b = c => endpoint(c, 'blue') ?? Infinity;
    const known = candidates.filter(c => h(c) !== null);
    // 合格境界には丸め・許容差を使わない。0.18は順位に使わない。
    const safe = known.filter(c => h(c) <= limit);
    const both = finite(currentCruise) ? safe.filter(c => b(c) <= limit) : [];
    let pool = both.length ? both : safe.length ? safe : known;
    if (!safe.length) {
      // 合格候補がない場合だけ、両中心向き→HOV中心向き→巡航中心向き。
      // 同じ方向区分の中でのみ従来の予測終点比較を行う。
      const tier = Math.min(...candidates.map(c => directionTier(c, finite(currentCruise))));
      const directed = candidates.filter(c => directionTier(c, finite(currentCruise)) === tier);
      const directedKnown = directed.filter(c => h(c) !== null);
      if (!directedKnown.length) return [...directed].sort((a, b) => a.blade - b.blade
        || Number(a.direction === 'DOWN') - Number(b.direction === 'DOWN') || a.amount - b.amount)[0] ?? null;
      pool = directedKnown;
    }
    const max = c => Math.max(h(c), b(c)), sum = c => h(c) + b(c);
    const fields = !finite(currentCruise) ? [h] : both.length ? [max, sum]
      : safe.length ? [max, sum, h] : [h, b];
    return [...pool].sort((a, b) => {
      for (const field of fields) {
        const x = field(a), y = field(b);
        // 同じ方向区分内ではHOV終点を厳密に比較し、同値のとき巡航で比較。
        // 巡航欠測はInfinityで最後に扱い、中心へ近づく予測として扱わない。
        if (x === y || (field !== h && safe.length && Math.abs(x - y) <= epsilon)) continue;
        return x < y ? -1 : 1;
      }
      return a.blade - b.blade || Number(a.direction === 'DOWN') - Number(b.direction === 'DOWN')
        || a.amount - b.amount;
    })[0] ?? null;
  }
  function assess(candidate, currentHov, currentCruise) {
    const hov = endpoint(candidate, 'red'), cruise = endpoint(candidate, 'blue');
    const measuredCruise = finite(currentCruise);
    const required = measuredCruise ? ['red', 'blue'] : ['red'];
    const uncertain = required.some(color => {
      const p = candidate?.predictions?.find(item => item.color === color);
      return endpoint(candidate, color) === null || p.uncertain || p.source !== 'learned';
    });
    return { hov, cruise, limit, target, uncertain,
      nominalGoalMet: finite(currentHov) && hov !== null && hov <= limit
        && (!measuredCruise || (cruise !== null && cruise <= limit)),
      nominalTargetMet: finite(currentHov) && hov !== null && hov <= target
        && (!measuredCruise || (cruise !== null && cruise <= target)) };
  }
  globalThis.LinkRankingBeforeTwoStage = Object.freeze({ select, assess, endpoint, limit, target, epsilon });
})();
