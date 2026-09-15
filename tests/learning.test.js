/* 専用ブラウザプロファイルで tests/learning.html を開く。既存のユーザーデータは使わない。 */
(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const groups = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
    checks += 1;
    output.textContent = `RUNNING: ${checks} ${message}`;
  };
  const near = (actual, expected, message, tolerance = 1e-8) => assert(Math.abs(actual - expected) < tolerance, `${message}: ${actual} / ${expected}`);
  const memory = () => {
    const data = new Map();
    return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  };
  const rotations = { LINK: { red: 0, blue: 0 }, TAB: { red: 0, blue: 0 } };
  const options = storage => ({ storage, coordinates: dot => dot, nominalAngle: (blade, direction) => (blade - 1) * 120 + (direction === 'DOWN' ? 180 : 0) });
  const vector = (distance, angle) => ({ x: distance * Math.cos(angle * Math.PI / 180), y: distance * Math.sin(angle * Math.PI / 180) });
  const startSets = () => [{ learningId: 'r0', red: { x: 0, y: 0 }, blue: { x: 0, y: 0 }, adjustments: [] }];
  function addSample(engine, sets, type, redVector, blueVector, amount = '1', blade = '1', direction = 'UP') {
    const before = sets.at(-1);
    before.adjustments = [[blade, type, amount, direction]];
    engine.arm(sets, before.learningId);
    engine.sync(sets, rotations);
    sets.push({ learningId: `r${sets.length}`, adjustments: [],
      red: redVector ? { x: before.red.x + redVector.x, y: before.red.y + redVector.y } : null,
      blue: blueVector ? { x: before.blue.x + blueVector.x, y: before.blue.y + blueVector.y } : null });
    engine.acceptMeasurement(sets, sets.at(-1).learningId);
    engine.sync(sets, rotations);
  }
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') {
      output.textContent = '専用テストプロファイルで learning.html?isolated=1 を開いてください。';
      return;
    }
    near(BalanceLearning.wrap(1 - 359), 2, '359→1');
    near(BalanceLearning.wrap(359 - 1), -2, '1→359');
    assert(BalanceLearning.adjustment(['1', 'LINK', '1/8', 'UP']).amount === 0.125, 'fraction amount');
    assert(BalanceLearning.adjustment(['1', 'TAB', '1/8', 'UP']) === null, 'separate units');
    assert(BalanceLearning.adjustment(['1', 'constructor', '1', 'UP']) === null, 'malformed adjustment type rejected');
    const storage = memory();
    const engine = BalanceLearning.create(options(storage));
    const sets = startSets();
    engine.sync(sets, rotations);
    assert(engine.predict('LINK', 'red', 1, 'UP', 1, sets[0].red) === null, 'fallback before learning');
    addSample(engine, sets, 'LINK', vector(100, 10), vector(40, -20));
    near(engine.inspect().models['LINK:red'].angleCorrection, 6, 'latest measured angle weight 0.60');
    assert(engine.predict('LINK', 'red', 1, 'UP', 1, sets.at(-1).red) === null, 'fallback with one sample');
    near(engine.inspect().samples[0].angleError, 10, 'saved prediction compared with actual angle');
    addSample(engine, sets, 'LINK', vector(200, 10), vector(40, -20));
    near(engine.inspect().models['LINK:red'].distanceCorrection, 1.3, 'distance gradual correction');
    addSample(engine, sets, 'LINK', vector(200, 10), vector(40, -20));
    const learned = engine.predict('LINK', 'red', 1, 'UP', 1, sets.at(-1).red);
    near(learned.angle, 9.36, 'correction reaches next prediction');
    assert(learned.model === 'LINK:red:1:UP', 'matching BLD model takes priority');
    assert(engine.predict('LINK', 'blue', 1, 'UP', 1, sets.at(-1).blue).angle < 0, 'HOV and cruise independent');
    const beforeDuplicate = JSON.stringify(engine.inspect().models);
    engine.sync(sets, rotations);
    assert(JSON.stringify(engine.inspect().models) === beforeDuplicate, 'no duplicate learning');
    const restored = BalanceLearning.create(options(storage));
    restored.sync(sets, rotations);
    assert(JSON.stringify(restored.inspect().models) === beforeDuplicate, 'persistent model reconstruction');
    const linkBeforeTab = JSON.stringify(engine.inspect().models['LINK:red']);
    addSample(engine, sets, 'TAB', vector(30, 80), vector(90, -60));
    addSample(engine, sets, 'TAB', vector(30, 80), vector(90, -60));
    addSample(engine, sets, 'TAB', vector(30, 80), vector(90, -60));
    assert(JSON.stringify(engine.inspect().models['LINK:red']) === linkBeforeTab, 'TAB does not change LINK');
    assert(['LINK:red', 'LINK:blue', 'TAB:red', 'TAB:blue'].every(key => engine.inspect().models[key]?.sampleCount === 3), 'four separate channels');
    assert(engine.inspect().samples.every(sample => ['dx', 'dy', 'distance', 'angle'].every(key => Number.isFinite(sample.actualVector[key]))), 'actual XY vectors');
    groups.push('XY・4系統分離・学習率・保存・重複防止');

    const circle = BalanceLearning.create({ ...options(memory()), nominalAngle: () => 359 });
    const circleSets = startSets();
    addSample(circle, circleSets, 'LINK', vector(100, 1), vector(50, 1));
    near(circle.inspect().models['LINK:red'].angleCorrection, 1.2, 'circular error learns +2, not -358');
    const correctionBeforeTiny = circle.inspect().models['LINK:red'].angleCorrection;
    addSample(circle, circleSets, 'LINK', vector(0.01, 170), vector(0.01, -170));
    near(circle.inspect().models['LINK:red'].angleCorrection, correctionBeforeTiny, 'short vectors do not change angle');
    const distanceBeforeOutlier = circle.inspect().models['LINK:red'].baseDistance * circle.inspect().models['LINK:red'].distanceCorrection;
    addSample(circle, circleSets, 'LINK', vector(1000000, 180), vector(1000000, 180));
    assert(Math.abs(BalanceLearning.wrap(circle.inspect().models['LINK:red'].angleCorrection - correctionBeforeTiny)) <= 13.5 + 1e-8, 'outlier angle cap');
    assert(circle.inspect().models['LINK:red'].baseDistance * circle.inspect().models['LINK:red'].distanceCorrection <= distanceBeforeOutlier * 1.3 + 1e-8, 'outlier distance cap');
    const detail = BalanceLearning.create(options(memory())), detailSets = startSets();
    for (let index = 0; index < 5; index++) addSample(detail, detailSets, 'LINK', vector(50, 0), vector(80, 20));
    assert(detail.predict('LINK', 'red', 1, 'UP', 1, detailSets.at(-1).red).model === 'LINK:red:1:UP', 'detail model after five samples');
    assert(detail.predict('LINK', 'red', 2, 'DOWN', 1, detailSets.at(-1).red).model === 'LINK:red', 'unseen BLD/direction uses parent');
    const priorManual = detail.predict('LINK', 'red', 1, 'UP', 1, detailSets.at(-1).red);
    detail.recordManual('LINK', 'red', priorManual.rotation, priorManual.rotation + 12);
    const afterManual = detail.predict('LINK', 'red', 1, 'UP', 1, detailSets.at(-1).red);
    assert(afterManual.angle > priorManual.angle && afterManual.angle - priorManual.angle < 1, 'manual input is weak auxiliary');
    assert(detail.inspect().manual['LINK:red'].manualAngleCorrection === 12, 'manual angles recorded');
    groups.push('0/360度・微小移動・外れ値・BLD/UP/DOWN・手動補助');

    const countBeforeEdit = detail.inspect().models['LINK:red'].sampleCount;
    detailSets.at(-1).red.x += 20;
    detail.sync(detailSets, rotations);
    assert(detail.inspect().models['LINK:red'].sampleCount === countBeforeEdit - 1, 'edit invalidates sample without learning replacement');
    detailSets[1].adjustments.push(['2', 'TAB', '1', 'DOWN']);
    detail.sync(detailSets, rotations);
    assert(detail.inspect().models['LINK:red'].sampleCount === countBeforeEdit - 2, 'mixed adjustment excluded');
    detailSets.splice(2, 1);
    detail.sync(detailSets, rotations);
    assert(!detail.inspect().samples.some(sample => sample.key.startsWith('r1/r3:')), 'deletion does not invent adjacent movement');
    const measurementCopy = JSON.stringify(detailSets);
    detail.reset(detailSets);
    detail.sync(detailSets, rotations);
    assert(Object.keys(detail.inspect().models).length === 0, 'reset stays empty with old measurements');
    assert(JSON.stringify(detailSets) === measurementCopy, 'reset does not edit measurements');
    const resetReload = BalanceLearning.create(options(memory()));
    const resetStore = memory();
    resetStore.setItem(BalanceLearning.storageKey, JSON.stringify(detail.inspect()));
    const resetRestored = BalanceLearning.create(options(resetStore));
    resetRestored.sync(detailSets, rotations);
    assert(Object.keys(resetRestored.inspect().models).length === 0, 'reset survives reload');
    // 削除後でも、新しい測定には一意なIDを使う。
    detailSets.forEach((set, index) => { set.learningId = `r${index}`; });
    resetReload.reset(detailSets);
    addSample(resetReload, detailSets, 'LINK', vector(40, 0), vector(60, 0));
    assert(resetReload.inspect().models['LINK:red'].sampleCount === 1, 'new results learn after reset');
    const badStore = memory();
    badStore.setItem(BalanceLearning.storageKey, '{invalid');
    const broken = BalanceLearning.create(options(badStore));
    broken.sync(startSets(), rotations);
    assert(!Object.keys(broken.inspect().models).length, 'corrupt storage handled');
    const noStorage = BalanceLearning.create(options({ getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } }));
    noStorage.sync(startSets(), rotations);
    assert(Boolean(noStorage.inspect().storageError), 'storage failure is nonfatal');
    const delayedStore = memory();
    const delayed = BalanceLearning.create(options(delayedStore));
    const delayedSets = startSets();
    addSample(delayed, delayedSets, 'LINK', vector(40, 0), null);
    assert(delayed.inspect().models['LINK:red'].sampleCount === 1 && !delayed.inspect().models['LINK:blue'], 'missing cruise trains only HOV');
    delayedSets[1].blue = vector(80, 30);
    delayed.acceptMeasurement(delayedSets, delayedSets[1].learningId, ['blue']);
    delayed.sync(delayedSets, rotations);
    assert(delayed.inspect().models['LINK:red'].sampleCount === 1 && delayed.inspect().models['LINK:blue'].sampleCount === 1, 'later cruise addition without duplicate HOV');
    const unitEngine = BalanceLearning.create(options(memory())), unitSets = startSets();
    addSample(unitEngine, unitSets, 'LINK', vector(12.5, 0), vector(25, 0), '1/8');
    addSample(unitEngine, unitSets, 'LINK', vector(200, 0), vector(400, 0), '2');
    near(unitEngine.inspect().models['LINK:red'].baseDistance, 100, 'LINK displacement per flat');
    near(unitEngine.inspect().models['LINK:red'].distanceCorrection, 1, 'amount does not masquerade as distance error');
    groups.push('編集・削除・混在調整・学習リセット・保存失敗');

    const practiceStore = memory(), practice = BalanceLearning.create(options(practiceStore)), practiceSets = startSets();
    practiceSets[0].adjustments = [['1','TAB','1','UP']];
    practice.sync(practiceSets, rotations);
    practiceSets.push({learningId:'r1',red:vector(30,40),blue:vector(80,90),adjustments:[]});
    practice.acceptMeasurement(practiceSets, 'r1');
    practice.sync(practiceSets, rotations);
    assert(practice.inspect().samples.length === 0, 'practice adjustment plus measurement does not learn');
    assert(!practice.arm(practiceSets,'r0'), 'cannot mark an old adjustment retroactively');
    const armedStore=memory(), armedSets=startSets(), armedEngine=BalanceLearning.create(options(armedStore));
    armedSets[0].adjustments=[['1','TAB','1','UP']];
    armedEngine.arm(armedSets,'r0'); armedEngine.sync(armedSets,rotations);
    const armedReload=BalanceLearning.create(options(armedStore));
    armedReload.sync(armedSets,rotations);
    armedSets.push({learningId:'r1',red:vector(30,0),blue:vector(60,0),adjustments:[]});
    assert(armedReload.acceptMeasurement(armedSets,'r1'),'real-adjustment designation survives reload');
    armedReload.sync(armedSets,rotations);
    assert(armedReload.inspect().models['TAB:blue'].sampleCount===1,'reloaded designation learns once');
    armedSets.push({learningId:'r2',red:vector(40,30),blue:vector(90,80),adjustments:[]});
    assert(!armedReload.acceptMeasurement(armedSets,'r2'),'designation never spills into another measurement');
    armedReload.sync(armedSets,rotations);
    assert(armedReload.inspect().models['TAB:blue'].sampleCount===1,'later practice measurement leaves purple learning unchanged');
    const recent = BalanceLearning.create(options(memory())), recentSets = startSets();
    for (let i=0;i<20;i++) addSample(recent,recentSets,'TAB',vector(50,0),vector(100,0));
    for (let i=0;i<3;i++) addSample(recent,recentSets,'TAB',vector(50,0),vector(100,10));
    near(recent.predict('TAB','blue',1,'UP',1,recentSets.at(-1).blue).angle,9.36,'latest three dominate twenty old purple samples');
    near(recent.predict('TAB','red',1,'UP',1,recentSets.at(-1).red).angle,0,'purple changes never affect TAB HOV');
    addSample(recent,recentSets,'TAB',vector(50,120),vector(100,125),'1','2');
    addSample(recent,recentSets,'TAB',vector(50,120),vector(100,125),'1','2');
    assert(recent.predict('TAB','blue',2,'UP',1,recentSets.at(-1).blue).model==='TAB:blue:2:UP','purple prioritizes two matching samples');
    assert(recent.predict('TAB','blue',3,'DOWN',1,recentSets.at(-1).blue).model==='TAB:blue','purple missing condition uses TAB cruise parent');
    const legacy = memory();
    legacy.setItem(BalanceLearning.storageKey,JSON.stringify({...engine.inspect(),version:1}));
    const migrated = BalanceLearning.create(options(legacy));
    migrated.sync(sets,rotations);
    assert(migrated.inspect().samples.length===0 && migrated.inspect().version===2,'unverified version 1 samples are not reused');
    groups.push('実調整指定・練習除外・紫の直近優先・同条件優先・旧版移行');

    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1000px;height:1600px';
    const loaded = new Promise(resolve => { frame.onload = resolve; });
    frame.src = '../index.html';
    document.body.append(frame);
    await loaded;
    const run = code => frame.contentWindow.eval(code);
    assert(run('typeof renderDots') === 'function', 'app script loads');
    run(`
      window.testErrors = [];
      window.addEventListener('error', event => testErrors.push(event.message));
      function testDot(x, y, color) {
        const dx = x - CHART_CENTER_X, dy = y - CHART_CENTER_Y;
        return { color, radius: Math.hypot(dx,dy)/CHART_RADIUS, angle: Math.atan2(dx,-dy)*180/Math.PI, clock:'12:00' };
      }
      learning.reset([]);
      dotSets.splice(0, dotSets.length, { learningId:newLearningId(), red:testDot(550,600,'red'), blue:testDot(570,620,'blue'), adjustments:[] });
      saveDotSets(); renderDots();
    `);
    assert(run("dotOverlay.querySelectorAll('circle').length") === 2, 'red and blue dots rendered');
    assert(run("dotOverlay.querySelectorAll('.guide-direction-line').length") === 2, 'no-data pitch guides fallback');
    assert(run("getComputedStyle(dotOverlay).overflow") === 'visible', 'out of chart overflow preserved');
    run("pitchModeToggle.click(); guideToggle.click();");
    assert(run('pitchAutoMode') && run("dotOverlay.classList.contains('guides-visible')"), 'auto and guide toggles');
    assert(run("dotOverlay.querySelectorAll('.guide-direction-line').length") === 2, 'auto no-data guides fallback');
    run('showChartPage(1); trimModeToggle.click();');
    assert(run("dotOverlay.querySelectorAll('.guide-direction-line').length") === 1, 'no-data trim guide');
    assert(run("dotOverlay.classList.contains('trim-tab')"), 'trim page color class');
    run("showChartPage(0); dotSets[0].blue=null; renderDots();");
    assert(run("dotOverlay.querySelectorAll('.guide-direction-line').length") === 1, 'HOV only preserved');
    groups.push('実画面：ドット・両ページ・トグル・初期ガイド・HOVのみ・枠外表示');

    run(`
      learning.reset([]);
      dotSets.splice(0);
      for (let i=0;i<4;i++) {
        if (i>0) learning.arm(dotSets,dotSets.at(-1).learningId);
        dotSets.push({learningId:newLearningId(),
          red:testDot(597+(3-i)*80,620+(3-i)*46.188,'red'),
          blue:testDot(527+(3-i)*46,670+(3-i)*38.6,'blue'),
          adjustments:i<3 ? [['1','LINK','1','UP']] : []});
        learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
      }
      saveDotSets(); renderDots();
    `);
    assert(run('learning.inspect().models["LINK:red"].sampleCount') === 3, 'UI learns three LINK samples');
    assert(run('guidePredictionDebug.fallback') === false, 'learned candidate path');
    assert(run('guidePredictionDebug.selected.predictions.every(p => p.improvement >= -1e-6)') === true, 'both endpoints improve');
    assert(run('guidePredictionDebug.candidates.length') === 54, 'all LINK amounts evaluated');
    assert(run('Math.abs(hovAngle - getLearnedRotation("LINK","red")) < 1e-8'), 'automatic hexagon uses correction');
    assert(run(`Array.from(dotOverlay.querySelectorAll('.guide-direction-line')).every((line,i) =>
      Math.abs(Number(line.getAttribute('x2')) - guidePredictionDebug.selected.predictions[i].position.x) < 1e-8)`), 'arrows terminate at predicted adjustment position');
    const savedModel = run('JSON.stringify(learning.inspect().models)');
    const reloaded = new Promise(resolve => { frame.onload = resolve; });
    frame.contentWindow.location.reload();
    await reloaded;
    assert(run('JSON.stringify(learning.inspect().models)') === savedModel, 'real localStorage reload');
    assert(run('getDotCount()') === 8, 'measurements survive reload');
    run('pitchModeToggle.click();');
    assert(run('guidePredictionDebug.fallback') === false, 'learned guides after reload');
    run(`
      pitchModeToggle.click();
      window.dispatchEvent(new MessageEvent('message', {source:chartObject.contentWindow,
        data:{type:'balance-chart-rotation',hovAngle:hovAngle+10,cruiseAngle:cruiseAngle,finished:true}}));
    `);
    assert(run('Number.isFinite(learning.inspect().manual["LINK:red"].manualFinalAngle)'), 'manual correction captured by existing rotation message');
    assert(run('learning.inspect().manual["LINK:blue"] === undefined'), 'unchanged cruise is not a manual correction');
    const dotsBeforeReset = run('localStorage.getItem(DOT_STORAGE_KEY)');
    const rotationBeforeReset = run('localStorage.getItem(ROTATION_STORAGE_KEY)');
    run("document.getElementById('resetLearning').click(); deleteConfirmation.close('delete');");
    await new Promise(resolve => setTimeout(resolve, 50));
    assert(run('Object.keys(learning.inspect().models).length') === 0, 'reset button clears models');
    assert(run('localStorage.getItem(DOT_STORAGE_KEY)') === dotsBeforeReset, 'reset preserves stored measurements');
    assert(run('localStorage.getItem(ROTATION_STORAGE_KEY)') === rotationBeforeReset, 'reset preserves settings');
    assert(run("dotOverlay.querySelectorAll('.guide-direction-line').length") === 2, 'guides remain after reset');
    groups.push('実画面：実測予測・終点評価・自動角度・再読込・手動補助・リセット');

    run(`
      function testDot(x, y, color) {
        const dx = x - CHART_CENTER_X, dy = y - CHART_CENTER_Y;
        return { color, radius:Math.hypot(dx,dy)/CHART_RADIUS, angle:Math.atan2(dx,-dy)*180/Math.PI, clock:'12:00' };
      }
      learning.reset([]); dotSets.splice(0);
      for(let i=0;i<7;i++) {
        if (i>0) learning.arm(dotSets,dotSets.at(-1).learningId);
        const linkRemaining=Math.max(0,3-i), tabRemaining=6-Math.max(3,i);
        dotSets.push({learningId:newLearningId(),
          red:testDot(597+linkRemaining*80+tabRemaining*10,620+linkRemaining*46.188,'red'),
          blue:testDot(557+linkRemaining*46+tabRemaining*50,620+linkRemaining*38.6+tabRemaining*30,'blue'),
          adjustments:i<6 ? [['1',i<3?'LINK':'TAB','1','UP']] : []});
        learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
      }
      saveDotSets(); renderDots(); showChartPage(1); trimModeToggle.click();
    `);
    assert(run('guidePredictionDebug.fallback') === false, 'learned trim candidates');
    assert(run('guidePredictionDebug.candidates.length') === 18, 'TAB amount candidates');
    assert(run('guidePredictionDebug.selected.predictions.length') === 1, 'TAB still evaluates cruise only');
    assert(run('guidePredictionDebug.selected.predictions[0].model.startsWith("TAB:blue")'), 'trim uses independent TAB/cruise model');
    near(run('cruiseAngle'), run('getLearnedRotation("TAB","blue")'), 'purple hexagon follows learned rotation');
    assert(run("dotOverlay.querySelectorAll('circle').length") === 14, 'all measurement dots remain');
    run('showChartPage(0); pitchModeToggle.click();');
    assert(run('guidePredictionDebug.selected.predictions.every(p=>p.model.startsWith("LINK:"))'), 'page switch restores LINK models');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert(run('rotationLocked && rotationHandles.length >= 2 && rotationHandles.every(handle=>handle.style.pointerEvents === "none")'),
      'automatic rotation remains locked: ' + run('JSON.stringify({locked:rotationLocked,handles:rotationHandles.map(h=>h.style.pointerEvents),svg:chartObject.contentDocument?.documentElement.tagName,auto:pitchAutoMode})'));
    // 補正済み終点だけを固定して、実際のLINK候補選択経路を検証する。
    run(`
      window.testCandidateSelection = (pairs, page=0) => {
        const originalPredict=learning.predict, originalPage=currentChartPage;
        try {
          currentChartPage=page;
          learning.predict=(type,color,blade,direction,amount) => {
            const pair=pairs[blade-1];
            if (!pair || direction!=='UP' || amount!==1) return null;
            return {position:{x:CHART_CENTER_X+pair[color==='red'?0:1]*CHART_RADIUS,y:CHART_CENTER_Y}};
          };
          getLearnedGuideLines({red:testDot(637,520,'red'),blue:testDot(637,520,'blue')});
          return guidePredictionDebug.selected?.blade ?? null;
        } finally { learning.predict=originalPredict; currentChartPage=originalPage; }
      };
    `);
    const categories = [[0.9,0.9],[0.4,1.4],[1.1,0.2],[1.2,1.2]];
    for (let high=0;high<categories.length;high++) {
      assert(run(`testCandidateSelection(${JSON.stringify([categories[high]])})`)===1, `LINK category ${high+1} considered`);
      for (let low=high+1;low<categories.length;low++) {
        assert(run(`testCandidateSelection(${JSON.stringify([categories[low],categories[high]])})`)===2,
          `LINK priority ${high+1} beats ${low+1}`);
      }
    }
    assert(run('testCandidateSelection([[0.4,1.9],[0.42,1.1]])')===1,'HOV closest endpoint wins despite worse cruise');
    assert(run('testCandidateSelection([[0.4,1.9],[0.405,1.1]])')===2,'similar HOV endpoints prefer better cruise');
    assert(run('testCandidateSelection([[0.4,1.9],[0.4,1.1]])')===2,'equal HOV endpoints prefer better cruise');
    assert(run('testCandidateSelection([[0.9,0.8],[0.2,0.4]],1)')===2,'TAB still selects by cruise endpoint');
    assert(run('testCandidateSelection([[0.2,1.2],[0.8,1.4]],1)')===null,'TAB still rejects worsening cruise candidates');
    groups.push('LINK：4分類の全順位・HOV優先・同程度なら巡航優先・TAB維持');
    // 両方悪化しかないLINK候補も、新仕様の最下位候補として評価する。
    run("window.centerGuides=getLearnedGuideLines({red:testDot(397,520,'red'),blue:testDot(397,520,'blue')});");
    assert(run('guidePredictionDebug.selected.predictions.every(p=>p.improvement<0)'), 'LINK both-worsening is last priority');
    assert(run('centerGuides.length') === 2, 'LINK selects last-priority candidate when all candidates worsen');
    groups.push('実画面：学習済みTAB・対象色維持・ページ切替・自動回転ロック・悪化候補除外');

    run(`
      dotSets.splice(0); learning.reset([]); renderDots();
      [redInputs[0].value,redInputs[1].value,redInputs[2].value]=['3','0','0.5'];
      blueInputs.forEach(input=>input.value=''); dotForm.requestSubmit();
    `);
    assert(run('dotSets.length') === 1 && run('getDotCount()') === 1, 'existing measurement form');
    near(run('getDotCoordinates(dotSets[0].red).x'), 517, 'unchanged dot coordinate calculation');
    run("memoValues.splice(0,4,'2','LINK','1/4','UP'); adjustmentForm.requestSubmit();");
    assert(run('dotSets[0].adjustments[0][2]') === '1/4', 'existing adjustment form');
    run("startResultEdit(dotSets[0]); redInputs[2].value='0.6'; dotForm.requestSubmit();");
    near(run('dotSets[0].red.radius'), 0.6, 'existing result edit');
    run("startCruiseAddition(dotSets[0]); [blueInputs[0].value,blueInputs[1].value,blueInputs[2].value]=['6','0','0.4']; dotForm.requestSubmit();");
    assert(run('getDotCount()') === 2 && run('dotSets.length') === 1, 'existing later cruise form');
    near(run('getDotCoordinates(dotSets[0].blue).y'), 616, 'unchanged cruise coordinate');
    run("startAdjustmentEdit(dotSets[0],dotSets[0].adjustments[0]); memoValues[2]='1/2'; adjustmentForm.requestSubmit();");
    assert(run('dotSets[0].adjustments[0][2]') === '1/2', 'existing adjustment edit');
    assert(run('learning.inspect().samples.length')===0,'ordinary form inputs do not train');
    run("dotList.querySelector('.dot-result-row button').click(); deleteConfirmation.close('delete');");
    await new Promise(resolve => setTimeout(resolve, 50));
    assert(run('dotSets.length') === 0, 'existing confirmed deletion');
    groups.push('実画面：測定入力・調整入力・編集・巡航後入力・削除');

    run(`
      [redInputs[0].value,redInputs[1].value,redInputs[2].value]=['3','0','0.8'];
      [blueInputs[0].value,blueInputs[1].value,blueInputs[2].value]=['6','0','0.8']; dotForm.requestSubmit();
      memoValues.splice(0,4,'1','TAB','1','UP'); actualAdjustment.checked=true; adjustmentForm.requestSubmit();
    `);
    assert(run('learning.isArmed(dotSets[0])'),'real adjustment checkbox arms latest measurement');
    assert(!run('actualAdjustment.checked'),'checkbox resets after recording');
    run(`
      [redInputs[0].value,redInputs[1].value,redInputs[2].value]=['3','0','0.6'];
      [blueInputs[0].value,blueInputs[1].value,blueInputs[2].value]=['6','0','0.5']; dotForm.requestSubmit();
    `);
    assert(run('learning.inspect().models["TAB:blue"].sampleCount')===1,'next measurement trains purple');
    run("startResultEdit(dotSets[1]); blueInputs[2].value='0.3'; dotForm.requestSubmit();");
    assert(run('learning.inspect().models["TAB:blue"]===undefined'),'edited measurement is not learned again');
    assert(run('learning.inspect().models["TAB:red"].sampleCount')===1,'editing cruise leaves confirmed HOV intact');

    run(`
      learning.reset([]);
      dotSets.splice(0);
      dotSets.push({learningId:newLearningId(),red:testDot(550,600,'red'),blue:testDot(570,620,'blue'),adjustments:[['1','LINK','1','UP']]});
      currentChartPage=1; hovAngle=77; cruiseAngle=88;
      pitchAutoMode=true; pitchAutoReady.red=true; pitchAutoReady.blue=true;
      autoPitchAngles.hovAngle=31; autoPitchAngles.cruiseAngle=62;
      renderDots();
    `);
    near(run('learning.inspect().pending[dotSets[0].learningId].predictions.red.angle'), run('BalanceLearning.wrap(getNominalAdjustmentAngle(1,"UP")+31)'), 'LINK snapshot never uses visible TAB HOV angle');
    near(run('learning.inspect().pending[dotSets[0].learningId].predictions.blue.angle'), run('BalanceLearning.wrap(getNominalAdjustmentAngle(1,"UP")+62)'), 'LINK snapshot never uses visible TAB cruise angle');

    frame.remove();
    output.textContent = `PASS: ${checks} checks\n${groups.join('\n')}`;
    document.title = 'PASS';
  } catch (error) {
    output.textContent = `FAIL after ${checks} checks\n${error.stack}`;
    document.title = 'FAIL';
  }
})();
