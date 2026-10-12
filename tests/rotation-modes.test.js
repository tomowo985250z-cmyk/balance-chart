(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  const equal = (actual, expected, label) => assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${label}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  const near = (actual, expected, label, tolerance = 1e-8) => assert(actual.every((angle, i) => Math.abs(angle - expected[i]) < tolerance),
    `${label}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1000px;height:1800px';
    let loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const tick = () => new Promise(resolve => setTimeout(resolve, 50));
    const reload = async () => {
      run('balanceFlushState()'); loaded = new Promise(resolve => frame.onload = resolve);
      frame.contentWindow.location.reload(); await loaded; await tick();
    };
    const angles = () => run('[hovAngle,cruiseAngle]');
    const manual = () => run('[manualPitchAngles.hovAngle,manualPitchAngles.cruiseAngle]');
    const lock = value => run(`rotationLock.checked=${value};rotationLock.dispatchEvent(new Event('change',{bubbles:true}))`);
    const mode = automatic => { if (run('pitchAutoMode') !== automatic) run('pitchModeToggle.click()'); };
    const rotate = (red, blue) => run(`window.dispatchEvent(new MessageEvent('message',{
      source:chartObject.contentWindow,data:{type:'balance-chart-rotation',hovAngle:${red},cruiseAngle:${blue},finished:true}}))`);
    const measure = (red, blue) => run(`redInputs.forEach((input,i)=>input.value=${JSON.stringify(red)}[i]);
      blueInputs.forEach((input,i)=>input.value=${JSON.stringify(blue)}[i]);dotForm.requestSubmit()`);
    const remove = index => run(`dotList.children[${index}].querySelector('.dot-result-row button').click();
      deleteConfirmation.close('delete');deleteConfirmation.dispatchEvent(new Event('close'))`);
    const expectedAuto = () => run(`[getLearnedRotation('LINK','red') ?? getLatestLinkSyncAngle('red') ?? initialChartRotations[0]?.hovAngle ?? 0,
      getLearnedRotation('LINK','blue') ?? getLatestLinkSyncAngle('blue') ?? initialChartRotations[0]?.cruiseAngle ?? 0]`);
    const checkAuto = label => { near(angles(), expectedAuto(), label); };
    const compare = (saved, label) => {
      const before = run('JSON.stringify({dots:dotSets,learning:learning.inspect()})');
      for (let i = 0; i < 4; i++) {
        mode(true); checkAuto(label + ' automatic'); equal(manual(), saved, label + ' automatic preserves manual');
        mode(false); near(angles(), saved, label + ' manual restored'); equal(manual(), saved, label + ' manual unchanged');
      }
      equal(run('JSON.stringify({dots:dotSets,learning:learning.inspect()})'), before, label + ' switches preserve records and learning');
    };
    equal(angles(), [0,0], 'fresh automatic position');
    measure(['2','0','0.5'], ['5','0','0.4']);
    run("dotSets.at(-1).adjustments=[['1','LINK','1/4','UP']];saveDotSets()");
    measure(['3','0','0.4'], ['6','0','0.3']);
    assert(angles().some(angle=>Math.abs(angle)>1), 'automatic position differs from initial before first manual entry');
    await reload(); assert(run('!manualPitchInitialized'), 'automatic measurement and reload do not initialize manual position');
    mode(false); equal(angles(), [0,0], 'first manual starts at initial position');
    remove(1); remove(0);
    rotate(31,-47); equal(angles(), [0,0], 'default lock rejects rotation messages');
    lock(false); rotate(31,0); equal(manual(), [31,0], 'red rotation preserves blue');
    rotate(31,-47); equal(manual(), [31,-47], 'blue rotation preserves red');
    await tick();
    equal(run('JSON.parse(appStorage.getItem(BalanceState.uiKey)).manualPitchAngles'),
      {hovAngle:31,cruiseAngle:-47}, 'manual message saves UI immediately');
    compare([31,-47], 'no measurements');
    await reload(); equal(angles(), [31,-47], 'empty manual reload retains both positions');
    run('showChartPage(1);showChartPage(0)'); equal(angles(), [31,-47], 'page round trip retains both positions');

    // Real form additions and deletions, with imported historical LINK adjustments.
    measure(['2','0','0.5'], ['5','0','0.4']);
    run("dotSets.at(-1).adjustments=[['1','LINK','1/4','UP']];saveDotSets()");
    measure(['3','0','0.4'], ['6','0','0.3']);
    equal(angles(), [31,-47], 'measurement additions do not move manual hexagons');
    assert(run("getLatestLinkSyncAngle('red')!==null && getLatestLinkSyncAngle('blue')!==null"), 'valid automatic geometry for both colors');
    compare([31,-47], 'valid measurements');
    lock(true); rotate(70,80); equal(manual(), [31,-47], 'lock protects manual state');
    mode(true); checkAuto('locked manual to automatic recomputes');
    const previousAuto = angles();
    run("dotSets.at(-1).adjustments=[['2','LINK','1/4','DOWN']];saveDotSets()");
    measure(['8','0','0.35'], ['10','0','0.25']);
    checkAuto('locked automatic position updates on measurement');
    assert(angles().some((angle,i) => Math.abs(angle-previousAuto[i]) > 1), 'latest valid result changes automatic position');
    equal(manual(), [31,-47], 'locked automatic update preserves manual');
    await reload(); checkAuto('automatic recalculated after reload'); equal(manual(), [31,-47], 'automatic reload preserves manual');
    remove(2); checkAuto('deleting latest result restores previous valid geometry');
    mode(false); equal(angles(), [31,-47], 'manual restored after automatic deletion');
    remove(1); equal(angles(), [31,-47], 'deletion while manual preserves position');
    mode(true); equal(angles(), [0,0], 'no valid result falls back to initial position');
    remove(0); equal(angles(), [0,0], 'deleting all results restores automatic initial position');
    compare([31,-47], 'all results deleted');
    await reload(); equal(angles(), [31,-47], 'manual persists after all results deleted and reload');

    // The parent SVG pointer path must obey the same mode and lock rules.
    const drag = (name, delta) => run(`(() => {
      const svg=chartObject.contentDocument.documentElement;
      const handle=chartObject.contentDocument.getElementById('${name}RotationHandle');
      const originalCapture=svg.setPointerCapture;svg.setPointerCapture=()=>{};
      const position=angle=>{const point=svg.createSVGPoint();
        point.x=397+200*Math.cos(angle*Math.PI/180);point.y=520+200*Math.sin(angle*Math.PI/180);
        return point.matrixTransform(svg.getScreenCTM());};
      const event=(type,angle)=>{const point=position(angle);return new PointerEvent(type,{
        pointerId:25,bubbles:true,clientX:point.x,clientY:point.y});};
      try {handle.dispatchEvent(event('pointerdown',0));svg.dispatchEvent(event('pointermove',${delta}));
        svg.dispatchEvent(event('pointerup',${delta}));}finally{svg.setPointerCapture=originalCapture;}
    })()`);
    drag('hov',20); equal(angles(), [31,-47], 'locked pointer drag is ignored');
    lock(false); drag('hov',20); near(angles(), [51,-47], 'unlocked pointer drag changes red independently', 1e-4);
    drag('cruise',-15); near(angles(), [51,-62], 'unlocked pointer drag changes blue independently', 1e-4);
    const pointerAngles = angles();
    await tick(); equal(run('Object.values(JSON.parse(appStorage.getItem(BalanceState.uiKey)).manualPitchAngles)'), pointerAngles, 'pointer rotation saves UI immediately');
    mode(true); drag('hov',20); equal(angles(), [0,0], 'automatic mode rejects pointer rotation with lock off');
    mode(false); equal(angles(), pointerAngles, 'pointer positions restored from automatic');

    // A registered initial position is only used for the first manual entry.
    run(`initialChartRotations[0]={hovAngle:12,cruiseAngle:-23};manualPitchInitialized=false;pitchAutoMode=true;syncAutoPitchRotation()`);
    await reload(); equal(angles(), [12,-23], 'automatic fallback uses registered initial position');
    assert(run('!manualPitchInitialized'), 'automatic reload leaves first manual entry pending');
    mode(false); equal(angles(), [12,-23], 'first manual uses registered initial position');
    rotate(42,-66); lock(true); compare([42,-66], 'registered initial position');
    await reload(); equal(angles(), [42,-66], 'registered initial does not reset saved manual on empty reload');

    // Actual learned models and a missing color, without changing model getters.
    run(`learning.reset([]);dotSets.splice(0);adjustmentForecast=null;
      const dot=(x,y,color)=>({color,clock:'12:00',radius:Math.hypot(x-397,y-520)/240,
        angle:Math.atan2(x-397,520-y)*180/Math.PI});
      for(let i=0;i<4;i++){
        if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
        dotSets.push({learningId:newLearningId(),red:dot(597+(3-i)*80,620+(3-i)*46.188,'red'),
          blue:dot(527+(3-i)*46,670+(3-i)*38.6,'blue'),adjustments:i<3?[['1','LINK','1','UP']]:[]});
        learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
      }saveDotSets();renderDots()`);
    mode(true); assert(run('pitchAutoReady.red && pitchAutoReady.blue'), 'both learned automatic models ready');
    compare([42,-66], 'learned models');
    mode(true); run(`dotSets.forEach(set=>delete set.blue);saveDotSets();renderDots()`);
    checkAuto('red model remains independent when blue missing');
    equal(angles()[1], -23, 'missing blue falls back to its own initial position');
    equal(manual(), [42,-66], 'missing blue does not change either manual position');
    await reload(); checkAuto('learned automatic restored after reload');
    const backup = run('appStorage.exportText()'); frame.contentWindow.rotationBackup = backup;
    loaded = new Promise(resolve => frame.onload = resolve);
    run('appStorage.importText(rotationBackup);location.reload()'); await loaded; await tick();
    checkAuto('backup restores automatic position'); mode(false); equal(angles(), [42,-66], 'backup preserves independent manual positions');
    // Existing v1 backups have no initialization flag; preserve their saved angles.
    loaded = new Promise(resolve => frame.onload = resolve);
    run(`balanceFlushState();const legacy=JSON.parse(appStorage.exportText());
      const state=JSON.parse(legacy.records[BalanceState.uiKey]);delete state.manualPitchInitialized;
      BalanceState.validateUI(state);legacy.records[BalanceState.uiKey]=JSON.stringify(state);
      appStorage.importText(JSON.stringify(legacy));location.reload()`); await loaded; await tick();
    equal(angles(), [42,-66], 'legacy UI state retains saved manual position');
    assert(run('!appStorage.readOnly'), 'saved state stays writable');
    frame.remove(); output.textContent = `PASS: ${checks} checks`; document.title = 'PASS';
  } catch (error) { output.textContent = `FAIL after ${checks} checks\n${error.stack}`; document.title = 'FAIL'; }
})();
