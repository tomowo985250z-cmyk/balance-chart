(async()=>{
  const output=document.getElementById('results');let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  const wrap=angle=>((angle+180)%360+360)%360-180;
  const near=(value,expected,label)=>assert(Math.abs(wrap(value-expected))<1e-5,`${label}: ${value} expected ${expected}`);
  try {
    if(new URLSearchParams(location.search).get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');frame.style.cssText='width:390px;height:900px;border:0';
    let loaded=new Promise(resolve=>frame.onload=resolve);frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code);
    const angles=()=>run('[hovAngle,cruiseAngle]');
    const tick=()=>new Promise(resolve=>setTimeout(resolve,50));
    const fixture=(blade,direction,redAngle,blueAngle,count,type='TAB')=>run(`
      adjustmentLock=null;adjustmentForecast=null;selectedAdjustmentTarget=null;learning.reset([]);dotSets.splice(0);
      forecastDisplayCache.clear();adjustmentSelections.forEach(v=>v.fill(''));memoValues.fill('');retainedGuideNumbers.fill(null);
      pitchAutoMode=false;trimAutoMode=false;showChartPage(1);guideCandidateIndex=0;guideCandidateIndices.fill(0);
      applyChartRotation(12,-24);manualTrimCruiseAngle=autoTrimCruiseAngle=-24;lastAutoRotation.TAB={};
      const dot=(x,y,color)=>({clock:'12:00',color,radius:Math.hypot(x-397,y-520)/240,
        angle:Math.atan2(x-397,520-y)*180/Math.PI});
      const nominal=[Math.atan2(-175,-303.1)*180/Math.PI,90,Math.atan2(-175,303.1)*180/Math.PI][${blade}-1]
        +('${direction}'==='DOWN'?180:0);
      const red=(nominal+${redAngle})*Math.PI/180,blue=(nominal+${blueAngle})*Math.PI/180;
      for(let i=0;i<=${count};i++){
        if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
        dotSets.push({learningId:newLearningId(),red:dot(520+i*30*Math.cos(red),600+i*30*Math.sin(red),'red'),
          blue:dot(550+i*40*Math.cos(blue),650+i*40*Math.sin(blue),'blue'),
          adjustments:i<${count}?[['${blade}','${type}','1','${direction}']]:[]});
        if(i)learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
      }
      trimAutoMode=true;saveDotSets();renderDots();setGuidesVisible(true);
    `);
    for(const blade of [1,2,3])for(const direction of ['UP','DOWN'])for(const red of [-25,25])for(const count of [1,3]) {
      const blue=red<0?37:-37;fixture(blade,direction,red,blue,count);
      const label=`${blade}/${direction}/${red}/${blue}/${count}`;
      near(angles()[0],red,'HOV uses its own TAB movement '+label);
      near(angles()[1],blue,'Cruise uses its own TAB movement '+label);
      near(run('getLatestTrimSyncAngle("red")'),red,'HOV fallback sign '+label);
      near(run('getLatestTrimSyncAngle()'),blue,'existing Cruise fallback sign '+label);
      assert(run(`trimHovAutoReady && trimAutoReady &&
        ${count===3?'getLearnedRotation("TAB","red")!==null && getLearnedRotation("TAB","blue")!==null':'getLearnedRotation("TAB","red")===null && getLearnedRotation("TAB","blue")===null'}`),'real learned/fallback readiness '+label);
      for(const [id,expected] of [['hovGroup',red],['cruiseGroup',blue]])near(run(`(()=>{
        const matrix=chartObject.contentDocument.getElementById('${id}').transform.baseVal.consolidate().matrix;
        return Math.atan2(matrix.b,matrix.a)*180/Math.PI;})()`),expected,'SVG uses matching rotation '+id+'/'+label);
      const stored=run('JSON.stringify([dotSets,learning.inspect()])');run('renderDots();renderDots()');
      near(angles()[0],red,'same data retains HOV '+label);near(angles()[1],blue,'same data retains Cruise '+label);
      assert(run('JSON.stringify([dotSets,learning.inspect()])')===stored,'rotation redraw preserves measured and learned data');
    }
    fixture(2,'UP',27,-43,1);
    run(`const start=getDotCoordinates(dotSets[0].red),angle=(90+64)*Math.PI/180;
      dotSets[1].red={color:'red',clock:'12:00',radius:Math.hypot(start.x+30*Math.cos(angle)-397,start.y+30*Math.sin(angle)-520)/240,
        angle:Math.atan2(start.x+30*Math.cos(angle)-397,520-start.y-30*Math.sin(angle))*180/Math.PI};saveDotSets();renderDots()`);
    near(angles()[0],64,'changed HOV measurement updates HOV');near(angles()[1],-43,'changed HOV preserves Cruise');
    run('dotSets[1].red=null;saveDotSets();renderDots()');
    assert(run('!trimHovAutoReady && trimAutoReady && trimModeToggle.textContent.includes("HOV待ち")'),'missing HOV is independent of Cruise readiness');
    near(angles()[0],64,'missing HOV retains angle by existing Cruise rule');near(angles()[1],-43,'Cruise remains valid when HOV missing');
    fixture(1,'UP',25,-37,1,'LINK');
    assert(run('!trimHovAutoReady && !trimAutoReady'),'LINK measurements do not provide TAB rotations');
    near(angles()[0],12,'no TAB pair retains HOV position');near(angles()[1],-24,'no TAB pair retains Cruise position');

    fixture(1,'UP',25,-37,1);
    run('rotationLock.checked=false;updateRotationLock()');await tick();
    const drag=(name,delta)=>run(`(()=>{
      const svg=chartObject.contentDocument.documentElement,handle=chartObject.contentDocument.getElementById('${name}RotationHandle');
      const capture=svg.setPointerCapture;svg.setPointerCapture=()=>{};
      const point=angle=>{const p=svg.createSVGPoint();p.x=397+200*Math.cos(angle*Math.PI/180);p.y=520+200*Math.sin(angle*Math.PI/180);return p.matrixTransform(svg.getScreenCTM());};
      const event=(type,angle)=>{const p=point(angle);return new PointerEvent(type,{pointerId:25,bubbles:true,clientX:p.x,clientY:p.y});};
      try{handle.dispatchEvent(event('pointerdown',0));svg.dispatchEvent(event('pointermove',${delta}));svg.dispatchEvent(event('pointerup',${delta}));}
      finally{svg.setPointerCapture=capture;}
    })()`);
    for(const name of ['hov','cruise'])drag(name,20);
    near(angles()[0],25,'AUTO rejects HOV pointer drag');near(angles()[1],-37,'AUTO rejects Cruise pointer drag');
    assert(run('rotationHandles.every(handle=>handle.getAttribute("pointer-events")==="none")'),'both AUTO handles are disabled');
    run('trimModeToggle.click()');drag('hov',20);drag('cruise',-15);
    near(angles()[0],45,'manual HOV pointer remains active');near(angles()[1],-52,'manual Cruise pointer remains active');
    run('trimModeToggle.click();renderDots()');
    near(angles()[0],45,'AUTO switch follows existing Cruise same-angle retention for HOV');near(angles()[1],-52,'Cruise switch behavior unchanged');
    run('rotationLock.checked=true;updateRotationLock()');
    run(`dotSets.at(-1).adjustments=[['2','TAB','1','DOWN']];
      const before=dotSets.at(-1),dot=(color,rotation,distance)=>{
        const start=getDotCoordinates(before[color]),a=(270+rotation)*Math.PI/180,x=start.x+distance*Math.cos(a),y=start.y+distance*Math.sin(a);
        return {color,clock:'12:00',radius:Math.hypot(x-397,y-520)/240,angle:Math.atan2(x-397,520-y)*180/Math.PI};};
      dotSets.push({learningId:newLearningId(),red:dot('red',-19,30),blue:dot('blue',46,40),adjustments:[]});saveDotSets();renderDots()`);
    near(angles()[0],-19,'new HOV result updates AUTO even with lock');near(angles()[1],46,'new Cruise result updates AUTO even with lock');
    run('dotSets.pop();saveDotSets();renderDots()');
    near(angles()[0],25,'deleting latest result uses previous HOV pair');near(angles()[1],-37,'deleting latest result uses previous Cruise pair');
    run('showChartPage(0)');const link=angles();
    run('syncAutoTrimRotation()');
    assert(JSON.stringify(angles())===JSON.stringify(link),'background TAB sync preserves visible LINK angles');
    run('showChartPage(1)');near(angles()[0],25,'TAB round trip retains HOV');near(angles()[1],-37,'TAB round trip retains Cruise');
    run('balanceFlushState()');loaded=new Promise(resolve=>frame.onload=resolve);frame.contentWindow.location.reload();await loaded;await tick();
    near(angles()[0],25,'reload retains automatic HOV');near(angles()[1],-37,'reload retains automatic Cruise');
    assert(run('trimHovAutoReady && trimAutoReady'),'reload recomputes both readiness states without storage migration');
    run('trimModeToggle.click();rotationLock.checked=false;updateRotationLock()');
    run(`window.dispatchEvent(new MessageEvent('message',{source:chartObject.contentWindow,
      data:{type:'balance-chart-rotation',hovAngle:31,cruiseAngle:-52,finished:true}}));balanceFlushState()`);
    loaded=new Promise(resolve=>frame.onload=resolve);frame.contentWindow.location.reload();await loaded;await tick();
    assert(run('!trimAutoMode'),'manual mode restored');near(angles()[0],31,'manual HOV persists');near(angles()[1],-52,'manual Cruise persists');
    run('window.savedTabRotationBackup=appStorage.exportText()');loaded=new Promise(resolve=>frame.onload=resolve);
    run('appStorage.importText(savedTabRotationBackup);location.reload()');await loaded;await tick();
    near(angles()[0],31,'backup retains manual HOV');near(angles()[1],-52,'backup retains manual Cruise');
    output.textContent=`PASS: ${checks} checks — independent TAB HOV/Cruise learned/fallback angles, timing, direction, pointer modes, lock, deletion, LINK isolation, reload and backup`;
    document.title='PASS';frame.remove();
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
