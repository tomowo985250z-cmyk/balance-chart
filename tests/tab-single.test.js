(async()=>{
  const output=document.getElementById('results');let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  try{
    if(new URLSearchParams(location.search).get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');frame.style.cssText='width:390px;height:950px;border:0';
    let loaded=new Promise(resolve=>frame.onload=resolve);frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code);
    const select=(index,value)=>run(`openMemoPicker(${index});selectedMemoValue='${value}';confirmMemoPicker.click()`);
    const setup=(page,red,blue,automatic)=>run(`adjustmentSequence=null;adjustmentLock=null;confirmedCarry=null;adjustmentForecast=null;selectedAdjustmentTarget=null;
      memoPicker.hidden=true;activeMemoIndex=null;learning.reset([]);dotSets.splice(0);forecastDisplayCache.clear();
      adjustmentSelections.forEach(v=>v.fill(''));memoValues.fill('');guideCandidateIndices.fill(0);retainedGuideNumbers.fill(null);
      pitchAutoMode=false;trimAutoMode=false;showChartPage(${page});guideCandidateIndex=0;applyChartRotation(0,0);
      redInputs.forEach((input,i)=>input.value=${red?"['2','0','0.4'][i]":"''"});blueInputs.forEach((input,i)=>input.value=${blue?"['5','0','0.3'][i]":"''"});
      ${red||blue?'addDotButton.click();':''}pitchAutoMode=trimAutoMode=${automatic};renderDots();setGuidesVisible(true);`);
    for(const width of [320,375,390,430])for(const page of [0,1])for(const automatic of [false,true])for(const [red,blue] of [[true,false],[false,true],[true,true],[false,false]]){
      frame.style.width=width+'px';setup(page,red,blue,automatic);const label=`${width}/${page}/${automatic}/${red}/${blue}`;
      const snapshot=run('JSON.stringify([dotSets,learning.inspect()])');
      if(!red&&!blue){assert(run('!dotOverlay.querySelector(".guide-direction-line")&&!dotOverlay.querySelector(".adjustment-forecast")'),label+': empty display');continue;}
      const explicitOnly=page===0&&!red;
      if(explicitOnly){
        assert(run('guideNumberChoices.length===0 && !dotOverlay.querySelector(".guide-direction-line")'),label+': no automatic LINK selection without HOV');
        select(0,'1');select(3,'UP');
      }
      for(let number=0;number<3;number++){
        if(number){if(explicitOnly)select(0,String(number+1));else run('guideCandidateToggle.click()');}
        for(const amount of page?['1','2','3']:['1/8','1/4','1/2']){
          select(2,amount);
          assert(run(`Boolean(forecastGuides.red)===${red} && Boolean(forecastGuides.blue)===${blue}`),label+': independent guide origins');
          assert(run(`adjustmentForecast.points.length===${Number(red)+Number(blue)} && dotOverlay.querySelectorAll('.adjustment-forecast [data-color]').length===${Number(red)+Number(blue)}`),label+': each available color has prediction');
          assert(run(`!${!blue} || !dotSets.some(set=>set.blue)`),label+': no fabricated Cruise actual');
          assert(run('document.documentElement.scrollWidth<=innerWidth'),label+': mobile fits');
        }
      }
      for(const direction of ['UP','DOWN']){
        select(3,direction);
        assert(run(`adjustmentForecast.points.length===${Number(red)+Number(blue)}
          && dotOverlay.querySelectorAll('.adjustment-forecast [data-color]').length===${Number(red)+Number(blue)}
          && dotOverlay.querySelector('.direction-lines').style.opacity!=='0'`),label+': direction shows all available forecasts and guides');
        assert(run(`adjustmentForecast.points.every(point=>{
          const origin=getDotCoordinates(getAdjustmentStartSet()[point.color]),guide=forecastGuides[point.color];
          const line=dotOverlay.querySelector('.guide-direction-line[marker-end="url(#'+point.color+'DirectionLineArrow)"]');
          const geometry=guideDisplayGeometry.get(line),node=dotOverlay.querySelector('.adjustment-forecast [data-color='+point.color+']');
          const matrix=node.transform.baseVal.getItem(0).matrix;
          return guide.direction==='${direction}' && Math.hypot(geometry.base.x-origin.x,geometry.base.y-origin.y)<1e-8
            && Math.hypot(point.x-origin.x-guide.unit.x*point.distance,point.y-origin.y-guide.unit.y*point.distance)<1e-8
            && Math.hypot(matrix.e-point.x,matrix.f-point.y)<1e-4;
        })`),label+': selected direction, guide origin and rendered prediction agree');
      }
      if(explicitOnly)assert(run('guideNumberChoices.length===0 && guideCandidateToggle.disabled'),label+': explicit selection never creates automatic ranks');
      run('applySelectedGuideAdjustment()');
      assert(run('JSON.stringify([dotSets,learning.inspect()])')===snapshot,label+': no data/learning mutation');
    }
    for(const width of [320,375,390,430])for(const first of [0,1])for(const color of ['red','blue']){
      frame.style.width=width+'px';setup(first,color==='red',color==='blue',false);
      // LINK without HOV uses only the explicit No. and direction, through the real picker.
      select(0,run('memoValues[0]')||'1');select(3,'UP');select(2,first?'1':'1/4');
      run(`addAdjustmentButton.click();chartPageButtons[${1-first}].click()`);
      const point=run(`adjustmentSequence.stages[0].forecast.points.find(p=>p.color==='${color}')`);
      assert(Boolean(point),'single-color stage confirms its real endpoint');
      assert(run(`(()=>{const p=getDotCoordinates(getAdjustmentStartSet()['${color}']);return Math.hypot(p.x-${point.x},p.y-${point.y})<1e-8;})()`),'single-color confirmed origin inherited');
      {
        select(0,run('memoValues[0]')||'1');select(3,'UP');select(2,first?'1/4':'1');
        assert(run(`adjustmentForecast.points.some(p=>p.color==='${color}') && !!dotOverlay.querySelector('.adjustment-forecast [data-color=${color}]')`),
          `${width}/${first}/${color}: second stage displays available prediction after real selection: `+run(`JSON.stringify({memoValues,adjustmentForecast,forecastGuides,choices:guideNumberChoices,opacity:dotOverlay.querySelector('.direction-lines').style.opacity})`));
        run('addAdjustmentButton.click()');
        assert(run('adjustmentSequence.stages.length===2 && !!adjustmentLock'),'single-color second stage confirms');
        run('balanceFlushState()');loaded=new Promise(resolve=>frame.onload=resolve);frame.contentWindow.location.reload();await loaded;
        assert(run('adjustmentSequence.stages.length===2 && !appStorage.readOnly'),'single-color completed state restores');
        for(const page of [0,1]){
          run(`chartPageButtons[${page}].click()`);
          assert(run(`!!dotOverlay.querySelector('.adjustment-forecast.fixed [data-color=${color}]')`),'each single-color confirmed dot remains visible after reload and page switch');
        }
      }
    }
    output.textContent=`PASS: ${checks} checks — LINK/TAB HOV only, Cruise only, both/none, explicit-only LINK without HOV, unchanged automatic ranks, selected directions/guides/rendered forecasts, single-color stages/reload and four widths`;
    document.title='PASS';frame.remove();
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
