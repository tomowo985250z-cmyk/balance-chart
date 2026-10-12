(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  const equal = (actual, expected, label) => assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${label}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('isolated') !== '1') throw Error('Use isolated profile');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:375px;height:1200px;border:0';
    let loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    const tick = () => new Promise(resolve => setTimeout(resolve, 50));
    const read = color => run(`(() => {
      const node=document.getElementById('${color === 'red' ? 'hov' : 'cruise'}ForecastResult');
      const arrow=node.querySelector('.forecast-trend-arrow'),value=node.querySelector('.forecast-value');
      return {trend:node.dataset.trend,change:node.querySelector('.forecast-change').textContent,
        arrow:arrow.textContent,arrowHidden:arrow.hidden,value:value.textContent,valueHidden:value.hidden,
        limit:node.querySelector('.forecast-limit').textContent};
    })()`);
    const snapshot = () => run(`JSON.stringify({dots:dotSets,learning:learning.inspect(),forecast:adjustmentForecast,
      cache:[...forecastDisplayCache],memo:memoValues,choices:guideNumberChoices,
      rotations:[hovAngle,cruiseAngle,manualPitchAngles],records:JSON.parse(appStorage.exportText()).records})`);
    const expect = (color, trend, arrow, change, value, limit, label) => equal(read(color),
      {trend,change,arrow,arrowHidden:trend==='none',value,valueHidden:trend==='none',limit}, label);
    expect('red','none','','予測なし','','','empty HOV has no arrow or IPS');
    expect('blue','none','','予測なし','','','empty Cruise has no arrow or IPS');
    for (const page of [0,1]) {
      run(`showChartPage(${page})`); await tick();
      const before = snapshot();
      // Explicit display inputs isolate the current/forecast comparison from engine training.
      // No production prediction, ranking or learning function is replaced.
      const display = (current, endpoints, saved = false) => run(`(() => {
        const target={learningId:'compact-test',red:{radius:${current[0]}},blue:{radius:${current[1]}}};
        const forecast={targetId:target.learningId,type:'${page ? 'TAB' : 'LINK'}',phase:'preview',waiting:[],
          values:['1','${page ? 'TAB' : 'LINK'}','1','UP'],points:${JSON.stringify(endpoints)}.flatMap((radius,i)=>
            radius===null?[]:[{color:i?'blue':'red',x:397,y:520-radius*240,distance:1,source:'learned',
              ${saved ? "savedValues:['1','LINK','1','UP']," : ''}}])};
        renderForecastInformation({forecast,target},'learned');
      })()`);
      display([.5,.1], [.3,.15]);
      expect('red','improved','↓','改善','0.30 IPS','0.2 IPS超','improvement may remain above 0.2');
      expect('blue','worsened','↑','悪化','0.15 IPS','0.2 IPS以内','worsening may remain within 0.2');
      display([.2,.4], [.2,.5]);
      expect('red','unchanged','→','変化なし','0.20 IPS','0.2 IPS以内','equal IPS stays unchanged at threshold');
      expect('blue','worsened','↑','悪化','0.50 IPS','0.2 IPS超','worsening above threshold');
      display([.15,.3], [.1,.3]);
      expect('red','improved','↓','改善','0.10 IPS','0.2 IPS以内','improvement within threshold');
      expect('blue','unchanged','→','変化なし','0.30 IPS','0.2 IPS超','unchanged above threshold');
      display([.1001,.1002], [.1002,.1001]);
      expect('red','worsened','↑','悪化','0.10 IPS','0.2 IPS以内','comparison precedes rounding: worsening');
      expect('blue','improved','↓','改善','0.10 IPS','0.2 IPS以内','comparison precedes rounding: improvement');
      display([0,.2], [0,.200001]);
      expect('red','unchanged','→','変化なし','0.00 IPS','0.2 IPS以内','zero is a valid unchanged prediction');
      expect('blue','worsened','↑','悪化','0.20 IPS','0.2 IPS超','rounded 0.20 can exceed threshold');
      display([.2,.2], [.199999,null]);
      expect('red','improved','↓','改善','0.20 IPS','0.2 IPS以内','rounded 0.20 can improve');
      expect('blue','none','','予測なし','','','missing forecast clears prior arrow and IPS');
      run(`renderForecastInformation({target:{red:null,blue:null},forecast:{type:'${page ? 'TAB' : 'LINK'}',
        phase:'preview',waiting:[],points:[{color:'red',x:397,y:472},{color:'blue',x:397,y:472}]}},'none')`);
      expect('red','none','','予測なし','','','missing current HOV cannot imply improvement');
      expect('blue','none','','予測なし','','','missing current Cruise cannot imply improvement');
      display([.5,.1], [.3,.15], true);
      assert(run('forecastSelectionNotice.textContent.includes("保存済み予測")'), 'existing saved-prediction notice retained');
      assert(run('forecastCaution.textContent.includes("実測精度は未検証") && !forecastDetails.open'), 'existing confidence disclosure retained');
      equal(snapshot(), before, 'display rendering leaves calculations, ranking, learning and stored records unchanged');

      for (const width of [320,375,390,430,1000]) {
        frame.style.width = width+'px'; await tick();
        for (const endpoints of [[.3,.15],[.2,.4],[null,null],[9.99,9.99]]) {
          display([.5,.4], endpoints);
          assert(run(`(() => {
            const container=document.querySelector('.forecast-results'),columns=[...container.children];
            const [left,right]=columns.map(node=>node.getBoundingClientRect());
            return left.right<right.left && Math.abs(left.top-right.top)<1 && right.right<=innerWidth
              && document.documentElement.scrollWidth<=innerWidth
              && columns.every(node=>{const bounds=node.getBoundingClientRect();
                return getComputedStyle(node).borderTopWidth==='0px' && getComputedStyle(node).backgroundColor==='rgba(0, 0, 0, 0)'
                  && [...node.querySelectorAll('span')].filter(child=>!child.hidden).every(child=>{
                    const rect=child.getBoundingClientRect();return rect.left>=bounds.left && rect.right<=bounds.right+.1
                      && child.scrollWidth<=child.clientWidth+1;
                  });});
          })()`), `${page}/${width}: two columns, no added frames, wrapping or overlap`);
        }
        assert(run(`(() => {
          const node=document.getElementById('hovForecastResult'),label=node.querySelector('.forecast-label'),
            trend=node.querySelector('.forecast-trend'),value=node.querySelector('.forecast-value');
          return parseFloat(getComputedStyle(label).fontSize)>13
            && label.getBoundingClientRect().bottom<=trend.getBoundingClientRect().top
            && trend.getBoundingClientRect().bottom<=value.getBoundingClientRect().top;
        })()`), `${page}/${width}: larger label above trend and IPS`);
      }
      display([.5,.1],[.3,.15]);
      equal(run(`['hovForecastResult','cruiseForecastResult'].map(id=>getComputedStyle(document.querySelector('#'+id+' .forecast-label')).color)`),
        ['rgb(189, 52, 52)','rgb(36, 95, 175)'], 'HOV red and Cruise blue identifiers on both pages');
      equal(run(`['hovForecastResult','cruiseForecastResult'].map(id=>getComputedStyle(document.querySelector('#'+id+' .forecast-trend')).color)`),
        ['rgb(47, 118, 80)','rgb(166, 93, 93)'], 'green improvement and muted red worsening');
    }
    // Real form, selected candidate and reload keep the confidence badge and generated IPS.
    frame.style.width='375px';
    run(`showChartPage(0);pitchAutoMode=false;trimAutoMode=false;
      redInputs.forEach((input,i)=>input.value=['2','0','0.5'][i]);
      blueInputs.forEach((input,i)=>input.value=['5','0','0.4'][i]);dotForm.requestSubmit();setGuidesVisible(true);
      openMemoPicker(2);selectedMemoValue='1/4';confirmMemoPicker.click();balanceFlushState()`);
    const realForecast = run('JSON.stringify(adjustmentForecast)');
    const realDisplay = [read('red'),read('blue')];
    const badge = run('forecastStatus.outerHTML');
    loaded = new Promise(resolve => frame.onload = resolve);frame.contentWindow.location.reload();await loaded;await tick();
    equal(run('JSON.stringify(adjustmentForecast)'),realForecast,'reload preserves generated forecast');
    equal([read('red'),read('blue')],realDisplay,'reload restores compact forecast display');
    equal(run('forecastStatus.outerHTML'),badge,'existing confidence badge preserved');
    output.textContent=`PASS: ${checks} checks`;document.title='PASS';
    if(params.has('screenshot')) {
      document.body.style.margin='0';output.hidden=true;frame.style.height='820px';
      run('document.getElementById("adjustmentForm").scrollIntoView()');
    } else frame.remove();
  } catch(error) {output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
