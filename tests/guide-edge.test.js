(async()=>{
  const output=document.getElementById('results');let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  try{
    if(new URLSearchParams(location.search).get('isolated')!=='1')throw Error('Use isolated profile');
    const frame=document.createElement('iframe');frame.style.cssText='width:1000px;height:1800px';
    const loaded=new Promise(resolve=>frame.onload=resolve);frame.src='../index.html';document.body.append(frame);await loaded;
    const run=code=>frame.contentWindow.eval(code);
    run(`window.edgeBounds={left:10,top:10,right:784,bottom:1113};
      window.edgeLine=(x,y,dx,dy)=>({base:{x,y},start:{x,y},unit:{x:dx,y:dy},end:{x:x+dx*100,y:y+dy*100}});`);
    for(const [args,expected] of [
      [[700,900,1,0],[784,900]],[[700,900,-1,0],[10,900]],
      [[700,900,0,1],[700,1113]],[[700,900,0,-1],[700,10]],
      [[800,900,-1,0],[10,900]]
    ])assert(run(`(()=>{const p=getGuideViewportEnd(edgeLine(${args}),edgeBounds);return Math.abs(p.x-${expected[0]})<1e-8&&Math.abs(p.y-${expected[1]})<1e-8;})()`),'ray ends at viewport boundary '+args);
    for(const args of [[397,520,1,0],[700,520,-1,0],[637,100,0,1],[800,900,1,0]]){
      assert(run(`(()=>{const line=edgeLine(${args});return getGuideViewportEnd(line,edgeBounds)===line.end;})()`),'crossing, tangent or invisible ray unchanged '+args);
    }
    for(const page of [0,1])for(const rank of [0,1]){
      run(`pitchAutoMode=false;trimAutoMode=false;showChartPage(${page});dotSets.splice(0);adjustmentForecast=null;
        dotSets.push({learningId:newLearningId(),adjustments:[],red:{color:'red',clock:'4:50',radius:1.8,angle:145},blue:{color:'blue',clock:'4:50',radius:1.8,angle:145}});
        applyChartRotation(-37,-37);guideCandidateIndex=${rank};setGuidesVisible(true);renderDots();chartWrap.scrollIntoView();`);
      const before=run('JSON.stringify({guides:forecastGuides,debug:guidePredictionDebug,forecast:adjustmentForecast,dots:dotSets,learning:learning.inspect(),storage:{...localStorage}})');
      run(`updateGuideViewportEnds();window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('scroll'));`);
      assert(run('JSON.stringify({guides:forecastGuides,debug:guidePredictionDebug,forecast:adjustmentForecast,dots:dotSets,learning:learning.inspect(),storage:{...localStorage}})')===before,'viewport updates preserve calculation and storage '+page+'/'+rank);
      assert(run(`[...dotOverlay.querySelectorAll('.guide-direction-line')].every(node=>{
        const line=guideDisplayGeometry.get(node),u=getGuideMovementUnit(line);
        const dx=Number(node.getAttribute('x2'))-Number(node.getAttribute('x1')),dy=Number(node.getAttribute('y2'))-Number(node.getAttribute('y1'));
        return dx*u.x+dy*u.y>0 && Math.abs(dx*u.y-dy*u.x)<1e-6;
      })`),'DOM direction retained '+page+'/'+rank);
    }
    output.textContent=`PASS: ${checks} checks`;document.title='PASS';
  }catch(error){output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
