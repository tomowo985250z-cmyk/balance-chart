(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1000px;height:1800px;border:0';
    let loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html';document.body.append(frame);await loaded;
    const run = code => frame.contentWindow.eval(code);
    const tick = () => new Promise(resolve => setTimeout(resolve, 50));
    const reload = async () => {
      run('balanceFlushState()');loaded = new Promise(resolve => frame.onload = resolve);
      frame.contentWindow.location.reload();await loaded;await tick();
    };
    const status = () => run('document.getElementById("forecastStatus").dataset.state');
    const expect = (state, label) => {
      const text = { learned: '予測あり', reference: '参考推定', none: '予測なし' }[state];
      assert(status() === state, `${label}: ${status()} expected ${state}`);
      assert(run('document.querySelector(".forecast-status-label").textContent') === text, label + ': label');
    };
    const selectAmount = value => run(`openMemoPicker(2);selectedMemoValue='${value}';confirmMemoPicker.click()`);
    const remove = (row, result = false, answer = 'delete') => run(`
      dotList.children[${row}].querySelector('${result ? '.dot-result-row' : '.dot-adjustment-row'} button').click();
      deleteConfirmation.close('${answer}');deleteConfirmation.dispatchEvent(new Event('close'));`);
    const setup = (page, learned = false) => {
      const type = page ? 'TAB' : 'LINK';
      run(`adjustmentLock=null;memoPicker.hidden=true;activeMemoIndex=null;
        learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
        selectedAdjustmentTarget=null;showChartPage(${page});guideCandidateIndex=0;guideCandidateIndices.fill(0);
        adjustmentSelections.forEach(values=>values.fill(''));memoValues.fill('');
        pitchAutoMode=${learned};trimAutoMode=${learned};applyChartRotation(0,0);
        const dot=(x,y,color)=>({clock:'12:00',angle:Math.atan2(x-397,520-y)*180/Math.PI,
          radius:Math.hypot(x-397,y-520)/240,color});
        if(${learned})for(let i=0;i<4;i++) {
          if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
          dotSets.push({learningId:newLearningId(),red:dot(597+(3-i)*80,620+(3-i)*46.188,'red'),
            blue:dot(527+(3-i)*46,670+(3-i)*38.6,'blue'),adjustments:i<3?[['1','${type}','1','UP']]:[]});
          learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
        }else dotSets.push({learningId:newLearningId(),red:dot(517,620,'red'),blue:dot(527,670,'blue'),adjustments:[]});
        saveDotSets();updateMemoButtons();setGuidesVisible(true);renderDots();`);
      selectAmount(page ? '2' : '1/2');
      for (let i=0;i<3 && !run('adjustmentForecast?.points.length');i++) run('guideCandidateToggle.click()');
      assert(run('Boolean(adjustmentForecast?.points.length)'), type + ': engine creates forecast');
    };
    expect('none', 'empty startup');
    for (const page of [0, 1]) {
      const type = page ? 'TAB' : 'LINK';
      setup(page);
      expect('reference', type + ': existing low-confidence reference');
      for (const amount of page ? ['1','3','2'] : ['1/4','1','1/2']) {
        selectAmount(amount);expect('reference', type + ': amount ' + amount);
        assert(run(`adjustmentForecast.values[2]==='${amount}'`), type + ': status uses current amount forecast');
      }
      run('openMemoPicker(3);selectedMemoValue=memoValues[3]==="UP"?"DOWN":"UP";previewMemoSelection()');
      expect('none', type + ': manually changed direction has no displayed forecast');
      run('closeMemoPicker.click()');expect('reference', type + ': cancelling direction restores reference');
      run(`showChartPage(${1-page})`);
      assert(run('memoValues[1]') === (page ? 'LINK' : 'TAB'), 'switch updates input type');
      assert(status() !== 'learned', 'switch never reuses a learned status from another type');
      run(`showChartPage(${page})`);expect('reference', type + ': return updates status');

      setup(page, true);expect('learned', type + ': existing ready model');
      const calculations = run('JSON.stringify([learning.inspect(),dotSets,adjustmentForecast,guideNumberChoices,memoValues,guideCandidateIndex])');
      run('renderForecastStatus();renderForecastStatus()');
      assert(run('JSON.stringify([learning.inspect(),dotSets,adjustmentForecast,guideNumberChoices,memoValues,guideCandidateIndex])') === calculations,
        type + ': status rendering leaves learning, records, forecasts, guides and ranking unchanged');
      selectAmount(page ? '3' : '1');expect('learned', type + ': learned amount change');
      run('guideCandidateToggle.click()');
      if (run('guideNumberChoices[guideCandidateIndex]?.candidate && !adjustmentForecast?.manualBlade && !adjustmentForecast?.manualDirection')) {
        expect('learned', type + ': No. change follows ready pooled model');
      } else expect('none', type + ': No. without candidate');

      setup(page, true);
      run('adjustmentForecast.points.find(point=>point.color==="blue").source="prior";renderAdjustmentForecast()');
      expect('reference', type + ': low-confidence color prevents green');
      run('adjustmentForecast.points=[];renderAdjustmentForecast()');
      expect('none', type + ': saved display points cannot establish prediction readiness');

      for (const color of ['red','blue']) {
        setup(page, true);
        run(`dotSets.at(-1).${color}=null;saveDotSets();renderDots()`);
        expect('none', type + ': missing ' + color);
        await reload();expect('none', type + ': missing ' + color + ' after reload');
      }

      setup(page, true);
      run('adjustmentForm.requestSubmit()');
      expect('learned', type + ': added adjustment');
      assert(run('Boolean(adjustmentLock)'), type + ': addition remains locked');
      const learningBefore = run('JSON.stringify([learning.inspect().models,learning.inspect().samples])');
      remove(3, false, 'cancel');expect('learned', type + ': deletion cancelled');
      remove(3);expect('learned', type + ': deletion refreshes status');
      assert(run('!adjustmentLock && !memoButtons[2].disabled'), type + ': deletion releases lock');
      assert(run('JSON.stringify([learning.inspect().models,learning.inspect().samples])') === learningBefore,
        type + ': adjustment deletion preserves learned records');
      await reload();expect('learned', type + ': refreshed state survives reload');
      remove(0, true);remove(0, true);
      expect('reference', type + ': history removal immediately reflects insufficient learning');
      remove(1, true);remove(0, true);expect('none', type + ': deleting all results');
      await reload();expect('none', type + ': empty history after reload');
    }
    setup(0, true);
    for (const width of [320, 375, 390, 430]) {
      frame.style.width = width + 'px';await tick();
      assert(run(`(() => {
        const target=document.getElementById('adjustmentTarget').getBoundingClientRect();
        const badge=document.getElementById('forecastStatus').getBoundingClientRect();
        return badge.left>=target.right && Math.abs((badge.top+badge.bottom-target.top-target.bottom)/2)<1
          && badge.right<=innerWidth && target.width>=150 && document.documentElement.scrollWidth<=innerWidth;
      })()`), width + 'px: status outside select on right, centered, without page overflow');
      assert(run(`(() => {
        const badge=document.getElementById('forecastStatus'),style=getComputedStyle(badge);
        return style.backgroundColor==='rgba(0, 0, 0, 0)' && style.borderTopWidth==='0px'
          && badge.getAttribute('role')==='status' && badge.title.includes('実測精度を保証するものではありません');
      })()`), width + 'px: unboxed accessible status with accuracy explanation');
    }
    if (new URLSearchParams(location.search).has('screenshot')) {
      output.style.display='none';document.body.style.margin='0';
      frame.style.cssText='position:fixed;inset:0;width:375px;height:812px;border:0';
      run('scrollTo(0,0)');
    }
    output.textContent=`PASS: ${checks} checks — LINK/TAB readiness, reference estimates, missing HOV/Cruise, selection, deletion, persistence and iPhone widths`;
    document.title='PASS';
  } catch (error) { output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL'; }
})();
