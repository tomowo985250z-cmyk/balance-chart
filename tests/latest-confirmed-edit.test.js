(async()=>{
  const output=document.getElementById('results'),params=new URLSearchParams(location.search);let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  try{
    if(params.get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');frame.style.cssText='width:375px;height:1000px;border:0';
    let loaded=new Promise(resolve=>frame.onload=resolve);frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code);
    const reload=async()=>{run('balanceFlushState()');loaded=new Promise(resolve=>frame.onload=resolve);frame.contentWindow.location.reload();await loaded;};
    const choose=page=>run(`showChartPage(${page});for(const [i,v] of [[0,'1'],[2,'${page?'1':'1/4'}'],[3,'UP']]){
      openMemoPicker(i);selectedMemoValue=v;previewMemoSelection();confirmMemoPicker.click();}addAdjustmentButton.click()`);
    const setup=(page,colors=['red','blue'],learned=false)=>run(`
      adjustmentSequence=null;adjustmentLock=null;confirmedCarry=null;adjustmentForecast=null;selectedAdjustmentTarget=null;
      memoPicker.hidden=true;activeMemoIndex=null;learning.reset([]);dotSets.splice(0);forecastDisplayCache.clear();
      adjustmentSelections.forEach(values=>values.fill(''));memoValues.fill('');guideCandidateIndices.fill(0);retainedGuideNumbers.fill(null);
      pitchAutoMode=false;trimAutoMode=false;showChartPage(${page});guideCandidateIndex=0;applyChartRotation(0,0);
      if(${learned}){
        const dot=(x,y,color)=>({clock:'12:00',angle:Math.atan2(x-397,520-y)*180/Math.PI,radius:Math.hypot(x-397,y-520)/240,color});
        for(let i=0;i<4;i++){
          if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
          dotSets.push({learningId:newLearningId(),red:dot(517+(3-i)*30,620+(3-i)*17.32,'red'),blue:dot(527+(3-i)*40,670+(3-i)*25,'blue'),
            adjustments:i<3?[['1','${page?'TAB':'LINK'}','1','UP']]:[]});
          if(i)learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
        }
        pitchAutoMode=trimAutoMode=true;saveDotSets();renderDots();
      }else{
        redInputs.forEach((input,i)=>input.value=${colors.includes('red')?"['2','0','.45'][i]":"''"});
        blueInputs.forEach((input,i)=>input.value=${colors.includes('blue')?"['5','0','.35'][i]":"''"});addDotButton.click();
      }
      updateMemoButtons();updateEditingUI();setGuidesVisible(true);`);
    const actual=()=>run('JSON.stringify(dotSets.map(set=>[set.red,set.blue]))');
    const learned=()=>run('JSON.stringify(learning.inspect())');
    const history=()=>run('JSON.stringify([dotSets,adjustmentSequence,confirmedCarry])');
    const open=()=>run('dotList.querySelector(".edit-confirmed-adjustment").click()');
    const change=(type,blade,direction,amount)=>run(`confirmedEditType.value='${type}';confirmedEditType.dispatchEvent(new Event('change'));
      confirmedEditBlade.value='${blade}';confirmedEditDirection.value='${direction}';confirmedEditAmount.value='${amount}'`);
    const checkGuides=label=>assert(run(`adjustmentLock.forecast.points.every(point=>{
      const line=dotOverlay.querySelector('.guide-direction-line[marker-end="url(#'+point.color+'DirectionLineArrow)"]');
      const geometry=guideDisplayGeometry.get(line),unit=getGuideMovementUnit(geometry),origin=getDotCoordinates(adjustmentLock.origins[point.color].dot);
      const node=dotOverlay.querySelector('.adjustment-forecast.fixed [data-color="'+point.color+'"]'),m=node?.transform.baseVal.getItem(0).matrix;
      const dx=Number(line?.getAttribute('x2'))-Number(line?.getAttribute('x1')),dy=Number(line?.getAttribute('y2'))-Number(line?.getAttribute('y1'));
      return m&&Math.hypot(m.e-point.x,m.f-point.y)<1e-4&&Math.hypot(geometry.base.x-origin.x,geometry.base.y-origin.y)<1e-7
        &&Math.hypot(point.x-origin.x-unit.x*point.distance,point.y-origin.y-unit.y*point.distance)<1e-7
        &&dx*unit.x+dy*unit.y>0&&Math.abs(dx*unit.y-dy*unit.x)<1e-4;
    })`),label+': recalculated fixed points and directed guides agree');
    if(params.has('screenshot')){
      frame.style.cssText=`width:${Number(params.get('width')||375)}px;height:2200px;border:0`;output.hidden=true;document.body.style.margin='0';
      const first=Number(params.get('first')||0);setup(first);choose(first);choose(1-first);open();
      change(first?'LINK':'TAB','2','DOWN',first?'1/2':'2');
      if(params.get('state')==='saved'){run('confirmedEditForm.requestSubmit()');checkGuides('capture');}
      document.title='PASS';return;
    }
    for(const width of [320,375,390,430])for(const path of [[0],[1],[0,1],[1,0]])for(const colors of [['red'],['blue'],['red','blue']]){
      frame.style.width=width+'px';setup(path[0],colors);path.forEach(choose);
      if(path.length===2)run(`showChartPage(${path[0]})`);
      const label=`${width}/${path}/${colors}`,page=path.at(-1),type=page?'TAB':'LINK';
      const before=history(),measurement=actual(),learningBefore=learned(),earlier=run('JSON.stringify(adjustmentSequence.stages[0])');
      assert(run('dotList.querySelectorAll(".edit-confirmed-adjustment").length===1'),label+': only latest confirmed action has an edit button');
      open();assert(run('confirmedEditDialog.open'),label+': button opens dedicated editor despite page locks');
      assert(run('confirmedEditDialog.getBoundingClientRect().left>=0&&confirmedEditDialog.getBoundingClientRect().right<=innerWidth'),label+': editor fits narrow viewport');
      assert(run('memoOne.disabled && memoThree.disabled && addAdjustmentButton.disabled'),label+': normal adjustment remains locked during editing');
      change(type,'2','DOWN',page?'2':'1/2');
      assert(history()===before&&actual()===measurement&&learned()===learningBefore,label+': draft changes do not affect saved data');
      run('document.getElementById("cancelConfirmedEdit").click()');
      assert(history()===before&&!run('confirmedEditDialog.open'),label+': cancel retains original values and points');
      open();run('confirmedEditDialog.dispatchEvent(new Event("cancel"));confirmedEditDialog.close()');
      assert(history()===before,label+': escape/close retains original values');
      open();change(type,'2','DOWN',page?'2':'1/2');run('confirmedEditForm.requestSubmit()');
      assert(!run('confirmedEditDialog.open'),label+': save completes');
      assert(run(`adjustmentSequence.stages.length===${path.length}&&dotSets.at(-1).adjustments.length===${path.length}`),label+': history updated in place without duplicate');
      assert(run(`JSON.stringify(adjustmentSequence.stages.at(-1).values)===JSON.stringify(['2','${type}','${page?'2':'1/2'}','DOWN'])`),label+': blade, direction and amount saved');
      assert(actual()===measurement&&learned()===learningBefore,label+': saving changes neither measurements nor learning');
      assert(run(`Object.keys(adjustmentSequence.active).length===${path.length}&&!!adjustmentLock&&memoOne.disabled&&addAdjustmentButton.disabled`),label+': all original locks remain');
      checkGuides(label);
      const coordinates=run('JSON.stringify(adjustmentSequence.stages.at(-1).forecast.points.map(p=>[p.color,p.x,p.y,p.distance]))');
      open();run('confirmedEditForm.requestSubmit()');
      assert(run('JSON.stringify(adjustmentSequence.stages.at(-1).forecast.points.map(p=>[p.color,p.x,p.y,p.distance]))')===coordinates,label+': saving unchanged values does not move predictions');
      if(path.length===2){
        assert(run('JSON.stringify(adjustmentSequence.stages[0])')===earlier,label+': older confirmed action unchanged');
        open();assert(run(`[...confirmedEditType.options].find(o=>o.value==='${page?'LINK':'TAB'}').disabled`),label+': already confirmed other method cannot be duplicated');
        run('confirmedEditType.value=confirmedEditType.value==="LINK"?"TAB":"LINK";confirmedEditType.dispatchEvent(new Event("change"));confirmedEditForm.requestSubmit()');
        assert(run('confirmedEditDialog.open && !!confirmedEditError.textContent'),label+': invalid cross-method edit is rejected');
        run('document.getElementById("cancelConfirmedEdit").click()');
        assert(run(`adjustmentSequence.stages[0].forecast.points.every(p=>{
          const q=getDotCoordinates(adjustmentSequence.stages[1].origins[p.color].dot);return Math.hypot(q.x-p.x,q.y-p.y)<1e-7;})`),label+': continuation still starts from prior confirmed points');
      }
      const saved=history();await reload();assert(history()===saved&&actual()===measurement&&learned()===learningBefore,label+': edit and immutable learning restore exactly');checkGuides(label+'/reload');
      run('BalanceState.validateRecords(JSON.parse(appStorage.exportText()).records)');
      assert(run('document.documentElement.scrollWidth<=innerWidth'),label+': narrow display fits');
      if(path.length===1){
        choose(1-page);assert(run('adjustmentSequence.stages.length===2'),label+': unadjusted page can continue after edit');
        assert(run('adjustmentSequence.stages[0].forecast.points.every(p=>{const q=getDotCoordinates(adjustmentSequence.stages[1].origins[p.color].dot);return Math.hypot(q.x-p.x,q.y-p.y)<1e-7;})'),label+': continuation uses edited endpoints');
        assert(run('dotList.querySelectorAll(".edit-confirmed-adjustment").length===1'),label+': edit button moves to latest confirmation');
      }
    }
    for(const page of [0,1]){
      setup(page);choose(page);open();change(page?'LINK':'TAB','3','DOWN',page?'1/2':'2');run('confirmedEditForm.requestSubmit()');
      assert(run(`!!getSequenceStage(${1-page})&&!getSequenceStage(${page})&&adjustmentSequence.stages.length===1`),'method change moves only the edited action lock');
      checkGuides('method change');await reload();checkGuides('method change/reload');
      setup(page,['red','blue'],true);choose(page);
      const model=learned(),measurement=actual();assert(run('learning.inspect().samples.length>0'),'fixture has real learned samples');
      const original=run('JSON.stringify(adjustmentSequence.stages.at(-1).forecast.points.map(p=>[p.x,p.y]))');
      open();run('confirmedEditForm.requestSubmit()');
      assert(run('JSON.stringify(adjustmentSequence.stages.at(-1).forecast.points.map(p=>[p.x,p.y]))')===original,'unchanged learned adjustment retains exact predicted coordinates');
      open();change(page?'TAB':'LINK','1','DOWN',page?'2':'1/2');run('confirmedEditForm.requestSubmit()');
      assert(learned()===model&&actual()===measurement,'editing with trained models leaves actuals and learned records unchanged');checkGuides('learned');await reload();assert(learned()===model,'learned records unchanged after restore');
      run(`redInputs.forEach((input,i)=>input.value=['3','0','.2'][i]);blueInputs.forEach(input=>input.value='');addDotButton.click()`);
      const afterActual=learned();open();change(page?'TAB':'LINK','3','UP',page?'3':'3/4');run('confirmedEditForm.requestSubmit()');
      assert(learned()===afterActual&&run('Object.keys(adjustmentSequence.active).length===0&&!adjustmentLock'),'editing after new actual preserves learning and released locks');await reload();assert(learned()===afterActual,'historical latest edit preserves learned records after reload');
      assert(run('Math.hypot(getDotCoordinates(getAdjustmentStartSet().red).x-getDotCoordinates(dotSets.at(-1).red).x,getDotCoordinates(getAdjustmentStartSet().red).y-getDotCoordinates(dotSets.at(-1).red).y)<1e-7'),'editing an earlier forecast never replaces the newer HOV measurement');
    }
    setup(0);run(`dotSets[0].adjustments=[['1','LINK','1/4','UP'],['2','TAB','1','DOWN']];saveDotSets();renderDots()`);
    const legacy=history(),legacyLearning=learned();
    assert(run('dotList.querySelectorAll(".edit-confirmed-adjustment").length===1'),'legacy records expose only their latest action');
    run('dotList.querySelector(".dot-adjustment-row").click();startAdjustmentEdit(dotSets[0],dotSets[0].adjustments[0])');
    assert(run('!editConfirmation.open&&!adjustmentEdit'),'legacy past actions cannot enter either editor');
    open();run('document.getElementById("cancelConfirmedEdit").click()');
    assert(history()===legacy,'canceling legacy edit does not migrate or change stored data');
    open();change('TAB','3','UP','2');run('confirmedEditForm.requestSubmit()');
    assert(run('dotSets[0].adjustments.length===2&&dotSets[0].adjustments[0].join("/")==="1/LINK/1/4/UP"&&dotSets[0].adjustments[1].join("/")==="3/TAB/2/UP"'),'legacy latest action updates without changing past or adding a row');
    assert(learned()===legacyLearning&&run('Object.keys(adjustmentSequence.active).length===0'),'legacy edit preserves learning and unlocked state');
    await reload();assert(run('dotList.querySelectorAll(".edit-confirmed-adjustment").length===1&&!appStorage.readOnly'),'legacy edit migrates to valid restorable forecast history');
    output.textContent=`PASS: ${checks} checks — latest-only button, locked editing, blade/type/direction/amount, cancel/escape, in-place updates, both continuation orders, inherited points, single colors, trained learning preservation, reload/backup and four widths`;
    document.title='PASS';frame.remove();
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
