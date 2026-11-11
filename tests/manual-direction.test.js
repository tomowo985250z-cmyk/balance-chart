(async () => {
  const output = document.getElementById('results'), params = new URLSearchParams(location.search);
  let checks = 0, asymmetric = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  try {
    if (params.get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe'); frame.style.cssText = 'width:375px;height:950px;border:0';
    let loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const select = (index,value) => run(`openMemoPicker(${index});selectedMemoValue='${value}';previewMemoSelection();confirmMemoPicker.click()`);
    const reload = async () => { run('balanceFlushState()'); loaded = new Promise(resolve => frame.onload = resolve);frame.contentWindow.location.reload();await loaded; };
    const setup = (page, mode, second) => {
      run(`adjustmentSequence=null;adjustmentLock=null;confirmedCarry=null;adjustmentForecast=null;selectedAdjustmentTarget=null;
        memoPicker.hidden=true;activeMemoIndex=null;learning.reset([]);dotSets.splice(0);forecastDisplayCache.clear();
        adjustmentSelections.forEach(values=>values.fill(''));memoValues.fill('');guideCandidateIndices.fill(0);retainedGuideNumbers.fill(null);
        pitchAutoMode=false;trimAutoMode=false;showChartPage(${second?1-page:page});guideCandidateIndex=0;applyChartRotation(0,0);
        const dot=(x,y,color)=>({clock:'12:00',angle:Math.atan2(x-397,520-y)*180/Math.PI,radius:Math.hypot(x-397,y-520)/240,color});
        for(let i=0;i<${mode==='learned'?4:1};i++){
          if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
          dotSets.push({learningId:newLearningId(),red:dot(517+(3-i)*30,620+(3-i)*17.32,'red'),
            blue:dot(527+(3-i)*40,670+(3-i)*25,'blue'),adjustments:i<${mode==='learned'?3:0}?[['1','${second?(page?'LINK':'TAB'):(page?'TAB':'LINK')}','1','UP']]:[]});
          if(i)learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
        }
        pitchAutoMode=trimAutoMode=${mode!=='manual'};saveDotSets();renderDots();setGuidesVisible(true);`);
      if (second) { select(0,'1');select(3,'UP');select(2,page?'1/4':'1');run(`addAdjustmentButton.click();chartPageButtons[${page}].click()`); }
    };
    const frozen = () => run(`JSON.stringify([dotSets,learning.inspect(),adjustmentSequence?.stages,
      [...dotOverlay.querySelectorAll('.chart-dot-red,.chart-dot-blue,.first-stage-forecast [data-color]')].map(node=>node.outerHTML),
      [...dotList.querySelectorAll('.confirmed-adjustment-forecast')].map(node=>node.outerHTML)])`);
    const verify = (direction, label) => {
      assert(run(`adjustmentForecast.values[3]==='${direction}' && adjustmentForecast.points.length===2
        && dotOverlay.querySelectorAll('.adjustment-forecast [data-color]').length===2
        && dotOverlay.querySelector('.direction-lines').style.opacity!=='0'`), label+': both forecasts and guides remain visible');
      assert(run(`adjustmentForecast.points.every(point=>{
        const action=BalanceLearning.adjustment(adjustmentForecast.values),start=getDotCoordinates(getAdjustmentStartSet()[point.color]);
        const prediction=learning.predict(action.type,point.color,action.blade,action.direction,action.amount,start);
        const estimate=resolveDisplayDistance(action,point.color,prediction,prediction?[]:learning.inspect().samples,240);
        const learnedDirection=!guidePredictionDebug.fallback && (action.type==='LINK'||point.color==='blue'||!getAdjustmentStartSet().blue) && prediction;
        const expectedUnit=learnedDirection?{x:(prediction.position.x-start.x)/prediction.distance,y:(prediction.position.y-start.y)/prediction.distance}
          :getDirectionLine(getAdjustmentStartSet()[point.color],point.color,null,action.blade,action.direction).unit;
        const guide=forecastGuides[point.color],line=dotOverlay.querySelector('.guide-direction-line[marker-end="url(#'+point.color+'DirectionLineArrow)"]');
        const geometry=guideDisplayGeometry.get(line),node=dotOverlay.querySelector('.adjustment-forecast [data-color='+point.color+']');
        const matrix=node.transform.baseVal.getItem(0).matrix,dx=Number(line.getAttribute('x2'))-Number(line.getAttribute('x1')),dy=Number(line.getAttribute('y2'))-Number(line.getAttribute('y1'));
        return guide.direction==='${direction}' && guide.blade===action.blade
          && Math.hypot(guide.unit.x-expectedUnit.x,guide.unit.y-expectedUnit.y)<1e-8
          && Math.hypot(geometry.base.x-start.x,geometry.base.y-start.y)<1e-8
          && Math.abs(point.distance-estimate.distance)<1e-8
          && Math.hypot(point.x-start.x-guide.unit.x*estimate.distance,point.y-start.y-guide.unit.y*estimate.distance)<1e-8
          && Math.hypot(matrix.e-point.x,matrix.f-point.y)<1e-4
          && dx*guide.unit.x+dy*guide.unit.y>0 && Math.abs(dx*guide.unit.y-dy*guide.unit.x)<1e-4;
      })`), label+': selected direction, original distance engine, inherited origin, rendered endpoint and arrows agree');
      assert(run('document.documentElement.scrollWidth<=innerWidth'), label+': mobile fits');
    };
    for (const width of params.has('screenshot')?[Number(params.get('width')||375)]:[320,375,390,430]) {
      frame.style.width=width+'px';
      for(const page of params.has('screenshot')?[Number(params.get('page')||0)]:[0,1])
      for(const mode of params.has('screenshot')?['manual']:['manual','waiting','learned'])
      for(const second of params.has('screenshot')?[true]:[false,true]) {
        setup(page,mode,second); const label=`${width}/${page}/${mode}/${second}`;
        for(let rank=0;rank<(params.has('screenshot')?1:3);rank++) {
          if(rank)run('guideCandidateToggle.click()');
          if(!run('Boolean(guideNumberChoices[guideCandidateIndex]?.candidate)'))continue;
          const order=run('JSON.stringify(guideNumberChoices.map(c=>[c.blade,c.candidate?.direction]))');
          select(2,page?'2':'1/2');const amount=run('memoValues[2]'),blade=run('memoValues[0]'),before=frozen();
          let up;
          for(const direction of ['UP','DOWN','UP']) {
            run(`memoFour.click();selectedMemoValue='${direction}';previewMemoSelection()`);verify(direction,label+'/preview');
            run('confirmMemoPicker.click()');verify(direction,label+'/confirmed');
            assert(run('memoValues[2]')===amount && run('memoValues[0]')===blade,label+': amount and No retained');
            const points=run('adjustmentForecast.points');
            if(direction==='UP')up=points;else if(points.some(p=>Math.abs(p.distance-up.find(q=>q.color===p.color).distance)>1e-6))asymmetric++;
            run('renderDirectionLines(true)');verify(direction,label+'/redraw');
            run('guideToggle.click();guideToggle.click()');verify(direction,label+'/guide toggle');
            assert(frozen()===before,label+': actuals, confirmed dots/results and learning unchanged');
            assert(run('JSON.stringify(guideNumberChoices.map(c=>[c.blade,c.candidate?.direction]))')===order,label+': automatic order unchanged');
          }
          const saved=run('JSON.stringify(adjustmentForecast.points)');
          run(`memoFour.click();selectedMemoValue='DOWN';previewMemoSelection();closeMemoPicker.click()`);
          assert(run('JSON.stringify(adjustmentForecast.points)')===saved,label+': cancellation restores exact points');
          if(second) { run(`chartPageButtons[${1-page}].click();chartPageButtons[${page}].click()`);verify('UP',label+'/page round trip'); }
        }
        if(params.has('screenshot')) {
          select(3,params.get('direction')||'UP');verify(params.get('direction')||'UP',label+'/screenshot');
          document.getElementById('results').hidden=true;frame.style.height='1950px';continue;
        }
        await reload();verify('UP',label+'/reload');
        select(2,page?'3':'1/4');verify('UP',label+'/amount after direction');
        assert(run('memoButtons[2].textContent.includes(currentChartPage?"度":"フラット")'),label+': method units retained');
      }
    }
    if(!params.has('screenshot')) {
      for(const page of [0,1]) {
        setup(page,'manual',true);
        for(const direction of ['UP','DOWN','UP']) {
          run(`memoFour.click();memoWheel.querySelector('[data-value=${direction}]').click()`);
          assert(run('selectedMemoValue')===direction,'real option tap immediately selects '+direction);
          await new Promise(resolve=>setTimeout(resolve,450));
          assert(run('selectedMemoValue')===direction,'real option tap selects '+direction);
          verify(direction,'real option tap/'+page);
          run('confirmMemoPicker.click()');verify(direction,'real option confirm/'+page);
        }
        run('addAdjustmentButton.click()');
        const fixed=run('JSON.stringify([adjustmentSequence,adjustmentForecast,[...dotOverlay.querySelectorAll(".adjustment-forecast [data-color]")].map(n=>n.outerHTML)])');
        run(`memoFour.click();selectedMemoValue='DOWN';previewMemoSelection();confirmMemoPicker.click()`);
        assert(run('JSON.stringify([adjustmentSequence,adjustmentForecast,[...dotOverlay.querySelectorAll(".adjustment-forecast [data-color]")].map(n=>n.outerHTML)])')===fixed,'completed confirmed endpoints stay locked');
      }
      assert(asymmetric>0,'UP/DOWN distances differ: selected calculations are not mirrored coordinates');frame.remove();
    }
    output.textContent=`PASS: ${checks} checks — UP/DOWN preview/confirm/cancel, learned/reference distances, guide vectors, three Nos, quantities, stage origins, fixed/actual/result preservation, ranking, reload and four widths; ${asymmetric} asymmetric cases`;
    document.title='PASS';
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
