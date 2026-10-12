(async () => {
  const output = document.getElementById('results'), traces = [];
  let checks = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    const ready = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await ready;
    const run = code => frame.contentWindow.eval(code);
    const policy = frame.contentWindow.BalanceLinkRanking;
    const make = (blade,direction,h,b) => ({blade,direction,amount:.25,predictions:[
      {color:'red',predictedDistance:h,source:'learned'},
      {color:'blue',predictedDistance:b,source:b===null?'missing':'learned'}]});
    const adjacent = value => {const data=new DataView(new ArrayBuffer(8));data.setFloat64(0,value);
      data.setBigUint64(0,data.getBigUint64(0)+1n);return data.getFloat64(0);};
    for(const currentHov of [.19,.32]) {
      const equal=[make(3,'DOWN',.34,.4),make(3,'UP',.34,.16)];
      assert(policy.select(equal,currentHov,.33)===equal[1], 'exactly equal HOV worsening prioritizes improving Cruise endpoint');
      for(const delta of [1e-10,1e-12,adjacent(.34)-.34]) {
        const different=[make(3,'UP',.34+delta,.01),make(3,'DOWN',.34,.5)];
        assert(policy.select(different,currentHov,.33)===different[currentHov<=.2?0:1],
          'inside HOV uses Cruise improvement; recovery retains strict HOV comparison');
      }
      const unknown=[make(3,'DOWN',.34,null),make(3,'UP',.34,.16)];
      assert(policy.select(unknown,currentHov,.33)===unknown[1], 'same HOV endpoint prefers known improving Cruise over missing forecast');
      const joint=[make(1,'UP',.01,.4),make(3,'DOWN',.2,.2)];
      assert(policy.select(joint,currentHov,.33)===joint[1], 'joint pass retains highest priority');
    }
    const missingCruise=[make(1,'UP',adjacent(.34),null),make(2,'DOWN',.34,null)];
    assert(policy.select(missingCruise,.32,null)===missingCruise[1], 'unmeasured Cruise recovery compares HOV strictly');
    assert(policy.select(missingCruise,.19,null)===missingCruise[0], 'HOV inside with unmeasured Cruise does not favor HOV centering');
    const sameInput=JSON.stringify(missingCruise);policy.select(missingCruise,.19,.33);
    assert(JSON.stringify(missingCruise)===sameInput, 'strict fallback leaves predictions unchanged');
    for (const hov of [.32,.19]) {
      run(`learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
        selectedAdjustmentTarget=null;currentChartPage=0;guideCandidateIndex=0;guideCandidateIndices.fill(0);
        adjustmentSelections.forEach(v=>v.fill(''));memoValues.splice(0,4,'1','LINK','1/4','UP');updateMemoButtons();
        dotSets.push({learningId:newLearningId(),red:{radius:${hov},angle:${hov===.32?100:112.5},color:'red',clock:'test'},
          blue:{radius:.33,angle:165,color:'blue',clock:'5:30'},adjustments:[]});
        initialChartRotations[0]={hovAngle:-41,cruiseAngle:-60};
        pitchAutoMode=true;applyChartRotation(-41,-60);setGuidesVisible(true);renderDots();
        window.consistencyBefore=JSON.stringify({learning:learning.inspect(),dots:dotSets,records:BalanceState.keys.map(key=>appStorage.getItem(key))});
        window.consistencyPool=[1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>({blade,direction,
          predictions:[],line:getDirectionLine(dotSets.at(-1).red,'red',null,blade,direction),
          blue:getDirectionLine(dotSets.at(-1).blue,'blue',null,blade,direction)})));`);
      const candidates = run(`getLinkRankingCandidates(consistencyPool).map(c=>({blade:c.blade,direction:c.direction,
        predictions:c.predictions.map(p=>({color:p.color,current:p.currentDistance,endpoint:p.predictedDistance,
          improvement:p.improvement,source:p.source,position:p.position})),
        units:{red:getGuideMovementUnit(c.line),blue:getGuideMovementUnit(c.blue)}}))`);
      const order = run('guideNumberChoices.map(c=>({blade:c.blade,direction:c.candidate?.direction}))');
      assert(order.map(c=>c.blade).join(',')===(hov===.32?'1,2,3':'2,1,3'), 'No.1 improvement changes No rank under HOV protection');
      const three=order.find(c=>c.blade===3),up=candidates.find(c=>c.blade===3&&c.direction==='UP'),down=candidates.find(c=>c.blade===3&&c.direction==='DOWN');
      assert(three.direction===(hov===.19?'UP':'DOWN')&&down.predictions[0].endpoint<up.predictions[0].endpoint,
        'No.3 hybrid chooses direction only after protecting No.1/2 HOV qualification');
      assert(down.predictions[1].endpoint===null&&up.predictions[1].endpoint<.33,
        'No.3 DOWN Cruise remains unknown; UP Cruise improves but HOV worsens more');
      const displayed = [];
      for (let rank=0;rank<3;rank++) {
        run(`while(guideCandidateIndex!==${rank})guideCandidateToggle.click()`);
        const value = run(`({rank:guideCandidateIndex+1,values:[...memoValues],guides:structuredClone(forecastGuides),
          forecast:structuredClone(adjustmentForecast),notice:document.getElementById('forecastLearningNotice').textContent})`);
        const candidate = candidates.find(c=>String(c.blade)===value.values[0]&&c.direction===value.values[3]);
        assert(Boolean(candidate), 'displayed action is evaluated candidate');
        assert(value.values[2]==='1/4'&&value.forecast.values[2]==='1/4', 'No.1-3 switching preserves shared adjustment amount');
        for (const p of candidate.predictions) {
          const point = value.forecast.points.find(point=>point.color===p.color);
          assert(p.position ? point&&Math.hypot(point.x-p.position.x,point.y-p.position.y)<1e-8 : !point,
            'each No ranked endpoint equals displayed forecast');
          const unit = value.guides[p.color]?.unit;
          assert(unit&&Math.hypot(unit.x-candidate.units[p.color].x,unit.y-candidate.units[p.color].y)<1e-8,
            'guide direction equals evaluated adjustment direction');
        }
        assert(run(`[...dotOverlay.querySelectorAll('.guide-direction-line')].every(node=>{
          const color=node.getAttribute('marker-end').includes('red')?'red':'blue',u=forecastGuides[color].unit;
          const x=node.x2.baseVal.value-node.x1.baseVal.value,y=node.y2.baseVal.value-node.y1.baseVal.value;
          return x*u.x+y*u.y>0&&Math.abs(x*u.y-y*u.x)<1e-4;})`), 'drawn arrow agrees with prediction movement vector for each No');
        if(candidate.blade===3) {
          assert(run('document.getElementById("hovForecastResult").dataset.trend==="worsened" && document.querySelector("#hovForecastResult .forecast-limit").textContent==="0.2 IPS超"')
            &&run('document.getElementById("cruiseForecastResult").dataset.trend==="none"')===(hov===.32),
            'No.3 HOV worsening and actual Cruise missing status stay visible outside collapsed caution');
          assert(candidate.predictions[0].endpoint>hov, 'No.3 cannot improve HOV at this shared amount');
        }
        displayed.push(value);
      }
      assert(run('JSON.stringify({learning:learning.inspect(),dots:dotSets,records:BalanceState.keys.map(key=>appStorage.getItem(key))})===consistencyBefore'),
        'cycling and diagnostics preserve learning and measurements');
      traces.push({basis:'screenshot approximation, not imported device state',currentHov:hov,currentCruise:.33,
        rotations:{hov:-41,cruise:-60},amount:'1/4',order,candidates,displayed});
      if(hov===.32) {
        run(`window.consistencyLearning=JSON.stringify(learning.inspect());
          dotSets.at(-1).red={radius:.19,angle:112.5,color:'red',clock:'3:45'};renderDots();`);
        assert(run('guideCandidateIndex===2&&guideNumberChoices[0].blade===2&&guideNumberChoices[1].blade===1&&guideNumberChoices[2].blade===3'),
          'measurement improvement reranks while retaining third selected No');
        assert(run('memoValues[0]==="3"&&memoValues[3]===forecastGuides.red.direction&&adjustmentForecast.values[0]==="3"'),
          'No.1 improvement does not mix No.1 forecast with selected No.3');
        assert(run('JSON.stringify(learning.inspect())===consistencyLearning'), 'unarmed measurement update does not train or replace learning');
      }
    }
    output.textContent=`PASS: ${checks} checks\n${JSON.stringify(traces,null,2)}`;document.title='PASS';
  } catch(error) {output.textContent=`FAIL after ${checks} checks\n${error.stack}\n${JSON.stringify(traces,null,2)}`;document.title='FAIL';}
})();
