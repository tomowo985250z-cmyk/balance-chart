(async () => {
  const output = document.getElementById('results');
  let checks = 0, changedOrders = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:320px;height:568px;border:0';
    const loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const selection = () => run('JSON.stringify([memoValues[0],memoButtons[0].textContent,guideNumberChoices[guideCandidateIndex]?.blade,guideCandidateToggle.textContent])');
    const order = () => run('guideNumberChoices.map(choice=>choice.blade).join()');
    for (const width of [320, 375, 1000]) for (const page of [0, 1]) {
      frame.style.width = width + 'px';
      for (const mode of ['manual', 'waiting', 'learned']) for (const rank of [0, 1, 2]) {
        const label = `${width}/${page ? 'TAB' : 'LINK'}/${mode}/${rank}`;
        run(`adjustmentLock=null;selectedAdjustmentTarget=null;adjustmentForecast=null;forecastDisplayCache.clear();
          learning.reset([]);dotSets.splice(0);currentChartPage=${page};
          guideCandidateIndex=${rank};guideCandidateIndices.fill(0);guideCandidateIndices[currentChartPage]=guideCandidateIndex;memoValues.fill('');
          adjustmentSelections.forEach(values=>values.fill(''));
          pitchAutoMode=trimAutoMode=${mode !== 'manual'};
          applyChartRotation(-41,-60);
          const dot=(x,y,color)=>({clock:'12:00',angle:Math.atan2(x-397,520-y)*180/Math.PI,
            radius:Math.hypot(x-397,y-520)/240,color});
          if('${mode}'==='learned') for(let i=0;i<4;i++) {
            if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
            dotSets.push({learningId:newLearningId(),red:dot(597+(3-i)*80,620+(3-i)*46.188,'red'),
              blue:dot(527+(3-i)*46,670+(3-i)*38.6,'blue'),adjustments:i<3?[['1','${page ? 'TAB' : 'LINK'}','1','UP']]:[]});
            learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
          } else dotSets.push({learningId:newLearningId(),red:{...parseDotInput('2','0','0.32'),color:'red'},
            blue:{...parseDotInput('5','0','0.33'),color:'blue'},adjustments:[]});
          updateMemoButtons();setGuidesVisible(true);renderDots();applySelectedGuideAdjustment();
          if(!memoValues[0]){memoValues[0]=String(guideNumberChoices[guideCandidateIndex].blade);updateMemoButtons();}
          window.amountRecords=JSON.stringify(dotSets);window.amountLearning=JSON.stringify(learning.inspect());
          window.amountStorage=JSON.stringify(BalanceState.keys.filter(key=>key!==ROTATION_STORAGE_KEY).map(key=>appStorage.getItem(key)));`);
        const before = selection();
        for (const amount of page ? ['2','3','1'] : ['1/8','1/2','3','1/4']) {
          const previousOrder = order();
          run(`memoThree.click();memoWheel.querySelector('[data-value="${amount}"]').click()`);
          assert(selection() === before, label + ': tap preview preserves No. and selected guide');
          assert(run(`!adjustmentForecast || adjustmentForecast.values[2]==='${amount}'`), label + ': preview uses amount immediately');
          run('confirmMemoPicker.click()');
          assert(selection() === before, label + ': confirmation preserves No. across reranking');
          assert(run(`memoValues[2]==='${amount}'`), label + ': confirmed amount retained');
          if (order() !== previousOrder) changedOrders++;
          if (!page && mode !== 'manual') assert(run(`evaluatedLinkAmount==='${amount}'`), label + ': automatic ranking recalculated at confirmed amount');
          assert(run(`guideCandidateIndices[currentChartPage]===guideCandidateIndex`), label + ': remapped rank follows selected blade');
          if (run('Boolean(forecastGuides.red || forecastGuides.blue) && !adjustmentForecast?.manualBlade')) {
            assert(run(`adjustmentForecast.values[0]===memoValues[0] && adjustmentForecast.values[2]==='${amount}'
              && adjustmentForecast.points.every(point=>{
                const action=BalanceLearning.adjustment(memoValues),start=getDotCoordinates(dotSets.at(-1)[point.color]);
                const prediction=learning.predict(action.type,point.color,action.blade,action.direction,action.amount,start);
                const estimate=BalanceDistancePrior.resolve(action,point.color,prediction,prediction?[]:learning.inspect().samples,CHART_RADIUS);
                const guide=forecastGuides[point.color];
                return estimate && guide.blade===action.blade && Math.abs(point.x-start.x-guide.unit.x*estimate.distance)<1e-8
                  && Math.abs(point.y-start.y-guide.unit.y*estimate.distance)<1e-8;
              })`), label + ': forecasts use retained No. and unchanged HOV/cruise calculation');
          }
          run('renderDirectionLines();guideToggle.click();guideToggle.click()');
          assert(selection() === before, label + ': redraw and guide toggles keep No. after close');
        }
        run("memoThree.click();memoWheel.querySelector('[data-value=\"2\"]').click();closeMemoPicker.click()");
        assert(selection() === before, label + ': cancellation preserves No.');
        run(`showChartPage(${1 - page});showChartPage(${page})`);
        assert(selection() === before, label + ': page round trip preserves No.');
        assert(run('JSON.stringify(dotSets)===amountRecords && JSON.stringify(learning.inspect())===amountLearning'), label + ': history and learning unchanged');
        assert(run('JSON.stringify(BalanceState.keys.filter(key=>key!==ROTATION_STORAGE_KEY).map(key=>appStorage.getItem(key)))===amountStorage'), label + ': saved records unchanged');
        run('window.nextAmountBlade=guideNumberChoices[(guideCandidateIndex+1)%3].blade;guideCandidateToggle.click()');
        assert(run('guideNumberChoices[guideCandidateIndex].blade===nextAmountBlade'), label + ': explicit guide No. switch follows current ranking');
        run(`memoOne.click();selectedMemoValue=memoValues[0]==='1'?'2':'1';window.chosenAmountNumber=selectedMemoValue;confirmMemoPicker.click();
          memoThree.click();memoWheel.querySelector('[data-value="2"]').click();confirmMemoPicker.click();renderDirectionLines()`);
        assert(run('memoValues[0]===chosenAmountNumber'), label + ': manual No. also survives subsequent amount confirmation and redraw');
        run(`showChartPage(${1 - page});showChartPage(${page})`);
        assert(run('memoValues[0]===chosenAmountNumber'), label + ': remapped manual No. survives page round trip');
        run(`window.amountDraft=[...memoValues];
          dotSets.at(-1).adjustments.push(['1','${page ? 'TAB' : 'LINK'}','1','UP']);
          startAdjustmentEdit(dotSets.at(-1),dotSets.at(-1).adjustments.at(-1));
          window.amountEditNumber=memoValues[0];
          memoThree.click();memoWheel.querySelector('[data-value="3"]').click();confirmMemoPicker.click();renderDirectionLines()`);
        assert(run('memoValues[0]===amountEditNumber'), label + ': editing an adjustment also retains No.');
        run('cancelAdjustmentEdit.click();dotSets.at(-1).adjustments.pop();renderDirectionLines()');
        assert(run('memoValues[0]===amountDraft[0]'), label + ': edit cancellation restores draft No.');
      }
    }
    assert(changedOrders > 0, 'fixtures exercise actual automatic rank changes independently of No. display');
    output.textContent = `PASS: ${checks} checks — retained No., ${changedOrders} rank changes, LINK/TAB, iPhone SE widths, forecasts, manual selection and unchanged learning/storage`;
    document.title = 'PASS';
  } catch (error) { output.textContent = `FAIL after ${checks} checks\n${error.stack}`; document.title = 'FAIL'; }
})();
