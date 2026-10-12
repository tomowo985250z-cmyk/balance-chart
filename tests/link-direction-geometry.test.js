/* Test-only geometry experiment. Never imported by the application. */
(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const traces = [];
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  const close = (a, b, label) => assert(Math.abs(a - b) < 1e-9, label);
  // r: vector from chart center, in IPS. u: forward guide unit vector.
  // These describe a ray, never the predicted adjustment endpoint.
  const geometry = (r, u) => {
    if (!r || !u || ![r.x, r.y, u.x, u.y].every(Number.isFinite)) return null;
    const norm = Math.hypot(u.x, u.y), radius = Math.hypot(r.x, r.y);
    if (!norm || !radius) return null;
    const unit = { x: u.x / norm, y: u.y / norm };
    const projection = -(r.x * unit.x + r.y * unit.y);
    const cosine = Math.max(-1, Math.min(1, projection / radius));
    const travelToClosest = Math.max(0, projection);
    const minimumRadius = Math.hypot(r.x + travelToClosest * unit.x, r.y + travelToClosest * unit.y);
    const halfChordSquared = .2 ** 2 - minimumRadius ** 2;
    const passTravelInterval = projection > 0 && halfChordSquared >= 0
      ? [Math.max(0, projection - Math.sqrt(halfChordSquared)), projection + Math.sqrt(halfChordSquared)] : null;
    return { radius, inwardCosine: cosine, angleToCenterDegrees: Math.acos(cosine) * 180 / Math.PI,
      inwardProjection: projection, travelToClosest, minimumRadius, passTravelInterval,
      improvementTravelUpperBound: projection > 0 ? 2 * projection : 0 };
  };
  const end = (r, u, travel) => Math.hypot(r.x + u.x * travel, r.y + u.y * travel);
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    const ready = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await ready;
    const run = code => frame.contentWindow.eval(code), policy = LinkRankingPolicy;
    const production = LinkRankingBeforeTwoStage; // Frozen historical hybrid comparison.
    // Restricted experiment: only break exact HOV ties when BOTH Cruise endpoints
    // are missing and no HOV-safe candidate exists. Known endpoints always retain
    // the production priority. Geometry cannot confer qualification or certainty.
    const trialSelect = (candidates, hov, cruise) => {
      const baseline = policy.select(candidates, hov, cruise);
      if (!baseline || !Number.isFinite(cruise) || policy.endpoint(baseline, 'red') <= .2
        || policy.endpoint(baseline, 'blue') !== null) return baseline;
      const tied = candidates.filter(c => policy.endpoint(c, 'red') === policy.endpoint(baseline, 'red')
        && policy.endpoint(c, 'blue') === null);
      if (tied.length < 2 || tied.some(c => !c.geometry)) return baseline;
      return tied.reduce((best, c) => c.geometry.inwardCosine > best.geometry.inwardCosine ? c : best, baseline);
    };
    // Latest requested experiment: direction classes BEFORE forecast endpoints.
    // Sign of the radial derivative, not ray minimum or travel, determines class.
    // Tangent is not approaching; an absent vector remains unknown (last class).
    const directionTier = (c, cruise) => {
      if (!c.hovGeometry) return 4;
      const h = c.hovGeometry.inwardCosine > 0;
      if (!Number.isFinite(cruise)) return h ? 0 : 1;
      if (!c.geometry) return 4;
      const b = c.geometry.inwardCosine > 0;
      return h ? b ? 0 : 1 : b ? 2 : 3;
    };
    const directionSelect = (candidates, hov, cruise) => {
      if (!candidates.length) return null;
      const tier = Math.min(...candidates.map(c => directionTier(c, cruise)));
      const tied = candidates.filter(c => directionTier(c, cruise) === tier);
      return policy.select(tied, hov, cruise) ?? [...tied].sort((a, b) => a.blade - b.blade
        || Number(a.direction === 'DOWN') - Number(b.direction === 'DOWN'))[0];
    };
    // Hybrid experiment only: joint qualification, then HOV qualification, are
    // protected by the existing endpoint policy. Direction is used only when
    // no known HOV endpoint can meet .2. Reference forecasts stay uncertain.
    const hybridSelect = (candidates, hov, cruise) => {
      if (!Number.isFinite(hov) || hov < 0) return null;
      const hovSafe = candidates.some(c => {
        const h = policy.endpoint(c, 'red'); return h !== null && h <= .2;
      });
      return hovSafe ? policy.select(candidates, hov, cruise) : directionSelect(candidates, hov, cruise);
    };
    const attachGeometry = (raw, center) => raw.map(c => {
      const blue = c.predictions.find(p => p.color === 'blue'), red = c.predictions.find(p => p.color === 'red');
      const radial = p => ({ x: (p.start.x - center.x) / center.radius, y: (p.start.y - center.y) / center.radius });
      return { ...c, geometry: blue ? geometry(radial(blue), c.unit) : null,
        hovGeometry: red ? geometry(radial(red), c.redUnit) : null, r: blue ? radial(blue) : null,
        predictedTravel: blue?.position ? Math.hypot(blue.position.x - blue.start.x, blue.position.y - blue.start.y) / center.radius : null };
    });
    const make = (blade, direction, h, b, cosine) => ({ blade, direction, amount: .25,
      geometry: Number.isFinite(cosine) ? { inwardCosine: cosine } : null,
      predictions: [{ color: 'red', predictedDistance: h, source: 'learned' },
        { color: 'blue', predictedDistance: b, source: b === null ? 'missing' : 'learned', uncertain: b === null }] });
    const gIn = geometry({ x: 0, y: .33 }, { x: 0, y: -1 });
    close(gIn.minimumRadius, 0, 'radial inward ray can geometrically reach center');
    close(gIn.travelToClosest, .33, 'closest distance requires a particular travel amount');
    const gOut = geometry({ x: 0, y: .33 }, { x: 0, y: 1 });
    close(gOut.minimumRadius, .33, 'outward ray minimum is the start, not backward infinite-line intersection');
    assert(gOut.passTravelInterval === null, 'outward ray cannot enter .2 from outside');
    const tangent = geometry({ x: 0, y: .33 }, { x: 1, y: 0 });
    assert(tangent.passTravelInterval === null && end({ x: 0, y: .33 }, { x: 1, y: 0 }, .01) > .33,
      'tangent direction is not an improvement');
    assert(geometry({ x: 0, y: .33 }, { x: 0, y: 0 }) === null, 'invalid guide is not ranked as inward');
    assert(geometry({ x: 0, y: 0 }, { x: 0, y: 1 }) === null, 'center has no defined inward angle');
    assert(geometry({ x: NaN, y: .33 }, { x: 0, y: 1 }) === null, 'nonfinite input remains unknown');

    for (const hov of [.32, .19]) {
      run(`learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
        selectedAdjustmentTarget=null;currentChartPage=0;guideCandidateIndex=0;guideCandidateIndices.fill(0);
        adjustmentSelections.forEach(v=>v.fill(''));memoValues.splice(0,4,'1','LINK','1/4','UP');updateMemoButtons();
        dotSets.push({learningId:newLearningId(),red:{radius:${hov},angle:${hov === .32 ? 100 : 112.5},color:'red',clock:'test'},
          blue:{radius:.33,angle:165,color:'blue',clock:'5:30'},adjustments:[]});
        initialChartRotations[0]={hovAngle:-41,cruiseAngle:-60};
        pitchAutoMode=true;applyChartRotation(-41,-60);setGuidesVisible(true);renderDots();
        window.geometryStateBefore=JSON.stringify({learning:learning.inspect(),dots:dotSets,
          records:BalanceState.keys.map(key=>appStorage.getItem(key)),forecast:adjustmentForecast,
          guides:forecastGuides,choices:guideNumberChoices,memo:memoValues});
        window.geometryPool=[1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>({blade,direction,predictions:[],
          line:getDirectionLine(dotSets.at(-1).red,'red',null,blade,direction),
          blue:getDirectionLine(dotSets.at(-1).blue,'blue',null,blade,direction)})));`);
      const raw = run(`getLinkRankingCandidates(geometryPool).map(c=>({blade:c.blade,direction:c.direction,amount:c.amount,
        predictions:c.predictions,unit:getGuideMovementUnit(c.blue),redUnit:getGuideMovementUnit(c.line)}))`);
      const center = run('({x:CHART_CENTER_X,y:CHART_CENTER_Y,radius:CHART_RADIUS})');
      const candidates = attachGeometry(raw, center);
      const up = candidates.find(c => c.blade === 3 && c.direction === 'UP');
      const down = candidates.find(c => c.blade === 3 && c.direction === 'DOWN');
      const before = JSON.stringify(candidates);
      const baseline = policy.select([up, down], hov, .33), trial = trialSelect([up, down], hov, .33);
      assert(baseline === down && trial === down, 'geometry does not erase different HOV worsening in No.3');
      assert(up.geometry.inwardCosine > 0 && down.geometry.inwardCosine < 0, 'UP approaches center while DOWN points away');
      close(up.geometry.inwardCosine, -down.geometry.inwardCosine, 'opposite guide directions have opposite inward projection');
      assert(up.predictedTravel > up.geometry.passTravelInterval[0] && up.predictedTravel < up.geometry.passTravelInterval[1],
        'actual UP predicted travel lies in geometric .2 crossing interval');
      close(end(up.r, up.unit, up.predictedTravel), policy.endpoint(up, 'blue'), 'travel and guide reconstruct real forecast endpoint');
      assert(down.predictedTravel === null && policy.endpoint(down, 'blue') === null
        && down.predictions.find(p => p.color === 'blue').improvement === null, 'missing DOWN travel, endpoint and improvement remain null');
      assert(policy.assess(down, hov, .33).uncertain && !policy.assess(down, hov, .33).nominalGoalMet,
        'geometry cannot certify a missing endpoint');
      assert(policy.assess(up, hov, .33).uncertain, 'UP distance prior does not become certain through geometry');
      // Direction alone describes infinitesimal approach, not success at any amount.
      assert(end(up.r, up.unit, .01) < .33 && end(up.r, up.unit, .01) > .2,
        'short inward travel improves but does not qualify');
      assert(end(up.r, up.unit, up.geometry.travelToClosest + .01) < .2,
        'passing closest point is not automatically failure');
      assert(end(up.r, up.unit, up.geometry.passTravelInterval[1] + .01) > .2,
        'overshoot exits qualification zone despite inward direction');
      assert(end(up.r, up.unit, up.geometry.improvementTravelUpperBound + .01) > .33,
        'larger overshoot worsens Cruise despite inward direction');
      for (const s of [.001, .01, .1, .5]) assert(end(down.r, down.unit, s) > .33,
        'any sampled positive travel along current DOWN ray worsens radius geometrically');
      const rank = choose => {
        let pool = [...candidates]; const order = [];
        while (pool.length) {
          const selected = choose(pool, hov, .33); order.push(`${selected.blade} ${selected.direction}`);
          pool = pool.filter(c => c.blade !== selected.blade);
        }
        return order;
      };
      const oldOrder = rank(policy.select), trialOrder = rank(trialSelect), directionOrder = rank(directionSelect), hybridOrder = rank(hybridSelect);
      assert(oldOrder.join(',') === trialOrder.join(','), 'all No.1-3 ranks remain unchanged in image approximation');
      const directionThree = directionSelect([up, down], hov, .33);
      assert(directionThree.direction === (hov === .19 ? 'UP' : 'DOWN'), 'direction-first No.3 switches only when its HOV guide changes inward class');
      const hybridThree = hybridSelect([up,down],hov,.33);
      assert(hybridThree === directionThree, 'No.3 has no HOV-safe forecast so hybrid uses direction');
      assert(hybridOrder.join(',') === (hov===.19?'2 DOWN,1 UP,3 UP':'1 UP,2 DOWN,3 DOWN'),
        'hybrid protects HOV-safe No.1/2 before choosing No.3 direction');
      assert(rank(production.select).join(',')===hybridOrder.join(','), 'production No.1-3 order matches verified hybrid');
      assert(JSON.stringify(candidates) === before, 'trial geometry leaves all forecast values untouched');
      assert(run('JSON.stringify({learning:learning.inspect(),dots:dotSets,records:BalanceState.keys.map(key=>appStorage.getItem(key)),forecast:adjustmentForecast,guides:forecastGuides,choices:guideNumberChoices,memo:memoValues})===geometryStateBefore'),
        'experiment leaves learning, measurements, stored records, UI guides and production ranks untouched');
      traces.push({ basis: 'image approximation; no device learning data imported', currentHov: hov, currentCruise: .33,
        amount: '1/4', oldOrder, trialOrder, directionOrder, hybridOrder,
        directionThree: directionThree.direction, hybridThree: hybridThree.direction,
        hovExtraWorseningUP: policy.endpoint(up, 'red') - policy.endpoint(down, 'red'),
        cases: [up, down].map(c => ({ direction: c.direction, geometry: c.geometry, predictedTravel: c.predictedTravel,
          hovGeometry: c.hovGeometry, directionTier: directionTier(c, .33),
          hovEndpoint: policy.endpoint(c, 'red'), hovWorsening: policy.endpoint(c, 'red') - hov,
          cruiseEndpoint: policy.endpoint(c, 'blue'), uncertain: policy.assess(c, hov, .33).uncertain })),
        travelExamples: [.01, up.geometry.travelToClosest, up.geometry.passTravelInterval[1] + .01,
          up.geometry.improvementTravelUpperBound + .01].map(s => ({ travel: s, cruiseEndpoint: end(up.r, up.unit, s) })) });
    }
    const outward = make(1, 'DOWN', .34, null, -.9), inward = make(3, 'UP', .34, null, .9);
    assert(policy.select([outward, inward], .19, .33) === outward, 'baseline exact tie uses existing No ordering');
    assert(trialSelect([outward, inward], .19, .33) === inward, 'test-only exact HOV/missing Cruise tie can use inward direction');
    assert(policy.assess(inward, .19, .33).uncertain && !policy.assess(inward, .19, .33).nominalGoalMet,
      'test-only direction preference still explicitly unknown and unqualified');
    for (const delta of [1e-3, 1e-10, 1e-12]) {
      const worse = make(3, 'UP', .34 + delta, null, .99);
      assert(trialSelect([outward, worse], .19, .33) === outward, 'nonzero HOV worsening difference always wins over direction');
    }
    const known = make(2, 'DOWN', .34, .5, -.9);
    assert(trialSelect([known, inward], .19, .33) === known, 'known endpoint is never replaced with unknown inward forecast');
    const safe = make(2, 'DOWN', .2, .2, -.9), outside = make(3, 'UP', .2 + Number.EPSILON, .1, .99);
    assert(trialSelect([outside, safe], .19, .33) === safe, 'strict .2 joint qualification cannot be overridden by direction');
    assert(trialSelect([outward, inward], .19, null) === outward, 'unmeasured Cruise provides no direction tie-break');
    assert(trialSelect([outward, make(3, 'UP', .34, null, null)], .19, .33) === outward,
      'absent geometry preserves baseline rank');
    const exactBefore = JSON.stringify([outward, inward]); trialSelect([outward, inward], .19, .33);
    assert(JSON.stringify([outward, inward]) === exactBefore, 'synthetic missing forecasts are not replaced or learned');

    const directed = (blade, direction, h, b, hCos, bCos) => ({ ...make(blade, direction, h, b, bCos),
      hovGeometry: Number.isFinite(hCos) ? { inwardCosine: hCos } : null });
    const overshoot = directed(3, 'UP', .24, .16, 1, 1);
    const jointOutward = directed(2, 'DOWN', .2, .2, -1, 1);
    assert(policy.select([overshoot, jointOutward], .19, .33) === jointOutward
      && directionSelect([overshoot, jointOutward], .19, .33) === overshoot,
      'direction-first can demote a joint .2 forecast for inward overshoot');
    close(end({x:0,y:.19},{x:0,y:-1},.43), .24, 'counterexample inward HOV endpoint is physically consistent with overshoot');
    close(end({x:0,y:.19},{x:0,y:1},.01), .2, 'counterexample outward HOV still qualifies at endpoint');
    const away = directed(1, 'DOWN', .25, .4, -.1, -.9);
    const cruiseIn = directed(3, 'UP', .3, .16, -.9, .9);
    assert(directionSelect([away, cruiseIn], .19, .33) === cruiseIn,
      'both HOV outward: Cruise inward direction wins despite different HOV worsening');
    const equalDirection = directed(2, 'UP', .2, .2, .1, .1);
    assert(directionSelect([overshoot, equalDirection], .19, .33) === equalDirection,
      'same direction class uses endpoint qualification, not approach angle strength');
    assert(directionSelect([directed(1,'UP',.2+Number.EPSILON,.1,.9,.9),equalDirection],.19,.33)===equalDirection,
      'endpoint comparison inside equal direction class retains strict inclusive .2 boundary');
    const missingEndpoint = directed(3, 'UP', null, null, .9, .9);
    assert(directionSelect([missingEndpoint, jointOutward], .19, .33) === missingEndpoint
      && policy.assess(missingEndpoint, .19, .33).uncertain && !policy.assess(missingEndpoint, .19, .33).nominalGoalMet,
      'direction-first may prefer unknown endpoints but never certifies them');
    assert(directionSelect([directed(1,'UP',.1,.1,null,null),overshoot],.19,.33) === overshoot,
      'unknown vectors are not fabricated as center-directed');
    assert(directionSelect([away, cruiseIn], .19, null) === away, 'without Cruise measurement direction tie uses HOV endpoint');
    assert(hybridSelect([overshoot,jointOutward],.19,.33) === jointOutward,
      'hybrid protects joint qualification even when HOV guide is outward');
    const hovOnlyOutward = directed(1,'DOWN',.2,.4,-.9,-.9);
    assert(hybridSelect([overshoot,hovOnlyOutward],.19,.33) === hovOnlyOutward,
      'hybrid protects HOV qualification before both-centerward overshoot');
    assert(hybridSelect([away,cruiseIn],.19,.33) === cruiseIn,
      'hybrid uses Cruise inward direction when both HOV directions are outward and none qualifies');
    const hovInward = directed(2,'DOWN',.4,.5,.1,-.9);
    assert(hybridSelect([away,cruiseIn,hovInward],.19,.33) === hovInward,
      'hybrid uses HOV inward direction ahead of HOV endpoint improvement outside qualification');
    assert(hybridSelect([directed(1,'UP',.3,.4,.1,.1),directed(2,'UP',.25,.5,.9,.9)],.19,.33).blade===2,
      'equal direction class uses forecast endpoints, not cosine strength');
    assert(hybridSelect([missingEndpoint,jointOutward],.19,.33) === jointOutward,
      'unknown endpoints cannot bypass a joint qualification candidate in hybrid');
    const unknownInward=directed(3,'UP',.3,null,.9,.9);
    assert(hybridSelect([unknownInward,away],.19,.33) === unknownInward
      && policy.assess(unknownInward,.19,.33).uncertain && !policy.assess(unknownInward,.19,.33).nominalGoalMet,
      'hybrid may choose known direction with missing Cruise only outside qualification and retains uncertainty');
    const adjacent = (value, step) => { const view=new DataView(new ArrayBuffer(8));view.setFloat64(0,value);
      view.setBigUint64(0,view.getBigUint64(0)+BigInt(step));return view.getFloat64(0); };
    for(const h of [adjacent(.2,-1),.2,adjacent(.2,1)]) for(const b of [adjacent(.2,-1),.2,adjacent(.2,1)]) {
      const boundary=directed(2,'DOWN',h,b,-.9,-.9);
      const chosen=hybridSelect([overshoot,boundary],.19,.33);
      assert(policy.assess(boundary,.19,.33).nominalGoalMet===(h<=.2&&b<=.2), 'hybrid retains strict .2 qualification at one ULP');
      assert(chosen===(h<=.2?boundary:overshoot), 'hybrid HOV eligibility has no rounding or epsilon expansion');
    }
    const advisory=directed(1,'UP',.01,adjacent(.18,1),-.9,-.9), reference=directed(2,'UP',.18,.18,.9,.9);
    assert(hybridSelect([advisory,reference],.19,.33)===advisory, 'hybrid .18 advisory never overrides joint endpoint ranking');
    assert(hybridSelect([hovOnlyOutward,overshoot],.19,null)===hovOnlyOutward,
      'unmeasured Cruise still protects HOV qualification');
    assert(hybridSelect([], .19,.33)===null && hybridSelect([away],null,.33)===null,
      'empty candidates and absent HOV measurement do not fabricate a selection');

    // 1,296 synthetic positions, actual unchanged app guide/forecast calculations.
    // These are NOT measured success rates or model error validation.
    const grid = run(`(() => {
      const rows=[];
      for(const h of [.05,.19,.32])for(const b of [.05,.19,.33])for(let ha=0;ha<360;ha+=30)for(let ba=0;ba<360;ba+=30){
        dotSets.at(-1).red={radius:h,angle:ha,color:'red',clock:'fixture'};
        dotSets.at(-1).blue={radius:b,angle:ba,color:'blue',clock:'fixture'};
        const pool=[1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>({blade,direction,predictions:[],
          line:getDirectionLine(dotSets.at(-1).red,'red',null,blade,direction),
          blue:getDirectionLine(dotSets.at(-1).blue,'blue',null,blade,direction)})));
        rows.push({h,b,ha,ba,candidates:getLinkRankingCandidates(pool).map(c=>({blade:c.blade,direction:c.direction,amount:c.amount,
          predictions:c.predictions,unit:getGuideMovementUnit(c.blue),redUnit:getGuideMovementUnit(c.line)}))});
      }
      return rows;
    })()`);
    const summary = { cases: grid.length, changed: 0, endpointFirstJoint: 0, directionFirstJoint: 0,
      lostJoint: 0, gainedJoint: 0, hovEndpointWorse: 0, cruiseEndpointWorseAmongBothKnown: 0,
      endpointFirstHovPass: 0, directionFirstHovPass: 0, lostHovPass: 0,
      comparableCruise: 0, endpointFirstCruiseMissing: 0, directionFirstCruiseMissing: 0,
      maxDistanceWorseAmongBothKnown: 0, totalDistanceWorseAmongBothKnown: 0, examples: [] };
    const joint = (c, h, b) => policy.assess(c,h,b).nominalGoalMet;
    const hybridSummary = {cases:grid.length, changed:0, bothMeasured:0, endpointFirstJoint:0, hybridJoint:0,
      lostJoint:0, gainedJoint:0, endpointFirstHovPass:0, hybridHovPass:0, lostHovPass:0,
      endpointFirstCruiseMissing:0, hybridCruiseMissing:0, newlyMissing:0, recoveredMissing:0,
      noHovSafeCases:0, noHovSafeChanged:0, hovEndpointWorse:0,
      comparableCruise:0, cruiseEndpointWorseAmongBothKnown:0, maxDistanceWorseAmongBothKnown:0,
      totalDistanceWorseAmongBothKnown:0, examples:[]};
    const gridCenter = run('({x:CHART_CENTER_X,y:CHART_CENTER_Y,radius:CHART_RADIUS})');
    for (const row of grid) {
      const cs = attachGeometry(row.candidates, gridCenter);
      const before = JSON.stringify(cs), a = policy.select(cs,row.h,row.b), b = directionSelect(cs,row.h,row.b);
      const hybrid = hybridSelect(cs,row.h,row.b);
      const aH=policy.endpoint(a,'red'), bH=policy.endpoint(b,'red'), aB=policy.endpoint(a,'blue'), bB=policy.endpoint(b,'blue');
      const changed = a.blade !== b.blade || a.direction !== b.direction, aJoint = joint(a,row.h,row.b), bJoint = joint(b,row.h,row.b);
      summary.changed += changed; summary.endpointFirstJoint += aJoint; summary.directionFirstJoint += bJoint;
      summary.lostJoint += aJoint&&!bJoint; summary.gainedJoint += !aJoint&&bJoint;
      summary.hovEndpointWorse += bH>aH;
      summary.endpointFirstHovPass += aH<=.2; summary.directionFirstHovPass += bH<=.2;
      summary.lostHovPass += aH<=.2&&bH>.2;
      summary.endpointFirstCruiseMissing += aB===null; summary.directionFirstCruiseMissing += bB===null;
      if(aB!==null&&bB!==null){
        summary.comparableCruise++; summary.cruiseEndpointWorseAmongBothKnown+=bB>aB;
        summary.maxDistanceWorseAmongBothKnown+=Math.max(bH,bB)>Math.max(aH,aB);
        summary.totalDistanceWorseAmongBothKnown+=bH+bB>aH+aB;
      }
      if(aJoint&&!bJoint&&summary.examples.length<3)summary.examples.push({currentHov:row.h,currentCruise:row.b,
        hovAngle:row.ha,cruiseAngle:row.ba,
        endpointFirst:{blade:a.blade,direction:a.direction,hov:aH,cruise:aB,tier:directionTier(a,row.b)},
        directionFirst:{blade:b.blade,direction:b.direction,hov:bH,cruise:bB,tier:directionTier(b,row.b)}});
      const hybridH=policy.endpoint(hybrid,'red'),hybridB=policy.endpoint(hybrid,'blue'),hybridJoint=joint(hybrid,row.h,row.b);
      const hybridChanged=a.blade!==hybrid.blade||a.direction!==hybrid.direction;
      const hasHovSafe=cs.some(c=>policy.endpoint(c,'red')!==null&&policy.endpoint(c,'red')<=.2);
      hybridSummary.bothMeasured++; hybridSummary.changed+=hybridChanged;
      hybridSummary.endpointFirstJoint+=aJoint;hybridSummary.hybridJoint+=hybridJoint;
      hybridSummary.lostJoint+=aJoint&&!hybridJoint;hybridSummary.gainedJoint+=!aJoint&&hybridJoint;
      hybridSummary.endpointFirstHovPass+=aH<=.2;hybridSummary.hybridHovPass+=hybridH!==null&&hybridH<=.2;
      hybridSummary.lostHovPass+=aH<=.2&&(hybridH===null||hybridH>.2);
      hybridSummary.endpointFirstCruiseMissing+=aB===null;hybridSummary.hybridCruiseMissing+=hybridB===null;
      hybridSummary.newlyMissing+=aB!==null&&hybridB===null;hybridSummary.recoveredMissing+=aB===null&&hybridB!==null;
      hybridSummary.noHovSafeCases+=!hasHovSafe;hybridSummary.noHovSafeChanged+=!hasHovSafe&&hybridChanged;
      hybridSummary.hovEndpointWorse+=hybridH!==null&&aH!==null&&hybridH>aH;
      if(aB!==null&&hybridB!==null){
        hybridSummary.comparableCruise++;hybridSummary.cruiseEndpointWorseAmongBothKnown+=hybridB>aB;
        hybridSummary.maxDistanceWorseAmongBothKnown+=Math.max(hybridH,hybridB)>Math.max(aH,aB);
        hybridSummary.totalDistanceWorseAmongBothKnown+=hybridH+hybridB>aH+aB;
      }
      if(hybridChanged&&hybridSummary.examples.length<3)hybridSummary.examples.push({currentHov:row.h,currentCruise:row.b,
        hovAngle:row.ha,cruiseAngle:row.ba,endpointFirst:{blade:a.blade,direction:a.direction,hov:aH,cruise:aB},
        hybrid:{blade:hybrid.blade,direction:hybrid.direction,hov:hybridH,cruise:hybridB}});
      assert(!aJoint||hybridJoint,'hybrid never loses available joint qualification in sweep');
      assert(!(aH<=.2)||(hybridH!==null&&hybridH<=.2),'hybrid never loses available HOV qualification in sweep');
      assert(hasHovSafe?hybrid===a:hybrid===b,'hybrid uses endpoint policy in qualification and direction policy otherwise');
      assert(production.select(cs,row.h,row.b)===hybrid,
        `production matches independent verified hybrid: HOV ${row.h}/${row.ha}, Cruise ${row.b}/${row.ba}`);
      assert(!policy.assess(hybrid,row.h,row.b).uncertain||hybrid.predictions.some(p=>p.uncertain||p.source!=='learned'),
        'hybrid preserves prior and missing prediction uncertainty');
      assert(directionTier(b,row.b)===Math.min(...cs.map(c=>directionTier(c,row.b))), 'sweep always selects highest direction class');
      const tied=cs.filter(c=>directionTier(c,row.b)===directionTier(b,row.b));
      assert(policy.select(tied,row.h,row.b)===b, 'sweep uses unchanged endpoint policy only within equal direction class');
      assert(JSON.stringify(cs)===before, 'sweep never edits learned or predicted values');
      if(policy.assess(b,row.h,row.b).uncertain)assert(b.predictions.some(p=>p.uncertain||p.source!=='learned'),
        'sweep keeps missing/prior forecasts uncertain');
    }
    assert(summary.cases===1296, 'complete declared synthetic angle/radius grid');
    assert(summary.gainedJoint===0 && summary.endpointFirstJoint-summary.directionFirstJoint===summary.lostJoint,
      'joint qualification counts reconcile against endpoint-first priority');
    assert(hybridSummary.endpointFirstJoint===676&&hybridSummary.endpointFirstHovPass===1224
      &&hybridSummary.endpointFirstCruiseMissing===180,'same 1296-position baseline as preceding experiment');
    assert(hybridSummary.lostJoint===0&&hybridSummary.lostHovPass===0,'hybrid qualification safeguards hold over complete grid');
    assert(run('JSON.stringify(learning.inspect())===JSON.stringify(JSON.parse(geometryStateBefore).learning)'),
      'synthetic sweep does not train or replace learning');
    assert(run('JSON.stringify(BalanceState.keys.map(key=>appStorage.getItem(key)))===JSON.stringify(JSON.parse(geometryStateBefore).records)'),
      'synthetic positions are not persisted as user measurements');
    traces.push({directionFirstSyntheticSweep:summary,hybridSyntheticSweep:hybridSummary});
    output.textContent = `PASS: ${checks} checks\n${JSON.stringify(traces, null, 2)}`; document.title = 'PASS';
  } catch (error) {
    output.textContent = `FAIL after ${checks} checks\n${error.stack}\n${JSON.stringify(traces, null, 2)}`; document.title = 'FAIL';
  }
})();
