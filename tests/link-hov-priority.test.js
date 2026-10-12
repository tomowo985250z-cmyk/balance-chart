/* 比較専用。index.htmlからは読み込まない。専用プロファイルで ?isolated=1 を指定する。 */
(async () => {
  const output = document.getElementById('results');
  const LIMIT = 0.2, EPSILON = 1e-9;
  let checks = 0;
  const comparisons = [];
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  const near = (actual, expected) => Math.abs(actual - expected) < 1e-8;
  const key = candidate => candidate ? `${candidate.blade} ${candidate.direction} ${candidate.amount}` : null;
  const finiteDistance = value => Number.isFinite(value) && value >= 0;
  const endpoint = (candidate, color) => {
    const prediction = candidate.predictions.find(item => item.color === color);
    // 巡航待ち時の円周交点（約1 IPS）は調整量に対する予測ではない。
    return prediction && !prediction.fallbackLine && finiteDistance(prediction.predictedDistance)
      ? prediction.predictedDistance : null;
  };
  const predictionQuality = (candidate, color) => {
    const prediction = candidate?.predictions.find(item => item.color === color);
    if (!prediction || !finiteDistance(prediction.predictedDistance)) return 'missing';
    if (prediction.fallbackLine || prediction.uncertain
      || (prediction.source && prediction.source !== 'learned')) return 'uncertain';
    return prediction.model || prediction.source === 'learned' ? 'learned' : 'controlled-fixture';
  };

  function assess(candidate, measuredHov, measuredCruise) {
    const hov = endpoint(candidate, 'red'), cruise = endpoint(candidate, 'blue');
    const hovQuality = predictionQuality(candidate, 'red'), cruiseQuality = predictionQuality(candidate, 'blue');
    const hovImprovement = hov === null ? null : measuredHov - hov;
    const cruiseImprovement = cruise === null || !finiteDistance(measuredCruise) ? null : measuredCruise - cruise;
    const nominalWithin = hov === null ? null : hov <= LIMIT;
    const uncertainHov = hovQuality === 'uncertain' || hovQuality === 'missing';
    const uncertainCruise = cruiseQuality === 'uncertain' || cruiseQuality === 'missing' || cruiseImprovement === null;
    return { action:key(candidate), currentHov:measuredHov, predictedHov:hov, hovImprovement,
      currentCruise:measuredCruise ?? null, predictedCruise:cruise, cruiseImprovement,
      hovQuality, cruiseQuality, nominalHovWithin:nominalWithin,
      nominalCruiseWithin:cruise===null||!finiteDistance(measuredCruise)?null:cruise<=LIMIT,
      maxCenterDistance:hov===null||cruise===null||!finiteDistance(measuredCruise)?null:Math.max(hov,cruise),
      totalCenterDistance:hov===null||cruise===null||!finiteDistance(measuredCruise)?null:hov+cruise,
      joint:uncertainHov ? 'prediction-uncertain'
        : !finiteDistance(measuredCruise) ? 'Cruise-unmeasured'
        : !nominalWithin ? 'HOV-exceeds-limit'
        : uncertainCruise ? 'prediction-uncertain'
        : cruiseImprovement > EPSILON ? 'HOV-maintained-and-Cruise-improved'
        : cruiseImprovement < -EPSILON ? 'HOV-maintained-Cruise-worsened' : 'HOV-maintained-Cruise-unchanged' };
  }

  // 比較専用の今回の目的：巡航未測定ならHOV、両方測定済みなら両終点の圏内達成を最優先。
  // 達成同士は最大→合計。両方未達ならHOV圏内維持→HOV改善を継続し、最大→合計で比較。
  // towardCenter / hovPathDistance では除外しない。測定欠測と予測欠測は別に扱う。
  function selectHovFirst(candidates, measuredHov, measuredCruise = .33) {
    if (!finiteDistance(measuredHov)) return null;
    const known = candidates.filter(candidate => endpoint(candidate, 'red') !== null);
    const cruiseMeasured = finiteDistance(measuredCruise);
    const hov = candidate => endpoint(candidate, 'red');
    const cruise = candidate => endpoint(candidate, 'blue') ?? Infinity;
    const safe = known.filter(candidate => endpoint(candidate, 'red') <= LIMIT);
    const bothSafe = cruiseMeasured ? safe.filter(candidate => cruise(candidate) <= LIMIT) : [];
    const pool = bothSafe.length ? bothSafe : safe.length ? safe : known;
    const maximum = candidate => Math.max(hov(candidate),cruise(candidate));
    const total = candidate => hov(candidate)+cruise(candidate);
    const improvement = candidate => measuredHov - hov(candidate);
    const fields = !cruiseMeasured ? [hov]
      : bothSafe.length ? [maximum,total]
      : safe.length ? [maximum,total,hov] : [hov,cruise];
    return [...pool].sort((a, b) => {
      for (const field of fields) {
        const first = field(a), second = field(b);
        if (first === second || (field !== hov && safe.length && Math.abs(first - second) <= EPSILON)) continue;
        return first < second ? -1 : 1;
      }
      return a.blade - b.blade || Number(a.direction === 'DOWN') - Number(b.direction === 'DOWN')
        || a.amount - b.amount;
    })[0] ?? null;
  }

  function rankByNumber(candidates, select) {
    let pool = [...candidates];
    const ranked = [];
    while (pool.length) {
      const selected = select(pool);
      if (!selected) break;
      ranked.push(selected);
      pool = pool.filter(candidate => candidate.blade !== selected.blade);
    }
    return ranked;
  }

  function outcome(candidates, measuredHov, measuredCruise = .33) {
    const ranked = rankByNumber(candidates, pool => selectHovFirst(pool, measuredHov, measuredCruise));
    const first = ranked[0];
    const cruiseMeasured=finiteDistance(measuredCruise);
    const uncertainHov = first && predictionQuality(first, 'red') === 'uncertain';
    const uncertainCruise=first&&cruiseMeasured&&['uncertain','missing'].includes(predictionQuality(first,'blue'));
    const goalMet=Boolean(first&&endpoint(first,'red')<=LIMIT
      &&(!cruiseMeasured||(endpoint(first,'blue')!==null&&endpoint(first,'blue')<=LIMIT)));
    const nominalStatus = !first ? 'HOV-prediction-pending'
      : goalMet&&cruiseMeasured ? 'both-within-limit'
      : endpoint(first, 'red') <= LIMIT ? 'HOV-within-limit'
      : measuredHov <= LIMIT ? 'cannot-maintain-HOV'
      : endpoint(first, 'red') < measuredHov - EPSILON ? 'HOV-improving-outside-limit' : 'no-HOV-improvement';
    return {
      phase: measuredHov > LIMIT ? 'HOV-recovery' : 'HOV-maintenance',
      objective:cruiseMeasured?'both-within-0.2':'HOV-within-0.2',
      status:uncertainHov ? 'HOV-prediction-uncertain' : uncertainCruise ? 'Cruise-prediction-uncertain' : nominalStatus,
      nominalStatus, nominalGoalMet:goalMet,
      // 目的未達または不確実なら順位は比較用。達成を確認した優先候補とはしない。
      preferred:!goalMet || uncertainHov || uncertainCruise ? null : first,
      ranked,
      pending: candidates.filter(candidate => endpoint(candidate, 'red') === null)
    };
  }

  const summarize = candidates => candidates.map(candidate => ({
    action: key(candidate), hov: endpoint(candidate, 'red'), cruise: endpoint(candidate, 'blue'),
    maximum:endpoint(candidate,'red')===null||endpoint(candidate,'blue')===null?null:Math.max(endpoint(candidate,'red'),endpoint(candidate,'blue')),
    total:endpoint(candidate,'red')===null||endpoint(candidate,'blue')===null?null:endpoint(candidate,'red')+endpoint(candidate,'blue')
  }));
  const candidate = (blade, direction, amount, hov, cruise, towardCenter = true) => {
    const predictions = [{ color: 'red', predictedDistance: hov }];
    if (cruise !== undefined) predictions.push({ color: 'blue', predictedDistance: cruise });
    const distances = predictions.map(item => item.predictedDistance).filter(finiteDistance);
    return { blade, direction, amount, predictions, towardCenter,
      hovPathDistance: 0, cruisePathDistance: 0,
      maxCenterDistance: Math.max(...distances), distance: distances.reduce((sum, value) => sum + value, 0) };
  };

  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use an isolated browser profile');
    const frame = document.createElement('iframe');
    const loaded = new Promise(resolve => { frame.onload = resolve; });
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    frame.contentWindow.LinkRankingLegacy = LinkRankingLegacy;
    assert(run('typeof selectLinkGuideCandidate === "function"'), 'production selector loaded');
    run('pitchAutoMode=true');
    const selectorSource = run('selectLinkGuideCandidate.toString()');
    const snapshot = () => run(`JSON.stringify({learning:learning.inspect(), measurements:dotSets,
      storage:{...localStorage}, predictions:[1,2,3].flatMap(blade=>['UP','DOWN'].flatMap(direction=>
        ['red','blue'].map(color=>learning.predict('LINK',color,blade,direction,.25,{x:500,y:600}))))})`);
    const legacyRank = candidates => {
      // 本番関数を差し替えず、同じ候補を現行自動順位へ渡す。
      frame.contentWindow.hovComparisonPool = candidates;
      return run(`(()=>{let pool=[...hovComparisonPool];const ranked=[];
        while(pool.length){const selected=LinkRankingLegacy(pool);if(!selected)break;
          ranked.push(selected);pool=pool.filter(candidate=>candidate.blade!==selected.blade);}
        return ranked;})()`);
    };
    const compare = (label, measuredHov, candidates, expectedLegacy, expectedProposed, status, measuredCruise = .33) => {
      const before = JSON.stringify(candidates), state = snapshot();
      const legacy = legacyRank(candidates), proposed = outcome(candidates, measuredHov, measuredCruise);
      assert(key(LinkRankingPolicy.select(candidates,measuredHov,measuredCruise))===key(proposed.ranked[0]),
        label + ': trial policy agrees with independent comparison reference');
      assert(key(legacy[0]) === expectedLegacy, label + ': existing first candidate');
      assert(key(proposed.ranked[0]) === expectedProposed, label + ': proposed first candidate');
      assert(proposed.status === status, label + ': explicit HOV outcome');
      assert(new Set(proposed.ranked.map(item => item.blade)).size === proposed.ranked.length, label + ': one candidate per No');
      assert(JSON.stringify(candidates) === before, label + ': input predictions unchanged');
      assert(snapshot() === state, label + ': measurements, learning, storage and predictions unchanged');
      comparisons.push({label, measuredHov, measuredCruise, objective:proposed.objective,basis:'same endpoint candidates',
        existing:summarize(legacy), proposed:summarize(proposed.ranked), status:proposed.status,
        preferred:key(proposed.preferred),nominalGoalMet:proposed.nominalGoalMet,
        impacts:candidates.map(item=>assess(item,measuredHov,measuredCruise)),
        pending:proposed.pending.length});
      return proposed;
    };

    compare('over-limit/safe UP beats Cruise direction', .32, [
      candidate(1,'UP',.25,.1981,.4147,false), candidate(2,'DOWN',.25,.2194,.2350),
      candidate(3,'UP',.25,.3849,.1619,false)
    ], '2 DOWN 0.25', '1 UP 0.25', 'HOV-within-limit');
    compare('over-limit/no safe endpoint ranks HOV improvement, not ray passage', .5, [
      candidate(1,'UP',.25,.25,.8,false), candidate(2,'DOWN',.25,.35,.1)
    ], '2 DOWN 0.25', '1 UP 0.25', 'HOV-improving-outside-limit');
    compare('predicted 0.2 inclusive/0.200001 outside', .4, [
      candidate(1,'UP',.25,.2,.6,false), candidate(2,'DOWN',.25,.200001,.01)
    ], '2 DOWN 0.25', '1 UP 0.25', 'HOV-within-limit');
    compare('within-limit/preserve HOV before Cruise', .19, [
      candidate(1,'UP',.25,.21,.01), candidate(2,'DOWN',.25,.19,.3)
    ], '1 UP 0.25', '2 DOWN 0.25', 'HOV-within-limit');
    const boundaryCandidates = [candidate(1,'UP',.25,.1,.3), candidate(2,'DOWN',.25,.19,.1)];
    for (const measured of [.199999,.2,.200001]) {
      const result = compare('measured boundary/' + measured, measured, boundaryCandidates,
        '2 DOWN 0.25', '2 DOWN 0.25', 'both-within-limit');
      assert(result.phase === (measured > .2 ? 'HOV-recovery' : 'HOV-maintenance'), 'measured threshold is exactly 0.2');
    }
    const cannotMaintain = compare('within-limit/no preserving endpoint reports failure', .19, [
      candidate(1,'UP',.25,.21,.5), candidate(2,'DOWN',.25,.25,.01)
    ], '2 DOWN 0.25', '1 UP 0.25', 'cannot-maintain-HOV');
    assert(cannotMaintain.preferred===null, 'no safe endpoint: diagnostic ranking is not a preferred adjustment');

    for (const measuredHov of [0,.1,.19,.2]) {
      const candidates = [candidate(1,'UP',.25,.2,.25),candidate(2,'DOWN',.25,.200001,.05),
        candidate(3,'UP',.25,.18,.20,measuredHov>.18)];
      const result=compare('within-limit/maintenance and Cruise improvement/'+measuredHov, measuredHov, candidates,
        measuredHov>.18?'3 UP 0.25':'2 DOWN 0.25','3 UP 0.25','both-within-limit');
      const impact=assess(result.preferred,measuredHov,.33);
      assert(impact.joint==='HOV-maintained-and-Cruise-improved', 'inside current HOV: both objectives achieved');
      assert(near(impact.hovImprovement,measuredHov-.18)&&near(impact.cruiseImprovement,.13), 'signed improvements use current value minus endpoint');
      assert(result.ranked.findIndex(item=>endpoint(item,'red')>.2)>
        result.ranked.findIndex(item=>endpoint(item,'red')<=.2), 'outside endpoint cannot outrank preserving candidate');
      assert(key(selectHovFirst([...candidates].reverse(),measuredHov))==='3 UP 0.25', 'maintenance does not depend on input order');
    }
    const cruiseWorse=[candidate(1,'UP',.25,.17,.36),candidate(2,'DOWN',.25,.19,.40)];
    const noJoint=compare('within-limit/HOV maintained but every Cruise endpoint worsens',.19,cruiseWorse,
      '1 UP 0.25','1 UP 0.25','HOV-within-limit');
    assert(noJoint.preferred===null&&assess(noJoint.ranked[0],.19,.33).joint==='HOV-maintained-Cruise-worsened', 'HOV maintenance alone cannot claim goal achievement');
    assert(assess(candidate(1,'UP',.25,.19,.33),.19,.33).joint==='HOV-maintained-Cruise-unchanged', 'unchanged Cruise is not an improvement');

    const uncertainEstimate=candidate(1,'UP',.25,.18,.20);
    uncertainEstimate.predictions.forEach(item=>item.source='prior');
    const uncertainResult=compare('within-limit/unlearned nominally safe estimate is uncertain',.19,[uncertainEstimate],
      '1 UP 0.25','1 UP 0.25','HOV-prediction-uncertain');
    assert(uncertainResult.preferred===null&&uncertainResult.nominalStatus==='both-within-limit', 'uncertain estimate remains tentative despite nominally safe endpoints');
    assert(assess(uncertainEstimate,.19,.33).joint==='prediction-uncertain', 'estimated Cruise improvement cannot prove joint success');

    const uncertainCruise=candidate(1,'UP',.25,.18,.20);
    uncertainCruise.predictions[1].source='reference-estimate';
    compare('within-limit/HOV known but Cruise estimate uncertain',.19,[uncertainCruise],
      '1 UP 0.25','1 UP 0.25','Cruise-prediction-uncertain');
    assert(assess(uncertainCruise,.19,.33).joint==='prediction-uncertain', 'partial learning cannot confirm Cruise effect');
    compare('both achieved/maximum distance before Cruise alone', .32, [
      candidate(1,'UP',.25,.18,.08), candidate(2,'DOWN',.25,.19,.04)
    ], '1 UP 0.25', '1 UP 0.25', 'both-within-limit');
    compare('equal HOV improvement/Cruise tie break', .4, [
      candidate(1,'UP',.25,.25,.8), candidate(2,'DOWN',.25,.25,.5)
    ], '2 DOWN 0.25', '2 DOWN 0.25', 'HOV-improving-outside-limit');

    // 同じ中心通過線でHOV 0.4から0.25/0.5/0.8 IPS移動。全候補の線最接近値は0。
    const overshoot = [[.25,.25,.8],[.5,.5,.9],[.75,.8,.02]].map(([amount,travel,cruise]) =>
      candidate(1,'UP',amount,Math.abs(.4-travel),cruise,cruise<.33));
    const overshootResult = compare('overshoot/evaluate endpoint at actual amount', .4, overshoot,
      '1 UP 0.75', '1 UP 0.25', 'HOV-within-limit');
    assert(near(endpoint(overshootResult.ranked[0],'red'),.15), 'overshoot: safe endpoint 0.15 selected');
    assert(overshoot.every(item=>item.hovPathDistance===0), 'overshoot: identical center-passing rays do not prove safe endpoints');

    const cruiseWaiting = candidate(1,'UP',.25,.19,1);
    cruiseWaiting.predictions[1].fallbackLine = {base:{x:400,y:600},end:{x:397,y:280}};
    const waiting = compare('Cruise pending/HOV can still qualify', .32,
      [cruiseWaiting,candidate(2,'DOWN',.25,.21,.1)],
      '2 DOWN 0.25', '1 UP 0.25', 'Cruise-prediction-uncertain');
    assert(endpoint(waiting.ranked[0],'blue') === null, 'Cruise circle intersection is unknown, not a 1 IPS endpoint');
    compare('HOV-only/no safe candidate', .35, [candidate(1,'UP',.25,.22),candidate(2,'DOWN',.25,.25)],
      '1 UP 0.25', '1 UP 0.25', 'HOV-improving-outside-limit',null);
    compare('HOV prediction missing/exclude from confirmed ranking', .32, [
      candidate(1,'UP',.25,null,.01),candidate(2,'DOWN',.25,.25,.1)
    ], '1 UP 0.25', '2 DOWN 0.25', 'HOV-improving-outside-limit');
    compare('all HOV predictions missing/pending', .32, [candidate(1,'UP',.25,null,.01)],
      '1 UP 0.25', null, 'HOV-prediction-pending');
    compare('all endpoints worsen/no false improvement', .32, [
      candidate(1,'UP',.25,.34,.8),candidate(2,'DOWN',.25,.35,.01)
    ], '2 DOWN 0.25', '1 UP 0.25', 'no-HOV-improvement');
    const tied = [candidate(2,'DOWN',.25,.18,.1),candidate(1,'DOWN',.25,.18,.1),
      candidate(1,'UP',.5,.18,.1),candidate(1,'UP',.25,.18,.1)];
    compare('deterministic No/direction/amount tie', .32, tied,
      '1 UP 0.25', '1 UP 0.25', 'both-within-limit');
    assert(key(selectHovFirst([...tied].reverse(),.32)) === '1 UP 0.25', 'input order does not change tied selection');
    assert(outcome([], .32).status === 'HOV-prediction-pending', 'empty pool remains pending');

    const hovOnly=compare('objective/Cruise unmeasured prioritizes HOV arrival',.32,[
      candidate(1,'UP',.25,.21,undefined),candidate(2,'DOWN',.25,.19,undefined)
    ],'2 DOWN 0.25','2 DOWN 0.25','HOV-within-limit',null);
    assert(hovOnly.objective==='HOV-within-0.2'&&hovOnly.nominalGoalMet&&hovOnly.preferred!==null,
      'unmeasured Cruise is not a missing prerequisite for HOV arrival');
    assert(assess(hovOnly.preferred,.32,null).joint==='Cruise-unmeasured', 'unmeasured Cruise has its own assessment instead of uncertain prediction');
    compare('objective/unmeasured Cruise ignores any unrelated Cruise estimate',.32,[
      candidate(1,'UP',.25,.19,.01),candidate(2,'DOWN',.25,.10,.8)
    ],'1 UP 0.25','2 DOWN 0.25','HOV-within-limit',null);

    const achieved=compare('objective/both achieved outranks HOV-only achieved',.1,[
      candidate(1,'UP',.25,.01,.21),candidate(2,'DOWN',.25,.19,.19,false)
    ],'1 UP 0.25','2 DOWN 0.25','both-within-limit');
    assert(achieved.objective==='both-within-0.2'&&achieved.nominalGoalMet, 'both measurements require both endpoint limits');
    compare('objective/maximum before total among both achieved',.1,[
      candidate(1,'UP',.25,.18,.01),candidate(2,'DOWN',.25,.15,.15,false),candidate(3,'UP',.25,.19,.05)
    ],'1 UP 0.25','2 DOWN 0.25','both-within-limit');
    const sumTie=compare('objective/total breaks equal maximum',.05,[
      candidate(1,'UP',.25,.18,.17),candidate(2,'DOWN',.25,.10,.18,false),candidate(3,'UP',.25,.18,.18)
    ],'1 UP 0.25','2 DOWN 0.25','both-within-limit');
    assert(JSON.stringify(sumTie.ranked.map(item=>item.blade))==='[2,1,3]', 'all No ranks follow maximum then total');

    // HOVは0.10→0.18の外向き、巡航は0.35→0.12の内向き。実際の移動線で向きを確認。
    const outwardSafe=candidate(1,'UP',.25,.18,.12,false);
    const inwardAlternative=candidate(2,'DOWN',.25,.19,.19);
    for(const item of [outwardSafe,inwardAlternative]) item.predictions.forEach(prediction=>{
      const isHov=prediction.color==='red';
      prediction.start={x:397+(isHov?.10:.35)*240,y:520};
      prediction.position={x:397+(isHov&&item===inwardAlternative?-.19:prediction.predictedDistance)*240,y:520};
      prediction.currentDistance=isHov?.10:.35;
    });
    frame.contentWindow.outwardSafeCheck=outwardSafe;
    frame.contentWindow.inwardAlternativeCheck=inwardAlternative;
    assert(run('!guideApproachesCenter(getPredictionGuideLine(outwardSafeCheck.predictions[0]))'), 'HOV movement is actually outward');
    assert(run('inwardAlternativeCheck.predictions.every(p=>guideApproachesCenter(getPredictionGuideLine(p)))'), 'alternative actually moves both colors inward');
    const outwardResult=compare('objective/outward HOV with safe endpoint remains eligible',.10,[outwardSafe,inwardAlternative],
      '2 DOWN 0.25','1 UP 0.25','both-within-limit',.35);
    assert(outwardResult.preferred===outwardSafe&&near(assess(outwardSafe,.10,.35).hovImprovement,-.08),
      'outward HOV is allowed by safe endpoint, with negative improvement reported');
    compare('objective/both endpoint boundaries are inclusive',.2,[
      candidate(1,'UP',.25,.2,.2,false),candidate(2,'DOWN',.25,.19,.200001)
    ],'2 DOWN 0.25','1 UP 0.25','both-within-limit',.2);

    const noBoth=compare('objective/unmet both goal preserves HOV before balancing',.19,[
      candidate(1,'UP',.25,.19,.25),candidate(2,'DOWN',.25,.22,.10)
    ],'2 DOWN 0.25','1 UP 0.25','HOV-within-limit');
    assert(!noBoth.nominalGoalMet&&noBoth.preferred===null, 'Cruise above limit is explicit goal failure, not both achieved');
    const neither=compare('objective/unmet HOV goal uses improvement then maximum and total',.32,[
      candidate(1,'UP',.25,.25,.70,false),candidate(2,'DOWN',.25,.28,.21),candidate(3,'UP',.25,.35,.05)
    ],'2 DOWN 0.25','1 UP 0.25','HOV-improving-outside-limit');
    assert(JSON.stringify(neither.ranked.map(item=>item.blade))==='[1,2,3]'&&neither.preferred===null,
      'unmet ranks are diagnostic and follow HOV improvement');
    assert(waiting.preferred===null&&!waiting.nominalGoalMet, 'measured Cruise with no prediction differs from unmeasured Cruise');

    const tentativeBoth=candidate(1,'UP',.25,.18,.10,false);
    tentativeBoth.predictions.forEach(item=>item.source='prior');
    const uncertainBoth=compare('objective/nominal both achieved remains uncertain without learning',.1,[
      tentativeBoth,candidate(2,'DOWN',.25,.19,.21)
    ],'2 DOWN 0.25','1 UP 0.25','HOV-prediction-uncertain');
    assert(uncertainBoth.nominalGoalMet&&uncertainBoth.preferred===null, 'nominal joint target is not confirmed by estimated endpoints');
    compare('objective/HOV-only overshoot uses actual amount endpoint',.3,[
      candidate(1,'UP',.25,.15,undefined),candidate(1,'UP',1,.4,undefined)
    ],'1 UP 0.25','1 UP 0.25','HOV-within-limit',null);
    compare('objective/both target rejects overshoot beyond HOV limit',.1,[
      candidate(1,'UP',.25,.12,.18,false),candidate(1,'UP',.5,.19,.08,false),candidate(1,'UP',.75,.25,.01)
    ],'1 UP 0.75','1 UP 0.25','both-within-limit');

    // 実アプリの未学習候補と1/4表示予測。順位用の連続最適位置と混同しない。
    for (const measuredHov of [.32,.19]) {
      run(`learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
        selectedAdjustmentTarget=null;currentChartPage=0;guideCandidateIndex=0;pitchAutoMode=true;
        memoValues.splice(0,4,'1','LINK','1/4','UP');
        dotSets.push({learningId:newLearningId(),red:{radius:${measuredHov},angle:${measuredHov===.32?100:112.5},color:'red',clock:'test'},
          blue:{radius:.33,angle:165,color:'blue',clock:'5:30'},adjustments:[]});
        initialChartRotations[0]={hovAngle:-41,cruiseAngle:-60};applyChartRotation(-41,-60);renderDots();
        window.hovCurrentCandidates=[1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>{
          const line=getDirectionLine(dotSets.at(-1).red,'red',null,blade,direction);
          const blue=getDirectionLine(dotSets.at(-1).blue,'blue',null,blade,direction);
          const distances=getGuideDistances(line,blue,getLatestPitchDistanceRatio()??{red:1,blue:2});
          return {blade,direction,amount:0,line,blue,predictions:[
            {color:'red',predictedDistance:distances.redDistance,source:'geometric-fallback'},
            {color:'blue',predictedDistance:distances.blueDistance,source:'geometric-fallback'}],
            towardCenter:[line,blue].every(guideApproachesCenter),
            hovPathDistance:getGuidePathDistance(line),cruisePathDistance:getGuidePathDistance(blue),...distances};
        }));
        window.hovAmountCandidates=hovCurrentCandidates.map(candidate=>{
          const action={type:'LINK',blade:candidate.blade,direction:candidate.direction,amount:.25};
          const predictions=['red','blue'].map(color=>{
            const line=color==='red'?candidate.line:candidate.blue;
            const estimate=BalanceDistancePrior.resolve(action,color,null,learning.inspect().samples,CHART_RADIUS);
            const predictedDistance=estimate?Math.hypot(line.base.x-397+line.unit.x*estimate.distance,
              line.base.y-520+line.unit.y*estimate.distance)/240:null;
            return {color,predictedDistance,source:estimate?.source??'missing'};
          });
          const distances=predictions.map(item=>item.predictedDistance).filter(Number.isFinite);
          return {...candidate,amount:.25,predictions,maxCenterDistance:Math.max(...distances),
            distance:distances.reduce((sum,value)=>sum+value,0)};
        });`);
      assert(run('guidePredictionDebug.fallback && getLearnedRotation("LINK","red")===null'), 'no learned HOV uses real fallback');
      const state = snapshot();
      const current = legacyRank(run('hovCurrentCandidates'));
      assert(current.every(item=>predictionQuality(item,'red')==='uncertain'&&predictionQuality(item,'blue')==='uncertain'),
        'continuous fallback optimum is uncertain for both colors');
      const amountCandidates = run('hovAmountCandidates');
      const proposed = outcome(amountCandidates,measuredHov);
      const actionKey = candidate => `${candidate.blade} ${candidate.direction}`;
      const productionActions=run('guideNumberChoices.map(choice=>choice.candidate)').map(actionKey);
      assert(JSON.stringify(proposed.ranked.slice(0,2).map(actionKey)) === JSON.stringify(productionActions.slice(0,2)),
        'production hybrid preserves the historical HOV-qualified first two Nos');
      assert(productionActions[2]===(measuredHov===.19?'3 UP':'3 DOWN'),
        'production hybrid uses direction for unqualified No.3; endpoint-only comparison stays historical');
      assert(key(current[0]) === (measuredHov===.32?'2 DOWN 0':'3 UP 0'), 'actual fallback first No');
      assert(key(proposed.ranked[0]) === (measuredHov===.32?'1 UP 0.25':'2 DOWN 0.25'), 'amount-aware proposed first No');
      assert(near(endpoint(proposed.ranked[0],'red'),measuredHov===.32?.19814216841281437:.08520596921567822), 'real distance-prior endpoint reproduced');
      assert(proposed.status==='HOV-prediction-uncertain'&&proposed.preferred===null, 'real unlearned prior never establishes HOV maintenance');
      assert(assess(proposed.ranked[0],measuredHov,.33).joint==='prediction-uncertain', 'real fallback joint objective remains uncertain');
      assert(amountCandidates.filter(item=>item.direction==='DOWN'&&item.blade!==2).every(item=>endpoint(item,'blue')===null),
        'unsupported DOWN Cruise distances remain missing');
      // 同じ量の終点候補でも比較し、順位差と評価座標の差を切り分ける。
      const sameAmount = legacyRank(amountCandidates);
      comparisons.push({label:'real fallback/'+measuredHov,measuredHov,
        existingBasis:'continuous optimum, default HOV:Cruise travel 1:2',
        proposedBasis:'actual 1/4 amount, existing distance prior; estimated, not learned',
        existing:summarize(current),existingAtSameAmount:summarize(sameAmount),
        proposed:summarize(proposed.ranked),status:proposed.status,nominalStatus:proposed.nominalStatus,
        preferred:key(proposed.preferred),
        impacts:amountCandidates.map(item=>assess(item,measuredHov,.33))});
      if (measuredHov===.19) {
        const currentAction=amountCandidates.find(item=>item.blade===current[0].blade&&item.direction===current[0].direction);
        const currentImpact=assess(currentAction,.19,.33), proposedImpact=assess(proposed.ranked[0],.19,.33);
        assert(near(currentImpact.predictedHov,.24679626151947473)&&currentImpact.hovImprovement<0, 'real fallback: selected No has an outside 1/4 endpoint despite safe current HOV');
        assert(proposedImpact.nominalHovWithin&&proposedImpact.cruiseImprovement>0, 'real fallback: alternative nominally maintains HOV and improves Cruise');
      }
      assert(snapshot() === state, 'fallback comparison leaves app data and predictions unchanged');
    }

    // 実際の学習エンジン：1区間では不足、3区間ではHOVのみ／両色学習済み。
    for (const mode of ['one-sample','HOV-only-learned','both-learned']) {
      run(`learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
        selectedAdjustmentTarget=null;currentChartPage=0;guideCandidateIndex=0;pitchAutoMode=true;
        initialChartRotations[0]=null;applyChartRotation(0,0);
        const makeHovTestDot=(x,y,color)=>({color,clock:'test',radius:Math.hypot(x-397,y-520)/240,
          angle:Math.atan2(x-397,520-y)*180/Math.PI});
        const count='${mode}'==='one-sample'?2:4;
        for(let i=0;i<count;i++){
          if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
          dotSets.push({learningId:newLearningId(),red:makeHovTestDot(597+(count-1-i)*80,620+(count-1-i)*46.188,'red'),
            blue:'${mode}'==='HOV-only-learned'?undefined:makeHovTestDot(527+(count-1-i)*46,670+(count-1-i)*38.6,'blue'),
            adjustments:i<count-1?[['1','LINK','1','UP']]:[]});
          learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
        }
        if('${mode}'==='HOV-only-learned')dotSets.at(-1).blue=makeHovTestDot(527,670,'blue');
        renderDots();`);
      if (mode==='one-sample') {
        assert(run('guidePredictionDebug.fallback && getLearnedRotation("LINK","red")===null'), 'one sample cannot masquerade as learned HOV');
        const probe=run(`(()=>{const predictions=['red','blue'].map(color=>{
          const dot={radius:color==='red'?.19:.33,angle:color==='red'?112.5:165};
          const line=getDirectionLine(dot,color,null,1,'UP');
          const prediction=learning.predict('LINK',color,1,'UP',.25,line.base);
          const estimate=BalanceDistancePrior.resolve({type:'LINK',blade:1,direction:'UP',amount:.25},color,prediction,learning.inspect().samples,240);
          return {color,source:estimate?.source??'missing',predictedDistance:estimate?Math.hypot(
            line.base.x-397+line.unit.x*estimate.distance,line.base.y-520+line.unit.y*estimate.distance)/240:null};
        });return {blade:1,direction:'UP',amount:.25,predictions};})()`);
        const probeOutcome=outcome([probe],.19), probeImpact=assess(probe,.19,.33);
        assert(probeOutcome.status==='HOV-prediction-uncertain'&&probeOutcome.preferred===null, 'one sample: prior endpoint is tentative, not a preserving priority');
        assert(probeImpact.hovQuality==='uncertain'&&probeImpact.cruiseQuality==='uncertain'&&probeImpact.joint==='prediction-uncertain', 'one sample: both effects explicitly uncertain');
        comparisons.push({label:'real learning/one-sample',fallback:true,learnedHov:false,status:probeOutcome.status,impact:probeImpact});
        continue;
      }
      assert(run('!guidePredictionDebug.fallback && guidePredictionDebug.candidates.length>0'), mode + ': real learned candidates generated');
      const state=snapshot(), candidates=run('guidePredictionDebug.candidates');
      const measuredHov=run('dotSets.at(-1).red.radius');
      const proposed=outcome(candidates,measuredHov), current=legacyRank(candidates);
      assert(run(`(()=>{const {candidates,selected}=guidePredictionDebug;
        return selected===BalanceLinkRanking.select(getLinkRankingCandidates(candidates),dotSets.at(-1).red.radius,dotSets.at(-1).blue.radius)?.original;})()`),
        mode + ': production uses normalized new priority');
      assert(proposed.ranked.length===3, mode + ': three unique Nos evaluated');
      const safe=candidates.filter(item=>endpoint(item,'red')!==null&&endpoint(item,'red')<=LIMIT);
      assert(safe.length ? endpoint(proposed.ranked[0],'red')<=LIMIT
        : candidates.every(item=>endpoint(proposed.ranked[0],'red')<=endpoint(item,'red')+EPSILON), mode + ': HOV prerequisite or largest improvement');
      assert(candidates.every(item=>mode==='HOV-only-learned'
        ? Boolean(item.predictions[1].fallbackLine)&&endpoint(item,'blue')===null
        : !item.predictions[1].fallbackLine&&endpoint(item,'blue')!==null), mode + ': learned and pending Cruise kept distinct');
      assert(snapshot()===state, mode + ': learned samples, storage and prediction outputs unchanged');
      comparisons.push({label:'real learning/'+mode,measuredHov,basis:'same real learned endpoint candidates',
        existing:summarize(current),proposed:summarize(proposed.ranked),status:proposed.status});

      // 評価対象だけを別の圏内現在値へ置く。学習履歴を書き換えてモデルを再学習しない。
      run(`window.hovWithinEvaluation={learningId:'comparison-within-limit',
        red:{radius:.19,angle:112.5,color:'red'},blue:{radius:.33,angle:165,color:'blue'}};
        getLearnedGuideLines(hovWithinEvaluation);`);
      const insideCandidates=run('guidePredictionDebug.candidates');
      const insideResult=outcome(insideCandidates,.19), insideExisting=legacyRank(insideCandidates);
      const insideImpact=assess(insideResult.ranked[0],.19,.33);
      assert(insideImpact.nominalHovWithin, mode+': learned HOV maintenance prerequisite');
      assert(insideCandidates.every(item=>near(item.predictions[0].currentDistance,.19)
        &&near(item.predictions[0].improvement,.19-endpoint(item,'red'))), mode+': current HOV and improvement match actual learned endpoints');
      if (mode==='both-learned') {
        assert(insideResult.preferred!==null&&insideResult.nominalGoalMet&&insideResult.status==='both-within-limit', 'real learned endpoints achieve both limits');
        assert(insideImpact.joint==='HOV-maintained-and-Cruise-improved', 'real learned model achieves HOV maintenance and Cruise improvement together');
        assert(insideCandidates.some(item=>endpoint(item,'red')<=LIMIT&&endpoint(item,'blue')<=LIMIT), 'real learned candidate with both endpoints within 0.2 exists');
        const achieved=insideCandidates.filter(item=>endpoint(item,'red')<=LIMIT&&endpoint(item,'blue')<=LIMIT);
        const selectedMax=Math.max(endpoint(insideResult.ranked[0],'red'),endpoint(insideResult.ranked[0],'blue'));
        const selectedTotal=endpoint(insideResult.ranked[0],'red')+endpoint(insideResult.ranked[0],'blue');
        assert(achieved.every(item=>{
          const maximum=Math.max(endpoint(item,'red'),endpoint(item,'blue'));
          return selectedMax<maximum+EPSILON&&(!near(maximum,selectedMax)||selectedTotal<=endpoint(item,'red')+endpoint(item,'blue')+EPSILON);
        }), 'real learned achieved candidates follow maximum then total');
        assert(insideImpact.hovQuality==='learned'&&insideImpact.cruiseQuality==='learned', 'both effects use actual ready models');
      } else {
        assert(insideResult.preferred===null&&!insideResult.nominalGoalMet&&insideResult.status==='Cruise-prediction-uncertain', 'measured but unlearned Cruise cannot establish both limits');
        assert(insideImpact.joint==='prediction-uncertain'&&insideImpact.cruiseQuality==='uncertain', 'learned HOV with pending Cruise cannot claim joint achievement');
      }
      assert(snapshot()===state, mode+': within-limit evaluation does not retrain or persist');
      comparisons.push({label:'real learning/within-limit/'+mode,measuredHov:.19,measuredCruise:.33,
        existing:summarize(insideExisting),proposed:summarize(insideResult.ranked),
        status:insideResult.status,nominalGoalMet:insideResult.nominalGoalMet,
        preferred:key(insideResult.preferred),impacts:insideCandidates.map(item=>assess(item,.19,.33))});
      if(mode==='HOV-only-learned') {
        run(`getLearnedGuideLines({learningId:'comparison-unmeasured-Cruise',red:{radius:.4,angle:112.5,color:'red'}});`);
        const onlyCandidates=run('guidePredictionDebug.candidates');
        const onlyOutcome=outcome(onlyCandidates,.4,null), onlyExisting=legacyRank(onlyCandidates);
        assert(onlyCandidates.every(item=>item.predictions.length===1), 'real unmeasured Cruise creates no Cruise prediction');
        assert(onlyOutcome.objective==='HOV-within-0.2'&&onlyOutcome.preferred!==null&&onlyOutcome.nominalGoalMet,
          'actual learned HOV arrival is preferred with no Cruise measurement');
        assert(onlyCandidates.every(item=>endpoint(onlyOutcome.ranked[0],'red')<=endpoint(item,'red')+EPSILON),
          'actual HOV-only endpoints minimize HOV distance without Cruise influence');
        assert(snapshot()===state, 'HOV-only comparison preserves learned and saved data');
        comparisons.push({label:'real learning/Cruise unmeasured',measuredHov:.4,measuredCruise:null,
          existing:summarize(onlyExisting),proposed:summarize(onlyOutcome.ranked),status:onlyOutcome.status,
          preferred:key(onlyOutcome.preferred),impacts:onlyCandidates.map(item=>assess(item,.4,null))});
      }
    }
    assert(run('selectLinkGuideCandidate.toString()')===selectorSource, 'production selector never replaced');
    output.textContent=`PASS: ${checks} checks\n`+JSON.stringify(comparisons,null,2);
    document.title='PASS';
  } catch(error) {
    output.textContent=`FAIL after ${checks} checks\n${error.stack}\n`+JSON.stringify(comparisons,null,2);
    document.title='FAIL';
  }
})();
