(async()=>{
  const output=document.getElementById('results'),params=new URLSearchParams(location.search);let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  try {
    if(params.get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');frame.style.cssText='width:375px;height:900px;border:0';
    let loaded=new Promise(resolve=>frame.onload=resolve);frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code),tick=()=>new Promise(resolve=>setTimeout(resolve,50));
    const reload=async()=>{run('balanceFlushState()');loaded=new Promise(resolve=>frame.onload=resolve);frame.contentWindow.location.reload();await loaded;await tick();};
    const select=(index,value)=>run(`openMemoPicker(${index});selectedMemoValue='${value}';confirmMemoPicker.click()`);
    const setup=(page,mode)=>run(`
      adjustmentSequence=null;adjustmentLock=null;adjustmentForecast=null;selectedAdjustmentTarget=null;
      memoPicker.hidden=true;activeMemoIndex=null;learning.reset([]);dotSets.splice(0);forecastDisplayCache.clear();
      adjustmentSelections.forEach(v=>v.fill(''));memoValues.fill('');retainedGuideNumbers.fill(null);guideCandidateIndices.fill(0);
      pitchAutoMode=false;trimAutoMode=false;showChartPage(${page});guideCandidateIndex=0;applyChartRotation(0,0);
      const dot=(x,y,color)=>({clock:'12:00',angle:Math.atan2(x-397,520-y)*180/Math.PI,radius:Math.hypot(x-397,y-520)/240,color});
      for(let i=0;i<${mode==='learned'?4:1};i++){
        if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
        dotSets.push({learningId:newLearningId(),red:dot(517+(3-i)*30,620+(3-i)*17.32,'red'),
          blue:dot(527+(3-i)*40,670+(3-i)*25,'blue'),adjustments:i<${mode==='learned'?3:0}?[['1','${page?'TAB':'LINK'}','1','UP']]:[]});
        if(i)learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
      }
      pitchAutoMode='${mode}'!=='manual';trimAutoMode=pitchAutoMode;saveDotSets();renderDots();setGuidesVisible(true);
    `);
    const reset=()=>run(`document.getElementById('resetLearning').click();deleteConfirmation.close('delete');deleteConfirmation.dispatchEvent(new Event('close'))`);
    if(!params.has('screenshot')) {
    for(const width of [320,375,390,430])for(const firstPage of [0,1])for(const mode of ['manual','waiting','learned']) {
      frame.style.width=width+'px';await tick();setup(firstPage,mode);
      select(0,'1');select(3,'UP');select(2,firstPage?'1':'1/4');
      const real=run('JSON.stringify(dotSets.map(set=>[set.red,set.blue]))');
      run('adjustmentForm.requestSubmit()');
      const label=`${width}/${firstPage?'TAB→LINK':'LINK→TAB'}/${mode}`;
      assert(run('adjustmentSequence?.stages.length===1 && !!adjustmentLock'),label+': first stage saved and locked');
      assert(run('memoButtons.every(b=>b.disabled) && addAdjustmentButton.disabled && rotationLocked'),label+': first controls locked');
      const first=run('JSON.stringify(adjustmentSequence.stages[0])');
      assert(run(`['red','blue'].every(color=>adjustmentSequence.stages[0].forecast.points.some(p=>p.color===color))`),label+': both first endpoints stored');
      run(`showChartPage(${1-firstPage})`);
      assert(run(`!adjustmentLock && !addAdjustmentButton.disabled && !memoButtons[2].disabled && adjustmentTarget.disabled
        && memoValues[1]==='${firstPage?'LINK':'TAB'}'`),label+': only opposite type can edit, target remains fixed');
      assert(run(`dotOverlay.querySelector('.first-stage-forecast')?.dataset.state==='confirmed-history'
        && dotOverlay.querySelectorAll('.first-stage-forecast .forecast-glow').length===2`),label+': first endpoints appear as solid confirmed dots while editing second stage');
      assert(run(`[...dotOverlay.querySelectorAll('.first-stage-forecast [data-color]')].every(node=>{
        const p=adjustmentSequence.stages[0].forecast.points.find(p=>p.color===node.dataset.color),m=node.transform.baseVal.getItem(0).matrix;
        return Math.hypot(m.e-p.x,m.f-p.y)<1e-4;})`),label+': confirmed first dots remain at saved coordinates');
      assert(run(`(()=>{const start=getAdjustmentStartSet();return adjustmentSequence.stages[0].forecast.points.every(p=>{
        const q=getDotCoordinates(start[p.color]);return Math.abs(q.x-p.x)<1e-8&&Math.abs(q.y-p.y)<1e-8;
      });})()`),label+': second stage starts at both frozen points');
      assert(run('JSON.stringify(dotSets.map(set=>[set.red,set.blue]))')===real,label+': actual dots remain unchanged');
      // Waiting/manual geometry also covers every candidate and quantity without replacing the existing selector.
      if(mode!=='learned')for(let rank=0;rank<3;rank++){
        if(rank)run('guideCandidateToggle.click()');
        for(const amount of firstPage?['1/8','1/4','1/2']:['1','2','3']){
          select(2,amount);
          assert(run(`(()=>{const first=adjustmentSequence.stages[0].forecast.points;
            return [...dotOverlay.querySelectorAll('.guide-direction-line')].every(node=>{
              const color=node.getAttribute('marker-end').includes('red')?'red':'blue',p=first.find(p=>p.color===color);
              const line=guideDisplayGeometry.get(node);
              const start=Math.hypot(line.base.x-397,line.base.y-520)>240?line.base:line.start;
              return Math.abs(line.base.x-p.x)<1e-8&&Math.abs(line.base.y-p.y)<1e-8
                && Math.abs(Number(node.getAttribute('x1'))-start.x)<1e-6&&Math.abs(Number(node.getAttribute('y1'))-start.y)<1e-6;
            });})()`),label+': second guides use normal display endpoints and retain first prediction origins');
          assert(run(`!adjustmentForecast || adjustmentForecast.points.every(p=>{
            const start=adjustmentSequence.stages[0].forecast.points.find(q=>q.color===p.color),guide=forecastGuides[p.color];
            const action=BalanceLearning.adjustment(adjustmentForecast.values);
            const prediction=learning.predict(action.type,p.color,action.blade,action.direction,action.amount,start);
            const estimate=resolveDisplayDistance(action,p.color,prediction,prediction?[]:learning.inspect().samples,240);
            return estimate&&Math.abs(p.x-start.x-guide.unit.x*estimate.distance)<1e-8&&Math.abs(p.y-start.y-guide.unit.y*estimate.distance)<1e-8;
          })`),label+': second predictions use the existing method at the inherited origin');
        }
      }
      select(0,'1');select(3,'UP');select(2,firstPage?'1/4':'1');
      run('renderDirectionLines(true)');
      const draft=run('JSON.stringify({values:memoValues,forecast:adjustmentForecast})');
      run(`showChartPage(${firstPage});guideCandidateToggle.click();adjustmentForm.requestSubmit()`);
      assert(run('JSON.stringify(adjustmentSequence.stages[0])')===first,label+': returning to first stage preserves its result');
      run(`showChartPage(${1-firstPage})`);
      assert(run('JSON.stringify({values:memoValues,forecast:adjustmentForecast})')===draft,label+': second draft survives page round trip');
      await reload();
      assert(run('JSON.stringify(adjustmentSequence?.stages[0])')===first,label+': first survives reload: '+JSON.stringify({before:JSON.parse(first),after:run('adjustmentSequence?.stages[0]'),error:run('appStorage.error')}));
      assert(run('JSON.stringify({values:memoValues,forecast:adjustmentForecast})')===draft,label+': pending second stage survives reload');
      run('adjustmentForm.requestSubmit()');
      assert(run('adjustmentSequence?.stages.length===2 && !!adjustmentLock'),label+': second confirmed');
      assert(run(`dotOverlay.querySelector('.first-stage-forecast')?.dataset.state==='confirmed-history'
        && Number(dotOverlay.querySelector('.first-stage-forecast [data-color]').style.opacity)===.5
        && !dotOverlay.querySelector('.first-stage-forecast .forecast-glow')`),label+': confirming second stage changes old dots to the previous display');
      assert(run(`dotOverlay.querySelector('.adjustment-forecast.fixed')?.dataset.confirmedStage==='2'
        && dotOverlay.querySelectorAll('.adjustment-forecast.fixed [data-color]').length===2`),label+': final endpoints appear as new confirmed dots');
      run('guideToggle.click()');
      assert(run(`getComputedStyle(dotOverlay.querySelector('.first-stage-forecast')).display==='none'
        && !dotOverlay.querySelector('.adjustment-forecast')`),label+': guide OFF hides both sets');
      run('guideToggle.click()');
      assert(run(`getComputedStyle(dotOverlay.querySelector('.first-stage-forecast')).display!=='none'
        && getComputedStyle(dotOverlay.querySelector('.adjustment-forecast')).display!=='none'`),label+': guide ON restores both sets');
      const sequence=run('JSON.stringify(adjustmentSequence)');
      for(const page of [0,1]){
        run(`showChartPage(${page});adjustmentForm.requestSubmit();guideCandidateToggle.click();memoThree.click()`);
        assert(run('memoButtons.every(b=>b.disabled) && addAdjustmentButton.disabled && rotationLocked && memoPicker.hidden'),label+': both pages locked after second');
        assert(run('JSON.stringify(adjustmentSequence)')===sequence,label+': third addition blocked and snapshots unchanged');
      }
      assert(run('JSON.stringify(dotSets.map(set=>[set.red,set.blue]))')===real,label+': real dots preserved after both stages');
      run('window.sequenceBackup=appStorage.exportText()');loaded=new Promise(resolve=>frame.onload=resolve);
      run('appStorage.importText(sequenceBackup);location.reload()');await loaded;await tick();
      assert(run('JSON.stringify(adjustmentSequence)')===sequence,label+': backup preserves order, conditions and both results');
      const records=run('JSON.stringify(dotSets)');reset();
      assert(run('!!adjustmentSequence && !!adjustmentLock && addAdjustmentButton.disabled && memoButtons[2].disabled'),label+': learning reset preserves confirmed content and page locks');
      assert(run('JSON.stringify(dotSets)')===records,label+': reset keeps measured and recorded history');
      assert(run('document.documentElement.scrollWidth<=innerWidth'),label+': mobile layout fits');
    }
    output.textContent=`PASS: ${checks} checks — both orders, both inherited origins, stage guides/predictions, locks, drafts, reload, backup, reset and four mobile widths`;
    // Manual directions must freeze coordinates from the selected action, even when the preview is hidden.
    for(const firstPage of [0,1])for(const blade of ['1','2','3'])for(const direction of ['UP','DOWN']){
      setup(firstPage,'manual');select(0,'1');select(3,'UP');select(2,firstPage?'1':'1/4');
      run(`adjustmentForm.requestSubmit();showChartPage(${1-firstPage});applySelectedGuideAdjustment()`);
      select(0,blade);select(3,direction);select(2,firstPage?'1/4':'1');
      const label=`manual ${firstPage}/${blade}/${direction}`;
      const expected=run(`(()=>{const start=getAdjustmentStartSet(),action=BalanceLearning.adjustment(memoValues);
        return ['red','blue'].map(color=>{const p=getDotCoordinates(start[color]);
          const u=getGuideMovementUnit(getDirectionLine(start[color],color,null,action.blade,action.direction));
          const estimate=resolveDisplayDistance(action,color,learning.predict(action.type,color,action.blade,action.direction,action.amount,p),[],240);
          return estimate?{color,x:p.x+u.x*estimate.distance,y:p.y+u.y*estimate.distance}:null;});})()`);
      const learned=run('JSON.stringify([learning.inspect().models,learning.inspect().samples])');
      const preview=run('JSON.stringify(adjustmentForecast)');
      run('adjustmentForm.requestSubmit()');
      if(expected.some(p=>!p)){
        assert(run('adjustmentSequence.stages.length===1 && !adjustmentLock'),label+': missing forecast cannot confirm a second stage');
        assert(run('JSON.stringify(adjustmentForecast)')===preview,label+': rejected second stage keeps editable preview');
        continue;
      }
      assert(run('adjustmentSequence.stages.length===2'),label+': manual second action confirms');
      assert(run(`dotOverlay.querySelectorAll('.adjustment-forecast.fixed [data-color]').length===2`),label+': manual preview hiding ends when the stage is confirmed');
      const actual=run('adjustmentSequence.stages[1].forecast.points');
      assert(expected.every(p=>actual.some(q=>q.color===p.color&&Math.hypot(p.x-q.x,p.y-q.y)<1e-8)),label+': frozen points follow selected direction');
      assert(run('JSON.stringify([learning.inspect().models,learning.inspect().samples])')===learned,label+': compound predictions do not train the engine');
      run('balanceFlushState()');
      assert(run(`(()=>{const state=JSON.parse(appStorage.getItem(BalanceState.uiKey));
        const bad=structuredClone(state);bad.adjustmentSequence.stages[1].page=bad.adjustmentSequence.stages[0].page;
        try{BalanceState.validateUI(bad);return false;}catch{return true;}})()`),label+': invalid same-page sequence rejected');
    }
    for(const firstPage of [0,1])for(const operation of ['reset','measurement','edit','first-delete','second-delete']){
      setup(firstPage,'manual');select(0,'1');select(3,'UP');select(2,firstPage?'1':'1/4');
      run(`adjustmentForm.requestSubmit();showChartPage(${1-firstPage})`);
      if(operation==='second-delete'){
        select(0,'1');select(3,'UP');select(2,firstPage?'1/4':'1');run('adjustmentForm.requestSubmit()');
        assert(run('adjustmentSequence.stages.length===2'),'second deletion fixture has two confirmed stages');
      }
      const previousCount=run('dotSets.length');
      if(operation==='reset')reset();
      else if(operation==='edit')run(`startResultEdit(dotSets.at(-1));redInputs[2].value='0.42';dotForm.requestSubmit()`);
      else if(operation==='measurement')run(`redInputs.forEach((input,i)=>input.value=['2','0','0.4'][i]);
        blueInputs.forEach((input,i)=>input.value=['5','0','0.3'][i]);dotForm.requestSubmit()`);
      else run(`dotList.lastElementChild.querySelectorAll('.dot-adjustment-row button')[${operation==='first-delete'?0:1}].click();
        deleteConfirmation.close('delete');deleteConfirmation.dispatchEvent(new Event('close'))`);
      assert(run(operation==='first-delete'?'!adjustmentSequence && !adjustmentLock':'!!adjustmentSequence && !adjustmentLock'),`${firstPage}/${operation}: only explicitly deleted history is removed`);
      assert(run('!addAdjustmentButton.disabled && !memoButtons[2].disabled'),`${firstPage}/${operation}: editing restored`);
      assert(run('dotSets.length')===previousCount+(operation==='measurement'?1:0),`${firstPage}/${operation}: unrelated measurements preserved`);
    }
    output.textContent=`PASS: ${checks} checks — both orders, inherited origins, selected UP/DOWN coordinates, locks, drafts, reload, backup validation, reset/deletion/measurement recovery and four mobile widths`;
    }
    if(params.has('screenshot')){
      const width=Number(params.get('width'))||375;frame.style.cssText=`width:${width}px;height:900px;border:0;display:block`;
      const firstPage=Number(params.get('first'))===1?1:0;
      document.body.style.margin='0';output.hidden=true;setup(firstPage,'manual');
      run(`Object.assign(dotSets.at(-1),{red:{clock:'3:00',angle:90,radius:.5,color:'red'},
        blue:{clock:'4:00',angle:120,radius:.5,color:'blue'}});saveDotSets();renderDots()`);
      select(2,firstPage?'1':'1/4');
      run(`adjustmentForm.requestSubmit();showChartPage(${1-firstPage})`);
      for(let i=0;i<3&&run('adjustmentForecast?.points.length')!==2;i++)run('guideCandidateToggle.click()');
      if(params.has('confirmed')){
        assert(run('adjustmentForecast?.points.length===2'),'screenshot has both final preview positions');
        run('addAdjustmentButton.click()');
        assert(run('adjustmentSequence.stages.length===2'),'screenshot shows confirmed second stage');
      }else assert(run('adjustmentSequence?.stages.length===1 && !adjustmentLock'),'screenshot shows editable second stage');
      await tick();run('chartWrap.scrollIntoView()');
      assert(run('document.documentElement.scrollWidth<=innerWidth'),'screenshot layout fits');
      output.textContent=`PASS: ${checks} screenshot checks`;
    }else frame.remove();
    document.title='PASS';
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
