(async()=>{
  const output=document.getElementById('results');let checks=0;const failures=[];
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  try{
    if(new URLSearchParams(location.search).get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');frame.style.cssText='width:390px;height:950px';
    let loaded=new Promise(ok=>frame.onload=ok);frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code);
    const reload=async()=>{run('balanceFlushState()');loaded=new Promise(ok=>frame.onload=ok);frame.contentWindow.location.reload();await loaded;};
    const select=(index,value)=>{
      run(`memoButtons[${index}].click()`);
      assert(run(`!memoPicker.hidden && activeMemoIndex===${index}`),'picker opens '+index);
      run(`const option=[...memoWheel.querySelectorAll('[data-value]')].find(node=>node.dataset.value==='${value}');
        option.click();selectMemoOption(option);confirmMemoPicker.click()`);
      assert(run(`memoValues[${index}]==='${value}' && memoPicker.hidden`),'picker confirms '+index+'/'+value);
    };
    const setup=page=>run(`adjustmentSequence=null;adjustmentLock=null;confirmedCarry=null;adjustmentForecast=null;selectedAdjustmentTarget=null;
      memoPicker.hidden=true;activeMemoIndex=null;learning.reset([]);dotSets.splice(0);forecastDisplayCache.clear();
      adjustmentSelections.forEach(v=>v.fill(''));memoValues.fill('');guideCandidateIndices.fill(0);retainedGuideNumbers.fill(null);
      pitchAutoMode=false;trimAutoMode=false;showChartPage(${page});guideCandidateIndex=0;applyChartRotation(0,0);
      redInputs.forEach((input,i)=>input.value=['2','0','0.4'][i]);blueInputs.forEach((input,i)=>input.value=['5','0','0.3'][i]);
      addDotButton.click();updateMemoButtons();updateEditingUI();setGuidesVisible(true);`);
    const go=page=>run(`chartPageButtons[${page}].click()`);
    const reset=()=>run(`redInputs.forEach((input,i)=>input.value=['2','0','0.4'][i]);blueInputs.forEach(input=>input.value='');addDotButton.click()`);
    for(const firstPage of [0,1])for(const variant of ['normal','legacy-current','legacy-other','legacy-empty','partial']){
      const label=`${firstPage?'TAB-to-LINK':'LINK-to-TAB'}/${variant}`;
      try{
        setup(firstPage);run(`pitchAutoMode=trimAutoMode=${variant.startsWith('legacy')};renderDots()`);
        select(0,'1');select(3,variant==='partial'&&firstPage===0?'DOWN':'UP');select(2,firstPage?'1':'1/4');
        if(variant==='partial'&&firstPage===1)run('dotSets.at(-1).blue=null;saveDotSets();renderDots()');
        run('addAdjustmentButton.click()');
        assert(run('memoOne.disabled && memoThree.disabled && memoFour.disabled && addAdjustmentButton.disabled'),label+': first confirmed page is locked');
        const firstValues=run('JSON.stringify(dotSets.at(-1).adjustments.at(-1))');
        let firstPoints=run('JSON.stringify(adjustmentForecast?.points??[])');
        if(variant.startsWith('legacy')){
          // An old saved lock has no sequence, but retains its confirmed forecast and history.
          run(`const {page,values,rank,guideBlade,targetId,actualAdjustment}=adjustmentLock;
            adjustmentLock={page,values,rank,guideBlade,targetId,actualAdjustment};adjustmentSequence=null;
            updateMemoButtons();updateEditingUI();balanceFlushState();
            window.legacyBackup=JSON.parse(appStorage.exportText());
            const ui=JSON.parse(legacyBackup.records[BalanceState.uiKey]);delete ui.adjustmentSequence;delete ui.confirmedCarry;
            if('${variant}'==='legacy-other')ui.currentChartPage=${1-firstPage};
            if('${variant}'==='legacy-empty'){ui.forecast=null;ui.forecastCache=[];}
            legacyBackup.records[BalanceState.uiKey]=JSON.stringify(ui);restoringAppState=true;appStorage.importText(JSON.stringify(legacyBackup));`);
          loaded=new Promise(ok=>frame.onload=ok);run('location.reload()');await loaded;
          if(variant==='legacy-empty')firstPoints='[]';
        }
        go(1-firstPage);
        assert(run('!memoOne.disabled && !memoThree.disabled && !memoFour.disabled && !addAdjustmentButton.disabled'),label+': opposite page permits every adjustment control');
        assert(run('adjustmentSequence?.stages.length===1 && !adjustmentLock'),label+': opposite page is unconfirmed');
        assert(run('JSON.stringify(adjustmentSequence.stages[0].values)')===firstValues,label+': confirmed values retained');
        assert(run('JSON.stringify(adjustmentSequence.stages[0].forecast.points)')===firstPoints,label+': confirmed endpoints retained');
        for(const blade of ['1','2','3'])select(0,blade);
        for(const direction of ['UP','DOWN'])select(3,direction);
        for(const amount of firstPage?['1/4','1/2']:['1','2','3'])select(2,amount);
        if(variant==='legacy-empty'){
          const history=run('JSON.stringify(dotSets)');run('addAdjustmentButton.click()');
          assert(run('!adjustmentLock && adjustmentSequence.stages.length===1'),label+': unknown origin does not lock second page');
          assert(run('JSON.stringify(dotSets)')===history,label+': unknown origin is not fabricated');
          await reload();
          assert(run('!appStorage.readOnly && !adjustmentLock && !memoThree.disabled'),label+': incomplete first stage remains editable after reload');
        }else{
          run('guideCandidateToggle.click()');
          const expectedColors=JSON.parse(firstPoints).length;
          for(let i=0;i<3&&run(`dotOverlay.querySelectorAll('.adjustment-forecast [data-color]').length`)!==expectedColors;i++)run('guideCandidateToggle.click()');
          assert(run(`adjustmentSequence.stages[0].forecast.points.every(p=>{
            const q=getDotCoordinates(getAdjustmentStartSet()[p.color]);return Math.hypot(q.x-p.x,q.y-p.y)<1e-8;})`),label+': second origin equals frozen first points');
          assert(run(`dotOverlay.querySelectorAll('.adjustment-forecast [data-color]').length===${expectedColors}`),label+': all available final predictions displayed');
          assert(run(`[...dotOverlay.querySelectorAll('.guide-direction-line')].every(node=>{
            const color=node.getAttribute('marker-end').includes('red')?'red':'blue';
            const p=adjustmentSequence.stages[0].forecast.points.find(p=>p.color===color);
            const line=guideDisplayGeometry.get(node),start=Math.hypot(line.base.x-397,line.base.y-520)>240?line.base:line.start;
            return Math.hypot(line.base.x-p.x,line.base.y-p.y)<1e-8
              && Math.hypot(Number(node.getAttribute('x1'))-start.x,Number(node.getAttribute('y1'))-start.y)<1e-6;})`),label+': second guides match normal rendering through first predictions');
          select(0,'1');select(3,'UP');select(2,firstPage?'1/4':'1');run('addAdjustmentButton.click()');
          assert(run('adjustmentSequence.stages.length===2'),label+': second add button confirms');
          await reload();
          for(const page of [0,1]){go(page);assert(run('memoOne.disabled && memoThree.disabled && memoFour.disabled && addAdjustmentButton.disabled'),label+': both pages locked after second');}
        }
        reset();for(const page of [0,1]){go(page);assert(run('!memoOne.disabled && !memoThree.disabled && !memoFour.disabled && !addAdjustmentButton.disabled'),label+': new measurement unlocks both pages');}
      }catch(e){failures.push(label+': '+e.message);}
    }
    if(failures.length)throw Error(failures.join('\n'));
    output.textContent=`PASS: ${checks} checks — real Edge button/picker/page events, both orders, legacy saved locks, partial predictions, inherited guides/final dots, second confirmation and reset`;
    document.title='PASS';frame.remove();
  }catch(e){output.textContent=`FAIL after ${checks} checks\n${e.stack}`;document.title='FAIL';}
})();
