/* 専用プロファイルで forecast-lifecycle.html?isolated=1 を開く。 */
(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const trace = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    checks += 1;
  };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') {
      output.textContent = '専用ブラウザプロファイルで ?isolated=1 を指定してください。';
      return;
    }
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1000px;height:1800px';
    const loaded = new Promise(resolve => { frame.onload = resolve; });
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const snapshot = label => {
      const state = run(`JSON.parse(JSON.stringify((()=>{
        const action=BalanceLearning.adjustment(memoValues);
        return {rank:guideCandidateIndex,values:[...memoValues],selections:adjustmentSelections,
          estimate:action?BalanceDistancePrior.resolve(action,'blue',null):null,
          guides:forecastGuides,forecast:adjustmentForecast,
          cache:typeof forecastDisplayCache==='undefined'?null:[...forecastDisplayCache].map(([key,entry])=>({key,points:[...entry.points.values()]})),
          dom:[...dotOverlay.querySelectorAll('.adjustment-forecast [data-color]')].map(node=>{
            const matrix=node.transform.baseVal.getItem(0).matrix;
            return {color:node.dataset.color,x:matrix.e,y:matrix.f,title:node.querySelector('title').textContent};
          })};
      })()))`);
      trace.push({label,...state});
      return state;
    };
    const selectAmount = amount => run(`memoThree.click(); selectedMemoValue='${amount}'; confirmMemoPicker.click();`);
    const checkSaved = (state, saved) => {
      const blue = state.dom.find(point=>point.color==='blue');
      assert(Boolean(blue), 'generated Cruise stays visible on guide ' + (state.rank + 1));
      assert(Math.abs(blue.x-saved.x)<1e-4 && Math.abs(blue.y-saved.y)<1e-4, 'restored Cruise uses generated coordinates');
    };
    for (const automatic of [false,true]) {
      run(`
        adjustmentForecast=null; selectedAdjustmentTarget=null; learning.reset([]); dotSets.splice(0);
        adjustmentSelections.forEach(values=>values.fill('')); memoValues.fill('');
        pitchAutoMode=${automatic}; trimAutoMode=${automatic}; currentChartPage=0;
        if(guideCandidateIndex!==0) guideCandidateToggle.click();
        applyChartRotation(0,0);
        redInputs.forEach((input,index)=>input.value=['2','0','0.5'][index]);
        blueInputs.forEach((input,index)=>input.value=['1','0','0.5'][index]);
        dotForm.requestSubmit(); setGuidesVisible(true);
        window.lifecycleLearning=JSON.stringify(learning.inspect());
        window.lifecycleStorage=JSON.stringify({...localStorage});
      `);
      selectAmount('1/4');
      const initial = snapshot('guide1/initial/' + automatic);
      assert(initial.values[0]==='3' && initial.values[3]==='DOWN', 'real guide1 chooses No.3 DOWN');
      assert(initial.estimate===null, 'unchanged calculator has no Cruise estimate for No.3 DOWN');
      assert(!initial.dom.some(point=>point.color==='blue'), 'never fabricate a prediction before one is generated');
      run('guideCandidateToggle.click();'); selectAmount('1/4');
      const generated = snapshot('guide2/generated/' + automatic);
      assert(generated.values[0]==='2' && generated.values[3]==='UP', 'real guide2 chooses No.2 UP');
      const blue = generated.forecast.points.find(point=>point.color==='blue');
      assert(Boolean(blue) && generated.estimate.distance===blue.distance, 'existing calculation generates Cruise on guide2');
      checkSaved(generated, blue);
      run('guideCandidateToggle.click();');
      const restored = snapshot('guide1/restored/' + automatic);
      assert(restored.estimate===null && !restored.forecast.points.some(point=>point.color==='blue'), 'calculation result stays unchanged when returning to guide1');
      checkSaved(restored, blue);
      assert(restored.dom.find(point=>point.color==='blue').title.includes('No.2'), 'restored dot identifies its original adjustment');
      assert(run('forecastLearningNotice.textContent.includes("No.2 UPの保存済み予測")'), 'visible notice distinguishes saved preview from current candidate');
      assert(restored.forecast.points[0].color==='red' && restored.dom.some(point=>point.color==='red'), 'current HOV prediction remains visible');
      run('window.lifecycleRedGuide=forecastGuides.red; delete forecastGuides.red; updateAdjustmentForecast();');
      const missingGuide=snapshot('missing-guide/' + automatic);
      const savedRed=restored.forecast.points.find(point=>point.color==='red');
      const renderedRed=missingGuide.dom.find(point=>point.color==='red');
      assert(Boolean(renderedRed) && Math.abs(renderedRed.x-savedRed.x)<1e-4 && Math.abs(renderedRed.y-savedRed.y)<1e-4, 'HOV uses the same generated-coordinate restoration');
      assert(run('forecastLearningNotice.textContent.includes("HOV（赤）：No.3 DOWNの保存済み予測")'), 'saved HOV is identified even when its estimate exists but guide is absent');
      run('forecastGuides.red=lifecycleRedGuide; updateAdjustmentForecast();');
      for (let cycle=0;cycle<3;cycle++) for (const rank of [1,0]) {
        run('guideCandidateToggle.click();');
        const state=snapshot('switch/' + automatic + '/' + cycle + '/' + rank);
        assert(state.rank===rank, 'real button restores requested candidate');
        checkSaved(state,blue);
      }
      run('guideToggle.click();');
      assert(run('!dotOverlay.querySelector(".forecast-body")'), 'global OFF hides saved preview');
      run('guideToggle.click();'); checkSaved(snapshot('guide1/ON/' + automatic),blue);
      // 同じ欠落条件を線2側にも設定し、復元が候補番号を特別扱いしないことを確認する。
      run(`guideCandidateToggle.click();
        memoOne.click(); selectedMemoValue='3'; confirmMemoPicker.click();`);
      let latestBlue=snapshot('guide2/new-generated/' + automatic).forecast.points.find(point=>point.color==='blue');
      run(`memoFour.click(); selectedMemoValue='DOWN'; confirmMemoPicker.click();`);
      const reverse=snapshot('guide2/missing-estimate/' + automatic);
      assert(reverse.estimate===null, 'same missing estimate on guide2');
      assert(!reverse.dom.length, 'manual blade hides generated dots on guide2');
      selectAmount('1/2');
      assert(!snapshot('different-amount/' + automatic).dom.some(point=>point.color==='blue'), 'do not reuse quarter-flat prediction for half-flat');
      selectAmount('1/4');
      assert(!snapshot('manual-restored-amount/' + automatic).dom.length, 'amount change keeps manual blade hidden');
      run('applySelectedGuideAdjustment();');
      latestBlue=snapshot('automatic-restored/' + automatic).forecast.points.find(point=>point.color==='blue');
      checkSaved(snapshot('restored-amount/' + automatic),latestBlue);
      assert(run('JSON.stringify(learning.inspect())===lifecycleLearning'), 'display cache never changes learning or correction');
      assert(run('JSON.stringify({...localStorage})===lifecycleStorage'), 'display cache never writes measurement or learning storage');
      run(`dotSets.push({...dotSets.at(-1),learningId:newLearningId()}); selectedAdjustmentTarget=dotSets[0];
        updateAdjustmentForecast(['3','LINK','1/4','DOWN']);`);
      assert(!snapshot('historical-target/' + automatic).dom.some(point=>point.color==='blue'), 'historical preview does not restore current-guide cached dots');
      run('dotSets.pop(); selectedAdjustmentTarget=null; updateAdjustmentForecast();');
      checkSaved(snapshot('current-target/' + automatic),latestBlue);
      run(`dotSets.at(-1).blue.radius=0.6; updateAdjustmentForecast(['3','LINK','1/4','DOWN']);`);
      assert(!snapshot('edited-measurement/' + automatic).dom.some(point=>point.color==='blue'), 'edited measurement invalidates generated Cruise cache');
      run('dotSets.splice(0); renderDots();');
      assert(run('!dotOverlay.querySelector(".forecast-body")'), 'deleted target cannot display cached dots');
    }
    output.textContent = `PASS: ${checks} checks — preview generation, cache, restore and DOM for both guide candidates\n`;
    document.title = 'PASS';
  } catch(error) {
    output.textContent = `FAIL after ${checks} checks\n${error.stack}\n`;
    document.title = 'FAIL';
  }
  output.textContent += JSON.stringify(trace,null,2);
})();
