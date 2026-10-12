(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  const near = (a, b) => Math.abs(a - b) < 1e-8;
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    const loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code), policy = frame.contentWindow.BalanceLinkRanking;
    assert(typeof policy.select === 'function', 'production policy loaded');
    assert(run('typeof linkRankingTrial') === 'undefined', 'production loads no trial adapter');
    assert(!frame.contentDocument.querySelector('script[src*="legacy"],select[id*="ranking"],#mode'), 'no legacy script or switch in production UI');
    const make = (blade, h, b, inward = true) => ({blade, direction:'UP', amount:.25, towardCenter:inward,
      predictions:[{color:'red',predictedDistance:h,source:'learned'},
        ...(b===undefined?[]:[{color:'blue',predictedDistance:b,source:'learned'}])]});
    const joint = make(2,.2,.2,false), hovOnly = make(1,.01,.4);
    for (const h of [.1,.2,.32]) for (const b of [.1,.2,.33]) {
      assert(policy.select([hovOnly,joint],h,b) === joint, 'joint pass always outranks HOV-only even outward');
    }
    assert(policy.select([make(1,.21,.01),make(2,.2,.4)],.32,.33).blade===2, 'HOV pass before cruise when no joint pass');
    assert(policy.select([make(1,.25,.01),make(2,.24,.4)],.32,.33).blade===2, 'HOV improvement when none pass');
    assert(policy.select([make(1,.21,.01),make(2,.19,.4)],.19,.33).blade===2, 'HOV maintained before cruise benefit');
    assert(policy.select([make(1,.21),make(2,.19)],.32,null).blade===2, 'unmeasured cruise uses HOV endpoint');
    assert(policy.select([make(1,.1,.19),make(2,.18,.18)],.32,.33).blade===2, 'joint pass minimizes maximum');
    assert(policy.select([make(1,.15,.19),make(2,.1,.19)],.32,.33).blade===2, 'equal maximum minimizes sum');
    const adjacent = (value, step) => {
      const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0,value);
      view.setBigUint64(0,view.getBigUint64(0)+BigInt(step));return view.getFloat64(0);
    };
    for (const h of [adjacent(.2,-1),.2,adjacent(.2,1)]) for (const b of [adjacent(.2,-1),.2,adjacent(.2,1)]) {
      assert(policy.assess(make(1,h,b),.32,.33).nominalGoalMet===(h<=.2&&b<=.2), 'strict inclusive 0.2 at one ULP');
    }
    const exact = make(2,.2,.2), outside = make(1,.01,adjacent(.2,1));
    assert(policy.select([outside,exact],.32,.33)===exact, 'no epsilon expansion of pass eligibility');
    const reference = make(2,.18,.18), nearReference = make(1,.01,adjacent(.18,1));
    assert(policy.select([nearReference,reference],.32,.33)===nearReference, '0.18 is advisory only even at one ULP');
    assert(policy.select([make(1,null,.1),joint],.32,.33)===joint, 'missing HOV cannot outrank known joint goal');
    assert(policy.select([make(1,.1,null),joint],.32,.33)===joint, 'missing cruise never confirms joint pass');
    assert(policy.select([], .32,.33)===null, 'empty pool safe');
    const uncertain = make(1,.1,.1); uncertain.predictions[0].source='prior';
    assert(policy.assess(uncertain,.32,.33).uncertain, 'prior prediction explicitly uncertain');
    const directed = (blade,h,b,hProjection,bProjection) => {
      const c=make(blade,h,b);
      c.predictions[0].inwardProjection=hProjection;
      if(c.predictions[1])c.predictions[1].inwardProjection=bProjection;
      return c;
    };
    const inwardOvershoot=directed(3,.246796,.161884,.0116,.3188);
    const outwardLessWorse=directed(1,.241030,null,-.0116,-.3188);
    assert(policy.select([outwardLessWorse,inwardOvershoot],.32,.33)===inwardOvershoot,
      'unqualified No.3 centerward UP outranks smaller HOV worsening DOWN');
    const qualified=directed(2,.2,.2,-.1,-.1), hovQualified=directed(2,.2,.4,-.1,-.1);
    assert(policy.select([inwardOvershoot,qualified],.32,.33)===qualified,
      'joint qualification outranks both centerward directions');
    assert(policy.select([inwardOvershoot,hovQualified],.32,.33)===hovQualified,
      'HOV qualification outranks both centerward directions');
    const outwardCruiseIn=directed(2,.3,.16,-.2,.3);
    assert(policy.select([outwardLessWorse,outwardCruiseIn],.32,.33)===outwardCruiseIn,
      'both HOV outward: centerward Cruise wins despite different HOV endpoints');
    const hovIn=directed(2,.4,.5,.2,-.3);
    assert(policy.select([outwardCruiseIn,hovIn],.32,.33)===hovIn,
      'HOV centerward direction precedes Cruise-only centerward direction');
    const sameDirection=directed(2,.24,.5,.001,.001);
    assert(policy.select([inwardOvershoot,sameDirection],.32,.33)===sameDirection,
      'equal direction classes use strict HOV endpoint comparison');
    const tangent=directed(1,.21,.1,0,.2);
    assert(policy.select([tangent,inwardOvershoot],.32,.33)===inwardOvershoot,
      'tangent HOV is not treated as approaching center');
    const unknownDirection=directed(1,.21,.1,null,null);
    assert(policy.select([unknownDirection,inwardOvershoot],.32,.33)===inwardOvershoot,
      'unknown direction is not invented as an inward direction');
    const missing=directed(3,.3,null,.2,.3);
    assert(policy.select([missing,outwardLessWorse],.32,.33)===missing
      &&policy.assess(missing,.32,.33).uncertain&&!policy.assess(missing,.32,.33).nominalGoalMet,
      'known direction and unknown travel remain distinct and unqualified');
    const unknownHov=directed(3,null,.16,.2,.3);
    assert(policy.select([unknownHov,qualified],.32,.33)===qualified,
      'missing HOV endpoint cannot bypass joint qualification');
    const allMissing=[directed(2,null,.4,.2,.3),directed(1,null,null,.2,.3)];
    assert(policy.select(allMissing,.32,.33)===allMissing[1]
      &&policy.assess(allMissing[1],.32,.33).uncertain,'all unknown HOV endpoints keep deterministic diagnostic ordering');
    assert(policy.select([outwardLessWorse,hovIn],.32,null)===hovIn,
      'unmeasured Cruise uses HOV direction when no HOV forecast qualifies');
    const lessOvershoot=directed(1,.19,.45,-.1,-.35), moreOvershoot=directed(1,.01,.55,.1,.35);
    moreOvershoot.direction='DOWN';
    assert(policy.rank([moreOvershoot,lessOvershoot],.1,.35).directions[0]===lessOvershoot,
      'direction stage evaluates known overshoot independently of initial centerward sign');
    const geometryOnly=directed(1,.19,null,-.1,.35);geometryOnly.direction='DOWN';
    assert(policy.select([lessOvershoot,geometryOnly],.1,.35)===geometryOnly
      &&policy.assess(geometryOnly,.1,.35).cruiseEvidence==='geometry-only-improvement-possible'
      &&!policy.assess(geometryOnly,.1,.35).nominalBothWithin,
      'missing inward Cruise is a geometric possibility, never known worsening or joint attainment');
    const smallHov=directed(1,.001,.18,.1,.1),betterCruise=directed(2,.199,.1,-.1,.1);
    assert(policy.select([smallHov,betterCruise],.1,.35)===betterCruise,
      'HOV inside favors Cruise endpoint within joint forecasts instead of HOV centering');
    assert(!policy.assess(betterCruise,.1,null).nominalBothWithin
      &&!policy.assess(betterCruise,.1,.35).confirmedPass,'unmeasured Cruise and unverified models cannot confirm both goals');
    const analysis = LinkRankingAnalysis.run(LinkRankingPolicy,LinkRankingLegacy);
    for (const row of analysis.cases) {
      const snapshot = JSON.stringify(row.pool);
      const expected = LinkRankingPolicy.select(row.pool,.32,.33);
      assert(policy.select(row.pool,.32,.33)===expected, '400 independent reference comparisons');
      assert(JSON.stringify(row.pool)===snapshot, 'ranking preserves endpoints');
    }
    // 実アプリの共有量・表示終点・学習不変性を、未学習／学習済みで確認する。
    for (const learned of [false,true]) for (const cruise of [false,true]) for (const inside of [false,true]) {
      run(`learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
        selectedAdjustmentTarget=null;currentChartPage=0;guideCandidateIndex=0;guideCandidateIndices.fill(0);
        memoValues.fill('');adjustmentSelections.forEach(v=>v.fill(''));
        const dot=(x,y,color)=>({color,clock:'12:00',radius:Math.hypot(x-397,y-520)/240,angle:Math.atan2(x-397,520-y)*180/Math.PI});
        for(let i=0;i<${learned?4:1};i++) {
          if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
          dotSets.push({learningId:newLearningId(),red:dot(517+(3-i)*40,590+(3-i)*23,'red'),
            blue:${cruise?"dot(527+(3-i)*30,650+(3-i)*25,'blue')":'null'},adjustments:i<${learned?3:0}?[['1','LINK','1','UP']]:[]});
          learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
        }
        ${inside?`dotSets.at(-1).red={radius:.0858646622241277,angle:357.0643265535789,color:'red',clock:'fixture'};
          ${cruise?`dotSets.at(-1).blue={radius:.34974248163560817,angle:198.321338,color:'blue',clock:'fixture'};`:''}
          applyChartRotation(-74,-97.5);`:''}
        pitchAutoMode=true;setGuidesVisible(true);renderDots();
        window.productionLearning=JSON.stringify(learning.inspect());
        window.productionMeasurements=JSON.stringify(dotSets);
        window.productionPredict=JSON.stringify([1,2,3].flatMap(blade=>['UP','DOWN'].flatMap(direction=>['red','blue'].map(color=>learning.predict('LINK',color,blade,direction,.25,{x:500,y:600})))));`);
      for (const amount of ['1/4','1/2']) {
        run(`memoThree.click();selectedMemoValue='${amount}';confirmMemoPicker.click()`);
        if(inside){
          const all=run(`(()=>{
            const target=dotSets.at(-1),pool=guidePredictionDebug.fallback
              ?[1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>({blade,direction,predictions:[],
                line:getDirectionLine(target.red,'red',null,blade,direction),
                blue:target.blue?getDirectionLine(target.blue,'blue',null,blade,direction):null})))
              :guidePredictionDebug.candidates;
            return getLinkRankingCandidates(pool).map(c=>({blade:c.blade,direction:c.direction,amount:c.amount,
              amountText:c.amountText,predictions:c.predictions,units:Object.fromEntries(c.predictions.map(p=>[p.color,
                getGuideMovementUnit(c.line?(p.color==='red'?c.line:c.blue)
                  :getPredictionGuideLine(c.original.predictions.find(q=>q.color===p.color)))]))}));
          })()`);
          const target=run('dotSets.at(-1)'),expected=LinkTwoStagePolicy.rank(
            all.map(c=>LinkMaintenancePolicy.attach(c,{x:397,y:520,radius:240})),target.red.radius,target.blue?.radius);
          assert(run('guideNumberChoices.filter(c=>c.candidate).map(c=>c.blade+" "+c.candidate.direction).join("|")')
            ===expected.ranked.map(row=>row.candidate.blade+' '+row.candidate.direction).join('|'),
            'real learned/fallback No choices match independent two-stage directions and order at selected amount');
        }
        for (let rank=0;rank<3;rank++) {
          run(`while(guideCandidateIndex!==${rank})guideCandidateToggle.click()`);
          assert(run('guideNumberChoices.length===3 && new Set(guideNumberChoices.map(c=>c.blade)).size===3'), 'No.1–3 cycle preserved');
          assert(run(`memoValues[2]==='${amount}'`), 'shared amount preserved');
          if(run('guideNumberChoices[guideCandidateIndex].candidate===null')){
            assert(run('!forecastGuides.red && !forecastGuides.blue'), 'No without a learned candidate never borrows another No guide');
            continue;
          }
          const normalized = run('getLinkRankingCandidates([guideNumberChoices[guideCandidateIndex].candidate])[0]');
          const forecast = run('adjustmentForecast');
          for (const p of normalized.predictions) {
            const point = forecast.points.find(point=>point.color===p.color);
            assert(p.position ? point && near(point.x,p.position.x) && near(point.y,p.position.y) : !point, 'ranking endpoint equals unchanged forecast calculation');
            const expected=run(`(()=>{const u=forecastGuides['${p.color}']?.unit;
              return u&&${p.currentDistance}>0?-(((${p.start.x})-CHART_CENTER_X)*u.x+((${p.start.y})-CHART_CENTER_Y)*u.y)/Math.hypot(u.x,u.y)/CHART_RADIUS:null;})()`);
            assert(expected===null?p.inwardProjection===null:near(p.inwardProjection,expected),
              'ranking direction metadata equals displayed guide, independent of travel');
          }
          assert(run('document.getElementById("forecastCaution").textContent.includes("実測精度は未検証")'), 'unverified real precision shown in existing notice');
          if(normalized.predictions.some(p=>p.uncertain)) assert(run('document.getElementById("forecastCaution").textContent.includes("予測不確実")'), 'uncertain estimate visible');
        }
      }
      run('updateAdjustmentForecast(memoValues,true);window.fixedProduction=JSON.stringify(adjustmentForecast);renderDirectionLines()');
      assert(run('JSON.stringify(adjustmentForecast)===fixedProduction'), 'fixed forecast preserved on rerender');
      // 個別入力を隠している既存の表示判定は、量の確定による再順位付けでも維持する。
      run(`guideCandidateToggle.click();window.automaticProduction=[...memoValues];
        memoOne.click();selectedMemoValue=automaticProduction[0]==='1'?'2':'1';confirmMemoPicker.click();
        window.manualProduction=memoValues[0];
        memoThree.click();selectedMemoValue='3/4';confirmMemoPicker.click();`);
      assert(run('memoValues[0]===manualProduction && adjustmentForecast.manualBlade'), 'manual blade survives committed amount rerank');
      run('guideCandidateToggle.click()');
      run('for(let i=0;i<3 && !guideNumberChoices[guideCandidateIndex].candidate;i++)guideCandidateToggle.click()');
      assert(run('!adjustmentForecast.manualBlade && memoValues[0]===String(forecastGuides.red.blade)'), 'No cycle restores selected guide after manual input');
      assert(run('JSON.stringify(learning.inspect())===productionLearning && JSON.stringify(dotSets)===productionMeasurements'), 'learning and measurements unchanged');
      assert(run(`JSON.stringify([1,2,3].flatMap(blade=>['UP','DOWN'].flatMap(direction=>['red','blue'].map(color=>learning.predict('LINK',color,blade,direction,.25,{x:500,y:600})))))===productionPredict`), 'prediction outputs unchanged');
    }
    output.textContent=`PASS: ${checks} checks\nSynthetic joint pass: old ${analysis.original.both}/400; new ${analysis.target.both}/400. Real accuracy unverified.`;
    document.title='PASS';
  } catch(error) {output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
