/* 専用プロファイルで forecast-candidates.html?isolated=1 を開く。 */
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
      output.textContent = '専用テストプロファイルで ?isolated=1 を指定してください。';
      return;
    }
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1000px;height:1800px';
    const loaded = new Promise(resolve => { frame.onload = resolve; });
    frame.src = '../index.html';
    document.body.append(frame);
    await loaded;
    const run = code => frame.contentWindow.eval(code);
    const checkCoordinates = label => {
      const result = run(`adjustmentForecast.points.map(point=>{
        const node=dotOverlay.querySelector('.adjustment-forecast [data-color='+point.color+']');
        const matrix=node?.transform.baseVal.getItem(0).matrix;
        return {color:point.color,stored:[point.x,point.y],rendered:matrix?[matrix.e,matrix.f]:null};
      })`);
      trace.push({label,points:result});
      for (const point of result) {
        assert(point.rendered !== null, label + '/' + point.color + ': generated dot visible');
        assert(point.stored.every((value,index)=>Math.abs(value-point.rendered[index])<1e-4),
          label + '/' + point.color + ': uses saved coordinates');
      }
    };
    for (const automatic of [false, true]) for (const type of ['LINK', 'TAB']) {
      run(`
        adjustmentForecast=null; selectedAdjustmentTarget=null; learning.reset([]); dotSets.splice(0);
        adjustmentSelections.forEach(values=>values.fill(''));
        memoValues.fill(''); pitchAutoMode=false; trimAutoMode=false;
        showChartPage(${type === 'LINK' ? 0 : 1});
        if(guideCandidateIndex!==0) guideCandidateToggle.click();
        hovAngle=0; cruiseAngle=0;
        redInputs.forEach((input,index)=>input.value=['2','0','0.5'][index]);
        blueInputs.forEach((input,index)=>input.value=['5','0','0.5'][index]);
        dotForm.requestSubmit(); setGuidesVisible(true);
        if (${automatic}) {
          learning.reset([]); dotSets.splice(0);
          const measuredDot=(x,y,color)=>({color,clock:'12:00',
            radius:Math.hypot(x-CHART_CENTER_X,y-CHART_CENTER_Y)/CHART_RADIUS,
            angle:Math.atan2(x-CHART_CENTER_X,CHART_CENTER_Y-y)*180/Math.PI});
          for(let i=0;i<4;i++) {
            if(i>0) learning.arm(dotSets,dotSets.at(-1).learningId);
            dotSets.push({learningId:newLearningId(),
              red:measuredDot(597+(3-i)*80,620+(3-i)*46.188,'red'),
              blue:measuredDot(527+(3-i)*46,670+(3-i)*38.6,'blue'),
              adjustments:i<3?[['1','${type}','1','UP']]:[]});
            learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
          }
          pitchAutoMode=true; trimAutoMode=true; saveDotSets(); renderDots();
        }
        memoValues.splice(0,4,'1','${type}','${type === 'LINK' ? '1/4' : '1'}','UP');
        updateMemoButtons(); updateAdjustmentForecast();
      `);
      assert(run('adjustmentForecast.points.some(point=>point.color==="blue")'), type + ': real calculation generates Cruise');
      assert(run('guidePredictionDebug.fallback') === !automatic, type + ': uses requested manual/learned candidate path');
      if (type === 'LINK') assert(run('adjustmentForecast.points.some(point=>point.color==="red")'), 'real calculation generates HOV');
      checkCoordinates(type + (automatic ? '/AUTO' : '/manual') + '/preview');
      run(`
        adjustmentForm.requestSubmit();
        window.candidateForecastSnapshot=JSON.stringify(adjustmentForecast);
        window.candidateLearningSnapshot=JSON.stringify(learning.inspect());
        window.candidateStorageSnapshot=JSON.stringify({...localStorage});
      `);
      assert(run('adjustmentForecast.phase==="fixed"'), type + ': actual adjustment form fixes generated forecast');
      const candidates = [];
      // 実際の切替ボタンと手動回転処理を使う。予測・候補選択関数は差し替えない。
      for (const angle of [0, 30, 60, 90, 120, 180]) {
        run(`applyChartRotation(${angle},${angle}); renderDirectionLines();`);
        for (const rank of [0, 1, 0]) {
          run(`if(guideCandidateIndex!==${rank}) guideCandidateToggle.click();`);
          assert(run(`guideCandidateIndex===${rank} && guideCandidateToggle.textContent==='ガイド線${rank + 1}'`), 'actual candidate button selects requested guide');
          candidates.push(run('JSON.stringify({guides:Object.values(forecastGuides).map(({blade,direction})=>[blade,direction]),amount:guidePredictionDebug.selected?.amount})'));
          assert(run('adjustmentForecast.points.some(point=>point.color==="blue")'), type + '/guide' + (rank + 1) + ': Cruise still retained');
          assert(run('JSON.stringify(adjustmentForecast)===candidateForecastSnapshot'), 'candidate switch leaves fixed forecast unchanged');
          checkCoordinates(type + (automatic ? '/AUTO' : '/manual') + '/guide' + (rank + 1) + '/rotation' + angle);
        }
      }
      assert(new Set(candidates).size>1, type + ': exercised distinct guide candidates');
      assert(run('JSON.stringify(learning.inspect())===candidateLearningSnapshot'), 'candidate display leaves learning unchanged');
      assert(run('JSON.stringify({...localStorage})===candidateStorageSnapshot'), 'candidate display leaves storage unchanged');
      for (const rank of [1, 0]) {
        run(`if(guideCandidateIndex!==${rank}) guideCandidateToggle.click(); guideToggle.click();`);
        assert(run('!dotOverlay.querySelector(".forecast-body")'), 'guide OFF hides forecast');
        run('guideToggle.click();');
        checkCoordinates(type + '/guide' + (rank + 1) + '/ON');
      }
      // プレビュー・比較でも描画処理だけでは保存データを変更しない。
      for (const phase of ['preview', 'comparison']) {
        run(`adjustmentForecast.phase='${phase}'; window.phaseSnapshot=JSON.stringify(adjustmentForecast); renderAdjustmentForecast();`);
        checkCoordinates(type + '/' + phase + '/saved');
        assert(run('JSON.stringify(adjustmentForecast)===phaseSnapshot'), 'renderer leaves forecast phase and data unchanged');
      }
    }
    output.textContent = `PASS: ${checks} checks — actual guide 1/2 buttons, saved coordinates, LINK HOV/Cruise and TAB\n`;
    document.title = 'PASS';
  } catch (error) {
    output.textContent = `FAIL after ${checks} checks\n${error.stack}\n`;
    document.title = 'FAIL';
  }
  output.textContent += JSON.stringify(trace, null, 2);
})();
