(async()=>{
  const output=document.getElementById('results');let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;output.textContent=`RUNNING: ${checks} ${label}`;};
  const equal=(a,b,label)=>assert(JSON.stringify(a)===JSON.stringify(b),label+' actual='+JSON.stringify(a)+' expected='+JSON.stringify(b));
  try{
    if(new URLSearchParams(location.search).get('isolated')!=='1')throw Error('Use isolated profile');
    let frame=document.createElement('iframe');frame.style.cssText='width:375px;height:750px';
    let loaded=new Promise(resolve=>frame.onload=resolve);frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code);
    const tick=()=>new Promise(resolve=>setTimeout(resolve,50));
    const reload=async()=>{run('balanceFlushState()');loaded=new Promise(resolve=>frame.onload=resolve);frame.contentWindow.location.reload();await loaded;await tick();};
    const angles=()=>run('[hovAngle,cruiseAngle]');
    const stored=()=>run('JSON.parse(appStorage.getItem(BalanceState.uiKey)).initialChartRotations');
    const rotate=(a,b)=>run(`pitchAutoMode=false;trimAutoMode=false;applyChartRotation(${a},${b});
      if(currentChartPage===0) Object.assign(manualPitchAngles,{hovAngle,cruiseAngle});else manualTrimCruiseAngle=cruiseAngle;
      saveRotation();balanceFlushState();`);
    const register=async(value)=>{
      frame.scrollIntoView();
      run(`document.getElementById('registerInitialPosition').scrollIntoView({block:'center'})`);
      run(`document.getElementById('registerInitialPosition').click()`);
      assert(run(`document.getElementById('initialPositionConfirmation').open`),'confirmation opens');
      const closed=new Promise(resolve=>frame.contentDocument.getElementById('initialPositionConfirmation').addEventListener('close',resolve,{once:true}));
      run(`document.querySelector('#initialPositionConfirmation button[value="${value}"]').click()`);await closed;await tick();
    };
    equal(angles(),[0,0],'unregistered fresh startup is unchanged');
    rotate(11,22);await register('cancel');
    equal(stored(),[null,null],'cancel does not register');await reload();
    equal(angles(),[11,22],'unregistered saved-state restoration unchanged');
    rotate(23,-41);await register('save');
    equal(stored(),[{hovAngle:23,cruiseAngle:-41},null],'register visible LINK page only');
    rotate(67,89);await reload();
    equal(angles(),[23,-41],'empty startup uses registered LINK angles');
    assert(run(`chartObject.contentDocument.getElementById('cruiseGroup').getAttribute('transform').includes('-41')`),'SVG uses registered LINK angle');
    run('showChartPage(1)');rotate(9,-63);await register('save');
    equal(stored(),[{hovAngle:23,cruiseAngle:-41},{hovAngle:9,cruiseAngle:-63}],'TAB registration preserves LINK registration');
    rotate(80,90);await reload();equal(angles(),[9,-63],'empty startup uses registered TAB angles');
    run('showChartPage(0)');equal(angles(),[23,-41],'inactive page starts from registered angles too');
    rotate(30,40);await register('cancel');await reload();equal(angles(),[23,-41],'cancel preserves previous registration');
    rotate(31,42);await register('save');rotate(70,80);await reload();equal(angles(),[31,42],'confirmed replacement survives reload');
    // 登録していない最新位置から再開すべき、結果ありのケース。
    run(`redInputs.forEach((input,i)=>input.value=['2','0','0.5'][i]);
      blueInputs.forEach((input,i)=>input.value=['1','0','0.5'][i]);dotForm.requestSubmit();
      memoValues.splice(0,4,'1','LINK','1/4','UP');updateMemoButtons();updateAdjustmentForecast();
      adjustmentForm.requestSubmit();`);
    rotate(52,64);
    const before=run('JSON.stringify({dots:dotSets,forecast:adjustmentForecast,learning:learning.inspect(),rawDots:appStorage.getItem(DOT_STORAGE_KEY),rawLearning:appStorage.getItem("balance-chart-learning-v1")})');
    await register('save');
    equal(run('JSON.stringify({dots:dotSets,forecast:adjustmentForecast,learning:learning.inspect(),rawDots:appStorage.getItem(DOT_STORAGE_KEY),rawLearning:appStorage.getItem("balance-chart-learning-v1")})'),before,'registration leaves results, adjustments, forecast and learning intact');
    rotate(73,85);await reload();equal(angles(),[73,85],'nonempty startup preserves latest angles instead of registration');
    equal(stored()[0],{hovAngle:52,cruiseAngle:64},'registration retained while results exist');
    run('showChartPage(1)');rotate(61,72);await reload();equal(angles(),[61,72],'nonempty TAB startup also preserves latest angles');
    run('dotSets.splice(0);saveDotSets();renderDots()');await reload();equal(angles(),[9,-63],'after results removed empty startup uses registration');
    run('showChartPage(0)');equal(angles(),[52,64],'both registrations survive results lifecycle');
    run('pitchModeToggle.click();trimAutoMode=true;balanceFlushState()');await reload();equal(angles(),[52,64],'automatic waiting mode starts at registered position');
    assert(run('pitchAutoMode && trimAutoMode'),'registration does not change saved modes');
    const exported=run('JSON.parse(appStorage.exportText()).records[BalanceState.uiKey]');
    equal(JSON.parse(exported).initialChartRotations,stored(),'backup includes registration');
    assert(run(`(()=>{const state=JSON.parse(appStorage.getItem(BalanceState.uiKey));
      state.initialChartRotations=[{hovAngle:'bad',cruiseAngle:0},null];
      try{BalanceState.validateUI(state);return false;}catch{return true;}})()`),'invalid registration rejected');
    const registeredBeforeFailure=stored();
    run(`window.originalSetItem=appStorage.setItem;appStorage.setItem=()=>{throw Error('quota');};`);
    await register('save');
    equal(stored(),registeredBeforeFailure,'save failure preserves registered position');
    assert(run(`document.getElementById('initialPositionStatus').textContent.includes('保存できません')`),'save failure shown');
    run('appStorage.setItem=originalSetItem');
    run('balanceFlushState()');frame.remove();
    frame=document.createElement('iframe');frame.style.cssText='width:375px;height:750px';
    loaded=new Promise(resolve=>frame.onload=resolve);frame.src='../index.html';document.body.append(frame);await loaded;await tick();
    equal(angles(),[52,64],'new page instance starts at registered LINK position');
    run('showChartPage(1)');equal(angles(),[9,-63],'new page instance retains TAB registration');
    output.textContent=`PASS: ${checks} checks`;document.title='PASS';
    if(new URLSearchParams(location.search).has('screenshot')){
      run(`document.getElementById('initialPositionStatus').textContent='初期位置を登録しました。';chartWrap.scrollIntoView();`);frame.scrollIntoView();
    }
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
