(async () => {
  const output=document.getElementById('results'),params=new URLSearchParams(location.search);let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  try{
    if(params.get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');frame.style.cssText='width:375px;height:1100px;border:0';
    let loaded=new Promise(resolve=>frame.onload=resolve);frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code);
    const go=page=>run(`chartPageButtons[${page}].click()`);
    const select=(index,value)=>run(`memoButtons[${index}].click();selectedMemoValue='${value}';previewMemoSelection();confirmMemoPicker.click()`);
    const choose=(page,direction='UP')=>{go(page);select(0,run('memoValues[0]')||'1');select(2,page?'1':'1/4');select(3,direction);};
    const reload=async()=>{run('balanceFlushState()');loaded=new Promise(resolve=>frame.onload=resolve);frame.contentWindow.location.reload();await loaded;};
    const setup=(page,colors=['red','blue'])=>run(`adjustmentSequence=null;adjustmentLock=null;confirmedCarry=null;adjustmentForecast=null;selectedAdjustmentTarget=null;
      memoPicker.hidden=true;activeMemoIndex=null;learning.reset([]);dotSets.splice(0);forecastDisplayCache.clear();
      memoValues.fill('');adjustmentSelections.forEach(v=>v.fill(''));guideCandidateIndices.fill(0);retainedGuideNumbers.fill(null);
      pitchAutoMode=false;trimAutoMode=false;showChartPage(${page});guideCandidateIndex=0;applyChartRotation(0,0);
      redInputs.forEach((input,i)=>input.value=${colors.includes('red')?"['2','0','.45'][i]":"''"});
      blueInputs.forEach((input,i)=>input.value=${colors.includes('blue')?"['5','0','.35'][i]":"''"});addDotButton.click();updateMemoButtons();updateEditingUI();setGuidesVisible(true);`);
    const measure=colors=>run(`redInputs.forEach((input,i)=>input.value=${colors.includes('red')?"['3','0','.22'][i]":"''"});
      blueInputs.forEach((input,i)=>input.value=${colors.includes('blue')?"['6','0','.28'][i]":"''"});addDotButton.click()`);
    const origins=()=>run(`Object.fromEntries(['red','blue'].filter(color=>getAdjustmentStartSet()[color]).map(color=>[color,getDotCoordinates(getAdjustmentStartSet()[color])]))`);
    const same=(actual,expected)=>Object.keys(actual).length===Object.keys(expected).length&&Object.keys(expected).every(color=>actual[color]&&Math.hypot(actual[color].x-expected[color].x,actual[color].y-expected[color].y)<1e-7);
    const locks=(expected,label)=>{for(const page of [0,1]){go(page);assert(run('memoOne.disabled && memoThree.disabled && memoFour.disabled && addAdjustmentButton.disabled')===expected.includes(page),label+': correct page lock '+page);}};
    const history=()=>run('JSON.stringify(adjustmentSequence?.stages)');
    const verifyHistory=(count,label)=>{
      assert(run(`dotList.querySelectorAll('.confirmed-adjustment-forecast').length===${count}`),label+': each confirmation immediately appears in results');
      assert(run(`adjustmentSequence.stages.every((stage,index)=>stage.forecast.points.every(point=>{
        const node=stage===adjustmentLock?dotOverlay.querySelector('.adjustment-forecast.fixed [data-color="'+point.color+'"]')
          :dotOverlay.querySelector('.confirmed-forecast-history [data-adjustment="'+(index+1)+'"][data-color="'+point.color+'"]');
        if(!node)return false;const m=node.transform.baseVal.getItem(0).matrix;return Math.hypot(m.e-point.x,m.f-point.y)<1e-4;
      }))`),label+': every confirmed dot stays at saved coordinates');
    };
    if(params.has('screenshot')){
      frame.style.cssText=`width:${Number(params.get('width')||375)}px;height:2200px;border:0`;output.hidden=true;
      const first=Number(params.get('first')||0);setup(first);choose(first);run('addAdjustmentButton.click()');
      choose(1-first,'DOWN');run('addAdjustmentButton.click()');verifyHistory(2,'screenshot');document.title='PASS';return;
    }
    for(const width of [320,375,390,430])for(const path of [[0],[1],[0,1],[1,0]])for(const update of [['red'],['blue'],['red','blue']]){
      frame.style.width=width+'px';setup(path[0]);let expected=origins(),count=0;
      const label=`${width}/${path.join('→')}/${update.join('+')}`;
      for(let round=0;round<3;round++){
        const adjusted=[];
        for(const page of path){
          choose(page,round%2?'DOWN':'UP');assert(same(origins(),expected),label+': unadjusted page uses actual or latest confirmed origin');
          const actual=run('JSON.stringify(dotSets.map(set=>[set.red,set.blue]))');
          run('addAdjustmentButton.click()');count++;adjusted.push(page);
          assert(run('Boolean(adjustmentLock)'),label+': added page locks immediately');
          expected=Object.fromEntries(run('adjustmentSequence.stages.at(-1).forecast.points').map(point=>[point.color,point]));
          const saved=history();run('adjustmentForm.requestSubmit();memoFour.click();guideCandidateToggle.click()');
          assert(history()===saved,label+': duplicate confirmation and locked controls do not change saved actions');
          assert(run('JSON.stringify(dotSets.map(set=>[set.red,set.blue]))')===actual,label+': predictions never overwrite actual dots');
          locks(adjusted,label);verifyHistory(count,label);
          assert(history()===saved,label+': cross-page navigation preserves all confirmed actions');
          if(adjusted.length===1){
            go(1-page);
            run(`dotList.querySelector('.confirmed-adjustment-row').click()`);
            assert(run('!editConfirmation.open && !adjustmentEdit'),label+': confirmed result has no edit action from the unlocked page');
            run(`const confirmed=adjustmentSequence.stages.at(-1),source=dotSets.find(set=>set.learningId===confirmed.targetId);
              startAdjustmentEdit(source,source.adjustments[confirmed.actionIndex])`);
            assert(run('!adjustmentEdit')&&history()===saved,label+': locked action cannot enter editing from the unlocked page');
          }
        }
        assert(!run(`(()=>{const body=document.body.cloneNode(true);body.querySelectorAll('#twoAdjustmentNote,.two-adjustment-reference-points').forEach(node=>node.remove());return body.textContent.includes('段階');})()`),label+': original flow has no stage UI outside the new reference display');
        const saved=history();await reload();locks(adjusted,label+'/reload');verifyHistory(count,label+'/reload');
        assert(history()===saved,label+': saved history restores without numerical changes');
        run('BalanceState.validateRecords(JSON.parse(appStorage.exportText()).records)');
        measure(update);locks([],label+': actual input releases both locks');
        for(const color of update)expected[color]=run(`getDotCoordinates(dotSets.at(-1)['${color}'])`);
        assert(same(origins(),expected),label+': new actual has priority independently for each color');
        assert(history()===saved,label+': new actual preserves previous confirmed history');
        assert(run('learning.inspect().samples.length===0'),label+': confirmed values never train the learning engine');
        assert(run('document.documentElement.scrollWidth<=innerWidth'),label+': mobile fits');
      }
    }
    for(const first of [0,1])for(const color of ['red','blue']){
      setup(first,[color]);choose(first);run('addAdjustmentButton.click()');
      assert(run('Boolean(confirmedCarry)'),`${first}/${color}: single-color confirmation succeeds: `+run('JSON.stringify({values:memoValues,forecast:adjustmentForecast,message:adjustmentMessage.textContent,storageError:appStorage.error})'));
      const expected=Object.fromEntries(run('confirmedCarry.points').map(point=>[point.color,point]));
      choose(1-first);assert(same(origins(),expected),'single available color is inherited');run('addAdjustmentButton.click()');
      locks([0,1],'single-color cross-page continuation');verifyHistory(2,'single color');
      measure([color]);locks([],'single actual releases both locks');
      choose(first);run('addAdjustmentButton.click()');verifyHistory(3,'next single-color measurement');
    }
    output.textContent=`PASS: ${checks} checks — result→LINK/TAB→result, optional cross-page continuation, independent locks and duplicate protection, three result cycles, per-color actual priority, unchanged confirmed history, reload/backup, no synthetic learning and four widths`;
    document.title='PASS';frame.remove();
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
