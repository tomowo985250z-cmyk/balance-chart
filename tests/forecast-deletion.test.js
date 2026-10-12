(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1000px;height:1800px';
    let loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html';document.body.append(frame);await loaded;
    const run = code => frame.contentWindow.eval(code);
    const reload = async () => {
      loaded = new Promise(resolve => frame.onload = resolve);
      frame.contentWindow.location.reload();await loaded;
    };
    const remove = (index, adjustmentIndex, confirm = 'delete') => run(`
      dotList.children[${index}].querySelectorAll('.dot-adjustment-row button')[${adjustmentIndex}].click();
      deleteConfirmation.close('${confirm}');deleteConfirmation.dispatchEvent(new Event('close'));`);
    const measure = () => run(`redInputs.forEach((input,i)=>input.value=['2','0','0.4'][i]);
      blueInputs.forEach((input,i)=>input.value=['5','0','0.3'][i]);dotForm.requestSubmit()`);
    const selectAmount = value => run(`openMemoPicker(2);selectedMemoValue='${value}';confirmMemoPicker.click()`);
    const fresh = label => {
      assert(run(`!adjustmentForecast || (adjustmentForecast.values.every((value,i)=>value===memoValues[i])
        && adjustmentForecast.type===(currentChartPage===0?'LINK':'TAB'))`), label + ': forecast matches input');
      assert(run(`memoButtons.every((button,i)=>button.textContent.includes(formatMemoInputValue(memoValues[i],i)))
        && guideCandidateToggle.dataset.rank===String(guideCandidateIndex+1)
        && (!guideNumberChoices.length || guideCandidateToggle.textContent.endsWith(String(guideNumberChoices[guideCandidateIndex].blade)))`), label + ': labels and rank match selection');
      assert(run(`!getVisibleGuideAdjustment() || (String(getVisibleGuideAdjustment().blade)===memoValues[0]
        && getVisibleGuideAdjustment().direction===memoValues[3])`), label + ': guide matches No and direction');
      assert(run(`!adjustmentForecast || adjustmentForecast.points.every(point=>{
        const target=dotSets.find(set=>set.learningId===adjustmentForecast.targetId);
        const action=BalanceLearning.adjustment(memoValues),guide=forecastGuides[point.color];
        const start=getDotCoordinates(target[point.color]);
        const prediction=learning.predict(action.type,point.color,action.blade,action.direction,action.amount,start);
        const estimate=BalanceDistancePrior.resolve(action,point.color,prediction,prediction?[]:learning.inspect().samples,CHART_RADIUS);
        return estimate && guide && guide.blade===action.blade && guide.direction===action.direction
          && Math.abs(point.distance-estimate.distance)<1e-8
          && Math.abs(point.x-start.x-guide.unit.x*estimate.distance)<1e-8
          && Math.abs(point.y-start.y-guide.unit.y*estimate.distance)<1e-8;
      })`), label + ': coordinates recalculated from actual engine and current guide');
      assert(run(`!adjustmentForecast || getForecastDisplayPoints(adjustmentForecast).every(point=>
        adjustmentForecast.points.some(calculated=>calculated.color===point.color && calculated.x===point.x && calculated.y===point.y))`), label + ': no stale cached color restored');
      assert(run(`[...dotOverlay.querySelectorAll('.adjustment-forecast [data-color]')].every(node=>{
        const point=adjustmentForecast?.points.find(point=>point.color===node.dataset.color);
        const matrix=node.transform.baseVal.getItem(0).matrix;
        return point && Math.abs(matrix.e-point.x)<1e-4 && Math.abs(matrix.f-point.y)<1e-4;
      })`), label + ': displayed dots use fresh coordinates');
      assert(run(`adjustmentForecast?.points.length || !dotOverlay.querySelector('.forecast-body')`), label + ': no estimate means no dot');
    };
    const setup = (page, mode) => {
      const type = page ? 'TAB' : 'LINK';
      run(`learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
        selectedAdjustmentTarget=null;showChartPage(${page});guideCandidateIndex=0;guideCandidateIndices.fill(0);
        adjustmentSelections.forEach(values=>values.fill(''));memoValues.fill('');
        pitchAutoMode='${mode}'!=='manual';trimAutoMode=pitchAutoMode;applyChartRotation(0,0);
        const dot=(x,y,color)=>({clock:'12:00',angle:Math.atan2(x-397,520-y)*180/Math.PI,
          radius:Math.hypot(x-397,y-520)/240,color});
        if('${mode}'==='learned')for(let i=0;i<4;i++) {
          if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
          dotSets.push({learningId:newLearningId(),red:dot(597+(3-i)*80,620+(3-i)*46.188,'red'),
            blue:dot(527+(3-i)*46,670+(3-i)*38.6,'blue'),adjustments:i<3?[['1','${type}','1','UP']]:[]});
          learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
        }else dotSets.push({learningId:newLearningId(),red:dot(517,620,'red'),blue:dot(527,670,'blue'),adjustments:[]});
        saveDotSets();updateMemoButtons();setGuidesVisible(true);renderDots();`);
      selectAmount(page ? '2' : '1/2');
      for (let i=0;i<3 && !run('adjustmentForecast?.points.length');i++)run('guideCandidateToggle.click()');
      assert(run('Boolean(adjustmentForecast?.points.length)'), type+'/'+mode+': real engine generates initial forecast');
    };
    for (const page of [0,1]) for (const mode of ['manual','waiting','learned']) for (const phase of ['preview','fixed','comparison']) {
      setup(page,mode);
      const label=(page?'TAB':'LINK')+'/'+mode+'/'+phase;
      const target=run('dotSets.length-1');
      if (phase==='preview')run('dotSets.at(-1).adjustments.push([...memoValues]);saveDotSets();renderDots()');
      else run('adjustmentForm.requestSubmit()');
      if (phase==='comparison')measure();
      assert(run('adjustmentForecast.phase')===phase,label+': requested lifecycle phase');
      const actionIndex=run(`dotSets[${target}].adjustments.length-1`);
      const oldForecast=run('JSON.stringify(adjustmentForecast)');
      const records=run('JSON.stringify(dotSets)');
      const learned=run('JSON.stringify([learning.inspect().models,learning.inspect().samples])');
      remove(target,actionIndex,'cancel');
      assert(run('JSON.stringify(adjustmentForecast)')===oldForecast,label+': cancellation preserves forecast');
      remove(target,actionIndex);
      assert(run('!adjustmentLock'),label+': deletion leaves input unlocked');
      assert(run('!adjustmentForecast || adjustmentForecast.phase==="preview"'),label+': old fixed/comparison forecast discarded');
      const expected=JSON.parse(records);expected[target].adjustments.splice(actionIndex,1);
      assert(run('JSON.stringify(dotSets)')===JSON.stringify(expected),label+': only chosen adjustment removed');
      assert(run('JSON.stringify([learning.inspect().models,learning.inspect().samples])')===learned,label+': learning preserved');
      fresh(label);
      const savedForecast=run('JSON.stringify(adjustmentForecast)');
      assert(run('JSON.stringify(JSON.parse(appStorage.getItem(BalanceState.uiKey)).forecast)')===savedForecast,label+': fresh forecast immediately saved');
      run('renderDots();renderDirectionLines()');fresh(label+'/redraw');
      await reload();
      assert(run('JSON.stringify(adjustmentForecast)')===savedForecast,label+': reload restores fresh forecast');
      run('renderDots()');fresh(label+'/reload');
    }
    for (const page of [0,1]) {
      // 未追加側閲覧中の削除でも、残る固定対象の古い予測を持ち越さない。
      setup(page,'manual');
      run(`dotSets[0].adjustments.push(['1','${page?'TAB':'LINK'}','3','UP']);
        adjustmentForm.requestSubmit();showChartPage(${1-page})`);
      remove(0,0);
      assert(run('Boolean(adjustmentLock) && adjustmentForecast===null && forecastDisplayCache.size===0'), 'other chart deletion clears old forecast without releasing unrelated lock');
      await reload();run(`showChartPage(${page})`);
      assert(run('Boolean(adjustmentLock) && adjustmentForecast?.phase==="fixed"'), 'returning to locked type recalculates its forecast');
      fresh('locked return');
      remove(0,0);assert(run('!adjustmentLock'), 'deleting remaining action unlocks');

      // キャッシュに両色の古い座標があっても、現在計算できない色は復活させない。
      setup(page,'manual');
      run(`adjustmentForm.requestSubmit();
        for(const entry of forecastDisplayCache.values())for(const point of entry.points.values()){point.x=999999;point.y=999999;}
        dotSets[0].blue=null;saveDotSets();`);
      remove(0,0);
      fresh('missing Cruise');
      assert(run('!adjustmentForecast?.points.some(point=>point.color==="blue") && !dotOverlay.querySelector(".adjustment-forecast [data-color=blue]")'), 'missing Cruise never restores cached dot');
      if(page)assert(run('!dotOverlay.querySelector(".forecast-body")'), 'TAB without Cruise hides all forecasts');
      await reload();
      assert(run('!dotOverlay.querySelector(".adjustment-forecast [data-color=blue]")'), 'missing Cruise remains hidden after reload');
    }
    output.textContent=`PASS: ${checks} checks — LINK/TAB forecast invalidation, live recalculation, phases, lock release, missing estimates and persistence`;
    document.title='PASS';
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
