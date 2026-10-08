(async () => {
  const output = document.getElementById('results');
  let checks = 0;
  const comparisons = [];
  const assert = (ok, label) => { if (!ok) throw Error(label); checks++; };
  try {
    if (new URLSearchParams(location.search).get('isolated') !== '1') throw Error('Use an isolated browser profile');
    const frame = document.createElement('iframe');
    const loaded = new Promise(resolve => frame.onload = resolve);
    frame.src = '../index.html'; document.body.append(frame); await loaded;
    const run = code => frame.contentWindow.eval(code);
    run(`learning.reset([]); dotSets.splice(0); adjustmentForecast=null;
      currentChartPage=0; guideCandidateIndex=0; pitchAutoMode=true;
      window.makePriorityDot=(x,y,color)=>({color,clock:'12:00',
        radius:Math.hypot(x,y),angle:Math.atan2(x,-y)*180/Math.PI});
      dotSets.push({learningId:newLearningId(),red:makePriorityDot(.05,.13,'red'),
        blue:makePriorityDot(.12,.64,'blue'),adjustments:[]});
      applyChartRotation(-41,-60);
      window.priorityLearning=JSON.stringify(learning.inspect());
      window.priorityPredictions=JSON.stringify([1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>
        learning.predict('LINK','red',blade,direction,.25,{x:397,y:520}))));
      window.makePriorityCandidate=(blade,direction,amount,redTravel,blueTravel)=>{
        const predictions=['red','blue'].map(color=>{
          const line=getDirectionLine(dotSets.at(-1)[color],color,null,blade,direction);
          const travel=color==='red'?redTravel:blueTravel;
          const position=travel===null?line.end:{x:line.base.x+line.unit.x*travel*240,
            y:line.base.y+line.unit.y*travel*240};
          return {color,start:line.base,position,fallbackLine:travel===null?line:null,
            predictedDistance:Math.hypot(position.x-397,position.y-520)/240};
        });
        return {blade,direction,amount,predictions,
          towardCenter:predictions.every(p=>guideApproachesCenter(getPredictionGuideLine(p))),
          hovPathDistance:getGuidePathDistance(getPredictionGuideLine(predictions[0])),
          cruisePathDistance:getGuidePathDistance(getPredictionGuideLine(predictions[1])),
          maxCenterDistance:Math.max(...predictions.map(p=>p.predictedDistance)),
          distance:predictions.reduce((sum,p)=>sum+p.predictedDistance,0)};
      };
      window.rankPriorityCandidates=(candidates,automatic)=>{
        pitchAutoMode=automatic;
        return [0,1].map(rank=>{const c=selectRankedLinkGuideCandidate(candidates,rank);
          return {blade:c.blade,direction:c.direction,amount:c.amount,max:c.maxCenterDistance,sum:c.distance};});
      };
      // 距離は比較用の仮定値。端末の学習値を再現したものではない。
      window.priorityCandidates=[makePriorityCandidate(1,'UP',.125,.02,null),
        makePriorityCandidate(2,'DOWN',.125,.8,null),makePriorityCandidate(3,'UP',.125,.3,null)];
      window.priorityCandidateSnapshot=JSON.stringify(priorityCandidates);`);
    for (const waiting of [true, false]) {
      if (!waiting) run(`priorityCandidates=[makePriorityCandidate(1,'UP',.125,.02,.01),
        makePriorityCandidate(2,'DOWN',.125,.8,.4),makePriorityCandidate(3,'UP',.125,.3,.64)];
        priorityCandidateSnapshot=JSON.stringify(priorityCandidates);`);
      const oldRanks = run('rankPriorityCandidates(priorityCandidates,false)');
      const newRanks = run('rankPriorityCandidates(priorityCandidates,true)');
      comparisons.push({fixture: waiting ? 'hypothetical/Cruise-waiting' : 'hypothetical/both-predictions',oldRanks,newRanks});
      assert(oldRanks[0].blade === 1 && oldRanks[0].direction === 'UP', 'old HOV threshold prefers 1 UP');
      assert(newRanks[0].blade === 3 && newRanks[0].direction === 'UP', 'direction priority selects 3 LINK UP');
      assert(newRanks[1].blade === 2 && newRanks[1].direction === 'DOWN', 'second inward candidate precedes outward Cruise');
      assert(run('JSON.stringify(priorityCandidates)===priorityCandidateSnapshot'), 'ranking preserves every prediction and distance');
      run(`window.shortPriority=makePriorityCandidate(3,'UP',.0625,.1,${waiting ? 'null' : '.64'});
        window.overshootRanking=rankPriorityCandidates([...priorityCandidates,shortPriority],true);`);
      assert(run('overshootRanking[0].amount===.0625 && overshootRanking[1].amount===.125'), 'endpoint distance penalizes overshoot on the same inward ray');
      if (waiting) assert(run('priorityCandidates.every(c=>Math.abs(c.predictions[1].predictedDistance-1)<1e-9)'), 'Cruise waiting preserves existing circle endpoint calculation');
    }
    run(`window.outwardOnly=priorityCandidates.filter(c=>!c.towardCenter);
      window.outwardSnapshot=JSON.stringify(outwardOnly);`);
    assert(run('selectLinkGuideCandidate(outwardOnly)===outwardOnly[0]'), 'no inward candidate still yields a fallback');
    assert(run('JSON.stringify(outwardOnly)===outwardSnapshot'), 'fallback ranking does not alter inputs');
    // 画像の概算位置・角度を実際の未学習ガイド計算へ渡す。
    for (const automatic of [false,true]) {
      run(`pitchAutoMode=${automatic}; guideCandidateIndex=0; renderDirectionLines();`);
      const guides = run('JSON.parse(JSON.stringify(forecastGuides))');
      comparisons.push({fixture:'image-approximation/unlearned',automatic,guides});
      if (automatic) {
        assert(guides.red.blade===3 && guides.red.direction==='UP' && guides.blue.blade===3 && guides.blue.direction==='UP', 'actual unlearned selection chooses 3 LINK UP for both colors');
        assert(run(`['red','blue'].every(color=>{
          const point=getDotCoordinates(dotSets.at(-1)[color]),unit=forecastGuides[color].unit;
          return (397-point.x)*unit.x+(520-point.y)*unit.y>0;
        })`), 'rendered movement units both approach center');
      }
    }
    assert(run('JSON.stringify(learning.inspect())===priorityLearning'), 'learning state unchanged');
    assert(run(`JSON.stringify([1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>
      learning.predict('LINK','red',blade,direction,.25,{x:397,y:520}))))===priorityPredictions`), 'prediction calculation unchanged');
    output.textContent = 'PASS: ' + checks + ' checks\n' + JSON.stringify(comparisons,null,2);
    document.title = 'PASS';
  } catch(error) {
    output.textContent = 'FAIL after ' + checks + ' checks\n' + error.stack + '\n' + JSON.stringify(comparisons,null,2);
    document.title = 'FAIL';
  }
})();
