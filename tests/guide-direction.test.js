(async () => {
  const output=document.getElementById('results');
  let checks=0;
  const traces=[];
  const assert=(ok,label)=>{if(!ok) throw Error(label); checks++;};
  try {
    if(new URLSearchParams(location.search).get('isolated')!=='1') throw Error('Use an isolated browser profile');
    const frame=document.createElement('iframe'); frame.style.cssText='width:1000px;height:1800px';
    const loaded=new Promise(resolve=>frame.onload=resolve);
    frame.src='../index.html'; document.body.append(frame); await loaded;
    const run=code=>frame.contentWindow.eval(code);
    for(const mode of ['manual','waiting','learned']) for(const page of [0,1]) {
      run(`pitchAutoMode=false;trimAutoMode=false;showChartPage(${page});
        learning.reset([]);dotSets.splice(0);adjustmentForecast=null;forecastDisplayCache.clear();
        const makeDot=(x,y,color)=>({color,clock:'12:00',radius:Math.hypot(x-397,y-520)/240,angle:Math.atan2(x-397,520-y)*180/Math.PI});
        if('${mode}'==='learned') for(let i=0;i<4;i++) {
          if(i) learning.arm(dotSets,dotSets.at(-1).learningId);
          dotSets.push({learningId:newLearningId(),red:makeDot(597+(3-i)*80,620+(3-i)*46.188,'red'),
            blue:makeDot(527+(3-i)*46,670+(3-i)*38.6,'blue'),adjustments:i<3?[['1','${page?'TAB':'LINK'}','1','UP']]:[]});
          learning.acceptMeasurement(dotSets,dotSets.at(-1).learningId);
        }
        renderDots();
        dotSets.push({learningId:newLearningId(),adjustments:[]});
        pitchAutoMode='${mode}'!=='manual';trimAutoMode=pitchAutoMode;setGuidesVisible(true);`);
      const learningBefore=run('JSON.stringify(learning.inspect())');
      const predictionBefore=run(`JSON.stringify(['red','blue'].flatMap(color=>[1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>learning.predict('${page?'TAB':'LINK'}',color,blade,direction,1,{x:500,y:600})))))`);
      for(const radius of [0.5,1,1.8,3.2]) for(const angle of [0,90,145,180,270]) for(const rotation of [0,-37,82]) {
        run(`applyChartRotation(${rotation},${rotation});
          dotSets.at(-1).red={color:'red',clock:'4:50',radius:${radius},angle:${angle}};
          dotSets.at(-1).blue={color:'blue',clock:'4:50',radius:${radius},angle:${angle}};`);
        // Every nominal UP/DOWN ray, including outward rays with both circle intersections behind the dot.
        assert(run(`['red','blue'].every(color=>[1,2,3].every(blade=>['UP','DOWN'].every(direction=>{
          const line=getDirectionLine(dotSets.at(-1)[color],color,null,blade,direction);
          const end=line.displayEnd, dx=end.x-line.base.x,dy=end.y-line.base.y;
          return dx*line.unit.x+dy*line.unit.y>0 && Math.abs(dx*line.unit.y-dy*line.unit.x)<1e-6;
        })))`), 'no reversed circle intersection '+JSON.stringify({mode,page,radius,angle,rotation}));
        for(const rank of [0,1,2]) {
          run(`while(guideCandidateIndex!==${rank} && !guideCandidateToggle.disabled) guideCandidateToggle.click();renderDirectionLines();`);
          const label=JSON.stringify({mode,page,radius,angle,rotation,rank});
          assert(run(`[...dotOverlay.querySelectorAll('.guide-direction-line')].every(node=>{
            const color=node.getAttribute('marker-end').includes('red')?'red':'blue';
            const unit=forecastGuides[color].unit;
            const dx=node.x2.baseVal.value-node.x1.baseVal.value,dy=node.y2.baseVal.value-node.y1.baseVal.value;
            // SVGAnimatedLengthのfloat丸めを座標単位で許容する（短い3位候補も対象）。
            return dx*unit.x+dy*unit.y>0 && Math.abs(dx*unit.y-dy*unit.x)<1e-4;
          })`), 'DOM shares movement direction '+label);
          assert(run(`guidePredictionDebug.fallback
            ? dotOverlay.querySelectorAll('.guide-direction-line').length===${page?1:2}
            : Boolean(guidePredictionDebug.selected)===Boolean(dotOverlay.querySelector('.guide-direction-line'))`), 'selected candidates rendered '+label);
          if(mode==='learned' && page===0 && run('!guidePredictionDebug.fallback')) assert(run(`guidePredictionDebug.candidates.every(candidate=>{
            const p=candidate.predictions[0],dx=p.position.x-p.start.x,dy=p.position.y-p.start.y,l=Math.hypot(dx,dy);
            const x=p.start.x-397,y=p.start.y-520,t=Math.max(0,-(x*dx+y*dy)/l);
            const expected=Math.hypot(x+t*dx/l,y+t*dy/l)/240;
            return Math.abs(expected-candidate.hovPathDistance)<1e-8;
          })`), 'learned candidate evaluates actual prediction ray '+label);
          if(mode==='learned' && page===0 && rank===0 && run('!guidePredictionDebug.fallback')) {
            assert(run(`(()=>{
              const {candidates,selected}=guidePredictionDebug;
              const inward=candidates.filter(candidate=>candidate.towardCenter);
              const pool=inward.length?inward:candidates;
              return selected && (!inward.length || selected.towardCenter)
                && pool.every(candidate=>selected.maxCenterDistance<=candidate.maxCenterDistance+1e-9);
            })()`), 'learned automatic priority uses direction then endpoint distance '+label);
          }
          if(radius===1.8 && angle===145 && rotation===-37) traces.push({mode,page,rank,guides:run('JSON.parse(JSON.stringify(forecastGuides))')});
        }
      }
      assert(run('JSON.stringify(learning.inspect())')===learningBefore,'learning unchanged '+mode+'/'+page);
      if(mode==='learned') assert(run(`learning.inspect().samples.length>=3 && getLearnedRotation('${page?'TAB':'LINK'}','${page?'blue':'red'}')!==null`), 'real learned model ready '+page);
      assert(run(`JSON.stringify(['red','blue'].flatMap(color=>[1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>learning.predict('${page?'TAB':'LINK'}',color,blade,direction,1,{x:500,y:600})))))`)===predictionBefore,'same-condition predictions unchanged '+mode+'/'+page);
    }
    // 実入力からHOV単独の重点条件も確認する。画像に近い回転角と初期角度の両方を使う。
    for(const rotation of [0,-37]) {
      run(`pitchAutoMode=false;trimAutoMode=false;showChartPage(0);learning.reset([]);dotSets.splice(0);
        adjustmentForecast=null; applyChartRotation(${rotation},0);
        redInputs.forEach((input,i)=>input.value=['4','50','1.80'][i]);blueInputs.forEach(input=>input.value='');
        dotForm.requestSubmit();pitchAutoMode=true;setGuidesVisible(true);`);
      for(const rank of [0,1,2]) {
        run(`while(guideCandidateIndex!==${rank} && !guideCandidateToggle.disabled) guideCandidateToggle.click();`);
        assert(run(`(()=>{const p=getDotCoordinates(dotSets.at(-1).red),u=forecastGuides.red?.unit;
          return u && (397-p.x)*u.x+(520-p.y)*u.y>0;})()`), 'HOV 1.80 / 4:50 approaches center on guide '+(rank+1));
        traces.push({hovOnly:true,rotation,rank,guides:run('JSON.parse(JSON.stringify(forecastGuides))')});
      }
    }
    output.textContent=`PASS: ${checks} checks\n${JSON.stringify(traces)}`;document.title='PASS';
    if(new URLSearchParams(location.search).has('screenshot')) {
      run('guideCandidateToggle.click()'); frame.style.cssText='width:375px;height:750px';
      run('chartWrap.scrollIntoView()');frame.scrollIntoView();
    }
  } catch(error) {output.textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
