(async () => {
  const output=document.getElementById('results');let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  const equal=(actual,expected,label)=>assert(JSON.stringify(actual)===JSON.stringify(expected),label);
  try {
    if(new URLSearchParams(location.search).get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');frame.style.cssText='width:375px;height:1500px';
    let loaded=new Promise(resolve=>frame.onload=resolve);frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code);
    const reload=async()=>{run('balanceFlushState()');loaded=new Promise(resolve=>frame.onload=resolve);
      frame.contentWindow.location.reload();await loaded;await new Promise(resolve=>setTimeout(resolve,50));};
    const measure=(red,blue)=>run(`redInputs.forEach((input,i)=>input.value=['3','0','${red}'][i]);
      blueInputs.forEach((input,i)=>input.value=${blue===null?"''":`['6','0','${blue}'][i]`});dotForm.requestSubmit()`);
    const add=type=>run(`memoValues.splice(0,4,'1','${type}','1','UP');updateMemoButtons();adjustmentForm.requestSubmit()`);
    const learned=()=>run(`(()=>{const state=learning.inspect();return JSON.stringify({samples:state.samples,
      models:state.models,confirmed:state.confirmed,manual:state.manual});})()`);
    assert(run(`!document.getElementById('actualAdjustment') && !document.querySelector('.actual-adjustment')
      && !document.body.textContent.includes('次の測定を学習')`),'obsolete checkbox and wording removed');
    assert(run(`document.querySelector('.historical-learning > summary').textContent.includes('学習')
      && document.querySelector('.historical-learning h3').textContent==='過去の実調整を学習'
      && document.getElementById('resetLearning').closest('.historical-learning')`),'learning and reset grouped under learning disclosure');
    for(const page of [0,1]) {
      const type=page?'TAB':'LINK';
      run(`adjustmentLock=null;selectedAdjustmentTarget=null;adjustmentForecast=null;forecastDisplayCache.clear();
        learning.reset([]);dotSets.splice(0);showChartPage(${page});pitchAutoMode=true;trimAutoMode=true;
        learning.recordManual('${type}','blue',10,12);saveDotSets();renderDots()`);
      const empty=learned();
      measure(.8,.9);add(type);
      equal(learned(),empty,type+': result and adjustment add preserve saved learning');
      assert(run('!learning.isArmed(dotSets[0])'),type+': adjustment add does not arm learning');
      // Simulate a backup saved by the old UI with an armed next measurement.
      run('learning.arm(dotSets,dotSets[0].learningId);legacyActualAdjustment=true;balanceFlushState()');
      const oldArmed=run('JSON.stringify(learning.inspect().armed)');
      await reload();equal(run('JSON.stringify(learning.inspect().armed)'),oldArmed,type+': old armed metadata retained on reload');
      assert(run('legacyActualAdjustment && !document.getElementById("actualAdjustment")'),type+': legacy checkbox value has no UI');
      measure(.7,.78);equal(learned(),empty,type+': old armed measurement does not train automatically');
      for(let i=2;i<4;i++){add(type);measure(.8-i*.1,.9-i*.12);equal(learned(),empty,type+': ordinary additions leave learned models unchanged');}
      const expectedCandidates=page?3:6;
      assert(run('document.querySelectorAll(".historical-learning-row button").length')===expectedCandidates,type+': history candidates remain available');
      const records=run('JSON.stringify(dotSets)');
      run('document.querySelector(".historical-learning").open=true');
      for(let i=0;i<expectedCandidates;i++) {
        run('document.querySelector(".historical-learning-row button").click()');
        assert(run('learning.inspect().samples.length')===i+1,type+': explicit historical action adds one color sample');
        equal(run('JSON.stringify(dotSets)'),records,type+': learning preserves measurements and adjustment history');
      }
      assert(run('!document.querySelector(".historical-learning-row button")'),type+': confirmed history cannot train twice');
      assert(run(`getLearnedRotation('${type}','blue')!==null`),type+': historical model remains usable by predictions');
      if(!page)assert(run("getLearnedRotation('LINK','red')!==null"),'LINK: red historical model is independent');
      else assert(run('!learning.inspect().models["TAB:red"]'),'TAB: historical UI learns Cruise only');
      const confirmed=learned();await reload();equal(learned(),confirmed,type+': saved historical learning retained after reload');
      const predictions=run(`JSON.stringify(learning.predict('${type}','blue',1,'UP',1,{x:500,y:600}))`);
      add(type);run('learning.arm(dotSets,dotSets.at(-1).learningId)');await reload();
      measure(.35,.36);equal(learned(),confirmed,type+': new result does not expand existing trained model');
      equal(run(`JSON.stringify(learning.predict('${type}','blue',1,'UP',1,{x:500,y:600}))`),predictions,type+': prediction calculation unchanged');
      add(type);run('learning.arm(dotSets,dotSets.at(-1).learningId)');measure(.3,null);
      equal(learned(),confirmed,type+': HOV-only result does not train');
      run(`startCruiseAddition(dotSets.at(-1));blueInputs.forEach((input,i)=>input.value=['6','0','0.25'][i]);dotForm.requestSubmit()`);
      equal(learned(),confirmed,type+': later Cruise addition does not train');
      run(`pitchAutoMode=false;trimAutoMode=false;rotationLock.checked=false;updateRotationLock();
        window.dispatchEvent(new MessageEvent('message',{source:chartObject.contentWindow,
          data:{type:'balance-chart-rotation',hovAngle:37,cruiseAngle:-58,finished:true}}))`);
      equal(learned(),confirmed,type+': manual rotation preserves saved corrections and cannot train');
      const backup=run('balanceFlushState();appStorage.exportText()');frame.contentWindow.historicalBackup=backup;
      loaded=new Promise(resolve=>frame.onload=resolve);run('appStorage.importText(historicalBackup);location.reload()');await loaded;
      equal(learned(),confirmed,type+': backup transfer preserves trained models and samples');
      assert(run('!appStorage.readOnly'),type+': storage remains writable');
    }
    frame.remove();output.textContent=`PASS: ${checks} checks`;document.title='PASS';
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
