(async () => {
  const output = document.getElementById('results'), params = new URLSearchParams(location.search);
  let checks = 0, valid = 0, different = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 1e-7;
  const tick = () => new Promise(resolve => setTimeout(resolve, 40));
  try {
    if (params.get('isolated') !== '1') throw Error('Use isolated profile');
    const policy = BalanceTabIntersection, center = { x: 0, y: 0 };
    const ray = (x, y, ux, uy, maxTravel = 10) => ({ start: { x, y }, unit: { x: ux, y: uy }, maxTravel });
    const red = ray(-2, 0, 1, 0), blue = ray(0, -3, 0, 1);
    assert(near(policy.intersect(red, blue, center, 10).distance, 0), 'center intersection');
    for (const [r, b] of [[ray(2, 0, 1, 0), blue], [red, ray(0, 3, 0, 1)], [ray(-2, 0, 1, 0, 1.99), blue], [red, ray(0, -3, 0, 1, 2.99)], [red, ray(0, 1, 1, 0)], [red, ray(3, 0, 1, 0)], [red, ray(0, -3, 0, 0)], [red, null], [ray(NaN, 0, 1, 0), blue], [ray(10, 20, 1, 0, 100), ray(20, 10, 0, 1, 100)]])
      assert(!policy.intersect(r, b, center, 10), 'invalid/behind/parallel/outside/range rejected');
    assert(policy.intersect(ray(-2, 0, 1, 0, 2), ray(0, -3, 0, 1, 3), center, 10), 'exact range boundary accepted');
    const amounts = (ips = .2) => [1, 2, 3].map(amount => ({ amount, distance: amount * 2, ips }));
    const row = { blade: 1, direction: 'UP', red: { ...red, amounts: amounts() }, blue: { ...blue, amounts: amounts() } };
    const old = [{ blade: 2, direction: 'DOWN' }, { blade: 1, direction: 'UP' }];
    const data = JSON.stringify([row, old]);
    assert(policy.evaluate([row], old, center, 10, 1).winner?.blade === 1, 'separate color reachability with strict HOV 0.2');
    assert(!policy.evaluate([{ ...row, red: { ...row.red, amounts: amounts(.20000000000000004) } }], old, center, 10, 1).winner, 'HOV next representable value above 0.2 rejected');
    assert(!policy.evaluate([{ ...row, blue: null }], old, center, 10, 1).winner, 'missing color rejected');
    const farther = { ...row, blade: 2, red: { ...row.red, start: { x: -2, y: 1 } } };
    assert(policy.evaluate([farther, row], old, center, 10, 1).winner.blade === 1, 'closest intersection wins over legacy first for display only');
    assert(policy.evaluate([row, { ...row, blade: 2, direction: 'DOWN' }], old, center, 10, 1).winner.blade === 2, 'equal-distance display tie follows legacy order');
    assert(!policy.intersect(red, blue, center, Infinity), 'non-finite chart radius rejected');
    assert(!policy.intersect({ ...red, maxTravel: -1 }, blue, center, 10), 'negative movement limit rejected');
    assert(JSON.stringify([row, old]) === data, 'pure evaluation does not mutate candidates or legacy order');
    let seed = 74531; const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 200; i++) {
      const angle = random() * Math.PI * 2, delta = .1 + random() * 2.8;
      const u = { x: Math.cos(angle), y: Math.sin(angle) }, v = { x: Math.cos(angle + delta), y: Math.sin(angle + delta) };
      const p = { x: (random() - .5) * 4, y: (random() - .5) * 4 }, t = .01 + random() * 5, s = .01 + random() * 5;
      const result = policy.intersect(ray(p.x - t * u.x, p.y - t * u.y, u.x * 3, u.y * 3, t), ray(p.x - s * v.x, p.y - s * v.y, v.x * 5, v.y * 5, s), center, 10);
      assert(result && near(result.point.x, p.x) && near(result.point.y, p.y), 'independent constructed intersection ' + i);
      assert(near(result.distance, Math.hypot(p.x, p.y) / 10), 'intersection IPS ' + i);
    }
    const frame = document.createElement('iframe'); frame.style.cssText = 'width:375px;height:1900px;border:0';
    let loaded = new Promise(resolve => frame.onload = resolve); frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    frame.contentDocument.documentElement.style.scrollbarWidth = 'none';
    const select = (index, value) => run(`openMemoPicker(${index});selectedMemoValue='${value}';previewMemoSelection();confirmMemoPicker.click()`);
    const fixture = (r = .07023144186707214, ra = 178.3570380974561, b = .2784117869567126, ba = 73.82363833487034, rotation = 38.57659178087488) => run(`
      adjustmentSequence=null;adjustmentLock=null;confirmedCarry=null;adjustmentForecast=null;selectedAdjustmentTarget=null;
      learning.reset([]);dotSets.splice(0);forecastDisplayCache.clear();retainedGuideNumbers.fill(null);guideCandidateIndices.fill(0);
      pitchAutoMode=false;trimAutoMode=false;showChartPage(1);applyChartRotation(0,${rotation});
      memoValues.fill('');adjustmentSelections.forEach(values=>values.fill(''));guideCandidateIndex=0;
      const make=(radius,angle,color)=>radius===null?null:{radius,angle,color,clock:'12:00'};
      if(${r !== null || b !== null})dotSets.push({learningId:newLearningId(),red:make(${r},${ra},'red'),blue:make(${b},${ba},'blue'),adjustments:[]});
      saveDotSets();updateMemoButtons();renderDots();setGuidesVisible(true);updatePitchModeUI();updateTrimModeUI();`);
    const snapshot = () => run(`JSON.stringify([guideNumberChoices,guideCandidateIndex,guideCandidateIndices,retainedGuideNumbers,memoValues,forecastGuides,adjustmentForecast,dotSets,learning.inspect(),adjustmentSequence,confirmedCarry,BalanceState.keys.map(key=>appStorage.getItem(key))])`);
    const check = label => {
      const displayed = () => run('JSON.stringify([tabIntersectionHighlight,guideCandidateToggle.dataset.intersectionBest,guideCandidateToggle.getAttribute("aria-description")])');
      const automatic = displayed(), before = snapshot(); run('updateTabIntersectionHighlight()');
      assert(snapshot() === before, label + ': highlight does not change selection, forecast, amounts, records, learning or locks');
      assert(displayed() === automatic, label + ': prior interaction already refreshed the intersection and border automatically');
      assert(run(`(()=>{
        const blade=adjustmentLock?.page===currentChartPage?Number(adjustmentLock.guideBlade):guideNumberChoices[guideCandidateIndex]?.blade;
        const expected=currentChartPage===1&&!!tabIntersectionHighlight?.winner&&tabIntersectionHighlight.winner.blade===blade;
        return (guideCandidateToggle.dataset.intersectionBest==='true')===expected
          && parseFloat(getComputedStyle(guideCandidateToggle).borderTopWidth)===(expected?4:1);
      })()`), label + ': exactly 4px only when displayed TAB No. matches nearest valid intersection');
      assert(run(`(()=>{const b=guideCandidateToggle.getBoundingClientRect(),m=(currentChartPage?trimModeToggle:pitchModeToggle).getBoundingClientRect();return b.height===44&&m.height===44&&b.left>=0&&m.right<=innerWidth&&b.right<=m.left&&Math.abs(b.top-m.top)<.5&&guideCandidateToggle.scrollWidth<=guideCandidateToggle.clientWidth&&document.documentElement.scrollWidth<=innerWidth;})()`), label + ': original controls and mobile geometry unchanged');
      if (run('currentChartPage===1')) assert(run(`(()=>{
        const expected=[];
        if(!guidePredictionDebug.fallback){
          const ranked=guidePredictionDebug.candidates.filter(c=>c.eligible).sort((a,b)=>Number(b.withinCenterThreshold)-Number(a.withinCenterThreshold)||a.maxCenterDistance-b.maxCenterDistance||a.distance-b.distance);
          for(const c of ranked)if(!expected.some(p=>p[0]===c.blade))expected.push([c.blade,c.direction]);
          for(const blade of [1,2,3])if(!expected.some(p=>p[0]===blade))expected.push([blade,null]);
        }else{
          const start=getAdjustmentStartSet(),color=start?.blue?'blue':'red';
          if(!start?.[color])return !guideNumberChoices.length;
          const candidates=[1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>getDirectionLine(start[color],color,null,blade,direction))).sort((a,b)=>Number(b.centerDistance<=CENTER_DISTANCE_THRESHOLD)-Number(a.centerDistance<=CENTER_DISTANCE_THRESHOLD)||a.centerDistance-b.centerDistance);
          for(const c of candidates)if(!expected.some(p=>p[0]===c.number))expected.push([c.number,c.direction]);
        }
        return JSON.stringify(guideNumberChoices.map(c=>[c.blade,c.candidate?.direction??c.candidate?.line?.direction??null]))===JSON.stringify(expected);
      })()`), label + ': all three automatic ranks/directions equal independent legacy selection');
      assert(run('!document.querySelector(".tab-guide-controls,#mode,#comparison")'),'no added buttons or trial switching UI');
    };
    fixture();
    assert(run('guideNumberChoices[0].blade===3&&tabIntersectionHighlight.winner.blade===2&&memoValues[0]==="3"'), 'intersection best No.2 never displaces original automatic No.3');
    assert(run('guideCandidateToggle.dataset.intersectionBest==="false"'), 'different displayed No. retains normal border');
    if (params.has('screenshot')) {
      const width = Number(params.get('width') || 375); frame.style.width = width + 'px';
      if (params.get('state') === 'best') run('while(guideNumberChoices[guideCandidateIndex].blade!==tabIntersectionHighlight.winner.blade)guideCandidateToggle.click()');
      if (params.get('state') === 'fallback') fixture(.1, 180, .3, 150, 0);
      await tick(); check('screenshot');output.hidden = true; document.body.style.margin = '0'; run('scrollTo(0,0)');document.title = 'PASS';return;
    }
    const recommendations = new Set();
    for (let i = 0; i < 160; i++) {
      fixture(.02 + random() * .23, random() * 360, .05 + random() * .5, random() * 360, 15 + random() * 150);
      const winner = run('tabIntersectionHighlight?.winner?.blade');
      if (winner) { valid++;recommendations.add(winner);if (winner !== run('guideNumberChoices[0].blade')) different++; }
      check('generated ' + i);
    }
    assert(valid > 0 && different > 0 && recommendations.size > 1, 'fixtures exercise multiple recommendations independent of legacy first rank');
    for (const width of [320, 375, 390, 430]) {
      frame.style.width = width + 'px';await tick();
      for (const spec of [[], [.1, 180, .3, 150, 0], [null, 0, .3, 90, 60], [.1, 90, null, 0, 60], [null, 0, null, 0, 60], [.8, 45, .8, 220, 90]]) {
        fixture(...spec);const dataBefore = run('JSON.stringify([dotSets,learning.inspect(),BalanceState.keys.map(key=>appStorage.getItem(key))])');
        for (let rank = 0; rank < 3; rank++) {
          const expected = run('guideNumberChoices[(guideCandidateIndex+1)%3]?.blade');check('width ' + width + '/' + rank);
          run('guideCandidateToggle.click()');
          if (expected) assert(run('guideNumberChoices[guideCandidateIndex].blade') === expected, 'original rank-order cycling retained');
        }
        assert(run('JSON.stringify([dotSets,learning.inspect(),BalanceState.keys.map(key=>appStorage.getItem(key))])') === dataBefore, 'No cycling never alters measurements or learning');
      }
      fixture();run('guideCandidateToggle.click()');check('best selected ' + width);
      assert(run('guideCandidateToggle.dataset.intersectionBest==="true"'), 'best No. becomes thick when displayed');
      const original = run('guideNumberChoices[guideCandidateIndex].blade');select(0, original === 1 ? '2' : '1');
      check('manual No. independent ' + width);
      assert(run('guideCandidateToggle.dataset.intersectionBest==="true"'), 'highlight follows displayed candidate independently of manual form No.');
      select(0, String(original));
      for (const amount of ['1','2','3']) for (const direction of ['UP','DOWN']) { select(2, amount);select(3, direction);check('manual controls ' + width + '/' + amount + '/' + direction); }
      const saved = run('JSON.stringify(adjustmentForecast.points)');run('openMemoPicker(3);selectedMemoValue="UP";previewMemoSelection();closeMemoPicker.click()');
      assert(run('JSON.stringify(adjustmentForecast.points)') === saved, 'cancel preserves predicted points');
      run('guideToggle.click()');check('guide OFF');run('guideToggle.click()');check('guide ON');
      run('showChartPage(0)');check('LINK');assert(run('guideCandidateToggle.dataset.intersectionBest==="false"'), 'LINK never receives TAB highlight');
    }
    fixture();run(`learning.reset([]);dotSets.splice(0);
      const dot=(x,y,color)=>({clock:'12:00',angle:Math.atan2(x-397,520-y)*180/Math.PI,radius:Math.hypot(x-397,y-520)/240,color});
      for(let i=0;i<4;i++){
        if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
        dotSets.push({learningId:newLearningId(),red:dot(407+(3-i)*10,530+(3-i)*5.7735,'red'),blue:dot(450+(3-i)*25,540+(3-i)*20.98,'blue'),adjustments:i<3?[['1','TAB','1','UP']]:[]});
        if(i)learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
      }trimAutoMode=true;saveDotSets();renderDots();setGuidesVisible(true);updateTrimModeUI();`);
    assert(run('!guidePredictionDebug.fallback'), 'real learned TAB path exercised');
    const learned = run('JSON.stringify([dotSets,learning.inspect()])');
    for (let rank = 0; rank < 3; rank++) { for (const amount of ['1','2','3']) { select(2, amount);check('learned ' + rank + '/' + amount); }run('guideCandidateToggle.click()'); }
    assert(run('JSON.stringify([dotSets,learning.inspect()])') === learned, 'learned data unchanged by all highlight updates');
    for (const first of [0,1]) {
      fixture();run(`showChartPage(${first})`);select(0,'1');select(3,'UP');select(2, first ? '1':'1/4');run('addAdjustmentButton.click()');
      assert(run('!!adjustmentLock'), 'first page locks');const frozen = run('JSON.stringify(adjustmentSequence.stages)');check('first locked');
      run(`showChartPage(${1-first})`);assert(run('!adjustmentLock'), 'other page remains unlocked');
      assert(run('adjustmentSequence.stages[0].forecast.points.every(p=>{const o=getDotCoordinates(getAdjustmentStartSet()[p.color]);return Math.hypot(o.x-p.x,o.y-p.y)<1e-7;})'), 'other page uses confirmed endpoints');
      select(0,'2');select(3,'DOWN');select(2,first?'1/4':'1');run('addAdjustmentButton.click()');
      assert(run('JSON.stringify(adjustmentSequence.stages.slice(0,1))')===frozen,'second confirmation never changes first');
      for (const page of [0,1]) { run(`showChartPage(${page})`);const locked=snapshot();run('guideCandidateToggle.click();updateTabIntersectionHighlight()');assert(snapshot()===locked&&run('guideCandidateToggle.disabled'),'highlight preserves locked page and confirmed values');check('both locked'); }
      run(`redInputs.forEach((input,i)=>input.value=['3','0','.1'][i]);blueInputs.forEach(input=>input.value='');addDotButton.click()`);
      assert(run('!adjustmentLock&&!Object.keys(adjustmentSequence.active).length'), 'new partial actual releases both locks');
      assert(run('learning.inspect().samples.length===0'), 'confirmed predictions never enter learning');check('new actual');
    }
    run('balanceFlushState()');loaded=new Promise(resolve=>frame.onload=resolve);frame.contentWindow.location.reload();await loaded;await tick();check('reload');
    assert(run('(()=>{BalanceState.validateRecords(JSON.parse(appStorage.exportText()).records);return true})()'), 'backup format unchanged');
    output.textContent = `PASS: ${checks} checks — display-only intersection, independent legacy rank parity, original single-button cycling, 1px/4px border, manual/learned, origins/history/locks, no synthetic learning, reload and four mobile widths; ${valid} valid/${different} different in 160 generated fixtures`;
    document.title='PASS';frame.remove();
  } catch (error) { output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL'; }
})();
