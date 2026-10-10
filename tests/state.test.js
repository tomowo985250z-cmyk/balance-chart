(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const assert = (value, label) => { if (!value) throw Error(label); checks++; output.textContent = `RUNNING ${checks}: ${label}`; };
  const equal = (a,b,label) => assert(JSON.stringify(a)===JSON.stringify(b), label + '\nactual: ' + JSON.stringify(a) + '\nexpected: ' + JSON.stringify(b));
  const memory = () => {
    const data = new Map();
    return { data, get length() { return data.size; }, key: index => [...data.keys()][index],
      getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,String(value)) };
  };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') { output.textContent='専用プロファイルで ?isolated=1 を指定してください。'; return; }
    const [learningKey,dotsKey,rotationKey,noteKey] = BalanceState.keys;
    const source = memory();
    const sets=[];
    const point = (x,y,color) => ({color,radius:Math.hypot(x-397,y-520)/240,angle:Math.atan2(x-397,520-y)*180/Math.PI,clock:'12:00'});
    const coordinates = dot => ({x:397+dot.radius*240*Math.sin(dot.angle*Math.PI/180),y:520-dot.radius*240*Math.cos(dot.angle*Math.PI/180)});
    const engine=BalanceLearning.create({storage:source,coordinates,nominalAngle:()=>0});
    for(let i=0;i<4;i++) {
      if(i) engine.arm(sets,sets.at(-1).learningId);
      sets.push({learningId:'test-'+i,red:point(597+(3-i)*80,620+(3-i)*46.188,'red'),
        blue:point(527+(3-i)*46,670+(3-i)*38.6,'blue'),adjustments:i<3?[['1','LINK','1','UP']]:[]});
      engine.acceptMeasurement(sets,sets.at(-1).learningId);
      engine.sync(sets,{LINK:{red:0,blue:0},TAB:{red:0,blue:0}});
    }
    source.setItem(dotsKey,JSON.stringify(sets));
    source.setItem(rotationKey,JSON.stringify({pages:[{hovAngle:23,cruiseAngle:-41},{hovAngle:0,cruiseAngle:67}]}));
    source.setItem(noteKey,'原本メモ：保存確認');
    const originals=Object.fromEntries(BalanceState.keys.map(key=>[key,source.getItem(key)]));
    const safari=BalanceState.open(source);
    equal(safari.getItem(learningKey),originals[learningKey],'legacy learning read exactly');
    safari.setItem(noteKey,'更新されたメモ');
    equal(source.getItem(noteKey),originals[noteKey],'legacy memo never overwritten');
    const evolved=JSON.parse(originals[learningKey]); evolved.manual={LINK:{red:12}};
    safari.setItem(learningKey,JSON.stringify(evolved));
    equal(source.getItem(learningKey),originals[learningKey],'legacy learning never overwritten');
    const recordKeys=[...source.data.keys()].filter(key=>key.includes(':record:'));
    const immutable=Object.fromEntries(recordKeys.map(key=>[key,source.getItem(key)]));
    safari.setItem(learningKey,originals[learningKey]);
    for(const key of recordKeys) equal(source.getItem(key),immutable[key],'earlier learning revisions retained');
    const homeStore=memory(); homeStore.setItem(noteKey,'ホーム画面に既存のメモ');
    const home=BalanceState.open(homeStore), beforeHome=[...homeStore.data];
    home.importText(safari.exportText());
    const imported=BalanceState.open(homeStore);
    for(const key of BalanceState.keys) equal(imported.getItem(key),safari.getItem(key),'separate storage import: '+key);
    for(const [key,value] of beforeHome) equal(homeStore.getItem(key),value,'import preserves destination originals');
    assert(imported.profile!=='original','import uses a separate profile');
    imported.selectProfile('original');
    equal(BalanceState.open(homeStore).getItem(noteKey),'ホーム画面に既存のメモ','original profile remains selectable');
    const beforeInvalid=[...homeStore.data];
    for(const text of ['broken',JSON.stringify({format:'BalanceChartBackup',version:9,records:{}}),
      JSON.stringify({format:'BalanceChartBackup',version:1,records:{[learningKey]:originals[learningKey]}})]) {
      let rejected=false; try { home.importText(text); } catch { rejected=true; }
      assert(rejected,'invalid or incomplete import rejected'); equal([...homeStore.data],beforeInvalid,'invalid import writes nothing');
    }
    const broken=memory(); broken.setItem(learningKey,'{broken');
    const guarded=BalanceState.open(broken);
    assert(guarded.readOnly,'corrupt original enters protection');
    try { guarded.setItem(learningKey,'{}'); } catch {}
    equal(broken.getItem(learningKey),'{broken','corrupt original not reset or replaced');
    assert(JSON.parse(guarded.exportText()).records[learningKey]==='{broken','raw corrupt original can be exported');
    const concurrent=memory(), writer1=BalanceState.open(concurrent), writer2=BalanceState.open(concurrent);
    writer1.setItem(noteKey,'first'); try { writer2.setItem(noteKey,'second'); } catch {}
    assert(writer2.readOnly,'stale tab blocked from overwriting');
    equal(BalanceState.open(concurrent).getItem(noteKey),'first','concurrent current data retained');
    const quota=memory(); quota.setItem(noteKey,'quota-original');
    const limited=BalanceState.open(quota), set=quota.setItem;
    quota.setItem=(key,value)=>{ if(key.endsWith(':head')) throw Error('quota'); set(key,value); };
    try { limited.setItem(noteKey,'lost'); } catch {}
    assert(limited.readOnly,'failed commit reports protected state');
    equal(BalanceState.open(quota).getItem(noteKey),'quota-original','failed commit never replaces head');
    let failedImport=false;
    try { limited.importText(safari.exportText()); } catch { failedImport=true; }
    assert(failedImport,'incomplete file import fails before switching');
    equal(quota.getItem(BalanceState.prefix+'active'),null,'failed import does not activate partial data');
    equal(BalanceState.open(quota).getItem(noteKey),'quota-original','failed import leaves destination available');
    const denied=BalanceState.open({getItem(){throw Error('denied');}});
    assert(denied.readOnly,'unavailable storage does not silently succeed');
    // 実画面：旧キーを持つ専用プロファイルで起動し、再読込前後を比較する。
    for(const [key,raw] of Object.entries(originals)) localStorage.setItem(key,raw);
    const frame=document.createElement('iframe'); frame.style.cssText='width:1000px;height:1800px';
    let loaded=new Promise(resolve=>frame.onload=resolve); frame.src='../index.html'; document.body.append(frame); await loaded;
    const run=code=>frame.contentWindow.eval(code);
    assert(run('learning.inspect().samples.length')===6,'real app restores existing learned samples');
    for(const [key,raw] of Object.entries(originals)) equal(localStorage.getItem(key),raw,'app startup preserves original '+key);
    run(`pitchAutoMode=false; trimAutoMode=false; applyChartRotation(23,-41);
      memoValues.splice(0,4,'1','LINK','1/4','UP'); updateMemoButtons(); updateAdjustmentForecast();
      redInputs.forEach((input,index)=>{input.value=['7','13','0.42'][index]; input.dispatchEvent(new Event('input',{bubbles:true}));});
      blueInputs.forEach((input,index)=>input.value=['9','5','0.37'][index]);
      rotationLock.checked=false; updateRotationLock(); setGuidesVisible(false);
      chartNote.value='再起動テストのメモ'; chartNote.dispatchEvent(new Event('input',{bubbles:true}));
      actualAdjustment.checked=true; dotOverlay.setAttribute('viewBox','100 100 397 561.5'); balanceFlushState();`);
    // 実際のズームと同様、SVGにも反映して通知が落ち着いてから保存する。
    run(`chartObject.contentWindow.postMessage({type:'balance-chart-restore-view',viewBox:[100,100,397,561.5]},'*')`);
    await new Promise(resolve=>setTimeout(resolve,100));
    run('balanceFlushState()');
    const saved=run('appStorage.getItem(BalanceState.uiKey)');
    const learnedBefore=run('JSON.stringify(learning.inspect().models)');
    const samplesBefore=run('JSON.stringify(learning.inspect().samples)');
    const forecastBefore=run('JSON.stringify(adjustmentForecast)');
    loaded=new Promise(resolve=>frame.onload=resolve); frame.contentWindow.location.reload(); await loaded;
    await new Promise(resolve=>setTimeout(resolve,0));
    equal(run('redInputs.map(input=>input.value)'),['7','13','0.42'],'red draft restored');
    equal(run('blueInputs.map(input=>input.value)'),['9','5','0.37'],'blue draft restored');
    assert(run('!pitchAutoMode && !trimAutoMode && !rotationLock.checked && !dotOverlay.classList.contains("guides-visible") && actualAdjustment.checked'),'mode, lock, guide visibility and checkbox restored');
    equal(run('chartNote.value'),'再起動テストのメモ','note restored');
    run(`Object.defineProperty(navigator,'standalone',{configurable:true,value:true}); window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));`);
    assert(run('document.getElementById("storageStatus").textContent.includes("ホーム画面")'),'standalone launch identified');
    assert(run('!dotOverlay.classList.contains("guides-visible") && actualAdjustment.checked'),'pageshow does not reset restored settings');
    equal(run('JSON.stringify(adjustmentForecast)'),forecastBefore,'generated forecast restored without regeneration');
    equal(run('[hovAngle,cruiseAngle]'),[23,-41],'initial SVG snapshot does not overwrite restored angles');
    equal(run('dotOverlay.getAttribute("viewBox")'),'100 100 397 561.5','zoom viewport restored');
    equal(run('chartObject.contentDocument.documentElement.getAttribute("viewBox")'),'100 100 397 561.5','SVG and overlay zoom stay aligned');
    equal(run('JSON.stringify(learning.inspect().models)'),learnedBefore,'learning models unchanged on reload');
    equal(run('JSON.stringify(learning.inspect().samples)'),samplesBefore,'learning samples unchanged on reload');
    for(const [key,raw] of Object.entries(originals)) equal(localStorage.getItem(key),raw,'reload preserves original '+key);
    run('setGuidesVisible(true);');
    assert(run('dotOverlay.querySelectorAll(".forecast-body").length===getForecastDisplayPoints(adjustmentForecast).length'),'restored forecasts rendered');
    const exported=run('balanceFlushState(); appStorage.exportText()');
    const independent=BalanceState.open(memory()); independent.importText(exported);
    // ページ1/2、候補、編集途中も復元する。
    run(`showChartPage(1); while(guideCandidateIndex!==1 && !guideCandidateToggle.disabled) guideCandidateToggle.click();
      memoValues.splice(0,4,'2','TAB','2','UP'); updateMemoButtons(); updateAdjustmentForecast();
      startResultEdit(dotSets[1]); redInputs[2].value='0.63'; balanceFlushState();`);
    loaded=new Promise(resolve=>frame.onload=resolve); frame.contentWindow.location.reload(); await loaded;
    assert(run('currentChartPage===1 && guideCandidateIndex===1'),'TAB page and guide candidate restored');
    assert(run('resultEdit?.set===dotSets[1] && redInputs[2].value==="0.63"'),'measurement edit restored to same target');
    run('cancelResultEdit.click(); balanceFlushState();');
    assert(run('!resultEdit'),'restored edit can cancel normally');
    run(`redInputs[2].value='0.77'; redInputs[2].dispatchEvent(new Event('input',{bubbles:true}));`);
    await new Promise(resolve=>setTimeout(resolve,0));
    equal(run('JSON.parse(appStorage.getItem(BalanceState.uiKey)).redInputs[2]'),'0.77','input event autosaves without explicit flush');
    run(`blueInputs[2].value='0.81'; window.dispatchEvent(new PageTransitionEvent('pagehide'));`);
    equal(run('JSON.parse(appStorage.getItem(BalanceState.uiKey)).blueInputs[2]'),'0.81','pagehide flushes pending state');
    const oldProfile=run('appStorage.profile');
    run(`chartNote.value='移行先に既存のメモ'; chartNote.dispatchEvent(new Event('input',{bubbles:true})); balanceFlushState();`);
    loaded=new Promise(resolve=>frame.onload=resolve);
    frame.contentWindow.transferFixture=exported;
    run(`const transfer=new DataTransfer(); transfer.items.add(new File([transferFixture],'backup.json',{type:'application/json'}));
      document.getElementById('importState').files=transfer.files;
      document.getElementById('importState').dispatchEvent(new Event('change',{bubbles:true}));`);
    await loaded;
    assert(run('appStorage.profile')!==oldProfile,'real file input imports to another profile');
    equal(run('chartNote.value'),'再起動テストのメモ','file import restores source memo');
    equal(run('redInputs.map(input=>input.value)'),['7','13','0.42'],'file import restores source drafts');
    equal(run('JSON.stringify(learning.inspect().models)'),learnedBefore,'file import preserves learned models');
    loaded=new Promise(resolve=>frame.onload=resolve);
    run(`document.getElementById('stateProfile').value='${oldProfile}'; document.getElementById('stateProfile').dispatchEvent(new Event('change',{bubbles:true}));`);
    await loaded;
    equal(run('chartNote.value'),'移行先に既存のメモ','destination state still available after import');
    equal(run('redInputs[2].value'),'0.77','destination drafts still available after import');
    const badBackup=JSON.parse(exported); badBackup.records[BalanceState.uiKey]='{"version":1}';
    const beforeBad=run('appStorage.exportText()');
    frame.contentWindow.badFixture=JSON.stringify(badBackup);
    assert(run('(()=>{try{appStorage.importText(badFixture);return false;}catch{return true;}})()'),'malformed UI state rejected before activating import');
    equal(JSON.parse(run('appStorage.exportText()')).records,JSON.parse(beforeBad).records,'malformed UI import leaves active records intact');
    for(const [key,raw] of Object.entries(originals)) equal(localStorage.getItem(key),raw,'all operations leave original untouched '+key);
    assert(run('!appStorage.readOnly'),'normal state remains writable');
    frame.remove(); output.textContent=`PASS: ${checks} checks — preservation, reload, independent-storage transfer, conflict and failure protection`;
    document.title='PASS';
  } catch(error) { output.textContent=`FAIL after ${checks} checks\n${error.stack}`; document.title='FAIL'; }
})();
