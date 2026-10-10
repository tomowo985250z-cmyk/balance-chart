/* 専用プロファイルで forecast-lifecycle.html?isolated=1 を開く。 */
(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1000px;height:1800px';
    const loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const selectRank = rank => run(`while(guideCandidateIndex!==${rank})guideCandidateToggle.click()`);
    const selectAmount = amount => run(`memoThree.click();selectedMemoValue='${amount}';confirmMemoPicker.click()`);
    const bluePoint = () => run('adjustmentForecast.points.find(point=>point.color==="blue")');
    const checkSaved = point => assert(run(`(()=>{
      const node=dotOverlay.querySelector('.adjustment-forecast [data-color=blue]');
      const matrix=node?.transform.baseVal.getItem(0).matrix;
      return matrix && Math.abs(matrix.e-${point.x})<1e-4 && Math.abs(matrix.f-${point.y})<1e-4;
    })()`), 'same action restores generated Cruise coordinates');
    for (const automatic of [false, true]) {
      run(`learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
        selectedAdjustmentTarget=null;currentChartPage=0;guideCandidateIndex=0;guideCandidateIndices.fill(0);
        adjustmentSelections.forEach(values=>values.fill(''));memoValues.fill('');
        pitchAutoMode=${automatic};trimAutoMode=${automatic};applyChartRotation(0,0);
        redInputs.forEach((input,index)=>input.value=['2','0','0.5'][index]);
        blueInputs.forEach((input,index)=>input.value=['1','0','0.5'][index]);
        dotForm.requestSubmit();setGuidesVisible(true);
        window.lifecycleLearning=JSON.stringify(learning.inspect());
        window.lifecycleRecords=JSON.stringify(BalanceState.keys.map(key=>appStorage.getItem(key)));`);
      selectAmount('1/4');
      assert(run("memoValues[0]==='3' && memoValues[3]==='DOWN'"), 'top priority remains No.3 DOWN');
      assert(!bluePoint(), 'No.3 DOWN retains missing Cruise estimate');
      assert(run('!dotOverlay.querySelector(".adjustment-forecast [data-color=blue]")'), 'missing estimate never creates a Cruise dot');
      selectRank(1); selectAmount('1/4');
      assert(run("memoValues[0]==='2' && memoValues[3]==='UP'"), 'second No remains No.2 UP');
      const blue = bluePoint();
      assert(Boolean(blue), 'existing calculation generates Cruise for No.2');
      checkSaved(blue);
      selectRank(0); selectAmount('1/4');
      assert(!bluePoint(), 'returning to No.3 keeps its calculation unchanged');
      assert(run('!dotOverlay.querySelector(".adjustment-forecast [data-color=blue]")'), 'No.2 saved dot is not displayed for No.3');
      selectRank(1); selectAmount('1/4'); checkSaved(blue);
      run('window.savedCruiseGuide=forecastGuides.blue;delete forecastGuides.blue;updateAdjustmentForecast()');
      assert(!bluePoint(), 'missing guide does not change the calculated point list');
      checkSaved(blue);
      assert(run('forecastLearningNotice.textContent.includes("No.2 UPの保存済み予測")'), 'saved same-action preview is identified');
      selectAmount('1/2');
      assert(run('!dotOverlay.querySelector(".adjustment-forecast [data-color=blue]")'), 'another amount cannot reuse quarter-flat prediction');
      selectAmount('1/4'); checkSaved(blue);
      run('forecastGuides.blue=savedCruiseGuide;updateAdjustmentForecast()');
      for (let cycle = 0; cycle < 3; cycle++) {
        selectRank(2); selectRank(0); selectRank(1); selectAmount('1/4'); checkSaved(blue);
      }
      run('guideToggle.click()'); assert(run('!dotOverlay.querySelector(".forecast-body")'), 'global OFF hides predictions');
      run('guideToggle.click()'); checkSaved(blue);
      run("memoOne.click();selectedMemoValue='3';confirmMemoPicker.click()");
      assert(run('!dotOverlay.querySelector(".forecast-body")'), 'manual No hides predictions');
      run('applySelectedGuideAdjustment()'); checkSaved(blue);
      run("memoFour.click();selectedMemoValue='DOWN';confirmMemoPicker.click()");
      assert(run('!dotOverlay.querySelector(".forecast-body")'), 'manual direction hides predictions');
      run('applySelectedGuideAdjustment()'); checkSaved(blue);
      assert(run('JSON.stringify(learning.inspect())===lifecycleLearning'), 'display cache leaves learning unchanged');
      assert(run('JSON.stringify(BalanceState.keys.map(key=>appStorage.getItem(key)))===lifecycleRecords'), 'display cache leaves measurement and learning records unchanged');
      run('delete forecastGuides.blue;dotSets.at(-1).blue.radius=0.6;updateAdjustmentForecast()');
      assert(run('!dotOverlay.querySelector(".adjustment-forecast [data-color=blue]")'), 'edited measurement invalidates cached Cruise');
      run('dotSets.splice(0);renderDots()');
      assert(run('!dotOverlay.querySelector(".forecast-body")'), 'deleted target cannot display cached points');
    }
    output.textContent = `PASS: ${checks} checks — No-specific preview cache, isolation, restore and invalidation`;
    document.title = 'PASS';
  } catch (error) { output.textContent = `FAIL after ${checks} checks\n${error.stack}`; document.title = 'FAIL'; }
})();
