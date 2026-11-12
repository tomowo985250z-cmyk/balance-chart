(async () => {
  let checks = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:320px;height:950px;border:0';
    const loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const state = () => run(`JSON.stringify({values:memoValues, blade:guideNumberChoices[guideCandidateIndex]?.blade,
      button:guideCandidateToggle.textContent, guides:forecastGuides,
      lines:[...dotOverlay.querySelectorAll('.guide-direction-line')].map(n=>[n.getAttribute('x1'),n.getAttribute('y1'),n.getAttribute('x2'),n.getAttribute('y2')]),
      opacity:dotOverlay.querySelector('.direction-lines')?.style.opacity,
      forecast:adjustmentForecast && {values:adjustmentForecast.values,points:adjustmentForecast.points,
        manualBlade:adjustmentForecast.manualBlade,manualDirection:adjustmentForecast.manualDirection},
      dots:[...dotOverlay.querySelectorAll('.adjustment-forecast [transform]')].map(n=>n.getAttribute('transform'))})`);
    for (const width of [320,375,390,430]) for (const mode of ['manual','waiting','learned']) for (const visible of [true,false]) {
      const label = `${width}/${mode}/guides=${visible}`;
      frame.style.width = width + 'px';
      run(`adjustmentLock=null;adjustmentSequence=null;confirmedCarry=null;adjustmentEdit=null;selectedAdjustmentTarget=null;
        adjustmentForecast=null;forecastDisplayCache.clear();learning.reset([]);dotSets.splice(0);currentChartPage=0;
        guideCandidateIndex=0;guideCandidateIndices.fill(0);retainedGuideNumbers.fill(null);memoValues.fill('');
        adjustmentSelections.forEach(v=>v.fill(''));pitchAutoMode=trimAutoMode=${mode !== 'manual'};
        Object.assign(manualPitchAngles,{hovAngle:-41,cruiseAngle:-60});manualPitchInitialized=true;
        applyChartRotation(-41,-60);
        const dot=(x,y,color)=>({clock:'12:00',angle:Math.atan2(x-397,520-y)*180/Math.PI,radius:Math.hypot(x-397,y-520)/240,color});
        if('${mode}'==='learned') for(let i=0;i<4;i++) {
          if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
          dotSets.push({learningId:newLearningId(),red:dot(597+(3-i)*80,620+(3-i)*46.188,'red'),
            blue:dot(527+(3-i)*46,670+(3-i)*38.6,'blue'),adjustments:i<3?[['1','LINK','1','UP']]:[]});
          learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
        } else dotSets.push({learningId:newLearningId(),red:{...parseDotInput('2','0','0.32'),color:'red'},
          blue:{...parseDotInput('5','0','0.33'),color:'blue'},adjustments:[]});
        updateMemoButtons();setGuidesVisible(${visible});renderDots();
        window.syncHistory=JSON.stringify(dotSets);window.syncLearning=JSON.stringify(learning.inspect());
        window.syncReference=JSON.stringify(twoAdjustmentReference);
        window.syncRank=guideNumberChoices.map(c=>[c.blade,c.candidate?.direction??c.candidate?.line?.direction]);`);
      // 期待値は実際の左下No.ボタンで取得し、入力側の実装から独立させる。
      const references = {};
      for (let i=0;i<3;i++) {
        run('guideCandidateToggle.click()');
        references[run('String(guideNumberChoices[guideCandidateIndex].blade)')] = state();
      }
      for (const blade of ['1','2','3']) {
        const before = state();
        const selections = run('JSON.stringify(adjustmentSelections)');
        run(`memoOne.click();memoWheel.querySelector('[data-value="${blade}"]').click()`);
        assert(state() === references[blade], label + '/' + blade + ': tap immediately matches lower-left selection');
        run('closeMemoPicker.click()');
        assert(state() === before, label + '/' + blade + ': cancel restores guide, direction, amount and forecast');
        assert(run('JSON.stringify(adjustmentSelections)') === selections, label + ': cancel restores candidate inputs');
        run(`memoOne.click();selectedMemoValue='${blade}';previewMemoSelection()`);
        assert(state() === references[blade], label + '/' + blade + ': wheel preview matches lower-left selection');
        run('confirmMemoPicker.click()');
        assert(state() === references[blade], label + '/' + blade + ': confirm keeps synchronized state');
        run('renderDirectionLines()');
        assert(state() === references[blade], label + ': redraw stays synchronized');
        assert(run('JSON.stringify(guideNumberChoices.map(c=>[c.blade,c.candidate?.direction??c.candidate?.line?.direction]))===JSON.stringify(syncRank)'), label + ': ranking unchanged');
        assert(run('JSON.stringify(dotSets)===syncHistory && JSON.stringify(learning.inspect())===syncLearning'), label + ': records and learning unchanged');
        assert(run('JSON.stringify(twoAdjustmentReference)===syncReference'), label + ': two-stage reference unchanged');
        assert(run('document.documentElement.scrollWidth<=innerWidth'), label + ': no horizontal overflow');
      }
      run(`memoThree.click();selectedMemoValue='1/2';previewMemoSelection();confirmMemoPicker.click();
        window.syncAmountBlade=guideNumberChoices[guideCandidateIndex].blade;
        memoOne.click();selectedMemoValue=String(syncAmountBlade===1?2:1);previewMemoSelection();
        memoPicker.dispatchEvent(new MouseEvent('click',{bubbles:true}));`);
      assert(run('guideNumberChoices[guideCandidateIndex].blade===syncAmountBlade && memoValues[2]===\'1/2\''), label + ': backdrop cancel retains No. and shared amount');
      run(`guideCandidateToggle.click();window.syncAfterToggle=String(guideNumberChoices[guideCandidateIndex].blade);`);
      assert(run('memoValues[0]===syncAfterToggle && (!adjustmentForecast || adjustmentForecast.values.every((v,i)=>v===memoValues[i]))'), label + ': lower-left switch remains consistent');
      run('showChartPage(1);showChartPage(0)');
      assert(run('memoValues[0]===String(guideNumberChoices[guideCandidateIndex].blade)'), label + ': chart round trip');
    }
    run(`setGuidesVisible(true);pitchAutoMode=false;renderDirectionLines();
      memoOne.click();selectedMemoValue='2';previewMemoSelection();confirmMemoPicker.click();addAdjustmentButton.click();
      window.syncLocked=JSON.stringify([dotSets,adjustmentLock,adjustmentSequence,confirmedCarry,adjustmentForecast,memoValues]);
      memoOne.click();guideCandidateToggle.click();`);
    assert(run('Boolean(adjustmentLock) && memoPicker.hidden && memoButtons.every(b=>b.disabled)'), 'confirmed lock still blocks input and No. switching');
    assert(run('JSON.stringify([dotSets,adjustmentLock,adjustmentSequence,confirmedCarry,adjustmentForecast,memoValues])===syncLocked'), 'confirmed history, forecast and carry unchanged');
    document.getElementById('results').textContent = `PASS: ${checks} checks — LINK input/guide parity, immediate taps/wheel, cancel/confirm, guide on/off, shared amount, manual/waiting/learned, ranking/history/learning/two-stage preservation, locks and four mobile widths`;
    document.title = 'PASS';
  } catch (error) { document.getElementById('results').textContent = `FAIL after ${checks} checks\n${error.stack}`; document.title='FAIL'; }
})();
