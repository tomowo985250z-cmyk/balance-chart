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
    const reload = async () => {
      loaded = new Promise(resolve => frame.onload = resolve);
      frame.contentWindow.location.reload(); await loaded;
    };
    const measure = () => run(`redInputs.forEach((input,i)=>input.value=['2','0','0.4'][i]);
      blueInputs.forEach((input,i)=>input.value=['5','0','0.3'][i]);dotForm.requestSubmit()`);
    const select = (index, value) => run(`openMemoPicker(${index});selectedMemoValue='${value}';confirmMemoPicker.click()`);
    const snapshot = () => run(`JSON.stringify({lock:adjustmentLock,values:memoValues,
      selections:adjustmentSelections,checked:actualAdjustment.checked,forecast:adjustmentForecast,
      dots:dotSets,models:learning.inspect().models,samples:learning.inspect().samples})`);
    const locked = (values, label) => {
      assert(run('Boolean(adjustmentLock)'), label + ': lock active');
      assert(run('JSON.stringify(memoValues)') === JSON.stringify(values), label + ': exact input retained');
      assert(run(`memoButtons.every(button=>button.disabled) && addAdjustmentButton.disabled
        && actualAdjustment.disabled && adjustmentTarget.disabled`), label + ': both adjustment forms disabled');
      assert(run(`currentChartPage===adjustmentLock.page
        ? guideCandidateToggle.disabled && (currentChartPage===0?pitchModeToggle:trimModeToggle).disabled && rotationLocked
        : !guideCandidateToggle.disabled && !(currentChartPage===0?pitchModeToggle:trimModeToggle).disabled && !rotationLock.disabled`), label + ': chart operations follow added side');
      assert(run(`memoButtons.every((button,i)=>button.textContent.includes(formatMemoInputValue(memoValues[i],i)))`), label + ': labels retained');
    };
    for (const page of [0, 1]) for (const mode of ['manual', 'waiting', 'learned']) {
      const type = page ? 'TAB' : 'LINK';
      run(`learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
        selectedAdjustmentTarget=null;showChartPage(${page});guideCandidateIndex=0;guideCandidateIndices.fill(0);
        adjustmentSelections.forEach(values=>values.fill(''));memoValues.fill('');
        pitchAutoMode='${mode}'!=='manual';trimAutoMode=pitchAutoMode;applyChartRotation(0,0);
        if('${mode}'==='learned') {
          const dot=(x,y,color)=>({clock:'12:00',angle:Math.atan2(x-397,520-y)*180/Math.PI,
            radius:Math.hypot(x-397,y-520)/240,color});
          for(let i=0;i<4;i++) {
            if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
            dotSets.push({learningId:newLearningId(),red:dot(597+(3-i)*80,620+(3-i)*46.188,'red'),
              blue:dot(527+(3-i)*46,670+(3-i)*38.6,'blue'),adjustments:i<3?[['1','${type}','1','UP']]:[]});
            learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
          }
          saveDotSets();renderDots();
        }`);
      if (mode !== 'learned') measure();
      run('setGuidesVisible(true);guideCandidateToggle.click()');
      select(2, page ? '2' : '2/3');
      // 自動候補と異なる手動No・方向も固定する。
      select(0, run("memoValues[0]==='1'?'2':'1'"));
      select(3, run("memoValues[3]==='UP'?'DOWN':'UP'"));
      const values = run('[...memoValues]');
      const rank = run('guideCandidateIndex');
      const buttonLabel = run('guideCandidateToggle.textContent');
      run(`actualAdjustment.checked=${mode === 'learned'};adjustmentForm.requestSubmit()`);
      locked(values, type + '/' + mode + ' add');
      assert(run('guideCandidateToggle.textContent') === buttonLabel, 'No label stays as it was at add');
      assert(run('guideCandidateIndex') === rank, 'rank stays as it was at add');
      assert(run('JSON.stringify(dotSets.at(-1).adjustments.at(-1))') === JSON.stringify(values), 'history records exact action');
      const before = snapshot();
      run(`memoButtons.forEach(button=>button.click());openMemoPicker(2);selectedMemoValue='3';
        confirmMemoPicker.click();previewMemoSelection();guideCandidateToggle.click();
        (currentChartPage===0?pitchModeToggle:trimModeToggle).click();adjustmentForm.requestSubmit();
        startAdjustmentEdit(dotSets.at(-1),dotSets.at(-1).adjustments.at(-1));
        renderDots();renderDirectionLines();applySelectedGuideAdjustment();updateAdjustmentForecast();
        guideToggle.click();guideToggle.click();`);
      assert(snapshot() === before, 'blocked operations and redraw preserve inputs, records, learning and forecast');
      assert(run('memoPicker.hidden && !adjustmentEdit'), 'locked form cannot open picker or editor');
      run(`showChartPage(${1-page});guideCandidateToggle.click();memoThree.click();adjustmentForm.requestSubmit()`);
      locked(values, 'other chart');
      assert(snapshot() === before, 'other type cannot change or add');
      assert(run(`!guideNumberChoices[guideCandidateIndex]?.candidate
        || dotOverlay.querySelector('.direction-lines')?.style.opacity!== '0'`), 'other chart guides remain visible');
      const otherRank = run('guideCandidateIndex');
      run('guideCandidateToggle.click()');
      assert(run('guideCandidateIndex') === (otherRank + 1) % 3, 'other chart No can switch normally');
      run(`window.otherMode=currentChartPage===0?pitchAutoMode:trimAutoMode;
        (currentChartPage===0?pitchModeToggle:trimModeToggle).click()`);
      assert(run('(currentChartPage===0?pitchAutoMode:trimAutoMode)!==otherMode'), 'other chart mode can switch normally');
      run(`(currentChartPage===0?pitchModeToggle:trimModeToggle).click();guideToggle.click();guideToggle.click();`);
      assert(snapshot() === before, 'other chart controls preserve locked input, forecast and history');
      await reload();
      locked(values, 'reload on other chart');
      assert(run('currentChartPage') === 1-page, 'viewed chart restored independently of locked input');
      assert(snapshot() === before, 'reload preserves recorded data, locked selections and forecast');
      run(`window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));showChartPage(${page});renderDots()`);
      locked(values, 'return to added chart');
      assert(run('guideCandidateToggle.textContent') === buttonLabel, 'No label restored after chart round trip');
      run(`const backup=appStorage.exportText();BalanceState.validateRecords(JSON.parse(backup).records);
        appStorage.importText(backup);restoringAppState=true;`);
      await reload();
      locked(values, 'backup restore');
      assert(snapshot() === before, 'backup preserves lock and original data');
      run(`redInputs.forEach(input=>input.value='');blueInputs.forEach(input=>input.value='');dotForm.requestSubmit()`);
      locked(values, 'invalid measurement');
      run('startResultEdit(dotSets.at(-1));dotForm.requestSubmit()');
      locked(values, 'existing measurement update');
      run(`showChartPage(${1-page});
        if(currentChartPage===0?pitchAutoMode:trimAutoMode)(currentChartPage===0?pitchModeToggle:trimModeToggle).click();
        window.otherAngles=[hovAngle+7,cruiseAngle+11];
        window.dispatchEvent(new MessageEvent('message',{source:chartObject.contentWindow,
          data:{type:'balance-chart-rotation',hovAngle:otherAngles[0],cruiseAngle:otherAngles[1],finished:true}}));`);
      assert(run('hovAngle===otherAngles[0] && cruiseAngle===otherAngles[1]'), 'other chart manual rotation works normally');
      locked(values, 'other chart rotation');
      await reload();
      locked(values, 'reload after other chart rotation');
      run(`showChartPage(${page})`);
      assert(run('guideCandidateIndex') === rank, 'other chart operations preserve added candidate rank');
      const originalAction = run('JSON.stringify(dotSets.at(-1).adjustments.at(-1))');
      measure();
      assert(run(`!adjustmentLock && !addAdjustmentButton.disabled && !memoButtons[2].disabled
        && !actualAdjustment.disabled && !guideCandidateToggle.disabled && !rotationLock.disabled`), 'new measurement unlocks both types');
      assert(run(`getSharedAdjustmentAmount(0)==='1/4' && getSharedAdjustmentAmount(1)==='1'`), 'defaults reset only after next measurement');
      assert(run('JSON.stringify(dotSets.at(-2).adjustments.at(-1))') === originalAction, 'unlock leaves adjustment history intact');
      assert(run('JSON.parse(appStorage.getItem(BalanceState.uiKey)).adjustmentLock===null'), 'unlock is saved immediately');
      await reload();
      assert(run('!adjustmentLock && !memoButtons[2].disabled'), 'unlock survives reload');
      run(`showChartPage(${1-page});guideCandidateToggle.click()`);
      select(2, page ? '1/2' : '3');
      assert(run('memoValues[2]') === (page ? '1/2' : '3'), 'other type can operate after unlock');
    }
    // 既存結果への巡航追加入力・履歴削除も、新規測定登録の代わりにはならない。
    run(`learning.reset([]);dotSets.splice(0);selectedAdjustmentTarget=null;showChartPage(0);
      redInputs.forEach((input,i)=>input.value=['2','0','0.4'][i]);blueInputs.forEach(input=>input.value='');
      dotForm.requestSubmit();actualAdjustment.checked=false;adjustmentForm.requestSubmit();`);
    assert(run('Boolean(adjustmentLock)'), 'HOV-only result locks');
    run(`startCruiseAddition(dotSets.at(-1));blueInputs.forEach((input,i)=>input.value=['5','0','0.3'][i]);dotForm.requestSubmit()`);
    assert(run('Boolean(adjustmentLock) && dotSets.length===1 && Boolean(dotSets[0].blue)'), 'adding Cruise to existing result keeps lock');
    run(`dotSets[0].adjustments.splice(0);saveDotSets();renderDots();balanceFlushState()`);
    await reload();
    assert(run('Boolean(adjustmentLock) && addAdjustmentButton.disabled'), 'deleting action cannot bypass lock after reload');
    run(`dotSets.splice(0);saveDotSets();renderDots();balanceFlushState()`);
    await reload();
    assert(run('Boolean(adjustmentLock) && memoValues.every(Boolean)'), 'deleting result also preserves input lock');
    measure();
    assert(run('!adjustmentLock'), 'new measurement releases lock after deletion');
    // 過去の追加先でも、ロックは両種別に共通。
    measure();
    run(`adjustmentTarget.value='0';adjustmentTarget.dispatchEvent(new Event('change',{bubbles:true}));
      actualAdjustment.checked=false;adjustmentForm.requestSubmit();showChartPage(1);adjustmentForm.requestSubmit()`);
    assert(run('adjustmentLock?.targetId===dotSets[0].learningId && dotSets[0].adjustments.length===1 && dotSets[1].adjustments.length===0'), 'historical target cannot bypass mutual exclusion');
    // 上限による登録失敗では解除しない。
    run(`while(getDotCount()<MAX_DOTS)dotSets.push({learningId:newLearningId(),red:{...dotSets[0].red},blue:null,adjustments:[]});
      renderDots()`);
    measure();
    assert(run('Boolean(adjustmentLock) && getDotCount()===MAX_DOTS'), 'capacity failure retains lock');
    run('dotSets.splice(2);saveDotSets();renderDots()');measure();
    assert(run('!adjustmentLock'), 'successful measurement after capacity recovery unlocks');
    output.textContent = `PASS: ${checks} checks — LINK/TAB exclusion, fixed input, reload, backup, redraw and measurement-only release`;
    document.title = 'PASS';
  } catch (error) { output.textContent = `FAIL after ${checks} checks\n${error.stack}`; document.title = 'FAIL'; }
})();
