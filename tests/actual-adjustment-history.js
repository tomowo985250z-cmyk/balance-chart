/* Confirmed source observations for isolated analysis. Not loaded by the application. */
const BalanceActualAdjustmentHistory = (() => {
  'use strict';
  const sourceId='user-confirmed-2026-11-12-results-1-6';
  const measurements=[
    {result:1,red:{ips:.70,clock:'1:07'},blue:null,action:['3','LINK','1','DOWN'],predictedIPS:{red:.22,blue:null}},
    {result:2,red:{ips:.23,clock:'1:58'},blue:null,action:['1','LINK','1/3','UP'],predictedIPS:{red:.09,blue:null}},
    {result:3,red:{ips:.03,clock:'10:10'},blue:{ips:.46,clock:'1:00'},action:['1','TAB','2','UP'],predictedIPS:{red:.12,blue:.28}},
    {result:4,red:{ips:.14,clock:'9:05'},blue:{ips:.28,clock:'2:40'},action:['2','TAB','1','DOWN'],predictedIPS:{red:.19,blue:.16}},
    {result:5,red:{ips:.26,clock:'9:23'},blue:null,action:['1','LINK','1/3','DOWN'],predictedIPS:{red:.16,blue:.38}},
    {result:6,red:{ips:.15,clock:'10:00'},blue:{ips:.33,clock:'2:50'},action:null,predictedIPS:null}
  ];
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  const point=dot=>{
    if(!dot||!Number.isFinite(dot.ips)||dot.ips<0||!/^\d{1,2}:\d{2}$/.test(dot.clock))return null;
    const [hour,minute]=dot.clock.split(':').map(Number);if(hour<1||hour>12||minute>59)return null;
    const theta=((hour%12)*30+minute*.5)*Math.PI/180;
    return {x:dot.ips*Math.sin(theta),y:-dot.ips*Math.cos(theta)};
  };
  const samples=measurements.slice(0,-1).flatMap((before,i)=>{
    const after=measurements[i+1],[blade,type,text,direction]=before.action,[n,d='1']=text.split('/'),amount=Number(n)/Number(d);
    return ['red','blue'].flatMap(color=>{
      const start=point(before[color]),end=point(after[color]);if(!start||!end)return[];
      const dx=end.x-start.x,dy=end.y-start.y,distance=Math.hypot(dx,dy);
      return [{key:`${sourceId}/${before.result}-${after.result}/${color}`,sourceId,beforeResult:before.result,afterResult:after.result,
        type,blade:Number(blade),direction,amount,amountText:text,color,before:start,after:end,
        actualVector:{dx,dy,distance,angle:distance>0?Math.atan2(dy,dx)*180/Math.PI:null},
        provenance:{observation:'user image and transcription',sequenceConfirmed:true,singleAdjustmentConfirmed:true,sameMeasurementConditionsConfirmed:true,
          confirmation:'User explicitly confirmed all five transitions in this conversation.',coordinateBasis:'IPS; clock 12 up, clockwise; x right and y down; computed using existing clock conversion',
          hexagonRotationKnown:false,predictedVectorKnown:false},
        historicalUIEligible:type==='LINK'||color==='blue',activation:'not-applied-to-application'}];
    });
  });
  const residuals=measurements.slice(0,-1).flatMap((before,i)=>['red','blue'].flatMap(color=>{
    const predicted=before.predictedIPS[color],actual=measurements[i+1][color]?.ips;
    if(!Number.isFinite(predicted)||!Number.isFinite(actual))return[];
    return [{sourceId,beforeResult:before.result,afterResult:measurements[i+1].result,color,predictedIPS:predicted,actualIPS:actual,
      signedRadialResidualIPS:actual-predicted,absoluteRadialResidualIPS:Math.abs(actual-predicted),
      angleError:null,travelDistanceError:null,endpointVectorError:null}];
  }));
  const rounded=v=>Number(v.toFixed(10));
  function fingerprint(sample,{radius=1,center={x:0,y:0}}={}){
    if(!sample?.before||!sample?.after||!Number.isFinite(radius)||radius<=0)return null;
    const xy=p=>[(p.x-center.x)/radius,(p.y-center.y)/radius].map(rounded);
    if(![sample.before.x,sample.before.y,sample.after.x,sample.after.y].every(Number.isFinite))return null;
    return JSON.stringify([sample.type,sample.color,Number(sample.blade),sample.direction,Number(sample.amount),xy(sample.before),xy(sample.after)]);
  }
  function reconcile(existingSamples=[],existingCoordinates={radius:240,center:{x:397,y:520}}){
    // No writes. A semantic match suppresses re-registration even when learningId/key differs.
    const seen=new Set(existingSamples.map(s=>fingerprint(s,existingCoordinates)).filter(Boolean)),fresh=[],duplicates=[];
    for(const s of samples){const fp=fingerprint(s);if(seen.has(fp))duplicates.push(s);else{fresh.push(s);seen.add(fp);}}
    return {sourceId,fresh,duplicates,total:samples.length,
      observedConditions:Object.fromEntries([...new Set(samples.map(s=>[s.type,s.color,s.blade,s.direction,s.amount].join('/')))]
        .map(key=>[key,samples.filter(s=>[s.type,s.color,s.blade,s.direction,s.amount].join('/')===key).length])),
      activeLearningAdditions:0,existingHistoryReconciled:false,
      decision:'Reference corpus only. Application-history reconciliation and sufficient repeated conditions are required before model activation.'};
  }
  return freeze({sourceId,measurements,samples,residuals,point,fingerprint,reconcile,applicationImportEnabled:false});
})();
