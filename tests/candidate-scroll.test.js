(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const trace = [];
  const shifts = [];
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:375px;height:667px;border:0';
    const loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const tick = () => new Promise(resolve => setTimeout(resolve, 40));
    const metrics = () => run(`(() => {
      const chart=chartWrap.getBoundingClientRect(),button=guideCandidateToggle.getBoundingClientRect();
      return {scroll:scrollY,chart:chart.top,button:button.top,height:adjustmentForm.offsetHeight,
        document:document.documentElement.scrollHeight,focus:document.activeElement.id,
        forecast:document.getElementById('forecastLearningNotice').offsetHeight,
        notice:document.getElementById('forecastSelectionNotice').textContent,
        noticeHeight:document.getElementById('forecastSelectionNotice').offsetHeight};
    })()`);
    for (const width of [320,375,390]) for (const page of [0,1]) for (const mode of ['manual','fallback','learned']) {
      const auto=mode!=='manual';
      frame.style.width=width+'px'; frame.style.height=(width===320?568:667)+'px';
      run(`adjustmentLock=null;adjustmentForecast=null;selectedAdjustmentTarget=null;learning.reset([]);dotSets.splice(0);
        pitchAutoMode=false;trimAutoMode=false;showChartPage(${page});guideCandidateIndex=0;
        applyChartRotation(0,0);memoValues.fill('');adjustmentSelections.forEach(values=>values.fill(''));
        dotSets.push({learningId:newLearningId(),red:{...parseDotInput('2','0','0.5'),color:'red'},
          blue:{...parseDotInput('5','0','0.5'),color:'blue'},adjustments:[]});
        if (${mode==='learned'}) {
          dotSets.splice(0);
          const measuredDot=(x,y,color)=>({color,clock:'12:00',
            radius:Math.hypot(x-397,y-520)/240,angle:Math.atan2(x-397,520-y)*180/Math.PI});
          for (let i=0;i<4;i++) {
            if(i>0) learning.arm(dotSets,dotSets.at(-1).learningId);
            dotSets.push({learningId:newLearningId(),red:measuredDot(597+(3-i)*80,620+(3-i)*46.188,'red'),
              blue:measuredDot(527+(3-i)*46,670+(3-i)*38.6,'blue'),
              adjustments:i<3?[['1','${page?'TAB':'LINK'}','1','UP']]:[]});
            learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
          }
        }
        pitchAutoMode=${auto};trimAutoMode=${auto};setGuidesVisible(true);renderDots();applySelectedGuideAdjustment();`);
      await tick();
      const records=run('JSON.stringify(dotSets)'), learned=run('JSON.stringify(learning.inspect())');
      for (const position of ['bottom','up']) {
        run(`document.getElementById('forecastDetails').open=${position==='up'};
          scrollTo(0,document.documentElement.scrollHeight${position==='up'?'-innerHeight-30':''});
          guideCandidateToggle.focus({preventScroll:true})`);
        await tick();
        for (let i=0;i<9;i++) {
          const before=metrics(),rank=run('guideCandidateIndex');
          run('guideCandidateToggle.click()');await tick();
          const after=metrics();trace.push({width,page,mode,position,rank,before,after});
          assert(run(`guideCandidateIndex===${(rank+1)%3}`),'candidate advances');
          for (const key of ['scroll','chart','button','height','document','focus']) {
            const stable=typeof before[key]==='number'?Math.abs(before[key]-after[key])<1:before[key]===after[key];
            const compactDelta=Math.abs(before.height-after.height);
            if (!stable && (typeof before[key]!=='number' || compactDelta<1
              || Math.abs(before[key]-after[key])>compactDelta+1)) shifts.push({width,page,mode,position,i,key,before,after});
            checks++;
          }
          assert(run('guideCandidateToggle.textContent.endsWith(String(guideNumberChoices[guideCandidateIndex].blade))'), 'button shows selected No');
          assert(run(`JSON.stringify(dotSets)===${JSON.stringify(records)} && JSON.stringify(learning.inspect())===${JSON.stringify(learned)}`), 'records and learning preserved');
          assert(run(`guideNumberChoices[guideCandidateIndex].candidate
            ? Object.keys(forecastGuides).length>0 && adjustmentForecast.values.every((v,i)=>v===memoValues[i])
            : !dotOverlay.querySelector('.forecast-body')`), 'selected guides and forecast update');
        }
      }
    }
    // Outside the picker, missing predictions and hidden notices must collapse without blank rows.
    for (const width of [320,375,390,1000]) {
      frame.style.width=width+'px'; await tick();
      run(`showChartPage(0);document.getElementById('forecastDetails').open=false;`);
      const heights=[];
      for (const colors of [[],['red'],['blue'],['red','blue']]) {
        run(`(() => {
          const forecast={type:'LINK',phase:'preview',waiting:[],values:['3','LINK','1','DOWN'],
            points:${JSON.stringify(colors)}.map(color=>({color,x:397,y:472,savedValues:['3','LINK','1','DOWN']}))};
          renderForecastInformation({forecast,target:{red:{radius:.5},blue:{radius:.5}}},'reference');
        })()`);
        heights.push(run('adjustmentForm.offsetHeight'));
        assert(run(`(() => {
          const columns=[...document.querySelectorAll('.forecast-result')],boxes=columns.map(n=>n.getBoundingClientRect());
          return Math.abs(boxes[0].width-boxes[1].width)<1 && columns.every((node,i)=>
            [...node.children].filter(child=>!child.hidden).every(child=>{
              const r=child.getBoundingClientRect();return Math.abs(r.left+r.width/2-boxes[i].left-boxes[i].width/2)<1;
            }));
        })()`),'equal forecast columns remain centered');
        assert(run(`(() => {const note=document.getElementById('forecastSelectionNotice');
          return note.hidden ? note.offsetHeight===0 : getComputedStyle(note).minHeight==='0px'
            && Math.abs(note.offsetHeight-[...note.children].reduce((height,row)=>height+row.offsetHeight,0))<=1;
        })()`),'only visible notice text occupies space');
        assert(run(`(() => {
          const info=forecastLearningNotice.getBoundingClientRect(),results=document.querySelector('.forecast-results').getBoundingClientRect();
          return forecastSelectionNotice.hidden ? Math.abs(info.bottom-results.bottom)<1
            : info.bottom-forecastSelectionNotice.getBoundingClientRect().bottom<=2;
        })()`),'forecast area ends immediately after visible content');
      }
      assert(heights[0]<Math.min(heights[1],heights[2]) && Math.max(heights[1],heights[2])<heights[3],
        'missing and shorter forecast notices use only the height they need');
    }
    assert(!shifts.length,JSON.stringify(shifts.slice(0,3),null,2));
    output.textContent=`PASS: ${checks} checks`;document.title='PASS';frame.remove();
  } catch(error) {output.textContent=`FAIL after ${checks} checks\n${error.stack}\n${JSON.stringify(trace.slice(-3),null,2)}`;document.title='FAIL';}
})();
