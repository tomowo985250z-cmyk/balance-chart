(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1000px;height:1800px';
    let loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const tick = () => new Promise(resolve => setTimeout(resolve, 100));
    assert(run('guideCandidateToggle.disabled'), 'no measurements disables cycling');
    for (const page of [0, 1]) for (const mode of ['manual', 'waiting', 'learned']) {
      run(`pitchAutoMode=false;trimAutoMode=false;showChartPage(${page});
        learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
        guideCandidateIndex=0;guideCandidateIndices.fill(0);memoValues.fill('');
        adjustmentSelections.forEach(values=>values.fill(''));
        const dot=(x,y,color)=>({color,clock:'12:00',radius:Math.hypot(x-397,y-520)/240,angle:Math.atan2(x-397,520-y)*180/Math.PI});
        if('${mode}'==='learned') for(let i=0;i<4;i++) {
          if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
          dotSets.push({learningId:newLearningId(),red:dot(597+(3-i)*80,620+(3-i)*46.188,'red'),
            blue:dot(527+(3-i)*46,670+(3-i)*38.6,'blue'),adjustments:i<3?[['1','${page?'TAB':'LINK'}','1','UP']]:[]});
          learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
        } else dotSets.push({learningId:newLearningId(),red:dot(517,620,'red'),blue:dot(527,670,'blue'),adjustments:[]});
        pitchAutoMode='${mode}'!=='manual';trimAutoMode=pitchAutoMode;setGuidesVisible(true);renderDots();
        window.numberLearning=JSON.stringify(learning.inspect());
        window.numberRecords=JSON.stringify(BalanceState.keys.map(key=>appStorage.getItem(key)));
        window.numberPredictions=JSON.stringify([1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>learning.predict('${page?'TAB':'LINK'}','blue',blade,direction,1,{x:500,y:600}))));`);
      assert(run('guideCandidateIndex===0 && guideNumberChoices.length===3'), 'starts at first of three Nos');
      assert(run('new Set(guideNumberChoices.map(choice=>choice.blade)).size===3'), 'each No appears once');
      if (mode === 'learned' && page === 0) {
        assert(run('guidePredictionDebug.selected===selectLinkGuideCandidate(guidePredictionDebug.candidates)'), 'first learned LINK candidate retains existing priority');
      }
      if (mode === 'learned') {
        assert(run(`guideNumberChoices.every(choice=>{
          const pool=guidePredictionDebug.candidates.filter(candidate=>candidate.blade===choice.blade);
          const best=${page===0?'selectLinkGuideCandidate(pool)':`pool.filter(candidate=>candidate.eligible).sort((a,b)=>Number(b.withinCenterThreshold)-Number(a.withinCenterThreshold)||a.maxCenterDistance-b.maxCenterDistance||a.distance-b.distance)[0]`};
          return choice.candidate===(best??null);
        })`), 'each No uses its existing best candidate');
      }
      const order = run('guideNumberChoices.map(choice=>choice.blade)');
      for (const [step, rank] of [0, 1, 2, 0].entries()) {
        assert(run(`guideCandidateIndex===${rank}`), 'cycles 1 → 2 → 3 → 1');
        assert(run(`guideCandidateToggle.textContent==='${page?'タブ':'LINK'} No.${order[rank]}'`), 'button identifies selected No');
        const available = run(`Boolean(guideNumberChoices[guideCandidateIndex].candidate)`);
        if (available) {
          assert(run(`Object.values(forecastGuides).every(guide=>guide.blade===${order[rank]} && memoValues[0]===String(guide.blade) && memoValues[3]===guide.direction)`), 'No and direction match both guides');
          assert(run('memoValues.every(Boolean)'), 'selected No supplies adjustment amount');
          if (mode === 'learned') assert(run('memoValues[2]===guidePredictionDebug.selected.amountText'), 'learned optimal amount matches existing candidate');
          assert(run('adjustmentForecast?.values.every((value,index)=>value===memoValues[index])'), 'forecast follows selected action');
          assert(run(`adjustmentForecast.points.every(point=>{
            const action=BalanceLearning.adjustment(memoValues),start=getDotCoordinates(dotSets.at(-1)[point.color]);
            const prediction=learning.predict(action.type,point.color,action.blade,action.direction,action.amount,start);
            const estimate=BalanceDistancePrior.resolve(action,point.color,prediction,prediction?[]:learning.inspect().samples,CHART_RADIUS);
            const unit=forecastGuides[point.color].unit;
            return Math.abs(point.x-start.x-unit.x*estimate.distance)<1e-8 && Math.abs(point.y-start.y-unit.y*estimate.distance)<1e-8;
          })`), 'forecast coordinates retain existing calculation');
          assert(run(`getForecastDisplayPoints(adjustmentForecast).every(point=>!point.savedValues || point.savedValues.every((value,index)=>value===memoValues[index]))`), 'no cached predictions from another No or direction');
          run(`window.numberAutomatic=[...memoValues];openMemoPicker(0);selectedMemoValue=numberAutomatic[0]==='1'?'2':'1';previewMemoSelection()`);
          assert(run(`dotOverlay.querySelector('.direction-lines').style.opacity==='0' && !dotOverlay.querySelector('.forecast-body')`), 'manual No hides guides and dots');
          run('closeMemoPicker.click()');
          run(`openMemoPicker(3);selectedMemoValue=numberAutomatic[3]==='UP'?'DOWN':'UP';confirmMemoPicker.click()`);
          assert(run(`dotOverlay.querySelector('.direction-lines').style.opacity==='0' && !dotOverlay.querySelector('.forecast-body')`), 'manual direction hides guides and dots');
          run('applySelectedGuideAdjustment()');
        } else assert(run('!dotOverlay.querySelector(".guide-direction-line") && !dotOverlay.querySelector(".forecast-body")'), 'unavailable candidate never fabricates guides or predictions');
        if (step < 3) run('guideCandidateToggle.click()');
      }
      assert(run('JSON.stringify(learning.inspect())===numberLearning'), 'No switching leaves learning unchanged');
      assert(run('JSON.stringify(BalanceState.keys.map(key=>appStorage.getItem(key)))===numberRecords'), 'No switching leaves measurement and learning records unchanged');
      assert(run(`JSON.stringify([1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>learning.predict('${page?'TAB':'LINK'}','blue',blade,direction,1,{x:500,y:600}))))===numberPredictions`), 'all existing prediction results unchanged');
      run('guideToggle.click();guideCandidateToggle.click()');
      if (run('guideNumberChoices[guideCandidateIndex].candidate')) assert(run('Object.values(forecastGuides).every(guide=>memoValues[0]===String(guide.blade) && memoValues[3]===guide.direction)'), 'No and direction follow button while guides are OFF');
      assert(run('!dotOverlay.querySelector(".forecast-body")'), 'cycling keeps guide OFF predictions hidden');
      run('guideToggle.click()');
    }
    // 両画面の選択を別々に保持し、3位の状態も再読込・バックアップで保つ。
    run(`saveDotSets();showChartPage(0);guideCandidateIndex=2;renderDirectionLines();showChartPage(1);guideCandidateIndex=1;renderDirectionLines();showChartPage(0);balanceFlushState()`);
    assert(run('guideCandidateIndex===2'), 'page round trip retains its own third choice');
    loaded = new Promise(resolve => frame.onload = resolve);
    frame.contentWindow.location.reload(); await loaded;
    assert(run('guideCandidateIndex===2 && adjustmentSelections.length===6'), 'third choice and six selections survive reload');
    run('showChartPage(1)'); assert(run('guideCandidateIndex===1'), 'other page choice survives reload');
    assert(run(`(()=>{const backup=JSON.parse(appStorage.exportText());BalanceState.validateRecords(backup.records);return true})()`), 'new backup validates');
    assert(run(`(()=>{
      const ui=JSON.parse(appStorage.getItem(BalanceState.uiKey));
      ui.adjustmentSelections=[['1','LINK','1/4','UP'],['2','LINK','1/2','DOWN'],['3','TAB','1','UP'],['1','TAB','2','DOWN']];
      ui.guideCandidateIndex=1;delete ui.guideCandidateIndices;BalanceState.validateUI(ui);return true;
    })()`), 'legacy four-selection backup remains valid');
    run(`const legacyUI=JSON.parse(appStorage.getItem(BalanceState.uiKey));
      legacyUI.adjustmentSelections=[['1','LINK','1/4','UP'],['2','LINK','1/2','DOWN'],['3','TAB','1','UP'],['1','TAB','2','DOWN']];
      legacyUI.currentChartPage=1;legacyUI.memoValues=[...legacyUI.adjustmentSelections[3]];legacyUI.guideCandidateIndex=1;delete legacyUI.guideCandidateIndices;
      appStorage.setItem(BalanceState.uiKey,JSON.stringify(legacyUI));restoringAppState=true;`);
    loaded = new Promise(resolve => frame.onload = resolve);
    frame.contentWindow.location.reload(); await loaded;
    assert(run(`!appStorage.error && adjustmentSelections.length===6
      && adjustmentSelections[0][2]==='1/4' && adjustmentSelections[1][2]==='1/2'
      && adjustmentSelections[3][2]==='1' && adjustmentSelections[4][2]==='2'`), 'legacy selections migrate into the correct pages');
    // スマホ幅で候補ボタンが自動/手動ボタンと重ならず、タッチ領域・文字を確保する。
    for (const width of [320, 375, 390, 430]) {
      frame.style.width = width + 'px'; await tick();
      for (const page of [0, 1]) {
        run(`showChartPage(${page});chartWrap.scrollIntoView()`);
        assert(run(`(()=>{
          const button=guideCandidateToggle,b=button.getBoundingClientRect();
          const other=(${page}===0?pitchModeToggle:trimModeToggle).getBoundingClientRect();
          return b.width>=44 && b.height>=44 && b.left>=0 && b.right<=innerWidth
            && button.scrollWidth<=button.clientWidth && (b.bottom<=other.top || b.top>=other.bottom || b.right<=other.left || b.left>=other.right);
        })()`), 'mobile button fits without overlap '+width+'/'+page);
      }
    }
    output.textContent = `PASS: ${checks} checks`; document.title = 'PASS';
  } catch (error) { output.textContent = `FAIL after ${checks} checks\n${error.stack}`; document.title = 'FAIL'; }
})();
