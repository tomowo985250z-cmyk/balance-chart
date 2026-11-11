(async()=>{
  const output=document.getElementById('results');let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  try{
    const params=new URLSearchParams(location.search);
    if(params.get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');frame.style.cssText='width:390px;height:950px';
    let loaded=new Promise(ok=>frame.onload=ok);frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code);
    const select=(index,value)=>run(`memoButtons[${index}].click();selectedMemoValue='${value}';confirmMemoPicker.click()`);
    const go=page=>run(`chartPageButtons[${page}].click()`);
    const reload=async()=>{run('balanceFlushState()');loaded=new Promise(ok=>frame.onload=ok);frame.contentWindow.location.reload();await loaded;};
    const measure=(red,blue)=>run(`redInputs.forEach((input,i)=>input.value=${JSON.stringify(red??['','',''])}[i]);
      blueInputs.forEach((input,i)=>input.value=${JSON.stringify(blue??['','',''])}[i]);addDotButton.click()`);
    const setup=(page,automatic)=>run(`adjustmentSequence=null;adjustmentLock=null;adjustmentForecast=null;confirmedCarry=null;
      selectedAdjustmentTarget=null;learning.reset([]);dotSets.splice(0);forecastDisplayCache.clear();
      memoPicker.hidden=true;activeMemoIndex=null;memoValues.fill('');adjustmentSelections.forEach(v=>v.fill(''));
      guideCandidateIndices.fill(0);retainedGuideNumbers.fill(null);pitchAutoMode=false;trimAutoMode=false;
      showChartPage(${page});applyChartRotation(0,0);pitchAutoMode=trimAutoMode=${automatic};
      redInputs.forEach((input,i)=>input.value=['3','0','0.5'][i]);blueInputs.forEach((input,i)=>input.value=['4','0','0.5'][i]);
      addDotButton.click();updateMemoButtons();updateEditingUI();setGuidesVisible(true)`);
    if(params.has('screenshot')){
      const firstPage=Number(params.get('first'))===1?1:0;
      frame.style.cssText='width:390px;height:1500px;border:0;display:block';document.body.style.margin='0';output.hidden=true;
      setup(firstPage,false);select(0,'1');select(3,'UP');select(2,firstPage?'1':'1/4');run('addAdjustmentButton.click()');
      measure(['2','0','0.2'],null);go(1-firstPage);
      for(let i=0;i<3&&run('adjustmentForecast?.points.length')!==2;i++)run('guideCandidateToggle.click()');
      assert(run('getOriginSnapshot(getAdjustmentStartSet()).blue.kind==="confirmed" && getOriginSnapshot(getAdjustmentStartSet()).red.kind==="actual"'),'screenshot shows actual HOV and inherited Cruise');
      assert(run('adjustmentForecast?.points.length===2'),'both preview points available');
      run('adjustmentForm.scrollIntoView({block:"start"})');output.textContent=`PASS: ${checks} screenshot checks`;document.title='PASS';return;
    }
    for(const firstPage of [0,1])for(const automatic of [false,true])for(const updated of ['none','red','blue','both','staggered']){
      const label=`${firstPage?'TAB-LINK':'LINK-TAB'}/${automatic?'auto':'manual'}/${updated}`;
      setup(firstPage,automatic);select(0,'1');select(3,'UP');select(2,firstPage?'1':'1/4');run('addAdjustmentButton.click()');
      assert(run('confirmedCarry?.points.length===2 && adjustmentSequence?.stages.length===1'),label+': both confirmed endpoints saved');
      const first=run('structuredClone(adjustmentSequence.stages[0])');
      const learned=run('JSON.stringify([learning.inspect().models,learning.inspect().samples])');
      if(updated==='red'||updated==='staggered')measure(['2','0','0.2'],null);
      if(updated==='blue')measure(null,['5','0','0.3']);
      if(updated==='both')measure(['2','0','0.2'],['5','0','0.3']);
      if(updated==='staggered')measure(null,['5','0','0.3']);
      if(updated==='both')assert(run('!!adjustmentSequence && !adjustmentLock && !Object.keys(adjustmentSequence.active).length'),label+': complete actual releases both page locks and retains history');
      else assert(run('adjustmentSequence?.stages.length===1'),label+': partial/no measurements retain first stage');
      go(1-firstPage);
      assert(run('!memoOne.disabled && !memoThree.disabled && !memoFour.disabled && !addAdjustmentButton.disabled'),label+': opposite page editable');
      const start=run(`(()=>{const s=getAdjustmentStartSet();return {points:['red','blue'].map(color=>({color,...getDotCoordinates(s[color])})),origins:getOriginSnapshot(s)};})()`);
      for(const color of ['red','blue']){
        const fresh=updated==='both'||updated==='staggered'||updated===color;
        const expected=fresh?run(`getDotCoordinates(dotSets.findLast(set=>set['${color}'])['${color}'])`):first.forecast.points.find(p=>p.color===color);
        const actual=start.points.find(p=>p.color===color);
        assert(Math.hypot(actual.x-expected.x,actual.y-expected.y)<1e-8,label+': '+color+' uses '+(fresh?'new actual':'confirmed prediction'));
        assert(start.origins[color].kind===(fresh?'actual':'confirmed'),label+': '+color+' provenance is explicit');
      }
      if(updated==='red')assert(run('dotSets.at(-1).blue===null && !adjustmentOriginStatus.hidden && adjustmentOriginStatus.textContent.includes("巡航 確定予測を引継ぎ")'),label+': missing Cruise is not filled into measurements');
      if(updated==='blue')assert(run('dotSets.at(-1).red===null && !adjustmentOriginStatus.hidden && adjustmentOriginStatus.textContent.includes("HOV 確定予測を引継ぎ")'),label+': missing HOV is not filled into measurements');
      for(const width of [320,375,390,430]){
        frame.style.width=width+'px';await new Promise(ok=>setTimeout(ok,20));
        assert(run('document.documentElement.scrollWidth<=innerWidth'),label+': origin labels fit '+width+'px');
      }
      frame.style.width='390px';
      for(let i=0;i<3;i++){
        run('guideCandidateToggle.click()');select(2,firstPage?'1/4':'1');
        assert(run(`!adjustmentForecast || adjustmentForecast.points.every(p=>{
          const s=getAdjustmentStartSet(),start=getDotCoordinates(s[p.color]),guide=forecastGuides[p.color];
          return guide && Math.hypot(p.x-start.x-guide.unit.x*p.distance,p.y-start.y-guide.unit.y*p.distance)<1e-8;})`),label+': predictions use the mixed origin');
        assert(run(`[...dotOverlay.querySelectorAll('.guide-direction-line')].every(node=>{
          const color=node.getAttribute('marker-end').includes('red')?'red':'blue',line=guideDisplayGeometry.get(node),p=getDotCoordinates(getAdjustmentStartSet()[color]);
          const start=Math.hypot(line.base.x-397,line.base.y-520)>240?line.base:line.start;
          return Math.hypot(line.base.x-p.x,line.base.y-p.y)<1e-8&&Math.hypot(Number(node.getAttribute('x1'))-start.x,Number(node.getAttribute('y1'))-start.y)<1e-6;})`),label+': normal guide spans the inherited origin');
      }
      const records=run('JSON.stringify(dotSets)'),carry=run('JSON.stringify(confirmedCarry)');
      const signature=JSON.stringify(start.points);
      go(firstPage);if(updated==='none')assert(run('memoOne.disabled && addAdjustmentButton.disabled'),label+': original page stays locked without a new actual');
      go(1-firstPage);await reload();
      assert(run('JSON.stringify(confirmedCarry)')===carry,label+': carry survives reload');
      assert(run(`JSON.stringify(['red','blue'].map(color=>({color,...getDotCoordinates(getAdjustmentStartSet()[color])})))`)===signature,label+': origins survive page switch and reload');
      assert(run('JSON.stringify(dotSets)')===records,label+': history remains actual-only');
      select(0,'1');select(3,'UP');select(2,firstPage?'1/4':'1');run('addAdjustmentButton.click()');
      assert(run('adjustmentSequence?.stages.length===2'),label+': next adjustment confirms while old history remains');
      assert(run('JSON.stringify([learning.inspect().models,learning.inspect().samples])')===learned,label+': carried positions never train models');
      if(updated==='none')for(const page of [0,1]){go(page);assert(run('memoOne.disabled && addAdjustmentButton.disabled'),label+': both pages lock after both confirmations');}
      run(`document.getElementById('resetLearning').click();deleteConfirmation.close('delete');deleteConfirmation.dispatchEvent(new Event('close'))`);
      assert(run('!!confirmedCarry && !!adjustmentSequence'),label+': learning reset preserves confirmed positions and history');
    }
    for(const firstPage of [0,1]){
      setup(firstPage,false);select(0,'1');select(3,'UP');select(2,firstPage?'1':'1/4');run('addAdjustmentButton.click()');
      measure(['2','0','0.2'],null);go(1-firstPage);
      const blue=run('structuredClone(confirmedCarry.points.find(p=>p.color==="blue"))');
      assert(run('getOriginSnapshot(getAdjustmentStartSet()).blue.kind')==='confirmed','late Cruise initially uses confirmed origin');
      run(`startCruiseAddition(dotSets.at(-1));blueInputs.forEach((input,i)=>input.value=['6','0','0.31'][i]);addDotButton.click()`);
      assert(run('getOriginSnapshot(getAdjustmentStartSet()).blue.kind')==='actual','late Cruise actual overrides carried position');
      assert(run(`(()=>{const p=getDotCoordinates(getAdjustmentStartSet().blue),a=getDotCoordinates(dotSets.at(-1).blue);return Math.hypot(p.x-a.x,p.y-a.y)<1e-8;})()`),'late Cruise exact actual coordinate wins');
      assert(run('confirmedCarry.points.find(p=>p.color==="blue").x')===blue.x,'late actual does not rewrite archived prediction');
      assert(run('adjustmentSequence.stages.length===1 && !adjustmentLock'),'late actual preserves pending second-stage operation');
      run('balanceFlushState();window.carryBackup=appStorage.exportText();restoringAppState=true;appStorage.importText(carryBackup)');
      loaded=new Promise(ok=>frame.onload=ok);run('location.reload()');await loaded;
      assert(run('getOriginSnapshot(getAdjustmentStartSet()).blue.kind')==='actual','backup preserves individual actual override');
      assert(run(`(()=>{const ui=JSON.parse(appStorage.getItem(BalanceState.uiKey));ui.confirmedCarry.observed.blue={id:1,signature:null};
        try{BalanceState.validateUI(ui);return false;}catch{return true;}})()`),'invalid carry provenance rejected');
      select(0,'1');select(3,'UP');select(2,firstPage?'1/4':'1');run('addAdjustmentButton.click()');
      assert(run('adjustmentSequence.stages.length===2'),'second stage confirms after late actual');
      const final=run('structuredClone(confirmedCarry)');
      measure(['2','0','0.21'],null);
      assert(run('!!adjustmentSequence && !adjustmentLock && !Object.keys(adjustmentSequence.active).length'),'new actual releases both page locks and keeps prior history');
      const inherited=run('getDotCoordinates(getAdjustmentStartSet().blue)'),expected=final.points.find(p=>p.color==='blue');
      assert(Math.hypot(inherited.x-expected.x,inherited.y-expected.y)<1e-8,'new cycle retains the last final Cruise prediction');
      assert(run('dotSets.at(-1).blue===null'),'new-cycle carried Cruise remains absent from actual history');
      await reload();
      assert(run('getOriginSnapshot(getAdjustmentStartSet()).blue.kind')==='confirmed','new-cycle carry survives reload');
      run(`startCruiseAddition(dotSets.at(-1));blueInputs.forEach((input,i)=>input.value=['7','0','0.25'][i]);addDotButton.click()`);
      assert(run('getOriginSnapshot(getAdjustmentStartSet()).blue.kind')==='actual','later actual overrides previous-cycle prediction');
      assert(run('learning.inspect().samples.length===0 && Object.keys(learning.inspect().models).length===0'),'no carried origin enters learned samples across cycles');
    }
    output.textContent=`PASS: ${checks} checks — independent actual/confirmed origins, partial/staggered/no updates, both orders/modes, late actual overrides, repeated cycles, exact forecasts, normal guides, reload/backup, actual-only history and unchanged learning`;
    document.title='PASS';frame.remove();
  }catch(e){output.textContent=`FAIL after ${checks} checks\n${e.stack}`;document.title='FAIL';}
})();
