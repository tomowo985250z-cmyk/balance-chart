/* Analysis only. No localStorage/sessionStorage or production imports of this file. */
(() => {
  'use strict';
  const sourceRequest=new XMLHttpRequest();sourceRequest.open('GET','../../learning.js',false);sourceRequest.send();
  const AnalysisLearningSource=sourceRequest.responseText;
  let checks=0;
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks++;};
  const wrap=BalanceLearning.wrap, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  const quantile=(a,q)=>{if(!a.length)return null;const b=[...a].sort((x,y)=>x-y);return b[Math.floor((b.length-1)*q)];};
  const median=a=>{const b=[...a].sort((x,y)=>x-y),i=b.length>>1;return b.length?(b.length%2?b[i]:(b[i-1]+b[i])/2):null;};
  const vector=(distance,angle)=>({dx:distance*Math.cos(angle*Math.PI/180),dy:distance*Math.sin(angle*Math.PI/180),distance,angle:wrap(angle)});
  const norm=p=>Math.hypot(p.x,p.y);
  // Exact nominal angles from the production segment coordinates.
  const nominalExact=(blade,direction)=>{
    const xy=[[-303.1,-175],[0,350],[303.1,-175]][blade-1],s=direction==='UP'?1:-1;
    return Math.atan2(s*xy[1],s*xy[0])*180/Math.PI;
  };
  const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
  const rotations={LINK:{red:20,blue:-35},TAB:{red:10,blue:25}};
  const factories={current:BalanceLearning};
  for(const [name,rate] of [['rate020',.2],['rate035',.35],['rate090',.9]]) {
    const source=AnalysisLearningSource.replace('const RATE = 0.60;',`const RATE = ${rate};`);
    assert(source!==AnalysisLearningSource,'isolated rate source transformed '+name);
    factories[name]=new Function(source+';return BalanceLearning;')();
  }
  const exactCopy=new Function(AnalysisLearningSource+';return BalanceLearning;')();
  function engine(factory=BalanceLearning) {
    const api=factory.create({storage:memory(),coordinates:p=>p,nominalAngle:nominalExact,radius:1});
    const sets=[{learningId:'r0',red:{x:.25,y:.15},blue:{x:.3,y:-.1},adjustments:[]}];
    return {api,sets,
      prepare(action){sets.at(-1).adjustments=[[String(action.blade),action.type,action.amountText,action.direction]];api.sync(sets,rotations);},
      ingest(action,vectors){const before=sets.at(-1);sets.push({learningId:'r'+sets.length,adjustments:[],...Object.fromEntries(['red','blue'].map(c=>[c,{x:before[c].x+vectors[c].dx,y:before[c].y+vectors[c].dy}]))});
        for(const c of api.historicalCandidates(sets).filter(c=>c.afterId===sets.at(-1).learningId))api.confirmHistorical(sets,c);
        api.sync(sets,rotations);},
      predict(action,color,start){return api.predict(action.type,color,action.blade,action.direction,action.amount,start);}};
  }
  function weightedFit(rows,values,rate=.35){
    const center=median(values),mad=median(values.map(v=>Math.abs(v-center))),scale=Math.max(1e-6,mad*1.4826);
    let sum=0,weight=0;
    rows.forEach((r,i)=>{const robust=values.length>=5?Math.min(1,2.5*scale/Math.max(Math.abs(values[i]-center),1e-12)):1;
      const w=rate*(1-rate)**(rows.length-i-1)*robust;sum+=w*values[i];weight+=w;});
    return sum/weight;
  }
  function robustPredict(history,a,color,start,nonlinear=false){
    const parent=history.filter(r=>r.type===a.type&&r.color===color&&r.distance>=.02),detail=parent.filter(r=>r.blade===a.blade&&r.direction===a.direction);
    if(detail.length<2&&parent.length<3)return null;
    const p=parent.slice(-18),d=detail.slice(-12),anchor=p.at(-1).angle-nominalExact(p.at(-1).blade,p.at(-1).direction);
    const angular=rows=>wrap(anchor+weightedFit(rows,rows.map(r=>wrap(r.angle-nominalExact(r.blade,r.direction)-anchor))));
    const logs=rows=>weightedFit(rows,rows.map(r=>Math.log(r.distance/r.amount)));
    const shrink=d.length>=2?d.length/(d.length+4):0;
    const angle=wrap(angular(p)+shrink*wrap((d.length?angular(d):angular(p))-angular(p)));
    let unitLog=logs(p)+shrink*((d.length?logs(d):logs(p))-logs(p)),exponent=1,fitAccepted=false;
    if(nonlinear&&d.length>=8&&new Set(d.map(r=>r.amount)).size>=2) {
      const groups=[...new Set(d.map(r=>r.amount))].map(v=>d.filter(r=>r.amount===v).length);
      if(groups.filter(n=>n>=3).length>=2&&Math.max(...d.map(r=>r.amount))/Math.min(...d.map(r=>r.amount))>=2){
        const fit=rows=>{const x=rows.map(r=>Math.log(r.amount)),y=rows.map(r=>Math.log(r.distance)),mx=mean(x),my=mean(y);
          const xx=x.reduce((s,v)=>s+(v-mx)**2,0),xy=x.reduce((s,v,i)=>s+(v-mx)*(y[i]-my),0);
          const slope=clamp((xy+2)/(xx+2),.5,1.5);return {slope,intercept:my-slope*mx};};
        const inner=[];
        for(let i=6;i<d.length;i++){const prefix=d.slice(0,i);if(new Set(prefix.map(r=>r.amount)).size<2)continue;
          const f=fit(prefix),linear=Math.exp(logs(prefix))*d[i].amount,curve=Math.exp(f.intercept)*d[i].amount**f.slope;
          inner.push({linear:Math.abs(linear-d[i].distance),curve:Math.abs(curve-d[i].distance)});}
        if(inner.length>=3&&mean(inner.map(r=>r.curve))<.8*mean(inner.map(r=>r.linear))){
          const f=fit(d);exponent=f.slope;unitLog=f.intercept;fitAccepted=true;
        }
      }
    }
    const v=vector(Math.exp(unitLog)*a.amount**exponent,nominalExact(a.blade,a.direction)+angle);
    return {...v,position:{x:start.x+v.dx,y:start.y+v.dy},sampleCount:parent.length,fitAccepted,exponent};
  }
  const names=[...Object.keys(factories),'robust','nonlinear'];
  function distanceInventory(){
    const rows=BalanceDistancePrior.samples.map(s=>({...s})),groups=[];
    for(const key of [...new Set(rows.map(s=>[s.type,s.color,s.blade,s.direction,s.amount].join('/')))]){
      const rs=rows.filter(s=>[s.type,s.color,s.blade,s.direction,s.amount].join('/')===key),ds=rs.map(s=>s.distance);
      groups.push({key,n:rs.length,ids:rs.map(s=>s.id),median:median(ds),min:Math.min(...ds),max:Math.max(...ds),range:Math.max(...ds)-Math.min(...ds)});
    }
    const amountContrasts=[];
    for(const key of [...new Set(rows.map(s=>[s.type,s.color,s.blade,s.direction].join('/')))]) {
      const gs=groups.filter(g=>g.key.split('/').slice(0,4).join('/')===key).sort((a,b)=>+a.key.split('/')[4]-b.key.split('/')[4]);
      for(let i=1;i<gs.length;i++){
        const lo=gs[i-1],hi=gs[i],a=+lo.key.split('/')[4],b=+hi.key.split('/')[4];
        amountContrasts.push({key,lowAmount:a,highAmount:b,lowN:lo.n,highN:hi.n,lowDistance:lo.median,highDistance:hi.median,
          observedRatio:hi.median/lo.median,linearRatio:b/a,powerDescriptive:Math.log(hi.median/lo.median)/Math.log(b/a),reversal:hi.median<lo.median});
      }
    }
    const e=rows.filter(r=>r.source==='verified-chart');
    const held=e[1],prior=rows.filter(r=>r.id==='E1');
    assert(e.length===2&&held.id==='E2','only two genuine coordinate vectors');
    const selfSeeded=BalanceDistancePrior.resolve({type:held.type,blade:held.blade,direction:held.direction,amount:held.amount},held.color,null,[],1);
    const availablePrior=prior.filter(r=>r.blade===held.blade&&r.direction===held.direction&&r.amount===held.amount);
    assert(selfSeeded.distance===held.distance,'static prior includes evaluation target: explicit leakage diagnostic');
    return {n:rows.length,uniqueActions:new Set(rows.map(s=>s.id)).size,coordinateVectors:e.length,groups,amountContrasts,
      knownChronology:{sequence:['E1','E2'],comparableFutureVectors:0,reason:'Only one earlier sample; current model not ready; E1/E2 rotor orientation/configuration not documented.',
        availableExactPrior:availablePrior.length,naiveLeakyDistanceError:Math.abs(selfSeeded.distance-held.distance),strictDistanceError:null,strictAngleError:null,strictEndpointError:null},
      coordinateObservations:e.map(r=>({id:r.id,blade:r.blade,direction:r.direction,amount:r.amount,start:r.start,end:r.end,distance:r.distance,screenAngle:r.actualVector.angle})),
      unverifiedChronologyIds:rows.filter(r=>r.source!=='verified-chart').map(r=>r.id),
      angleCalibrationEligible:0,realOptimalNoLabels:0,realTwoStageMeasuredPairs:0};
  }
  const rng=seed=>()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  const scenarios=['stable','noisy','drift','outliers','nonlinear','heterogeneous','short'];
  function truth(a,color,t,scenario){
    let unit={LINK:{red:.28,blue:.5},TAB:{red:.065,blue:.18}}[a.type][color];
    let angle=nominalExact(a.blade,a.direction)+rotations[a.type][color],power=1;
    if(scenario==='heterogeneous'){angle+=(a.blade-2)*22+(a.direction==='DOWN'?24:0);unit*=1+.18*(a.blade-1)+(a.direction==='DOWN'?.35:0);}
    else unit*=1+.06*(a.blade-2);
    if(scenario==='drift'){const f=clamp((t-72)/36,0,1);angle+=35*f;unit*=1+.55*f;}
    if(scenario==='nonlinear')power=a.type==='LINK'?.72:1.4;
    if(scenario==='short')unit=.006;
    return vector(unit*a.amount**power,angle);
  }
  function score(p,actual,start){
    if(!p||!Number.isFinite(p.distance))return null;
    const ex=p.dx-actual.dx,ey=p.dy-actual.dy,u={x:actual.dx/actual.distance,y:actual.dy/actual.distance};
    return {angle:actual.distance>=.02?Math.abs(wrap(p.angle-actual.angle)):null,distance:Math.abs(p.distance-actual.distance),
      endpoint:Math.hypot(ex,ey),ips:Math.abs(norm({x:start.x+p.dx,y:start.y+p.dy})-norm({x:start.x+actual.dx,y:start.y+actual.dy})),
      along:Math.abs(ex*u.x+ey*u.y),cross:Math.abs(ex*u.y-ey*u.x)};
  }
  function stats(rows,total){const usable=rows.filter(Boolean);return {total,n:usable.length,coverage:total?usable.length/total:0,
    angleMAE:mean(usable.map(r=>r.angle).filter(v=>v!==null)),distanceMAE:mean(usable.map(r=>r.distance)),endpointMAE:mean(usable.map(r=>r.endpoint)),
    endpointRMSE:usable.length?Math.sqrt(mean(usable.map(r=>r.endpoint**2))):null,endpointP90:quantile(usable.map(r=>r.endpoint),.9),
    ipsMAE:mean(usable.map(r=>r.ips)),alongMAE:mean(usable.map(r=>r.along)),crossMAE:mean(usable.map(r=>r.cross))};}
  function ranking(predict,type,t,scenario){
    const start={red:{x:.22,y:.12},blue:{x:.24,y:-.16}},amount=type==='LINK'?.25:1;
    const candidates=[];
    for(const blade of [1,2,3])for(const direction of ['UP','DOWN']){
      const a={type,blade,direction,amount,amountText:type==='LINK'?'1/4':'1'},ps=['red','blue'].map(color=>{
        const p=predict(a,color,start[color]);if(!p)return null;
        const point={x:start[color].x+p.dx,y:start[color].y+p.dy},cur=norm(start[color]),pd=norm(point),u={x:p.dx/p.distance,y:p.dy/p.distance};
        return {color,start:start[color],position:point,currentDistance:cur,predictedDistance:pd,source:'learned',
          improvement:cur-pd,inwardProjection:-(start[color].x*u.x+start[color].y*u.y)/cur,geometry:BalanceLinkRanking.geometry(start[color],u)};
      });
      // TAB No./direction uses Cruise only; LINK requires both observed colors for a fair six-candidate comparison.
      if(type==='LINK'&&ps.some(p=>!p)||type==='TAB'&&!ps[1])continue;
      candidates.push({...a,predictions:ps.filter(Boolean)});
    }
    if(candidates.length!==6)return null;
    if(type==='LINK')return BalanceLinkRanking.select(candidates,norm(start.red),norm(start.blue));
    return candidates.filter(c=>c.predictions.find(p=>p.color==='blue').improvement>1e-6)
      .sort((a,b)=>{const pa=a.predictions.find(p=>p.color==='blue'),pb=b.predictions.find(p=>p.color==='blue');return Number(pb.predictedDistance<=.15)-Number(pa.predictedDistance<=.15)||pa.predictedDistance-pb.predictedDistance;})[0]??null;
  }
  function evaluate(){
    const rows=[],rankRows=[],twoStage=[],parameterNames=names;
    for(const scenario of scenarios)for(let seed=1;seed<=4;seed++){
      const random=rng(104729*seed+scenarios.indexOf(scenario)),es=Object.fromEntries(Object.entries(factories).map(([n,f])=>[n,engine(f)])),history=[];
      const predict=(n,a,c,start)=>n==='robust'||n==='nonlinear'?robustPredict(history,a,c,start,n==='nonlinear'):es[n].predict(a,c,start);
      for(let t=0;t<120;t++){
        const type=t%2?'TAB':'LINK',slot=Math.floor(t/2)%6,blade=slot%3+1,direction=slot<3?'UP':'DOWN';
        const amountText=type==='LINK'?['1/4','1/2','1'][Math.floor(random()*3)]:['1','2','3'][Math.floor(random()*3)],a={type,blade,direction,amountText,amount:amountText.includes('/')?+amountText.split('/')[0]/+amountText.split('/')[1]:+amountText};
        Object.values(es).forEach(e=>e.prepare(a));
        const before=es.current.sets.at(-1),vectors={};
        const predictions=Object.fromEntries(parameterNames.map(n=>[n,Object.fromEntries(['red','blue'].map(c=>[c,predict(n,a,c,before[c])]))]));
        for(const color of ['red','blue']){
          const clean=truth(a,color,t,scenario),noise=scenario==='noisy'?1:.15;
          let v=vector(clean.distance*Math.exp((random()-.5)*.55*noise),clean.angle+(random()-.5)*30*noise);
          if(scenario==='outliers'&&t%19===7)v=vector(v.distance*5,v.angle+105);
          vectors[color]=v;
          if(t>=72)rows.push({scenario,seed,t,type,color,blade,direction,amount:a.amount,scores:Object.fromEntries(names.map(n=>[n,score(predictions[n][color],v,before[color])]))});
        }
        assert(history.every(r=>r.t<t),'no target/future samples in training');
        Object.values(es).forEach(e=>e.ingest(a,vectors));
        for(const color of ['red','blue'])if(type==='LINK'||color==='blue')history.push({...a,color,...vectors[color],t});
      }
      for(const type of ['LINK','TAB']){
        const oracle=ranking((a,c)=>truth(a,c,120,scenario),type,120,scenario);
        for(const name of names){const selected=ranking((a,c,s)=>predict(name,a,c,s),type,120,scenario);
          rankRows.push({scenario,seed,type,name,available:!!selected,oracle:oracle?{blade:oracle.blade,direction:oracle.direction}:null,
            selected:selected?{blade:selected.blade,direction:selected.direction}:null,
            noMatch:selected&&oracle?selected.blade===oracle.blade:null,directionMatch:selected&&oracle?selected.direction===oracle.direction:null,
            fullMatch:selected&&oracle?selected.blade===oracle.blade&&selected.direction===oracle.direction:null});}
      }
      if(seed===1&&['stable','nonlinear','heterogeneous'].includes(scenario))for(const name of ['current','robust','nonlinear']){
        const cache=new Map(),start={red:{x:.22,y:.12},blue:{x:.24,y:-.16}};
        const step=(points,a)=>{
          const action={...a,amount:a.amountText.includes('/')?+a.amountText.split('/')[0]/+a.amountText.split('/')[1]:+a.amountText},result={};
          for(const c of ['red','blue']){const key=[action.type,action.blade,action.direction,action.amount,c].join('/');
            if(!cache.has(key))cache.set(key,action.type==='TAB'&&c==='red'?vector(.065*action.amount,nominalExact(action.blade,action.direction)+rotations.TAB.red):predict(name,action,c,{x:0,y:0}));
            const p=cache.get(key);if(!p)return null;result[c]={x:points[c].x+p.dx,y:points[c].y+p.dy};}
          return {action,start:points,points:result,crossGap:Infinity};};
        const result=BalanceTwoAdjustment.search({start,amounts:BalanceLearning.amounts,predict:step,center:{x:0,y:0},radius:1});
        if(result.winner){let actual=structuredClone(start);for(const stage of result.winner.stages)for(const c of ['red','blue']){const v=truth(stage.action,c,120,scenario);actual[c].x+=v.dx;actual[c].y+=v.dy;}
          twoStage.push({scenario,name,evaluated:result.evaluated,actions:result.winner.stages.map(s=>s.action),
            errors:Object.fromEntries(['red','blue'].map(c=>[c,Math.hypot(actual[c].x-result.winner.final[c].x,actual[c].y-result.winner.final[c].y)])),
            predictedIPS:result.winner.metrics.ips,realizedSyntheticIPS:Object.fromEntries(['red','blue'].map(c=>[c,norm(actual[c])])),tabHov:'same fixed nominal fallback for every model; not trained by historical UI'});}
      }
    }
    const summary=[];
    for(const scenario of scenarios)for(const name of names){const subset=rows.filter(r=>r.scenario===scenario),paired=subset.filter(r=>r.scores.current&&r.scores[name]);
      summary.push({scenario,name,...stats(subset.map(r=>r.scores[name]),subset.length),paired:{n:paired.length,current:stats(paired.map(r=>r.scores.current),paired.length),candidate:stats(paired.map(r=>r.scores[name]),paired.length)}});}
    const rankSummary=[];
    for(const type of ['LINK','TAB'])for(const name of names){const rs=rankRows.filter(r=>r.type===type&&r.name===name),usable=rs.filter(r=>r.fullMatch!==null);
      rankSummary.push({type,name,total:rs.length,scored:usable.length,noAccuracy:mean(usable.map(r=>Number(r.noMatch))),directionAccuracy:mean(usable.map(r=>Number(r.directionMatch))),jointAccuracy:mean(usable.map(r=>Number(r.fullMatch)))});}
    const nonlinearAcceptance=rows.filter(r=>r.scores.nonlinear&&r.scores.robust&&r.scores.nonlinear.endpoint!==r.scores.robust.endpoint).length;
    return {protocol:{seeds:4,stepsPerSession:120,trainOnlySteps:72,forwardTestSteps:48,selection:'all fixed candidates reported; no empirical adoption or best-on-test tuning',
      prior:'static real priors excluded from synthetic accuracy tests',units:'IPS; degrees',target:'recorded noisy synthetic next observation; all targets retained, including injected outliers',tabHov:'not learnable through existing historical UI, counted as missing, never zero error'},summary,rankSummary,twoStage,rows,rankRows,nonlinearDifferentPredictions:nonlinearAcceptance};
  }
  function mechanisms(){
    const a={type:'LINK',blade:1,direction:'UP',amount:1,amountText:'1'},es=[engine(),engine(exactCopy)];
    for(let t=0;t<8;t++){es.forEach(e=>e.prepare(a));const v={red:vector(.3,nominalExact(1,'UP')+70),blue:vector(.2,nominalExact(1,'UP')-20)};es.forEach(e=>e.ingest(a,v));
      const normalized=e=>JSON.stringify(Object.fromEntries(Object.entries(e.api.inspect().models).map(([k,v])=>{delete v.lastUpdated;return[k,v];})));
      assert(normalized(es[0])===normalized(es[1]),'source snapshot matches actual baseline model');}
    const r=es[0].predict(a,'red',{x:0,y:0});
    assert(r&&r.distance>0,'actual baseline replay ready');
    const baseline=engine(),bulk=engine();
    const cold=[];
    for(let t=0;t<4;t++){baseline.prepare(a);const vs={red:vector(.3,nominalExact(1,'UP')+100),blue:vector(.2,nominalExact(1,'UP')+100)};baseline.ingest(a,vs);cold.push(Math.abs(wrap(baseline.predict(a,'red',{x:0,y:0})?.angle-vs.red.angle))||null);}
    bulk.sets.splice(0,bulk.sets.length,...structuredClone(baseline.sets));
    for(const c of bulk.api.historicalCandidates(bulk.sets))bulk.api.confirmHistorical(bulk.sets,c);bulk.api.sync(bulk.sets,rotations);
    const live=baseline.predict(a,'red',{x:0,y:0}),historical=bulk.predict(a,'red',{x:0,y:0});
    assert(Math.abs(wrap(live.angle-historical.angle))>1,'prospective and bulk history initialization differ on identical measured history');
    const d=.3,actual=.21;
    const residual={angleErrorDegrees:0,predictedMoveIPS:d,actualMoveIPS:actual,predictedEndIPS:0,actualEndIPS:d-actual,
      additionalAmountIfGainStable:(d-actual)/actual,meaning:'synthetic same-angle under-response; single hexagon alignment cannot determine distance gain'};
    const positive=vector(.3,20),reversed=vector(.3,200);
    assert(Math.abs(wrap(positive.angle-reversed.angle))===180,'UP/DOWN diagnostics distinguish reversal from signed distance');
    const empty=engine();assert(!empty.predict(a,'red',{x:0,y:0}),'cold start is missing, never fabricated zero');
    return {identicalHistoryInitialization:{liveAngle:live.angle,bulkHistoricalAngle:historical.angle,differenceDegrees:Math.abs(wrap(live.angle-historical.angle)),liveColdStartErrors:cold,
      reason:'live pending prospective angle seeds baseRotation; bulk historical initialization seeds actual angle; cap 13.5 degrees per update'},alignedHexagonResidual:residual,
      notes:['angular error not learned below 0.02 IPS; existing distance model can still update from short/zero movement','parent/detailed model switch is discrete at 3/2 samples','historicalCandidates exposes LINK red+blue, TAB blue only','angle and distance already separate; learned distance remains proportional to amount','last three weights 60/24/9.6 percent are uncapped EMA intuition, not exact weights for clipped angular/distance updates']};
  }
  try{
    assert(location.protocol==='file:','local file analysis only');
    const inventory=distanceInventory(),mechanism=mechanisms(),synthetic=evaluate();
    const report={version:1,realInventory:inventory,mechanisms:mechanism,synthetic,checks,adoptedChanges:[],productionWrites:0,
      decision:'No production adoption. No real rolling comparison with adequate eligible sample count is possible from the repository alone.'};
    document.getElementById('report').textContent=JSON.stringify(report);
    document.getElementById('results').textContent=`PASS: ${checks} checks; isolated real-distance inventory and synthetic chronological comparison`;
    document.title='PASS';
  }catch(error){document.getElementById('results').textContent=`FAIL after ${checks} checks\n${error.stack}`;document.title='FAIL';}
})();
