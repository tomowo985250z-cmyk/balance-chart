(() => {
  let checks=0;
  const assert=(v,l)=>{if(!v)throw Error(l);checks++;};
  try{
    const data=BalanceActualAdjustmentHistory,storage=new Map(),nominal=(blade,direction)=>{
      const [x,y]=[[-303.1,-175],[0,350],[303.1,-175]][blade-1],s=direction==='UP'?1:-1;return Math.atan2(y*s,x*s)*180/Math.PI;};
    const api=BalanceLearning.create({storage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},coordinates:p=>p,nominalAngle:nominal,radius:1});
    const pointSet=m=>({learningId:`image-r${m.result}`,red:data.point(m.red),blue:data.point(m.blue),adjustments:m.action?[[...m.action]]:[]});
    const sets=[],forecasts=[],eligibility=[];
    const zero={LINK:{red:0,blue:0},TAB:{red:0,blue:0}};
    // Reconstruct only earlier confirmed observations. Unknown original rotations are never used for scoring.
    for(let i=0;i<data.measurements.length;i++){
      const m=data.measurements[i];
      if(i){const before=data.measurements[i-1],action=BalanceLearning.adjustment(before.action);
        for(const s of data.samples.filter(s=>s.beforeResult===before.result)){
          const p=api.predict(action.type,s.color,action.blade,action.direction,action.amount,s.before);
          forecasts.push({beforeResult:s.beforeResult,afterResult:s.afterResult,color:s.color,modelReady:!!p,
            angleError:null,distanceError:null,endpointError:null,reason:p?'Original rotation/predicted vector not available for a calibrated comparison':'Insufficient earlier eligible samples; no numeric error invented'});
        }
      }
      sets.push(pointSet(m));
      if(i)for(const c of api.historicalCandidates(sets).filter(c=>c.afterId===sets.at(-1).learningId)){
        api.confirmHistorical(sets,c);eligibility.push({afterResult:m.result,type:c.action.type,color:c.color});
      }
      api.sync(sets,zero);
    }
    assert(forecasts.length===6&&forecasts.every(p=>!p.modelReady),'same-history strict forward replay has zero eligible learned forecasts');
    assert(api.inspect().samples.length===4,'existing historical UI would train only four of the six observed vectors');
    assert(api.inspect().samples.filter(s=>s.type==='TAB'&&s.color==='red').length===0,'TAB HOV observations not silently enabled in production learning');
    const metric=color=>{
      const rs=data.residuals.filter(r=>r.color===color),sum=rs.reduce((s,r)=>s+r.absoluteRadialResidualIPS,0);
      return {n:rs.length,radialIPSMAE:sum/rs.length,radialIPSRMSE:Math.sqrt(rs.reduce((s,r)=>s+r.signedRadialResidualIPS**2,0)/rs.length),
        signedBiasIPS:rs.reduce((s,r)=>s+r.signedRadialResidualIPS,0)/rs.length,maxAbsoluteResidualIPS:Math.max(...rs.map(r=>r.absoluteRadialResidualIPS))};
    };
    const parent=api.predict('LINK','red',2,'UP',.25,{x:0,y:0});
    assert(!!parent,'blind ingestion would enable the existing three-sample parent even for an unobserved No.2');
    const failure=data.residuals.filter(r=>r.color==='red'&&r.predictedIPS<=.2&&r.actualIPS>.2);
    assert(failure.length===1&&failure[0].afterResult===5,'predicted HOV .19 versus actual .26 recorded');
    const report={sourceId:data.sourceId,causalSequenceConfirmed:true,measurements:data.measurements,
      measuredVectors:data.samples,residuals:data.residuals,radialMetrics:{HOV:metric('red'),Cruise:metric('blue')},
      strictForward:{order:'result1→2→3→4→5→6; score before confirming each next result',forecasts,eligibleForecasts:forecasts.filter(p=>p.modelReady).length,
        staticPriorsExcluded:true,unobservedRotationExcluded:true},
      currentHistoricalEligibility:eligibility,existingEngineSandboxLearnedCount:api.inspect().samples.length,
      blindImportRisk:{parentEnabledForUnobservedNo:!!parent,independentObservationsPerExactCondition:1,
        action:'Do not connect this sparse source corpus to production models.'},
      predictedWithinActualOutside:failure,applicationLearningAdditions:0,savedHistoryWrites:0,
      unresolved:'Cannot reconcile with existing device history without its backup. New observations are registered as immutable source references only.'};
    document.getElementById('report').textContent=JSON.stringify(report);
    document.getElementById('results').textContent=`PASS: ${checks} checks; six measured vectors and seven scalar residuals; production unchanged`;
    document.title='PASS';
  }catch(e){document.getElementById('results').textContent=`FAIL after ${checks} checks\n${e.stack}`;document.title='FAIL';}
})();
