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
    const selectAmount = amount => run(`memoThree.click();selectedMemoValue='${amount}';confirmMemoPicker.click()`);
    const checkAmount = (amount, label) => assert(run(`memoValues[2]==='${amount}'
      && memoButtons[2].textContent.includes('${amount}')
      && adjustmentSelections.slice(currentChartPage*3,currentChartPage*3+3).every(values=>values[2]==='${amount}')`), label);
    checkAmount('1/4', 'empty LINK starts at quarter flat');
    run('showChartPage(1)'); checkAmount('1', 'empty TAB starts at one degree');
    run('showChartPage(0)'); checkAmount('1/4', 'empty page round trip preserves LINK default');

    for (const page of [0, 1]) for (const mode of ['manual', 'waiting', 'learned']) {
      const type = page ? 'TAB' : 'LINK';
      const initial = page ? '1' : '1/4';
      run(`learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
        selectedAdjustmentTarget=null;currentChartPage=${page};guideCandidateIndex=0;guideCandidateIndices.fill(0);
        adjustmentSelections.forEach(values=>values.fill(''));memoValues.fill('');
        pitchAutoMode='${mode}'!=='manual';trimAutoMode=pitchAutoMode;applyChartRotation(0,0);
        const dot=(x,y,color)=>({color,clock:'12:00',radius:Math.hypot(x-397,y-520)/240,angle:Math.atan2(x-397,520-y)*180/Math.PI});
        if('${mode}'==='learned') for(let i=0;i<4;i++) {
          if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
          dotSets.push({learningId:newLearningId(),red:dot(597+(3-i)*80,620+(3-i)*46.188,'red'),
            blue:dot(527+(3-i)*46,670+(3-i)*38.6,'blue'),adjustments:i<3?[['1','${type}','1','UP']]:[]});
          learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
        } else dotSets.push({learningId:newLearningId(),red:dot(517,620,'red'),blue:dot(527,670,'blue'),adjustments:[]});
        updateMemoButtons();setGuidesVisible(true);renderDots();applySelectedGuideAdjustment();
        window.sharedLearning=JSON.stringify(learning.inspect());
        window.sharedRecords=JSON.stringify(BalanceState.keys.filter(key=>key!==ROTATION_STORAGE_KEY).map(key=>appStorage.getItem(key)));`);
      assert(run('guideNumberChoices.length===3 && new Set(guideNumberChoices.map(choice=>choice.blade)).size===3'), type+'/'+mode+': all three Nos available');
      for (let cycle = 0; cycle < 3; cycle++) {
        checkAmount(initial, type+'/'+mode+': default survives No switch');
        run('guideCandidateToggle.click()');
      }
      for (const amount of page ? ['2', '3', '1'] : ['1/2', '2/3', '1/8']) {
        const rank = run('guideCandidateIndex');
        selectAmount(amount);
        for (let cycle = 0; cycle < 3; cycle++) {
          run('guideCandidateToggle.click()');
          checkAmount(amount, type+'/'+mode+': changed amount follows every No');
          if (run('Boolean(guideNumberChoices[guideCandidateIndex].candidate)')) {
            assert(run('Object.values(forecastGuides).every(guide=>memoValues[0]===String(guide.blade) && memoValues[3]===guide.direction)'), 'automatic No and direction remain linked');
            assert(run(`adjustmentForecast?.values[2]==='${amount}'`), 'forecast uses shared amount');
          }
        }
        assert(run(`guideCandidateIndex===${rank}`), 'full cycle returns to changing No');
        run('guideCandidateToggle.click()');
      }
      const amount = run('memoValues[2]');
      run(`memoThree.click();selectedMemoValue='${amount === '3' ? '2' : '3'}';previewMemoSelection();closeMemoPicker.click()`);
      checkAmount(amount, 'cancelled amount preview leaves shared value unchanged');
      run(`memoOne.click();selectedMemoValue=memoValues[0]==='1'?'2':'1';confirmMemoPicker.click()`);
      checkAmount(amount, 'manual No change preserves shared amount');
      run('applySelectedGuideAdjustment();setGuidesVisible(false);guideCandidateToggle.click()');
      checkAmount(amount, 'guides OFF preserves shared amount on No switch');
      run(`showChartPage(${1-page})`);
      checkAmount(page ? '1/4' : '1', 'other type keeps its own default');
      selectAmount(page ? '3/4' : '2');
      run(`showChartPage(${page});setGuidesVisible(true);applySelectedGuideAdjustment()`);
      checkAmount(amount, 'other type change does not overwrite current type');
      assert(run('JSON.stringify(learning.inspect())===sharedLearning'), 'selection changes preserve learning');
      assert(run('JSON.stringify(BalanceState.keys.filter(key=>key!==ROTATION_STORAGE_KEY).map(key=>appStorage.getItem(key)))===sharedRecords'), 'selection changes preserve recorded measurements and adjustments');
    }

    run('showChartPage(0)'); selectAmount('2/3');
    run('showChartPage(1)'); selectAmount('2');
    run('saveDotSets();balanceFlushState()'); await reload();
    checkAmount('2', 'TAB shared amount survives reload');
    run('showChartPage(0)'); checkAmount('2/3', 'LINK shared amount survives reload');
    run(`balanceFlushState();const sharedBackup=appStorage.exportText();BalanceState.validateRecords(JSON.parse(sharedBackup).records);
      appStorage.importText(sharedBackup);restoringAppState=true;`);
    await reload();
    checkAmount('2/3', 'shared amount survives backup import');
    run('showChartPage(1)'); checkAmount('2', 'other type survives backup import');

    // 旧6候補形式：表示中の量と、他画面で選択中の量を引き継ぐ。
    run(`balanceFlushState();const legacy=JSON.parse(appStorage.getItem(BalanceState.uiKey));
      legacy.adjustmentSelections=[['1','LINK','1/8','UP'],['2','LINK','1/2','DOWN'],['3','LINK','3/4','UP'],
        ['1','TAB','1','UP'],['2','TAB','2','DOWN'],['3','TAB','3','UP']];
      legacy.currentChartPage=0;legacy.guideCandidateIndex=1;legacy.guideCandidateIndices=[1,2];
      legacy.memoValues=['2','LINK','2/3','DOWN'];
      appStorage.setItem(BalanceState.uiKey,JSON.stringify(legacy));restoringAppState=true;`);
    await reload();
    checkAmount('2/3', 'legacy active draft takes priority over candidate amounts');
    run('showChartPage(1)'); checkAmount('3', 'legacy other page retains selected candidate amount');

    // 登録済み履歴は固定し、次の入力や空の状態でも共有量を維持する。
    run(`showChartPage(0);pitchAutoMode=false;trimAutoMode=false;setGuidesVisible(true);renderDots();applySelectedGuideAdjustment();
      window.beforeSubmit=[...memoValues];actualAdjustment.checked=false;adjustmentForm.requestSubmit();`);
    assert(run('JSON.stringify(dotSets.at(-1).adjustments.at(-1))===JSON.stringify(beforeSubmit)'), 'submit records the selected shared amount');
    checkAmount('2/3', 'submit preserves shared amount');
    selectAmount('1/2');
    assert(run('dotSets.at(-1).adjustments.at(-1)[2]==="2/3"'), 'changing shared amount does not rewrite history');
    run('dotSets.splice(0);saveDotSets();renderDots();balanceFlushState()'); await reload();
    checkAmount('1/2', 'shared LINK amount survives empty-state reload');
    run('showChartPage(1)'); checkAmount('3', 'empty-state LINK does not clear TAB amount');
    output.textContent=`PASS: ${checks} checks — defaults, No sharing, type isolation, forecasts, reload, backup and legacy restore`;
    document.title='PASS';
  } catch (error) { output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL'; }
})();
