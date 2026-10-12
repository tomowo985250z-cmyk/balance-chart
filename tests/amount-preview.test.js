(async () => {
  const output=document.getElementById('results');let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  try {
    const params=new URLSearchParams(location.search);
    if(params.get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');frame.style.cssText='width:320px;height:568px;border:0';
    const loaded=new Promise(resolve=>frame.onload=resolve);
    frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code);
    const tick=()=>new Promise(resolve=>setTimeout(resolve,100));
    const setup=(page,learned)=>run(`
      adjustmentLock=null;memoPicker.hidden=true;activeMemoIndex=null;selectedAdjustmentTarget=null;
      learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
      adjustmentSelections.forEach(values=>values.fill(''));memoValues.fill('');
      guideCandidateIndices.fill(0);showChartPage(${page});guideCandidateIndex=0;
      pitchAutoMode=true;trimAutoMode=true;applyChartRotation(0,0);
      const dot=(x,y,color)=>({clock:'12:00',angle:Math.atan2(x-397,520-y)*180/Math.PI,
        radius:Math.hypot(x-397,y-520)/240,color});
      for(let i=0;i<${learned?4:2};i++) {
        if(i)learning.arm(dotSets,dotSets.at(-1).learningId);
        dotSets.push({learningId:newLearningId(),red:dot(517+(3-i)*80,620+(3-i)*46.188,'red'),
          blue:dot(527+(3-i)*46,670+(3-i)*38.6,'blue'),
          adjustments:i<${learned?3:1}?[['1','${page?'TAB':'LINK'}','1','UP']]:[]});
        if(${learned})learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
      }
      saveDotSets();updateMemoButtons();setGuidesVisible(true);renderDots();applySelectedGuideAdjustment();
    `);
    const stable=()=>run(`JSON.stringify([dotSets,learning.inspect(),memoValues,adjustmentSelections,
      guideNumberChoices,guideCandidateIndex,forecastGuides,
      BalanceState.keys.filter(key=>key!==ROTATION_STORAGE_KEY).map(key=>appStorage.getItem(key))])`);
    const visible=label=>assert(run(`(() => {
      const results=document.querySelector('.forecast-results').getBoundingClientRect();
      const panel=memoPicker.querySelector('.time-picker-panel').getBoundingClientRect();
      const wheel=memoWheel.getBoundingClientRect();
      return !memoPicker.hidden && results.top>=0 && results.bottom+8<=panel.top
        && panel.left>=0 && panel.right<=innerWidth && panel.bottom<=innerHeight
        && wheel.height>=(innerHeight<=500?138:184) && [...memoWheel.children].every(node=>node.getBoundingClientRect().height>=44)
        && [closeMemoPicker,confirmMemoPicker].every(node=>node.getBoundingClientRect().height>=44)
        && getComputedStyle(memoPicker).backgroundColor==='rgba(0, 0, 0, 0)'
        && document.documentElement.scrollWidth<=innerWidth;
    })()`),label+': two forecast columns remain above usable picker without overlap or overflow '+run(`JSON.stringify({
      results:document.querySelector('.forecast-results').getBoundingClientRect(),
      panel:memoPicker.querySelector('.time-picker-panel').getBoundingClientRect(),wheel:memoWheel.getBoundingClientRect(),
      buttons:[closeMemoPicker,confirmMemoPicker].map(node=>node.getBoundingClientRect()),
      background:getComputedStyle(memoPicker).backgroundColor,viewport:[innerWidth,innerHeight],
      scrollWidth:document.documentElement.scrollWidth,scrollY})`));
    const matches=label=>assert(run(`['red','blue'].every(color=>{
      const point=adjustmentForecast.points.find(point=>point.color===color);
      const result=document.getElementById(color==='red'?'hovForecastResult':'cruiseForecastResult');
      if(!point)return result.dataset.trend==='none';
      const ips=Math.hypot(point.x-CHART_CENTER_X,point.y-CHART_CENTER_Y)/CHART_RADIUS;
      const current=dotSets.at(-1)[color].radius;
      return result.querySelector('.forecast-value').textContent===ips.toFixed(2)+' IPS'
        && result.dataset.trend===(ips<current?'improved':ips>current?'worsened':'unchanged');
    })`),label+': IPS and improvement/worsening match existing calculated endpoints');
    for(const page of [0,1])for(const learned of [false,true])for(const [width,height] of [[320,440],[320,568],[375,667],[390,844],[1000,800]]) {
      frame.style.width=width+'px';frame.style.height=height+'px';setup(page,learned);await tick();
      const label=`${page?'TAB':'LINK'}/${learned?'learned':'reference'}/${width}x${height}`;
      const before=stable(),forecast=run('JSON.stringify(adjustmentForecast)'),scroll=run('scrollY');
      run('memoThree.click()');await tick();visible(label);matches(label);
      const values=page?['1','2','3']:['1/8','1/2','3'];
      const displays=[];
      for(const value of values) {
        // Headless virtual time does not dispatch compositor scroll events; use the real geometry and event handler.
        run(`centerMemoOption([...memoWheel.children].find(node=>node.dataset.value==='${value}'),'instant');
          memoWheel.dispatchEvent(new Event('scroll'))`);
        await tick();
        assert(run(`selectedMemoValue==='${value}' && adjustmentForecast.values[2]==='${value}'
          && memoWheel.querySelector('[aria-selected="true"]').dataset.value==='${value}'`),label+'/'+value+': actual wheel scroll updates preview '+run(`JSON.stringify({
            selected:selectedMemoValue,forecast:adjustmentForecast?.values,aria:memoWheel.querySelector('[aria-selected="true"]')?.dataset.value,
            scroll:memoWheel.scrollTop,wheel:memoWheel.getBoundingClientRect(),options:[...memoWheel.children].map(node=>[node.dataset.value,node.getBoundingClientRect().top])})`));
        visible(label);matches(label);displays.push(run('cruiseForecastResult.textContent'));
        assert(stable()===before,label+': preview preserves committed selection, ranking, learning and records');
      }
      assert(new Set(displays).size>1,label+': amount changes produce different forecasts while picker is open');
      run(`memoWheel.querySelector('[data-value="${values[1]}"]').click()`);
      assert(run(`selectedMemoValue==='${values[1]}' && adjustmentForecast.values[2]==='${values[1]}'`),label+': tapping updates forecast immediately');
      matches(label);
      run('closeMemoPicker.click()');await tick();
      assert(stable()===before && run('JSON.stringify(adjustmentForecast)')===forecast,label+': cancel restores original forecast without committing amount');
      assert(Math.abs(run('scrollY')-scroll)<1,label+': close restores original page position');
      run(`memoThree.click();memoWheel.querySelector('[data-value="${values[1]}"]').click();confirmMemoPicker.click()`);await tick();
      assert(run(`memoPicker.hidden && memoValues[2]==='${values[1]}'
        && adjustmentSelections.slice(currentChartPage*3,currentChartPage*3+3).every(values=>values[2]==='${values[1]}')`),label+': confirm retains existing shared-amount behavior');
      run('openMemoPicker(3)');await tick();
      assert(run('!memoPicker.classList.contains("memo-amount-picker") && memoWheel.parentElement.getBoundingClientRect().height===240'),label+': other pickers retain their existing height and backdrop');
      run('closeMemoPicker.click()');
    }
    if(params.has('screenshot')) {
      const width=params.get('width')==='375'?375:320;
      frame.style.cssText=`position:fixed;inset:0;width:${width}px;height:${params.get('height')==='440'?440:width===320?568:667}px;border:0`;
      document.body.style.margin='0';output.hidden=true;setup(params.get('page')==='1'?1:0,true);await tick();
      run('memoThree.click()');await tick();
    } else frame.remove();
    output.textContent=`PASS: ${checks} checks — live amount preview, real scroll/tap, iPhone SE visibility, cancel/confirm and unchanged ranking/learning/storage`;
    document.title='PASS';
  } catch(error) {output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
