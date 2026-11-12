(async () => {
  const output = document.getElementById('results'), params = new URLSearchParams(location.search);
  let checks = 0; const cases = [];
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  const tick = () => new Promise(resolve => setTimeout(resolve, 30));
  try {
    if (params.get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe'); frame.style.cssText = 'width:375px;height:1900px;border:0';
    let loaded = new Promise(resolve => frame.onload = resolve); frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    assert(run('twoAdjustmentReferenceReady&&twoAdjustmentReferenceError===null'), 'production initializes without errors');
    assert(run(`(()=>{
      const start={red:{x:3,y:1},blue:{x:5,y:2}},center={x:0,y:0},amounts=BalanceLearning.amounts;
      const numeric=s=>s.includes('/')?Number(s.split('/')[0])/Number(s.split('/')[1]):Number(s);
      const predict=(points,a)=>{const amount=numeric(a.amountText),sign=a.direction==='UP'?-1:1,
        dx=amount*sign*(a.blade+1)/10,dy=(a.blade-2)*amount/20;
        return {action:{...a,amount},start:points,points:{red:{x:points.red.x+dx,y:points.red.y+dy},blue:{x:points.blue.x+dx*(a.type==='TAB'?2:1),y:points.blue.y-dy}},crossGap:Infinity};};
      const score=points=>{const red=Math.hypot(points.red.x,points.red.y)/10,blue=Math.hypot(points.blue.x,points.blue.y)/10;
        return[red<=.2?0:1,red<=.2?0:red,Math.max(red,blue),red+blue,Number(red>Math.hypot(3,1)/10+1e-9)+Number(blue>Math.hypot(5,2)/10+1e-9),Infinity];};
      const compare=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]<b[i])return-1;if(a[i]>b[i])return 1;}return 0;};
      let oracle=null,count=0;for(const order of [['LINK','TAB'],['TAB','LINK']])for(const first of BalanceTwoAdjustment.actions(order[0],amounts))for(const second of BalanceTwoAdjustment.actions(order[1],amounts)){
        const result=predict(predict(start,first).points,second),s=score(result.points);count++;if(!oracle||compare(s,oracle)<0)oracle=s;
      }
      const result=BalanceTwoAdjustment.search({start,amounts,predict,center,radius:10});
      return count===1944&&result.evaluated===1944&&result.groups.length===18&&compare(score(result.winner.final),oracle)===0;
    })()`),'independent exhaustive oracle verifies all 1944 plans and final HOV/center/worsening priority');
    assert(run(`!BalanceTwoAdjustment.search({start:{red:{x:1,y:1}},amounts:BalanceLearning.amounts,predict:()=>null,center:{x:0,y:0},radius:10}).winner`),'missing color never fabricated');
    assert(run(`!BalanceTwoAdjustment.search({start:{red:{x:1,y:1},blue:{x:2,y:2}},amounts:BalanceLearning.amounts,predict:()=>null,center:{x:0,y:0},radius:10}).winner`),'no available prediction gives no candidate');
    const fixture = (r = .03, ra = 305, b = .46, ba = 30, redAngle = -34.4, blueAngle = -90) => `
      adjustmentSequence=null;adjustmentLock=null;confirmedCarry=null;adjustmentForecast=null;selectedAdjustmentTarget=null;
      learning.reset([]);dotSets.splice(0);forecastDisplayCache.clear();retainedGuideNumbers.fill(null);guideCandidateIndices.fill(0);
      pitchAutoMode=false;trimAutoMode=false;memoValues.fill('');adjustmentSelections.forEach(v=>v.fill(''));guideCandidateIndex=0;
      Object.assign(manualPitchAngles,{hovAngle:${redAngle},cruiseAngle:${blueAngle}});manualPitchInitialized=true;
      manualTrimCruiseAngle=${blueAngle};autoTrimCruiseAngle=${blueAngle};pageRotations[0]={...manualPitchAngles};pageRotations[1]={...manualPitchAngles};
      showChartPage(1);applyChartRotation(${redAngle},${blueAngle});
      const make=(radius,angle,color)=>radius===null?null:{radius,angle,color,clock:'12:00'};
      if(${r !== null || b !== null})dotSets.push({learningId:newLearningId(),red:make(${r},${ra},'red'),blue:make(${b},${ba},'blue'),adjustments:[]});
      saveDotSets();renderDots();setGuidesVisible(true);updatePitchModeUI();updateTrimModeUI();`;
    run(fixture());
    const select = (execute, index, value) => execute(`openMemoPicker(${index});selectedMemoValue='${value}';previewMemoSelection();confirmMemoPicker.click()`);
    const choose = (execute, blade) => execute(`for(let i=0;i<3&&guideNumberChoices[guideCandidateIndex]?.blade!==${blade};i++)guideCandidateToggle.click()`);
    const immutable = () => run('JSON.stringify([dotSets,learning.inspect(),adjustmentSequence,confirmedCarry,pageRotations,memoValues,guideNumberChoices,guideCandidateIndex,forecastGuides,adjustmentForecast,BalanceState.keys.map(k=>appStorage.getItem(k))])');
    const reference = () => run('JSON.stringify(twoAdjustmentReference)');
    const check = label => {
      const before = immutable(), value = reference();run('updateTwoAdjustmentReference()');
      assert(immutable() === before && reference() === value, label + ': recalculation never changes actuals, learning, history, locks, ranks, inputs or stored values');
      assert(run(`(()=>{const stage=twoAdjustmentReference?.winner?.optimized.find(s=>s.action.type===(currentChartPage?'TAB':'LINK')),
        blade=adjustmentLock?Number(adjustmentLock.guideBlade):guideNumberChoices[guideCandidateIndex]?.blade,
        best=!!stage&&!adjustmentLock&&stage.action.blade===blade,
        button=guideCandidateToggle.getBoundingClientRect(),mode=(currentChartPage?trimModeToggle:pitchModeToggle).getBoundingClientRect();
        return twoAdjustmentReferenceError===null&&(guideCandidateToggle.dataset.twoAdjustmentBest==='true')===best
          &&parseFloat(getComputedStyle(guideCandidateToggle).borderTopWidth)===(best?4:1)
          &&button.height===44&&button.left>=0&&mode.right<=innerWidth&&button.right<=mode.left
          &&document.documentElement.scrollWidth<=innerWidth;})()`), label + ': correct 4px only for displayed best number and unchanged mobile controls');
      assert(run('!document.querySelector("#mode,#comparison,.tab-intersection-buttons")'), label + ': no trial controls in production');
    };
    if (params.has('screenshot')) {
      frame.style.width = (Number(params.get('width')) || 375) + 'px';
      const page = Number(params.get('page') || 0);run(`showChartPage(${page})`);
      const blade = run(`twoAdjustmentReference.winner.optimized.find(s=>s.action.type===(${page}?'TAB':'LINK')).action.blade`);
      choose(run, params.get('state') === 'other' ? blade % 3 + 1 : blade);
      await tick();check('screenshot');output.hidden = true; document.body.style.margin = '0'; run('scrollTo(0,0)');document.title = 'PASS';return;
    }
    const validate = label => {
      assert(run(`(()=>{const r=twoAdjustmentReference;if(!r.winner)return r.groups.length===0;
        return r.groups.every(p=>BalanceTwoAdjustment.compareValues(BalanceTwoAdjustment.key(r.winner.metrics),BalanceTwoAdjustment.key(p.metrics))<=0)
          &&r.winner.optimized.every((stage,i)=>!i||JSON.stringify(stage.start)===JSON.stringify(r.winner.optimized[i-1].points));})()`),label+': best final score and chained origins');
      check(label);
    };
    let seed=761541;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<32;i++){
      const args=i===0?[]:[.02+random()*.5,random()*360,.05+random()*.7,random()*360,random()*120-60,random()*180-90];
      run(fixture(...args));validate('generated '+i);
    }
    run(fixture());validate('HOV worsening example');
    assert(run('twoAdjustmentReference.evaluated===1944&&twoAdjustmentReference.groups.length===18'),'all 1944 plans and 18 number/order combinations evaluated');
    assert(run('twoAdjustmentReference.winner.metrics.worsened.red&&twoAdjustmentReference.winner.metrics.hovSafe&&twoAdjustmentNote.textContent.includes("HOV悪化")'),'HOV numerical worsening reported even within 0.2 IPS');
    assert(run('Math.abs(twoAdjustmentReference.winner.metrics.ips.red-.10549364904167577)<1e-12&&Math.abs(twoAdjustmentReference.winner.metrics.ips.blue-.025020019854882756)<1e-12'),'known trial IPS retained');
    cases.push(run('structuredClone(twoAdjustmentReference.winner)'));
    const training=`learning.reset([]);dotSets.splice(0);
      const dot=(x,y,color)=>({clock:'12:00',angle:Math.atan2(x-397,520-y)*180/Math.PI,radius:Math.hypot(x-397,y-520)/240,color});
      for(let i=0;i<7;i++){if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
        dotSets.push({learningId:newLearningId(),red:dot(457-i*8,565-i*4,'red'),blue:dot(510-i*14,570-i*6,'blue'),adjustments:i<6?[['1',i%2?'TAB':'LINK',i%2?'1':'1/4','UP']]:[]});
        if(i)learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);}
      pitchAutoMode=true;trimAutoMode=true;saveDotSets();renderDots();`;
    for(const mode of ['waiting','learned']){
      run(fixture());
      const code=mode==='learned'?training:'pitchAutoMode=true;trimAutoMode=true;renderDots()';run(code);
      for(const page of [0,1]){run(`showChartPage(${page})`);validate(mode+'/'+page);}
      if(mode==='learned')assert(run('BalanceTwoAdjustmentContext.create().ready.LINK&&BalanceTwoAdjustmentContext.create().ready.TAB'),'both learning paths genuinely ready');
    }
    for(const width of [320,375,390,430]){
      frame.style.width=width+'px';await tick();run(fixture());
      for(const page of [0,1]){
        run(`showChartPage(${page})`);
        for(let rank=0;rank<3;rank++){check('width '+width+'/'+page+'/'+rank);const next=run('guideNumberChoices[(guideCandidateIndex+1)%3].blade');run('guideCandidateToggle.click()');assert(run('guideNumberChoices[guideCandidateIndex].blade')===next,'native cycling unchanged');}
        const plan=run('structuredClone(twoAdjustmentReference.winner)');
        for(const direction of ['UP','DOWN']){select(run,3,direction);select(run,2,page?'2':'1/3');check('manual changes');}
        assert(run('twoAdjustmentReference.winner.metrics.max')===plan.metrics.max,'manual selection never changes full-search optimum');
      }
    }
    for(const args of [[null,0,.3,30],[.1,30,null,0],[null,0,null,0]]){
      run(fixture(...args));validate('missing origins');assert(run('!twoAdjustmentReference.winner&&twoAdjustmentNote.hidden&&guideCandidateToggle.dataset.twoAdjustmentBest==="false"'),'no fabricated missing-color measurements or highlight');
    }
    // This deliberately off-chart fixture tests the HOV warning; mobile bounds are checked above.
    run(fixture(10,90,10,270));const outside=immutable();run('updateTwoAdjustmentReference()');
    assert(immutable()===outside,'unreachable HOV diagnostics do not modify actuals or selection');
    assert(run('!twoAdjustmentReference.winner.metrics.hovSafe&&twoAdjustmentNote.textContent.includes("HOV 0.2 IPS以内に到達する候補はありません")'),'no false HOV success when every final candidate exceeds .2');
    for(const first of [0,1]){
      run(fixture());run(`showChartPage(${first})`);
      const plan=run(`twoAdjustmentReference.groups.find(p=>p.order===(${first}?'TAB→LINK':'LINK→TAB'))`),action=plan.optimized[0].action;
      choose(run,action.blade);select(run,2,action.amountText);select(run,3,action.direction);run('addAdjustmentButton.click()');
      const confirmed=run('JSON.stringify(adjustmentSequence.stages)');validate('one side confirmed '+first);
      assert(run(`!!adjustmentLock&&twoAdjustmentReference.evaluated===${first?54:18}&&guideCandidateToggle.dataset.twoAdjustmentBest==='false'`),'only unconfirmed side explored, confirmed button lock unchanged');
      run('updateTwoAdjustmentReference()');assert(run('JSON.stringify(adjustmentSequence.stages)')===confirmed,'frozen confirmed history preserved');
      run(`showChartPage(${1-first})`);validate('remaining side');
      const last=run('twoAdjustmentReference.winner.optimized[0].action');
      const predicted=run('structuredClone(twoAdjustmentReference.winner.final)');
      choose(run,last.blade);select(run,2,last.amountText);select(run,3,last.direction);run('addAdjustmentButton.click()');
      assert(run(`confirmedCarry.points.every(p=>Math.hypot(p.x-${JSON.stringify(predicted)}[p.color].x,p.y-${JSON.stringify(predicted)}[p.color].y)<1e-7)`),'reference final points match actual two confirmations');
      for(const page of [0,1]){run(`showChartPage(${page})`);validate('both confirmed');assert(run('!twoAdjustmentReference.winner&&!!adjustmentLock&&guideCandidateToggle.disabled&&twoAdjustmentNote.hidden'),'both confirmed stop exploration without releasing locks');}
      const actual=`redInputs.forEach((input,i)=>input.value=['3','0','.1'][i]);blueInputs.forEach(input=>input.value='');addDotButton.click()`;
      run(actual);validate('new partial actual');assert(run('!adjustmentLock&&twoAdjustmentReference.winner&&learning.inspect().samples.length===0'),'new actual unlocks and carries missing blue without training predictions');
    }
    run('balanceFlushState()');const expected=run('JSON.stringify(twoAdjustmentReference.winner)');
    loaded=new Promise(resolve=>frame.onload=resolve);frame.contentWindow.location.reload();await loaded;await tick();check('reload');
    assert(run('JSON.stringify(twoAdjustmentReference.winner)')===expected,'reference recomputed from restored actual/history without persisting synthetic forecasts');
    output.textContent=`PASS: ${checks} checks — 1944 plans/18 groups, chained origins, known IPS, manual/waiting/learned, HOV worsening, no candidate, partial/both locks, actual confirmation/restart, non-mutation, reload and four widths\n`+JSON.stringify({cases},null,2);
    document.title='PASS';frame.remove();
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
