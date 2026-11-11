(async()=>{
  const output=document.getElementById('results');let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  try{
    if(new URLSearchParams(location.search).get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');frame.style.cssText='width:390px;height:950px;border:0';
    const loaded=new Promise(resolve=>frame.onload=resolve);frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code);
    const select=(index,value)=>run(`openMemoPicker(${index});selectedMemoValue='${value}';confirmMemoPicker.click()`);
    const setup=page=>run(`adjustmentSequence=null;adjustmentLock=null;confirmedCarry=null;adjustmentForecast=null;selectedAdjustmentTarget=null;
      memoPicker.hidden=true;activeMemoIndex=null;learning.reset([]);dotSets.splice(0);forecastDisplayCache.clear();
      adjustmentSelections.forEach(v=>v.fill(''));memoValues.fill('');guideCandidateIndices.fill(0);retainedGuideNumbers.fill(null);
      pitchAutoMode=false;trimAutoMode=false;showChartPage(${page});guideCandidateIndex=0;applyChartRotation(0,0);
      redInputs.forEach((input,i)=>input.value=['2','0','0.4'][i]);blueInputs.forEach((input,i)=>input.value=['5','0','0.3'][i]);
      addDotButton.click();setGuidesVisible(true);`);
    for(const width of [320,375,390,430])for(const page of [0,1])for(const second of [false,true]){
      frame.style.width=width+'px';setup(second?1-page:page);
      if(second){
        select(0,'1');select(3,'UP');select(2,page?'1/4':'1');run('addAdjustmentButton.click()');
        run(`redInputs.forEach((input,i)=>input.value=['3','0','0.25'][i]);blueInputs.forEach(input=>input.value='');addDotButton.click();chartPageButtons[${page}].click()`);
        assert(run('adjustmentSequence.stages.length===1 && !adjustmentLock'),'partial actual keeps second stage editable');
        assert(run(`dotOverlay.querySelectorAll('.first-stage-forecast [data-color]').length===2`),'first confirmed endpoints retained');
      }
      const history=run('JSON.stringify(dotSets)'),models=run('JSON.stringify([learning.inspect().models,learning.inspect().samples])');
      for(let number=0;number<3;number++){
        if(number)run('guideCandidateToggle.click()');else run('applySelectedGuideAdjustment()');
        for(const amount of page?['1','2','3']:['1/8','1/4','1/2']){
          select(2,amount);
          const label=`${width}/${page}/${second}/${number}/${amount}`;
          for(const color of ['red','blue']){
            assert(run(`(()=>{const p=adjustmentForecast?.points.find(p=>p.color==='${color}');
              const node=dotOverlay.querySelector('.adjustment-forecast [data-color=${color}]');
              if(!p)return !node;
              if(!node)return false;
              const m=node.transform.baseVal.getItem(0).matrix,base=getDotCoordinates(getAdjustmentStartSet()['${color}']),unit=forecastGuides['${color}'].unit;
              return Math.hypot(m.e-p.x,m.f-p.y)<1e-4 && Math.hypot(p.x-base.x-unit.x*p.distance,p.y-base.y-unit.y*p.distance)<1e-8
                && node.querySelector('.forecast-body').getAttribute('d')==='M 0 -7 L 7 0 L 0 7 L -7 0 Z'
                && node.querySelector('.forecast-glow').getAttribute('r')==='12';})()`),label+': matching endpoint '+color);
            run(`window.testLine=dotOverlay.querySelector('.guide-direction-line[marker-end="url(#${color}DirectionLineArrow)"]');testLine.style.display='none';renderAdjustmentForecast()`);
            assert(run(`!dotOverlay.querySelector('.adjustment-forecast [data-color=${color}]')`),label+': hidden guide hides matching dot');
            run("testLine.style.display='';renderAdjustmentForecast()");
          }
          assert(run('document.documentElement.scrollWidth<=innerWidth'),label+': mobile fits');
        }
      }
      run('guideToggle.click()');
      assert(run('!dotOverlay.querySelector(".adjustment-forecast")'),'guide OFF hides previews');
      run('guideToggle.click();memoFour.click();selectedMemoValue=memoValues[3]==="UP"?"DOWN":"UP";previewMemoSelection()');
      assert(run('dotOverlay.querySelectorAll(".adjustment-forecast [data-color]").length===2 && Object.values(forecastGuides).every(guide=>guide.direction===selectedMemoValue)'),'manual direction updates both previews and guides');
      run('closeMemoPicker.click();applySelectedGuideAdjustment()');
      assert(run('JSON.stringify(dotSets)')===history,'preview leaves actual and confirmed records unchanged');
      assert(run('JSON.stringify([learning.inspect().models,learning.inspect().samples])')===models,'preview leaves calculations and learning unchanged');
      if(second){
        select(0,'1');select(3,'UP');select(2,page?'1':'1/4');run('addAdjustmentButton.click()');
        assert(run('adjustmentSequence.stages.length===2'),'second stage confirms');
        assert(run(`dotOverlay.querySelector('.first-stage-forecast').dataset.state==='confirmed-history'
          && dotOverlay.querySelectorAll('.adjustment-forecast.fixed [data-color]').length===2`),'old and final confirmed endpoints distinguished');
      }
    }
    output.textContent=`PASS: ${checks} checks — both methods, all three guide candidates and quantities, endpoints, per-color visibility, manual hiding, mixed second-stage origins, confirmations and four mobile widths`;
    document.title='PASS';frame.remove();
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
