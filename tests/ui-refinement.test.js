(async () => {
  const output = document.getElementById('results');let checks = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label);checks++; };
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');frame.style.cssText='width:375px;height:812px;border:0';
    let loaded = new Promise(resolve => frame.onload = resolve);
    frame.src='../index.html';document.body.append(frame);await loaded;
    const run = code => frame.contentWindow.eval(code);
    const tick = () => new Promise(resolve => setTimeout(resolve, 50));
    const amount = value => run(`openMemoPicker(2);selectedMemoValue='${value}';confirmMemoPicker.click()`);
    const setup = page => {
      run(`adjustmentLock=null;memoPicker.hidden=true;activeMemoIndex=null;learning.reset([]);
        dotSets.splice(0);selectedAdjustmentTarget=null;adjustmentForecast=null;forecastDisplayCache.clear();
        showChartPage(${page});guideCandidateIndex=0;guideCandidateIndices.fill(0);
        adjustmentSelections.forEach(values=>values.fill(''));memoValues.fill('');
        pitchAutoMode=true;trimAutoMode=true;applyChartRotation(0,0);
        const dot=(x,y,color)=>({clock:'12:00',angle:Math.atan2(x-397,520-y)*180/Math.PI,
          radius:Math.hypot(x-397,y-520)/240,color});
        dotSets.push({learningId:newLearningId(),red:dot(557,660,'red'),blue:dot(567,710,'blue'),
          adjustments:[['1','LINK','1/4','UP']]},
          {learningId:newLearningId(),red:dot(517,620,'red'),blue:dot(527,670,'blue'),adjustments:[]});
        saveDotSets();updateMemoButtons();setGuidesVisible(true);renderDots();forecastDetails.open=false;`);
      amount(page ? '2' : '1/2');
      for(let i=0;i<3 && !run('adjustmentForecast?.points.length');i++)run('guideCandidateToggle.click()');
    };
    const visible = label => {
      assert(run(`['forecastStatus','hovForecastResult','cruiseForecastResult'].every(id=>{
        const node=document.getElementById(id);return node.getClientRects().length && !node.closest('details');
      })`), label + ': status and both forecast results always outside disclosure');
      assert(run(`document.getElementById('forecastCaution').closest('details')===forecastDetails
        && forecastDetails.querySelector('summary').textContent.includes('予測について')
        && forecastCaution.textContent.includes('実測精度は未検証')`), label + ': complete caution remains in disclosure');
      assert(run(`['red','blue'].every(color=>{
        const point=adjustmentForecast?.points.find(point=>point.color===color);
        const text=document.getElementById(color==='red'?'hovForecastResult':'cruiseForecastResult').textContent;
        return !point || text.includes((Math.hypot(point.x-CHART_CENTER_X,point.y-CHART_CENTER_Y)/CHART_RADIUS).toFixed(2)+' IPS');
      })`), label + ': displayed IPS uses existing forecast endpoints');
    };
    visible('empty startup');
    for (const page of [0,1]) {
      const type=page?'TAB':'LINK';setup(page);visible(type);
      assert(run('!forecastDetails.open && !forecastCaution.checkVisibility()'), type + ': initial caution closed');
      for (const width of [320,375,390,1000]) {
        frame.style.width=width+'px';await tick();
        for (const value of page?['1','2','3']:['1/8','1/4','1/3','1/2','2/3','3/4','1','2','3']) {
          amount(value);
          assert(run(`memoButtons.every((button,index)=>{
            const value=button.querySelector('.memo-value'),number=button.querySelector('.memo-number');
            const rect=value.getBoundingClientRect(),bounds=button.getBoundingClientRect();
            return parseFloat(getComputedStyle(value).fontSize)>parseFloat(getComputedStyle(number).fontSize)
              && rect.left>=bounds.left && rect.right<=bounds.right && getComputedStyle(value).whiteSpace==='nowrap'
              && button.textContent.includes(formatMemoInputValue(memoValues[index],index));
          })`), type + '/' + width + '/' + value + ': small numbering and unbroken larger values');
          assert(run(`(() => {
            const unit=memoButtons[2].querySelector('.memo-unit'),rect=unit.getBoundingClientRect();
            return unit.textContent==='${page?'度':'フラット'}' && rect.width<=memoButtons[2].clientWidth
              && getComputedStyle(unit).whiteSpace==='nowrap';
          })()`), type + '/' + width + '/' + value + ': unit has its own unbroken line');
        }
        run('openMemoPicker(3);selectedMemoValue="DOWN";confirmMemoPicker.click()');
        assert(run(`(() => {
          const value=memoButtons[3].querySelector('.memo-value').getBoundingClientRect();
          const button=memoButtons[3].getBoundingClientRect();
          return value.left>=button.left && value.right<=button.right;
        })()`), type + '/' + width + ': longest direction label fits button');
        run('applySelectedGuideAdjustment()');
        if(width<=390) {
          assert(run(`redInputs.concat(blueInputs).every(input=>input.getBoundingClientRect().height>=44)
            && [...document.querySelectorAll('.dot-set')].every(set=>getComputedStyle(set).paddingLeft==='7px'
              && getComputedStyle(set).paddingRight==='7px')`), width + ': measurement input and horizontal spacing preserved');
          assert(run(`(() => {
            const no=guideCandidateToggle.getBoundingClientRect(),mode=(currentChartPage?trimModeToggle:pitchModeToggle).getBoundingClientRect();
            const guide=guideToggle.getBoundingClientRect(),lock=rotationLock.parentElement.getBoundingClientRect();
            return [no,mode,guide,lock].every(rect=>rect.height>=44 && rect.left>=0 && rect.right<=innerWidth)
              && no.right<mode.left && Math.abs(no.top-mode.top)<1 && guide.right<lock.left
              && Math.abs(guide.width-lock.width)<1 && Math.abs(guide.top-lock.top)<1
              && no.bottom<guide.top && document.documentElement.scrollWidth<=innerWidth;
          })()`), width + ': chart controls align without overlap and retain tap size');
          assert(run(`(() => {
            const chart=chartWrap.getBoundingClientRect(),list=getComputedStyle(dotList);
            const item=getComputedStyle(dotList.children[0]),row=getComputedStyle(dotList.querySelector('.dot-result-row'));
            const adjustment=getComputedStyle(dotList.querySelector('.dot-adjustment-row'));
            return Math.abs(chart.width-document.documentElement.clientWidth)<1 && Math.abs(chart.height-chart.width*297/210)<1
              && list.gap==='8px' && list.padding==='0px 6px' && item.gap==='2px' && item.padding==='0px'
              && item.fontSize==='${width<=360?'13':'14'}px' && row.gap==='3px' && row.padding==='2px 4px'
              && row.whiteSpace==='nowrap' && adjustment.gap==='3px' && adjustment.padding==='0px 4px';
          })()`), width + ': chart geometry preserved and history only compacted vertically ' + run(`JSON.stringify({
            width:innerWidth,chart:[chartWrap.clientWidth,chartWrap.getBoundingClientRect().height],
            list:[getComputedStyle(dotList).gap,getComputedStyle(dotList).padding],
            item:['gap','padding','fontSize'].map(key=>getComputedStyle(dotList.children[0])[key]),
            row:['gap','padding','whiteSpace'].map(key=>getComputedStyle(dotList.querySelector('.dot-result-row'))[key]),
            adjustment:['gap','padding'].map(key=>getComputedStyle(dotList.querySelector('.dot-adjustment-row'))[key])})`));
        }
      }
      frame.style.width='375px';amount(page?'2':'1/2');
      for(const width of [320,375]) {
        frame.style.width=width+'px';await tick();
        run(`window.historyBeforeSpacing=JSON.stringify(dotSets);
          window.historySpacingBaseline=document.createElement('style');
          historySpacingBaseline.textContent='.dot-clock-angle { margin-inline-start:0px; }';
          document.head.append(historySpacingBaseline);
          window.historyRowMetrics=()=>[...dotList.querySelectorAll('.dot-result-row')].map(row=>{
            const bounds=row.getBoundingClientRect(),button=row.querySelector('button'),buttonBounds=button.getBoundingClientRect();
            const css=getComputedStyle(row),buttonCss=getComputedStyle(button);
            return {text:row.textContent,width:bounds.width,height:bounds.height,left:bounds.left,
              font:css.fontSize,lineHeight:css.lineHeight,padding:css.padding,border:css.border,boxShadow:css.boxShadow,
              button:[buttonBounds.width,buttonBounds.height,buttonCss.fontSize,buttonCss.padding]};
          });window.historyBaselineMetrics=JSON.stringify(historyRowMetrics());
          window.historyDeletePlacement=[...dotList.querySelectorAll('.dot-result-row')].map(row=>{
            const bounds=row.getBoundingClientRect(),button=row.querySelector('button').getBoundingClientRect();
            return {left:button.left,visible:button.right<=bounds.right,
              overflowing:button.right>bounds.right-parseFloat(getComputedStyle(row).paddingRight)};
          });historySpacingBaseline.remove();`);
        assert(run('JSON.stringify(historyRowMetrics())===historyBaselineMetrics'), type+'/'+width+': spacing preserves row layout, height, text, frame, font and delete buttons '
          +run('JSON.stringify({before:JSON.parse(historyBaselineMetrics),after:historyRowMetrics()})'));
        assert(run(`[...dotList.querySelectorAll('.dot-result-row')].every((row,index)=>{
          const before=historyDeletePlacement[index];
          const button=row.querySelector('button').getBoundingClientRect(),bounds=row.getBoundingClientRect();
          return (before.overflowing || button.left===before.left) && (!before.visible || button.right<=bounds.right);
        })`), type+'/'+width+': fitting rows keep delete button position; existing overflow remains scrollable');
        assert(run(`dotList.querySelectorAll('.dot-clock-angle').length===dotSets.length*2
          && [...dotList.querySelectorAll('.dot-clock-angle')].every(clock=>getComputedStyle(clock).marginInlineStart==='${width<=360?'1':'3'}px'
            && getComputedStyle(clock).fontSize===getComputedStyle(clock.parentElement).fontSize)`), type+'/'+width+': HOV and Cruise clock spacing fits the screen without changing font size');
        assert(run('JSON.stringify(dotSets)===historyBeforeSpacing'), type+'/'+width+': spacing does not modify measurement data');
        assert(run(`(() => {
          const metrics=()=>[...dotList.querySelectorAll('.dot-result-row,.dot-adjustment-row')].map(row=>{
            const rect=row.getBoundingClientRect(),css=getComputedStyle(row),button=row.querySelector('button');
            return {height:rect.height,result:row.classList.contains('dot-result-row'),
              stable:JSON.stringify([row.textContent,rect.left,rect.width,css.fontSize,css.lineHeight,css.paddingLeft,css.paddingRight,
                css.boxShadow,css.border,css.borderRadius,button.clientWidth,button.clientHeight,
                getComputedStyle(button).fontSize,getComputedStyle(button).padding])};
          });
          const original=document.createElement('style');
          original.textContent='.dot-list {gap:10px} .dot-list li {gap:4px} .dot-result-row {padding-block:4px}';
          document.head.append(original);const before=metrics();original.remove();const after=metrics();
          return after.every((row,index)=>row.stable===before[index].stable
            && Math.abs(before[index].height-row.height-(row.result?4:0))<.1
            && dotList.querySelectorAll('button')[index]?.getBoundingClientRect().height>=44);
        })()`), type+'/'+width+': only result vertical padding and surrounding gaps shrink; adjustment and delete tap heights preserved');
      }
      frame.style.width='375px';
      const before=run('JSON.stringify([dotSets,learning.inspect(),adjustmentForecast,memoValues,guideNumberChoices])');
      run('forecastDetails.open=true;renderAdjustmentForecast()');visible(type + '/expanded');
      assert(run('forecastDetails.open && forecastCaution.checkVisibility()'), type + ': redraw preserves open disclosure');
      assert(run('JSON.stringify([dotSets,learning.inspect(),adjustmentForecast,memoValues,guideNumberChoices])')===before,
        type + ': disclosure and presentation do not alter stored data or calculations');
      run('forecastDetails.open=false;guideToggle.click()');visible(type + '/guides off');
      run('guideToggle.click();adjustmentForm.requestSubmit()');visible(type + '/locked');
      assert(run('memoButtons.every(button=>button.disabled && button.querySelector(".memo-value"))'), type + ': fixed inputs preserve structured labels');
      run(`dotList.children[1].querySelector('.dot-adjustment-row button').click();
        deleteConfirmation.close('delete');deleteConfirmation.dispatchEvent(new Event('close'));`);
      assert(run('!adjustmentLock && !memoButtons[2].disabled'), type + ': deletion still releases fixed state');
      visible(type + '/deletion');
      run('forecastDetails.open=true;balanceFlushState()');
      loaded=new Promise(resolve=>frame.onload=resolve);frame.contentWindow.location.reload();await loaded;
      visible(type + '/reload');assert(run('!forecastDetails.open'), type + ': reload starts with caution closed');
    }
    if(params.has('screenshot')) {
      setup(params.get('page')==='1'?1:0);output.style.display='none';document.body.style.margin='0';
      frame.style.cssText=`position:fixed;inset:0;width:${params.get('width')==='320'?'320':'375'}px;height:812px;border:0`;await tick();
      if(params.get('direction')==='DOWN')run('openMemoPicker(3);selectedMemoValue="DOWN";confirmMemoPicker.click()');
      if(params.get('screenshot')==='history')run(`dotSets[0].red.radius=.14;dotSets[0].red.clock='5:18';
        dotSets[0].blue.radius=.19;dotSets[0].blue.clock='10:22';renderDots();resultsHeading.scrollIntoView({block:'start'})`);
      if(params.get('screenshot')==='controls')run('chartWrap.scrollIntoView({block:"end"})');
      else if(params.get('screenshot')!=='history')run('scrollTo(0,0)');
    }
    output.textContent=`PASS: ${checks} checks — adjustment labels, forecast disclosure, input tap areas, chart controls and compact history with preserved text and delete buttons`;
    document.title='PASS';
  } catch(error) { output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL'; }
})();
