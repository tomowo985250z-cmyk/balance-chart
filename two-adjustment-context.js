/* 参考予測の入力・既存計算への接続。実測・学習・選択状態には書き込まない。 */
const BalanceTwoAdjustmentContext = (() => {
  const dot = p => ({ color: p.color, clock: '参考予測', angle: Math.atan2(p.x - CHART_CENTER_X, CHART_CENTER_Y - p.y) * 180 / Math.PI, radius: Math.hypot(p.x - CHART_CENTER_X, p.y - CHART_CENTER_Y) / CHART_RADIUS });
  const toSet = points => Object.fromEntries(['red','blue'].map(color => [color, dot({ ...points[color], color })]));
  function context() {
    const rotations = pageRotations.map((r, page) => page === currentChartPage ? { hovAngle, cruiseAngle } : { ...r });
    if(pitchAutoMode){rotations[0]={...(initialChartRotations[0]??{hovAngle:0,cruiseAngle:0})};
      for(const[c,k]of [['red','hovAngle'],['blue','cruiseAngle']]){const angle=getLearnedRotation('LINK',c)??getLatestLinkSyncAngle(c);if(Number.isFinite(angle))rotations[0][k]=angle;}}
    else if(manualPitchInitialized)rotations[0]={...manualPitchAngles};
    if(trimAutoMode)for(const[c,k]of [['red','hovAngle'],['blue','cruiseAngle']]){const angle=getLearnedRotation('TAB',c)??getLatestTrimSyncAngle(c);
      if(angle!==null&&angle!==lastAutoRotation.TAB[c])rotations[1][k]=angle;}
    // 角度と仮の起点を明示して既存関数を呼ぶ。画面の状態は変更しない。
    const lines = rotations.map(angles => (dot, color, adjustment, blade, direction) =>
      getDirectionLine(dot, color, adjustment, blade, direction, angles));
    const automatic = { LINK: pitchAutoMode, TAB: trimAutoMode }, samples = learning.inspect().samples;
    const ready = { LINK: automatic.LINK && getLearnedRotation('LINK','red') !== null, TAB: automatic.TAB && getLearnedRotation('TAB','blue') !== null };
    const estimates = new Map(), ranks = new Map(), conditions = new Map();
    const shared = { LINK: getSharedAdjustmentAmount(0), TAB: getSharedAdjustmentAmount(1) };
    // 既存の学習ベクトルと移動距離は起点に依存しない。同じ探索中の同条件だけ再利用する。
    function condition(action, color) {
      const key = [action.type, color, action.blade, action.direction, action.amount].join('/');
      if (!conditions.has(key)) {
        const prediction = learning.predict(action.type,color,action.blade,action.direction,action.amount,{x:0,y:0});
        const estimate = resolveDisplayDistance(action,color,prediction,prediction?[]:samples,CHART_RADIUS);
        conditions.set(key,{prediction,estimate});
      }
      return conditions.get(key);
    }
    function maxDistance(type, color, blade, direction) {
      const key = [type,color,blade,direction].join('/');
      if (!estimates.has(key)) estimates.set(key, Math.max(0, ...BalanceLearning.amounts[type].map(text => {
        const action = BalanceLearning.adjustment([String(blade),type,text,direction]);
        return condition(action,color).estimate?.distance ?? 0;
      })));
      return estimates.get(key);
    }
    function predict(points, selected) {
      const { type, blade, direction, amountText } = selected, page = type === 'LINK' ? 0 : 1;
      const action = BalanceLearning.adjustment([String(blade),type,amountText,direction]); if (!action) return null;
      const startSet = toSet(points), output = {}, colors = {}, rays = {};
      for (const color of ['red','blue']) {
        const start = points[color], saved = condition(action,color);
        let prediction = saved.prediction ? { ...saved.prediction,
          position: { x:start.x+saved.prediction.dx, y:start.y+saved.prediction.dy } } : null;
        let estimate = saved.estimate;
        if (prediction && ![prediction.position.x,prediction.position.y].every(Number.isFinite)) {
          prediction = learning.predict(type,color,blade,direction,action.amount,start);
          estimate = resolveDisplayDistance(action,color,prediction,prediction?[]:samples,CHART_RADIUS);
        }
        const usesLearned = ready[type] && (type === 'LINK' || color === 'blue');
        if (usesLearned && !prediction && (type === 'TAB' || color === 'red')) return null;
        const line = usesLearned && prediction ? getPredictionGuideLine({ start, ...prediction }) : lines[page](startSet[color],color,null,blade,direction);
        if (!line || !Number.isFinite(estimate?.distance) || estimate.distance < 0) return null;
        const u = getGuideMovementUnit(line), n = Math.hypot(u.x,u.y); if (!(n > 0)) return null;
        const unit = {x:u.x/n,y:u.y/n}, point = {x:start.x+unit.x*estimate.distance,y:start.y+unit.y*estimate.distance};
        if (![point.x,point.y].every(Number.isFinite)) return null;
        output[color] = point; colors[color] = { start, point, unit, line, distance:estimate.distance, source:estimate.source };
        const x=start.x-CHART_CENTER_X,y=start.y-CHART_CENTER_Y,p=x*unit.x+y*unit.y,disc=p*p-(x*x+y*y-CHART_RADIUS*CHART_RADIUS);
        rays[color] = { start, unit, maxTravel:Math.min(line.maxTravel??(disc<0?0:Math.max(0,-p+Math.sqrt(disc))),maxDistance(type,color,blade,direction)) };
      }
      const intersection = BalanceTwoAdjustment.geometry(rays.red,rays.blue,{x:CHART_CENTER_X,y:CHART_CENTER_Y},CHART_RADIUS);
      const crossGap = intersection.valid ? Math.max(...['red','blue'].map(c=>Math.hypot(output[c].x-intersection.point.x,output[c].y-intersection.point.y)/CHART_RADIUS)) : Infinity;
      return { action:{...selected,amount:action.amount}, start:points, points:output, colors, intersection, crossGap };
    }
    function legacy(points,type) {
      const key=JSON.stringify([points,type]); if(ranks.has(key))return ranks.get(key);
      const page=type==='LINK'?0:1, startSet=toSet(points), all=BalanceTwoAdjustment.actions(type,BalanceLearning.amounts);
      let ranked=[];
      if(type==='TAB') {
        if(ready.TAB) {
          const candidates=all.flatMap(action=>{const step=predict(points,action);if(!step)return[];
            const current=Math.hypot(points.blue.x-CHART_CENTER_X,points.blue.y-CHART_CENTER_Y)/CHART_RADIUS;
            const distance=Math.hypot(step.points.blue.x-CHART_CENTER_X,step.points.blue.y-CHART_CENTER_Y)/CHART_RADIUS;
            return current-distance>1e-6?[{...action,within:distance<=CENTER_DISTANCE_THRESHOLD,distance}]:[];});
          ranked=candidates.sort((a,b)=>Number(b.within)-Number(a.within)||a.distance-b.distance);
        } else ranked=[1,2,3].flatMap(blade=>['UP','DOWN'].map(direction=>({blade,direction,line:lines[1](startSet.blue,'blue',null,blade,direction)})))
          .sort((a,b)=>Number(b.line.centerDistance<=CENTER_DISTANCE_THRESHOLD)-Number(a.line.centerDistance<=CENTER_DISTANCE_THRESHOLD)||a.line.centerDistance-b.line.centerDistance);
      } else {
        const raw=[1,2,3].flatMap(blade=>['UP','DOWN'].flatMap(direction=>{
          const step=predict(points,{type,blade,direction,amountText:shared.LINK}); if(!step)return[];
          const red=step.colors.red.line,blue=step.colors.blue.line;
          if(automatic.LINK)return [{blade,direction,line:red,blue,predictions:['red','blue'].map(color=>({color,start:points[color],position:step.points[color]}))}];
          const d=getGuideDistances(red,blue,getLatestPitchDistanceRatio()??{red:1,blue:2});
          return [{blade,direction,line:red,blue,hovPathDistance:getGuidePathDistance(red),cruisePathDistance:getGuidePathDistance(blue),
            ...d,predictions:[{predictedDistance:d.redDistance},{predictedDistance:d.blueDistance}]}];
        }));
        if(automatic.LINK) {
          ranked=BalanceLinkRanking.rank(getLinkRankingCandidates(raw,startSet,shared.LINK,samples),startSet.red.radius,startSet.blue.radius).ranked;
        } else {
          let pool=[...raw];while(pool.length){const best=selectLinkGuideCandidate(pool,false);if(!best)break;ranked.push(best);pool=pool.filter(r=>r.blade!==best.blade);}
        }
      }
      const unique=[];for(const r of ranked)if(!unique.some(old=>old.blade===r.blade))unique.push(r);
      ranks.set(key,unique);return unique;
    }
    return { predict, legacy, rotations, ready, shared, lines,
      legacyRank(plan) {return plan.optimized.flatMap(stage=>{const rows=legacy(stage.start,stage.action.type),index=rows.findIndex(r=>r.blade===stage.action.blade);
        const row=rows[index];return[index<0?3:index,row?.direction===stage.action.direction?0:1,stage.action.amount];}).concat(plan.order.startsWith(currentChartPage===0?'LINK':'TAB')?0:1);}
    };
  }
  function inputs() {
    const fixed=[0,1].map(page=>getSequenceStage(page)).filter(Boolean).sort((a,b)=>adjustmentSequence.stages.indexOf(a)-adjustmentSequence.stages.indexOf(b));
    const set=carriedStartSet(dotSets.at(-1)), points=s=>Object.fromEntries(['red','blue'].filter(c=>s?.[c]).map(c=>[c,getDotCoordinates(s[c])]));
    let start=points(set),origin=start;
    if(fixed.length){const first=fixed[0],last=fixed.at(-1);origin=Object.fromEntries(Object.entries(first.origins??{}).map(([c,o])=>[c,getDotCoordinates(o.dot)]));
      start=Object.fromEntries(last.forecast.points.map(p=>[p.color,{x:p.x,y:p.y}]));}
    return {start,origin,originSources:set?.originSources??{},fixed:fixed.map(s=>({action:{type:s.values[1],blade:Number(s.values[0]),direction:s.values[3],amountText:s.values[2]},points:Object.fromEntries(s.forecast.points.map(p=>[p.color,{x:p.x,y:p.y}])),fixed:true}))};
  }
  return { create: context, inputs };
})();
