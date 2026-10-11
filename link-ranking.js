/* LINK自動順位。No.ごとに方向を選択し、その候補だけを順位付けする。 */
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
  // HOV圏外の回復評価は従来基準を保持する。
  function selectRecovery(candidates, currentHov, currentCruise) {
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
  // IPSの前向き半直線と0.2円の関係。指定量の予測終点とは別の情報。
  function geometry(r, vector) {
    if (!r || !vector || ![r.x,r.y,vector.x,vector.y].every(Number.isFinite)) return null;
    const length = Math.hypot(vector.x,vector.y);
    if (!length) return null;
    const unit = {x:vector.x/length,y:vector.y/length}, radius = Math.hypot(r.x,r.y);
    const projection = -(r.x*unit.x+r.y*unit.y), travel = Math.max(0,projection);
    const minimumRadius = Math.hypot(r.x+travel*unit.x,r.y+travel*unit.y);
    const lineMinimum = Math.abs(r.x*unit.y-r.y*unit.x);
    let interval = null;
    if (lineMinimum <= limit) {
      const half = Math.sqrt((limit-lineMinimum)*(limit+lineMinimum));
      const lower = Math.max(0,projection-half), upper = projection+half;
      if (upper >= lower) interval = [lower,upper];
    }
    return {inwardProjection:projection,
      inwardCosine:radius?projection/radius:null,
      angleToCenter:radius?Math.acos(Math.max(-1,Math.min(1,projection/radius)))*180/Math.PI:null,
      minimumRadius,interval,positiveTravelPossible:!!interval&&interval[1]>0};
  }
  function assess(candidate, currentHov, currentCruise) {
    const hov = endpoint(candidate, 'red'), cruise = endpoint(candidate, 'blue');
    const measuredCruise = finite(currentCruise);
    const required = measuredCruise ? ['red', 'blue'] : ['red'];
    const uncertain = required.some(color => {
      const p = candidate?.predictions?.find(item => item.color === color);
      return endpoint(candidate, color) === null || p.uncertain || p.source !== 'learned';
    });
    const p = color => candidate?.predictions?.find(item => item.color === color);
    const g = color => p(color)?.geometry ?? candidate?.geometries?.[color] ?? null;
    const blueGeometry = g('blue');
    const projection = blueGeometry?.inwardProjection ?? p('blue')?.inwardProjection;
    const cruiseInward = measuredCruise && Number.isFinite(projection) ? projection > 0 : null;
    const cruiseEvidence = !measuredCruise ? 'unmeasured' : cruise !== null
      ? cruise < currentCruise ? 'predicted-improvement' : cruise === currentCruise ? 'predicted-equal' : 'predicted-worsening'
      : cruiseInward === true ? 'geometry-only-improvement-possible' : 'unknown-no-inward-evidence';
    return { hov, cruise, limit, target, uncertain, cruiseInward, cruiseEvidence,
      hovWithin:hov !== null && hov <= limit,
      hovGeometricallyPossible:!!g('red')?.positiveTravelPossible,
      cruiseGeometric02Possible:!!blueGeometry?.positiveTravelPossible,
      cruiseInwardCosine:blueGeometry?.inwardCosine ?? null,
      nominalBothWithin:finite(currentHov) && measuredCruise && hov !== null && hov <= limit
        && cruise !== null && cruise <= limit,
      realWorldValidated:false, confirmedPass:false,
      nominalGoalMet: finite(currentHov) && hov !== null && hov <= limit
        && (!measuredCruise || (cruise !== null && cruise <= limit)),
      nominalTargetMet: finite(currentHov) && hov !== null && hov <= target
        && (!measuredCruise || (cruise !== null && cruise <= target)) };
  }
  const maintenanceTier = a => a.hovWithin ? 0 : a.hov === null && a.hovGeometricallyPossible ? 1 : 2;
  const evidenceTier = a => ({'predicted-improvement':0,'geometry-only-improvement-possible':1,
    'predicted-equal':2,'predicted-worsening':3,'unknown-no-inward-evidence':4,unmeasured:4})[a.cruiseEvidence];
  const stable = (a,b) => a.amount-b.amount || a.blade-b.blade
    || Number(a.direction==='DOWN')-Number(b.direction==='DOWN');
  function compare(a,b,stage,currentCruise) {
    const joint = Number(b.assessment.nominalBothWithin)-Number(a.assessment.nominalBothWithin);
    if (joint) return joint;
    const safe = maintenanceTier(a.assessment)-maintenanceTier(b.assessment);
    if (safe) return safe;
    const x = a.assessment, y = b.assessment;
    if (finite(currentCruise)) {
      if (stage === 'direction') {
        const evidence = evidenceTier(x)-evidenceTier(y);
        if (evidence) return evidence;
        if (x.cruise !== null && y.cruise !== null && x.cruise !== y.cruise) return x.cruise < y.cruise ? -1 : 1;
        if (x.cruiseEvidence === 'geometry-only-improvement-possible') {
          const reach = Number(y.cruiseGeometric02Possible)-Number(x.cruiseGeometric02Possible);
          if (reach) return reach;
          if (x.cruiseInwardCosine !== y.cruiseInwardCosine) return y.cruiseInwardCosine-x.cruiseInwardCosine;
        }
      } else {
        const direction = value => value.cruiseInward === true ? 0 : value.cruiseInward === false ? 1 : 2;
        const tier = direction(x)-direction(y);
        if (tier) return tier;
        // 同じ中心向き区分では、指定量による行き過ぎを含む既知終点を先に評価。
        if ((x.cruise === null) !== (y.cruise === null)) return x.cruise === null ? 1 : -1;
        if (x.cruise !== y.cruise) return x.cruise < y.cruise ? -1 : 1;
        if (x.cruiseInward === true) {
          const reach = Number(y.cruiseGeometric02Possible)-Number(x.cruiseGeometric02Possible);
          if (reach) return reach;
          if (x.cruiseInwardCosine !== y.cruiseInwardCosine) return y.cruiseInwardCosine-x.cruiseInwardCosine;
        }
      }
    }
    // HOV圏内の中心距離・接近量はタイブレークにも使わない。
    return stable(a.candidate,b.candidate);
  }
  function rank(candidates,currentHov,currentCruise) {
    if (!finite(currentHov)) return {directions:[],ranked:[]};
    const directions = [1,2,3].flatMap(blade => {
      const pair = candidates.filter(c => c.blade === blade);
      if (!pair.length) return [];
      const chosen = currentHov > limit ? selectRecovery(pair,currentHov,currentCruise)
        : pair.map(candidate => ({candidate,assessment:assess(candidate,currentHov,currentCruise)}))
          .sort((a,b) => compare(a,b,'direction',currentCruise))[0]?.candidate;
      return chosen ? [chosen] : [];
    });
    let ranked;
    if (currentHov > limit) {
      let pool = [...directions]; ranked = [];
      while (pool.length) {
        const candidate = selectRecovery(pool,currentHov,currentCruise);
        if (!candidate) break;
        ranked.push(candidate); pool = pool.filter(c => c !== candidate);
      }
    } else ranked = directions.map(candidate => ({candidate,assessment:assess(candidate,currentHov,currentCruise)}))
      .sort((a,b) => compare(a,b,'number',currentCruise)).map(row => row.candidate);
    return {directions,ranked};
  }
  const select = (candidates,currentHov,currentCruise) => rank(candidates,currentHov,currentCruise).ranked[0] ?? null;
  globalThis.BalanceLinkRanking = Object.freeze({ select, rank, geometry, assess, endpoint, limit, target, epsilon });
})();
