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

    for (const type of ['LINK','TAB']) {
      const store=memory(), history=BalanceLearning.create(options(store));
      const records=Array.from({length:3},(_,i)=>({learningId:'past'+i,red:{x:i*40,y:i*10},blue:{x:i*60,y:i*20},
        adjustments:i<2?[['2',type,'1','DOWN']]:[]}));
      const original=JSON.stringify(records);
      history.sync(records,rotations);
      const candidates=history.historicalCandidates(records);
      assert(candidates.length===(type==='LINK'?4:2),type+' historical candidate colors');
      assert(history.inspect().samples.length===0,'listing history never learns');
      for(const candidate of candidates) assert(history.confirmHistorical(records,candidate),'explicit historical confirmation');
      assert(!history.confirmHistorical(records,candidates[0]),'duplicate confirmation rejected');
      history.sync(records,rotations);
      assert(JSON.stringify(records)===original,'historical confirmation preserves source records');
      for(const color of type==='LINK'?['red','blue']:['blue']) {
        const prediction=history.predict(type,color,2,'DOWN',2,records.at(-1)[color]);
        assert(prediction?.model===type+':'+color+':2:DOWN','historical detail model ready');
        near(prediction.distance,2*Math.hypot(color==='red'?40:60,color==='red'?10:20),'historical distance per amount');
      }
      if(type==='TAB') assert(!history.inspect().models['TAB:red'],'purple confirmation excludes TAB red');
      const loaded=BalanceLearning.create(options(store)); loaded.sync(records,rotations);
      assert(JSON.stringify(loaded.inspect().models)===JSON.stringify(history.inspect().models),'historical confirmations survive reload and rebuild');
      loaded.sync(records,rotations);
      assert(loaded.inspect().samples.length===candidates.length,'repeated sync never duplicates history');
      const stale=BalanceLearning.create(options(memory())); stale.sync(records,rotations);
      const candidate=stale.historicalCandidates(records)[0];
      records[0][candidate.color].x+=1;
      assert(!stale.confirmHistorical(records,candidate),'stale measurement cannot be confirmed');
      records[0].adjustments.push(['1',type,'1','UP']);
      assert(!stale.historicalCandidates(records).some(c=>c.index===0),'multiple adjustments excluded');
      records[1].blue=null; records[2].blue=null;
      assert(!stale.historicalCandidates(records).some(c=>c.color==='blue'),'missing measurement excluded');
      stale.reset(records);
      assert(stale.historicalCandidates(records).length===0,'reset exclusions retained');
    }
    groups.push('過去実調整：明示確定・色別/BLD/方向・距離学習・再読込・二重登録防止・不明確履歴除外');
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
    run('updateAdjustmentForecast(["1","TAB","2","UP"]);');
    assert(run('adjustmentForecast.points.every(point=>{const expected=learning.predict("TAB",point.color,1,"UP",2,getDotCoordinates(dotSets.at(-1)[point.color]));return expected && point.x===expected.position.x && point.y===expected.position.y;}) && adjustmentForecast.points.length===2'),'forecast uses real independent learned predictions');
    run('adjustmentForecast=null; renderAdjustmentForecast();');
    // HOV修正前(c3525d6)から不変のTAB角度式を、実登録方向と実測で検証する。
    run(`
      window.testTrimRotationRegression = (blade,direction,rotation,count) => {
        const store=new Map();
        const engine=BalanceLearning.create({
          storage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)},
          coordinates:getDotCoordinates,nominalAngle:getNominalAdjustmentAngle,radius:CHART_RADIUS});
        // SVGの登録辺から独立に求めたUP方向。DOWNはその反対方向。
        const nominal=[Math.atan2(-175,-303.1)*180/Math.PI,90,Math.atan2(-175,303.1)*180/Math.PI][blade-1]
          +(direction==='DOWN'?180:0);
        const radians=(nominal+rotation)*Math.PI/180;
        const sets=[{learningId:'tab0',blue:testDot(397,520,'blue'),adjustments:[]}];
        const initial={LINK:{red:137,blue:-121},TAB:{red:73,blue:rotation}};
        for(let i=1;i<=count;i++) {
          sets.at(-1).adjustments=[[String(blade),'TAB','1',direction]];
          engine.arm(sets,sets.at(-1).learningId);
          engine.sync(sets,initial);
          sets.push({learningId:'tab'+i,blue:testDot(397+i*30*Math.cos(radians),520+i*30*Math.sin(radians),'blue'),adjustments:[]});
          engine.acceptMeasurement(sets,sets.at(-1).learningId);
          engine.sync(sets,initial);
        }
        const savedSets=dotSets.slice(), savedAuto=autoTrimCruiseAngle, savedAngle=cruiseAngle, savedReady=trimAutoReady;
        const original={rotation:learning.rotation,latestCondition:learning.latestCondition,isConfirmed:learning.isConfirmed};
        try {
          dotSets.splice(0,dotSets.length,...sets);
          Object.assign(learning,{rotation:engine.rotation,latestCondition:engine.latestCondition,isConfirmed:engine.isConfirmed});
          const learned=getLearnedRotation('TAB','blue');
          syncAutoTrimRotation();
          const matrix=chartObject.contentDocument.getElementById('cruiseGroup').transform.baseVal.consolidate().matrix;
          return {angle:cruiseAngle,learned,matrixAngle:Math.atan2(matrix.b,matrix.a)*180/Math.PI,
            keys:Object.keys(engine.inspect().models),ready:trimAutoReady};
        } finally {
          Object.assign(learning,original);
          dotSets.splice(0,dotSets.length,...savedSets);
          autoTrimCruiseAngle=savedAuto; trimAutoReady=savedReady;
          applyCruiseRotation(savedAngle);
        }
      };
    `);
    const wrapDegrees=angle=>((angle+180)%360+360)%360-180;
    for (const blade of [1,2,3]) for (const direction of ['UP','DOWN']) for (const angle of [-25,25]) for (const count of [1,3]) {
      const result=run(`testTrimRotationRegression(${blade},'${direction}',${angle},${count})`);
      const label=`TAB BLD${blade}/${direction}/${angle}/${count} samples`;
      near(wrapDegrees(result.angle-angle),0,label+' pre-HOV angle formula');
      near(wrapDegrees(result.matrixAngle-angle),0,label+' SVG rotation sign',1e-5);
      assert(result.ready && (count===1?result.learned===null:result.learned!==null),label+' fallback/learned route');
      assert(result.keys.every(key=>key.startsWith('TAB:blue')),label+' independent learning');
    }
    const tabAngleBeforeSwitch=run('cruiseAngle');
    run('showChartPage(0); showChartPage(1);');
    near(run('cruiseAngle'),tabAngleBeforeSwitch,'LINK page round trip preserves TAB auto angle');
    near(run('autoTrimCruiseAngle'),tabAngleBeforeSwitch,'TAB automatic angle remains independent');
    near(run('pageRotations[1].cruiseAngle'),run('manualTrimCruiseAngle'),'TAB saved manual angle stays separate from automatic angle');
    groups.push('TAB回転回帰：全BLD/UP/DOWN・正負角・学習/フォールバック・SVG符号・ページ保存分離');
    assert(run("dotOverlay.querySelectorAll('circle').length") === 14, 'all measurement dots remain');
    run('showChartPage(0); pitchModeToggle.click();');
    assert(run('guidePredictionDebug.selected.predictions.every(p=>p.model.startsWith("LINK:"))'), 'page switch restores LINK models');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert(run('rotationLocked && rotationHandles.length >= 2 && rotationHandles.every(handle=>handle.style.pointerEvents === "none")'),
      'automatic rotation remains locked: ' + run('JSON.stringify({locked:rotationLocked,handles:rotationHandles.map(h=>h.style.pointerEvents),svg:chartObject.contentDocument?.documentElement.tagName,auto:pitchAutoMode})'));
    // 補正済み終点だけを固定して、実際のLINK候補選択経路を検証する。
    run(`
      window.testCandidateSelection = (pairs, page=0) => {
        const originalPredict=learning.predict, originalPage=currentChartPage, originalDirectionLine=getDirectionLine;
        try {
          currentChartPage=page;
          learning.predict=(type,color,blade,direction,amount) => {
            const pair=pairs[blade-1];
            if (!pair || direction!=='UP' || amount!==1) return null;
            return {position:{x:CHART_CENTER_X+pair[color==='red'?0:1]*CHART_RADIUS,y:CHART_CENTER_Y}};
          };
          getDirectionLine=(dot,layer,adjustment,blade,direction)=>({arrowTarget:learning.predict('LINK','red',blade,direction,1).position});
          getLearnedGuideLines({red:testDot(637,520,'red'),blue:testDot(637,520,'blue')});
          return guidePredictionDebug.selected?.blade ?? null;
        } finally { learning.predict=originalPredict; currentChartPage=originalPage; getDirectionLine=originalDirectionLine; }
      };
    `);
    run(`
      window.testPairSelection = (specs,starts=[1,1],fallback=false) => {
        const originalPredict=learning.predict, originalDirectionLine=getDirectionLine;
        const originalLearned=getLearnedGuideLines, originalDistances=getGuideDistances, originalSelect=selectLinkGuideCandidate;
        const savedSets=dotSets.slice();
        try {
          learning.predict=(type,color,blade,direction,amount)=>{
            const spec=specs[blade-1];
            if(!spec || direction!=='UP' || amount!==1) return null;
            return {position:{x:397+spec.end[color==='red'?0:1]*240,y:520}};
          };
          getDirectionLine=(dot,color,adjustment,blade,direction)=>{
            if(!specs[blade-1] || direction!=='UP') return null;
            const point=specs[blade-1][color==='red'?'red':'blue'];
            const base=getDotCoordinates(dot), end={x:397+specs[blade-1].end[color==='red'?0:1]*240,y:520};
            return {arrowTarget:{x:397+point[0]*240,y:520+point[1]*240},base,start:base,end,number:blade,direction};
          };
          const finalSet={red:testDot(397+starts[0]*240,520,'red'),blue:testDot(397+starts[1]*240,520,'blue')};
          if(fallback) {
            dotSets.splice(0,dotSets.length,finalSet);
            getLearnedGuideLines=()=>null;
            getGuideDistances=red=>{
              const [redDistance,blueDistance]=specs[red.number-1].end;
              return {redDistance,blueDistance,maxCenterDistance:Math.max(redDistance,blueDistance),distance:redDistance+blueDistance};
            };
            selectLinkGuideCandidate=candidates=>{
              const selected=originalSelect(candidates);
              guidePredictionDebug={selected,candidates};
              return selected;
            };
            renderDirectionLines();
          } else getLearnedGuideLines(finalSet);
          return {blade:guidePredictionDebug.selected?.blade,
            paths:guidePredictionDebug.candidates.map(c=>[c.hovPathDistance,c.cruisePathDistance])};
        } finally {
          learning.predict=originalPredict;getDirectionLine=originalDirectionLine;
          getLearnedGuideLines=originalLearned;getGuideDistances=originalDistances;selectLinkGuideCandidate=originalSelect;
          dotSets.splice(0,dotSets.length,...savedSets);
        }
      };
    `);
    const pickPair=(specs,starts)=>run(`testPairSelection(${JSON.stringify(specs)},${JSON.stringify(starts??[1,1])})`);
    const pair=(red,blue,end)=>({red,blue,end});
    const toward=[0,0], away=[2,0], pairTangent=[0.04,Math.sqrt(0.0384)];
    assert(pickPair([pair(toward,toward,[0.01,0.21]),pair(toward,toward,[0.19,0.19])]).blade===2,'both endpoints inside beats HOV-only convergence');
    assert(pickPair([pair(toward,toward,[0.1,0.19]),pair(toward,toward,[0.15,0.15])]).blade===2,'both inside minimize maximum');
    assert(pickPair([pair(toward,toward,[0.15,0.19]),pair(toward,toward,[0.1,0.19])]).blade===2,'both inside equal maximum minimizes sum');
    assert(pickPair([pair(toward,toward,[0.19,0.4]),pair(toward,toward,[0.21,0.01])],[0.19,0.5]).blade===1,'never sacrifice HOV constraint to improve cruise');
    assert(pickPair([pair(toward,toward,[0.2,0.2]),pair(toward,toward,[0.21,0.01])]).blade===1,'exact 0.20 endpoint is eligible');
    assert(run(`selectLinkGuideCandidate([
      {blade:2,direction:'DOWN',amount:1,hovPathDistance:0,cruisePathDistance:0.3,predictions:[{predictedDistance:0.1},{predictedDistance:0.15}],maxCenterDistance:0.15,distance:0.25},
      {blade:3,direction:'UP',amount:1,hovPathDistance:0.15,cruisePathDistance:0.2,predictions:[{predictedDistance:0.15},{predictedDistance:0.18}],maxCenterDistance:0.18,distance:0.33}
    ]).blade`)===3,'No.3 UP joint passage beats No.2 DOWN single passage within HOV constraint');
    assert(pickPair([pair(toward,away,[0.01,0.01]),pair(pairTangent,pairTangent,[0.15,0.5])]).blade===2,'both forward paths pass before endpoint score or closer HOV');
    assert(pickPair([pair(toward,toward,[0.1,0.5]),pair(toward,toward,[0.3,0.3])]).blade===1,'HOV inside limit beats smaller maximum with HOV outside');
    assert(pickPair([pair(toward,toward,[0.2,0.3]),pair(toward,toward,[0.1,0.3])]).blade===2,'equal maximum minimizes sum');
    assert(pickPair([pair(pairTangent,away,[0.3,0.3]),pair(toward,away,[0.5,0.6])]).blade===2,'no joint passage prioritizes closest HOV over endpoints');
    assert(pickPair([pair(toward,away,[0.5,0.6]),pair(toward,away,[0.4,0.4])]).blade===2,'equal HOV approach uses predicted maximum');
    assert(pickPair([pair(toward,away,[0.4,0.6]),pair(toward,away,[0.3,0.6])]).blade===2,'equal HOV approach and maximum uses sum');
    const exact=pickPair([pair(pairTangent,pairTangent,[0.3,0.3])]);
    near(exact.paths[0][0],0.2,'HOV exact pairTangent'); near(exact.paths[0][1],0.2,'cruise exact pairTangent');
    assert(pickPair([pair(toward,away,[0.01,0.01]),pair(toward,pairTangent,[0.15,0.6])]).blade===2,'reverse-only cruise crossing excluded, exact pairTangent accepted');
    assert(pickPair([pair(away,toward,[0.01,0.01]),pair(pairTangent,toward,[0.15,0.6])]).blade===2,'reverse-only HOV crossing excluded');
    assert(pickPair([pair(toward,toward,[0.01,0.21]),pair(away,away,[0.15,0.16])],[0.2,0.2]).blade===2,'inside threshold both improvement outranks one-sided improvement');
    assert(pickPair([pair(away,away,[0.1,0.15]),pair(toward,toward,[0.12,0.12])],[0.2,0.2]).blade===2,'both improving minimize maximum');
    assert(pickPair([pair(away,away,[0.1,0.15]),pair(toward,toward,[0.08,0.15])],[0.2,0.2]).blade===2,'both improving equal maximum minimize sum');
    assert(pickPair([pair(away,away,[0.25,0.22]),pair(toward,toward,[0.23,0.23])],[0.2,0.2]).blade===2,'inside without joint improvement uses normal rule; outward ray starting at boundary valid');
    assert(pickPair([pair(toward,toward,[0.2,0.3]),pair(toward,toward,[0.1,0.3000000001])]).blade===2,'epsilon-equivalent maximum uses sum');
    assert(pickPair([pair(away,away,[0.21,0.22]),pair(toward,toward,[0.23,0.23])],[0.2,0.2]).blade===1,'outward rays touching at start remain eligible');
    for (const [specs,starts,expected] of [
      [[pair(toward,away,[0.01,0.01]),pair(pairTangent,pairTangent,[0.15,0.5])],[1,1],2],
      [[pair(toward,toward,[0.01,0.21]),pair(away,away,[0.15,0.16])],[0.2,0.2],2],
      [[pair(pairTangent,away,[0.3,0.3]),pair(toward,away,[0.5,0.6])],[1,1],2]
    ]) {
      assert(run(`testPairSelection(${JSON.stringify(specs)},${JSON.stringify(starts)},true).blade`)===expected,'fallback renderer uses the same pair priority');
    }
    assert(run('testCandidateSelection([[0.9,0.8],[0.2,0.4]],1)')===2,'TAB still selects by cruise endpoint');
    assert(run('testCandidateSelection([[0.2,1.2],[0.8,1.4]],1)')===null,'TAB still rejects worsening cruise candidates');
    groups.push('LINK：両点改善・両有向線通過・最大距離/合計・HOV最接近・境界・TAB維持');
    run(`
      window.testPathSelection = paths => {
        const originalPredict=learning.predict, originalDirectionLine=getDirectionLine;
        try {
          learning.predict=(type,color,blade,direction,amount) => {
            const path=paths[blade-1];
            if (!path || direction!=='UP' || amount!==1) return null;
            const point=color==='red' ? path.end : [path.blue,0];
            return {position:{x:CHART_CENTER_X+point[0]*CHART_RADIUS,y:CHART_CENTER_Y+point[1]*CHART_RADIUS}};
          };
          getDirectionLine=(dot,layer,adjustment,blade,direction)=>({arrowTarget:layer==='red'?learning.predict('LINK','red',blade,direction,1).position:{x:877,y:520}});
          getLearnedGuideLines({red:testDot(637,520,'red'),blue:testDot(637,520,'blue')});
          return {blade:guidePredictionDebug.selected?.blade,
            candidates:guidePredictionDebug.candidates.map(c=>({passes:c.hovPathPasses,distance:c.hovPathDistance}))};
        } finally {learning.predict=originalPredict; getDirectionLine=originalDirectionLine;}
      };
    `);
    assert(run('testPathSelection([{end:[0.5,0],blue:1.3},{end:[1,0.5],blue:0.01}]).blade')===1,'forward crossing outranks excellent cruise without crossing');
    assert(!run('testPathSelection([{end:[1.5,0],blue:0.01}]).candidates[0].passes'),'reverse extension through center is not a crossing');
    assert(run('testPathSelection([{end:[0.5,0],blue:1.3}]).candidates[0].passes'),'ray crossing beyond predicted arrow endpoint counts');
    assert(run('testPathSelection([{end:[0.5,0.05],blue:0.01},{end:[0.5,0],blue:1.3}]).blade')===2,'closest HOV path wins among crossing candidates');
    assert(run('testPathSelection([{end:[0.5,0.4],blue:1.3},{end:[1,0.5],blue:0.01}]).blade')===1,'no crossing chooses closest forward path');
    const tangent=run('testPathSelection([{end:[0.04,Math.sqrt(0.0384)],blue:0.5}])');
    near(tangent.candidates[0].distance,0.20,'exact tangent distance');
    assert(tangent.candidates[0].passes,'exact 0.20 tangent counts as crossing');
    assert(!run('testPathSelection([{end:[0.04,0.21],blue:0.5}]).candidates[0].passes'),'path outside 0.20 is rejected');
    assert(run('testPathSelection([{end:[0.19,0],blue:0.3},{end:[0.18,0],blue:0.1}]).blade')===2,'equal paths use HOV predicted endpoint tie-break');
    assert(!run('testPathSelection([{end:[1,0],blue:0.1}]).candidates[0].passes'),'zero-length direction stays at starting point');
    groups.push('HOV有向経路：通過優先・逆方向除外・接近性能・非通過時・接線境界');
    const pathAt = (distance, blue) => ({end:[distance*distance, distance*Math.sqrt(1-distance*distance)],blue});
    assert(run(`testPathSelection(${JSON.stringify([pathAt(0.18,0.01),pathAt(0.05,1.3)])}).blade`)===1,'HOV 0.18 within limit preserves both endpoints inside');
    assert(run(`testPathSelection(${JSON.stringify([pathAt(0.05,0.01),pathAt(0.01,1.3)])}).blade`)===1,'HOV 0.05 within limit prefers cruise convergence');
    assert(run(`testPathSelection(${JSON.stringify([pathAt(0.01,0.01),pathAt(0,1.3)])}).blade`)===1,'HOV zero alone cannot override joint endpoint convergence');
    near(run('testPathSelection([{end:[0,0],blue:1.3}]).candidates[0].distance'),0,'direct crossing reports zero');
    run(`
      window.testStableSelection = reverse => {
        const originalPredict=learning.predict, originalDirectionLine=getDirectionLine;
        const originalAmounts=[...BalanceLearning.amounts.LINK];
        try {
          learning.predict=(type,color,blade) => ({position:{x:CHART_CENTER_X+(0.1-blade*1e-12)*CHART_RADIUS,y:CHART_CENTER_Y}});
          getDirectionLine=(dot,layer,adjustment,blade,direction)=>({arrowTarget:learning.predict('LINK','red',blade,direction,1).position});
          let choose=getLearnedGuideLines;
          if(reverse) {
            BalanceLearning.amounts.LINK.reverse();
            choose=eval('('+getLearnedGuideLines.toString().replace('[1, 2, 3]','[3, 2, 1]').replace("['UP', 'DOWN']","['DOWN', 'UP']")+')');
          }
          choose({red:testDot(637,520,'red'),blue:testDot(637,520,'blue')});
          const selected=guidePredictionDebug.selected;
          return [selected.blade,selected.direction,selected.amount].join('/');
        } finally {learning.predict=originalPredict; getDirectionLine=originalDirectionLine; BalanceLearning.amounts.LINK.splice(0,Infinity,...originalAmounts);}
      };
    `);
    assert(run('testStableSelection(false)')==='1/UP/0.125','practically equal candidates use fixed identity tie-break');
    assert(run('testStableSelection(true)')==='1/UP/0.125','reversed blade/direction/amount order produces same winner');
    assert(run('Array.from({length:10},(_,i)=>testStableSelection(i%2===0)).every(result=>result==="1/UP/0.125")'),'repeated recalculations remain stable');
    groups.push('HOV最小距離順位・中心ゼロ・固定tie-break・生成順独立・反復安定');
    run(`
      window.testNo2Arrows = (x,y,rotation=0) => {
        const previous=hovAngle;
        try {
          hovAngle=rotation;
          const dot=testDot(x,y,'red'), start=getDotCoordinates(dot);
          return ['UP','DOWN'].map(direction=>{
            const arrow=getDirectionLine(dot,'red',null,2,direction).arrowTarget;
            return {arrow,dx:arrow.x-start.x,dy:arrow.y-start.y};
          });
        } finally {hovAngle=previous;}
      };
      window.testNo2Selection = y => {
        const originalPredict=learning.predict, previous=hovAngle;
        try {
          hovAngle=0;
          learning.predict=(type,color,blade,direction,amount)=> blade===2 && amount===1
            ? {position:{x:397,y:direction==='UP'?100:900}} : null;
          getLearnedGuideLines({red:testDot(1015.324,y,'red'),blue:testDot(637,520,'blue')});
          return {direction:guidePredictionDebug.selected.direction,
            up:guidePredictionDebug.candidates.find(c=>c.direction==='UP'),
            down:guidePredictionDebug.candidates.find(c=>c.direction==='DOWN')};
        } finally {learning.predict=originalPredict;hovAngle=previous;}
      };
    `);
    for (const [x,targetX] of [[650,706.162],[144,87.838]]) {
      const arrows=run(`testNo2Arrows(${x},520)`);
      near(arrows[0].arrow.x,targetX,'No.2 UP scaled X');
      near(arrows[0].arrow.y,698.5,'No.2 UP registered lower endpoint');
      near(arrows[1].arrow.y,341.5,'No.2 DOWN registered upper endpoint');
      near(arrows[0].dx,targetX-x,'No.2 UP uses arrow minus dot X');
      near(arrows[0].dy,178.5,'No.2 UP uses arrow minus dot Y');
      near(arrows[1].dy,-178.5,'No.2 DOWN uses arrow minus dot Y');
    }
    const rotatedNo2=run('testNo2Arrows(397,773,90)');
    near(rotatedNo2[0].dx,-178.5,'rotated No.2 UP vector X');
    near(rotatedNo2[0].dy,56.162,'rotated No.2 UP vector Y');
    near(rotatedNo2[1].dx,178.5,'rotated No.2 DOWN vector X');
    const no2Up=run('testNo2Selection(877)'), no2Down=run('testNo2Selection(163)');
    assert(no2Up.direction==='UP' && no2Up.up.hovPathDistance===0,'outside dot selects actual UP arrow through center');
    assert(no2Up.up.hovDirectionVector.dy<0 && !no2Up.down.hovPathPasses,'UP can point upward from the actual dot; DOWN does not pass');
    assert(no2Down.direction==='DOWN' && no2Down.down.hovPathDistance===0,'outside dot selects actual DOWN arrow through center');
    assert(no2Down.down.hovDirectionVector.dy>0 && !no2Down.up.hovPathPasses,'DOWN direction is computed from actual dot, not label');
    assert(run(`['a','b'].every(side=>{
      const svg=chartObject.contentDocument;
      const body=svg.getElementById(side==='a'?'hovArrowBody01':'hovArrowBody04');
      return Number(svg.getElementById('hovUpLabel2'+side).getAttribute('y'))===620
        && Number(svg.getElementById('hovDownLabel2'+side).getAttribute('y'))===420
        && [Number(body.getAttribute('y1')),Number(body.getAttribute('y2'))].sort((a,b)=>a-b).join(',')==='345,695';
    })`),'No.2 SVG labels and registered endpoints agree on both sides');
    groups.push('No.2 UP/DOWN登録照合・実矢印ベクトル・回転・範囲外ドット');
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

    // 実調整未指定でも自動回転だけを開始し、学習には一切登録しない。
    for (const type of ['LINK','TAB']) for (const direction of ['UP','DOWN']) {
      run(`
        learning.reset([]); dotSets.splice(0);
        currentChartPage=${type==='LINK'?0:1}; pitchAutoMode=true; trimAutoMode=true;
        dotSets.push({learningId:newLearningId(),
          red:testDot(517,520,'red'),blue:testDot(397,640,'blue'),adjustments:[['2','${type}','1','${direction}']]});
        renderDots();
      `);
      assert(run('!pitchAutoReady.red && !pitchAutoReady.blue && !trimAutoReady'),type+'/'+direction+' waits without next measurement');
      run(`
        [redInputs[0].value,redInputs[1].value,redInputs[2].value]=['3','0','0.6'];
        [blueInputs[0].value,blueInputs[1].value,blueInputs[2].value]=['6','0','0.7'];
        dotForm.requestSubmit();
      `);
      if (type==='LINK') {
        assert(run('pitchAutoReady.red && pitchAutoReady.blue && !trimAutoReady'),'unmarked LINK starts red/blue, not TAB');
        near(run('BalanceLearning.wrap(autoPitchAngles.hovAngle)'),direction==='UP'?-90:90,'LINK red unchanged angle formula');
        near(run('BalanceLearning.wrap(autoPitchAngles.cruiseAngle)'),direction==='UP'?0:-180,'LINK blue unchanged angle formula');
        assert(!run('pitchModeToggle.textContent.includes("待ち")'),'LINK waiting label clears after form submission');
      } else {
        assert(run('trimAutoReady && !pitchAutoReady.red && !pitchAutoReady.blue'),'unmarked TAB starts purple, not LINK');
        near(run('BalanceLearning.wrap(autoTrimCruiseAngle)'),direction==='UP'?0:-180,'TAB unchanged angle formula');
        assert(!run('trimModeToggle.textContent.includes("条件待ち")'),'TAB waiting label clears after form submission');
      }
      run('renderDots(); renderDots();');
      assert(run('learning.inspect().samples.length===0 && Object.keys(learning.inspect().models).length===0 && Object.keys(learning.inspect().confirmed).length===0'),type+' unmarked history never trains or becomes confirmed');
      assert(run('JSON.parse(localStorage.getItem(BalanceLearning.storageKey)).samples.length===0'),type+' persisted learning excludes unmarked history');
      run('dotSets[1].blue=null; renderDots();');
      assert(run(type==='LINK'?'pitchAutoReady.red && !pitchAutoReady.blue':'!trimAutoReady'),type+' missing cruise retains correct waiting condition');
      run('dotSets[1].red=dotSets[0].red; dotSets[1].blue=dotSets[0].blue; renderDots();');
      assert(run('!pitchAutoReady.red && !pitchAutoReady.blue && !trimAutoReady'),type+' zero movement stays waiting');
    }
    groups.push('未指定履歴：LINK/TAB自動回転・UP/DOWN・入力後再評価・色独立・不足時待ち・学習保存への混入なし');
    run(`
      learning.reset([]); dotSets.splice(0);
      currentChartPage=0; pitchAutoMode=false; trimAutoMode=false; selectedAdjustmentTarget=null;
      dotSets.push({learningId:newLearningId(),red:testDot(517,520,'red'),blue:testDot(397,640,'blue'),adjustments:[]});
      window.originalForecastPredict=learning.predict;
      window.forecastCalls=[];
      learning.predict=(type,color,blade,direction,amount,start)=>{
        forecastCalls.push({type,color,blade,direction,amount,start});
        return {position:{x:start.x+amount*20,y:start.y-amount*10}};
      };
      memoValues.splice(0,4,'2','LINK','1','UP');
      renderDots(); openMemoPicker(2); selectedMemoValue='2'; previewMemoSelection();
    `);
    assert(run('adjustmentForecast.phase')==='preview','selection shows preview');
    near(run('adjustmentForecast.points[0].x'),557,'picker draft amount reaches predict before confirmation');
    assert(run('forecastCalls.slice(-2).every(call=>call.amount===2 && call.blade===2 && call.direction==="UP" && call.type==="LINK")'),'selected adjustment passed to existing predict');
    assert(run('dotOverlay.querySelectorAll(".forecast-body").length')===2,'HOV and cruise forecast bodies');
    assert(run('getComputedStyle(dotOverlay.querySelector(".forecast-body")).animationName')==='none','body never pulses');
    assert(run('getComputedStyle(dotOverlay.querySelector(".forecast-glow")).animationName')===(run('matchMedia("(prefers-reduced-motion: reduce)").matches')?'none':'forecast-pulse'),'only preview glow pulses unless reduced motion');
    run('confirmMemoPicker.click(); adjustmentForm.requestSubmit();');
    const fixedForecast=run('JSON.stringify(adjustmentForecast.points)');
    assert(run('adjustmentForecast.phase')==='fixed','adjustment submission freezes forecast');
    assert(run('getComputedStyle(dotOverlay.querySelector(".forecast-glow")).animationName')==='none','confirmed glow stops pulsing');
    run('learning.predict=()=>({position:{x:999,y:999}}); renderDots(); renderDots();');
    assert(run('JSON.stringify(adjustmentForecast.points)')===fixedForecast,'confirmed positions never recompute');
    run(`
      [redInputs[0].value,redInputs[1].value,redInputs[2].value]=['3','0','0.7'];
      [blueInputs[0].value,blueInputs[1].value,blueInputs[2].value]=['6','0','0.8']; dotForm.requestSubmit();
    `);
    assert(run('adjustmentForecast.phase')==='comparison','next measurement transitions to comparison');
    assert(run('JSON.stringify(adjustmentForecast.points)')===fixedForecast,'comparison retains frozen positions');
    assert(run('dotOverlay.querySelectorAll("circle.chart-dot-red,circle.chart-dot-blue").length')===4,'actual dots coexist with forecast');
    assert(run('getComputedStyle(dotOverlay.querySelector(".adjustment-forecast")).opacity')==='0.45','comparison is translucent');
    assert(run('getComputedStyle(dotOverlay.querySelector(".forecast-glow")).filter')==='none','comparison removes glow');
    run('openMemoPicker(0);');
    assert(!run('dotOverlay.querySelector(".forecast-body")'),'new incomplete adjustment clears previous forecast');
    run(`memoPicker.hidden=true; memoValues.splice(0,4,'1','TAB','1','DOWN'); currentChartPage=1; updateAdjustmentForecast();`);
    const forecastPurple=run('getComputedStyle(dotOverlay.querySelector(".adjustment-forecast [data-color=blue]")).color');
    assert(forecastPurple==='rgb(123, 44, 191)','TAB cruise preview is purple: '+forecastPurple);
    run('learning.predict=()=>null; updateAdjustmentForecast();');
    assert(run('dotOverlay.querySelectorAll(".forecast-body").length')===0,'null prediction makes no phantom dot');
    assert(run('document.getElementById("forecastLearningNotice").textContent')==='HOV（赤）：予測学習中 ／ 巡航（紫）：予測学習中','missing colors identified in notice');
    run('learning.predict=(type,color)=>color==="red"?{position:{x:450,y:520}}:null; renderDots();');
    assert(run('dotOverlay.querySelectorAll(".forecast-body").length')===1,'available color keeps its forecast');
    assert(run('document.getElementById("forecastLearningNotice").textContent')==='巡航（紫）：予測学習中','only missing color shows notice');
    run('learning.predict=()=>({position:{x:450,y:520}}); renderDots();');
    assert(run('document.getElementById("forecastLearningNotice").hidden && dotOverlay.querySelectorAll(".forecast-body").length===2'),'ready preview automatically replaces notice');
    run('currentChartPage=0; memoValues[1]="LINK"; learning.predict=()=>null; updateAdjustmentForecast();');
    assert(run('document.getElementById("forecastLearningNotice").textContent')==='HOV（赤）：予測学習中 ／ 巡航（青）：予測学習中','LINK identifies missing red and blue');
    assert(run('learning.inspect().samples.length===0 && Object.keys(learning.inspect().models).length===0'),'preview does not modify learning');
    run('learning.predict=originalForecastPredict; adjustmentForecast=null; memoValues.fill(""); renderDots();');
    groups.push('予想ドット：選択値・リング点滅・確定固定・実測比較・次回置換・紫・学習不足・学習不変');
    run(`
      learning.reset([]); dotSets.splice(0); adjustmentForecast=null; currentChartPage=0;
      for(let i=0;i<3;i++) dotSets.push({learningId:newLearningId(),red:testDot(517-i*20,520,'red'),blue:testDot(397,640-i*30,'blue'),adjustments:i<2?[['1','LINK','1','UP']]:[]});
      memoValues.splice(0,4,'1','LINK','1','UP'); selectedAdjustmentTarget=null;
      renderDots(); updateAdjustmentForecast();
    `);
    assert(run('document.querySelectorAll(".historical-learning-row button").length')===4,'historical UI lists per-color candidates');
    assert(run('document.querySelector(".historical-learning-row").textContent.includes("LINK赤（HOV） ／ BLD1 ／ UP ／ 1") && document.querySelector(".historical-learning-row").textContent.includes("調整前（結果1）") && document.querySelector(".historical-learning-row").textContent.includes("調整後（結果2）")'),'historical UI shows review details');
    const historicalSource=run('JSON.stringify(dotSets)');
    run('document.querySelector(".historical-learning-row button").click();');
    assert(run('learning.inspect().models["LINK:red"].sampleCount===1 && !learning.inspect().models["LINK:blue"]'),'UI confirms only clicked color');
    run('document.querySelectorAll(".historical-learning-row button")[1].click();');
    assert(run('dotOverlay.querySelectorAll(".forecast-body").length')===1,'historical learning immediately enables pending red preview');
    assert(run('JSON.stringify(dotSets)')===historicalSource,'UI preserves measurement and adjustment history');
    frame.remove();
    output.textContent = `PASS: ${checks} checks\n${groups.join('\n')}`;
    document.title = 'PASS';
  } catch (error) {
    output.textContent = `FAIL after ${checks} checks\n${error.stack}`;
    document.title = 'FAIL';
  }
})();
