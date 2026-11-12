(async () => {
  const output=document.getElementById('results'),params=new URLSearchParams(location.search);
  let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  try {
    if(params.get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');frame.style.cssText='width:375px;height:900px;border:0';
    let loaded=new Promise(resolve=>frame.onload=resolve);
    frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code);
    const tick=()=>new Promise(resolve=>setTimeout(resolve,50));
    const setup=(page,learned,automatic,rotation=0)=>run(`
      adjustmentLock=null;adjustmentForecast=null;selectedAdjustmentTarget=null;
      memoPicker.hidden=true;activeMemoIndex=null;learning.reset([]);dotSets.splice(0);forecastDisplayCache.clear();
      adjustmentSelections.forEach(values=>values.fill(''));memoValues.fill('');retainedGuideNumbers.fill(null);
      guideCandidateIndices.fill(0);pitchAutoMode=false;trimAutoMode=false;showChartPage(${page});guideCandidateIndex=0;
      applyChartRotation(${rotation},${rotation});
      const dot=(x,y,color)=>({clock:'12:00',angle:Math.atan2(x-397,520-y)*180/Math.PI,
        radius:Math.hypot(x-397,y-520)/240,color});
      for(let i=0;i<${learned?4:1};i++){
        if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
        dotSets.push({learningId:newLearningId(),red:dot(517+(3-i)*80,620+(3-i)*46.188,'red'),
          blue:dot(527+(3-i)*46,670+(3-i)*38.6,'blue'),
          adjustments:i<${learned?3:0}?[['1','${page?'TAB':'LINK'}','1','UP']]:[]});
        if(${learned})learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
      }
      pitchAutoMode=${automatic};trimAutoMode=${automatic};saveDotSets();renderDots();setGuidesVisible(true);
      updatePitchModeUI();updateTrimModeUI();
    `);
    const shape=()=>run(`JSON.stringify(['red','blue'].map(color=>{
      const group=dotOverlay.querySelector('.adjustment-forecast [data-color="'+color+'"]');
      const body=group.querySelector('.forecast-body'),glow=group.querySelector('.forecast-glow');
      const style=getComputedStyle(body);
      return [color,body.tagName,body.getAttribute('d'),glow.getAttribute('r'),
        getComputedStyle(group).color,style.fill,style.stroke,style.strokeWidth];
    }))`);
    const both=()=>run(`adjustmentForecast?.points.length===2 &&
      ['red','blue'].every(color=>adjustmentForecast.points.some(p=>p.color===color)
        && !!dotOverlay.querySelector('.adjustment-forecast [data-color="'+color+'"]'))`);
    const coverage=new Set();
    assert(run(`(()=>{const estimate=BalanceDistancePrior.resolve({type:'TAB',blade:3,direction:'UP',amount:1},'red',null);
      return estimate.source==='reference-estimate' && estimate.sampleCount===7
        && Math.abs(estimate.distance-0.06676843386951678*240)<1e-8;})()`),
      'new HOV reference uses the seven TAB HOV measurements and their median, without Cruise or LINK data');
    assert(run(`BalanceDistancePrior.resolve({type:'TAB',blade:3,direction:'UP',amount:1},'red',{distance:17}).distance===17`),
      'learned TAB HOV distance keeps priority over the new reference fallback');
    setup(0,false,false);
    const linkShape=shape();
    for(const width of [320,375,390,430]) {
      frame.style.width=width+'px';await tick();
      for(const learned of [false,true])for(const automatic of [false,true])for(const rotation of [0,90,180,270]) {
        setup(1,learned,automatic,rotation);
        const records=run('JSON.stringify([dotSets,learning.inspect()])');
        for(let rank=0;rank<3;rank++) {
          run(`for(let i=0;i<3 && guideCandidateIndex!==${rank} && !guideCandidateToggle.disabled;i++)guideCandidateToggle.click()`);
          assert(run('guideCandidateIndex')===rank,'TAB selects requested No. rank');
          for(const amount of ['1','2','3']) {
            run(`openMemoPicker(2);selectedMemoValue='${amount}';confirmMemoPicker.click()`);
            const label=JSON.stringify({width,learned,automatic,rotation,rank,amount});
            if(!run('guideNumberChoices[guideCandidateIndex]?.candidate')) {
              assert(run('!dotOverlay.querySelector(".forecast-body")'),'unavailable candidate preserves hidden forecasts '+label);
              continue;
            }
            assert(both(),'both TAB forecast dots visible '+label);
            assert(shape()===linkShape,'TAB shares LINK color, shape and size '+label);
            assert(run(`memoValues[1]==='TAB' && memoValues[2]==='${amount}' && memoButtons[2].textContent.includes('度')
              && adjustmentForecast.points.every(point=>{
                const action=BalanceLearning.adjustment(adjustmentForecast.values),guide=forecastGuides[point.color];
                const start=getDotCoordinates(dotSets.at(-1)[point.color]);
                const prediction=learning.predict('TAB',point.color,action.blade,action.direction,action.amount,start);
                const estimate=BalanceDistancePrior.resolve(action,point.color,prediction,prediction?[]:learning.inspect().samples,CHART_RADIUS);
                const node=dotOverlay.querySelector('.adjustment-forecast [data-color="'+point.color+'"]');
                const matrix=node.transform.baseVal.getItem(0).matrix;
                return estimate && guide.blade===action.blade && guide.direction===action.direction
                  && point.source===estimate.source && Math.abs(point.distance-estimate.distance)<1e-8
                  && Math.abs(point.x-start.x-guide.unit.x*estimate.distance)<1e-8
                  && Math.abs(point.y-start.y-guide.unit.y*estimate.distance)<1e-8
                  && Math.abs(matrix.e-point.x)<1e-4 && Math.abs(matrix.f-point.y)<1e-4;
              })`),'both coordinates use the current TAB action and their own TAB calculations '+label);
            coverage.add(run('memoValues[0]+"/"+memoValues[3]+"/"+memoValues[2]'));
          }
        }
        assert(run('JSON.stringify([dotSets,learning.inspect()])')===records,'selection never changes measured or learned data');
        assert(run('document.documentElement.scrollWidth<=innerWidth'),'no horizontal overflow at '+width);
      }
    }
    for(const blade of ['1','2','3'])for(const direction of ['UP','DOWN'])for(const amount of ['1','2','3'])
      assert(coverage.has(`${blade}/${direction}/${amount}`),'UI covers every TAB No./direction/amount combination');
    for(const page of [0,1]) {
      setup(page,true,true);
      for(let i=0;i<3 && !both();i++)run('guideCandidateToggle.click()');
      assert(both(),'both colors before visibility checks');
      const points=run('JSON.stringify(adjustmentForecast.points)');
      run('setGuidesVisible(false)');
      assert(run(`!dotOverlay.querySelector('.forecast-body') &&
        [...dotOverlay.querySelectorAll('.guide-direction-line')].every(node=>!node.checkVisibility())
        && ['red','blue'].every(color=>dotOverlay.querySelector('.chart-dot-'+color).checkVisibility())`),'OFF hides both forecasts and guides while keeping real dots');
      run('setGuidesVisible(true)');assert(both(),'ON restores both colors');
      for(const field of [0,3]) {
        run(`openMemoPicker(${field});selectedMemoValue=${field===0?'memoValues[0]==="1"?"2":"1"':'memoValues[3]==="UP"?"DOWN":"UP"'};previewMemoSelection()`);
        assert(run(`Boolean(dotOverlay.querySelector('.forecast-body'))===(currentChartPage===0 || ${field===3})
          && (dotOverlay.querySelector('.direction-lines').style.opacity!=='0')===(currentChartPage===0 || ${field===3})`),'LINK No preview synchronizes; TAB manual No preview hides both colors and guides');
        run('closeMemoPicker.click()');
        assert(both() && run('JSON.stringify(adjustmentForecast.points)')===points,'cancel restores both original coordinates');
      }
      run('memoFour.click();selectedMemoValue=memoValues[3]==="UP"?"DOWN":"UP";confirmMemoPicker.click();renderDirectionLines(true)');
      assert(run('!!dotOverlay.querySelector(".forecast-body")'),'manual direction remains visible through redraw');
      run('applySelectedGuideAdjustment()');assert(both(),'recalculation restores both forecasts');
      if(page) {
        run(`const layer=dotOverlay.querySelector('.direction-lines');layer.prepend(layer.querySelector('[data-selection-excluded]'))`);
        assert(run('getVisibleGuideAdjustment()===forecastGuides.blue'),'HOV line order never changes TAB selection priority');
        run('memoFour.click();selectedMemoValue=memoValues[3]==="UP"?"DOWN":"UP";previewMemoSelection();closeMemoPicker.click()');
        assert(both(),'cancel restores both colors with HOV line first');
      }
    }
    const saved=run('JSON.stringify(adjustmentForecast.points)');
    const savedContext=run('JSON.stringify({page:currentChartPage,type:adjustmentForecast.type,values:memoValues,angles:[hovAngle,cruiseAngle]})');
    run('balanceFlushState()');loaded=new Promise(resolve=>frame.onload=resolve);frame.contentWindow.location.reload();await loaded;await tick();
    assert(both() && run('JSON.stringify(adjustmentForecast.points)')===saved,'reload restores both TAB forecast positions: before='+savedContext+'/'+saved+' after='+run('JSON.stringify({page:currentChartPage,type:adjustmentForecast?.type,values:memoValues,points:adjustmentForecast?.points,angles:[hovAngle,cruiseAngle],readOnly:appStorage.readOnly,error:appStorage.error})'));
    run('window.tabForecastBackup=appStorage.exportText()');loaded=new Promise(resolve=>frame.onload=resolve);
    run('appStorage.importText(tabForecastBackup);location.reload()');await loaded;await tick();
    assert(both() && run('JSON.stringify(adjustmentForecast.points)')===saved,'backup restore retains both TAB forecast positions');
    output.textContent=`PASS: ${checks} checks — TAB HOV/Cruise, all 18 No./direction/amount combinations, reference/learned, manual/automatic, LINK display parity and four mobile widths`;
    document.title='PASS';
    if(params.has('screenshot')) {
      const width=Number(params.get('width'))||375;
      frame.style.cssText=`width:${width}px;height:900px;border:0;display:block`;document.body.style.margin='0';output.hidden=true;
      setup(Number(params.get('page'))||0,false,false);await tick();run('chartWrap.scrollIntoView()');
    }else frame.remove();
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
