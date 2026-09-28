(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const assert = (condition, message) => { if (!condition) throw Error(message); checks++; };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use an isolated browser profile with ?isolated=1');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1000px;height:1800px';
    let loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const reload = async () => {
      run('balanceFlushState()');
      loaded = new Promise(resolve => frame.onload = resolve);
      frame.contentWindow.location.reload(); await loaded;
    };
    run(`pitchAutoMode=false; trimAutoMode=false;
      redInputs.forEach((input,i)=>input.value=['2','0','0.5'][i]);
      blueInputs.forEach((input,i)=>input.value=['1','0','0.5'][i]);
      dotForm.requestSubmit(); setGuidesVisible(true);
      if(guideCandidateIndex!==1) guideCandidateToggle.click();
      memoThree.click(); selectedMemoValue='1/4'; confirmMemoPicker.click();`);
    assert(run('!!dotOverlay.querySelector(".forecast-body")'), 'automatic blade displays forecasts');
    const learning = run('JSON.stringify(learning.inspect())');
    run(`window.originalBlade=memoValues[0]; memoOne.click();
      selectedMemoValue=originalBlade==='1'?'2':'1'; previewMemoSelection();`);
    assert(run('!dotOverlay.querySelector(".forecast-body")'), 'manual blade wheel preview hidden');
    run('closeMemoPicker.click()');
    assert(run('!!dotOverlay.querySelector(".forecast-body")'), 'cancel restores automatic blade display');
    run(`memoOne.click(); selectedMemoValue=originalBlade==='1'?'2':'1'; confirmMemoPicker.click();`);
    assert(run('!dotOverlay.querySelector(".forecast-body") && adjustmentForecast.points.length>0'), 'manual blade hides DOM but keeps calculated points');
    assert(run('JSON.stringify(learning.inspect())') === learning, 'manual blade display does not change learning');
    await reload();
    assert(run('adjustmentForecast.manualBlade && !dotOverlay.querySelector(".forecast-body")'), 'manual display choice survives reload');
    run(`applySelectedGuideAdjustment(); memoThree.click(); selectedMemoValue='1/4'; confirmMemoPicker.click();`);
    assert(run('!!dotOverlay.querySelector(".forecast-body")'), 'automatic selection restores display');
    // Use the same postMessage path as the embedded SVG; actual model getters stay unchanged.
    for (const learned of [false, true]) for (const page of [0, 1]) {
      if (learned) run(`
        learning.reset([]); dotSets.splice(0); adjustmentForecast=null;
        const measuredDot=(x,y,color)=>({color,clock:'12:00',
          radius:Math.hypot(x-CHART_CENTER_X,y-CHART_CENTER_Y)/CHART_RADIUS,
          angle:Math.atan2(x-CHART_CENTER_X,CHART_CENTER_Y-y)*180/Math.PI});
        for(let i=0;i<4;i++) {
          if(i>0) learning.arm(dotSets,dotSets.at(-1).learningId);
          dotSets.push({learningId:newLearningId(),
            red:measuredDot(597+(3-i)*80,620+(3-i)*46.188,'red'),
            blue:measuredDot(527+(3-i)*46,670+(3-i)*38.6,'blue'),
            adjustments:i<3?[['1','${page === 0 ? 'LINK' : 'TAB'}','1','UP']]:[]});
          learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
        }
        saveDotSets(); renderDots();`);
      run(`showChartPage(${page});
        if(${page}===0 ? pitchAutoMode : trimAutoMode) (${page}===0 ? pitchModeToggle : trimModeToggle).click();
        window.dispatchEvent(new MessageEvent('message',{source:chartObject.contentWindow,
          data:{type:'balance-chart-rotation',hovAngle:37,cruiseAngle:-58,finished:true}}));`);
      assert(run('hovAngle===37 && cruiseAngle===-58'), 'manual angles applied on page '+page);
      const models = run('JSON.stringify(learning.inspect())');
      run(`(${page}===0 ? pitchModeToggle : trimModeToggle).click()`);
      assert(run('hovAngle===37 && cruiseAngle===-58'), 'AUTO starts from latest angles on page '+page);
      if (learned) assert(run(`${page}===0 ? pitchAutoReady.blue : trimAutoReady`), 'AUTO model is ready');
      run('renderDots()');
      assert(run('hovAngle===37 && cruiseAngle===-58'), 'same model redraw retains angles on page '+page);
      assert(run('JSON.stringify(learning.inspect())') === models, 'mode switch leaves learning unchanged on page '+page);
      run(`showChartPage(${1-page}); showChartPage(${page})`);
      assert(run('hovAngle===37 && cruiseAngle===-58'), 'page round trip retains angles on page '+page);
      await reload();
      assert(run('hovAngle===37 && cruiseAngle===-58'), 'AUTO reload retains angles on page '+page);
      assert(run(`chartObject.contentDocument.getElementById('cruiseGroup').getAttribute('transform').includes('-58')`), 'SVG uses restored angle on page '+page);
      run(`(${page}===0 ? pitchModeToggle : trimModeToggle).click()`);
      assert(run('hovAngle===37 && cruiseAngle===-58'), 'return to manual retains angles on page '+page);
    }
    frame.remove(); output.textContent = `PASS: ${checks} checks`; document.title = 'PASS';
  } catch (error) { output.textContent = `FAIL after ${checks} checks\n${error.stack}`; document.title = 'FAIL'; }
})();
