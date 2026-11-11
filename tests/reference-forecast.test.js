(async()=>{
  const output=document.getElementById('results');let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  try{
    if(new URLSearchParams(location.search).get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');const loaded=new Promise(resolve=>frame.onload=resolve);
    frame.src='../index.html';document.body.append(frame);await loaded;const run=code=>frame.contentWindow.eval(code);
    const before=run('JSON.stringify([learning.inspect(),dotSets])');let fallbacks=0;
    for(const type of ['LINK','TAB'])for(const blade of [1,2,3])for(const direction of ['UP','DOWN'])
      for(const color of ['red','blue'])for(const amount of type==='LINK'?[.125,.25,.5]:[1,2,3]){
        const args=JSON.stringify([{type,blade,direction,amount},color]);
        const old=run(`BalanceDistancePrior.resolve(...${args},null)`),estimate=run(`resolveDisplayDistance(...${args},null)`);
        assert(Number.isFinite(estimate?.distance),`${type}/${blade}/${direction}/${color}/${amount}: available distance`);
        if(old)assert(JSON.stringify(estimate)===JSON.stringify(old),'existing learned/reference result preserved exactly');
        else{
          fallbacks++;
          assert(estimate.source==='reference-coefficient'&&estimate.referenceConditions.length>0,'fallback identified with provenance');
          const rates=run(`BalanceDistancePrior.samples.filter(s=>s.type==='${type}'&&s.color==='${color}'&&s.blade===${blade}).map(s=>s.distance/s.amount).sort((a,b)=>a-b)`);
          const mid=Math.floor(rates.length/2),coefficient=rates.length%2?rates[mid]:(rates[mid-1]+rates[mid])/2;
          assert(Math.abs(estimate.distance-coefficient*amount*240)<1e-9,'median distance per amount independently reproduced');
        }
        assert(run(`resolveDisplayDistance(...${args},{distance:17}).distance===17`),'existing learned distance wins');
      }
    assert(fallbacks===6,'only missing LINK No.1/3 DOWN Cruise cases use new fallback');
    assert(run(`resolveDisplayDistance({type:'LINK',blade:9,direction:'DOWN',amount:.25},'blue',null)===null`),'no eligible same-No coefficient means unavailable');
    assert(run('JSON.stringify([learning.inspect(),dotSets])')===before,'coefficients never create measured or learned records');
    run(`learning.reset([]);dotSets.splice(0);confirmedCarry=null;adjustmentSequence=null;adjustmentLock=null;
      pitchAutoMode=false;trimAutoMode=false;showChartPage(0);applyChartRotation(0,0);
      dotSets.push({learningId:newLearningId(),red:{...parseDotInput('2','0','.5'),color:'red'},blue:{...parseDotInput('1','0','.5'),color:'blue'},adjustments:[]});renderDots();setGuidesVisible(true)`);
    const order=run('JSON.stringify(guideNumberChoices.map(c=>[c.blade,c.candidate?.direction]))');
    for(const type of ['LINK','TAB'])for(const blade of [1,2,3])for(const direction of ['UP','DOWN']){
      run(`currentChartPage=${type==='LINK'?0:1};memoValues.splice(0,4,'${blade}','${type}','${type==='LINK'?'1/4':'1'}','${direction}');
        forecastGuides={};for(const color of ['red','blue']){
          const line=getDirectionLine(dotSets.at(-1)[color],color,null,${blade},'${direction}');
          forecastGuides[color]={targetId:dotSets.at(-1).learningId,type:'${type}',blade:${blade},direction:'${direction}',unit:getGuideMovementUnit(line)};
        }updateAdjustmentForecast(memoValues,false,false,false)`);
      assert(run('adjustmentForecast.points.length===2'),'all No/directions calculate both endpoints');
      assert(run(`adjustmentForecast.points.every(p=>{const origin=getDotCoordinates(getAdjustmentStartSet()[p.color]),unit=forecastGuides[p.color].unit;
        return Math.hypot(p.x-origin.x-unit.x*p.distance,p.y-origin.y-unit.y*p.distance)<1e-8;})`),'endpoint follows existing guide direction and amount');
    }
    assert(run('JSON.stringify(guideNumberChoices.map(c=>[c.blade,c.candidate?.direction]))')===order,'display-only fallback leaves selection priority unchanged');
    output.textContent=`PASS: ${checks} checks — all Nos/directions/colors/amounts, unchanged eligible estimates, coefficient provenance, no fabricated missing coefficient, guide endpoints and unchanged ranking/learning`;
    document.title='PASS';frame.remove();
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
